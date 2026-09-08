import type { CSSProperties } from 'react';
import type { MoodId } from '../types';

/**
 * Frontend-side mood presentation metadata: display name, blurb, and the
 * colour trio that tints the whole scene (backdrop, accents, Mitra's glow).
 *
 * This is purely presentational. The backend owns the actual personality/system
 * prompt logic for each mood — this module never encodes behavioral instructions.
 */
export interface MoodMeta {
  id: MoodId;
  label: string;
  /** Short one-line description shown on the mood picker. */
  blurb: string;
  colors: {
    /** Primary accent colour (glow core, buttons, highlights). */
    primary: string;
    /** Secondary colour for gradients. */
    secondary: string;
    /** Soft translucent glow, used for ambient light. */
    glow: string;
  };
}

export const MOODS: MoodMeta[] = [
  {
    id: 'happy',
    label: 'Happy',
    blurb: 'Feeling good and want to share it',
    colors: { primary: '#f6c453', secondary: '#f7924a', glow: 'rgba(246, 196, 83, 0.5)' },
  },
  {
    id: 'sad',
    label: 'Sad',
    blurb: 'A little low, could use gentle company',
    colors: { primary: '#6f9ceb', secondary: '#5577c9', glow: 'rgba(111, 156, 235, 0.5)' },
  },
  {
    id: 'angry',
    label: 'Angry',
    blurb: 'Frustrated and need to let it out',
    colors: { primary: '#e0665c', secondary: '#c94f4f', glow: 'rgba(224, 102, 92, 0.5)' },
  },
  {
    id: 'stressed',
    label: 'Stressed',
    blurb: 'Overwhelmed and need to unwind',
    colors: { primary: '#c98bd8', secondary: '#9a6fd0', glow: 'rgba(201, 139, 216, 0.5)' },
  },
  {
    id: 'anxious',
    label: 'Anxious',
    blurb: 'On edge and need steadying',
    colors: { primary: '#5fc7c0', secondary: '#3fa79f', glow: 'rgba(95, 199, 192, 0.5)' },
  },
  {
    id: 'excited',
    label: 'Excited',
    blurb: 'Buzzing with energy',
    colors: { primary: '#f0598a', secondary: '#e2408a', glow: 'rgba(240, 89, 138, 0.55)' },
  },
  {
    id: 'lonely',
    label: 'Lonely',
    blurb: 'Wanting some company',
    colors: { primary: '#8a8fd6', secondary: '#6a6fc2', glow: 'rgba(138, 143, 214, 0.45)' },
  },
  {
    id: 'neutral',
    label: 'Neutral',
    blurb: 'Just here, open to a chat',
    colors: { primary: '#7fd0a0', secondary: '#5fb98a', glow: 'rgba(127, 208, 160, 0.45)' },
  },
];

const MOOD_MAP: Record<MoodId, MoodMeta> = MOODS.reduce(
  (acc, m) => {
    acc[m.id] = m;
    return acc;
  },
  {} as Record<MoodId, MoodMeta>,
);

export function getMoodMeta(id: MoodId): MoodMeta {
  return MOOD_MAP[id];
}

/**
 * CSS custom properties that theme a subtree for a mood. Applied at the app
 * root so the backdrop, buttons and bubbles all follow the selected mood, and
 * animated between moods via `@property` transitions in index.css.
 */
export function moodStyle(meta: MoodMeta): CSSProperties {
  return {
    '--mood-p': meta.colors.primary,
    '--mood-s2': meta.colors.secondary,
    '--mood-glow': meta.colors.glow,
  } as CSSProperties;
}

/**
 * The backend's mood enum uses capitalized labels (e.g. "Happy"), while the
 * frontend uses lowercase ids internally for CSS/state keys. This is the one
 * place that bridges the two so call sites never hardcode the mapping.
 */
export function toBackendMood(id: MoodId): string {
  return MOOD_MAP[id].label;
}
