import { cn } from '../../lib/format';

/** Colour identities use the profile's initials at every size. */
export const AVATAR_STYLES: Record<string, { from: string; to: string; label: string }> = {
  ember: { from: '#ff2d46', to: '#ff8a3d', label: 'Ember' },
  crimson: { from: '#7f1d1d', to: '#ef4444', label: 'Crimson' },
  ocean: { from: '#0ea5e9', to: '#1e3a8a', label: 'Ocean' },
  violet: { from: '#8b5cf6', to: '#4c1d95', label: 'Violet' },
  forest: { from: '#10b981', to: '#064e3b', label: 'Forest' },
  sunny: { from: '#facc15', to: '#f97316', label: 'Sunny' },
  slate: { from: '#64748b', to: '#1e293b', label: 'Slate' },
  rose: { from: '#f472b6', to: '#9d174d', label: 'Rose' },
};

export function Avatar({ avatar, name, className, rounded = 'rounded-lg' }: { avatar: string; name: string; className?: string; rounded?: string }) {
  const s = AVATAR_STYLES[avatar] ?? AVATAR_STYLES.ember;
  const initials = name.trim().split(/\s+/).filter(Boolean).map((part) => Array.from(part)[0]).slice(0, 2).join('').toLocaleUpperCase() || 'B';
  return (
    <span
      className={cn('relative grid shrink-0 place-items-center overflow-hidden text-white', rounded, className)}
      style={{ background: `linear-gradient(145deg, ${s.from}, ${s.to})` }}
      aria-label={name}
      role="img"
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <circle cx="92" cy="4" r="70" stroke="white" strokeOpacity="0.12" fill="none" strokeWidth="1" />
        <circle cx="92" cy="4" r="54" stroke="white" strokeOpacity="0.08" fill="none" strokeWidth="1" />
        <path d="M0 78L100 30V100H0Z" fill="black" opacity="0.08" />
        <text x="50" y="53" dominantBaseline="middle" textAnchor="middle" fill="white" fontFamily="Inter Variable, Inter, sans-serif" fontSize={initials.length > 1 ? 35 : 42} fontWeight="600" letterSpacing="-1">{initials}</text>
      </svg>
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 to-white/10" />
    </span>
  );
}
