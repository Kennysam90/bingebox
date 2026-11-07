import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from './auth.js';
import { invalidate } from './catalog-index.js';
import { config } from './config.js';
import { db, now, reindexTitle } from './db.js';
import { badRequest, HttpError, intParam, notFound, parse, route } from './http.js';
import { imageUpload, saveImage, saveSubtitle, subtitleUpload } from './uploads.js';
import { animedocEnabled, refreshMovieDetail } from './animedoc.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

const DAY = 86_400_000;

adminRouter.get('/stats', (_req, res) => {
  const t = now();
  const since30 = t - 30 * DAY;
  const one = (sql: string, ...args: unknown[]) => db.prepare(sql).pluck().get(...args) as number;

  const totals = {
    movies: one(`SELECT COUNT(*) FROM titles WHERE type = 'movie'`),
    series: one(`SELECT COUNT(*) FROM titles WHERE type = 'series'`),
    episodes: one('SELECT COUNT(*) FROM episodes'),
    drafts: one(`SELECT COUNT(*) FROM titles WHERE status = 'draft'`),
    users: one('SELECT COUNT(*) FROM users'),
    profiles: one('SELECT COUNT(*) FROM profiles'),
    activeUsers30d: one('SELECT COUNT(DISTINCT user_id) FROM events WHERE created_at > ? AND user_id IS NOT NULL', since30),
    plays30d: one(`SELECT COUNT(*) FROM events WHERE type = 'play' AND created_at > ?`, since30),
    views30d: one(`SELECT COUNT(*) FROM events WHERE type = 'view' AND created_at > ?`, since30),
    signups30d: one(`SELECT COUNT(*) FROM users WHERE created_at > ?`, since30),
    watchHours30d: Math.round((one('SELECT COALESCE(SUM(seconds), 0) FROM history WHERE watched_at > ?', since30) / 3600) * 10) / 10,
    completions30d: one(`SELECT COUNT(*) FROM events WHERE type = 'complete' AND created_at > ?`, since30),
    watchlistAdds: one('SELECT COUNT(*) FROM watchlist'),
    ratings: one('SELECT COUNT(*) FROM ratings'),
  };

  // Daily series for the last 30 days (UTC days).
  const startDay = Math.floor(since30 / DAY) + 1;
  const daily = Array.from({ length: 30 }, (_, i) => ({ day: new Date((startDay + i) * DAY).toISOString().slice(0, 10), plays: 0, views: 0, signups: 0 }));
  const bucket = (ts: number) => Math.floor(ts / DAY) - startDay;
  for (const r of db.prepare(`SELECT type, created_at FROM events WHERE created_at > ? AND type IN ('play','view')`).all(since30) as { type: string; created_at: number }[]) {
    const d = daily[bucket(r.created_at)];
    if (d) d[r.type === 'play' ? 'plays' : 'views']++;
  }
  for (const ts of db.prepare('SELECT created_at FROM users WHERE created_at > ?').pluck().all(since30) as number[]) {
    const d = daily[bucket(ts)];
    if (d) d.signups++;
  }

  const topTitles = db
    .prepare(
      `SELECT t.id, t.slug, t.title, t.type, t.poster_url AS poster, t.backdrop_url AS backdrop, COUNT(*) AS plays
         FROM events e JOIN titles t ON t.id = e.title_id
        WHERE e.type = 'play' AND e.created_at > ? GROUP BY t.id ORDER BY plays DESC LIMIT 8`
    )
    .all(since30);
  const genres = db
    .prepare('SELECT g.name, g.slug, COUNT(tg.title_id) AS count FROM genres g LEFT JOIN title_genres tg ON tg.genre_id = g.id GROUP BY g.id ORDER BY count DESC')
    .all();
  const recentUsers = db.prepare('SELECT id, name, email, role, created_at AS createdAt FROM users ORDER BY created_at DESC LIMIT 6').all();
  const topSearches = db
    .prepare(
      `SELECT LOWER(json_extract(meta, '$.q')) AS q, COUNT(*) AS n FROM events WHERE type = 'search' AND created_at > ? GROUP BY q ORDER BY n DESC LIMIT 8`
    )
    .all(since30);

  res.json({ totals, daily, topTitles, genres, recentUsers, topSearches, generatedAt: t });
});

