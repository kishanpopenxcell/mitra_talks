import { useEffect, useRef } from 'react';
import type { UIMessage } from '../../types';
import type { MoodMeta } from '../../mood/moods';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  messages: UIMessage[];
  mood: MoodMeta;
  emptyStateText?: string;
}

export function MessageList({
  messages,
  mood,
  emptyStateText = "Say hello, or press the mic to speak — I'm listening.",
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-white/40">
        {emptyStateText}
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} mood={mood} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
