import { useCallback, useEffect, useRef, useState } from 'react';
import { synthesizeSpeech } from '../services/voiceService';

export type PlaybackState = 'idle' | 'playing' | 'error';

interface UseAudioPlaybackResult {
  playbackState: PlaybackState;
  /** Play a pre-fetched audio URL (e.g. from base64 in a converse response). */
  playAudioUrl: (url: string, isFallback?: boolean) => void;
  /** Fetch TTS audio for text from the backend and play it, falling back to speechSynthesis. */
  speakText: (text: string) => Promise<void>;
  /** Stop any currently playing audio or speech synthesis utterance. */
  stop: () => void;
  /** Whether the last playback used the browser fallback rather than backend TTS. */
  usedFallback: boolean;
  /**
   * Live 0-1 RMS level of the audio currently playing, for driving Mitra's
   * mouth. Always 0 for the browser speech fallback (it exposes no signal).
   */
  outputAmplitude: number;
}

/**
 * @param onEnded Called whenever a playback (audio or speechSynthesis) finishes
 * naturally or is stopped/errors out -- used by Voice Mode to know when it's
 * safe to start listening again without picking up Mitra's own voice.
 */
export function useAudioPlayback(onEnded?: () => void): UseAudioPlaybackResult {
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [usedFallback, setUsedFallback] = useState(false);
  const [outputAmplitude, setOutputAmplitude] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  // Every speakText/playAudioUrl call bumps this token and captures its own
  // value. If a newer call starts before an older async fetch resolves, the
  // older call's continuation checks its captured token against the current
  // one and bails out instead of acting on stale data (e.g. React StrictMode's
  // double-invoked effects firing two overlapping speakText calls, or the
  // component unmounting mid-fetch).
  const requestTokenRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Output analyser: routes the <audio> element through the Web Audio API so
  // we can read its level each frame. Purely additive -- if anything here
  // fails the element still plays on its own.
  const analyserCtxRef = useRef<AudioContext | null>(null);
  const analyserRafRef = useRef<number | null>(null);

  const stopAnalyser = useCallback(() => {
    if (analyserRafRef.current !== null) {
      cancelAnimationFrame(analyserRafRef.current);
      analyserRafRef.current = null;
    }
    const ctx = analyserCtxRef.current;
    analyserCtxRef.current = null;
    if (ctx && ctx.state !== 'closed') {
      void ctx.close().catch(() => undefined);
    }
    setOutputAmplitude(0);
  }, []);

  const startAnalyser = useCallback(
    (audio: HTMLAudioElement, token: number) => {
      stopAnalyser();
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const source = ctx.createMediaElementSource(audio);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        analyserCtxRef.current = ctx;
        void ctx.resume().catch(() => undefined);

        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (requestTokenRef.current !== token || analyserCtxRef.current !== ctx) return;
          analyser.getByteTimeDomainData(data);
          let sumSquares = 0;
          for (let i = 0; i < data.length; i++) {
            const n = (data[i] - 128) / 128;
            sumSquares += n * n;
          }
          setOutputAmplitude(Math.sqrt(sumSquares / data.length));
          analyserRafRef.current = requestAnimationFrame(tick);
        };
        analyserRafRef.current = requestAnimationFrame(tick);
      } catch {
        /* the element keeps playing without a level readout */
      }
    },
    [stopAnalyser],
  );

  const revokeCurrentUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const stop = useCallback(
    (notify = false) => {
      requestTokenRef.current += 1;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      stopAnalyser();
      if (audioRef.current) {
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      revokeCurrentUrl();
      setPlaybackState('idle');
      if (notify) onEndedRef.current?.();
    },
    [revokeCurrentUrl, stopAnalyser],
  );

  const playAudioUrl = useCallback(
    (url: string, isFallback = false) => {
      requestTokenRef.current += 1;
      const token = requestTokenRef.current;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;

      if (audioRef.current) {
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
        audioRef.current.pause();
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      revokeCurrentUrl();

      setUsedFallback(isFallback);
      const audio = new Audio(url);
      audioRef.current = audio;
      objectUrlRef.current = url.startsWith('blob:') ? url : null;

      audio.onplay = () => {
        if (requestTokenRef.current !== token) return;
        setPlaybackState('playing');
      };
      audio.onended = () => {
        if (requestTokenRef.current !== token) return;
        stopAnalyser();
        setPlaybackState('idle');
        revokeCurrentUrl();
        onEndedRef.current?.();
      };
      audio.onerror = () => {
        if (requestTokenRef.current !== token) return;
        stopAnalyser();
        setPlaybackState('error');
        revokeCurrentUrl();
        onEndedRef.current?.();
      };

      startAnalyser(audio, token);
      audio.play().catch(() => {
        if (requestTokenRef.current !== token) return;
        stopAnalyser();
        setPlaybackState('error');
        onEndedRef.current?.();
      });
    },
    [revokeCurrentUrl, startAnalyser, stopAnalyser],
  );

  const speakWithBrowserFallback = useCallback((text: string, token: number) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      if (requestTokenRef.current === token) {
        setPlaybackState('error');
        onEndedRef.current?.();
      }
      return;
    }
    setUsedFallback(true);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => {
      if (requestTokenRef.current !== token) return;
      setPlaybackState('playing');
    };
    utterance.onend = () => {
      if (requestTokenRef.current !== token) return;
      setPlaybackState('idle');
      onEndedRef.current?.();
    };
    utterance.onerror = () => {
      if (requestTokenRef.current !== token) return;
      setPlaybackState('error');
      onEndedRef.current?.();
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, []);

  const speakText = useCallback(
    async (text: string) => {
      requestTokenRef.current += 1;
      const token = requestTokenRef.current;
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (!text.trim()) {
        if (requestTokenRef.current === token) onEndedRef.current?.();
        return;
      }
      try {
        const url = await synthesizeSpeech(text, controller.signal);
        if (requestTokenRef.current !== token) {
          // A newer call superseded this one while the fetch was in flight --
          // discard the result (and free the blob URL if one was created).
          if (url) URL.revokeObjectURL(url);
          return;
        }
        if (url) {
          playAudioUrl(url, false);
        } else {
          speakWithBrowserFallback(text, token);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (requestTokenRef.current === token) {
          speakWithBrowserFallback(text, token);
        }
      }
    },
    [playAudioUrl, speakWithBrowserFallback],
  );

  useEffect(() => {
    return () => {
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { playbackState, playAudioUrl, speakText, stop, usedFallback, outputAmplitude };
}
