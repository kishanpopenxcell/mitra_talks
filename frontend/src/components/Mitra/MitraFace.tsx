import { useCallback, useEffect, useId, useMemo, useRef, type CSSProperties } from 'react';
import type { MitraState, MoodId, ReactionEvent } from '../../types';
import { getMoodMeta } from '../../mood/moods';
import { PARAM_KEYS, resolveTarget, speedFor, type FaceParams } from './expressions';
import './mitra.css';

const INK = '#161221';
const SCLERA = '#f3eff9';
const TONGUE = '#e8748f';
const HEART = '#f0598a';
const WATER = '#bfe3ff';

const REACTION_HOLD_MS = 1500;

const STATE_LABEL: Record<MitraState, string> = {
  idle: 'idle',
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'speaking',
  error: 'something went wrong',
};

export interface MitraFaceProps {
  mood: MoodId;
  state?: MitraState;
  /**
   * Live 0-1 audio level. While speaking this drives the mouth. Leave undefined
   * when no level is available (browser speech fallback) and a natural speech
   * rhythm is synthesised instead.
   */
  amplitude?: number;
  /** A one-shot reaction; fires whenever the event object changes. */
  reaction?: ReactionEvent | null;
  /** Rendered size in px. Below 48px the face simplifies to eyes only. */
  size?: number;
  /** Let the pupils drift toward the cursor. */
  gazeFollow?: boolean;
  className?: string;
  /** Accessible name. Pass an empty string to hide a purely decorative face from screen readers. */
  label?: string;
}

/**
 * Mitra's face. The SVG is built once; the animation loop below interpolates
 * the rig toward its target every frame and paints the geometry imperatively,
 * so nothing re-renders through React at 60fps.
 */
