import type { MoodMeta } from '../../mood/moods';

interface MoodIndicatorProps {
  mood: MoodMeta;
  onChangeMood: () => void;
}

/** Compact "current mood · Change" control shown under Mitra's name in the header. */
export function MoodIndicator({ mood, onChangeMood }: MoodIndicatorProps) {
  return (
    <button
      type="button"
      onClick={onChangeMood}
      title="Change mood"
      className="group flex items-center gap-2 text-[13px] text-muted transition hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded-full"
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: mood.colors.primary, boxShadow: `0 0 12px ${mood.colors.glow}` }}
        aria-hidden="true"
      />
      <span className="font-medium">{mood.label}</span>
      <span className="opacity-50" aria-hidden="true">
        ·
      </span>
      <span className="underline-offset-2 group-hover:underline">Change</span>
    </button>
  );
}
