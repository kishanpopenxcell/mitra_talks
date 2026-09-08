import { useEffect, useRef } from 'react';
import type { UIMessage } from '../../types';
import type { MoodMeta } from '../../mood/moods';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  messages: UIMessage[];
  mood: MoodMeta;
  emptyStateText?: string;
}

/** The conversation, anchored to the bottom like a chat should be. */
export function MessageList({
  messages,
  mood,
  emptyStateText = "Say hello, or press the mic to speak — I'm listening.",
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  let lastAssistantId: string | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      lastAssistantId = messages[i].id;
      break;
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-10">
      <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col justify-end gap-4 py-6">
        {messages.length === 0 ? (
          <p className="animate-fade-in pb-12 text-center text-sm text-muted">{emptyStateText}</p>
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              mood={mood}
              withFace={message.id === lastAssistantId}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
