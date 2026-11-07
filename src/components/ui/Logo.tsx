import { useId } from 'react';
import { cn } from '../../lib/format';

/** The BingeBox mark: two stacked boxes (one more episode…) with a play symbol. */
export function LogoMark({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 64 64" className={cn('shrink-0', className)} aria-hidden="true">
      <defs>
        <linearGradient id={`bbg-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff2d46" />
          <stop offset="1" stopColor="#ff6a3d" />
        </linearGradient>
      </defs>
      <rect x="17" y="5" width="42" height="42" rx="11" fill="#a40d24" />
      <rect x="5" y="17" width="42" height="42" rx="11" fill={`url(#bbg-${id})`} />
      <path d="M21 28.5v19a2 2 0 0 0 3 1.7l16.2-9.5a2 2 0 0 0 0-3.4L24 26.8a2 2 0 0 0-3 1.7z" fill="#fff" />
    </svg>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex select-none items-center gap-2', className)} aria-label="BingeBox">
      <LogoMark className="h-[1.6em] w-[1.6em]" />
      {!compact && (
        <span className="font-display text-[1.25em] font-extrabold leading-none tracking-[-0.04em]">
          <span className="text-white">Binge</span>
          <span className="bg-brand-gradient bg-clip-text text-transparent">Box</span>
        </span>
      )}
    </span>
  );
}
