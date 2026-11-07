import { db, now } from './db.js';

/**
 * An in-memory view of the published catalog, used to assemble rows,
 * similar-title lists and recommendations without repeated joins.
 * Rebuilt lazily after any admin change (invalidate()).
 */

export interface CardTitle {
  id: number;
  slug: string;
  type: 'movie' | 'series';
  title: string;
  tagline: string | null;
  synopsis: string;
  year: number | null;
  endYear: number | null;
  runtimeMin: number | null;
  maturity: string;
  poster: string | null;
  backdrop: string | null;
  genres: string[];
  genreSlugs: string[];
  rating: { score: number; count: number } | null;
  externalRating?: { score: number; count: number; source: 'IMDb' } | null;
  popularity: number;
  featured: boolean;
  createdAt: number;
  isNew: boolean;
  seasons: number;
  episodes: number;
  hasTrailer: boolean;
  rights: string;
}

interface Entry {
  card: CardTitle;
  genreSet: Set<string>;
  people: Set<number>;
  directors: Set<number>;
}

interface Index {
  list: Entry[];
  byId: Map<number, Entry>;
  builtAt: number;
}

let index: Index | null = null;

export function invalidate() {
  index = null;
}


export function getIndex(): Index {
  if (index) return index;
  const rows = db
    .prepare(
      `SELECT t.*,
        (SELECT COUNT(*) FROM seasons s WHERE s.title_id = t.id) AS season_count,
        (SELECT COUNT(*) FROM episodes e WHERE e.title_id = t.id) AS episode_count
       FROM titles t WHERE t.status = 'published' AND t.external_key LIKE 'animedoc:%'`
    )
    .all() as Record<string, unknown>[];
  const genres = db.prepare('SELECT tg.title_id, g.slug, g.name, g.sort FROM title_genres tg JOIN genres g ON g.id = tg.genre_id ORDER BY g.sort').all() as {
    title_id: number;
    slug: string;
    name: string;
  }[];
  const credits = db.prepare('SELECT title_id, person_id, role FROM credits').all() as { title_id: number; person_id: number; role: string }[];
  const ratings = db.prepare('SELECT title_id, AVG(score) AS avg, COUNT(*) AS n FROM ratings GROUP BY title_id').all() as { title_id: number; avg: number; n: number }[];

  const g = new Map<number, { slug: string; name: string }[]>();
  for (const r of genres) g.set(r.title_id, [...(g.get(r.title_id) ?? []), r]);
  const c = new Map<number, { people: Set<number>; directors: Set<number> }>();
  for (const r of credits) {
    const e = c.get(r.title_id) ?? { people: new Set<number>(), directors: new Set<number>() };
    e.people.add(r.person_id);
    if (r.role === 'director') e.directors.add(r.person_id);
    c.set(r.title_id, e);
  }
  const rt = new Map(ratings.map((r) => [r.title_id, r]));
  const t = now();

  const list: Entry[] = rows.map((r) => {
    const id = r.id as number;
    const gs = g.get(id) ?? [];
    const rating = rt.get(id);
    const card: CardTitle = {
      id,
      slug: r.slug as string,
      type: r.type as 'movie' | 'series',
      title: r.title as string,
      tagline: (r.tagline as string) ?? null,
      synopsis: truncate(r.synopsis as string, 260),
      year: (r.year as number) ?? null,
      endYear: (r.end_year as number) ?? null,
      runtimeMin: (r.runtime_min as number) ?? null,
      maturity: r.maturity as string,
      poster: (r.poster_url as string) ?? null,
      backdrop: (r.backdrop_url as string) ?? null,
      genres: gs.map((x) => x.name),
      genreSlugs: gs.map((x) => x.slug),
      rating: rating ? { score: Math.round(rating.avg * 10) / 10, count: rating.n } : null,
      externalRating: r.provider_rating ? { score: r.provider_rating as number, count: (r.provider_rating_count as number) ?? 0, source: 'IMDb' } : null,
      popularity: r.popularity as number,
      featured: !!r.featured,
      createdAt: r.created_at as number,
      isNew: t - (r.created_at as number) < 21 * 86_400_000,
      seasons: r.season_count as number,
      episodes: r.episode_count as number,
      hasTrailer: !!r.trailer_url,
      rights: r.rights_kind as string,
    };
    const people = c.get(id);
    return { card, genreSet: new Set(card.genreSlugs), people: people?.people ?? new Set(), directors: people?.directors ?? new Set() };
  });
  index = { list, byId: new Map(list.map((e) => [e.card.id, e])), builtAt: t };
  return index;
}

function truncate(s: string, n: number) {
  if (!s || s.length <= n) return s ?? '';
  const cut = s.slice(0, n);
  return cut.slice(0, cut.lastIndexOf(' ')) + '…';
}

