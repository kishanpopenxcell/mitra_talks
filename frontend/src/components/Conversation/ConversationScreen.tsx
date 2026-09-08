import { useCallback, useState } from 'react';
import { MitraFace } from '../Mitra';
import { InputBar } from '../InputBar';
import { getMoodMeta } from '../../mood/moods';
import type { MitraState, MoodId, ReactionEvent } from '../../types';
import { useChatStream } from '../../hooks/useChatStream';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { converseWithVoice } from '../../services/voiceService';
import { toFriendlyError } from '../../services/apiError';
import { MessageList } from './MessageList';
import { MoodIndicator } from './MoodIndicator';
import { VoiceModeScreen } from './VoiceModeScreen';

interface ConversationScreenProps {
  mood: MoodId;
  onChangeMood: () => void;
}

export function ConversationScreen({ mood, onChangeMood }: ConversationScreenProps) {
  const moodMeta = getMoodMeta(mood);
  const { messages, phase, errorMessage, reaction: chatReaction, sendMessage, cancelStreaming, appendCompletedTurn } =
    useChatStream();
  const {
    recordingState,
    isSupported: micSupported,
    errorMessage: recorderError,
    startRecording,
    stopRecording,
    cancelRecording,
    resetToIdle,
  } = useVoiceRecorder();

  const [voiceTurnError, setVoiceTurnError] = useState<string | null>(null);
  const [voiceReaction, setVoiceReaction] = useState<ReactionEvent | null>(null);
  const [voiceModeActive, setVoiceModeActive] = useState(false);

  const isStreaming = phase === 'sending' || phase === 'streaming';
  const isRecording = recordingState === 'recording';
  const isProcessingVoice = recordingState === 'processing';

  const faceState: MitraState = (() => {
    if (recorderError || errorMessage || voiceTurnError) return 'error';
    if (isRecording) return 'listening';
    if (isProcessingVoice || phase === 'sending') return 'thinking';
    if (phase === 'streaming') return 'speaking';
    return 'idle';
  })();

  // Whichever reaction fired most recently wins (text stream or voice turn).
  const reaction =
    chatReaction && voiceReaction
      ? chatReaction.at >= voiceReaction.at
        ? chatReaction
        : voiceReaction
      : chatReaction ?? voiceReaction;

  const handleSendText = useCallback(
    (text: string) => {
      setVoiceTurnError(null);
      void sendMessage(text, mood);
    },
    [sendMessage, mood],
  );

  const handleStartRecording = useCallback(async () => {
    await startRecording();
  }, [startRecording]);

  const handleStopRecording = useCallback(async () => {
    const blob = await stopRecording();
    if (!blob) {
      resetToIdle();
      return;
    }
    setVoiceTurnError(null);
    try {
      const history = messages
        .filter((m) => !m.streaming)
        .slice(-20)
        .map(({ role, content }) => ({ role, content }));

      const result = await converseWithVoice(blob, mood, history);
      // Text mode is silent by design -- voice replies only happen in Voice Mode.
      if (result.reaction) setVoiceReaction({ kind: result.reaction, at: Date.now() });
      appendCompletedTurn(result.transcript, result.reply_text);
    } catch (err) {
      setVoiceTurnError(toFriendlyError(err, 'The voice conversation could not be completed.'));
    } finally {
      resetToIdle();
    }
  }, [stopRecording, resetToIdle, messages, mood, appendCompletedTurn]);

  const handleCancelActive = useCallback(() => {
    if (isRecording) {
      cancelRecording();
    } else if (isStreaming) {
      cancelStreaming();
    }
  }, [isRecording, isStreaming, cancelRecording, cancelStreaming]);

  const combinedError = recorderError || errorMessage || voiceTurnError;

  if (voiceModeActive) {
    const initialHistory = messages
      .filter((m) => !m.streaming)
      .slice(-20)
      .map(({ role, content }) => ({ role, content }));

    return (
      <VoiceModeScreen
        mood={mood}
        initialHistory={initialHistory}
        onTurnCompleted={appendCompletedTurn}
        onExit={() => setVoiceModeActive(false)}
      />
    );
  }

  return (
    <div className="animate-screen-in flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-10 sm:py-5">
        <div className="flex items-center gap-3.5">
          <MitraFace mood={mood} state={faceState} reaction={reaction} size={44} />
          <div className="flex flex-col gap-0.5">
            <span className="font-display text-lg font-bold leading-none tracking-[-0.01em]">Mitra</span>
            <MoodIndicator mood={moodMeta} onChangeMood={onChangeMood} />
          </div>
        </div>

        {micSupported && (
          <button
            type="button"
            onClick={() => setVoiceModeActive(true)}
            className="flex h-11 items-center gap-2.5 rounded-full border px-4 text-sm font-medium text-fg transition hover:bg-white/[0.06]"
            style={{
              borderColor: 'color-mix(in srgb, var(--mood-p) 32%, transparent)',
              background: 'color-mix(in srgb, var(--mood-p) 8%, transparent)',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
              <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" stroke="currentColor" strokeWidth="1.8" />
              <path d="M19 11a7 7 0 0 1-14 0M12 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span>Voice mode</span>
          </button>
        )}
      </header>

      <MessageList messages={messages} mood={moodMeta} />

      {combinedError && (
        <p className="animate-fade-in mx-auto w-full max-w-[760px] px-6 pb-1 text-center text-xs text-rose-300/80 sm:text-sm">
          {combinedError}
        </p>
      )}
      {!combinedError && !micSupported && (
        <p className="mx-auto w-full max-w-[760px] px-6 pb-1 text-center text-xs text-muted">
          Voice input isn&apos;t supported in this browser — you can still type to chat.
        </p>
      )}

      <InputBar
        onSendText={handleSendText}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        onCancelActive={handleCancelActive}
        recordingState={recordingState}
        isStreaming={isStreaming}
        micSupported={micSupported}
      />
    </div>
  );
}
