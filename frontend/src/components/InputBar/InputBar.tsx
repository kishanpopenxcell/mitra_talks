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
    <div className="flex flex-col gap-2 border-t border-white/10 bg-black/20 px-3 py-3 backdrop-blur-2xl sm:px-6 sm:py-4">
      {isBusy && (
        <div className="flex items-center justify-between px-1 text-xs text-white/50">
          <span>
            {isRecording && 'Listening…'}
            {recordingState === 'processing' && 'Processing your voice…'}
            {isStreaming && !isRecording && 'Mitra is responding…'}
          </span>
          <button
            type="button"
            onClick={onCancelActive}
            className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-white/70 transition hover:bg-white/10"
          >
            {isRecording ? 'Cancel' : 'Stop'}
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2 sm:gap-3">
        <div className="flex flex-1 items-end rounded-2xl border border-white/10 bg-white/[0.05] px-3.5 py-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled || isRecording}
            placeholder={isRecording ? 'Recording…' : 'Type how you’re feeling…'}
            rows={1}
            className="max-h-32 w-full resize-none bg-transparent text-sm text-white placeholder:text-white/35 focus:outline-none sm:text-[15px]"
          />
        </div>

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
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-black transition-all duration-200 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:scale-100 sm:h-12 sm:w-12"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 -rotate-45" aria-hidden="true">
            <path
              d="M4 12L20 4L13 20L11 13L4 12Z"
              fill="currentColor"
            />
          </svg>
        </button>
      </form>
    </div>
  );
}
