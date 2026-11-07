import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Captions, Check, ChevronDown, ExternalLink, Film, Play, Plus, RotateCcw, Share2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PosterCard } from '../components/cards/Cards';
import { LandscapeArt, PortraitArt } from '../components/cards/TitleArt';
import { PreviewModal } from '../components/media/PreviewModal';
import { StarRating } from '../components/StarRating';
import { Artwork } from '../components/ui/Artwork';
import { ImdbLink, MaturityBadge, RatingBadge } from '../components/ui/Badges';
import { ErrorState, Skeleton } from '../components/ui/States';
import { useDocumentTitle } from '../hooks/misc';
import { useAuth } from '../hooks/useAuth';
import { useMyList } from '../hooks/useMyList';
import { useToast } from '../hooks/useToast';
import { api, ApiError } from '../lib/api';
import { cn, formatDate, minutesLeft, plural, runtime, timecode, years } from '../lib/format';
import { sized } from '../lib/img';
import type { CardTitle, Episode, Person, TitleDetail, TitleMe } from '../lib/types';
import NotFound from './NotFound';

interface Response {
  title: TitleDetail;
  similar: CardTitle[];
  me: TitleMe | null;
}

export default function TitlePage() {
  const { slug = '' } = useParams();
  const { profile } = useAuth();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['title', slug, profile?.id ?? 'guest'],
    queryFn: () => api.get<Response>(`/titles/${slug}`),
  });
  useDocumentTitle(data?.title.title);

  if (isError && error instanceof ApiError && error.status === 404) return <NotFound message={error.message} />;
  if (isError) return <div className="pt-28"><ErrorState onRetry={() => refetch()} /></div>;
  if (isLoading || !data) return <TitleSkeleton />;
  return <TitleView key={data.title.id} data={data} />;
}

