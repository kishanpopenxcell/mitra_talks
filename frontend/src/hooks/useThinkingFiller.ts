import { useCallback, useEffect, useRef } from 'react';
import { synthesizeSpeech } from '../services/voiceService';
import { pickThinkingPhrase, thinkingPhrasesFor } from '../mood/thinkingPhrases';
import type { MoodId } from '../types';

/** Only speak a filler if the reply hasn't arrived by then. Most replies beat it. */
const FILLER_DELAY_MS = 1200;
/** Share of slow turns that get a filler at all. */
const FILLER_PROBABILITY = 0.5;
/** Pause between the end of a filler and the start of the real reply. */
const BREATH_MS = 250;
/** Parallel TTS requests while pre-fetching the phrase audio. */
const PREFETCH_CONCURRENCY = 2;

export type TurnOutcome = 'ok' | 'unclear' | 'error';

interface ThinkingFiller {
  /** Call when a turn starts processing. Decides later whether to speak. */
  arm: () => void;
  /**
   * Call when the reply is in. Cancels a filler that hasn't started; if one is
   * mid-sentence, resolves after it finishes plus a short breath.
   */
  settle: () => Promise<void>;
  /** Stop any filler immediately (barge-in, exit). */
  cancel: () => void;
  /** Record how the turn ended so the next turn's eligibility is right. */
  noteOutcome: (outcome: TurnOutcome) => void;
}

/**
 * "Hmm, let me think." -- but only when it helps.
 *
 * Fillers are pre-synthesised once per voice session so they play instantly;
 * a filler that needed its own round trip would defeat its purpose. They use
 * a private audio element so finishing one never triggers the main playback's
 * onEnded (which restarts listening).
 */
export function useThinkingFiller(mood: MoodId): ThinkingFiller {
  const cacheRef = useRef<Map<string, string>>(new Map());
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playingRef = useRef<Promise<void> | null>(null);
  const lastPhraseRef = useRef<string | null>(null);
  const lastTurnHadFillerRef = useRef(false);
  const suppressNextRef = useRef(false);
  const aliveRef = useRef(true);

  // Pre-fetch this mood's phrases. Failures just mean that phrase is skipped.
  useEffect(() => {
    aliveRef.current = true;
    const controller = new AbortController();
    const cache = cacheRef.current;
    const queue = thinkingPhrasesFor(mood);

    const worker = async () => {
      while (queue.length > 0 && aliveRef.current) {
        const phrase = queue.shift();
        if (!phrase || cache.has(phrase)) continue;
        try {
          const url = await synthesizeSpeech(phrase, controller.signal);
          if (!aliveRef.current) {
            if (url) URL.revokeObjectURL(url);
            return;
          }
          if (url) cache.set(phrase, url);
        } catch {
          /* leave it out of the pool */
        }
      }
    };
    for (let i = 0; i < PREFETCH_CONCURRENCY; i++) void worker();

    return () => {
      aliveRef.current = false;
      controller.abort();
      for (const url of cache.values()) URL.revokeObjectURL(url);
      cache.clear();
    };
  }, [mood]);

  const stopAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audioRef.current = null;
    }
    playingRef.current = null;
  }, []);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    stopAudio();
  }, [stopAudio]);

  const speak = useCallback((phrase: string, url: string) => {
    stopAudio();
    const audio = new Audio(url);
    audioRef.current = audio;
    lastPhraseRef.current = phrase;
    lastTurnHadFillerRef.current = true;
    playingRef.current = new Promise<void>((resolve) => {
      const done = () => {
        if (audioRef.current === audio) audioRef.current = null;
        window.setTimeout(resolve, BREATH_MS);
      };
      audio.onended = done;
      audio.onerror = done;
      audio.play().catch(done);
    });
  }, [stopAudio]);

  const arm = useCallback(() => {
    cancel();
    const eligible = !lastTurnHadFillerRef.current && !suppressNextRef.current && Math.random() < FILLER_PROBABILITY;
    // This turn's outcome resets these; a skipped turn still clears "had filler".
    lastTurnHadFillerRef.current = false;
    suppressNextRef.current = false;
    if (!eligible) return;

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const cache = cacheRef.current;
      const phrase = pickThinkingPhrase(mood, lastPhraseRef.current, (p) => cache.has(p));
      const url = phrase ? cache.get(phrase) : undefined;
      if (phrase && url) speak(phrase, url);
    }, FILLER_DELAY_MS);
  }, [cancel, mood, speak]);

  const settle = useCallback(async () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const playing = playingRef.current;
    if (playing) await playing;
    playingRef.current = null;
  }, []);

  const noteOutcome = useCallback((outcome: TurnOutcome) => {
    // Don't follow "could you say that again?" or an error with "hmm, let me think".
    if (outcome !== 'ok') suppressNextRef.current = true;
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  return { arm, settle, cancel, noteOutcome };
}
