import { useState } from 'react';
import { Orb } from '../Orb';
import { MOODS, getMoodMeta } from '../../mood/moods';
import type { MoodId } from '../../types';
import { MoodCard } from './MoodCard';

interface MoodSelectionScreenProps {
  onStart: (mood: MoodId) => void;
  backendUnreachable: boolean;
}

export function MoodSelectionScreen({ onStart, backendUnreachable }: MoodSelectionScreenProps) {
  const [selected, setSelected] = useState<MoodId | null>(null);
  const activeMood = getMoodMeta(selected ?? 'neutral');

  return (
    <div className="relative flex min-h-dvh flex-col items-center overflow-y-auto px-4 pb-10 pt-8 sm:px-6 sm:pt-12">
      <div className="flex flex-col items-center text-center">
        <Orb state="idle" mood={activeMood} size="md" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Hi, I&apos;m Mitra.
        </h1>
        <p className="mt-2 max-w-md text-balance text-sm text-white/60 sm:text-base">
          Before we talk, tell me how you&apos;re feeling right now — it helps me meet you where you are.
        </p>

        {backendUnreachable && (
          <p className="mt-3 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs text-amber-200/90">
            Companion service is unreachable right now — you can still explore the app.
          </p>
        )}
      </div>

      <div className="mt-8 grid w-full max-w-3xl grid-cols-2 gap-3 sm:mt-10 sm:grid-cols-4 sm:gap-4">
        {MOODS.map((mood) => (
          <MoodCard
            key={mood.id}
            mood={mood}
            selected={selected === mood.id}
            onSelect={setSelected}
          />
        ))}
      </div>

      <div className="mt-8 flex w-full max-w-3xl justify-center sm:mt-10">
        <button
          type="button"
          disabled={!selected}
          onClick={() => selected && onStart(selected)}
          className={[
            'w-full max-w-xs rounded-full px-8 py-3.5 text-sm font-semibold tracking-wide sm:text-base',
            'transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
            selected
              ? 'bg-white text-black shadow-[0_10px_40px_-10px_rgba(255,255,255,0.4)] hover:scale-[1.02] active:scale-[0.98]'
              : 'cursor-not-allowed bg-white/10 text-white/40',
          ].join(' ')}
        >
          {selected ? `Start talking as ${getMoodMeta(selected).label}` : 'Pick a mood to continue'}
        </button>
      </div>
    </div>
  );
}