function TitleView({ data }: { data: Response }) {
  const { title: t, similar, me } = data;
  const navigate = useNavigate();
  const list = useMyList();
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [previewOpen, setPreviewOpen] = useState(false);
  const inList = !!user && (list.loaded ? list.has(t.id) : !!me?.inList);

  // Resume state: the most recently watched unfinished item.
  const resume = useMemo(() => {
    if (!me?.progress.length) return null;
    const latest = [...me.progress].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (t.type === 'movie') return latest.completed ? null : { label: 'Resume', fraction: latest.position / latest.duration, left: minutesLeft(latest.position, latest.duration), href: `/watch/${t.slug}` };
    const eps = t.seasons.flatMap((s) => s.episodes.map((e) => ({ ...e, season: s.number })));
    const i = eps.findIndex((e) => e.id === latest.episodeId);
    if (i < 0) return null;
    const target = latest.completed ? eps[i + 1] : eps[i];
    if (!target) return null;
    return {
      label: `${latest.completed ? 'Play' : 'Resume'} S${target.season}:E${target.number}`,
      fraction: latest.completed ? 0 : latest.position / latest.duration,
      left: target.name,
      href: `/watch/${t.slug}?episode=${target.id}`,
    };
  }, [me, t]);

  const rate = useMutation({
    mutationFn: (score: number | null) => (score ? api.put(`/me/ratings/${t.id}`, { score }) : api.del(`/me/ratings/${t.id}`)),
    onSuccess: (_d, score) => {
      toast.success(score ? 'Thanks — your rating helps everyone find great titles.' : 'Rating removed.');
      qc.invalidateQueries({ queryKey: ['title', t.slug] });
    },
    onError: () => toast.error('We couldn’t save your rating.'),
  });

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: t.title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied to clipboard');
      }
    } catch {
      /* user cancelled */
    }
  };

  const directors = t.crew.filter((c) => c.role === 'director');
  const writers = t.crew.filter((c) => c.role === 'writer');
  const hero = t.backdrop ?? t.poster;

  return (
    <article>
      {/* Backdrop */}
      <div className="relative">
        <div className="grain absolute inset-0 h-[88vh] min-h-[560px] overflow-hidden">
          {hero && (
            <img
              src={sized(hero, 1280)}
              alt=""
              referrerPolicy="no-referrer"
              className={cn('h-full w-full object-cover object-[center_20%]', !t.backdrop && 'scale-110 opacity-50 blur-2xl')}
            />
          )}
          <div className="absolute inset-0 bg-hero-left" />
          <div className="absolute inset-0 bg-[linear-gradient(0deg,#050506_0%,rgba(5,5,6,0.9)_25%,rgba(5,5,6,0.2)_65%,rgba(5,5,6,0.6)_100%)]" />
        </div>

        <div className="page-x relative z-10 pt-[calc(var(--nav-h)+12vh)] sm:pt-[calc(var(--nav-h)+18vh)]">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="hidden w-[250px] shrink-0 overflow-hidden rounded-2xl shadow-pop ring-1 ring-white/10 lg:block xl:w-[280px]">
              <PortraitArt title={t} width={330} priority />
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.05 }} className="min-w-0 max-w-3xl">
              <p className="eyebrow mb-3">{t.type === 'series' ? 'Series' : 'Film'}{t.rights.kind === 'cc' ? ' · Open movie' : t.rights.kind === 'public-domain' ? ' · Classic' : ''}</p>
              <h1 className="text-balance font-display text-[clamp(2.3rem,6vw,4.6rem)] font-extrabold leading-[0.98] tracking-[-0.035em] text-shadow">{t.title}</h1>
              {t.tagline && <p className="mt-3 text-lg italic text-ink-100/90">{t.tagline}</p>}

              <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[15px] font-medium text-ink-100">
                {t.rating || t.externalRating ? <RatingBadge rating={t.rating} externalRating={t.externalRating} showCount /> : <span className="text-sm text-ink-300">No member ratings yet</span>}
                <ImdbLink id={t.imdbId} />
                <span>{years(t)}</span>
                <MaturityBadge value={t.maturity} />
                <span>{t.type === 'series' ? plural(t.seasons.reduce((n, s) => n + s.episodes.length, 0), 'episode') : runtime(t.runtimeMin)}</span>
                {t.qualities.some((q) => /720|1080|Auto/.test(q)) && <span className="rounded-[5px] border border-white/30 px-1.5 text-[11px] font-bold leading-[1.3rem]">HD</span>}
                {t.subtitleLanguages.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-sm text-ink-200" title={`Subtitles: ${t.subtitleLanguages.join(', ')}`}>
                    <Captions size={17} /> CC
                  </span>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {t.genres.map((g) => (
                  <Link key={g.slug} to={`/genre/${g.slug}`} className="chip transition hover:border-white/30 hover:text-white">
                    {g.name}
                  </Link>
                ))}
              </div>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <button onClick={() => navigate(resume?.href ?? `/watch/${t.slug}`)} className="btn btn-primary btn-lg">
                  <Play size={20} className="fill-current" /> {resume?.label ?? 'Watch Now'}
                </button>
                <button onClick={() => setPreviewOpen(true)} className="btn btn-glass btn-lg">
                  <Film size={19} /> {t.trailer ? 'Trailer' : 'Preview'}
                </button>
                <button onClick={() => list.toggle(t)} className="btn-icon h-12 w-12 sm:h-[52px] sm:w-[52px]" aria-label={inList ? 'Remove from My List' : 'Add to My List'} title={inList ? 'In My List' : 'Add to My List'}>
                  {inList ? <Check size={22} /> : <Plus size={22} />}
                </button>
                <button onClick={share} className="btn-icon h-12 w-12 sm:h-[52px] sm:w-[52px]" aria-label="Share" title="Share">
                  <Share2 size={19} />
                </button>
              </div>

              {resume && (
                <div className="mt-5 max-w-sm">
                  <div className="h-1 overflow-hidden rounded-full bg-white/15">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(2, resume.fraction * 100)}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs text-ink-300">{resume.left}</p>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="page-x relative z-10 mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_340px] xl:gap-16">
        <div className="min-w-0 space-y-12">
          <section>
            <h2 className="mb-3 font-display text-xl font-bold">Synopsis</h2>
            <p className="max-w-3xl text-[15px] leading-[1.75] text-ink-100 sm:text-base">{t.synopsis}</p>
            {t.about && <AboutBlock text={t.about} />}
          </section>

          {t.type === 'series' && t.seasons.length > 0 && <Episodes title={t} progress={me?.progress ?? []} />}

          {(t.cast.length > 0 || t.crew.length > 0) && <CastCrew cast={t.cast} crew={t.crew} />}
        </div>

        <aside className="space-y-6">
          <div className="card-surface p-6">
            <h2 className="mb-4 font-display text-base font-bold">Details</h2>
            <dl className="space-y-3.5 text-sm">
              <Detail label={t.type === 'series' ? 'Years' : 'Release date'} value={t.type === 'series' ? years(t) : formatDate(t.releaseDate)} />
              <Detail label={t.type === 'series' ? 'Episode length' : 'Duration'} value={t.type === 'series' ? `~${runtime(t.runtimeMin)}` : runtime(t.runtimeMin)} />
              {directors.length > 0 && <Detail label={plural(directors.length, 'Director').replace(/^\d+ /, '')} value={<PeopleLinks people={directors} />} />}
              {writers.length > 0 && <Detail label="Writers" value={<PeopleLinks people={writers.slice(0, 4)} />} />}
              <Detail label="Country" value={t.country} />
              <Detail label="Language" value={t.language} />
              <Detail label="Subtitles" value={t.subtitleLanguages.join(', ')} />
              <Detail label="Video quality" value={t.qualities.join(' · ')} />
            </dl>
          </div>

          {user && (
            <div className="card-surface p-6">
              <h2 className="font-display text-base font-bold">Your rating</h2>
              <p className="mb-3 mt-1 text-xs text-ink-300">Ratings power the BingeBox score and your recommendations.</p>
              <StarRating value={me?.myRating ?? null} onChange={(s) => rate.mutate(s)} disabled={rate.isPending} />
            </div>
          )}

          <div className="card-surface p-6 text-sm">
            <h2 className="mb-3 font-display text-base font-bold">Licensing</h2>
            <p className="text-ink-200">{t.rights.license ?? (t.rights.kind === 'provider' ? 'Available through AnimeDoc' : 'Licensed content')}</p>
            {t.rights.attribution && <p className="mt-1 text-ink-300">{t.rights.attribution}</p>}
            <div className="mt-3 flex flex-col gap-1.5 text-xs">
              {t.rights.sourceUrl && <ExtLink href={t.rights.sourceUrl}>Streaming source</ExtLink>}
              {t.synopsisSource && <ExtLink href={t.synopsisSource.url}>Synopsis: {t.synopsisSource.name} ({t.synopsisSource.license})</ExtLink>}
              {t.wikidataId && <ExtLink href={`https://www.wikidata.org/wiki/${t.wikidataId}`}>Metadata: Wikidata</ExtLink>}
            </div>
          </div>
        </aside>
      </div>

      {similar.length > 0 && (
        <section className="page-x mt-16">
          <h2 className="mb-5 font-display text-xl font-bold sm:text-2xl">More Like This</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {similar.slice(0, 12).map((s) => (
              <PosterCard key={s.id} title={s} className="w-full" />
            ))}
          </div>
        </section>
      )}

      <PreviewModal slug={t.slug} title={t.title} open={previewOpen} onClose={() => setPreviewOpen(false)} />
    </article>
  );
}

function AboutBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-5 max-w-3xl">
      <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 text-sm font-semibold text-ink-200 hover:text-white" aria-expanded={open}>
        About this title <ChevronDown size={16} className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      {open && <p className="mt-2 animate-fade-in text-sm leading-relaxed text-ink-300">{text}</p>}
    </div>
  );
}

function Episodes({ title, progress }: { title: TitleDetail; progress: TitleMe['progress'] }) {
  const navigate = useNavigate();
  const [seasonId, setSeasonId] = useState(() => {
    const latest = [...progress].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    return title.seasons.find((s) => s.episodes.some((e) => e.id === latest?.episodeId))?.id ?? title.seasons[0].id;
  });
  const season = title.seasons.find((s) => s.id === seasonId) ?? title.seasons[0];
  const prog = new Map(progress.map((p) => [p.episodeId, p]));

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">Episodes</h2>
        {title.seasons.length > 1 ? (
          <label className="relative">
            <span className="sr-only">Season</span>
            <select value={seasonId} onChange={(e) => setSeasonId(Number(e.target.value))} className="h-10 appearance-none rounded-xl border border-white/15 bg-ink-850 pl-4 pr-10 text-sm font-semibold focus:outline-none">
              {title.seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.episodes.length})
                </option>
              ))}
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-300" />
          </label>
        ) : (
          <span className="text-sm text-ink-300">{season.name} · {plural(season.episodes.length, 'episode')}</span>
        )}
      </div>
      <ol className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-900/60">
        {season.episodes.map((e) => (
          <EpisodeRow key={e.id} episode={e} title={title} progress={prog.get(e.id)} onPlay={() => navigate(`/watch/${title.slug}?episode=${e.id}`)} />
        ))}
      </ol>
    </section>
  );
}

