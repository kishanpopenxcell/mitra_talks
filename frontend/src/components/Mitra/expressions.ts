/**
 * Mitra's facial rig, as data.
 *
 * Every channel is a number so the animation loop can interpolate between any
 * two faces. Layers combine in this order:
 *
 *   mood BASELINE  ->  state OVERLAY  ->  optional REACTION  ->  live signals
 *
 * The live signals (blink, micro-glances, cursor follow, audio-driven mouth)
 * are applied in MitraFace's animation loop on top of the resolved target.
 */
import type { MitraState, MoodId, Reaction } from '../../types';

export interface FaceParams {
  // eyes
  ex: number; // half distance between eye centres
  ey: number; // eye centre y
  rx: number;
  ry: number;
  eyeScaleL: number;
  eyeScaleR: number;
  pr: number; // pupil radius
  gx: number; // gaze offset
  gy: number;
  hearts: number; // 0|1

  // lids (0 = open, 1 = closed)
  lidTopL: number;
  lidTopR: number;
  lidAngle: number; // > 0 lowers the INNER corner (fired-up); < 0 lowers the outer (sad)
  lidBotL: number;
  lidBotR: number;

  // brows
  browRaiseL: number;
  browRaiseR: number;
  browAngleL: number; // > 0 inner end lower (angry); < 0 inner end higher (worried)
  browAngleR: number;
  browArch: number;
  browW: number;

  // mouth
  mouthW: number;
  mouthY: number;
  mouthDx: number;
  curve: number; // > 0 smile, < 0 frown
  open: number; // 0..1
  cornerL: number; // per-corner y offset (negative = lifted)
  cornerR: number;
  teeth: number; // 0..1
  tongue: number; // 0|1
  wavy: number; // 0|1

  // cheeks + extras
  cheek: number; // 0..1.5 (>1.2 tints to blush)
  tear: number; // 0|1
  sweat: number; // 0|1
}

export type ParamKey = keyof FaceParams;

export const BASE: FaceParams = {
  ex: 30, ey: 92, rx: 24, ry: 28, eyeScaleL: 1, eyeScaleR: 1, pr: 9, gx: 0, gy: 0, hearts: 0,
  lidTopL: 0, lidTopR: 0, lidAngle: 0, lidBotL: 0, lidBotR: 0,
  browRaiseL: 0, browRaiseR: 0, browAngleL: 0, browAngleR: 0, browArch: 0.5, browW: 5.2,
  mouthW: 44, mouthY: 150, mouthDx: 0, curve: 6, open: 0, cornerL: 0, cornerR: 0, teeth: 0, tongue: 0, wavy: 0,
  cheek: 0, tear: 0, sweat: 0,
};

export const PARAM_KEYS = Object.keys(BASE) as ParamKey[];

/** Symmetric shorthands so mood tables stay readable. */
type Sym = Partial<FaceParams> & {
  lidTop?: number;
  lidBot?: number;
  browRaise?: number;
  browAngle?: number;
  eyeScale?: number;
  corner?: number;
};

function expand(s: Sym): Partial<FaceParams> {
  const { lidTop, lidBot, browRaise, browAngle, eyeScale, corner, ...rest } = s;
  const out: Partial<FaceParams> = { ...rest };
  if (lidTop !== undefined) { out.lidTopL = lidTop; out.lidTopR = lidTop; }
  if (lidBot !== undefined) { out.lidBotL = lidBot; out.lidBotR = lidBot; }
  if (browRaise !== undefined) { out.browRaiseL = browRaise; out.browRaiseR = browRaise; }
  if (browAngle !== undefined) { out.browAngleL = browAngle; out.browAngleR = browAngle; }
  if (eyeScale !== undefined) { out.eyeScaleL = eyeScale; out.eyeScaleR = eyeScale; }
  if (corner !== undefined) { out.cornerL = corner; out.cornerR = corner; }
  // explicit per-side values win over the symmetric shorthand
  for (const k of ['lidTopL', 'lidTopR', 'lidBotL', 'lidBotR', 'browRaiseL', 'browRaiseR', 'browAngleL', 'browAngleR', 'eyeScaleL', 'eyeScaleR', 'cornerL', 'cornerR'] as const) {
    if (rest[k] !== undefined) out[k] = rest[k];
  }
  return out;
}

/** Mood baselines. Mirror-lite: reflect the mood's energy, stay warm and on the user's side. */
const MOOD_EXPRESSIONS: Record<MoodId, Partial<FaceParams>> = {
  neutral: expand({}),
  happy: expand({ browRaise: 4, browArch: 0.7, lidBot: 0.3, curve: 16, mouthW: 62, open: 0.35, teeth: 0.8, cheek: 1, pr: 9.5 }),
  sad: expand({ browAngle: -14, browRaise: 2, browArch: 0.3, lidTop: 0.34, lidAngle: -12, gx: -2, gy: 5, curve: -8, mouthW: 36 }),
  angry: expand({ browAngle: 16, browRaise: -6, browArch: 0.2, browW: 6, lidTop: 0.3, lidAngle: 12, pr: 8, curve: 2, mouthW: 42, cornerR: -2 }),
  stressed: expand({ browRaiseL: 8, browRaiseR: 13, browAngle: -4, browArch: 0.6, lidTopL: 0.04, lidTopR: 0.14, pr: 7.5, eyeScaleR: 1.06, wavy: 1, mouthW: 44, sweat: 1 }),
  anxious: expand({ browRaise: 6, browAngle: -10, browArch: 0.4, rx: 25, ry: 31, pr: 7, gx: -3, gy: 1, mouthW: 24, open: 0.2, curve: -3 }),
  excited: expand({ browRaise: 9, browArch: 0.8, rx: 26, ry: 32, pr: 11, lidBot: 0.1, curve: 14, open: 0.8, mouthW: 64, teeth: 0.6, tongue: 1, cheek: 1 }),
  lonely: expand({ browAngle: -6, browRaise: -1, browArch: 0.3, lidTop: 0.24, lidAngle: -5, gx: -7, gy: 8, curve: -3, mouthW: 30 }),
};

