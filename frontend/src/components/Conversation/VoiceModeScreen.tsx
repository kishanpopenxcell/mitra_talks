import { useCallback, useEffect, useRef, useState } from 'react';
import { MitraGlobe } from '../Mitra';
import { getMoodMeta } from '../../mood/moods';
import { getVoiceModeGreeting } from '../../mood/greetings';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { useAudioPlayback } from '../../hooks/useAudioPlayback';
import { useVoiceActivityDetection } from '../../hooks/useVoiceActivityDetection';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useThinkingFiller } from '../../hooks/useThinkingFiller';
import { clamp, useViewportSize } from '../../hooks/useViewportSize';
import { converseWithVoice, base64AudioToObjectUrl } from '../../services/voiceService';
import { toFriendlyError } from '../../services/apiError';
import { Waveform } from './Waveform';
import type { ChatMessage, MitraState, MoodId, ReactionEvent } from '../../types';

interface VoiceModeScreenProps {
  mood: MoodId;
  /** Prior conversation turns from the text screen, used as context for the first voice turn. */
  initialHistory: ChatMessage[];
  /** Called whenever a voice turn completes, so the parent's shared transcript stays in sync. */
  onTurnCompleted: (userText: string, assistantText: string) => void;
  onExit: () => void;
}

type VoiceLoopPhase = 'greeting' | 'listening' | 'paused' | 'waiting' | 'processing' | 'speaking' | 'error';

/** Recordings with less actual speech than this are treated as noise and listened past. */
const MIN_SPEECH_MS = 350;

interface Caption {
  user: string | null;
  assistant: string | null;
  turn: number;
}

/**
 * Hands-free voice conversation loop: Mitra greets, then the mic auto-starts,
 * auto-stops on sustained silence (voice activity detection), sends audio to
 * the backend's combined STT->LLM->TTS pipeline, speaks the reply, and
 * automatically starts listening again -- no mic button needed. Tapping Mitra
 * is the one manual control: it interrupts mid-reply (barge-in) or
 * pauses/resumes listening.
 */
