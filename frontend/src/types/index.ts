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

/** The orb's visual/behavioral state. */
export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

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
}

/** Recording lifecycle state for the microphone input. */
export type RecordingState = 'idle' | 'recording' | 'processing' | 'error';
