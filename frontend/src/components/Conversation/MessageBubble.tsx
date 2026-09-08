import type { UIMessage } from '../../types';
import type { MoodMeta } from '../../mood/moods';

interface MessageBubbleProps {
  message: UIMessage;
  mood: MoodMeta;
}

export function MessageBubble({ message, mood }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={[
          'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed sm:max-w-[70%] sm:text-[15px]',
          isUser
            ? 'rounded-br-sm bg-white/90 text-black'
            : 'rounded-bl-sm border border-white/10 bg-white/[0.06] text-white/90 backdrop-blur-xl',
        ].join(' ')}
        style={
          !isUser
            ? { boxShadow: `0 4px 24px -12px ${mood.colors.glow}` }
            : undefined
        }
      >
        {message.content.length > 0 ? (
          <span className="whitespace-pre-wrap break-words">{message.content}</span>
        ) : message.streaming ? (
          <TypingDots />
        ) : (
          <span className="italic text-white/40">No response</span>
        )}
        {message.streaming && message.content.length > 0 && (
          <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-current align-text-bottom" />
        )}
        {message.failed && (
          <div className="mt-1.5 text-xs text-rose-300/80">
            Something went wrong with this response.
          </div>
        )}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="AI is typing">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60" />
    </span>
  );
}