export interface Audience {
  // Reserved for future audience preferences.
}

export const visible = (_e: Entry, _a: Audience) => true;

export function cards(ids: number[], a: Audience = {}): CardTitle[] {
  const idx = getIndex();
  return ids
    .map((id) => idx.byId.get(id))
    .filter((e): e is Entry => !!e && visible(e, a))
    .map((e) => e.card);
}

/** Deterministic daily shuffle, so "Trending" rotates without flickering between requests. */
function dailySeed(salt: string) {
  const day = Math.floor(Date.now() / 86_400_000);
  let h = 2166136261 ^ day;
  for (const ch of salt) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
}

/** A popularity score with a mild boost for artwork quality (titles with backdrops make better rows). */
const quality = (e: Entry) => Math.log1p(e.card.popularity) + (e.card.backdrop ? 0.5 : 0) + (e.card.poster ? 0.4 : 0) + (e.card.featured ? 0.2 : 0);

export function rowPopular(a: Audience, type?: 'movie' | 'series', limit = 24) {
  return getIndex()
    .list.filter((e) => visible(e, a) && (!type || e.card.type === type))
    .sort((x, y) => quality(y) - quality(x))
    .slice(0, limit)
    .map((e) => e.card);
}

export function rowRecentlyAdded(a: Audience, limit = 24) {
  return getIndex()
    .list.filter((e) => visible(e, a) && (e.card.poster || e.card.backdrop))
    .sort((x, y) => y.card.createdAt - x.card.createdAt)
    .slice(0, limit)
    .map((e) => e.card);
}

/** Plays and detail views over the last week, blended with a daily rotation of popular picks. */
export function rowTrending(a: Audience, limit = 20) {
  const since = now() - 7 * 86_400_000;
  const activity = db
    .prepare(`SELECT title_id, SUM(CASE type WHEN 'play' THEN 5 WHEN 'complete' THEN 8 ELSE 1 END) AS score FROM events WHERE created_at > ? AND title_id IS NOT NULL GROUP BY title_id`)
    .all(since) as { title_id: number; score: number }[];
  const act = new Map(activity.map((r) => [r.title_id, r.score]));
  const rand = dailySeed('trending');
  return getIndex()
    .list.filter((e) => visible(e, a) && e.card.backdrop)
    .map((e) => ({ e, s: (act.get(e.card.id) ?? 0) * 2 + quality(e) + rand() * 2.5 }))
    .sort((x, y) => y.s - x.s)
    .slice(0, limit)
    .map((x) => x.e.card);
}

/**
 * Community-rated titles first (Bayesian average so one 10/10 vote doesn't top
 * the chart), then the most widely celebrated classics to fill the row.
 */
export function rowTopRated(a: Audience, limit = 24) {
  const idx = getIndex();
  const rated = idx.list.filter((e) => visible(e, a) && e.card.rating && e.card.rating.count >= 1);
  const m = 3;
  const mean = rated.length ? rated.reduce((s, e) => s + e.card.rating!.score, 0) / rated.length : 7;
  const bayes = (e: Entry) => (e.card.rating!.count * e.card.rating!.score + m * mean) / (e.card.rating!.count + m);
  const top = rated.sort((x, y) => bayes(y) - bayes(x)).slice(0, limit);
  const have = new Set(top.map((e) => e.card.id));
  const acclaimed = idx.list
    .filter((e) => visible(e, a) && !have.has(e.card.id) && e.card.poster)
    .sort((x, y) => (y.card.externalRating?.score ?? 0) - (x.card.externalRating?.score ?? 0) || y.card.popularity - x.card.popularity);
  return [...top, ...acclaimed].slice(0, limit).map((e) => e.card);
}

export function rowGenre(a: Audience, genres: string[], limit = 24, opts: { type?: 'movie' | 'series'; maxRuntime?: number; minYear?: number; maxYear?: number } = {}) {
  return getIndex()
    .list.filter(
      (e) =>
        visible(e, a) &&
        (!genres.length || genres.some((g) => e.genreSet.has(g))) &&
        (!opts.type || e.card.type === opts.type) &&
        (!opts.maxRuntime || (e.card.runtimeMin ?? 999) <= opts.maxRuntime) &&
        (!opts.minYear || (e.card.year ?? 0) >= opts.minYear) &&
        (!opts.maxYear || (e.card.year ?? 9999) <= opts.maxYear) &&
        (e.card.poster || e.card.backdrop)
    )
    .sort((x, y) => quality(y) - quality(x))
    .slice(0, limit)
    .map((e) => e.card);
}

