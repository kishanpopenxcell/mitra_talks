import type { RecordingState } from '../../types';

interface MicButtonProps {
  recordingState: RecordingState;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function MicButton({ recordingState, disabled, onStart, onStop }: MicButtonProps) {
  const isRecording = recordingState === 'recording';
  const isProcessing = recordingState === 'processing';

  return (
    <button
      type="button"
      disabled={disabled || isProcessing}
      onClick={isRecording ? onStop : onStart}
      aria-pressed={isRecording}
      aria-label={isRecording ? 'Stop recording' : 'Start voice recording'}
      className={[
        'relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition-all duration-200 sm:h-12 sm:w-12',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:cursor-not-allowed disabled:opacity-40',
        isRecording
          ? 'scale-105 bg-rose-500 text-white shadow-[0_0_0_8px_rgba(244,63,94,0.15)]'
          : 'bg-white/10 text-white hover:bg-white/20',
      ].join(' ')}
    >
      {isRecording && (
        <span className="absolute inset-0 animate-ping rounded-full bg-rose-500/40" aria-hidden="true" />
      )}
      {isProcessing ? (
        <SpinnerIcon />
      ) : isRecording ? (
        <StopIcon />
      ) : (
        <MicIcon />
      )}
    </button>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="relative h-6 w-6" aria-hidden="true">
      <path
        d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M19 11a7 7 0 0 1-14 0M12 18v3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="relative h-5 w-5" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