function EpisodeRow({ episode: e, title, progress, onPlay }: { episode: Episode; title: TitleDetail; progress?: TitleMe['progress'][number]; onPlay: () => void }) {
  const fraction = progress ? (progress.completed ? 1 : progress.position / progress.duration) : 0;
  return (
    <li>
      <button onClick={onPlay} className="group flex w-full items-start gap-4 p-3 text-left transition hover:bg-white/[0.03] sm:items-center sm:p-4">
        <span className="hidden w-6 shrink-0 text-center font-display text-lg font-bold text-ink-300 sm:block">{e.number}</span>
        <div className="relative w-36 shrink-0 overflow-hidden rounded-lg sm:w-44">
          {e.still ? (
            <Artwork src={e.still} alt="" width={330} className="aspect-video" fallbackTitle={e.name} />
          ) : (
            <LandscapeArt title={title} width={330} showTitle={false} />
          )}
          <span className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition group-hover:opacity-100">
            <span className="grid h-10 w-10 place-items-center rounded-full border-2 border-white bg-black/40">
              <Play size={16} className="ml-0.5 fill-white" />
            </span>
          </span>
          {fraction > 0 && (
            <span className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
              <span className="block h-full bg-brand-500" style={{ width: `${fraction * 100}%` }} />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="line-clamp-2 text-[15px] font-semibold">
              <span className="text-ink-300 sm:hidden">{e.number}. </span>
              {e.name}
            </p>
            {e.runtimeSec ? <span className="shrink-0 text-xs text-ink-300">{Math.round(e.runtimeSec / 60)}m</span> : null}
          </div>
          {e.synopsis && <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-300">{e.synopsis}</p>}
          {progress && !progress.completed && <p className="mt-1 text-xs text-brand-300">Resume from {timecode(progress.position)}</p>}
          {progress?.completed ? (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-ink-300">
              <RotateCcw size={12} /> Watched
            </p>
          ) : null}
        </div>
      </button>
    </li>
  );
}

function CastCrew({ cast, crew }: { cast: Person[]; crew: Person[] }) {
  const people = [...cast, ...crew.filter((c) => c.role !== 'director' && c.role !== 'writer'), ...crew.filter((c) => c.role === 'director' || c.role === 'writer')];
  const seen = new Set<string>();
  const unique = people.filter((p) => {
    const k = `${p.id}-${p.role}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return (
    <section>
      <h2 className="mb-4 font-display text-xl font-bold">Cast & Crew</h2>
      <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {unique.slice(0, 24).map((p) => (
          <Link key={`${p.id}-${p.role}`} to={`/person/${p.id}`} className="group w-[104px] shrink-0 text-center">
            <div className="mx-auto h-[88px] w-[88px] overflow-hidden rounded-full bg-ink-800 ring-1 ring-white/10 transition group-hover:ring-2 group-hover:ring-brand-500">
              {p.photo ? (
                <Artwork src={p.photo} alt={p.name} width={250} className="h-full w-full" imgClassName="object-[center_20%]" />
              ) : (
                <div className="grid h-full w-full place-items-center bg-gradient-to-br from-ink-700 to-ink-800 font-display text-xl font-bold text-ink-200">
                  {p.name
                    .split(/\s+/)
                    .map((s) => s[0])
                    .slice(0, 2)
                    .join('')}
                </div>
              )}
            </div>
            <p className="mt-2 line-clamp-2 text-[13px] font-semibold leading-tight group-hover:text-white">{p.name}</p>
            <p className="mt-0.5 line-clamp-1 text-xs capitalize text-ink-300">{p.character ?? p.role}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3">
      <dt className="text-ink-300">{label}</dt>
      <dd className="text-ink-100">{value}</dd>
    </div>
  );
}

function PeopleLinks({ people }: { people: Person[] }) {
  return (
    <span>
      {people.map((p, i) => (
        <span key={p.id}>
          {i > 0 && ', '}
          <Link to={`/person/${p.id}`} className="hover:text-white hover:underline">
            {p.name}
          </Link>
        </span>
      ))}
    </span>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-ink-300 transition hover:text-white">
      {children} <ExternalLink size={11} />
    </a>
  );
}

function TitleSkeleton() {
  return (
    <div className="page-x pt-[calc(var(--nav-h)+20vh)]">
      <div className="flex gap-8">
        <Skeleton className="hidden aspect-[2/3] w-[260px] rounded-2xl lg:block" />
        <div className="flex-1 space-y-4 pt-24">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-14 w-[min(520px,90%)]" />
          <Skeleton className="h-5 w-72" />
          <div className="flex gap-3 pt-4">
            <Skeleton className="h-12 w-40 rounded-full" />
            <Skeleton className="h-12 w-32 rounded-full" />
          </div>
        </div>
      </div>
      <div className="mt-14 space-y-3">
        <Skeleton className="h-4 w-full max-w-3xl" />
        <Skeleton className="h-4 w-full max-w-2xl" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
    </div>
  );
}
