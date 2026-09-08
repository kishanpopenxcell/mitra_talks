import { useCallback, useRef, useState } from 'react';

interface VoiceActivityOptions {
  /** RMS amplitude (0-1) above which audio counts as "speech". Tune per environment. */
  speechThreshold?: number;
  /** How long (ms) amplitude must stay below the threshold after speech was heard before firing onSilence. */
  silenceDurationMs?: number;
  /** Safety cap (ms): force onSilence even if the user never pauses, so a turn can't run forever. */
  maxDurationMs?: number;
  /** Called once when sustained silence is detected after speech was heard. */
  onSilence: () => void;
}

interface VoiceActivityResult {
  /** Live 0-1 amplitude, updated on every animation frame while attached. */
  amplitude: number;
  /** Start analyzing amplitude from a live MediaStream. */
  attach: (stream: MediaStream) => void;
  /** Stop analyzing and release audio resources. */
  detach: () => void;
}

/**
 * Simple volume-threshold voice activity detector using the Web Audio API.
 * Not true speech detection (no ML) -- just RMS amplitude over time, which is
 * a well-understood, dependency-free technique that's good enough to know
 * "the user was talking and has now gone quiet" for a hands-free voice loop.
 */
export function useVoiceActivityDetection(options: VoiceActivityOptions): VoiceActivityResult {
  const { speechThreshold = 0.05, silenceDurationMs = 1600, maxDurationMs = 20000, onSilence } = options;
  const [amplitude, setAmplitude] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const heardSpeechRef = useRef(false);
  const silenceStartRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const firedRef = useRef(false);
  const onSilenceRef = useRef(onSilence);
  onSilenceRef.current = onSilence;

  const detach = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    analyserRef.current = null;
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      void audioContextRef.current.close();
    }
    audioContextRef.current = null;
    setAmplitude(0);
  }, []);

  const attach = useCallback(
    (stream: MediaStream) => {
      detach();
      heardSpeechRef.current = false;
      silenceStartRef.current = null;
      firedRef.current = false;
      startTimeRef.current = performance.now();

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const audioContext = new AudioCtx();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceRef.current = source;

      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        if (!analyserRef.current || firedRef.current) return;
        analyserRef.current.getByteTimeDomainData(data);

        let sumSquares = 0;
        for (let i = 0; i < data.length; i++) {
          const normalized = (data[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / data.length);
        setAmplitude(rms);

        const now = performance.now();
        const elapsed = now - startTimeRef.current;

        if (rms >= speechThreshold) {
          heardSpeechRef.current = true;
          silenceStartRef.current = null;
        } else if (heardSpeechRef.current) {
          if (silenceStartRef.current === null) {
            silenceStartRef.current = now;
          } else if (now - silenceStartRef.current >= silenceDurationMs) {
            firedRef.current = true;
            onSilenceRef.current();
            return;
          }
        }

        if (elapsed >= maxDurationMs) {
          firedRef.current = true;
          onSilenceRef.current();
          return;
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    },
    [detach, speechThreshold, silenceDurationMs, maxDurationMs],
  );

  return { amplitude, attach, detach };
}
