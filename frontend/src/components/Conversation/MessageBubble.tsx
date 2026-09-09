import { MitraGlobe } from '../Mitra';
import type { UIMessage } from '../../types';
import type { MoodMeta } from '../../mood/moods';

interface MessageBubbleProps {
  message: UIMessage;
  mood: MoodMeta;
  /** Show a small Mitra beside this bubble (only the latest assistant message gets one). */
  withFace?: boolean;
}

export function MessageBubble({ message, mood, withFace = false }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`animate-fade-up flex w-full items-end gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <span className="w-[30px] shrink-0" aria-hidden={!withFace}>
          {withFace && (
            <MitraGlobe mood={mood.id} state={message.streaming ? 'speaking' : 'idle'} size={30} label="" />
          )}
        </span>
      )}
      <div
        className={[
          'max-w-[85%] px-[18px] py-3.5 text-[15px] leading-relaxed sm:max-w-[70%] sm:text-base',
          isUser
            ? 'rounded-[20px] rounded-br-[6px] bg-fg text-ink'
            : 'rounded-[20px] rounded-bl-[6px] border text-fg',
        ].join(' ')}
        style={
          !isUser
            ? {
                background: 'color-mix(in srgb, var(--mood-p) 10%, transparent)',
                borderColor: 'color-mix(in srgb, var(--mood-p) 22%, transparent)',
              }
            : undefined
        }
      >
        {message.content.length > 0 ? (
          <span className="whitespace-pre-wrap break-words">{message.content}</span>
        ) : message.streaming ? (
          <TypingDots />
        ) : (
          <span className="italic text-muted">No response</span>
        )}
        {message.streaming && message.content.length > 0 && (
          <span
            className="ml-0.5 inline-block h-[18px] w-[2px] animate-pulse align-text-bottom"
            style={{ background: 'var(--mood-p)' }}
            aria-hidden="true"
          />
        )}
        {message.failed && (
          <div className="mt-1.5 text-xs text-rose-300/80">Something went wrong with this response.</div>
        )}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="Mitra is typing">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:-0.3s]" style={{ background: 'var(--mood-p)' }} />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:-0.15s]" style={{ background: 'var(--mood-p)' }} />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full" style={{ background: 'var(--mood-p)' }} />
    </span>
  );
}
