import { useEffect, useRef, useState } from 'react';

export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const on = () => setMatches(mql.matches);
    on();
    mql.addEventListener('change', on);
    return () => mql.removeEventListener('change', on);
  }, [query]);
  return matches;
}

/** True on devices with a real hover-capable pointer (desktop), where hover previews make sense. */
export const useCanHover = () => useMediaQuery('(hover: hover) and (pointer: fine)');

export function useScrolled(threshold = 12) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > threshold);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [threshold]);
  return scrolled;
}

export function useDocumentTitle(title?: string) {
  useEffect(() => {
    if (!title) return;
    const prev = document.title;
    document.title = `${title} · BingeBox`;
    return () => {
      document.title = prev;
    };
  }, [title]);
}

/** Runs a callback when the element scrolls into view (for infinite lists). */
export function useInView<T extends Element>(onEnter: () => void, enabled = true) {
  const ref = useRef<T | null>(null);
  const cb = useRef(onEnter);
  cb.current = onEnter;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && cb.current(), { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);
  return ref;
}

export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable (private mode) — keep in memory only */
    }
  }, [key, value]);
  return [value, setValue] as const;
}
