import { z } from 'zod';
import { config } from './config.js';
import { db, reindexTitle } from './db.js';
import { cards, invalidate, type Audience } from './catalog-index.js';
import { HttpError, notFound } from './http.js';

const BASE = 'https://api.animedoc.cloud/api/v2/anime/';
export const animedocEnabled = () => !!config.animedocApiKey;

// Provider IDs exceed JavaScript's safe integer range: always keep them as strings.
const movieSchema = z.object({
  subjectId: z.string(), subjectType: z.coerce.number(), title: z.string(), detailPath: z.string(),
  genre: z.string().default(''), description: z.string().optional(), releaseDate: z.string().optional(),
  cover: z.union([z.string(), z.object({ url: z.string() })]).nullish(),
  backdrop: z.string().optional(), stills: z.object({ url: z.string() }).nullish(),
  trailer: z.union([z.string(), z.object({ videoAddress: z.object({ url: z.string() }).nullish() })]).nullish(),
  rating: z.coerce.number().optional(), imdbRatingValue: z.coerce.number().optional(),
  imdbRatingCount: z.coerce.number().optional(),
  country: z.string().optional(), countryName: z.string().optional(), duration: z.coerce.number().optional(),
  language: z.string().nullish(),
  isPornographic: z.boolean().optional(),
});
type Movie = z.infer<typeof movieSchema>;
const listSchema = z.object({ items: z.array(z.unknown()).default([]) });
const feedSchema = z.object({
  featured: z.array(z.unknown()).default([]),
  rows: z.array(z.object({ id: z.string().default('titles'), title: z.string().default('Movies & Series'), items: z.array(z.unknown()).default([]) })).default([]),
});
function providerData<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) throw new HttpError(502, 'The movie provider returned incomplete data. Please try again shortly.', 'movie_provider');
  return result.data;
}