export function heroPicks(a: Audience, limit = 6) {
  const rand = dailySeed('hero');
  return getIndex()
    .list.filter((e) => visible(e, a) && e.card.backdrop && e.card.synopsis.length > 80)
    .map((e) => ({ e, s: quality(e) + (e.card.featured ? 2 : 0) + rand() * 1.5 }))
    .sort((x, y) => y.s - x.s)
    .slice(0, limit)
    .map((x) => x.e.card);
}

const jaccard = (a: Set<string>, b: Set<string>) => {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter || 1);
};

export function similarTo(titleId: number, a: Audience, limit = 12) {
  const idx = getIndex();
  const base = idx.byId.get(titleId);
  if (!base) return [];
  const scored = idx.list
    .filter((e) => e.card.id !== titleId && visible(e, a) && (e.card.poster || e.card.backdrop))
    .map((e) => {
      let shared = 0;
      for (const p of e.people) if (base.people.has(p)) shared++;
      let sharedDirector = 0;
      for (const p of e.directors) if (base.directors.has(p)) sharedDirector++;
      const yearGap = Math.abs((e.card.year ?? 1950) - (base.card.year ?? 1950));
      const s =
        jaccard(base.genreSet, e.genreSet) * 4 +
        Math.min(shared, 4) * 0.8 +
        sharedDirector * 1.5 +
        (e.card.type === base.card.type ? 0.6 : 0) +
        Math.max(0, 1 - yearGap / 40) +
        Math.log1p(e.card.popularity) * 0.15;
      return { e, s };
    })
    .sort((x, y) => y.s - x.s);
  return scored.slice(0, limit).map((x) => x.e.card);
}

/**
 * Content-based recommendations for a profile: builds a genre and people
 * affinity from what the profile watched, saved and rated, then scores the
 * rest of the catalog. Falls back to popular picks for new profiles.
 */
export function recommendFor(profileId: number, a: Audience, limit = 24) {
  const idx = getIndex();
  const signals = new Map<number, number>();
  const add = (id: number, w: number) => signals.set(id, (signals.get(id) ?? 0) + w);

  for (const r of db.prepare('SELECT title_id, completed, position_sec, duration_sec FROM progress WHERE profile_id = ?').all(profileId) as {
    title_id: number;
    completed: number;
    position_sec: number;
    duration_sec: number;
  }[]) {
    add(r.title_id, r.completed ? 3 : 1 + Math.min(1.5, (r.position_sec / (r.duration_sec || 1)) * 2));
  }
  for (const id of db.prepare('SELECT title_id FROM watchlist WHERE profile_id = ?').pluck().all(profileId) as number[]) add(id, 2);
  for (const r of db.prepare('SELECT title_id, score FROM ratings WHERE profile_id = ?').all(profileId) as { title_id: number; score: number }[]) {
    add(r.title_id, (r.score - 5.5) * 0.9);
  }

  if (!signals.size) return { items: rowPopular(a, undefined, limit + 12).slice(12), personalised: false, because: null as string | null };

  const genreAff = new Map<string, number>();
  const peopleAff = new Map<number, number>();
  let strongest: { id: number; w: number } | null = null;
  for (const [id, w] of signals) {
    const e = idx.byId.get(id);
    if (!e) continue;
    if (w > 0 && (!strongest || w > strongest.w)) strongest = { id, w };
    for (const g of e.genreSet) genreAff.set(g, (genreAff.get(g) ?? 0) + w / Math.sqrt(e.genreSet.size || 1));
    for (const p of e.people) peopleAff.set(p, (peopleAff.get(p) ?? 0) + w * 0.5);
  }

  const items = idx.list
    .filter((e) => !signals.has(e.card.id) && visible(e, a) && (e.card.poster || e.card.backdrop))
    .map((e) => {
      let s = 0;
      for (const g of e.genreSet) s += genreAff.get(g) ?? 0;
      s /= Math.sqrt(e.genreSet.size || 1);
      let ps = 0;
      for (const p of e.people) ps += peopleAff.get(p) ?? 0;
      return { e, s: s + Math.min(ps, 4) + quality(e) * 0.35 };
    })
    .sort((x, y) => y.s - x.s)
    .slice(0, limit)
    .map((x) => x.e.card);

  return { items, personalised: true, because: strongest ? idx.byId.get(strongest.id)?.card.title ?? null : null };
}

/**
 * Keeps home rows from echoing each other: titles already shown near the
 * front of an earlier row are moved behind fresh ones.
 */
export function diversify<T extends { id: number }>(items: T[], seen: Set<number>, front = 8): T[] {
  const fresh = items.filter((i) => !seen.has(i.id));
  const repeat = items.filter((i) => seen.has(i.id));
  const out = [...fresh, ...repeat];
  out.slice(0, front).forEach((i) => seen.add(i.id));
  return out;
}