export function MitraFace({
  mood,
  state = 'idle',
  amplitude,
  reaction = null,
  size = 160,
  gazeFollow = false,
  className,
  label,
}: MitraFaceProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const mini = size < 48;
  const meta = getMoodMeta(mood);

  const targetRef = useRef<FaceParams>(resolveTarget(mood, state, null, mini));
  const currentRef = useRef<FaceParams>({ ...targetRef.current });
  const stateRef = useRef(state);
  stateRef.current = state;
  const ampRef = useRef<number | undefined>(amplitude);
  ampRef.current = amplitude;
  const gazeFollowRef = useRef(gazeFollow);
  gazeFollowRef.current = gazeFollow;
  const activeReactionRef = useRef<ReactionEvent['kind'] | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });

  const retarget = useCallback(() => {
    targetRef.current = resolveTarget(mood, state, activeReactionRef.current, mini);
  }, [mood, state, mini]);

  useEffect(retarget, [retarget]);

  useEffect(() => {
    if (!reaction) return;
    activeReactionRef.current = reaction.kind;
    retarget();
    const timer = window.setTimeout(() => {
      activeReactionRef.current = null;
      retarget();
    }, REACTION_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [reaction, retarget]);

  useEffect(() => {
    if (!gazeFollow) return;
    const onMove = (e: PointerEvent) => {
      const el = rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2);
      const dy = (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2);
      pointerRef.current = { x: clamp(dx, -1, 1), y: clamp(dy, -1, 1) };
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [gazeFollow]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const parts = collectParts(svg);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    let raf = 0;
    let last = performance.now();
    const blink = { next: last + rand(1800, 5000), start: -1, dur: 150, double: false };
    const glance = { next: last + rand(2000, 5000), tx: 0, ty: 0, x: 0, y: 0 };
    let ampSmooth = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const cur = currentRef.current;
      const tgt = targetRef.current;

      for (const k of PARAM_KEYS) {
        const s = reduce ? 60 : speedFor(k);
        cur[k] += (tgt[k] - cur[k]) * (1 - Math.exp(-s * dt));
      }

      // Blink: random interval, occasional double blink.
      let blinkV = 0;
      if (blink.start < 0 && now >= blink.next) {
        blink.start = now;
        blink.double = Math.random() < 0.2;
      }
      if (blink.start >= 0) {
        const t = (now - blink.start) / blink.dur;
        if (t >= 1) {
          if (blink.double) {
            blink.double = false;
            blink.start = now + 90;
          } else {
            blink.start = -1;
            blink.next = now + rand(2800, 7000);
          }
        } else if (t >= 0) {
          blinkV = Math.sin(Math.PI * t);
        }
      }

      // Micro-glances: small wandering gaze offsets that return home.
      if (!reduce) {
        if (now >= glance.next) {
          const home = Math.random() < 0.5;
          glance.tx = home ? 0 : rand(-3, 3);
          glance.ty = home ? 0 : rand(-2, 2);
          glance.next = now + rand(1800, 4800);
        }
        const g = 1 - Math.exp(-6 * dt);
        glance.x += (glance.tx - glance.x) * g;
        glance.y += (glance.ty - glance.y) * g;
      }

      const st = stateRef.current;
      let px = 0;
      let py = 0;
      if (gazeFollowRef.current && st !== 'thinking' && !reduce) {
        px = pointerRef.current.x * 6;
        py = pointerRef.current.y * 4;
      }

      // Mouth level: real audio if we have it, otherwise a speech-like rhythm.
      const ampIn = ampRef.current;
      let ampNorm = 0;
      if (st === 'speaking') {
        if (ampIn === undefined) {
          const t = now / 1000;
          ampNorm = clamp(0.55 + 0.45 * Math.sin(t * 13) * (0.6 + 0.4 * Math.sin(t * 3.1)), 0, 1);
        } else {
          ampNorm = clamp(ampIn * 4, 0, 1);
        }
      }
      ampSmooth += (ampNorm - ampSmooth) * (1 - Math.exp(-(ampIn === undefined ? 10 : 18) * dt));
      const openLive = st === 'speaking' ? cur.open * (0.2 + 0.8 * ampSmooth) : cur.open;

      paint(parts, cur, { blink: blinkV, gx: glance.x + px, gy: glance.y + py, open: openLive, mini });
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mini]);

  const style = useMemo(
    () =>
      ({
        '--size': `${size}px`,
        '--p': meta.colors.primary,
        '--s2': meta.colors.secondary,
        '--glow': meta.colors.glow,
      }) as CSSProperties,
    [size, meta],
  );

  return (
    <span
      ref={rootRef}
      className={className ? `mitra ${className}` : 'mitra'}
      data-state={state}
      data-mini={mini || undefined}
      style={style}
      role={label === '' ? undefined : 'img'}
      aria-hidden={label === '' || undefined}
      aria-label={label === '' ? undefined : label ?? `Mitra, ${meta.label}, ${STATE_LABEL[state]}`}
    >
      <span className="mitra-aura" />
      <span className="mitra-glow" />
      <svg ref={svgRef} viewBox="0 0 200 200" aria-hidden="true">
        <defs>
          <mask id={`${id}-l`}>
            <ellipse data-part="msc-l" fill="#fff" />
            <rect data-part="mtop-l" fill="#000" />
            <rect data-part="mbot-l" fill="#000" />
          </mask>
          <mask id={`${id}-r`}>
            <ellipse data-part="msc-r" fill="#fff" />
            <rect data-part="mtop-r" fill="#000" />
            <rect data-part="mbot-r" fill="#000" />
          </mask>
          <clipPath id={`${id}-m`}>
            <path data-part="mclip" />
          </clipPath>
        </defs>
        <g className="mitra-fg">
          <path data-part="brow-l" fill="none" stroke={INK} strokeLinecap="round" />
          <path data-part="brow-r" fill="none" stroke={INK} strokeLinecap="round" />

          <g data-part="eye-l" mask={`url(#${id}-l)`}>
            <ellipse data-part="sc-l" fill={SCLERA} />
            <circle data-part="pu-l" fill={INK} />
            <circle data-part="hl-l" fill="#fff" opacity="0.9" />
            <path data-part="he-l" fill={HEART} />
          </g>
          <path data-part="cl-l" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
          <path data-part="lt-l" fill="none" stroke={INK} strokeWidth="3.2" strokeLinecap="round" />
          <path data-part="lb-l" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          <ellipse data-part="ch-l" rx="13" ry="6" />

          <g data-part="eye-r" mask={`url(#${id}-r)`}>
            <ellipse data-part="sc-r" fill={SCLERA} />
            <circle data-part="pu-r" fill={INK} />
            <circle data-part="hl-r" fill="#fff" opacity="0.9" />
            <path data-part="he-r" fill={HEART} />
          </g>
          <path data-part="cl-r" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
          <path data-part="lt-r" fill="none" stroke={INK} strokeWidth="3.2" strokeLinecap="round" />
          <path data-part="lb-r" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          <ellipse data-part="ch-r" rx="13" ry="6" />

          <g data-part="mouth-g">
            <path data-part="mouth" strokeLinecap="round" strokeLinejoin="round" />
            <rect data-part="teeth" fill={SCLERA} clipPath={`url(#${id}-m)`} />
            <path data-part="gaps" fill="none" stroke={INK} strokeWidth="1.4" opacity="0.35" clipPath={`url(#${id}-m)`} />
            <ellipse data-part="tongue" fill={TONGUE} clipPath={`url(#${id}-m)`} />
          </g>

          <path
            data-part="tear"
            fill={WATER}
            opacity="0.95"
            d="M82,124 C87,132 87,138 82,138 C77,138 77,132 82,124 Z"
          />
          <path
            data-part="sweat"
            fill={WATER}
            opacity="0.95"
            d="M158,34 C164,44 164,51 158,51 C152,51 152,44 158,34 Z"
          />
        </g>
      </svg>
      <span className="mitra-rings">
        <span />
        <span />
        <span />
      </span>
      <span className="mitra-dots">
        <span />
        <span />
        <span />
      </span>
      <span className="mitra-halo" />
    </span>
  );
}

/* ------------------------------------------------------------------------ */
/* geometry                                                                  */
/* ------------------------------------------------------------------------ */

type Parts = Record<string, SVGElement>;

function collectParts(svg: SVGSVGElement): Parts {
  const parts: Parts = {};
  svg.querySelectorAll<SVGElement>('[data-part]').forEach((el) => {
    parts[el.dataset.part as string] = el;
  });
  return parts;
}

interface Live {
  blink: number;
  gx: number;
  gy: number;
  open: number;
  mini: boolean;
}

function set(el: SVGElement | undefined, attrs: Record<string, string | number>): void {
  if (!el) return;
  for (const k in attrs) el.setAttribute(k, String(attrs[k]));
}

function show(el: SVGElement | undefined, visible: boolean): void {
  if (!el) return;
  if (visible) el.removeAttribute('display');
  else el.setAttribute('display', 'none');
}

const f = (n: number) => n.toFixed(2);

function paint(parts: Parts, p: FaceParams, live: Live): void {
  paintEye(parts, p, live, -1);
  paintEye(parts, p, live, 1);

  const mouthVisible = !live.mini;
  show(parts['mouth-g'], mouthVisible);
  show(parts['tear'], mouthVisible && p.tear > 0.5);
  show(parts['sweat'], mouthVisible && p.sweat > 0.5);
  if (mouthVisible) paintMouth(parts, p, live.open);
}

function paintEye(parts: Parts, p: FaceParams, live: Live, side: -1 | 1): void {
  const s = side < 0 ? 'l' : 'r';
  const cx = 100 + side * p.ex;
  const cy = p.ey;
  const sc = side < 0 ? p.eyeScaleL : p.eyeScaleR;
  const rx = p.rx * sc;
  const ry = p.ry * sc;

  // brow
  const raise = side < 0 ? p.browRaiseL : p.browRaiseR;
  const bAngle = side < 0 ? p.browAngleL : p.browAngleR;
  const yb = cy - ry - 15 - raise;
  const t = Math.tan((bAngle * Math.PI) / 180);
  const xi = cx - side * 14;
  const xo = cx + side * 22;
  const yi = yb + t * 16;
  const yo = yb - t * 16;
  const ctrlY = (yi + yo) / 2 - p.browArch * 12;
  set(parts[`brow-${s}`], {
    d: `M${f(xi)},${f(yi)} Q${f((xi + xo) / 2)},${f(ctrlY)} ${f(xo)},${f(yo)}`,
    'stroke-width': f(p.browW),
  });

  // lids (blink closes whatever is still open)
  const lidTopBase = side < 0 ? p.lidTopL : p.lidTopR;
  const lidTop = lidTopBase + (1 - lidTopBase) * live.blink;
  const lidBot = side < 0 ? p.lidBotL : p.lidBotR;
  const angle = p.lidAngle * (side < 0 ? 1 : -1);
  const topEdge = cy - ry + lidTop * 2 * ry;
  const botEdge = cy + ry - lidBot * 2 * ry;
  const closed = lidTop >= 0.95;

  show(parts[`eye-${s}`], !closed);
  show(parts[`cl-${s}`], closed);
  if (closed) {
    set(parts[`cl-${s}`], { d: `M${f(cx - rx)},${f(cy - 2)} Q${f(cx)},${f(cy + 10)} ${f(cx + rx)},${f(cy - 2)}` });
  } else {
    set(parts[`msc-${s}`], { cx: f(cx), cy: f(cy), rx: f(rx), ry: f(ry) });
    set(parts[`sc-${s}`], { cx: f(cx), cy: f(cy), rx: f(rx), ry: f(ry) });
    set(parts[`mtop-${s}`], {
      x: f(cx - rx * 2.2),
      y: f(topEdge - ry * 3),
      width: f(rx * 4.4),
      height: f(ry * 3),
      transform: `rotate(${f(angle)} ${f(cx)} ${f(topEdge)})`,
    });
    set(parts[`mbot-${s}`], { x: f(cx - rx * 2.2), y: f(botEdge), width: f(rx * 4.4), height: f(ry * 3) });
    show(parts[`mbot-${s}`], lidBot > 0.001);

    const px = cx + p.gx + live.gx;
    const py = cy + p.gy + live.gy;
    const hearts = p.hearts > 0.5;
    show(parts[`pu-${s}`], !hearts);
    show(parts[`hl-${s}`], !hearts);
    show(parts[`he-${s}`], hearts);
    if (hearts) {
      const h = p.pr * 1.15;
      set(parts[`he-${s}`], {
        d:
          `M${f(px)},${f(py + h * 0.9)} C${f(px - h * 1.6)},${f(py - h * 0.2)} ${f(px - h * 0.9)},${f(py - h * 1.3)} ${f(px)},${f(py - h * 0.5)} ` +
          `C${f(px + h * 0.9)},${f(py - h * 1.3)} ${f(px + h * 1.6)},${f(py - h * 0.2)} ${f(px)},${f(py + h * 0.9)} Z`,
      });
    } else {
      set(parts[`pu-${s}`], { cx: f(px), cy: f(py), r: f(p.pr) });
      set(parts[`hl-${s}`], { cx: f(px - p.pr * 0.32), cy: f(py - p.pr * 0.34), r: f(p.pr * 0.28) });
    }
  }

  // lid lines
  const showTop = !closed && lidTop >= 0.1;
  show(parts[`lt-${s}`], showTop);
  if (showTop) {
    set(parts[`lt-${s}`], {
      d: `M${f(cx - rx * 1.06)},${f(topEdge)} L${f(cx + rx * 1.06)},${f(topEdge)}`,
      transform: `rotate(${f(angle)} ${f(cx)} ${f(topEdge)})`,
    });
  }
  const showBot = !closed && lidBot >= 0.15;
  show(parts[`lb-${s}`], showBot);
  if (showBot) {
    set(parts[`lb-${s}`], {
      d: `M${f(cx - rx * 0.95)},${f(botEdge + 2)} Q${f(cx)},${f(botEdge - 5)} ${f(cx + rx * 0.95)},${f(botEdge + 2)}`,
    });
  }

  // cheek
  const cheekOn = !live.mini && p.cheek > 0.05;
  show(parts[`ch-${s}`], cheekOn);
  if (cheekOn) {
    set(parts[`ch-${s}`], {
      cx: f(cx + side * 6),
      cy: f(cy + ry + 9),
      fill: p.cheek > 1.2 ? '#ffd6e0' : '#fff',
      opacity: f(Math.min(0.45, p.cheek * 0.22)),
    });
  }
}

function paintMouth(parts: Parts, p: FaceParams, open: number): void {
  const w = p.mouthW;
  const my = p.mouthY;
  const c = p.curve;
  const dx = p.mouthDx;
  const lx = 100 - w / 2 + dx;
  const rx = 100 + w / 2 + dx;
  const ly = my - c + p.cornerL;
  const ry = my - c + p.cornerR;
  const mouth = parts['mouth'];

  const wavy = p.wavy > 0.5;
  const isOpen = !wavy && open > 0.02;

  show(parts['teeth'], false);
  show(parts['gaps'], false);
  show(parts['tongue'], false);

  if (wavy) {
    const seg = w / 3;
    const a = 5;
    let d = `M${f(lx)},${f(my)}`;
    for (let i = 0; i < 3; i++) d += ` c${f(seg / 3)},${-a} ${f((2 * seg) / 3)},${a} ${f(seg)},0`;
    set(mouth, { d, fill: 'none', stroke: INK, 'stroke-width': 5 });
    return;
  }

  if (!isOpen) {
    const d = `M${f(lx)},${f(ly)} C${f(lx + w * 0.3)},${f(my + c * 1.1)} ${f(rx - w * 0.3)},${f(my + c * 1.1)} ${f(rx)},${f(ry)}`;
    set(mouth, { d, fill: 'none', stroke: INK, 'stroke-width': 5.5 });
    return;
  }

  const depth = open * 36 + Math.max(c, 0) * 1.1;
  const topY = Math.min(ly, ry);
  const d =
    `M${f(lx)},${f(ly)} C${f(lx + w * 0.3)},${f(my + c * 0.45)} ${f(rx - w * 0.3)},${f(my + c * 0.45)} ${f(rx)},${f(ry)} ` +
    `C${f(rx - w * 0.22)},${f(ly + depth)} ${f(lx + w * 0.22)},${f(ly + depth)} ${f(lx)},${f(ly)} Z`;
  set(mouth, { d, fill: INK, stroke: 'none', 'stroke-width': 0 });
  set(parts['mclip'], { d });

  if (p.teeth > 0.05) {
    const th = depth * 0.42 * p.teeth;
    show(parts['teeth'], true);
    set(parts['teeth'], { x: f(lx), y: f(topY - 4), width: f(w), height: f(th + 4) });
    show(parts['gaps'], true);
    const gapX = [100 + dx - w * 0.18, 100 + dx, 100 + dx + w * 0.18];
    set(parts['gaps'], { d: gapX.map((gx) => `M${f(gx)},${f(topY - 2)} L${f(gx)},${f(topY + th)}`).join(' ') });
  }
  if (p.tongue > 0.5) {
    show(parts['tongue'], true);
    set(parts['tongue'], { cx: f(100 + dx), cy: f(ly + depth * 0.98), rx: f(w * 0.27), ry: f(depth * 0.4) });
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function rand(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}
