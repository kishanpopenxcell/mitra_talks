import { useEffect, useState } from 'react';

interface ViewportSize {
  width: number;
  height: number;
}

function read(): ViewportSize {
  if (typeof window === 'undefined') return { width: 1024, height: 768 };
  return { width: window.innerWidth, height: window.innerHeight };
}

/** Reactive viewport dimensions, for sizing Mitra to the space it actually has. */
export function useViewportSize(): ViewportSize {
  const [size, setSize] = useState<ViewportSize>(read);

  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setSize(read()));
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  return size;
}

/** Clamp helper shared by the screens that size the globe. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
