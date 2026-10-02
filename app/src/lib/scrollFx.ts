// Scroll effects for the marketing page: an element's progress through the
// screen as a number the stylesheet can animate from, and a fade-in for
// things as they come into view. No library: one scroll listener each,
// throttled to the screen's refresh.
import { useEffect, useRef, type RefObject } from 'react';

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp01 = (n: number) => (n > 1 ? 1 : n > 0 ? n : 0);

// How far the element has been scrolled, 0 to 1, for a given position on screen.
//
// 'through': for a section taller than the screen that holds a pinned scene.
//   0 when its top reaches the top of the screen, 1 when its bottom reaches
//   the bottom (the whole time the scene is pinned).
// 'enter': for something scrolling into view. 0 when its top is at the bottom
//   of the screen, 1 when its top has risen to 30% from the top.
export function progressOf(top: number, height: number, screen: number, mode: 'through' | 'enter'): number {
  if (mode === 'through') {
    const travel = height - screen;
    return travel > 0 ? clamp01(-top / travel) : top <= 0 ? 1 : 0;
  }
  return clamp01((screen - top) / (screen * 0.7));
}

// Writes the element's scroll progress to its `--p` CSS variable on every
// frame it changes, and calls `onProgress` with it. With "reduce motion" on
// (in the device's settings) nothing is tracked and `--p` stays unset, so the
// stylesheet's static layout is used.
export function useScrollProgress<T extends HTMLElement>(mode: 'through' | 'enter', onProgress?: (p: number) => void): RefObject<T | null> {
  const ref = useRef<T>(null);
  const callback = useRef(onProgress);
  useEffect(() => {
    callback.current = onProgress;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    let frame = 0;
    let last = -1;
    const measure = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const p = Math.round(progressOf(rect.top, rect.height, window.innerHeight, mode) * 10_000) / 10_000;
      if (p === last) return;
      last = p;
      el.style.setProperty('--p', String(p));
      callback.current?.(p);
    };
    const onScroll = () => {
      // A hidden tab gets no animation frames: measure straight away there.
      if (document.hidden) measure();
      else if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [mode]);

  return ref;
}

// Adds the class `is-in` to every `[data-reveal]` element inside the
// returned element the first time it comes into view (the stylesheet fades
// it up). Shown at once where that cannot be watched, or with reduced motion.
export function useReveal<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const items = [...root.querySelectorAll<HTMLElement>('[data-reveal]')];
    if (prefersReducedMotion() || typeof IntersectionObserver !== 'function') {
      items.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const seen = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-in');
        seen.unobserve(e.target);
      }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
    items.forEach((el) => seen.observe(el));
    return () => seen.disconnect();
  }, []);
  return ref;
}
