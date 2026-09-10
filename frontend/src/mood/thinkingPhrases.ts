import type { MoodId } from '../types';

/**
 * Short things Mitra may say while a reply is taking a while. Spoken only on
 * slow turns, never two turns running, never the same line twice in a row --
 * see useThinkingFiller. Grouped so the pick leans toward the mood's energy.
 */
const NEUTRAL = [
  'Hmm, let me think.',
  'Okay, give me a second.',
  'Let me think about that.',
  'Mm, one moment.',
  'Alright, let me think.',
  'Hmm, one sec.',
];

const WARM = [
  'Mm. Let me sit with that a second.',
  'Okay. Give me a moment with that.',
  'Hmm, let me take that in.',
  'Yeah. Let me sit with that.',
  'Mm, okay. One moment.',
  'Okay. Let me think about that for a second.',
];

const BRIGHT = [
  'Ooh, okay, hold on.',
  'Ha, let me think.',
  'Okay okay, give me a sec.',
  'Ooh, one second.',
  'Haha, okay, let me think.',
  'Okay, wait, let me think.',
];

const GROUP_FOR_MOOD: Record<MoodId, string[]> = {
  neutral: NEUTRAL,
  happy: BRIGHT,
  excited: BRIGHT,
  sad: WARM,
  lonely: WARM,
  anxious: WARM,
  stressed: WARM,
  // Fired-up but on the user's side: keep it neutral rather than chirpy.
  angry: NEUTRAL,
};

/** Every phrase a mood might use -- the mood's group plus the neutral set. */
export function thinkingPhrasesFor(mood: MoodId): string[] {
  const group = GROUP_FOR_MOOD[mood];
  return group === NEUTRAL ? [...NEUTRAL] : [...group, ...NEUTRAL];
}

/**
 * Pick a phrase for this mood, favouring the mood's own group (2:1) and never
 * repeating the previous line. `available` restricts the pick to phrases
 * whose audio is actually ready.
 */
export function pickThinkingPhrase(
  mood: MoodId,
  lastPhrase: string | null,
  available: (phrase: string) => boolean,
): string | null {
  const group = GROUP_FOR_MOOD[mood];
  const preferGroup = group !== NEUTRAL && Math.random() < 0.67;
  const pool = (preferGroup ? group : NEUTRAL).filter((p) => p !== lastPhrase && available(p));
  const fallback = thinkingPhrasesFor(mood).filter((p) => p !== lastPhrase && available(p));
  const candidates = pool.length > 0 ? pool : fallback;
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
