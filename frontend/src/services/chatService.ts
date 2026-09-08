import { API_BASE_URL } from './config';
import { ApiError } from './apiError';
import { toBackendMood } from '../mood/moods';
import type { ChatMessage, MoodId } from '../types';

/** Extracts a human-readable message from a JSON error body, falling back to the raw text. */
function extractErrorDetail(rawText: string, fallback: string): string {
  if (!rawText) return fallback;
  try {
    const parsed = JSON.parse(rawText);
    if (typeof parsed?.detail === 'string') return parsed.detail;
  } catch {
    /* not JSON, fall through to raw text */
  }
  return rawText;
}

/**
 * Extracts the text delta from a `message` event's JSON payload
 * (`{"delta": "..."}`). Returns `null` (never the raw payload) if the data
 * isn't valid JSON with a string `delta` field, so a malformed/corrupted
 * chunk is dropped instead of ever being shown to the user as garbled text.
 */
function extractChunkDelta(rawData: string): string | null {
  try {
    const parsed: unknown = JSON.parse(rawData);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'delta' in parsed &&
      typeof (parsed as { delta: unknown }).delta === 'string'
    ) {
      return (parsed as { delta: string }).delta;
    }
  } catch {
    /* not JSON -- fall through to null below */
  }
  return null;
}

export interface ChatStreamCallbacks {
  /** Called for every incremental text chunk as it arrives. */
  onChunk: (textDelta: string) => void;
  /** Called once the stream has completed successfully. */
  onDone: () => void;
  /** Called if the stream reports an error event or the request fails. */
  onError: (message: string) => void;
}

/**
 * Minimal, defensive Server-Sent-Events parser for a fetch ReadableStream.
 * Handles the standard "event: <name>\ndata: <payload>\n\n" framing as well as
 * bare "data: <payload>\n\n" chunks (default event = "message").
 */
function parseSSEBlock(block: string): { event: string; data: string } {
  let event = 'message';
  const dataLines: string[] = [];
  for (const rawLine of block.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      // Preserve a single leading space per the SSE spec convention.
      dataLines.push(line.slice('data:'.length).replace(/^ /, ''));
    }
  }
  return { event, data: dataLines.join('\n') };
}

/**
 * Stream a mood-aware chat response from the backend using fetch + ReadableStream
 * (native EventSource cannot send a POST body, so we hand-roll SSE parsing here).
 */
export async function streamChatResponse(
  mood: MoodId,
  messages: ChatMessage[],
  callbacks: ChatStreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mood: toBackendMood(mood), messages }),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    callbacks.onError('Could not reach the server. Please check your connection and try again.');
    return;
  }

  if (!res.ok || !res.body) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    callbacks.onError(
      extractErrorDetail(detail, `The AI companion could not respond right now (${res.status}). Please try again.`),
    );
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let finished = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      // Append raw decoded text first, THEN normalize CRLF -> LF on the whole
      // buffer. Normalizing a partial chunk before concatenation is unsafe: a
      // "\r\n" pair emitted by the server (e.g. sse-starlette) can straddle
      // two separate stream reads, leaving a bare "\r" at the end of one
      // chunk that never gets collapsed and ends up embedded inside the next
      // event's JSON payload, corrupting it.
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');

      // SSE events are separated by a blank line ("\n\n").
      let sepIndex: number;
      while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);
        if (!block.trim()) continue;

        const { event, data } = parseSSEBlock(block);
        if (event === 'done') {
          finished = true;
          callbacks.onDone();
        } else if (event === 'error') {
          finished = true;
          callbacks.onError(extractErrorDetail(data, 'The AI companion ran into a problem. Please try again.'));
        } else if (data.length > 0) {
          const delta = extractChunkDelta(data);
          if (delta !== null) {
            callbacks.onChunk(delta);
          } else {
            console.warn('Dropped malformed SSE chunk (not valid delta JSON):', data);
          }
        }
      }
      if (finished) break;
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    if (!finished) {
      callbacks.onError('The connection was interrupted. Please try again.');
    }
    return;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }

  if (!finished) {
    // Stream closed without an explicit "done" event — treat as success if we
    // received content, since some servers omit the final sentinel.
    callbacks.onDone();
  }
}

/** Thrown for any non-streaming chat helper failures (kept for API symmetry). */
export class ChatServiceError extends ApiError {}
