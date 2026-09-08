import { useCallback, useState } from 'react';
import { Orb } from '../Orb';
import { InputBar } from '../InputBar';
import { getMoodMeta } from '../../mood/moods';
import type { OrbState, MoodId } from '../../types';
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
  const { messages, phase, errorMessage, sendMessage, cancelStreaming, appendCompletedTurn } =
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
  const [voiceModeActive, setVoiceModeActive] = useState(false);

  const isStreaming = phase === 'sending' || phase === 'streaming';
  const isRecording = recordingState === 'recording';
  const isProcessingVoice = recordingState === 'processing';

  const orbState: OrbState = (() => {
    if (recorderError || errorMessage || voiceTurnError) return 'error';
    if (isRecording) return 'listening';
    if (isProcessingVoice || phase === 'sending') return 'thinking';
    if (phase === 'streaming') return 'speaking';
    return 'idle';
  })();

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
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-2 px-3 py-3 sm:px-6 sm:py-4">
        <MoodIndicator mood={moodMeta} onChangeMood={onChangeMood} />
        {micSupported && (
          <button
            type="button"
            onClick={() => setVoiceModeActive(true)}
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs text-white/80 transition hover:bg-white/[0.08] sm:text-sm"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
              <path
                d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z"
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
            Voice Mode
          </button>
        )}
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-2">
        <Orb state={orbState} mood={moodMeta} size="md" />
        {combinedError && (
          <p className="mt-3 max-w-sm text-center text-xs text-rose-300/80 sm:text-sm">
            {combinedError}
          </p>
        )}
        {!combinedError && !micSupported && (
          <p className="mt-3 max-w-sm text-center text-xs text-white/40">
            Voice input isn&apos;t supported in this browser — you can still type to chat.
          </p>
        )}
      </div>

      <MessageList messages={messages} mood={moodMeta} />

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
