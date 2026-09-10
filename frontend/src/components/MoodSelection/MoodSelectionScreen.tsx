import { useEffect, useState } from 'react';
import { MitraGlobe } from '../Mitra';
import { MOODS, getMoodMeta } from '../../mood/moods';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { clamp, useViewportSize } from '../../hooks/useViewportSize';
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
  /** Bumped on every selection; the globe spins once per bump. */
  const [spinKey, setSpinKey] = useState(0);
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const viewport = useViewportSize();

  // Size the globe to the space it has: on desktop it owns the right column,
  // on smaller screens it sits above the headline.
  const globeSize = isDesktop
    ? Math.round(clamp(Math.min(viewport.width * 0.34, viewport.height * 0.62), 300, 620))
    : Math.round(clamp(Math.min(viewport.width * 0.6, viewport.height * 0.32), 180, 300));

  const shown: MoodId | null = hovered ?? selected;
  const active: MoodId = shown ?? 'neutral';
  const activeMeta = getMoodMeta(active);

  useEffect(() => {
    onPreview(active);
  }, [active, onPreview]);

  const handleSelect = (id: MoodId) => {
    setSelected(id);
    setSpinKey((k) => k + 1);
  };

  return (
    <div className="animate-screen-in relative flex min-h-dvh flex-col px-5 pb-8 pt-7 sm:px-10 lg:px-[72px] lg:pb-12 lg:pt-10">
      <header className="flex items-center justify-between gap-4">
        <span className="font-display text-[20px] font-semibold tracking-[-0.02em]">mitra</span>
        {backendUnreachable && (
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 font-mono text-[11px] tracking-[0.04em] text-amber-200/90">
            Companion service unreachable — you can still explore
          </span>
        )}
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-8 py-8 lg:grid lg:grid-cols-2 lg:items-center lg:gap-10 lg:py-6">
        <div className="order-2 flex max-w-2xl flex-col items-center gap-4 text-center lg:order-1 lg:items-start lg:text-left">
          <p className="text-lg text-muted sm:text-xl">Hi, I&apos;m Mitra.</p>
          <h1 className="font-display text-balance text-[42px] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-6xl lg:text-[72px]">
            How are you feeling right now?
          </h1>
          <div
            key={shown ?? 'none'}
            className="animate-fade-in mt-1 flex min-h-[2.5rem] flex-wrap items-baseline justify-center gap-x-3 gap-y-1 lg:justify-start"
          >
            {shown ? (
              <>
                <span className="font-display text-2xl font-semibold tracking-[-0.02em] text-(--mood-p) sm:text-3xl">
                  {activeMeta.label}
                </span>
                <span className="text-base text-muted sm:text-lg">{activeMeta.blurb}</span>
              </>
            ) : (
              <span className="text-base text-muted sm:text-lg">Pick a mood below to begin.</span>
            )}
          </div>
        </div>

        <div className="order-1 flex justify-center lg:order-2">
          <MitraGlobe
            mood={active}
            state="idle"
            size={globeSize}
            spinKey={spinKey}
            interactive
            label={shown ? `Mitra, ${activeMeta.label.toLowerCase()}` : 'Mitra'}
          />
        </div>
      </main>

      <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
        <div className="flex flex-col items-center gap-3 lg:items-start">
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">Mood</span>
          <div
            role="radiogroup"
            aria-label="How are you feeling"
            className="flex flex-wrap justify-center gap-2 lg:justify-start"
          >
            {MOODS.map((mood) => (
              <MoodCard
                key={mood.id}
                mood={mood}
                selected={selected === mood.id}
                active={active === mood.id && shown !== null}
                onSelect={handleSelect}
                onHover={setHovered}
              />
            ))}
          </div>
        </div>

        <button
          type="button"
          disabled={!selected}
          onClick={() => selected && onStart(selected)}
          className={[
            'flex h-14 w-full max-w-xs shrink-0 items-center justify-center gap-3 rounded-full px-8 text-[15px] font-semibold',
            'transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/50 lg:w-auto',
            selected
              ? 'text-ink hover:scale-[1.02] active:scale-[0.98]'
              : 'cursor-not-allowed bg-white/[0.08] text-fg/40',
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
