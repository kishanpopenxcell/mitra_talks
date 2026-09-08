import type { MoodMeta } from '../../mood/moods';

interface MoodCardProps {
  mood: MoodMeta;
  selected: boolean;
  onSelect: (id: MoodMeta['id']) => void;
}

export function MoodCard({ mood, selected, onSelect }: MoodCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(mood.id)}
      aria-pressed={selected}
      className={[
        'group relative flex flex-col items-center gap-2 rounded-2xl border px-4 py-5 text-center',
        'backdrop-blur-xl transition-all duration-300 ease-out',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
        selected
          ? 'border-white/40 bg-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.15)] scale-[1.03]'
          : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/20 hover:-translate-y-0.5',
      ].join(' ')}
      style={{
        boxShadow: selected ? `0 8px 30px -8px ${mood.colors.glow}` : undefined,
      }}
    >
      <span
        className="flex h-12 w-12 items-center justify-center rounded-full text-2xl transition-transform duration-300 group-hover:scale-110"
        style={{
          background: `radial-gradient(circle at 35% 30%, ${mood.colors.primary}, ${mood.colors.secondary})`,
          boxShadow: `0 0 22px ${mood.colors.glow}`,
        }}
        aria-hidden="true"
      >
        {mood.emoji}
      </span>
      <span className="text-sm font-medium tracking-wide text-white/90">{mood.label}</span>
      <span className="text-[11px] leading-snug text-white/50">{mood.blurb}</span>
      {selected && (
        <span
          className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-[11px] font-bold text-black shadow-lg"
          aria-hidden="true"
        >
          ✓
        </span>
      )}
    </button>
  );
}
