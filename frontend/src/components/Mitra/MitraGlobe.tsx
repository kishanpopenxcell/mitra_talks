import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import type { MitraState, MoodId, Reaction, ReactionEvent } from '../../types';
import { getMoodMeta } from '../../mood/moods';
import {
  DEFAULTS,
  PARAM_KEYS,
  REACTION_DURATION_MS,
  STATE_COLORS,
  easeRate,
  hexToRgb,
  resolveParams,
  type GlobeParams,
} from './globe/params';
import { createRenderer, type GlobeRenderer, type RGB } from './globe/renderer';
import './mitra.css';

const STATE_LABEL: Record<MitraState, string> = {
  idle: 'idle',
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'speaking',
  error: 'something went wrong',
};

export interface MitraGlobeProps {
  mood: MoodId;
  state?: MitraState;
  /**
   * Live 0-1 audio level. While speaking this drives the pulse; while listening
   * it drives the ripple. Leave undefined when no level is available (browser
   * speech fallback) and a speech-like rhythm is synthesised instead.
   */
  amplitude?: number;
  /** A one-shot reaction; fires whenever the event object changes. */
  reaction?: ReactionEvent | null;
  /** Rendered size in CSS px (square). */
  size?: number;
  /**
   * Increment to make the globe spin exactly once. The globe never rotates on
   * its own; the app bumps this when a mood is selected.
   */
  spinKey?: number;
  className?: string;
  /** Accessible name. Pass '' to hide the globe from assistive tech (decorative duplicate). */
  label?: string;
}

/**
 * Mitra as a reactive particle globe. Points live on the GPU; this component
 * only eases a handful of parameters toward their targets each frame and
 * hands them to the renderer, so React never re-renders at 60fps.
 */
export function MitraGlobe({
  mood,
  state = 'idle',
  amplitude,
  reaction = null,
  size = 160,
  spinKey = 0,
  className,
  label,
}: MitraGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GlobeRenderer | null>(null);
  const meta = getMoodMeta(mood);

  const moodRef = useRef(mood);
  moodRef.current = mood;
  const stateRef = useRef(state);
  stateRef.current = state;
  const ampRef = useRef<number | undefined>(amplitude);
  ampRef.current = amplitude;

  const reactionRef = useRef<{ kind: Reaction; start: number } | null>(null);
  const yawRef = useRef({ current: 0, target: 0 });
  const lastSpinKey = useRef(spinKey);

  // Fire a reaction envelope whenever a new event arrives.
  useEffect(() => {
    if (!reaction) return;
    reactionRef.current = { kind: reaction.kind, start: performance.now() };
  }, [reaction]);

  // One full turn per spinKey increment. The initial value never spins.
  useEffect(() => {
    if (spinKey !== lastSpinKey.current) {
      lastSpinKey.current = spinKey;
      yawRef.current.target += Math.PI * 2;
    }
  }, [spinKey]);

  // Renderer lifetime is tied to the point budget, which follows size.
  const budget = useMemo(() => {
    if (size < 64) return { coreCount: 1400, shellCount: 300, sizeScale: 2.6 };
    if (size < 200) return { coreCount: 9000, shellCount: 2000, sizeScale: 1.4 };
    return { coreCount: 24000, shellCount: 5500, sizeScale: 1 };
  }, [size]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = createRenderer(canvas, budget);
    rendererRef.current = renderer;
    if (!renderer) return;

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const current: GlobeParams = { ...DEFAULTS };
    const tint: RGB = hexToRgb(getMoodMeta(moodRef.current).colors.primary);
    const base: RGB = hexToRgb(STATE_COLORS[stateRef.current]);
    let ampSmooth = 0;
    let raf = 0;
    const start = performance.now();
    let last = start;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = stateRef.current;

      // audio level: real if provided, otherwise a speech-like rhythm while speaking
      const ampIn = ampRef.current;
      let ampNorm = 0;
      if (ampIn !== undefined) {
        ampNorm = Math.min(1, ampIn * 4);
      } else if (st === 'speaking') {
        const t = now / 1000;
        const phrase = Math.max(0, Math.sin(t * 1.1)) > 0.15 ? 1 : 0.1;
        ampNorm = Math.min(1, phrase * (0.14 + 0.12 * Math.sin(t * 12) * Math.sin(t * 3.7) + 0.06 * Math.sin(t * 27)) * 4);
      }
      ampSmooth += (ampNorm - ampSmooth) * (1 - Math.exp(-14 * dt));

      // reaction envelope
      let reactionArg: { kind: Reaction; progress: number } | null = null;
      const r = reactionRef.current;
      if (r) {
        const progress = (now - r.start) / REACTION_DURATION_MS;
        if (progress >= 1) reactionRef.current = null;
        else reactionArg = { kind: r.kind, progress };
      }

      const target = resolveParams(moodRef.current, st, ampSmooth, reactionArg, reduceMotion);
      for (const k of PARAM_KEYS) {
        current[k] += (target[k] - current[k]) * (1 - Math.exp(-easeRate(k) * dt));
      }

      const tintTarget = hexToRgb(getMoodMeta(moodRef.current).colors.primary);
      const baseTarget = hexToRgb(STATE_COLORS[st]);
      for (let i = 0; i < 3; i++) {
        tint[i] += (tintTarget[i] - tint[i]) * (1 - Math.exp(-4 * dt));
        base[i] += (baseTarget[i] - base[i]) * (1 - Math.exp(-3 * dt));
      }

      // one-time spin eases out; a barely-there sway keeps a still globe from looking frozen
      const yaw = yawRef.current;
      yaw.current += (yaw.target - yaw.current) * (1 - Math.exp(-3.4 * dt));
      const time = (now - start) / 1000;
      const sway = reduceMotion ? 0 : Math.sin(time * 0.35) * 0.04;

      renderer.draw(current, time, tint, base, yaw.current + sway);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [budget]);

  useEffect(() => {
    rendererRef.current?.resize(size);
  }, [size, budget]);

  const style = useMemo(() => ({ '--size': `${size}px` }) as CSSProperties, [size]);
  const hidden = label === '';

  return (
    <span
      className={className ? `mitra ${className}` : 'mitra'}
      data-state={state}
      style={style}
      role={hidden ? undefined : 'img'}
      aria-hidden={hidden || undefined}
      aria-label={hidden ? undefined : label ?? `Mitra, ${meta.label}, ${STATE_LABEL[state]}`}
    >
      <canvas ref={canvasRef} />
    </span>
  );
}
