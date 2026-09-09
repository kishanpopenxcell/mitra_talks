/**
 * Renderers for the particle globe. WebGL is the real one; the Canvas 2D
 * fallback draws far fewer points with a cheap noise so the globe still
 * exists on machines without WebGL.
 */
import { FRAG, VERT } from './shaders';
import type { GlobeParams } from './params';

export type RGB = [number, number, number];

export interface GlobeRenderer {
  /** Set the canvas to `cssSize` CSS pixels square (device pixels handled inside). */
  resize(cssSize: number): void;
  draw(p: GlobeParams, time: number, tint: RGB, base: RGB, yaw: number): void;
  destroy(): void;
}

export interface RendererOptions {
  coreCount: number;
  shellCount: number;
  /** Multiplies point size; small canvases need relatively bigger points. */
  sizeScale: number;
}

function fibonacciSphere(
  count: number,
  kind: number,
  pos: Float32Array,
  seeds: Float32Array,
  kinds: Float32Array,
  offset: number,
): void {
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = count > 1 ? 1 - (i / (count - 1)) * 2 : 0;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i + kind * 1.7;
    const j = offset + i;
    pos[j * 3] = Math.cos(theta) * rad;
    pos[j * 3 + 1] = y;
    pos[j * 3 + 2] = Math.sin(theta) * rad;
    seeds[j] = Math.random();
    kinds[j] = kind;
  }
}

const UNIFORMS = [
  'uTime', 'uRadius', 'uTurb', 'uFreq', 'uSpeed', 'uYaw', 'uTilt', 'uPulse', 'uSwirl', 'uScatter', 'uWobble',
  'uSparkle', 'uSize', 'uGravity', 'uRipple', 'uShell', 'uTint', 'uBase', 'uTintAmt', 'uDesat', 'uBright',
] as const;

export function createWebGLRenderer(canvas: HTMLCanvasElement, opts: RendererOptions): GlobeRenderer | null {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: false });
  if (!gl || gl.isContextLost()) return null;

  const compile = (type: number, src: string): WebGLShader => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('shader alloc failed');
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) ?? 'shader compile failed');
    }
    return shader;
  };

  let program: WebGLProgram;
  try {
    program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? 'program link failed');
    }
  } catch {
    return null;
  }
  gl.useProgram(program);

  const total = opts.coreCount + opts.shellCount;
  const pos = new Float32Array(total * 3);
  const seeds = new Float32Array(total);
  const kinds = new Float32Array(total);
  fibonacciSphere(opts.coreCount, 0, pos, seeds, kinds, 0);
  fibonacciSphere(opts.shellCount, 1, pos, seeds, kinds, opts.coreCount);

  const buffers: WebGLBuffer[] = [];
  const attr = (name: string, data: Float32Array, size: number) => {
    const buf = gl.createBuffer();
    if (!buf) return;
    buffers.push(buf);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  };
  attr('aPos', pos, 3);
  attr('aSeed', seeds, 1);
  attr('aKind', kinds, 1);

  const U: Record<string, WebGLUniformLocation | null> = {};
  for (const name of UNIFORMS) U[name] = gl.getUniformLocation(program, name);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.clearColor(0, 0, 0, 0);

  let px = 0;

  return {
    resize(cssSize) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const next = Math.max(1, Math.round(cssSize * dpr));
      if (next === px) return;
      px = next;
      canvas.width = px;
      canvas.height = px;
      gl.viewport(0, 0, px, px);
    },
    draw(p, time, tint, base, yaw) {
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(U.uTime, time);
      gl.uniform1f(U.uRadius, p.radius);
      gl.uniform1f(U.uTurb, p.turb);
      gl.uniform1f(U.uFreq, p.freq);
      gl.uniform1f(U.uSpeed, p.speed);
      gl.uniform1f(U.uYaw, yaw);
      gl.uniform1f(U.uTilt, p.tilt);
      gl.uniform1f(U.uPulse, p.pulse);
      gl.uniform1f(U.uSwirl, p.swirl);
      gl.uniform1f(U.uScatter, p.scatter);
      gl.uniform1f(U.uWobble, p.wobble);
      gl.uniform1f(U.uSparkle, p.sparkle);
      gl.uniform1f(U.uGravity, p.gravity);
      gl.uniform1f(U.uRipple, p.ripple);
      gl.uniform1f(U.uShell, p.shell);
      gl.uniform1f(U.uSize, (px / 700) * 2.3 * opts.sizeScale);
      gl.uniform3f(U.uTint, tint[0], tint[1], tint[2]);
      gl.uniform3f(U.uBase, base[0], base[1], base[2]);
      gl.uniform1f(U.uTintAmt, p.tintAmt);
      gl.uniform1f(U.uDesat, p.desat);
      gl.uniform1f(U.uBright, p.bright);
      gl.drawArrays(gl.POINTS, 0, total);
    },
    destroy() {
      // Free GPU resources but keep the context alive: React (StrictMode, HMR)
      // can remount on the same canvas, and a canvas whose context was
      // deliberately lost hands that dead context back on the next getContext.
      // The context itself is reclaimed when the canvas element is collected.
      for (const b of buffers) gl.deleteBuffer(b);
      gl.deleteProgram(program);
    },
  };
}

