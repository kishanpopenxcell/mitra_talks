/**
 * Shared TypeScript types for the Mood-Based AI Voice Companion frontend.
 */

/** The eight supported mood identifiers. Must match backend mood keys exactly. */
export type MoodId =
  | 'happy'
  | 'sad'
  | 'angry'
  | 'stressed'
  | 'anxious'
  | 'excited'
  | 'lonely'
  | 'neutral';

/** A single role in a chat conversation, matching the backend chat contract. */
export type ChatRole = 'user' | 'assistant';

/** A single chat message as exchanged with the backend. */
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** A message as rendered in the UI, with extra client-side bookkeeping. */
export interface UIMessage extends ChatMessage {
  id: string;
  /** True while an assistant message is still streaming in. */
  streaming?: boolean;
  /** True if this message failed to send/complete and can be retried. */
  failed?: boolean;
  createdAt: number;
}

/** Mitra's behavioural state. Drives the face rig's state overlay and head motion. */
export type MitraState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

/**
 * A short one-shot facial reaction, chosen by the model for each reply and
 * layered over the current mood + state for about a second and a half.
 */
export type Reaction = 'surprised' | 'confused' | 'delighted' | 'sheepish';

export const REACTIONS: readonly Reaction[] = ['surprised', 'confused', 'delighted', 'sheepish'];

export function isReaction(value: unknown): value is Reaction {
  return typeof value === 'string' && (REACTIONS as readonly string[]).includes(value);
}

/** A reaction plus the moment it fired, so the same reaction can fire twice in a row. */
export interface ReactionEvent {
  kind: Reaction;
  at: number;
}

/** Response shape of GET /health */
export interface HealthResponse {
  status: string;
  hf_configured: boolean;
  tts_configured: boolean;
}

/** Request body for POST /api/chat/stream */
export interface ChatStreamRequest {
  mood: MoodId;
  messages: ChatMessage[];
}

/** Response body for POST /api/voice/transcribe */
export interface TranscribeResponse {
  text: string;
}

/** Request body for POST /api/voice/speak */
export interface SpeakRequest {
  text: string;
}

/** Response body for POST /api/voice/converse */
export interface ConverseResponse {
  transcript: string;
  reply_text: string;
  audio_base64: string | null;
  tts_available: boolean;
  reaction: Reaction | null;
  /**
   * False when the recording was silent, unintelligible or not English. The
   * turn never reached the model; `reply_text`/audio carry a polite request
   * to say it again and nothing should be added to the history.
   */
  understood: boolean;
}

/** Recording lifecycle state for the microphone input. */
export type RecordingState = 'idle' | 'recording' | 'processing' | 'error';