/** One-shot reactions, applied over the mood baseline for ~1.5s. */
const REACTION_EXPRESSIONS: Record<Reaction, Partial<FaceParams>> = {
  surprised: expand({ browRaise: 14, browArch: 0.8, browAngle: 0, rx: 26, ry: 33, pr: 7, lidTop: 0, lidBot: 0, open: 0.5, mouthW: 22, curve: 0, teeth: 0, tongue: 0, wavy: 0, corner: 0 }),
  confused: expand({ browRaiseL: 10, browRaiseR: -3, browAngleR: 10, browAngleL: -4, lidTopR: 0.25, lidTopL: 0, gx: 6, gy: -4, mouthDx: -8, mouthW: 26, curve: 3, cornerL: 3, cornerR: -3, open: 0, teeth: 0, tongue: 0, wavy: 0 }),
  wink: expand({ lidTopL: 1, browRaiseL: 6, browRaiseR: 2, curve: 12, mouthW: 56, open: 0.3, teeth: 0.7, cornerR: -4, cheek: 1, wavy: 0, tongue: 0 }),
  delighted: expand({ hearts: 1, browRaise: 8, browArch: 0.8, browAngle: 0, lidTop: 0, lidBot: 0.15, curve: 14, open: 0.55, mouthW: 60, teeth: 0.5, tongue: 1, cheek: 1, wavy: 0 }),
  sheepish: expand({ browAngle: -8, browRaise: 3, lidTop: 0.1, lidBot: 0.35, gx: -8, gy: 4, curve: 8, mouthW: 40, cornerR: -2, open: 0, teeth: 0, tongue: 0, cheek: 1.4, wavy: 0 }),
};

function applyState(p: FaceParams, state: MitraState): void {
  switch (state) {
    case 'listening':
      p.browRaiseL += 3;
      p.browRaiseR += 3;
      p.ry += 2;
      p.pr += 1;
      p.gy += 2;
      p.gx = 0;
      break;
    case 'thinking':
      p.browRaiseR += 9;
      p.browRaiseL -= 2;
      p.lidTopL = Math.min(0.9, p.lidTopL + 0.18);
      p.gx = 8;
      p.gy = -9;
      p.mouthDx = 9;
      p.mouthW *= 0.65;
      p.curve = 2;
      p.open = 0;
      p.cornerR = -3;
      p.wavy = 0;
      p.teeth = 0;
      p.tongue = 0;
      break;
    case 'speaking':
      p.browRaiseL += 2;
      p.browRaiseR += 2;
      p.open = Math.max(p.open, 0.5);
      if (p.curve >= 0) p.teeth = Math.max(p.teeth, 0.5);
      p.wavy = 0;
      break;
    case 'error':
      Object.assign(p, expand({
        browAngle: -6, browRaise: 0, browArch: 0.3, lidTop: 0.4, lidBot: 0.3, lidAngle: 0, pr: 7,
        gx: 0, gy: 0, curve: 0, open: 0, mouthW: 34, wavy: 0, tongue: 0, teeth: 0, cheek: 0, sweat: 0, eyeScale: 1, corner: 0, mouthDx: 0,
      }));
      break;
    case 'idle':
    default:
      break;
  }
}

/** Resolve the target face for a mood + state (+ reaction). `mini` = eyes-only avatar. */
export function resolveTarget(
  mood: MoodId,
  state: MitraState,
  reaction: Reaction | null,
  mini: boolean,
): FaceParams {
  const p: FaceParams = { ...BASE, ...MOOD_EXPRESSIONS[mood] };
  applyState(p, state);
  if (reaction) Object.assign(p, REACTION_EXPRESSIONS[reaction]);
  if (mini) {
    p.ex = 32;
    p.ey = 104;
    p.rx = 30;
    p.ry = 34;
    p.pr = 12;
    p.gy *= 1.4;
    p.cheek = 0;
    p.sweat = 0;
    p.tear = 0;
  }
  return p;
}

/**
 * Interpolation speed per channel. Brows lead, eyes follow, mouth settles last —
 * the stagger is what makes a change read as a decision rather than a snap.
 */
export function speedFor(key: ParamKey): number {
  if (key.startsWith('brow')) return 14;
  if (key.startsWith('lid') || key === 'gx' || key === 'gy' || key === 'pr' || key.startsWith('eye') || key === 'rx' || key === 'ry') return 11;
  if (key === 'mouthW' || key === 'curve' || key === 'open' || key.startsWith('corner') || key === 'teeth' || key === 'mouthDx') return 8;
  return 10;
}
