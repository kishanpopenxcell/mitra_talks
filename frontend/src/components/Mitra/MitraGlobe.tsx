import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { MitraState, MoodId, ReactionEvent } from '../../types';
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
  type GlobeReaction,
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

/** Pointer movement (px) before a press counts as a drag rather than a tap. */
const DRAG_THRESHOLD_PX = 4;
/** Radians of yaw per CSS pixel dragged. */
const DRAG_YAW_PER_PX = 0.011;
const DRAG_PITCH_PER_PX = 0.006;
const MAX_PITCH = 0.55;

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
  /**
   * Let people play with it: tap to poke, drag to spin and tilt (with inertia).
   * Also exposes it as a button to keyboards and screen readers.
   */
  interactive?: boolean;
  /** Called on a tap (not a drag), after the poke animation is triggered. */
  onTap?: () => void;
  className?: string;
  /** Accessible name. Pass '' to hide the globe from assistive tech (decorative duplicate). */
  label?: string;
}

interface Yaw {
  current: number;
  target: number;
  velocity: number;
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
  interactive = false,
  onTap,
  className,
  label,
}: MitraGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GlobeRenderer | null>(null);
  const [ready, setReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const meta = getMoodMeta(mood);

  const moodRef = useRef(mood);
  moodRef.current = mood;
  const stateRef = useRef(state);
  stateRef.current = state;
  const ampRef = useRef<number | undefined>(amplitude);
  ampRef.current = amplitude;
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  const reactionRef = useRef<{ kind: GlobeReaction; start: number } | null>(null);
  const yawRef = useRef<Yaw>({ current: 0, target: 0, velocity: 0 });
  const pitchRef = useRef({ current: 0, target: 0 });
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

  const poke = useCallback(() => {
    reactionRef.current = { kind: 'poke', start: performance.now() };
    // a small nudge of spin so the tap visibly moves it
    yawRef.current.velocity += 1.6;
  }, []);

  // Renderer lifetime is tied to the point budget, which follows size.
  const budget = useMemo(() => {
    if (size < 64) return { coreCount: 1400, shellCount: 300, sizeScale: 2.6 };
    if (size < 200) return { coreCount: 9000, shellCount: 2000, sizeScale: 1.4 };
    return { coreCount: 24000, shellCount: 5500, sizeScale: 1 };
  }, [size]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setReady(false);
    const renderer = createRenderer(canvas, budget);
    rendererRef.current = renderer;
    if (!renderer) return;

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const current: GlobeParams = { ...DEFAULTS };
    const tint: RGB = hexToRgb(getMoodMeta(moodRef.current).colors.primary);
    const base: RGB = hexToRgb(STATE_COLORS[stateRef.current]);
    let ampSmooth = 0;
    let raf = 0;
    let frames = 0;
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
      let reactionArg: { kind: GlobeReaction; progress: number } | null = null;
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

      // Heading: the selection spin eases toward its target; drag inertia moves
      // both so the two never fight; a barely-there sway keeps it from looking frozen.
      const yaw = yawRef.current;
      yaw.current += (yaw.target - yaw.current) * (1 - Math.exp(-3.4 * dt));
      const drift = yaw.velocity * dt;
      yaw.current += drift;
      yaw.target += drift;
      yaw.velocity *= Math.exp(-2.6 * dt);
      const pitch = pitchRef.current;
      pitch.current += (pitch.target - pitch.current) * (1 - Math.exp(-8 * dt));

      const time = (now - start) / 1000;
      const sway = reduceMotion ? 0 : Math.sin(time * 0.35) * 0.04;
      const drawParams = pitch.current !== 0 ? { ...current, tilt: current.tilt + pitch.current } : current;

      renderer.draw(drawParams, time, tint, base, yaw.current + sway);
      // Reveal only once real pixels exist -- avoids the blank canvas flash on load.
      if (frames === 1) setReady(true);
      frames++;
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

  /* ---------------- pointer interaction ---------------- */

  const gesture = useRef<{
    id: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    lastT: number;
    moved: boolean;
  } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (!interactive || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      lastT: performance.now(),
      moved: false,
    };
    // stop any ongoing inertia so the globe answers the hand immediately
    yawRef.current.velocity = 0;
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLSpanElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.lastX;
    const dy = e.clientY - g.lastY;
    if (!g.moved && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > DRAG_THRESHOLD_PX) {
      g.moved = true;
      setDragging(true);
    }
    if (!g.moved) return;
    const yaw = yawRef.current;
    const dYaw = dx * DRAG_YAW_PER_PX;
    yaw.current += dYaw;
    yaw.target += dYaw;
    const now = performance.now();
    const dt = Math.max(0.004, (now - g.lastT) / 1000);
    yaw.velocity = dYaw / dt;
    const pitch = pitchRef.current;
    pitch.target = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch.target + dy * DRAG_PITCH_PER_PX));
    g.lastX = e.clientX;
    g.lastY = e.clientY;
    g.lastT = now;
  };

  const endGesture = (e: ReactPointerEvent<HTMLSpanElement>, cancelled: boolean) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (g.moved) {
      // let the tilt settle back so the globe returns to its resting pose
      pitchRef.current.target = 0;
      // keep the fling but cap it to something graceful
      yawRef.current.velocity = Math.max(-6, Math.min(6, yawRef.current.velocity));
      return;
    }
    if (cancelled) return;
    poke();
    onTapRef.current?.();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (!interactive) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      poke();
      onTapRef.current?.();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const dir = e.key === 'ArrowLeft' ? -1 : 1;
      yawRef.current.velocity += dir * 2.2;
    }
  };

  const style = useMemo(() => ({ '--size': `${size}px` }) as CSSProperties, [size]);
  const hidden = label === '';
  const name = label ?? `Mitra, ${meta.label}, ${STATE_LABEL[state]}`;

  return (
    <span
      className={className ? `mitra ${className}` : 'mitra'}
      data-state={state}
      data-ready={ready || undefined}
      data-interactive={interactive || undefined}
      data-dragging={dragging || undefined}
      style={style}
      role={hidden ? undefined : interactive ? 'button' : 'img'}
      tabIndex={interactive && !hidden ? 0 : undefined}
      aria-hidden={hidden || undefined}
      aria-label={hidden ? undefined : interactive ? `${name}. Press to poke, drag or use arrow keys to spin.` : name}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endGesture(e, false)}
      onPointerCancel={(e) => endGesture(e, true)}
      onKeyDown={onKeyDown}
    >
      <canvas ref={canvasRef} />
    </span>
  );
}
