import { MitraFace } from '../Mitra';
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

/** One mood in the picker: a small Mitra wearing that mood's expression, plus its name. */
export function MoodCard({ mood, selected, active, onSelect, onHover }: MoodCardProps) {
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
        'group flex min-w-0 flex-col items-center gap-2.5 rounded-2xl p-1 transition-all duration-300 ease-out',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
        active ? 'opacity-100' : 'opacity-70 saturate-[0.85] hover:opacity-100 hover:saturate-100',
      ].join(' ')}
    >
      <span
        className={[
          'block transition-transform duration-300 ease-out',
          selected ? 'scale-115' : active ? 'scale-108' : 'group-hover:scale-105',
        ].join(' ')}
      >
        <MitraFace mood={mood.id} size={64} label="" />
      </span>
      <span
        className="text-[13px] font-medium tracking-wide transition-colors duration-300"
        style={{ color: active ? mood.colors.primary : undefined }}
      >
        {mood.label}
      </span>
    </button>
  );
}
