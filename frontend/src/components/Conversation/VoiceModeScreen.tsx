import { useCallback, useEffect, useRef, useState } from 'react';
import { Orb } from '../Orb';
import { getMoodMeta } from '../../mood/moods';
import { getVoiceModeGreeting } from '../../mood/greetings';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { useAudioPlayback } from '../../hooks/useAudioPlayback';
import { useVoiceActivityDetection } from '../../hooks/useVoiceActivityDetection';
import { converseWithVoice, base64AudioToObjectUrl } from '../../services/voiceService';
import { toFriendlyError } from '../../services/apiError';
import { MessageList } from './MessageList';
import type { ChatMessage, MoodId, OrbState, UIMessage } from '../../types';

interface VoiceModeScreenProps {
  mood: MoodId;
  /** Prior conversation turns from the text screen, used as context for the first voice turn. */
  initialHistory: ChatMessage[];
  /** Called whenever a voice turn completes, so the parent's shared transcript stays in sync. */
  onTurnCompleted: (userText: string, assistantText: string) => void;
  onExit: () => void;
}

type VoiceLoopPhase = 'greeting' | 'listening' | 'paused' | 'processing' | 'speaking' | 'error';

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `voice-${Date.now()}-${idCounter}`;
}

/**
 * Hands-free voice conversation loop: Mitra greets, then the mic auto-starts,
 * auto-stops on sustained silence (voice activity detection), sends audio to
 * the backend's combined STT->LLM->TTS pipeline, speaks the reply, and
 * automatically starts listening again -- no mic button needed. Tapping the
 * orb is the one manual control: it interrupts Mitra mid-reply (barge-in) or
 * pauses/resumes listening.
 */
export function VoiceModeScreen({ mood, initialHistory, onTurnCompleted, onExit }: VoiceModeScreenProps) {
  const moodMeta = getMoodMeta(mood);
  const [phase, setPhase] = useState<VoiceLoopPhase>('greeting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [localMessages, setLocalMessages] = useState<UIMessage[]>([]);
  const historyRef = useRef<ChatMessage[]>(initialHistory);
  const activeRef = useRef(true);

  const { recordingState, isSupported: micSupported, startRecording, stopRecording, cancelRecording } =
    useVoiceRecorder();

  const handlePlaybackEnded = useCallback(() => {
    if (!activeRef.current) return;
    void beginListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { playbackState, playAudioUrl, speakText, stop: stopPlayback } = useAudioPlayback(handlePlaybackEnded);

  const handleSilence = useCallback(() => {
    void finishListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { amplitude, attach: attachVAD, detach: detachVAD } = useVoiceActivityDetection({
    onSilence: handleSilence,
  });

  const beginListening = useCallback(async () => {
    if (!activeRef.current) return;
    setErrorMessage(null);
    const stream = await startRecording();
    if (!stream) {
      if (activeRef.current) {
        setPhase('error');
        setErrorMessage('Could not access the microphone. Please check permissions and try again.');
      }
      return;
    }
    if (!activeRef.current) {
      // Voice mode was exited while permission was pending -- clean up immediately.
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    attachVAD(stream);
    setPhase('listening');
  }, [startRecording, attachVAD]);

  const finishListening = useCallback(async () => {
    detachVAD();
    const blob = await stopRecording();
    if (!activeRef.current) return;

    if (!blob) {
      // Nothing meaningful was recorded (e.g. immediate silence) -- just listen again.
      void beginListening();
      return;
    }

    setPhase('processing');
    try {
      const result = await converseWithVoice(blob, mood, historyRef.current);
      if (!activeRef.current) return;

      const newTurns: ChatMessage[] = [
        { role: 'user', content: result.transcript },
        { role: 'assistant', content: result.reply_text },
      ];
      historyRef.current = [...historyRef.current, ...newTurns].slice(-20);

      const userMsg: UIMessage = { id: nextId(), role: 'user', content: result.transcript, createdAt: Date.now() };
      const assistantMsg: UIMessage = {
        id: nextId(),
        role: 'assistant',
        content: result.reply_text,
        createdAt: Date.now(),
      };
      setLocalMessages((prev) => [...prev, userMsg, assistantMsg]);
      onTurnCompleted(result.transcript, result.reply_text);

      setPhase('speaking');
      if (result.audio_base64) {
        playAudioUrl(base64AudioToObjectUrl(result.audio_base64));
      } else {
        void speakText(result.reply_text);
      }
    } catch (err) {
      if (!activeRef.current) return;
      setPhase('error');
      setErrorMessage(toFriendlyError(err, 'The voice conversation could not be completed.'));
    }
  }, [mood, stopRecording, detachVAD, beginListening, onTurnCompleted, playAudioUrl, speakText]);

  // Speak the mood greeting on mount, then start listening once it finishes.
  useEffect(() => {
    activeRef.current = true;
    if (!micSupported) {
      setPhase('error');
      setErrorMessage('Voice input is not supported in this browser.');
      return;
    }
    setPhase('greeting');
    void speakText(getVoiceModeGreeting(mood));

    return () => {
      activeRef.current = false;
      detachVAD();
      cancelRecording();
      stopPlayback();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOrbTap = useCallback(() => {
    if (phase === 'speaking' || phase === 'greeting') {
      // Barge-in: stop Mitra talking and start listening immediately.
      stopPlayback();
      void beginListening();
    } else if (phase === 'listening') {
      detachVAD();
      cancelRecording();
      setPhase('paused');
    } else if (phase === 'paused') {
      void beginListening();
    } else if (phase === 'error') {
      void beginListening();
    }
  }, [phase, stopPlayback, beginListening, detachVAD, cancelRecording]);

  const orbState: OrbState = (() => {
    if (phase === 'error') return 'error';
    if (phase === 'listening') return 'listening';
    if (phase === 'processing') return 'thinking';
    if (phase === 'speaking' || phase === 'greeting') return 'speaking';
    return 'idle'; // paused
  })();

  const statusLabel: string = (() => {
    switch (phase) {
      case 'greeting':
        return 'Mitra is saying hello…';
      case 'listening':
        return "I'm listening — go ahead and speak.";
      case 'paused':
        return 'Listening paused — tap the orb to resume.';
      case 'processing':
        return 'Thinking…';
      case 'speaking':
        return 'Mitra is speaking — tap the orb to interrupt.';
      case 'error':
        return errorMessage ?? 'Something went wrong.';
      default:
        return '';
    }
  })();

  void recordingState;
  void playbackState;

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-2 px-3 py-3 sm:px-6 sm:py-4">
        <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/70 sm:text-sm">
          <span aria-hidden="true">{moodMeta.emoji}</span>
          <span>Voice Mode</span>
        </span>
        <button
          type="button"
          onClick={onExit}
          className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs text-white/80 transition hover:bg-white/10 sm:text-sm"
        >
          Exit Voice Mode
        </button>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 pb-2">
        <button
          type="button"
          onClick={handleOrbTap}
          aria-label={
            phase === 'speaking' || phase === 'greeting'
              ? 'Interrupt Mitra'
              : phase === 'listening'
                ? 'Pause listening'
                : 'Resume listening'
          }
          className="rounded-full transition-transform duration-200 hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <Orb state={orbState} mood={moodMeta} amplitude={amplitude} size="lg" />
        </button>
        <p className="max-w-sm text-center text-xs text-white/50 sm:text-sm">{statusLabel}</p>
      </div>

      <MessageList
        messages={localMessages}
        mood={moodMeta}
        emptyStateText="Your conversation will appear here as you talk."
      />
    </div>
  );
}