// ---------------------------------------------------------------------------
// Titles
// ---------------------------------------------------------------------------

adminRouter.get(
  '/titles',
  route((req, res) => {
    const q = parse(
      z.object({
        q: z.string().trim().max(100).default(''),
        type: z.enum(['movie', 'series']).optional(),
        status: z.enum(['published', 'draft']).optional(),
        genre: z.string().max(40).optional(),
        sort: z.enum(['updated', 'title', 'year', 'popularity']).default('updated'),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(5).max(100).default(25),
      }),
      req.query
    );
    const where: string[] = [];
    const args: unknown[] = [];
    if (q.q) {
      where.push('(t.title LIKE ? OR t.slug LIKE ? OR CAST(t.year AS TEXT) = ?)');
      args.push(`%${q.q}%`, `%${q.q}%`, q.q);
    }
    if (q.type) (where.push('t.type = ?'), args.push(q.type));
    if (q.status) (where.push('t.status = ?'), args.push(q.status));
    if (q.genre) (where.push('EXISTS (SELECT 1 FROM title_genres tg JOIN genres g ON g.id = tg.genre_id WHERE tg.title_id = t.id AND g.slug = ?)'), args.push(q.genre));
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const order = { updated: 't.updated_at DESC', title: 't.title COLLATE NOCASE', year: 't.year DESC', popularity: 't.popularity DESC' }[q.sort];
    const total = db.prepare(`SELECT COUNT(*) FROM titles t ${w}`).pluck().get(...args) as number;
    const items = db
      .prepare(
        `SELECT t.id, t.slug, t.type, t.title, t.year, t.status, t.featured, t.poster_url AS poster, t.backdrop_url AS backdrop, t.updated_at AS updatedAt,
            t.rights_kind AS rightsKind,
            (SELECT GROUP_CONCAT(g.name, ', ') FROM title_genres tg JOIN genres g ON g.id = tg.genre_id WHERE tg.title_id = t.id) AS genres,
            (SELECT COUNT(*) FROM video_sources v WHERE v.title_id = t.id) AS sourceCount,
            (SELECT COUNT(*) FROM episodes e WHERE e.title_id = t.id) AS episodeCount
           FROM titles t ${w} ORDER BY ${order} LIMIT ? OFFSET ?`
      )
      .all(...args, q.pageSize, (q.page - 1) * q.pageSize);
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  })
);

