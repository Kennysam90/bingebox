import { Router, type Request } from 'express';
import { z } from 'zod';
import { cards, getIndex, recommendFor, similarTo, visible, type Audience } from './catalog-index.js';
import { db } from './db.js';
import { logEvent } from './events.js';
import { notFound, parse, route } from './http.js';
import { continueWatching } from './me.js';
import { animedocEnabled, browseCatalog, discoverTitles, providerSection, providerTrending, refreshMovies, refreshMovieDetail, searchMovies } from './animedoc.js';
import { parseSearchQuery } from './search-query.js';
import { PUBLIC_GENRES } from './public-genres.js';

export const catalogRouter = Router();

// Import provider metadata into our catalog so existing profiles, lists, filters,
// recommendations, and progress continue to use stable local title IDs.
catalogRouter.use(route(async (req, _res, next) => {
  if (req.method !== 'GET') return next();
  if (['/home', '/browse/movie', '/browse/movies', '/browse/series', '/genres'].includes(req.path)) await refreshMovies();
  if (['/search', '/search/suggest'].includes(req.path) && animedocEnabled()) {
    const { q, type } = parse(z.object({ q: z.string().trim().max(120).default(''), type: z.enum(['movie', 'series']).optional() }), req.query);
    const genres = db.prepare('SELECT slug, name FROM genres').all() as { slug: string; name: string }[];
    const parsed = parseSearchQuery(q, genres);
    if (parsed.text.length >= 2) await searchMovies(parsed.text, type);
    else if (q.length >= 2) await discoverTitles({ type, genre: parsed.genre?.slug, year: parsed.year });
  }
  const detail = req.path.match(/^\/titles\/(animedoc-[^/]+)(?:\/preview)?$/);
  if (detail) await refreshMovieDetail(detail[1]);
  next();
}));

export const audienceOf = (_req: Request): Audience => ({});

interface Row {
  id: string;
  title: string;
  subtitle?: string;
  kind?: 'standard' | 'top10' | 'poster' | 'continue';
  href?: string;
  items: unknown[];
}

// ---------------------------------------------------------------------------
// Home / browse pages
// ---------------------------------------------------------------------------

catalogRouter.get('/home', (req, res) => {
  const a = audienceOf(req);
  const movies = providerSection('movie', a);
  const series = providerSection('series', a);
  const rows: Row[] = [];
  const signedIn = !!req.user && !!req.profile;
  if (signedIn) {
    const cw = continueWatching(req.profile!.id, a);
    if (cw.length) rows.push({ id: 'continue', title: `Continue Watching for ${req.profile!.name}`, kind: 'continue', items: cw });
    const list = myListCards(req.profile!.id, a);
    if (list.length) rows.push({ id: 'my-list', title: 'My List', href: '/my-list', items: list });
  }
  const trending = providerTrending(a);
  if (trending.length) {
    rows.push({ id: 'trending', title: 'Trending Now', items: trending });
    rows.push({ id: 'top10', title: 'Top 10 Trending on AnimeDoc', kind: 'top10', items: trending.slice(0, 10) });
  }
  const add = (section: typeof movies, id: string, title: string, key: string, href?: string, kind?: Row['kind']) => {
    const source = section.rows.find((r) => r.id === id);
    if (source?.items.length) rows.push({ id: key, title, href, kind, items: source.items });
  };
  add(movies, 'popular', 'Popular Movies', 'popular-movies', '/movies');
  add(movies, 'latest', 'Recently Added', 'recent', '/movies?sort=newest');
  add(movies, 'top', 'Top Rated Movies', 'top-rated', '/movies?sort=rating', 'poster');
  const popularSeries = series.rows.find((r) => r.id === 'popular') ?? series.rows[0];
  if (popularSeries) rows.push({ ...popularSeries, id: 'popular-series', title: 'Popular TV Series', href: '/series' });
  if (signedIn) {
    const rec = recommendFor(req.profile!.id, a);
    if (rec.items.length) rows.push({ id: 'recommended', title: 'Recommended For You', subtitle: rec.because ? `Because you watched ${rec.because}` : undefined, items: rec.items });
  }
  for (const section of [movies, series]) {
    for (const r of section.rows.filter((r) => !['popular', 'latest', 'top'].includes(r.id)))
      rows.push({ ...r, id: `${section === movies ? 'movie' : 'series'}-${r.id}` });
  }
  const hero = [...movies.hero.slice(0, 4), ...series.hero.slice(0, 2)];
  res.json({ hero, rows });
});

