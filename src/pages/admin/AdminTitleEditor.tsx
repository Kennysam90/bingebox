import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, ExternalLink, GripVertical, ImageUp, Info, Loader2, Play, Plus, Save, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { Artwork } from '../../components/ui/Artwork';
import { FormError } from '../../components/ui/Form';
import { ErrorState, FullPageLoader } from '../../components/ui/States';
import { useDocumentTitle } from '../../hooks/misc';
import { useToast } from '../../hooks/useToast';
import { api, ApiError } from '../../lib/api';
import { cn } from '../../lib/format';
import type { Genre } from '../../lib/types';
import { uploadImage, uploadSubtitle } from '../../lib/upload';

// ---------------------------------------------------------------------------
// Types mirroring the admin API payload
// ---------------------------------------------------------------------------
interface Source {
  url: string;
  kind: 'mp4' | 'hls';
  quality: string;
  primary: boolean;
}
interface Subtitle {
  lang: string;
  label: string;
  url: string;
}
interface Credit {
  name: string;
  role: 'director' | 'writer' | 'producer' | 'composer' | 'cinematographer' | 'cast';
  character?: string | null;
  photoUrl?: string | null;
}
interface EpisodeForm {
  id?: number;
  number: number;
  name: string;
  synopsis?: string | null;
  runtimeSec?: number | null;
  stillUrl?: string | null;
  sources: Source[];
  subtitles: Subtitle[];
}
interface SeasonForm {
  id?: number;
  number: number;
  name: string;
  episodes: EpisodeForm[];
}
interface TitleForm {
  id?: number;
  type: 'movie' | 'series';
  title: string;
  slug: string;
  tagline: string;
  synopsis: string;
  releaseDate: string;
  year: number | null;
  endYear: number | null;
  runtimeMin: number | null;
  maturity: string;
  posterUrl: string;
  backdropUrl: string;
  thumbnailUrl: string;
  trailerUrl: string;
  imdbId: string;
  country: string;
  language: string;
  featured: boolean;
  status: 'published' | 'draft';
  rightsKind: 'licensed' | 'public-domain' | 'cc' | 'provider';
  rightsLicense: string;
  rightsAttribution: string;
  rightsSourceUrl: string;
  genres: string[];
  credits: Credit[];
  sources: Source[];
  subtitles: Subtitle[];
  seasons: SeasonForm[];
}

const EMPTY: TitleForm = {
  type: 'movie',
  title: '',
  slug: '',
  tagline: '',
  synopsis: '',
  releaseDate: '',
  year: null,
  endYear: null,
  runtimeMin: null,
  maturity: 'NR',
  posterUrl: '',
  backdropUrl: '',
  thumbnailUrl: '',
  trailerUrl: '',
  imdbId: '',
  country: '',
  language: '',
  featured: false,
  status: 'draft',
  rightsKind: 'licensed',
  rightsLicense: '',
  rightsAttribution: '',
  rightsSourceUrl: '',
  genres: [],
  credits: [],
  sources: [],
  subtitles: [],
  seasons: [],
};

const SECTIONS = [
  { id: 'details', label: 'Details' },
  { id: 'artwork', label: 'Artwork' },
  { id: 'categories', label: 'Categories' },
  { id: 'media', label: 'Video & subtitles' },
  { id: 'episodes', label: 'Seasons & episodes', series: true },
  { id: 'credits', label: 'Cast & crew' },
  { id: 'rights', label: 'Rights & licensing' },
];
const ROLES: Credit['role'][] = ['cast', 'director', 'writer', 'producer', 'composer', 'cinematographer'];
const QUALITIES = ['Auto', '2160p', '1080p', '720p', '480p', '360p', '240p'];

export default function AdminTitleEditor() {
  const { id } = useParams();
  const isNew = !id;
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'title', id],
    queryFn: () => api.get<{ title: TitleForm }>(`/admin/titles/${id}`),
    enabled: !isNew,
    staleTime: 0,
  });
  if (!isNew && isLoading) return <FullPageLoader />;
  if (!isNew && (isError || !data)) return <ErrorState onRetry={() => refetch()} />;
  return <Editor key={id ?? 'new'} initial={data?.title ?? EMPTY} />;
}