/** Lightweight Canvas 2D fallback: a few hundred points, sine-based wobble, same colour rules. */
export function createCanvas2DRenderer(canvas: HTMLCanvasElement, opts: RendererOptions): GlobeRenderer | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const count = Math.min(opts.coreCount, 1400);
  const pos = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const kinds = new Float32Array(count);
  fibonacciSphere(count, 0, pos, seeds, kinds, 0);

  let px = 0;
  const toCss = (c: RGB) => `${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)}`;

  return {
    resize(cssSize) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const next = Math.max(1, Math.round(cssSize * dpr));
      if (next === px) return;
      px = next;
      canvas.width = px;
      canvas.height = px;
    },
    draw(p, time, tint, base, yaw) {
      ctx.clearRect(0, 0, px, px);
      ctx.globalCompositeOperation = 'lighter';
      const half = px / 2;
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const cx = Math.cos(p.tilt), sx = Math.sin(p.tilt);
      const dot = Math.max(0.8, (px / 700) * 2.2 * opts.sizeScale);
      const tintCss = toCss(tint);
      const baseCss = toCss(base);
      for (let i = 0; i < count; i++) {
        let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        const n = Math.sin(x * p.freq * 2 + time * p.speed) * Math.cos(y * p.freq * 2 - time * p.speed * 0.7) * 0.5;
        const r = p.radius * (1 + p.turb * n + p.pulse * 0.6);
        x *= r; y *= r; z *= r;
        y -= p.gravity;
        // rotY then rotX
        const x1 = x * cy + z * sy;
        const z1 = -x * sy + z * cy;
        const y2 = y * cx - z1 * sx;
        const z2 = y * sx + z1 * cx;
        const persp = 1 / (2.7 - z2);
        const sxp = half + x1 * persp * 2.1 * half;
        const syp = half - y2 * persp * 2.1 * half;
        const depth = Math.min(1, Math.max(0, (z2 + 1.25) / 2.2));
        const core = 1 - depth;
        const a = (0.12 + 0.88 * depth) * 0.8 * p.bright;
        const mixT = p.tintAmt * (0.2 + 0.8 * core);
        ctx.fillStyle = mixT > 0.5 ? `rgba(${tintCss},${a})` : `rgba(${baseCss},${a})`;
        ctx.beginPath();
        ctx.arc(sxp, syp, dot * persp * 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    },
    destroy() {
      ctx.clearRect(0, 0, px, px);
    },
  };
}

export function createRenderer(canvas: HTMLCanvasElement, opts: RendererOptions): GlobeRenderer | null {
  return createWebGLRenderer(canvas, opts) ?? createCanvas2DRenderer(canvas, opts);
}