catalogRouter.get('/browse/:type', (req, res) => {
  res.json(providerSection(req.params.type === 'series' ? 'series' : 'movie', audienceOf(req)));
});

catalogRouter.get('/genres', (req, res) => {
  const a = audienceOf(req);
  const idx = getIndex();
  const genres = db.prepare('SELECT id, slug, name, description, sort FROM genres ORDER BY sort').all() as {
    id: number;
    slug: string;
    name: string;
    description: string | null;
  }[];
  res.json({
    years: db.prepare("SELECT DISTINCT year FROM titles WHERE status = 'published' AND external_key LIKE 'animedoc:%' AND year IS NOT NULL ORDER BY year DESC").pluck().all(),
    genres: PUBLIC_GENRES.flatMap((category) => {
      const g = genres.find((g) => g.slug === category.slug);
      if (!g) return [];
      const members = idx.list.filter((e) => e.genreSet.has(g.slug) && visible(e, a));
      const art = members.filter((e) => e.card.backdrop).sort((x, y) => y.card.popularity - x.card.popularity)[0]?.card.backdrop ?? null;
      const posters = members.filter((e) => e.card.poster).sort((x, y) => y.card.popularity - x.card.popularity).slice(0, 4).map((e) => e.card.poster);
      return [{ ...g, name: category.name, count: members.length, image: art, posters }];
    }),
  });
});

// ---------------------------------------------------------------------------
// Listing & search
// ---------------------------------------------------------------------------

const listQuery = z.object({
  collection: z.enum(['nollywood']).optional(),
  language: z.enum(['yoruba']).optional(),
  type: z.enum(['movie', 'series']).optional(),
  genre: z.string().max(40).optional(),
  decade: z.coerce.number().int().min(1880).max(2100).optional(),
  year: z.coerce.number().int().min(1880).max(2100).optional(),
  sort: z.enum(['popular', 'newest', 'oldest', 'added', 'rating', 'az', 'runtime']).default('popular'),
  maxRuntime: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(30),
});

catalogRouter.get(
  '/titles',
  route(async (req, res) => {
    const q = parse(listQuery, req.query);
    res.json(await browseCatalog(q, audienceOf(req)));
  })
);

/**
 * Search by title, genre, year or person. Understands mixed queries such as
 * "comedy 1920s" or "keaton 1926": years/decades and genre names become
 * filters, and the rest goes to the full-text index (title > people > genres > synopsis).
 */