function Editor({ initial }: { initial: TitleForm }) {
  const [form, setForm] = useState<TitleForm>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  useDocumentTitle(form.id ? `Edit ${initial.title}` : 'New title');
  const dirty = JSON.stringify(form) !== saved;

  const genres = useQuery({ queryKey: ['admin', 'genres'], queryFn: () => api.get<{ genres: Genre[] }>('/admin/genres') });
  const policy = useQuery({ queryKey: ['admin', 'policy'], queryFn: () => api.get<{ authorisedHosts: string[] }>('/admin/sources/policy'), staleTime: Infinity });

  const set = <K extends keyof TitleForm>(key: K, value: TitleForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  // Warn before losing unsaved edits (tab close and in-app navigation).
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (confirm('You have unsaved changes. Leave without saving?')) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker]);

  const save = useMutation({
    mutationFn: (body: TitleForm) => (body.id ? api.put<{ title: TitleForm }>(`/admin/titles/${body.id}`, body) : api.post<{ title: TitleForm }>('/admin/titles', body)),
    onSuccess: (res) => {
      setForm(res.title);
      setSaved(JSON.stringify(res.title));
      setError(null);
      qc.invalidateQueries({ queryKey: ['admin'] });
      qc.invalidateQueries({ queryKey: ['home'] });
      toast.success(form.id ? 'Changes saved' : 'Title created');
      if (!form.id) navigate(`/admin/titles/${res.title.id}`, { replace: true });
    },
    onError: (e) => {
      setError(e instanceof ApiError ? e.message : 'Couldn’t save this title.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
  });

  const submit = (status?: 'published' | 'draft') => {
    const body = { ...form, status: status ?? form.status, slug: form.slug.trim() };
    if (status) setForm(body);
    save.mutate(body);
  };

  const sections = SECTIONS.filter((s) => !s.series || form.type === 'series');

  return (
    <div className="pb-28">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link to="/admin/titles" className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 hover:bg-white/5" aria-label="Back to titles">
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-2xl font-bold tracking-tight">{form.id ? form.title || 'Untitled' : 'Add a new title'}</h1>
          <p className="text-sm text-ink-400">
            {form.id ? (
              <>
                {form.status === 'published' ? 'Published' : 'Draft'} ·{' '}
                <Link to={`/title/${form.slug}`} target="_blank" className="inline-flex items-center gap-1 hover:text-white">
                  /title/{form.slug} <ExternalLink size={11} />
                </Link>
              </>
            ) : (
              'Fill in the details, add an authorised stream, then publish.'
            )}
          </p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
        <nav className="sticky top-6 hidden h-fit space-y-1 lg:block" aria-label="Editor sections">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="block rounded-lg px-3 py-2 text-sm text-ink-300 hover:bg-white/[0.04] hover:text-white">
              {s.label}
            </a>
          ))}
        </nav>

        <div className="min-w-0 space-y-6">
          <FormError message={error} />

          <Section id="details" title="Details">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <span className="label">Type</span>
                <div className="flex gap-2">
                  {(['movie', 'series'] as const).map((t) => (
                    <button key={t} type="button" onClick={() => set('type', t)} className={cn('rounded-xl border px-4 py-2 text-sm font-semibold transition', form.type === t ? 'border-brand-500 bg-brand-500/10 text-white' : 'border-white/10 text-ink-300 hover:border-white/25')}>
                      {t === 'movie' ? 'Movie' : 'Series'}
                    </button>
                  ))}
                </div>
              </div>
              <Input label="Title" value={form.title} onChange={(v) => set('title', v)} required className="sm:col-span-2" />
              <Input label="URL slug" value={form.slug} onChange={(v) => set('slug', v.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} hint="Leave blank to generate from the title." />
              <Input label="Tagline" value={form.tagline} onChange={(v) => set('tagline', v)} />
              <TextArea label="Synopsis" value={form.synopsis} onChange={(v) => set('synopsis', v)} className="sm:col-span-2" rows={5} hint={`${form.synopsis.length} / 5000 characters`} />
              <Input label="Release date" type="date" value={form.releaseDate.length === 10 ? form.releaseDate : ''} onChange={(v) => set('releaseDate', v)} />
              <NumberInput label="Year" value={form.year} onChange={(v) => set('year', v)} />
              {form.type === 'series' && <NumberInput label="End year" value={form.endYear} onChange={(v) => set('endYear', v)} hint="Blank if still running." />}
              <NumberInput label={form.type === 'series' ? 'Typical episode length (min)' : 'Runtime (minutes)'} value={form.runtimeMin} onChange={(v) => set('runtimeMin', v)} />
              <SelectInput label="Maturity rating" value={form.maturity} onChange={(v) => set('maturity', v)} options={['ALL', '7+', '13+', '16+', '18+', 'NR'].map((m) => [m, m === 'NR' ? 'NR · Not rated' : m])} />
              <Input label="IMDb ID" value={form.imdbId} onChange={(v) => set('imdbId', v.trim())} placeholder="tt0017136" />
              <Input label="Country" value={form.country} onChange={(v) => set('country', v)} />
              <Input label="Language" value={form.language} onChange={(v) => set('language', v)} />
            </div>
          </Section>

          <Section id="artwork" title="Artwork" description="Images are resized and converted to WebP in your browser before upload.">
            <div className="grid gap-5 md:grid-cols-[180px_1fr]">
              <ImageField label="Poster (2:3)" value={form.posterUrl} onChange={(v) => set('posterUrl', v)} aspect="aspect-[2/3]" maxWidth={1000} />
              <div className="space-y-5">
                <ImageField label="Backdrop (16:9)" value={form.backdropUrl} onChange={(v) => set('backdropUrl', v)} aspect="aspect-video" maxWidth={1920} />
                <ImageField label="Thumbnail (optional, 16:9)" value={form.thumbnailUrl} onChange={(v) => set('thumbnailUrl', v)} aspect="aspect-video" maxWidth={960} compact />
              </div>
            </div>
          </Section>

          <Section id="categories" title="Categories">
            <div className="flex flex-wrap gap-2">
              {(genres.data?.genres ?? []).map((g) => {
                const on = form.genres.includes(g.slug);
                return (
                  <button
                    key={g.slug}
                    type="button"
                    onClick={() => set('genres', on ? form.genres.filter((x) => x !== g.slug) : [...form.genres, g.slug])}
                    className={cn('rounded-full border px-3.5 py-1.5 text-sm font-medium transition', on ? 'border-brand-500 bg-brand-500/15 text-white' : 'border-white/10 text-ink-300 hover:border-white/30 hover:text-white')}
                    aria-pressed={on}
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
            <Link to="/admin/genres" className="mt-3 inline-block text-xs text-ink-400 hover:text-white">
              Manage categories →
            </Link>
          </Section>

          <Section id="media" title="Video & subtitles">
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4 text-sm">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-400" />
              <div className="text-ink-200">
                Only streams from <span className="font-semibold text-white">authorised sources</span> can be saved:{' '}
                <span className="text-ink-300">{policy.data?.authorisedHosts.join(', ')}</span>. Add licensed CDNs with the <code className="text-ink-100">AUTHORISED_VIDEO_HOSTS</code> server setting.
              </div>
            </div>
            {form.type === 'movie' ? (
              <>
                <SourcesEditor sources={form.sources} onChange={(v) => set('sources', v)} />
                <div className="mt-6">
                  <SubtitlesEditor subtitles={form.subtitles} onChange={(v) => set('subtitles', v)} />
                </div>
              </>
            ) : (
              <p className="text-sm text-ink-300">For series, add streams and subtitles to each episode in Seasons & episodes below.</p>
            )}
            <div className="mt-6">
              <Input label="Trailer URL (optional)" value={form.trailerUrl} onChange={(v) => set('trailerUrl', v.trim())} placeholder="https://… (.mp4 or .m3u8)" hint="Without a trailer, members see a short preview clip from the title, labelled “Preview”." />
            </div>
          </Section>

          {form.type === 'series' && (
            <Section id="episodes" title="Seasons & episodes">
              <SeasonsEditor seasons={form.seasons} onChange={(v) => set('seasons', v)} />
            </Section>
          )}

          <Section id="credits" title="Cast & crew">
            <CreditsEditor credits={form.credits} onChange={(v) => set('credits', v)} />
          </Section>

          <Section id="rights" title="Rights & licensing" description="Shown on the title page. Keep a record of how BingeBox is authorised to stream this title.">
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectInput
                label="Rights basis"
                value={form.rightsKind}
                onChange={(v) => set('rightsKind', v as TitleForm['rightsKind'])}
                options={[
                  ['licensed', 'Licensed from rights holder'],
                  ['provider', 'Connected streaming provider'],
                  ['public-domain', 'Public domain'],
                  ['cc', 'Creative Commons'],
                ]}
              />
              <Input label="Licence" value={form.rightsLicense} onChange={(v) => set('rightsLicense', v)} placeholder="e.g. CC BY 4.0, or contract reference" />
              <Input label="Attribution" value={form.rightsAttribution} onChange={(v) => set('rightsAttribution', v)} placeholder="e.g. © Blender Foundation" />
              <Input label="Source URL" value={form.rightsSourceUrl} onChange={(v) => set('rightsSourceUrl', v.trim())} placeholder="https://…" />
            </div>
          </Section>
        </div>
      </div>

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-ink-900/95 backdrop-blur-xl lg:left-[248px]">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-3 sm:px-8">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-200">
            <input type="checkbox" checked={form.featured} onChange={(e) => set('featured', e.target.checked)} className="h-4 w-4 accent-brand-500" />
            Feature on home
          </label>
          <span className={cn('text-xs', dirty ? 'text-amber-300' : 'text-ink-400')}>{dirty ? '● Unsaved changes' : form.id ? 'All changes saved' : ''}</span>
          <div className="ml-auto flex gap-2">
            {form.status === 'published' && form.id ? (
              <>
                <button onClick={() => submit('draft')} disabled={save.isPending} className="btn btn-glass btn-sm">
                  Unpublish
                </button>
                <button onClick={() => submit()} disabled={save.isPending || !dirty} className="btn btn-primary btn-sm">
                  {save.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save changes
                </button>
              </>
            ) : (
              <>
                <button onClick={() => submit('draft')} disabled={save.isPending} className="btn btn-glass btn-sm">
                  Save draft
                </button>
                <button onClick={() => submit('published')} disabled={save.isPending} className="btn btn-primary btn-sm">
                  {save.isPending ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Publish
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card-surface scroll-mt-6 p-5 sm:p-6">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      {description && <p className="mt-1 text-sm text-ink-400">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Input({ label, value, onChange, hint, className, ...rest }: { label: string; value: string; onChange: (v: string) => void; hint?: string; className?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>) {
  return (
    <label className={cn('block', className)}>
      <span className="label">{label}</span>
      <input className="input h-11 text-sm" value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
      {hint && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
    </label>
  );
}

function NumberInput({ label, value, onChange, hint }: { label: string; value: number | null; onChange: (v: number | null) => void; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input h-11 text-sm" inputMode="numeric" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value.replace(/\D/g, '')) || null)} />
      {hint && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
    </label>
  );
}

function TextArea({ label, value, onChange, rows = 4, hint, className }: { label: string; value: string; onChange: (v: string) => void; rows?: number; hint?: string; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="label">{label}</span>
      <textarea className="input h-auto py-3 text-sm leading-relaxed" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
    </label>
  );
}

function SelectInput({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select className="input h-11 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function ImageField({ label, value, onChange, aspect, maxWidth, compact }: { label: string; value: string; onChange: (v: string) => void; aspect: string; maxWidth: number; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await uploadImage(file, maxWidth));
      toast.success('Image uploaded');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <span className="label">{label}</span>
      <div
        className={cn('group relative overflow-hidden rounded-xl border border-dashed border-white/15 bg-ink-850', aspect, compact && 'max-w-xs')}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files[0]);
        }}
      >
        {value ? <Artwork src={value} alt="" width={640} className="absolute inset-0" /> : <div className="absolute inset-0 grid place-items-center text-center text-xs text-ink-400"><span><ImageUp size={22} className="mx-auto mb-1.5" />Drop an image or click to upload</span></div>}
        <button type="button" onClick={() => input.current?.click()} className="absolute inset-0 grid place-items-center bg-black/0 text-sm font-semibold opacity-0 transition hover:bg-black/50 hover:opacity-100" aria-label={`Upload ${label}`}>
          {busy ? <Loader2 className="animate-spin" /> : value ? 'Replace image' : ''}
        </button>
        {busy && <div className="absolute inset-0 grid place-items-center bg-black/60"><Loader2 className="animate-spin" /></div>}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      <input className="input mt-2 h-9 text-xs" placeholder="…or paste an image URL" value={value} onChange={(e) => onChange(e.target.value.trim())} />
    </div>
  );
}

const detectKind = (url: string): Source['kind'] => (/\.m3u8(\?|$)/i.test(url) ? 'hls' : 'mp4');

function SourcesEditor({ sources, onChange, compact }: { sources: Source[]; onChange: (v: Source[]) => void; compact?: boolean }) {
  const [testing, setTesting] = useState<Source | null>(null);
  const update = (i: number, patch: Partial<Source>) => onChange(sources.map((s, j) => (j === i ? { ...s, ...patch } : patch.primary ? { ...s, primary: false } : s)));
  return (
    <div>
      {!compact && <p className="label">Video sources</p>}
      <div className="space-y-2">
        {sources.map((s, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-ink-900/60 p-2">
            <input className="input h-10 min-w-[220px] flex-1 text-sm" placeholder="https://… .mp4 or .m3u8" value={s.url} onChange={(e) => update(i, { url: e.target.value.trim(), kind: detectKind(e.target.value) })} aria-label="Stream URL" />
            <select className="input h-10 w-24 text-sm" value={s.kind} onChange={(e) => update(i, { kind: e.target.value as Source['kind'] })} aria-label="Format">
              <option value="mp4">MP4</option>
              <option value="hls">HLS</option>
            </select>
            <select className="input h-10 w-28 text-sm" value={s.quality} onChange={(e) => update(i, { quality: e.target.value })} aria-label="Quality">
              {QUALITIES.map((q) => (
                <option key={q}>{q}</option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 px-1 text-xs text-ink-300">
              <input type="radio" checked={s.primary} onChange={() => update(i, { primary: true })} className="accent-brand-500" /> Default
            </label>
            <button type="button" onClick={() => setTesting(s)} disabled={!s.url} className="grid h-9 w-9 place-items-center rounded-lg text-ink-300 hover:bg-white/10 hover:text-white disabled:opacity-30" title="Test playback" aria-label="Test playback">
              <Play size={15} />
            </button>
            <button type="button" onClick={() => onChange(sources.filter((_, j) => j !== i))} className="grid h-9 w-9 place-items-center rounded-lg text-ink-300 hover:bg-white/10 hover:text-brand-300" aria-label="Remove source">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange([...sources, { url: '', kind: 'mp4', quality: 'Auto', primary: sources.length === 0 }])} className="btn btn-glass btn-sm mt-3">
        <Plus size={15} /> Add {sources.length ? 'another quality' : 'video source'}
      </button>
      {testing && <SourceTester source={testing} onClose={() => setTesting(null)} />}
    </div>
  );
}

function SourceTester({ source, onClose }: { source: Source; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  useEffect(() => {
    const el = video.current!;
    let destroy: (() => void) | undefined;
    if (source.kind === 'hls' && !el.canPlayType('application/vnd.apple.mpegurl')) {
      import('hls.js').then(({ default: Hls }) => {
        const hls = new Hls();
        hls.loadSource(source.url);
        hls.attachMedia(el);
        hls.on(Hls.Events.ERROR, (_e, d) => d.fatal && setStatus('error'));
        destroy = () => hls.destroy();
      });
    } else el.src = source.url;
    return () => destroy?.();
  }, [source]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-black" onClick={(e) => e.stopPropagation()}>
        <video ref={video} controls autoPlay muted className="aspect-video w-full" onLoadedMetadata={() => setStatus('ok')} onError={() => setStatus('error')} />
        <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
          <span className={cn(status === 'ok' ? 'text-emerald-300' : status === 'error' ? 'text-brand-300' : 'text-ink-300')}>
            {status === 'ok' ? '✓ Stream is playable' : status === 'error' ? '✕ This stream could not be played' : 'Checking stream…'}
          </span>
          <button onClick={onClose} className="btn btn-glass btn-sm">
            <X size={15} /> Close
          </button>
        </div>
      </div>
    </div>
  );
}

function SubtitlesEditor({ subtitles, onChange }: { subtitles: Subtitle[]; onChange: (v: Subtitle[]) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const update = (i: number, patch: Partial<Subtitle>) => onChange(subtitles.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const upload = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      const url = await uploadSubtitle(f);
      onChange([...subtitles, { lang: 'en', label: 'English', url }]);
      toast.success('Subtitles uploaded (converted to WebVTT)');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <p className="label">Subtitles</p>
      <div className="space-y-2">
        {subtitles.map((s, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-ink-900/60 p-2">
            <input className="input h-10 w-20 text-sm" value={s.lang} onChange={(e) => update(i, { lang: e.target.value.trim().toLowerCase() })} placeholder="en" aria-label="Language code" />
            <input className="input h-10 w-36 text-sm" value={s.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="English" aria-label="Label" />
            <input className="input h-10 min-w-[200px] flex-1 text-sm" value={s.url} onChange={(e) => update(i, { url: e.target.value.trim() })} placeholder="https://… .vtt or .srt" aria-label="Subtitle URL" />
            <button type="button" onClick={() => onChange(subtitles.filter((_, j) => j !== i))} className="grid h-9 w-9 place-items-center rounded-lg text-ink-300 hover:bg-white/10 hover:text-brand-300" aria-label="Remove subtitle">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => file.current?.click()} disabled={busy} className="btn btn-glass btn-sm">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Upload .srt / .vtt
        </button>
        <button type="button" onClick={() => onChange([...subtitles, { lang: 'en', label: 'English', url: '' }])} className="btn btn-ghost btn-sm">
          <Plus size={15} /> Add by URL
        </button>
      </div>
      <input ref={file} type="file" accept=".srt,.vtt" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
    </div>
  );
}

function CreditsEditor({ credits, onChange }: { credits: Credit[]; onChange: (v: Credit[]) => void }) {
  const update = (i: number, patch: Partial<Credit>) => onChange(credits.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= credits.length) return;
    const next = [...credits];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div>
      <div className="space-y-2">
        {credits.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-ink-900/60 p-2">
            <div className="flex flex-col">
              <button type="button" onClick={() => move(i, -1)} className="text-ink-400 hover:text-white" aria-label="Move up">
                <ChevronDown size={14} className="rotate-180" />
              </button>
              <button type="button" onClick={() => move(i, 1)} className="text-ink-400 hover:text-white" aria-label="Move down">
                <ChevronDown size={14} />
              </button>
            </div>
            <GripVertical size={14} className="text-ink-500" />
            <input className="input h-10 min-w-[160px] flex-1 text-sm" value={c.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Name" aria-label="Name" />
            <select className="input h-10 w-40 text-sm capitalize" value={c.role} onChange={(e) => update(i, { role: e.target.value as Credit['role'] })} aria-label="Role">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {c.role === 'cast' && <input className="input h-10 w-44 text-sm" value={c.character ?? ''} onChange={(e) => update(i, { character: e.target.value })} placeholder="Character" aria-label="Character" />}
            <button type="button" onClick={() => onChange(credits.filter((_, j) => j !== i))} className="grid h-9 w-9 place-items-center rounded-lg text-ink-300 hover:bg-white/10 hover:text-brand-300" aria-label="Remove person">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange([...credits, { name: '', role: 'cast', character: '' }])} className="btn btn-glass btn-sm mt-3">
        <Plus size={15} /> Add person
      </button>
    </div>
  );
}

function SeasonsEditor({ seasons, onChange }: { seasons: SeasonForm[]; onChange: (v: SeasonForm[]) => void }) {
  const [open, setOpen] = useState<number | null>(seasons.length ? 0 : null);
  const updateSeason = (i: number, patch: Partial<SeasonForm>) => onChange(seasons.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const addSeason = () => {
    const number = Math.max(0, ...seasons.map((s) => s.number)) + 1;
    onChange([...seasons, { number, name: `Season ${number}`, episodes: [] }]);
    setOpen(seasons.length);
  };
  return (
    <div className="space-y-3">
      {seasons.map((s, i) => (
        <div key={s.id ?? `new-${i}`} className="overflow-hidden rounded-xl border border-white/[0.08]">
          <div className="flex flex-wrap items-center gap-2 bg-ink-850 p-3">
            <button type="button" onClick={() => setOpen(open === i ? null : i)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10" aria-label={open === i ? 'Collapse' : 'Expand'}>
              <ChevronDown size={17} className={cn('transition-transform', open === i && 'rotate-180')} />
            </button>
            <input className="input h-9 w-20 text-sm" inputMode="numeric" value={s.number} onChange={(e) => updateSeason(i, { number: Number(e.target.value.replace(/\D/g, '')) || 0 })} aria-label="Season number" />
            <input className="input h-9 min-w-[160px] flex-1 text-sm" value={s.name} onChange={(e) => updateSeason(i, { name: e.target.value })} aria-label="Season name" />
            <span className="text-xs text-ink-400">{s.episodes.length} episodes</span>
            <button type="button" onClick={() => confirm(`Remove ${s.name} and its ${s.episodes.length} episodes?`) && onChange(seasons.filter((_, j) => j !== i))} className="grid h-8 w-8 place-items-center rounded-lg text-ink-300 hover:bg-white/10 hover:text-brand-300" aria-label="Remove season">
              <Trash2 size={15} />
            </button>
          </div>
          {open === i && <EpisodesEditor episodes={s.episodes} onChange={(eps) => updateSeason(i, { episodes: eps })} />}
        </div>
      ))}
      <button type="button" onClick={addSeason} className="btn btn-glass btn-sm">
        <Plus size={15} /> Add season
      </button>
    </div>
  );
}

function EpisodesEditor({ episodes, onChange }: { episodes: EpisodeForm[]; onChange: (v: EpisodeForm[]) => void }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const update = (i: number, patch: Partial<EpisodeForm>) => onChange(episodes.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const nextNumber = useMemo(() => Math.max(0, ...episodes.map((e) => e.number)) + 1, [episodes]);
  return (
    <div className="divide-y divide-white/[0.05]">
      {episodes.map((e, i) => (
        <div key={e.id ?? `new-${i}`} className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input className="input h-9 w-16 text-sm" inputMode="numeric" value={e.number} onChange={(ev) => update(i, { number: Number(ev.target.value.replace(/\D/g, '')) || 0 })} aria-label="Episode number" />
            <input className="input h-9 min-w-[180px] flex-1 text-sm" value={e.name} onChange={(ev) => update(i, { name: ev.target.value })} placeholder="Episode title" aria-label="Episode title" />
            <input
              className="input h-9 w-24 text-sm"
              inputMode="numeric"
              value={e.runtimeSec ? Math.round(e.runtimeSec / 60) : ''}
              onChange={(ev) => update(i, { runtimeSec: ev.target.value ? Number(ev.target.value.replace(/\D/g, '')) * 60 : null })}
              placeholder="min"
              aria-label="Runtime in minutes"
            />
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', e.sources.some((s) => s.url) ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300')}>
              {e.sources.some((s) => s.url) ? 'Has video' : 'No video'}
            </span>
            <button type="button" onClick={() => setExpanded(expanded === i ? null : i)} className="btn btn-ghost btn-sm">
              {expanded === i ? 'Done' : 'Edit media'}
            </button>
            <button type="button" onClick={() => onChange(episodes.filter((_, j) => j !== i))} className="grid h-8 w-8 place-items-center rounded-lg text-ink-300 hover:bg-white/10 hover:text-brand-300" aria-label="Remove episode">
              <Trash2 size={15} />
            </button>
          </div>
          {expanded === i && (
            <div className="mt-3 space-y-4 rounded-xl bg-ink-900/60 p-3">
              <TextArea label="Synopsis" value={e.synopsis ?? ''} onChange={(v) => update(i, { synopsis: v })} rows={2} />
              <Input label="Still image URL" value={e.stillUrl ?? ''} onChange={(v) => update(i, { stillUrl: v.trim() })} />
              <SourcesEditor sources={e.sources} onChange={(v) => update(i, { sources: v })} />
              <SubtitlesEditor subtitles={e.subtitles} onChange={(v) => update(i, { subtitles: v })} />
            </div>
          )}
        </div>
      ))}
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          onClick={() => {
            onChange([...episodes, { number: nextNumber, name: `Episode ${nextNumber}`, sources: [], subtitles: [] }]);
            setExpanded(episodes.length);
          }}
          className="btn btn-glass btn-sm"
        >
          <Plus size={15} /> Add episode
        </button>
        <span className="flex items-center gap-1 text-xs text-ink-400">
          <Info size={12} /> Episode IDs are kept on save, so members’ progress is preserved.
        </span>
      </div>
    </div>
  );
}
