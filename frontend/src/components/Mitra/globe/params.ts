/**
 * The globe's behaviour, as data.
 *
 *   mood  -> temperament (turbulence, speed, size, brightness) + core tint
 *   state -> behaviour (ripple, twist, pulse, scatter) + particle colour
 *   reaction -> a ~1.3 s envelope layered over both
 *
 * Every field is a number so the render loop can ease between any two sets.
 * The globe never rotates on its own; it spins exactly once when a mood is
 * selected (see MitraGlobe's `spinKey`).
 */
import type { MitraState, MoodId, Reaction } from '../../../types';

export interface GlobeParams {
  radius: number;
  turb: number;
  freq: number;
  speed: number;
  tilt: number;
  pulse: number;
  swirl: number;
  scatter: number;
  wobble: number;
  sparkle: number;
  bright: number;
  gravity: number;
  ripple: number;
  tintAmt: number;
  desat: number;
  shell: number;
}

export type ParamKey = keyof GlobeParams;

export const DEFAULTS: GlobeParams = {
  radius: 1, turb: 0.06, freq: 1.8, speed: 0.25, tilt: 0.35,
  pulse: 0, swirl: 0, scatter: 0, wobble: 0, sparkle: 0, bright: 1,
  gravity: 0, ripple: 0, tintAmt: 0.34, desat: 0, shell: 1,
};

export const PARAM_KEYS = Object.keys(DEFAULTS) as ParamKey[];

/** Which channels should react quickly (audio-driven) vs. settle slowly. */
export function easeRate(key: ParamKey): number {
  return key === 'pulse' || key === 'ripple' || key === 'bright' ? 18 : 6;
}

const MOOD_PARAMS: Record<MoodId, Partial<GlobeParams>> = {
  neutral: {},
  happy: { turb: 0.08, speed: 0.35, bright: 1.06, freq: 1.6 },
  sad: { turb: 0.035, speed: 0.14, radius: 0.95, gravity: 0.05, bright: 0.82, tintAmt: 0.42 },
  angry: { turb: 0.13, speed: 0.95, freq: 3.4, bright: 1.05, shell: 1.4 },
  stressed: { turb: 0.12, speed: 0.7, freq: 2.7, shell: 1.3 },
  anxious: { turb: 0.055, speed: 1.4, freq: 4.2, radius: 0.94, shell: 0.8 },
  excited: { turb: 0.12, speed: 0.55, freq: 1.4, bright: 1.15, sparkle: 0.25, shell: 1.2 },
  lonely: { turb: 0.03, speed: 0.11, radius: 0.9, bright: 0.72, tintAmt: 0.26, shell: 0.6 },
};

/** Particle colour per state. The mood only ever tints the core. */
export const STATE_COLORS: Record<MitraState, string> = {
  idle: '#e9e7f0', // silver
  listening: '#7fe3d9', // aqua: attentive, cool
  thinking: '#b39cff', // violet: inward, considering
  speaking: '#ffd27a', // warm gold: voice
  error: '#d98c8c', // dusty rose: something is off, calmly
};

type StateFn = (p: GlobeParams, amp: number) => void;

const STATE_FNS: Record<MitraState, StateFn> = {
  idle: () => undefined,
  listening: (p, amp) => {
    p.turb *= 0.7;
    p.ripple = 0.5 + amp * 1.5;
    p.radius *= 1 + amp * 0.12;
    p.bright *= 1 + amp * 0.35;
    p.tintAmt *= 0.8;
    p.speed *= 1.2;
  },
  thinking: (p) => {
    p.swirl = 1;
    p.turb *= 1.6;
    p.tintAmt = Math.min(1, p.tintAmt * 1.3);
    p.speed *= 1.3;
  },
  speaking: (p, amp) => {
    p.pulse = amp * 0.22;
    p.turb += amp * 0.09;
    p.bright *= 1 + amp * 0.5;
    p.speed *= 1.4;
    p.sparkle += amp * 0.4;
  },
  error: (p) => {
    p.desat = 0.45;
    p.turb *= 0.3;
    p.speed *= 0.4;
    p.scatter = 0.4;
    p.bright *= 0.65;
    p.sparkle = 0;
    p.shell *= 0.5;
  },
};

type ReactionFn = (p: GlobeParams, e: number) => void;

const REACTION_FNS: Record<Reaction, ReactionFn> = {
  surprised: (p, e) => {
    p.radius *= 1 + 0.32 * e;
    p.bright *= 1 + 0.6 * e;
    p.turb *= 1 - 0.6 * e;
    p.shell *= 1 + 1.5 * e;
  },
  confused: (p, e) => {
    p.wobble = e;
    p.swirl += 0.6 * e;
  },
  delighted: (p, e) => {
    p.sparkle += 1.2 * e;
    p.radius *= 1 + 0.1 * e;
    p.bright *= 1 + 0.35 * e;
    p.tintAmt = Math.min(1, p.tintAmt + 0.35 * e);
  },
  sheepish: (p, e) => {
    p.radius *= 1 - 0.14 * e;
    p.bright *= 1 - 0.3 * e;
    p.gravity += 0.06 * e;
    p.turb *= 1 - 0.4 * e;
  },
};

export const REACTION_DURATION_MS = 1300;

export function resolveParams(
  mood: MoodId,
  state: MitraState,
  amp: number,
  reaction: { kind: Reaction; progress: number } | null,
  reduceMotion: boolean,
): GlobeParams {
  const p: GlobeParams = { ...DEFAULTS, ...MOOD_PARAMS[mood] };
  STATE_FNS[state](p, amp);
  if (reaction) REACTION_FNS[reaction.kind](p, Math.sin(Math.PI * reaction.progress));
  if (reduceMotion) {
    p.speed *= 0.3;
    p.wobble = 0;
  }
  return p;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
