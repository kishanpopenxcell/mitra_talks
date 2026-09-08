import { useState, type FormEvent, type KeyboardEvent } from 'react';
import type { RecordingState } from '../../types';
import { MicButton } from './MicButton';

interface InputBarProps {
  onSendText: (text: string) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancelActive: () => void;
  recordingState: RecordingState;
  isStreaming: boolean;
  micSupported: boolean;
  disabled?: boolean;
}

export function InputBar({
  onSendText,
  onStartRecording,
  onStopRecording,
  onCancelActive,
  recordingState,
  isStreaming,
  micSupported,
  disabled,
}: InputBarProps) {
  const [text, setText] = useState('');
  const isRecording = recordingState === 'recording';
  const isBusy = isRecording || recordingState === 'processing' || isStreaming;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSendText(trimmed);
    setText('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  };

  return (
    <div className="px-4 pb-5 pt-2 sm:px-10 sm:pb-7">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-2">
        {isBusy && (
          <div className="flex items-center justify-between px-4 text-xs text-muted">
            <span>
              {isRecording && 'Listening…'}
              {recordingState === 'processing' && 'Working on what you said…'}
              {isStreaming && !isRecording && 'Mitra is replying…'}
            </span>
            <button
              type="button"
              onClick={onCancelActive}
              className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-fg/70 transition hover:bg-white/10"
            >
              {isRecording ? 'Cancel' : 'Stop'}
            </button>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-1.5 rounded-[32px] border border-white/[0.09] bg-white/[0.05] py-2 pl-5 pr-2 backdrop-blur-xl transition-colors focus-within:border-white/20"
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled || isRecording}
            placeholder={isRecording ? 'Recording…' : 'Tell me more…'}
            rows={1}
            aria-label="Message Mitra"
            className="max-h-32 min-h-[44px] w-full flex-1 resize-none bg-transparent py-2.5 text-[15px] text-fg placeholder:text-fg/40 focus:outline-none sm:text-base"
          />

          {micSupported && (
            <MicButton
              recordingState={recordingState}
              disabled={disabled || isStreaming}
              onStart={onStartRecording}
              onStop={onStopRecording}
            />
          )}

          <button
            type="submit"
            disabled={disabled || !text.trim() || isRecording}
            aria-label="Send message"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-ink transition-all duration-200 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:scale-100"
            style={{
              background: 'linear-gradient(135deg, var(--mood-p), var(--mood-s2))',
              boxShadow: '0 12px 30px -10px var(--mood-glow)',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
              <path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
