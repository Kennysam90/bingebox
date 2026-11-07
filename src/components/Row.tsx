import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../hooks/useToast';
import { api } from '../lib/api';
import { cn } from '../lib/format';
import type { CardTitle, ContinueItem, Row as RowT } from '../lib/types';
import { CARD_W, ContinueCard, PosterCard, Top10Card, TitleCard } from './cards/Cards';

/**
 * A horizontally scrolling row ("carousel"). Native scroll with snap points
 * for touch, plus paged arrow buttons and edge fades on desktop.
 */
export function Row({ row, index = 0 }: { row: RowT; index?: number }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const [pages, setPages] = useState({ count: 1, current: 0 });
  const qc = useQueryClient();
  const toast = useToast();

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft > max - 8 });
    const count = Math.max(1, Math.ceil(el.scrollWidth / el.clientWidth - 0.05));
    setPages({ count, current: Math.min(count - 1, Math.round((el.scrollLeft / Math.max(1, max)) * (count - 1))) });
  }, []);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (scroller.current) ro.observe(scroller.current);
    return () => ro.disconnect();
  }, [measure, row.items.length]);

  const page = (dir: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.92, behavior: 'smooth' });
  };

  const remove = useMutation({
    mutationFn: (item: ContinueItem) => api.del(`/me/continue/${item.id}`),
    onSuccess: (_d, item) => {
      toast.show(`Removed “${item.title}” from Continue Watching`);
      qc.invalidateQueries({ queryKey: ['home'] });
    },
  });

  if (!row.items.length) return null;
  const kind = row.kind ?? 'standard';
  const priority = index < 2;

  return (
    <section className="group/row relative py-3 sm:py-4" aria-labelledby={`row-${row.id}`}>
      <div className="page-x mb-3 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 id={`row-${row.id}`} className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-white sm:text-xl lg:text-[1.4rem]">
            {row.href ? (
              <Link to={row.href} className="group/title inline-flex items-center gap-1.5 hover:text-white">
                {row.title}
                <span className="hidden items-center gap-0.5 text-[13px] font-semibold text-brand-400 opacity-0 transition-all duration-300 group-hover/row:opacity-100 sm:inline-flex">
                  Explore all <ChevronRight size={15} className="transition-transform group-hover/title:translate-x-0.5" />
                </span>
              </Link>
            ) : (
              row.title
            )}
          </h2>
          {row.subtitle && <p className="mt-0.5 truncate text-[13px] text-ink-300">{row.subtitle}</p>}
        </div>
        {pages.count > 1 && (
          <div className="hidden gap-1 opacity-0 transition-opacity group-hover/row:opacity-100 md:flex" aria-hidden="true">
            {Array.from({ length: Math.min(pages.count, 8) }).map((_, i) => (
              <span key={i} className={cn('h-0.5 w-3.5 rounded-full transition-colors', i === pages.current ? 'bg-white' : 'bg-white/25')} />
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        <div
          ref={scroller}
          onScroll={measure}
          className={cn(
            'no-scrollbar page-x flex snap-x snap-mandatory scroll-px-4 overflow-x-auto overscroll-x-contain pb-2 sm:scroll-px-8 lg:scroll-px-12 2xl:scroll-px-16',
            kind === 'top10' ? 'gap-1 sm:gap-2' : 'gap-2.5 sm:gap-3'
          )}
        >
          {kind === 'continue'
            ? (row.items as ContinueItem[]).map((item) => <ContinueCard key={item.id} item={item} onRemove={(i) => remove.mutate(i)} className={CARD_W.landscape} />)
            : kind === 'top10'
              ? (row.items as CardTitle[]).map((t, i) => <Top10Card key={t.id} title={t} rank={i + 1} className={CARD_W.top10} />)
              : kind === 'poster'
                ? (row.items as CardTitle[]).map((t, i) => <PosterCard key={t.id} title={t} className={CARD_W.poster} priority={priority && i < 6} />)
                : (row.items as CardTitle[]).map((t, i) => <TitleCard key={t.id} title={t} className={CARD_W.landscape} priority={priority && i < 5} />)}
        </div>

        <ArrowButton side="left" hidden={edges.start} onClick={() => page(-1)} />
        <ArrowButton side="right" hidden={edges.end} onClick={() => page(1)} />
      </div>
    </section>
  );
}

function ArrowButton({ side, hidden, onClick }: { side: 'left' | 'right'; hidden: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      tabIndex={-1}
      aria-label={side === 'left' ? 'Scroll left' : 'Scroll right'}
      className={cn(
        'absolute bottom-2 top-0 z-10 hidden w-10 items-center justify-center text-white opacity-0 transition-all duration-300 group-hover/row:opacity-100 md:flex lg:w-12',
        side === 'left' ? 'left-0 bg-gradient-to-r from-ink-950/95 to-transparent' : 'right-0 bg-gradient-to-l from-ink-950/95 to-transparent',
        hidden && '!pointer-events-none !opacity-0'
      )}
    >
      <span className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-ink-900/70 backdrop-blur transition hover:scale-110 hover:bg-white/15">
        {side === 'left' ? <ChevronLeft size={22} /> : <ChevronRight size={22} />}
      </span>
    </button>
  );
}
