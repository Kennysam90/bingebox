import { ArrowLeft, ArrowUpRight, Film } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/misc';
import { cn } from '../lib/format';
import { CatalogGrid } from './CatalogGrid';

export default function Nollywood() {
  useDocumentTitle('Nollywood');
  const [params, setParams] = useSearchParams();
  const yoruba = params.get('language') === 'yoruba';
  const select = (language?: string) => {
    const next = new URLSearchParams(params);
    if (language) { next.set('language', language); next.delete('genre'); }
    else next.delete('language');
    setParams(next, { replace: true, preventScrollReset: true });
  };
  return (
    <div>
      <header className="page-x relative isolate overflow-hidden pb-10 pt-[calc(var(--nav-h)+2rem)] sm:pt-[calc(var(--nav-h)+3rem)]">
        <div className="pointer-events-none absolute -right-24 -top-24 -z-10 h-[450px] w-[600px] rounded-full bg-brand-900/15 blur-3xl" />
        <Link to="/genres" className="mb-8 inline-flex items-center gap-2 text-xs text-ink-300 transition hover:text-white"><ArrowLeft size={14} /> Explore BingeBox</Link>
        <p className="eyebrow mb-3 inline-flex items-center gap-2"><Film size={14} /> Nigerian cinema</p>
        <h1 className="font-display text-[clamp(3rem,7vw,6rem)] font-extrabold leading-tight tracking-[-0.045em]">Nollywood<span className="text-brand-500">.</span></h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-ink-200 sm:text-base">Big emotions. Unforgettable characters. Discover Nigerian movies and series, with Yoruba stories right here in the collection.</p>
        <div className="mt-7 flex gap-2" role="group" aria-label="Nollywood collection">
          <button onClick={() => select()} aria-pressed={!yoruba} className={cn('rounded-full border px-5 py-2.5 text-sm font-semibold transition', !yoruba ? 'border-white bg-white text-ink-950' : 'border-white/15 text-ink-200 hover:border-white/40')}>All Nollywood</button>
          <button onClick={() => select('yoruba')} aria-pressed={yoruba} className={cn('inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition', yoruba ? 'border-brand-500 bg-brand-500 text-white' : 'border-white/15 text-ink-200 hover:border-white/40')}>Yoruba <ArrowUpRight size={15} /></button>
        </div>
      </header>
      <CatalogGrid fixed={{ collection: 'nollywood' }} layout="poster" />
    </div>
  );
}