catalogRouter.get(
  '/search',
  route((req, res) => {
    const { q, type } = parse(z.object({ q: z.string().trim().max(120).default(''), type: z.enum(['movie', 'series']).optional() }), req.query);
    const a = audienceOf(req);
    if (!q) return res.json({ query: q, items: [], filters: {}, total: 0 });

    const genres = db.prepare('SELECT slug, name FROM genres').all() as { slug: string; name: string }[];
    const { text, year, decade, genre } = parseSearchQuery(q, genres);

    const idx = getIndex();
    let ranked: { id: number; score: number }[];
    if (text) {
      const tokens = text
        .replace(/["*():^{}\[\]]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 8);
      if (!tokens.length) ranked = [];
      else {
        const match = tokens.map((t) => `"${t.replace(/"/g, '')}"*`).join(' ');
        const rows = db
          .prepare(`SELECT rowid AS id, bm25(titles_fts, 12.0, 4.0, 2.0, 1.0) AS rank FROM titles_fts WHERE titles_fts MATCH ? ORDER BY rank LIMIT 200`)
          .all(match) as { id: number; rank: number }[];
        ranked = rows.map((r) => ({ id: r.id, score: -r.rank }));
        // Exact or prefix title matches go to the very top.
        const lower = text.toLowerCase();
        for (const r of ranked) {
          const t = idx.byId.get(r.id)?.card.title.toLowerCase() ?? '';
          if (t === lower) r.score += 100;
          else if (t.startsWith(lower)) r.score += 40;
          else if (t.includes(lower)) r.score += 15;
        }
      }
    } else {
      ranked = idx.list.map((e) => ({ id: e.card.id, score: Math.log1p(e.card.popularity) }));
    }

    const items = ranked
      .map((r) => ({ ...r, e: idx.byId.get(r.id) }))
      .filter(
        (r) =>
          r.e &&
          visible(r.e, a) &&
          (!type || r.e.card.type === type) &&
          (!genre || r.e.genreSet.has(genre.slug)) &&
          (!year || r.e.card.year === year) &&
          (!decade || ((r.e.card.year ?? 0) >= decade && (r.e.card.year ?? 0) < decade + 10))
      )
      .sort((x, y) => y.score + Math.log1p(y.e!.card.popularity) * 0.3 - (x.score + Math.log1p(x.e!.card.popularity) * 0.3))
      .slice(0, 80)
      .map((r) => r.e!.card);

    logEvent('search', { userId: req.user?.id, meta: { q: q.slice(0, 80), n: items.length } });
    res.json({ query: q, items, total: items.length, filters: { genre: genre ?? null, year: year ?? null, decade: decade ?? null, text } });
  })
);

/** Quick suggestions for the search box. */
catalogRouter.get(
  '/search/suggest',
  route((req, res) => {
    const { q } = parse(z.object({ q: z.string().trim().max(80).default('') }), req.query);
    if (q.length < 2) return res.json({ items: [] });
    const a = audienceOf(req);
    const lower = q.toLowerCase();
    const items = getIndex()
      .list.filter((e) => visible(e, a) && e.card.title.toLowerCase().includes(lower))
      .sort((x, y) => Number(y.card.title.toLowerCase().startsWith(lower)) - Number(x.card.title.toLowerCase().startsWith(lower)) || y.card.popularity - x.card.popularity)
      .slice(0, 6)
      .map((e) => ({ slug: e.card.slug, title: e.card.title, year: e.card.year, type: e.card.type, image: e.card.backdrop ?? e.card.poster }));
    res.json({ items });
  })
);

// ---------------------------------------------------------------------------
// Title details
// ---------------------------------------------------------------------------

catalogRouter.get(
  '/titles/:slug',
  route((req, res) => {
    const t = db.prepare(`SELECT * FROM titles WHERE slug = ? AND status = 'published' AND external_key LIKE 'animedoc:%'`).get(req.params.slug) as Record<string, unknown> | undefined;
    if (!t) throw notFound('We couldn’t find that title.');
    const id = t.id as number;
    const a = audienceOf(req);
    const entry = getIndex().byId.get(id);
    if (entry && !visible(entry, a)) throw notFound('This title isn’t available on a kids profile.');

    const genres = db.prepare('SELECT g.slug, g.name FROM title_genres tg JOIN genres g ON g.id = tg.genre_id WHERE tg.title_id = ? ORDER BY g.sort').all(id);
    const credits = db
      .prepare('SELECT p.id, p.name, p.photo_url AS photo, c.role, c.character FROM credits c JOIN people p ON p.id = c.person_id WHERE c.title_id = ? ORDER BY c.ord')
      .all(id) as { id: number; name: string; photo: string | null; role: string; character: string | null }[];
    const seasons = (db.prepare('SELECT id, number, name FROM seasons WHERE title_id = ? ORDER BY number').all(id) as { id: number; number: number; name: string }[]).map(
      (s) => ({
        ...s,
        episodes: db
          .prepare('SELECT id, number, name, synopsis, runtime_sec AS runtimeSec, still_url AS still FROM episodes WHERE season_id = ? ORDER BY number')
          .all(s.id),
      })
    );
    const subtitleLangs = db.prepare('SELECT DISTINCT label FROM subtitles WHERE title_id = ?').pluck().all(id) as string[];
    const qualities = db.prepare('SELECT DISTINCT quality FROM video_sources WHERE title_id = ?').pluck().all(id) as string[];

    let me: unknown = null;
    if (req.user && req.profile) {
      const pid = req.profile.id;
      const inList = !!db.prepare('SELECT 1 FROM watchlist WHERE profile_id = ? AND title_id = ?').get(pid, id);
      const myRating = (db.prepare('SELECT score FROM ratings WHERE profile_id = ? AND title_id = ?').pluck().get(pid, id) as number | undefined) ?? null;
      const progress = db
        .prepare('SELECT episode_id AS episodeId, position_sec AS position, duration_sec AS duration, completed, updated_at AS updatedAt FROM progress WHERE profile_id = ? AND title_id = ?')
        .all(pid, id);
      me = { inList, myRating, progress };
    }

    logEvent('view', { titleId: id, userId: req.user?.id });
    res.json({
      title: {
        id,
        slug: t.slug,
        type: t.type,
        title: t.title,
        tagline: t.tagline,
        synopsis: t.synopsis,
        about: t.about,
        releaseDate: t.release_date,
        year: t.year,
        endYear: t.end_year,
        runtimeMin: t.runtime_min,
        maturity: t.maturity,
        poster: t.poster_url,
        backdrop: t.backdrop_url,
        trailer: t.trailer_url,
        imdbId: t.imdb_id,
        wikidataId: t.wikidata_id,
        country: t.country,
        language: t.language,
        tags: JSON.parse((t.tags as string) || '[]'),
        rights: { kind: t.rights_kind, license: t.rights_license, attribution: t.rights_attribution, sourceUrl: t.rights_source_url },
        synopsisSource: t.synopsis_source ? JSON.parse(t.synopsis_source as string) : null,
        genres,
        rating: entry?.card.rating ?? null,
        externalRating: entry?.card.externalRating ?? null,
        cast: credits.filter((c) => c.role === 'cast'),
        crew: credits.filter((c) => c.role !== 'cast'),
        seasons,
        subtitleLanguages: subtitleLangs,
        qualities,
      },
      similar: similarTo(id, a, 18),
      me,
    });
  })
);

/**
 * Trailer or, when a title has none, a short preview clip from the feature
 * (clearly labelled "Preview" in the UI). Public, like a trailer would be.
 */
catalogRouter.get(
  '/titles/:slug/preview',
  route((req, res) => {
    const t = db.prepare(`SELECT id, type, title, trailer_url, runtime_min FROM titles WHERE slug = ? AND status = 'published' AND external_key LIKE 'animedoc:%'`).get(req.params.slug) as
      | { id: number; type: string; title: string; trailer_url: string | null; runtime_min: number | null }
      | undefined;
    if (!t) throw notFound('We couldn’t find that title.');
    if (t.trailer_url) return res.json({ kind: 'trailer', url: t.trailer_url, mediaKind: t.trailer_url.includes('.m3u8') ? 'hls' : 'mp4', start: 0, length: null });
    // Prefer a light rendition for previews.
    const src = db
      .prepare(
        `SELECT url, kind FROM video_sources WHERE title_id = ? ORDER BY (episode_id IS NOT NULL), CASE WHEN quality IN ('240p','360p') THEN 0 ELSE 1 END, is_primary DESC, id LIMIT 1`
      )
      .get(t.id) as { url: string; kind: string } | undefined;
    if (!src) throw notFound('No preview is available for this title.');
    const runtimeSec = (t.runtime_min ?? 10) * 60;
    res.json({ kind: 'preview', url: src.url, mediaKind: src.kind, start: Math.round(runtimeSec * 0.12), length: Math.min(90, Math.round(runtimeSec * 0.3)) });
  })
);

catalogRouter.get(
  '/people/:id',
  route((req, res) => {
    const id = Number(req.params.id);
    const person = db.prepare('SELECT id, name, photo_url AS photo, wikidata_id AS wikidataId FROM people WHERE id = ?').get(id);
    if (!person) throw notFound('Person not found.');
    const ids = db.prepare('SELECT DISTINCT title_id FROM credits WHERE person_id = ?').pluck().all(id) as number[];
    res.json({ person, titles: cards(ids, audienceOf(req)) });
  })
);

export function myListCards(profileId: number, a: Audience) {
  const ids = db.prepare('SELECT title_id FROM watchlist WHERE profile_id = ? ORDER BY added_at DESC').pluck().all(profileId) as number[];
  return cards(ids, a);
}