export function VoiceModeScreen({ mood, initialHistory, onTurnCompleted, onExit }: VoiceModeScreenProps) {
  const moodMeta = getMoodMeta(mood);
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const viewport = useViewportSize();
  const globeSize = Math.round(
    isDesktop
      ? clamp(viewport.height * 0.46, 300, 520)
      : clamp(Math.min(viewport.width * 0.66, viewport.height * 0.36), 200, 320),
  );
  const [phase, setPhase] = useState<VoiceLoopPhase>('greeting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [caption, setCaption] = useState<Caption>({ user: null, assistant: null, turn: 0 });
  const [reaction, setReaction] = useState<ReactionEvent | null>(null);
  const historyRef = useRef<ChatMessage[]>(initialHistory);
  const activeRef = useRef(true);

  const { isSupported: micSupported, startRecording, stopRecording, cancelRecording } = useVoiceRecorder();

  const handlePlaybackEnded = useCallback(() => {
    if (!activeRef.current) return;
    void beginListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { playAudioUrl, speakText, stop: stopPlayback, usedFallback, outputAmplitude } =
    useAudioPlayback(handlePlaybackEnded);
  const filler = useThinkingFiller(mood);

  const handleSilence = useCallback(() => {
    void finishListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNoSpeech = useCallback(() => {
    // Nobody said anything: rest quietly instead of sending silence to the server.
    void cancelListeningTo('waiting');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    amplitude: micAmplitude,
    attach: attachVAD,
    detach: detachVAD,
    getSpeechMs,
  } = useVoiceActivityDetection({
    onSilence: handleSilence,
    onNoSpeech: handleNoSpeech,
  });

  const cancelListeningTo = useCallback(
    async (next: 'paused' | 'waiting') => {
      detachVAD();
      cancelRecording();
      if (activeRef.current) setPhase(next);
    },
    [detachVAD, cancelRecording],
  );

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
    const speechMs = getSpeechMs();
    detachVAD();
    const blob = await stopRecording();
    if (!activeRef.current) return;

    if (!blob || speechMs < MIN_SPEECH_MS) {
      // A click, a cough, a breath: not a turn. Listen again without a round trip.
      void beginListening();
      return;
    }

    setPhase('processing');
    filler.arm();
    try {
      const result = await converseWithVoice(blob, mood, historyRef.current);
      // If a "hmm, let me think" is mid-sentence, let it finish before the reply.
      await filler.settle();
      if (!activeRef.current) return;

      if (!result.understood) {
        // Couldn't make it out as English. Mitra asks again; nothing joins the history.
        filler.noteOutcome('unclear');
        setCaption((prev) => ({ user: null, assistant: result.reply_text, turn: prev.turn + 1 }));
        if (result.reaction) setReaction({ kind: result.reaction, at: Date.now() });
        setPhase('speaking');
        if (result.audio_base64) playAudioUrl(base64AudioToObjectUrl(result.audio_base64));
        else void speakText(result.reply_text);
        return;
      }

      const newTurns: ChatMessage[] = [
        { role: 'user', content: result.transcript },
        { role: 'assistant', content: result.reply_text },
      ];
      historyRef.current = [...historyRef.current, ...newTurns].slice(-20);
      filler.noteOutcome('ok');

      setCaption((prev) => ({ user: result.transcript, assistant: result.reply_text, turn: prev.turn + 1 }));
      if (result.reaction) setReaction({ kind: result.reaction, at: Date.now() });
      onTurnCompleted(result.transcript, result.reply_text);

      setPhase('speaking');
      if (result.audio_base64) {
        playAudioUrl(base64AudioToObjectUrl(result.audio_base64));
      } else {
        void speakText(result.reply_text);
      }
    } catch (err) {
      filler.cancel();
      filler.noteOutcome('error');
      if (!activeRef.current) return;
      setPhase('error');
      setErrorMessage(toFriendlyError(err, 'The voice conversation could not be completed.'));
    }
  }, [mood, stopRecording, detachVAD, getSpeechMs, beginListening, onTurnCompleted, playAudioUrl, speakText, filler]);

  // Speak the mood greeting on mount, then start listening once it finishes.
  useEffect(() => {
    activeRef.current = true;
    if (!micSupported) {
      setPhase('error');
      setErrorMessage('Voice input is not supported in this browser.');
      return;
    }
    setPhase('greeting');
    const greeting = getVoiceModeGreeting(mood);
    setCaption({ user: null, assistant: greeting, turn: 0 });
    void speakText(greeting);

    return () => {
      activeRef.current = false;
      detachVAD();
      cancelRecording();
      stopPlayback();
      filler.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTap = useCallback(() => {
    if (phase === 'speaking' || phase === 'greeting') {
      // Barge-in: stop Mitra talking and start listening immediately.
      stopPlayback();
      void beginListening();
    } else if (phase === 'listening') {
      void cancelListeningTo('paused');
    } else if (phase === 'processing') {
      // Hush a filler mid-sentence; the reply is still on its way.
      filler.cancel();
    } else if (phase === 'paused' || phase === 'waiting' || phase === 'error') {
      void beginListening();
    }
  }, [phase, stopPlayback, beginListening, cancelListeningTo, filler]);

  const faceState: MitraState = (() => {
    if (phase === 'error') return 'error';
    if (phase === 'listening') return 'listening';
    if (phase === 'processing') return 'thinking';
    if (phase === 'speaking' || phase === 'greeting') return 'speaking';
    return 'idle'; // paused
  })();

  const isSpeaking = phase === 'speaking' || phase === 'greeting';
  // Listening: the mic level ripples the surface. Speaking: Mitra's own output
  // level pulses it; the browser speech fallback exposes none, so leave it
  // undefined and let the globe synthesise a rhythm.
  const globeAmplitude =
    phase === 'listening' ? micAmplitude : isSpeaking && !usedFallback ? outputAmplitude : undefined;
  const waveAmplitude = phase === 'listening' ? micAmplitude : isSpeaking ? outputAmplitude : 0;

  const [statusLabel, hint] = ((): [string, string] => {
    switch (phase) {
      case 'greeting':
        return ['Saying hello…', 'Tap Mitra to skip ahead'];
      case 'listening':
        return ["I'm listening — take your time.", 'Tap Mitra to pause'];
      case 'paused':
        return ['Paused.', 'Tap Mitra to resume'];
      case 'waiting':
        return ["I'm here whenever you're ready.", 'Tap Mitra to continue'];
      case 'processing':
        return ['Thinking…', ''];
      case 'speaking':
        return ['', 'Tap Mitra to interrupt'];
      case 'error':
        return [errorMessage ?? 'Something went wrong.', 'Tap Mitra to try again'];
      default:
        return ['', ''];
    }
  })();

  const tapLabel = isSpeaking ? 'Interrupt Mitra' : phase === 'listening' ? 'Pause listening' : 'Resume listening';

  return (
    <div className="animate-screen-in relative flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-10 sm:py-5">
        <span
          className="flex h-10 items-center gap-2.5 rounded-full border px-4 text-sm"
          style={{
            borderColor: 'color-mix(in srgb, var(--mood-p) 28%, transparent)',
            background: 'color-mix(in srgb, var(--mood-p) 8%, transparent)',
          }}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: moodMeta.colors.primary, boxShadow: `0 0 12px ${moodMeta.colors.glow}` }}
            aria-hidden="true"
          />
          <span className="font-medium">Voice mode</span>
          <span className="opacity-50" aria-hidden="true">
            ·
          </span>
          <span className="text-muted">{moodMeta.label}</span>
        </span>
        <button
          type="button"
          onClick={onExit}
          className="flex h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-sm font-medium text-fg transition hover:bg-white/10"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span>Exit</span>
        </button>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-7 px-4">
        <MitraGlobe
          mood={mood}
          state={faceState}
          amplitude={globeAmplitude}
          reaction={reaction}
          size={globeSize}
          interactive
          onTap={handleTap}
          label={`Mitra, ${faceState}. ${tapLabel}`}
        />

        <Waveform amplitude={waveAmplitude} />

        <div className="flex min-h-[64px] flex-col items-center gap-2 px-6 text-center">
          {statusLabel && (
            <p
              key={statusLabel}
              className="animate-fade-in font-display text-balance text-xl font-semibold tracking-[-0.02em] sm:text-[28px]"
            >
              {statusLabel}
            </p>
          )}
          {hint && <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">{hint}</p>}
        </div>
      </div>

      <div className="px-6 pb-10 sm:pb-14" aria-live="polite">
        <div key={caption.turn} className="animate-fade-in mx-auto flex w-full max-w-[760px] flex-col gap-3 text-center">
          {caption.user && <p className="text-[15px] leading-relaxed text-muted">{caption.user}</p>}
          {caption.assistant && (
            <p className="text-pretty text-lg leading-relaxed text-fg sm:text-xl">{caption.assistant}</p>
          )}
        </div>
      </div>
    </div>
  );
}
