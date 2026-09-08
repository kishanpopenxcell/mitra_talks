import type { MoodId } from '../types';

/**
 * Fixed, hand-written one-line greetings spoken by Mitra when Voice Mode
 * starts, before any LLM call. Deliberately not LLM-generated: this keeps
 * Voice Mode's opening instant (no round-trip latency before the user can
 * start talking) and avoids spending a token call on a greeting.
 */
const VOICE_MODE_GREETINGS: Record<MoodId, string> = {
  happy: "Hey! I'm Mitra. I love that energy — what's got you feeling good?",
  sad: "Hi, I'm Mitra. I'm here with you. What's on your mind?",
  angry: "Hey, I'm Mitra. Go ahead and let it out — I'm listening.",
  stressed: "Hi, I'm Mitra. Take a breath. What's weighing on you?",
  anxious: "Hey, I'm Mitra, and I'm right here. What's going on?",
  excited: "Hi! Mitra here — I can feel the excitement. Tell me everything!",
  lonely: "Hey, I'm Mitra. I'm glad you're here. What would you like to talk about?",
  neutral: "Hi, I'm Mitra. What's on your mind today?",
};

export function getVoiceModeGreeting(mood: MoodId): string {
  return VOICE_MODE_GREETINGS[mood];
}