adminRouter.get(
  '/titles/:id',
  route((req, res) => {
    const id = intParam(req.params.id);
    const t = db.prepare('SELECT * FROM titles WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!t) throw notFound('Title not found.');
    res.json({ title: editableTitle(id, t) });
  })
);

function editableTitle(id: number, t: Record<string, unknown>) {
  const sourcesFor = (episodeId: number | null) =>
    db
      .prepare(`SELECT url, kind, quality, is_primary AS isPrimary FROM video_sources WHERE title_id = ? AND episode_id IS ? ORDER BY is_primary DESC, id`)
      .all(id, episodeId)
      .map((s) => ({ ...(s as object), primary: !!(s as { isPrimary: number }).isPrimary }));
  const subsFor = (episodeId: number | null) => db.prepare('SELECT lang, label, url FROM subtitles WHERE title_id = ? AND episode_id IS ? ORDER BY id').all(id, episodeId);
  return {
    id,
    type: t.type,
    title: t.title,
    slug: t.slug,
    tagline: t.tagline ?? '',
    synopsis: t.synopsis ?? '',
    releaseDate: t.release_date ?? '',
    year: t.year ?? null,
    endYear: t.end_year ?? null,
    runtimeMin: t.runtime_min ?? null,
    maturity: t.maturity,
    posterUrl: t.poster_url ?? '',
    backdropUrl: t.backdrop_url ?? '',
    thumbnailUrl: t.thumbnail_url ?? '',
    trailerUrl: t.trailer_url ?? '',
    imdbId: t.imdb_id ?? '',
    country: t.country ?? '',
    language: t.language ?? '',
    featured: !!t.featured,
    status: t.status,
    rightsKind: t.rights_kind,
    rightsLicense: t.rights_license ?? '',
    rightsAttribution: t.rights_attribution ?? '',
    rightsSourceUrl: t.rights_source_url ?? '',
    genres: db.prepare('SELECT g.slug FROM title_genres tg JOIN genres g ON g.id = tg.genre_id WHERE tg.title_id = ?').pluck().all(id),
    credits: db
      .prepare('SELECT p.name, p.photo_url AS photoUrl, c.role, c.character FROM credits c JOIN people p ON p.id = c.person_id WHERE c.title_id = ? ORDER BY c.ord')
      .all(id),
    sources: sourcesFor(null),
    subtitles: subsFor(null),
    seasons: (db.prepare('SELECT id, number, name FROM seasons WHERE title_id = ? ORDER BY number').all(id) as { id: number; number: number; name: string }[]).map((s) => ({
      ...s,
      episodes: (
        db
          .prepare('SELECT id, number, name, synopsis, runtime_sec AS runtimeSec, still_url AS stillUrl FROM episodes WHERE season_id = ? ORDER BY number')
          .all(s.id) as { id: number }[]
      ).map((e) => ({ ...e, sources: sourcesFor(e.id), subtitles: subsFor(e.id) })),
    })),
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}

/** Accepts only http(s) URLs on the authorised-host list, or files uploaded to BingeBox. */
function isAuthorisedVideo(url: string) {
  if (url.startsWith('/uploads/')) return true;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    const hosts = [...config.authorisedVideoHosts, ...(config.animedocApiKey ? ['*.aoneroom.com'] : [])];
    return hosts.some((h) => (h.startsWith('*.') ? host.endsWith(h.slice(1)) : host === h));
  } catch {
    return false;
  }
}

const urlish = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => v === '' || v.startsWith('/uploads/') || /^https:\/\//.test(v), 'Use an https:// URL or an uploaded file.');
const source = z.object({
  url: z.string().trim().min(1, 'Add a stream URL.').max(2000).refine(isAuthorisedVideo, 'This host is not on the authorised streaming sources list.'),
  kind: z.enum(['mp4', 'hls']),
  quality: z.string().trim().min(1).max(20).default('Auto'),
  primary: z.boolean().default(false),
});
const subtitle = z.object({
  lang: z.string().trim().min(2).max(10),
  label: z.string().trim().min(1).max(40),
  url: urlish.refine((v) => v !== '', 'Add a subtitle URL or upload a file.'),
});
const ROLES = ['director', 'writer', 'producer', 'composer', 'cinematographer', 'cast'] as const;

const titleBody = z.object({
  type: z.enum(['movie', 'series']),
  title: z.string().trim().min(1, 'Give the title a name.').max(200),
  slug: z
    .string()
    .trim()
    .max(240)
    .regex(/^[a-zA-Z0-9-]*$/, 'Use letters, numbers and dashes.')
    .optional(),
  tagline: z.string().trim().max(200).optional().default(''),
  synopsis: z.string().trim().min(20, 'Write a synopsis of at least 20 characters.').max(5000),
  releaseDate: z
    .string()
    .trim()
    .regex(/^(\d{4}(-\d{2}-\d{2})?)?$/, 'Use YYYY-MM-DD.')
    .optional()
    .default(''),
  year: z.number().int().min(1870).max(2100).nullable().optional(),
  endYear: z.number().int().min(1870).max(2100).nullable().optional(),
  runtimeMin: z.number().int().min(1).max(1000).nullable().optional(),
  maturity: z.enum(['ALL', '7+', '13+', '16+', '18+', 'NR']).default('NR'),
  posterUrl: urlish.optional().default(''),
  backdropUrl: urlish.optional().default(''),
  thumbnailUrl: urlish.optional().default(''),
  trailerUrl: urlish
    .optional()
    .default('')
    .refine((v) => v === '' || isAuthorisedVideo(v), 'Trailer host is not on the authorised streaming sources list.'),
  imdbId: z
    .string()
    .trim()
    .regex(/^(tt\d{5,10})?$/, 'IMDb IDs look like tt0017136.')
    .optional()
    .default(''),
  country: z.string().trim().max(80).optional().default(''),
  language: z.string().trim().max(80).optional().default(''),
  featured: z.boolean().default(false),
  status: z.enum(['published', 'draft']).default('draft'),
  rightsKind: z.enum(['licensed', 'public-domain', 'cc', 'provider']).default('licensed'),
  rightsLicense: z.string().trim().max(200).optional().default(''),
  rightsAttribution: z.string().trim().max(300).optional().default(''),
  rightsSourceUrl: urlish.optional().default(''),
  genres: z.array(z.string().max(40)).max(10).default([]),
  credits: z
    .array(z.object({ name: z.string().trim().min(1).max(120), role: z.enum(ROLES), character: z.string().trim().max(120).nullable().optional(), photoUrl: urlish.nullable().optional() }))
    .max(80)
    .default([]),
  sources: z.array(source).max(10).default([]),
  subtitles: z.array(subtitle).max(20).default([]),
  seasons: z
    .array(
      z.object({
        id: z.number().int().positive().optional(),
        number: z.number().int().min(0).max(100),
        name: z.string().trim().min(1).max(80),
        episodes: z
          .array(
            z.object({
              id: z.number().int().positive().optional(),
              number: z.number().int().min(0).max(1000),
              name: z.string().trim().min(1).max(200),
              synopsis: z.string().trim().max(2000).nullable().optional(),
              runtimeSec: z.number().int().min(0).max(86_400).nullable().optional(),
              stillUrl: urlish.nullable().optional(),
              sources: z.array(source).max(6).default([]),
              subtitles: z.array(subtitle).max(10).default([]),
            })
          )
          .max(500),
      })
    )
    .max(60)
    .default([]),
});
type TitleBody = z.infer<typeof titleBody>;

const slugify = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

function uniqueSlug(base: string, exceptId?: number) {
  const root = base || 'title';
  let slug = root;
  let n = 2;
  while (db.prepare('SELECT 1 FROM titles WHERE slug = ? AND id IS NOT ?').get(slug, exceptId ?? null)) slug = `${root}-${n++}`;
  return slug;
}

function validatePublishable(b: TitleBody, providerTitle = false) {
  if (b.status !== 'published') return;
  if (!b.posterUrl && !b.backdropUrl) throw badRequest('Add a poster or backdrop image before publishing.');
  if (!providerTitle && b.type === 'movie' && !b.sources.length) throw badRequest('Add at least one authorised video source before publishing.');
  if (!providerTitle && b.type === 'series' && !b.seasons.some((s) => s.episodes.some((e) => e.sources.length)))
    throw badRequest('Add at least one episode with a video source before publishing.');
  if (!b.genres.length) throw badRequest('Pick at least one genre before publishing.');
}

function saveTitle(b: TitleBody, existingId?: number): number {
  const providerTitle = !!existingId && !!db.prepare("SELECT 1 FROM titles WHERE id = ? AND external_key LIKE 'animedoc:%'").get(existingId);
  validatePublishable(b, providerTitle);
  const t = now();
  const year = b.year ?? (b.releaseDate ? Number(b.releaseDate.slice(0, 4)) : null);
  const releaseDate = b.releaseDate.length === 4 ? `${b.releaseDate}-01-01` : b.releaseDate || (year ? `${year}-01-01` : null);
  const slug = uniqueSlug(b.slug || slugify(b.title), existingId);
  const values = {
    slug,
    type: b.type,
    title: b.title,
    tagline: b.tagline || null,
    synopsis: b.synopsis,
    release_date: releaseDate,
    year,
    end_year: b.type === 'series' ? (b.endYear ?? null) : null,
    runtime_min: b.runtimeMin ?? null,
    maturity: b.maturity,
    poster_url: b.posterUrl || null,
    backdrop_url: b.backdropUrl || null,
    thumbnail_url: b.thumbnailUrl || null,
    trailer_url: b.trailerUrl || null,
    imdb_id: b.imdbId || null,
    country: b.country || null,
    language: b.language || null,
    featured: b.featured ? 1 : 0,
    status: b.status,
    rights_kind: b.rightsKind,
    rights_license: b.rightsLicense || null,
    rights_attribution: b.rightsAttribution || null,
    rights_source_url: b.rightsSourceUrl || null,
    updated_at: t,
    provider_edited: providerTitle ? 1 : 0,
  };

  return db.transaction(() => {
    let id = existingId;
    if (id) {
      const sets = Object.keys(values).map((k) => `${k} = @${k}`).join(', ');
      db.prepare(`UPDATE titles SET ${sets} WHERE id = @id`).run({ ...values, id });
    } else {
      const cols = Object.keys(values);
      id = Number(
        db
          .prepare(`INSERT INTO titles (${cols.join(', ')}, created_at, popularity) VALUES (${cols.map((c) => '@' + c).join(', ')}, @created_at, 20)`)
          .run({ ...values, created_at: t }).lastInsertRowid
      );
    }

    // Genres
    db.prepare('DELETE FROM title_genres WHERE title_id = ?').run(id);
    for (const slugG of b.genres) {
      const gid = db.prepare('SELECT id FROM genres WHERE slug = ?').pluck().get(slugG) as number | undefined;
      if (gid) db.prepare('INSERT OR IGNORE INTO title_genres (title_id, genre_id) VALUES (?, ?)').run(id, gid);
    }

    // Credits (people matched by name)
    db.prepare('DELETE FROM credits WHERE title_id = ?').run(id);
    b.credits.forEach((c, ord) => {
      let pid = db.prepare('SELECT id FROM people WHERE name = ? ORDER BY id LIMIT 1').pluck().get(c.name) as number | undefined;
      if (!pid) pid = Number(db.prepare('INSERT INTO people (name, photo_url) VALUES (?, ?)').run(c.name, c.photoUrl || null).lastInsertRowid);
      else if (c.photoUrl) db.prepare('UPDATE people SET photo_url = ? WHERE id = ?').run(c.photoUrl, pid);
      db.prepare('INSERT INTO credits (title_id, person_id, role, character, ord) VALUES (?, ?, ?, ?, ?)').run(id, pid, c.role, c.character || null, ord);
    });

    // Title-level sources & subtitles
    writeMedia(id, null, b.type === 'movie' ? b.sources : [], b.type === 'movie' ? b.subtitles : []);

    // Seasons & episodes: keep IDs stable so viewing progress survives edits.
    const keepSeasons = new Set<number>();
    const keepEpisodes = new Set<number>();
    if (b.type === 'series') {
      const numbers = b.seasons.map((s) => s.number);
      if (new Set(numbers).size !== numbers.length) throw badRequest('Each season needs a different number.');
      // Park existing season numbers out of the way so renumbering can't collide.
      db.prepare('UPDATE seasons SET number = number + 100000 WHERE title_id = ?').run(id);
      for (const s of b.seasons) {
        let sid = s.id && (db.prepare('SELECT id FROM seasons WHERE id = ? AND title_id = ?').pluck().get(s.id, id) as number | undefined);
        if (sid) db.prepare('UPDATE seasons SET number = ?, name = ? WHERE id = ?').run(s.number, s.name, sid);
        else sid = Number(db.prepare('INSERT INTO seasons (title_id, number, name) VALUES (?, ?, ?)').run(id, s.number, s.name).lastInsertRowid);
        keepSeasons.add(sid);
        for (const e of s.episodes) {
          let eid = e.id && (db.prepare('SELECT id FROM episodes WHERE id = ? AND title_id = ?').pluck().get(e.id, id) as number | undefined);
          if (eid)
            db.prepare('UPDATE episodes SET season_id = ?, number = ?, name = ?, synopsis = ?, runtime_sec = ?, still_url = ? WHERE id = ?').run(
              sid,
              e.number,
              e.name,
              e.synopsis || null,
              e.runtimeSec ?? null,
              e.stillUrl || null,
              eid
            );
          else
            eid = Number(
              db
                .prepare('INSERT INTO episodes (title_id, season_id, number, name, synopsis, runtime_sec, still_url) VALUES (?, ?, ?, ?, ?, ?, ?)')
                .run(id, sid, e.number, e.name, e.synopsis || null, e.runtimeSec ?? null, e.stillUrl || null).lastInsertRowid
            );
          keepEpisodes.add(eid);
          writeMedia(id, eid, e.sources, e.subtitles);
        }
      }
    }
    for (const eid of db.prepare('SELECT id FROM episodes WHERE title_id = ?').pluck().all(id) as number[]) {
      if (!keepEpisodes.has(eid)) {
        db.prepare('DELETE FROM episodes WHERE id = ?').run(eid);
        db.prepare('DELETE FROM progress WHERE title_id = ? AND episode_id = ?').run(id, eid);
      }
    }
    for (const sid of db.prepare('SELECT id FROM seasons WHERE title_id = ?').pluck().all(id) as number[]) {
      if (!keepSeasons.has(sid)) db.prepare('DELETE FROM seasons WHERE id = ?').run(sid);
    }

    reindexTitle(id);
    return id;
  })();
}

function writeMedia(titleId: number, episodeId: number | null, sources: TitleBody['sources'], subtitles: TitleBody['subtitles']) {
  db.prepare('DELETE FROM video_sources WHERE title_id = ? AND episode_id IS ?').run(titleId, episodeId);
  db.prepare('DELETE FROM subtitles WHERE title_id = ? AND episode_id IS ?').run(titleId, episodeId);
  const hasPrimary = sources.some((s) => s.primary);
  sources.forEach((s, i) =>
    db
      .prepare('INSERT INTO video_sources (title_id, episode_id, url, kind, quality, is_primary) VALUES (?, ?, ?, ?, ?, ?)')
      .run(titleId, episodeId, s.url, s.kind, s.quality, s.primary || (!hasPrimary && i === 0) ? 1 : 0)
  );
  for (const s of subtitles) db.prepare('INSERT INTO subtitles (title_id, episode_id, lang, label, url) VALUES (?, ?, ?, ?, ?)').run(titleId, episodeId, s.lang, s.label, s.url);
}

adminRouter.post(
  '/titles/import',
  route(async (req, res) => {
    if (!animedocEnabled()) throw new HttpError(503, 'Configure AnimeDoc before importing titles.', 'movie_provider');
    const body = parse(z.union([
      z.object({ titleId: z.number().int().positive() }),
      z.object({ detailPath: z.string().trim().min(1).max(240).regex(/^[a-zA-Z0-9-]+$/, 'Enter the AnimeDoc detail path, not a web address.') }),
    ]), req.body);
    let slug: string;
    if ('titleId' in body) {
      const title = db.prepare("SELECT slug FROM titles WHERE id = ? AND external_key LIKE 'animedoc:%'").get(body.titleId) as { slug: string } | undefined;
      if (!title) throw notFound('Choose a title from the connected catalog.');
      slug = title.slug;
    } else slug = `animedoc-${body.detailPath}`;
    const id = await refreshMovieDetail(slug);
    if (!id) throw notFound('That title could not be imported.');
    const title = db.prepare('SELECT * FROM titles WHERE id = ?').get(id) as Record<string, unknown>;
    invalidate();
    res.json({ title: editableTitle(id, title) });
  })
);

adminRouter.post(
  '/titles',
  route((req, res) => {
    const body = parse(titleBody, req.body);
    const id = saveTitle(body);
    invalidate();
    const t = db.prepare('SELECT * FROM titles WHERE id = ?').get(id) as Record<string, unknown>;
    res.status(201).json({ title: editableTitle(id, t) });
  })
);

adminRouter.put(
  '/titles/:id',
  route((req, res) => {
    const id = intParam(req.params.id);
    if (!db.prepare('SELECT 1 FROM titles WHERE id = ?').get(id)) throw notFound('Title not found.');
    const body = parse(titleBody, req.body);
    saveTitle(body, id);
    invalidate();
    const t = db.prepare('SELECT * FROM titles WHERE id = ?').get(id) as Record<string, unknown>;
    res.json({ title: editableTitle(id, t) });
  })
);

/** Quick toggles from the titles table (publish/unpublish, feature). */
adminRouter.patch(
  '/titles/:id',
  route((req, res) => {
    const id = intParam(req.params.id);
    const body = parse(z.object({ status: z.enum(['published', 'draft']).optional(), featured: z.boolean().optional() }), req.body);
    const t = db.prepare('SELECT id, status, featured FROM titles WHERE id = ?').get(id) as { status: string; featured: number } | undefined;
    if (!t) throw notFound('Title not found.');
    if (body.status === 'published') {
      const hasMedia = db.prepare("SELECT 1 FROM video_sources WHERE title_id = ? UNION SELECT 1 FROM titles WHERE id = ? AND external_key LIKE 'animedoc:%' LIMIT 1").get(id, id);
      if (!hasMedia) throw badRequest('Add a video source before publishing.');
    }
    db.prepare('UPDATE titles SET status = ?, featured = ?, updated_at = ?, provider_edited = 1 WHERE id = ?').run(
      body.status ?? t.status,
      body.featured === undefined ? t.featured : body.featured ? 1 : 0,
      now(),
      id
    );
    invalidate();
    res.json({ ok: true });
  })
);

adminRouter.delete(
  '/titles/:id',
  route((req, res) => {
    const id = intParam(req.params.id);
    const info = db.transaction(() => {
      db.prepare("INSERT OR IGNORE INTO provider_exclusions (external_key) SELECT external_key FROM titles WHERE id = ? AND external_key LIKE 'animedoc:%'").run(id);
      const r = db.prepare('DELETE FROM titles WHERE id = ?').run(id);
      db.prepare('DELETE FROM titles_fts WHERE rowid = ?').run(id);
      return r;
    })();
    if (!info.changes) throw notFound('Title not found.');
    invalidate();
    res.json({ ok: true });
  })
);

adminRouter.get('/sources/policy', (_req, res) => res.json({ authorisedHosts: config.authorisedVideoHosts }));

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

adminRouter.post(
  '/uploads/image',
  imageUpload,
  route(async (req, res) => res.status(201).json({ url: await saveImage(req.file) }))
);

adminRouter.post(
  '/uploads/subtitle',
  subtitleUpload,
  route(async (req, res) => res.status(201).json({ url: await saveSubtitle(req.file) }))
);

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

adminRouter.get(
  '/users',
  route((req, res) => {
    const q = parse(
      z.object({
        q: z.string().trim().max(100).default(''),
        role: z.enum(['user', 'admin']).optional(),
        status: z.enum(['active', 'suspended']).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(5).max(100).default(25),
      }),
      req.query
    );
    const where: string[] = [];
    const args: unknown[] = [];
    if (q.q) (where.push('(u.email LIKE ? OR u.name LIKE ?)'), args.push(`%${q.q}%`, `%${q.q}%`));
    if (q.role) (where.push('u.role = ?'), args.push(q.role));
    if (q.status) (where.push('u.status = ?'), args.push(q.status));
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) FROM users u ${w}`).pluck().get(...args) as number;
    const items = db
      .prepare(
        `SELECT u.id, u.email, u.name, u.role, u.status, u.created_at AS createdAt, u.last_login_at AS lastLoginAt,
            (SELECT COUNT(*) FROM profiles p WHERE p.user_id = u.id) AS profiles,
            (SELECT COUNT(*) FROM history h JOIN profiles p ON p.id = h.profile_id WHERE p.user_id = u.id) AS views,
            (SELECT COALESCE(SUM(h.seconds), 0) FROM history h JOIN profiles p ON p.id = h.profile_id WHERE p.user_id = u.id) AS watchSeconds
           FROM users u ${w} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`
      )
      .all(...args, q.pageSize, (q.page - 1) * q.pageSize);
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  })
);

adminRouter.patch(
  '/users/:id',
  route((req, res) => {
    const id = intParam(req.params.id);
    const body = parse(z.object({ role: z.enum(['user', 'admin']).optional(), status: z.enum(['active', 'suspended']).optional(), name: z.string().trim().min(1).max(60).optional() }), req.body);
    const u = db.prepare('SELECT id, role, status, name FROM users WHERE id = ?').get(id) as { id: number; role: string; status: string; name: string } | undefined;
    if (!u) throw notFound('User not found.');
    if (id === req.user!.id && (body.role === 'user' || body.status === 'suspended')) throw badRequest("You can't remove your own admin access or suspend yourself.");
    if (u.role === 'admin' && body.role === 'user') {
      const admins = db.prepare(`SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'active'`).pluck().get() as number;
      if (admins <= 1) throw badRequest('BingeBox needs at least one active admin.');
    }
    db.prepare('UPDATE users SET role = ?, status = ?, name = ? WHERE id = ?').run(body.role ?? u.role, body.status ?? u.status, body.name ?? u.name, id);
    if (body.status === 'suspended') db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    res.json({ ok: true });
  })
);

adminRouter.delete(
  '/users/:id',
  route((req, res) => {
    const id = intParam(req.params.id);
    if (id === req.user!.id) throw badRequest("You can't delete your own account from here.");
    const u = db.prepare('SELECT role FROM users WHERE id = ?').get(id) as { role: string } | undefined;
    if (!u) throw notFound('User not found.');
    if (u.role === 'admin') throw badRequest('Remove admin access before deleting this account.');
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Genres (categories)
// ---------------------------------------------------------------------------

adminRouter.get('/genres', (_req, res) => {
  res.json({
    genres: db
      .prepare('SELECT g.id, g.slug, g.name, g.description, g.sort, COUNT(tg.title_id) AS count FROM genres g LEFT JOIN title_genres tg ON tg.genre_id = g.id GROUP BY g.id ORDER BY g.sort')
      .all(),
  });
});

const genreBody = z.object({
  name: z.string().trim().min(1, 'Name the category.').max(40),
  slug: z
    .string()
    .trim()
    .max(40)
    .regex(/^[a-z0-9-]*$/, 'Use lowercase letters, numbers and dashes.')
    .optional(),
  description: z.string().trim().max(200).optional().default(''),
  sort: z.number().int().min(0).max(1000).optional(),
});

adminRouter.post(
  '/genres',
  route((req, res) => {
    const b = parse(genreBody, req.body);
    const slug = b.slug || slugify(b.name);
    if (db.prepare('SELECT 1 FROM genres WHERE slug = ?').get(slug)) throw new HttpError(409, 'A category with that slug already exists.', 'conflict');
    const sort = b.sort ?? ((db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 FROM genres').pluck().get() as number) || 0);
    db.prepare('INSERT INTO genres (slug, name, description, sort) VALUES (?, ?, ?, ?)').run(slug, b.name, b.description || null, sort);
    invalidate();
    res.status(201).json({ ok: true });
  })
);

adminRouter.put(
  '/genres/:id',
  route((req, res) => {
    const id = intParam(req.params.id);
    const b = parse(genreBody, req.body);
    const g = db.prepare('SELECT * FROM genres WHERE id = ?').get(id) as { slug: string; sort: number } | undefined;
    if (!g) throw notFound('Category not found.');
    const slug = b.slug || g.slug;
    if (db.prepare('SELECT 1 FROM genres WHERE slug = ? AND id != ?').get(slug, id)) throw new HttpError(409, 'A category with that slug already exists.', 'conflict');
    db.prepare('UPDATE genres SET name = ?, slug = ?, description = ?, sort = ? WHERE id = ?').run(b.name, slug, b.description || null, b.sort ?? g.sort, id);
    invalidate();
    res.json({ ok: true });
  })
);

adminRouter.delete(
  '/genres/:id',
  route((req, res) => {
    const id = intParam(req.params.id);
    const info = db.prepare('DELETE FROM genres WHERE id = ?').run(id);
    if (!info.changes) throw notFound('Category not found.');
    invalidate();
    res.json({ ok: true });
  })
);
