import { useCallback, useRef, useState } from 'react';
import { streamChatResponse } from '../services/chatService';
import type { ChatMessage, MoodId, ReactionEvent, UIMessage } from '../types';

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `msg-${Date.now()}-${idCounter}`;
}

export type ChatPhase = 'idle' | 'sending' | 'streaming' | 'done' | 'error';

interface UseChatStreamResult {
  messages: UIMessage[];
  phase: ChatPhase;
  errorMessage: string | null;
  /** The most recent facial reaction the model chose for its reply, if any. */
  reaction: ReactionEvent | null;
  /** Send a new user message and stream the assistant's reply. */
  sendMessage: (text: string, mood: MoodId) => Promise<void>;
  /** Cancel an in-flight streaming response. */
  cancelStreaming: () => void;
  /** Push a fully-formed pair (e.g. from a voice turn) without streaming. */
  appendCompletedTurn: (userText: string, assistantText: string) => void;
}

const MAX_HISTORY_MESSAGES = 20;

export function useChatStream(): UseChatStreamResult {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [phase, setPhase] = useState<ChatPhase>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reaction, setReaction] = useState<ReactionEvent | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancelStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase((p) => (p === 'streaming' || p === 'sending' ? 'idle' : p));
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
    );
  }, []);

  const sendMessage = useCallback(async (text: string, mood: MoodId) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setErrorMessage(null);
    const userMsg: UIMessage = {
      id: nextId(),
      role: 'user',
      content: trimmed,
      createdAt: Date.now(),
    };

    let historyForRequest: ChatMessage[] = [];
    setMessages((prev) => {
      const next = [...prev, userMsg];
      historyForRequest = next
        .slice(-MAX_HISTORY_MESSAGES)
        .map(({ role, content }) => ({ role, content }));
      return next;
    });

    const assistantId = nextId();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '', streaming: true, createdAt: Date.now() },
    ]);

    setPhase('sending');
    const controller = new AbortController();
    abortRef.current = controller;

    let receivedAny = false;

    await streamChatResponse(
      mood,
      historyForRequest,
      {
        onReaction: (kind) => {
          setReaction({ kind, at: Date.now() });
        },
        onChunk: (delta) => {
          if (!receivedAny) {
            receivedAny = true;
            setPhase('streaming');
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + delta } : m,
            ),
          );
        },
        onDone: () => {
          setPhase('done');
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)),
          );
          abortRef.current = null;
        },
        onError: (message) => {
          setPhase('error');
          setErrorMessage(message);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    streaming: false,
                    failed: true,
                    content: m.content || '',
                  }
                : m,
            ),
          );
          abortRef.current = null;
        },
      },
      controller.signal,
    );
  }, []);

  const appendCompletedTurn = useCallback((userText: string, assistantText: string) => {
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: 'user', content: userText, createdAt: Date.now() },
      { id: nextId(), role: 'assistant', content: assistantText, createdAt: Date.now() },
    ]);
    setPhase('done');
  }, []);

  return { messages, phase, errorMessage, reaction, sendMessage, cancelStreaming, appendCompletedTurn };
}
