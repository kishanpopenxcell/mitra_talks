import type { MoodMeta } from '../../mood/moods';
import type { MoodId } from '../../types';

interface MoodCardProps {
  mood: MoodMeta;
  /** This mood is the committed choice. */
  selected: boolean;
  /** This mood is currently previewed (hovered/focused, or selected with nothing hovered). */
  active: boolean;
  onSelect: (id: MoodId) => void;
  onHover: (id: MoodId | null) => void;
}

/** One mood in the picker: a chip with the mood's colour. The single large globe previews it. */
export function MoodCard({ mood, selected, active, onSelect, onHover }: MoodCardProps) {
  const c = mood.colors.primary;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(mood.id)}
      onMouseEnter={() => onHover(mood.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(mood.id)}
      onBlur={() => onHover(null)}
      className={[
        'inline-flex h-10 items-center gap-2.5 rounded-full border px-4 text-[13px] font-medium tracking-[0.005em]',
        'transition-[border-color,background-color,color,transform] duration-200 ease-out active:scale-[0.97]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-fg/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        selected
          ? 'bg-white/[0.08] text-fg'
          : active
            ? 'border-white/20 bg-white/[0.05] text-fg'
            : 'border-white/[0.09] text-fg/80 hover:border-white/20 hover:bg-white/[0.04] hover:text-fg',
      ].join(' ')}
      style={selected ? { borderColor: `color-mix(in srgb, ${c} 55%, transparent)` } : undefined}
    >
      <span
        className="h-[7px] w-[7px] rounded-full"
        style={{ background: c, boxShadow: `0 0 10px ${c}` }}
        aria-hidden="true"
      />
      {mood.label}
    </button>
  );
}
