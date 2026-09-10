import { useCallback, useRef, useState } from 'react';

interface VoiceActivityOptions {
  /** Called once when the user has finished speaking (a real pause after real speech). */
  onSilence: () => void;
  /** Called once if nobody speaks at all within `noSpeechTimeoutMs`. */
  onNoSpeech?: () => void;
  /** A pause this long after speech ends the turn. Long enough to think mid-sentence. */
  endpointSilenceMs?: number;
  /** Give up waiting for a first word after this long. */
  noSpeechTimeoutMs?: number;
  /** Past this much talking, end the turn at the next short pause instead of the full one. */
  softMaxDurationMs?: number;
  /** The "short pause" used once the soft limit has passed. */
  softPauseMs?: number;
  /** Absolute cap so a turn can never run forever (upload and STT limits). */
  hardMaxDurationMs?: number;
  /** Speech must be sustained this long before it counts -- filters clicks and coughs. */
  onsetMs?: number;
}

interface VoiceActivityResult {
  /** Live 0-1 amplitude, updated on every animation frame while attached. */
  amplitude: number;
  /** Start analyzing a live MediaStream. */
  attach: (stream: MediaStream) => void;
  /** Stop analyzing and release audio resources. */
  detach: () => void;
  /** Milliseconds of actual speech heard so far in this turn (0 if none). */
  getSpeechMs: () => number;
}

const DEFAULTS = {
  endpointSilenceMs: 1800,
  noSpeechTimeoutMs: 8000,
  softMaxDurationMs: 30000,
  softPauseMs: 700,
  hardMaxDurationMs: 60000,
  onsetMs: 140,
};

/**
 * Voice activity detection for the hands-free loop.
 *
 * Not a speech model -- an RMS envelope with three things a plain threshold
 * lacks, each fixing a way the old detector cut people off:
 *
 * - An adaptive noise floor: thresholds sit above whatever the room is doing,
 *   so a quiet speaker in a quiet room and a loud speaker in a noisy one both
 *   register, and breath or fan noise never counts as speech.
 * - Hysteresis: speech has to rise above a higher "on" threshold to start, but
 *   only has to stay above a lower "off" threshold to continue, so the natural
 *   dips between words don't read as silence.
 * - Patient endpointing: a turn ends only after a genuine pause following real
 *   speech. Once someone has talked for a long time we end at the next short
 *   pause rather than cutting in mid-word, and a hard cap is the last resort.
 */
export function useVoiceActivityDetection(options: VoiceActivityOptions): VoiceActivityResult {
  const cfg = { ...DEFAULTS, ...options };
  const [amplitude, setAmplitude] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const speechMsRef = useRef(0);
  const onSilenceRef = useRef(cfg.onSilence);
  onSilenceRef.current = cfg.onSilence;
  const onNoSpeechRef = useRef(cfg.onNoSpeech);
  onNoSpeechRef.current = cfg.onNoSpeech;

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
      firedRef.current = false;
      speechMsRef.current = 0;

      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const audioContext = new AudioCtx();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceRef.current = source;

      const data = new Uint8Array(analyser.fftSize);
      const startTime = performance.now();
      let lastTime = startTime;

      // envelope + adaptive floor
      let level = 0;
      let floor = 0.02;
      let calibrated = false;

      // utterance state
      let heardSpeech = false;
      let inSpeech = false;
      let onsetStart: number | null = null;
      let silenceStart: number | null = null;

      const finish = (cb: (() => void) | undefined) => {
        if (firedRef.current) return;
        firedRef.current = true;
        cb?.();
      };

      const tick = () => {
        const an = analyserRef.current;
        if (!an || firedRef.current) return;
        const now = performance.now();
        const dt = now - lastTime;
        lastTime = now;
        const elapsed = now - startTime;

        an.getByteTimeDomainData(data);
        let sumSquares = 0;
        for (let i = 0; i < data.length; i++) {
          const n = (data[i] - 128) / 128;
          sumSquares += n * n;
        }
        const rms = Math.sqrt(sumSquares / data.length);
        setAmplitude(rms);

        // Smooth the level: fast attack so onsets register, slower release so
        // the gaps between words don't drop to zero.
        level = rms > level ? level + (rms - level) * 0.6 : level + (rms - level) * 0.25;

        // Noise floor: the first 300 ms calibrate it, then it follows quiet
        // passages down quickly and creeps up only slowly.
        if (!calibrated) {
          floor = elapsed < 300 ? Math.max(floor * 0.9, level) : floor;
          if (elapsed >= 300) calibrated = true;
        } else if (!inSpeech) {
          floor = level < floor ? level : floor + (level - floor) * 0.01;
        }
        const onThreshold = Math.max(0.035, floor * 3 + 0.012);
        const offThreshold = Math.max(0.022, floor * 2 + 0.006);

        if (!inSpeech) {
          if (level > onThreshold) {
            onsetStart ??= now;
            if (now - onsetStart >= cfg.onsetMs) {
              inSpeech = true;
              heardSpeech = true;
              silenceStart = null;
            }
          } else {
            onsetStart = null;
          }
        } else if (level > offThreshold) {
          silenceStart = null;
          speechMsRef.current += dt;
        } else {
          silenceStart ??= now;
          const pauseNeeded = elapsed >= cfg.softMaxDurationMs ? cfg.softPauseMs : cfg.endpointSilenceMs;
          if (now - silenceStart >= pauseNeeded) {
            finish(onSilenceRef.current);
            return;
          }
        }

        if (!heardSpeech && elapsed >= cfg.noSpeechTimeoutMs) {
          finish(onNoSpeechRef.current ?? onSilenceRef.current);
          return;
        }
        if (elapsed >= cfg.hardMaxDurationMs) {
          finish(onSilenceRef.current);
          return;
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    },
    [
      detach,
      cfg.endpointSilenceMs,
      cfg.noSpeechTimeoutMs,
      cfg.softMaxDurationMs,
      cfg.softPauseMs,
      cfg.hardMaxDurationMs,
      cfg.onsetMs,
    ],
  );

  const getSpeechMs = useCallback(() => speechMsRef.current, []);

  return { amplitude, attach, detach, getSpeechMs };
}
