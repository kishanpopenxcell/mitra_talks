import { useMemo, type CSSProperties } from 'react';
import type { MoodMeta } from '../../mood/moods';
import type { OrbState } from '../../types';
import './orb.css';

interface OrbProps {
  state: OrbState;
  mood: MoodMeta;
  /** Optional 0-1 amplitude value from live mic input, for a more reactive listening state. */
  amplitude?: number;
  size?: 'sm' | 'md' | 'lg';
}

const STATE_LABEL: Record<OrbState, string> = {
  idle: 'Idle',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  error: 'Something went wrong',
};

export function Orb({ state, mood, amplitude = 0, size = 'lg' }: OrbProps) {
  const style = useMemo(
    () =>
      ({
        '--orb-color-primary': mood.colors.primary,
        '--orb-color-secondary': mood.colors.secondary,
        '--orb-glow': mood.colors.glow,
        '--orb-amplitude': Math.min(1, Math.max(0, amplitude)),
      }) as CSSProperties,
    [mood, amplitude],
  );

  return (
    <div
      className={`orb-wrapper orb-size-${size}`}
      data-state={state}
      style={style}
      role="img"
      aria-label={`AI companion orb: ${STATE_LABEL[state]}`}
    >
      <div className="orb-glow" />
      <div className="orb-core">
        <div className="orb-layer orb-layer-1" />
        <div className="orb-layer orb-layer-2" />
        <div className="orb-layer orb-layer-3" />
        <div className="orb-shine" />
      </div>
      {state === 'listening' && (
        <div className="orb-listen-rings" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )}
      {state === 'error' && (
        <div className="orb-error-ring" aria-hidden="true" />
      )}
    </div>
  );
}
