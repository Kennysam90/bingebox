import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Play, Plus } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useMyList } from '../../hooks/useMyList';
import { lengthLabel, years } from '../../lib/format';
import type { CardTitle } from '../../lib/types';
import { MaturityBadge, NewBadge, RatingBadge } from '../ui/Badges';
import { LandscapeArt } from './TitleArt';

interface Target {
  title: CardTitle;
  rect: DOMRect;
}

interface Ctx {
  open: (title: CardTitle, el: HTMLElement) => void;
  cancel: () => void;
}

const HoverCtx = createContext<Ctx | null>(null);
const OPEN_DELAY = 480;

/**
 * Desktop hover previews: after a short dwell on a card, an enlarged card with
 * quick actions floats above the row (rendered in a portal so carousels don't
 * clip it). One preview at a time.
 */
export function HoverPreviewProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Target | null>(null);
  const timer = useRef<number>();

  const cancel = useCallback(() => window.clearTimeout(timer.current), []);
  const open = useCallback((title: CardTitle, el: HTMLElement) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setTarget({ title, rect: el.getBoundingClientRect() }), OPEN_DELAY);
  }, []);
  const close = useCallback(() => setTarget(null), []);

  useEffect(() => {
    const onScroll = () => setTarget(null);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const value = useMemo(() => ({ open, cancel }), [open, cancel]);
  return (
    <HoverCtx.Provider value={value}>
      {children}
      {createPortal(<AnimatePresence>{target && <Preview key={target.title.id} target={target} onClose={close} />}</AnimatePresence>, document.body)}
    </HoverCtx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useHoverPreview() {
  return useContext(HoverCtx);
}

function Preview({ target, onClose }: { target: Target; onClose: () => void }) {
  const navigate = useNavigate();
  const list = useMyList();
  const { title, rect } = target;
  const width = Math.min(Math.max(rect.width * 1.45, 330), 440);
  const imgH = (width * 9) / 16;
  const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, 16), window.innerWidth - width - 16);
  const top = Math.max(rect.top + rect.height / 2 - imgH / 2 - 8, 12);
  const originX = ((rect.left + rect.width / 2 - left) / width) * 100;
  const inList = list.has(title.id);

  return (
    <motion.div
      role="dialog"
      aria-label={title.title}
      onMouseLeave={onClose}
      initial={{ opacity: 0, scale: rect.width / width, y: 0 }}
      animate={{ opacity: 1, scale: 1, y: -10 }}
      exit={{ opacity: 0, scale: (rect.width / width) * 1.02, y: 0, transition: { duration: 0.16 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.7 }}
      style={{ position: 'fixed', left, top, width, transformOrigin: `${originX}% 30%`, zIndex: 60 }}
      className="overflow-hidden rounded-xl bg-ink-850 shadow-pop"
    >
      <button className="block w-full text-left" onClick={() => navigate(`/title/${title.slug}`)} aria-label={`More about ${title.title}`}>
        <LandscapeArt title={title} width={500} />
      </button>
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(`/watch/${title.slug}`)} className="grid h-10 w-10 place-items-center rounded-full bg-white text-ink-950 transition hover:bg-white/85" aria-label={`Play ${title.title}`}>
            <Play size={18} className="ml-0.5 fill-current" />
          </button>
          <button onClick={() => list.toggle(title)} className="btn-icon h-10 w-10" aria-label={inList ? 'Remove from My List' : 'Add to My List'} title={inList ? 'Remove from My List' : 'Add to My List'}>
            {inList ? <Check size={18} /> : <Plus size={18} />}
          </button>
          <button onClick={() => navigate(`/title/${title.slug}`)} className="btn-icon ml-auto h-10 w-10" aria-label="More info" title="More info">
            <ChevronDown size={20} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-200">
          {title.isNew && <NewBadge />}
          <RatingBadge rating={title.rating} externalRating={title.externalRating} className="text-[13px]" />
          <MaturityBadge value={title.maturity} />
          <span>{lengthLabel(title)}</span>
          <span className="text-ink-300">{years(title)}</span>
        </div>
        {title.genres.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] font-medium text-white">
            {title.genres.slice(0, 3).map((g, i) => (
              <span key={g} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-ink-400">•</span>}
                {g}
              </span>
            ))}
          </p>
        )}
        <p className="line-clamp-2 text-[13px] leading-relaxed text-ink-300">{title.tagline || title.synopsis}</p>
      </div>
    </motion.div>
  );
}
