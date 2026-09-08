import { API_BASE_URL } from './config';
import { ApiError } from './apiError';
import { toBackendMood } from '../mood/moods';
import type { ChatMessage, ConverseResponse, MoodId, TranscribeResponse } from '../types';

/** Send a recorded audio blob to the backend for transcription only. */
export async function transcribeAudio(blob: Blob, signal?: AbortSignal): Promise<string> {
  const form = new FormData();
  form.append('audio', blob, `recording.${extensionFor(blob.type)}`);

  const res = await fetch(`${API_BASE_URL}/api/voice/transcribe`, {
    method: 'POST',
    body: form,
    signal,
  });

  if (!res.ok) {
    throw new ApiError(await safeErrorMessage(res, 'Could not transcribe your recording.'), res.status);
  }

  const data = (await res.json()) as TranscribeResponse;
  return data.text;
}

/**
 * Request TTS audio for a piece of text. Returns an object URL for the audio
 * on success. If the backend responds with a non-audio content type, treats
 * it as "TTS unavailable" and returns null so the caller can fall back to
 * speechSynthesis.
 */
export async function synthesizeSpeech(
  text: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const res = await fetch(`${API_BASE_URL}/api/voice/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal,
  });

  const contentType = res.headers.get('content-type') || '';

  if (!res.ok || !contentType.startsWith('audio/')) {
    // TTS unavailable — not a hard error, caller should fall back gracefully.
    return null;
  }

  const audioBlob = await res.blob();
  return URL.createObjectURL(audioBlob);
}

/**
 * Primary voice-turn flow: send recorded audio + mood + history, receive the
 * transcript, the AI's reply text, and (if available) base64-encoded audio.
 */
export async function converseWithVoice(
  blob: Blob,
  mood: MoodId,
  history: ChatMessage[],
  signal?: AbortSignal,
): Promise<ConverseResponse> {
  const form = new FormData();
  form.append('audio', blob, `recording.${extensionFor(blob.type)}`);
  form.append('mood', toBackendMood(mood));
  form.append('history', JSON.stringify(history));

  const res = await fetch(`${API_BASE_URL}/api/voice/converse`, {
    method: 'POST',
    body: form,
    signal,
  });

  if (!res.ok) {
    throw new ApiError(
      await safeErrorMessage(res, 'The voice conversation could not be completed.'),
      res.status,
    );
  }

  return (await res.json()) as ConverseResponse;
}

/** Decode a base64 audio payload (as returned by /api/voice/converse) into a playable object URL. */
export function base64AudioToObjectUrl(base64: string, mimeType = 'audio/wav'): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  return URL.createObjectURL(blob);
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('wav')) return 'wav';
  return 'webm';
}

async function safeErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = (await res.json()) as { detail?: string; message?: string; error?: string };
      return data.detail || data.message || data.error || fallback;
    }
    const text = await res.text();
    return text || fallback;
  } catch {
    return fallback;
  }
}
