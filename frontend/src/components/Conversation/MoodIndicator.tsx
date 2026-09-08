import type { MoodMeta } from '../../mood/moods';

interface MoodIndicatorProps {
  mood: MoodMeta;
  onChangeMood: () => void;
}

export function MoodIndicator({ mood, onChangeMood }: MoodIndicatorProps) {
  return (
    <button
      type="button"
      onClick={onChangeMood}
      title="Change mood"
      className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/80 backdrop-blur-xl transition hover:bg-white/[0.08] sm:text-sm"
    >
      <span
        className="flex h-5 w-5 items-center justify-center rounded-full text-[11px]"
        style={{
          background: `radial-gradient(circle at 35% 30%, ${mood.colors.primary}, ${mood.colors.secondary})`,
        }}
        aria-hidden="true"
      >
        {mood.emoji}
      </span>
      <span className="font-medium">{mood.label}</span>
    </button>
  );
}
