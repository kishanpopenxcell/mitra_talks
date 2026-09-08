interface WaveformProps {
  /** Live 0-1 RMS level. */
  amplitude: number;
  bars?: number;
  className?: string;
}

/**
 * A row of bars that breathe with the live audio level -- the user's voice
 * while listening, Mitra's while speaking. Tallest in the middle, so it reads
 * as one wave rather than a bar chart.
 */
export function Waveform({ amplitude, bars = 13, className = '' }: WaveformProps) {
  const level = Math.min(1, amplitude * 4);
  const centre = (bars - 1) / 2;
  const t = performance.now() / 140;

  return (
    <div className={`flex h-11 items-center gap-1.5 ${className}`} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => {
        const weight = 1 - Math.abs(i - centre) / (centre + 1);
        const ripple = 0.75 + 0.25 * Math.sin(i * 1.7 + t);
        const h = 0.16 + level * (0.3 + 0.7 * weight) * ripple;
        return (
          <span
            key={i}
            className="w-1 rounded-full transition-[height] duration-100 ease-out"
            style={{ height: `${Math.round(h * 44)}px`, background: 'var(--mood-p)', opacity: 0.85 }}
          />
        );
      })}
    </div>
  );
}