async function request(endpoint: string, params: Record<string, string> = {}, body?: unknown): Promise<unknown> {
  const url = new URL(endpoint, BASE);
  url.search = new URLSearchParams(params).toString();
  try {
    const response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: { 'X-API-Key': config.animedocApiKey, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new HttpError(response.status === 429 ? 503 : 502,
      response.status === 429 ? 'The movie provider is busy. Please try again shortly.' : 'The movie provider could not complete this request.', 'movie_provider');
    const result = z.object({ code: z.number(), data: z.unknown() }).parse(await response.json());
    if (result.code !== 0) throw new Error('Provider error');
    return result.data;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    // Never log upstream request objects, headers, or signed media URLs.
    throw new HttpError(502, 'The movie provider is unavailable. Please try again shortly.', 'movie_provider');
  }
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const genreSlug = (s: string) => /^anime$/i.test(s) ? 'animation' : /^sci[ -]?fi$/i.test(s) ? 'science-fiction' : slugify(s);
const mediaUrl = (s?: string | null) => {
  if (!s) return null;
  try {
    const url = new URL(s);
    // Media returned to the browser must never contain the API credential.
    return url.protocol === 'https:' && !url.username && !url.password && !s.includes(config.animedocApiKey) ? s : null;
  } catch { return null; }
};

function saveMovie(raw: unknown, featured = false): number | null {
  const parsed = movieSchema.safeParse(raw);
  if (!parsed.success) return null;
  const m: Movie = parsed.data;
  if (![1, 2].includes(m.subjectType) || m.isPornographic) return null;
  const key = `animedoc:${m.subjectId}`;
  if (db.prepare('SELECT 1 FROM provider_exclusions WHERE external_key = ?').get(key)) return null;
  const existing = db.prepare('SELECT id, provider_edited FROM titles WHERE external_key = ?').get(key) as { id: number; provider_edited: number } | undefined;
  if (existing?.provider_edited) return existing.id;
  const poster = mediaUrl(typeof m.cover === 'string' ? m.cover : m.cover?.url);
  const trailer = mediaUrl(typeof m.trailer === 'string' ? m.trailer : m.trailer?.videoAddress?.url);
  const timestamp = Date.now();
  db.prepare(`INSERT INTO titles (slug, external_key, type, title, synopsis, release_date, year, runtime_min,
    poster_url, backdrop_url, trailer_url, country, popularity, featured, rights_kind, rights_source_url, created_at, updated_at,
    provider_path, provider_rating, provider_rating_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'provider', ?, ?, ?, ?, ?, ?)
    ON CONFLICT(external_key) DO UPDATE SET title=excluded.title,
    synopsis=CASE WHEN excluded.synopsis != '' THEN excluded.synopsis ELSE titles.synopsis END,
    release_date=COALESCE(excluded.release_date,titles.release_date), year=COALESCE(excluded.year,titles.year),
    runtime_min=COALESCE(excluded.runtime_min,titles.runtime_min), poster_url=COALESCE(excluded.poster_url,titles.poster_url),
    backdrop_url=COALESCE(excluded.backdrop_url,titles.backdrop_url), trailer_url=COALESCE(excluded.trailer_url,titles.trailer_url),
    country=COALESCE(excluded.country,titles.country), popularity=excluded.popularity,
    featured=MAX(titles.featured,excluded.featured), updated_at=excluded.updated_at,
    provider_path=excluded.provider_path, provider_rating=COALESCE(excluded.provider_rating,titles.provider_rating),
    provider_rating_count=COALESCE(excluded.provider_rating_count,titles.provider_rating_count)`)
    .run(`animedoc-${m.detailPath}`, key, m.subjectType === 2 ? 'series' : 'movie', m.title, m.description ?? '', m.releaseDate || null,
      m.releaseDate ? Number(m.releaseDate.slice(0, 4)) || null : null, m.duration ? Math.round(m.duration / 60) : null,
      poster, mediaUrl(m.backdrop || m.stills?.url), trailer, m.country || m.countryName || null,
      1000 + (m.rating ?? m.imdbRatingValue ?? 0) * 100, Number(featured),
      'https://www.animedoc.cloud/docs/live-movie-api', timestamp, timestamp, m.detailPath,
      (m.imdbRatingValue ?? m.rating ?? 0) > 0 ? Math.min(10, m.imdbRatingValue ?? m.rating ?? 0) : null, m.imdbRatingCount ?? null);
  const id = existing?.id ?? (db.prepare('SELECT id FROM titles WHERE external_key = ?').pluck().get(key) as number);
  const yoruba = /\byoruba\b/i.test(m.genre) || /^(yo|yoruba)$/i.test(m.language ?? '');
  if (yoruba) db.prepare("UPDATE titles SET language = 'Yoruba', country = CASE WHEN country IS NULL OR country = '' THEN 'Nigeria' ELSE country END WHERE id = ?").run(id);
  for (const name of m.genre.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (/^yoruba$/i.test(name)) continue; // Language belongs in Nollywood, not genre navigation.
    const slug = genreSlug(name);
    db.prepare('INSERT INTO genres (slug, name) VALUES (?, ?) ON CONFLICT(slug) DO NOTHING').run(slug, slug === 'animation' ? 'Animation' : name);
    db.prepare('INSERT OR IGNORE INTO title_genres (title_id, genre_id) SELECT ?, id FROM genres WHERE slug = ?').run(id, slug);
  }
  reindexTitle(id);
  return id;
}

function saveMovies(items: unknown[], featured = false) {
  const ids = db.transaction(() => items.map((m) => saveMovie(m, featured)).filter((id): id is number => id !== null))();
  invalidate();
  return ids;
}

let refreshedAt = 0;
let pending: Promise<void> | undefined;
export async function refreshMovies() {
  if (!animedocEnabled()) throw new HttpError(503, 'The AnimeDoc catalog is not configured yet.', 'movie_provider');
  if (Date.now() - refreshedAt < 10 * 60_000) return;
  const snapshots = db.prepare("SELECT MIN(updated_at) AS oldest, COUNT(*) AS count FROM catalog_feeds WHERE id IN ('movies','series','trending')").get() as { oldest: number; count: number };
  if (snapshots.count === 3 && Date.now() - snapshots.oldest < 10 * 60_000) { refreshedAt = snapshots.oldest; return; }
  if (pending) return pending;
  pending = (async () => {
    const results = await Promise.allSettled(['movies', 'series', 'trending'].map(async (id) => {
      const data = id === 'trending'
        ? providerData(listSchema, await request('trending/', { page: '0', perPage: '24' }))
        : providerData(feedSchema, await request('section/', { id }));
      if ('rows' in data) {
        saveMovies(data.rows.flatMap((r) => r.items));
        saveMovies(data.featured, true);
      } else saveMovies(data.items);
      db.prepare('INSERT INTO catalog_feeds (id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at')
        .run(id, JSON.stringify(data), Date.now());
    }));
    const failed = results.find((r) => r.status === 'rejected');
    if (failed?.status === 'rejected') {
      const sections = db.prepare("SELECT COUNT(*) FROM catalog_feeds WHERE id IN ('movies','series')").pluck().get() as number;
      if (sections < 2) throw failed.reason;
    }
    refreshedAt = Date.now();
  })().catch((error) => {
    if ((db.prepare("SELECT COUNT(*) FROM catalog_feeds WHERE id IN ('movies','series')").pluck().get() as number) < 2) throw error;
    // Keep the cached catalog usable during temporary provider outages.
    refreshedAt = Date.now() - 9 * 60_000;
  }).finally(() => { pending = undefined; });
  return pending;
}

function feedCards(items: unknown[], audience: Audience, type?: 'movie' | 'series') {
  const ids = new Set<number>();
  for (const raw of items) {
    const item = movieSchema.safeParse(raw);
    if (!item.success) continue;
    const id = db.prepare('SELECT id FROM titles WHERE external_key = ?').pluck().get(`animedoc:${item.data.subjectId}`) as number | undefined;
    if (id) ids.add(id);
  }
  return cards([...ids], audience).filter((c) => !type || c.type === type);
}

export function providerSection(type: 'movie' | 'series', audience: Audience) {
  const row = db.prepare('SELECT payload FROM catalog_feeds WHERE id = ?').get(type === 'movie' ? 'movies' : 'series') as { payload: string } | undefined;
  if (!row) throw new HttpError(503, 'The AnimeDoc catalog is temporarily unavailable. Please try again.', 'movie_provider');
  const feed = providerData(feedSchema, JSON.parse(row.payload));
  return {
    hero: feedCards(feed.featured, audience, type),
    rows: feed.rows.map((r) => ({ id: r.id, title: r.title, items: feedCards(r.items, audience, type) })).filter((r) => r.items.length),
  };
}

export function providerTrending(audience: Audience) {
  const row = db.prepare("SELECT payload FROM catalog_feeds WHERE id = 'trending'").get() as { payload: string } | undefined;
  return row ? feedCards(providerData(listSchema, JSON.parse(row.payload)).items, audience) : [];
}

const searches = new Map<string, { at: number; ids: number[] }>();
const discoveries = new Map<string, number>();
export interface CatalogPageQuery {
  collection?: 'nollywood'; language?: 'yoruba';
  type?: 'movie' | 'series'; genre?: string; year?: number; decade?: number;
  maxRuntime?: number; sort: string; page: number; pageSize: number;
}

const pageRequests = new Map<string, Promise<z.infer<typeof browseSchema>>>();
const browseSchema = z.object({
  items: z.array(z.unknown()).default([]),
  pager: z.object({ hasMore: z.boolean(), page: z.coerce.number().optional() }),
});

async function providerPage(endpoint: string, params: Record<string, string>) {
  const key = `browse:${endpoint}:${JSON.stringify(params)}`;
  const cached = db.prepare('SELECT payload, updated_at FROM catalog_feeds WHERE id = ?').get(key) as { payload: string; updated_at: number } | undefined;
  if (cached && Date.now() - cached.updated_at < 10 * 60_000) return providerData(browseSchema, JSON.parse(cached.payload));
  const running = pageRequests.get(key);
  if (running) return running;
  const pending = (async () => {
    const data = providerData(browseSchema, await request(endpoint, params));
    saveMovies(data.items);
    db.prepare('INSERT INTO catalog_feeds (id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at')
      .run(key, JSON.stringify(data), Date.now());
    return data;
  })().finally(() => pageRequests.delete(key));
  pageRequests.set(key, pending);
  return pending;
}

/** Each UI page advances the upstream cursor; the local metadata cache never
 * determines whether a genre has more titles. Animation uses its full channel,
 * including animated films, western TV animation and anime. */
export async function browseCatalog(q: CatalogPageQuery, audience: Audience) {
  if (!animedocEnabled()) throw new HttpError(503, 'The AnimeDoc catalog is not configured yet.', 'movie_provider');
  const sort = q.sort === 'rating' ? 'Rating' : ['newest', 'added'].includes(q.sort) ? 'Latest' : 'Hottest';
  const genre = q.genre === 'science-fiction' ? 'Sci-Fi' : q.genre?.replace(/(^|-)(\w)/g, (_s, _dash, letter: string) => ` ${letter.toUpperCase()}`).trim();
  const animation = q.genre === 'animation';
  const channels = animation && q.collection !== 'nollywood' ? ['1006'] : q.type === 'movie' ? ['1'] : q.type === 'series' ? ['2'] : ['1', '2'];
  const results = q.collection === 'nollywood' && q.language === 'yoruba' ? await Promise.all(channels.map((channelId) => providerPage('browse/', {
    channelId, country: 'Nigeria', genre: 'Yoruba', sort, page: String(q.page), perPage: String(Math.min(q.pageSize, 48)),
  }))) : q.collection === 'nollywood' ? [await providerPage('section/', {
    id: 'nollywood', sort, page: String(q.page), ...(q.type ? { kind: q.type === 'movie' ? 'movies' : 'series' } : {}),
    ...(genre ? { genre } : {}), ...(q.year ? { year: String(q.year) } : {}),
  })] : await Promise.all(channels.map((channelId) => {
    if (q.year && !animation) return providerPage('section/', {
      id: channelId === '1' ? 'movies' : 'series', sort, page: String(q.page), year: String(q.year), ...(genre ? { genre } : {}),
    });
    return providerPage('browse/', {
      channelId, sort, page: String(q.page), perPage: String(Math.min(q.pageSize, 48)), ...(!animation && genre ? { genre } : {}),
    });
  }));
  const items = feedCards(results.flatMap((r) => r.items), audience, q.type).filter((c) =>
    (!q.genre || c.genreSlugs.includes(q.genre)) && (!q.year || c.year === q.year) &&
    (!q.decade || (c.year !== null && c.year >= q.decade && c.year < q.decade + 10)) &&
    (!q.maxRuntime || (c.runtimeMin !== null && c.runtimeMin <= q.maxRuntime)) &&
    (q.language !== 'yoruba' || (db.prepare('SELECT language FROM titles WHERE id = ?').pluck().get(c.id) as string | null)?.toLowerCase() === 'yoruba'));
  const hasMore = results.some((r) => r.pager.hasMore);
  return { items, page: q.page, pageSize: q.pageSize, hasMore, nextPage: hasMore ? q.page + 1 : null,
    total: items.length, totalExact: false };
}

export async function discoverTitles(filters: { type?: 'movie' | 'series'; genre?: string; year?: number }) {
  if (!filters.genre && !filters.year) return;
  const params: Record<string, string> = {
    id: filters.type === 'series' ? 'series' : 'movies',
    ...(filters.genre ? { genre: filters.genre === 'science-fiction' ? 'Sci-Fi' : filters.genre.replace(/(^|-)(\w)/g, (_s, _dash, letter: string) => ` ${letter.toUpperCase()}`).trim() } : {}),
    ...(filters.year ? { year: String(filters.year) } : {}),
  };
  const key = JSON.stringify(params);
  if (Date.now() - (discoveries.get(key) ?? 0) < 10 * 60_000) return;
  const data = providerData(z.object({ items: z.array(z.unknown()).default([]), rows: z.array(listSchema).default([]) }), await request('section/', params));
  saveMovies([...data.items, ...data.rows.flatMap((r) => r.items)]);
  if (discoveries.size >= 200) discoveries.delete(discoveries.keys().next().value!);
  discoveries.set(key, Date.now());
}

export async function searchMovies(keyword: string, type?: 'movie' | 'series') {
  const key = `${type ?? 'all'}:${keyword.toLowerCase()}`;
  const cached = searches.get(key);
  if (cached && Date.now() - cached.at < 60_000) return cached.ids;
  const data = providerData(listSchema, await request('search/', {}, { keyword, page: 1, perPage: 40, subjectType: type === 'movie' ? 1 : type === 'series' ? 2 : 0 }));
  const ids = saveMovies(data.items);
  if (searches.size >= 200) searches.delete(searches.keys().next().value!);
  searches.set(key, { at: Date.now(), ids });
  return ids;
}

const detailCache = new Map<string, number>();
export async function refreshMovieDetail(slug: string) {
  if (!animedocEnabled()) return;
  const title = db.prepare('SELECT id, provider_path, provider_edited FROM titles WHERE slug = ?').get(slug) as { id: number; provider_path: string | null; provider_edited: number } | undefined;
  const detailPath = title?.provider_path ?? (slug.startsWith('animedoc-') ? slug.slice(9) : null);
  if (!detailPath || title?.provider_edited) return title?.id;
  if (Date.now() - (detailCache.get(slug) ?? 0) < 10 * 60_000) return title?.id;
  const personSchema = z.object({ staffId: z.string(), name: z.string(), character: z.string().nullish(), avatarUrl: z.string().nullish() });
  const data = providerData(z.object({ subject: movieSchema, stars: z.array(personSchema).default([]),
    resource: z.object({ seasons: z.array(z.object({ se: z.coerce.number(), maxEp: z.coerce.number() })).default([]) }).nullish(),
  }), await request('detail/', { detailPath }));
  const id = saveMovies([data.subject])[0];
  if (!id) throw notFound('This title is unavailable.');
  db.transaction(() => {
    db.prepare("DELETE FROM credits WHERE title_id = ? AND role = 'cast'").run(id);
    data.stars.forEach((p, ord) => {
      const key = `animedoc:${p.staffId}`;
      db.prepare('INSERT INTO people (name, photo_url, provider_key) VALUES (?, ?, ?) ON CONFLICT(provider_key) WHERE provider_key IS NOT NULL DO UPDATE SET name=excluded.name, photo_url=excluded.photo_url')
        .run(p.name, mediaUrl(p.avatarUrl), key);
      const pid = db.prepare('SELECT id FROM people WHERE provider_key = ?').pluck().get(key) as number;
      db.prepare("INSERT INTO credits (title_id, person_id, role, character, ord) VALUES (?, ?, 'cast', ?, ?)").run(id, pid, p.character ?? null, ord);
    });
    if (data.subject.subjectType === 2) {
      for (const s of data.resource?.seasons ?? []) {
        if (s.se < 1 || s.maxEp < 1) continue;
        db.prepare('INSERT OR IGNORE INTO seasons (title_id, number, name) VALUES (?, ?, ?)').run(id, s.se, `Season ${s.se}`);
        const sid = db.prepare('SELECT id FROM seasons WHERE title_id = ? AND number = ?').pluck().get(id, s.se) as number;
        for (let n = 1; n <= Math.min(s.maxEp, 500); n++) {
          if (!db.prepare('SELECT 1 FROM episodes WHERE season_id = ? AND number = ?').get(sid, n))
            db.prepare('INSERT INTO episodes (title_id, season_id, number, name) VALUES (?, ?, ?, ?)').run(id, sid, n, `Episode ${n}`);
        }
      }
    }
    reindexTitle(id);
  })();
  invalidate();
  if (detailCache.size >= 500) detailCache.delete(detailCache.keys().next().value!);
  detailCache.set(slug, Date.now());
  return id;
}

interface MovieSource { id: string; url: string; kind: string; quality: string; codec: string; isPrimary: number }
const sourceCache = new Map<string, { at: number; sources: MovieSource[] }>();
export async function movieSources(slug: string, episode?: { id: number; season: number; number: number }, fresh = false) {
  const title = db.prepare('SELECT id, external_key, provider_path, type FROM titles WHERE slug = ?').get(slug) as { id: number; external_key: string | null; provider_path: string | null; type: string } | undefined;
  if (!title?.external_key?.startsWith('animedoc:')) return null;
  const cacheKey = `${slug}:${episode?.id ?? 0}`;
  const cached = sourceCache.get(cacheKey);
  if (!fresh && cached && Date.now() - cached.at < 2 * 60_000) return cached.sources;
  const schema = z.object({
    downloads: z.array(z.object({ id: z.coerce.string().optional(), url: z.string(), resolution: z.coerce.string().optional(), codecName: z.string().optional(), vipLocked: z.boolean().optional() })).default([]),
    captions: z.array(z.object({ lan: z.string(), lanName: z.string(), url: z.string() })).default([]),
  });
  // The current OpenAPI reference specifies 0/0 for movies, 1-based values for TV.
  const params = { subjectId: title.external_key.slice(9), detailPath: title.provider_path ?? slug.slice(9), se: String(episode?.season ?? 0), ep: String(episode?.number ?? 0) };
  let data = providerData(schema, await request('media-sources/', params));
  // Retain compatibility with movie resources that still use the older 1/1 form.
  if (!episode && !data.downloads.length) data = providerData(schema, await request('media-sources/', { ...params, se: '1', ep: '1' }));
  // H.264 works in browsers that cannot decode HEVC/H.265.
  const sources = data.downloads.filter((d) => !d.vipLocked && mediaUrl(d.url))
    .sort((a, b) => Number(b.codecName === 'h264') - Number(a.codecName === 'h264') || Number(a.resolution ?? 0) - Number(b.resolution ?? 0))
    .map((d, i) => ({
    id: d.id || `${d.resolution ?? 'auto'}-${d.codecName ?? 'video'}`, codec: d.codecName ?? '',
    url: d.url, kind: new URL(d.url).pathname.endsWith('.m3u8') ? 'hls' : 'mp4',
    quality: d.resolution ? `${d.resolution.replace(/p$/, '')}p` : 'Auto', isPrimary: Number(i === 0),
  }));
  if (!sources.length) throw notFound('The movie provider has no playable source for this movie right now.');
  const titleId = title.id;
  db.transaction(() => {
    for (const c of data.captions.filter((c) => mediaUrl(c.url))) {
      const track = db.prepare('SELECT id FROM subtitles WHERE title_id = ? AND lang = ? AND episode_id IS ?').get(titleId, c.lan, episode?.id ?? null) as { id: number } | undefined;
      if (track) db.prepare('UPDATE subtitles SET url = ?, label = ? WHERE id = ?').run(c.url, c.lanName, track.id);
      else db.prepare('INSERT INTO subtitles (title_id, episode_id, lang, label, url) VALUES (?, ?, ?, ?, ?)').run(titleId, episode?.id ?? null, c.lan, c.lanName, c.url);
    }
  })();
  if (sourceCache.size >= 200) sourceCache.delete(sourceCache.keys().next().value!);
  sourceCache.set(cacheKey, { at: Date.now(), sources });
  return sources;
}
