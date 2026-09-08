import { useEffect, useState } from 'react';
import { MitraFace } from '../Mitra';
import { MOODS, getMoodMeta } from '../../mood/moods';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import type { MoodId } from '../../types';
import { MoodCard } from './MoodCard';

interface MoodSelectionScreenProps {
  /** A previously chosen mood, when the user comes back to change it. */
  initialMood: MoodId | null;
  onStart: (mood: MoodId) => void;
  /** Reports the mood currently previewed so the app can recolour the scene. */
  onPreview: (mood: MoodId) => void;
  backendUnreachable: boolean;
}

export function MoodSelectionScreen({
  initialMood,
  onStart,
  onPreview,
  backendUnreachable,
}: MoodSelectionScreenProps) {
  const [selected, setSelected] = useState<MoodId | null>(initialMood);
  const [hovered, setHovered] = useState<MoodId | null>(null);
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const shown: MoodId | null = hovered ?? selected;
  const active: MoodId = shown ?? 'neutral';
  const activeMeta = getMoodMeta(active);

  useEffect(() => {
    onPreview(active);
  }, [active, onPreview]);

  return (
    <div className="animate-screen-in relative flex min-h-dvh flex-col px-5 pb-8 pt-7 sm:px-10 lg:px-[72px] lg:pb-12 lg:pt-10">
      <header className="flex items-center justify-between gap-4">
        <span className="font-display text-[22px] font-extrabold tracking-[-0.02em]">mitra</span>
        {backendUnreachable && (
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs text-amber-200/90">
            Companion service is unreachable — you can still explore.
          </span>
        )}
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-8 py-8 lg:flex-row lg:items-center lg:justify-between lg:gap-16 lg:py-6">
        <div className="order-2 flex max-w-2xl flex-col items-center gap-4 text-center lg:order-1 lg:items-start lg:text-left">
          <p className="text-lg text-muted sm:text-xl">Hi, I&apos;m Mitra.</p>
          <h1 className="font-display text-balance text-[44px] font-extrabold leading-[0.98] tracking-[-0.035em] sm:text-6xl lg:text-[78px]">
            How are you feeling right now?
          </h1>
          <div
            key={shown ?? 'none'}
            className="animate-fade-in mt-1 flex min-h-[2.5rem] flex-wrap items-baseline justify-center gap-x-3 gap-y-1 lg:justify-start"
          >
            {shown ? (
              <>
                <span className="font-display text-3xl font-bold tracking-[-0.02em] text-(--mood-p)">
                  {activeMeta.label}
                </span>
                <span className="text-base text-muted sm:text-lg">{activeMeta.blurb}</span>
              </>
            ) : (
              <span className="text-base text-muted sm:text-lg">Pick a mood below to begin.</span>
            )}
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <MitraFace
            mood={active}
            state="idle"
            size={isDesktop ? 330 : 200}
            gazeFollow
            label={shown ? `Mitra, ${activeMeta.label.toLowerCase()}` : 'Mitra'}
          />
        </div>
      </main>

      <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div
          role="radiogroup"
          aria-label="How are you feeling"
          className="grid w-full max-w-lg grid-cols-4 gap-x-2 gap-y-5 lg:flex lg:w-auto lg:max-w-none lg:items-end lg:gap-6"
        >
          {MOODS.map((mood) => (
            <MoodCard
              key={mood.id}
              mood={mood}
              selected={selected === mood.id}
              active={active === mood.id && shown !== null}
              onSelect={setSelected}
              onHover={setHovered}
            />
          ))}
        </div>

        <button
          type="button"
          disabled={!selected}
          onClick={() => selected && onStart(selected)}
          className={[
            'flex h-[60px] w-full max-w-xs items-center justify-center gap-3 rounded-full px-8 text-[17px] font-semibold',
            'transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 lg:w-auto',
            selected
              ? 'text-ink hover:scale-[1.02] active:scale-[0.98]'
              : 'cursor-not-allowed bg-white/10 text-white/40',
          ].join(' ')}
          style={
            selected
              ? {
                  background: 'linear-gradient(135deg, var(--mood-p), var(--mood-s2))',
                  boxShadow: '0 18px 44px -14px var(--mood-glow)',
                }
              : undefined
          }
        >
          <span>{selected ? 'Start talking' : 'Pick a mood to continue'}</span>
          {selected && (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
