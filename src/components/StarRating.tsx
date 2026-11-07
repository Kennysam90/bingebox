import { Star } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../lib/format';

/** Five stars mapped onto the 1–10 scale (each star = 2 points). */
export function StarRating({ value, onChange, size = 22, disabled }: { value: number | null; onChange: (score: number | null) => void; size?: number; disabled?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? (value ? value / 2 : 0);
  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(null)} role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(value === n * 2 ? null : n * 2)}
          className="p-0.5 transition-transform hover:scale-110 disabled:opacity-50"
          role="radio"
          aria-checked={value === n * 2}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
        >
          <Star size={size} className={cn('transition-colors', n <= shown ? 'fill-gold text-gold' : 'text-ink-400')} />
        </button>
      ))}
    </div>
  );
}
