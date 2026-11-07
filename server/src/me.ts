import { Router, type Request } from 'express';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { requireUser } from './auth.js';
import { cards, getIndex, invalidate, recommendFor, visible, type Audience, type CardTitle } from './catalog-index.js';
import { db, now } from './db.js';
import { logEvent } from './events.js';
import { badRequest, HttpError, intParam, notFound, parse, route } from './http.js';
import { movieSources, refreshMovieDetail } from './animedoc.js';
import { config } from './config.js';

export const meRouter = Router();
meRouter.use(requireUser);

const aud = (_req: Request): Audience => ({});

function availableTitle(req: Request, id: number) {
  const entry = getIndex().byId.get(id);
  if (!entry) throw notFound('That title is not available.');
  return entry.card;
}

// ---------------------------------------------------------------------------
// Continue watching
// ---------------------------------------------------------------------------

export interface ContinueItem extends CardTitle {
  progress: { position: number; duration: number; fraction: number; updatedAt: number };
  episode: { id: number; name: string; season: number; number: number; label: string } | null;
  upNext: boolean;
}

/**
 * The latest unfinished item per title. For series, a finished episode rolls
 * over to the next one ("Up next: S1:E3"); a finished series drops off.
 */
export function continueWatching(profileId: number, a: Audience, limit = 20): ContinueItem[] {
  const rows = db
    .prepare(
      `SELECT p.title_id, p.episode_id, p.position_sec, p.duration_sec, p.completed, p.updated_at
         FROM progress p
        WHERE p.profile_id = ? AND p.updated_at = (SELECT MAX(updated_at) FROM progress p2 WHERE p2.profile_id = p.profile_id AND p2.title_id = p.title_id)
        ORDER BY p.updated_at DESC LIMIT ?`
    )
    .all(profileId, limit * 2) as { title_id: number; episode_id: number; position_sec: number; duration_sec: number; completed: number; updated_at: number }[];
  const idx = getIndex();
  const out: ContinueItem[] = [];
  for (const r of rows) {
    const entry = idx.byId.get(r.title_id);
    if (!entry || !visible(entry, a)) continue;
    let episode: ContinueItem['episode'] = null;
    let position = r.position_sec;
    let duration = r.duration_sec;
    let upNext = false;
    if (r.episode_id) {
      let ep = episodeInfo(r.episode_id);
      if (r.completed && ep) {
        const next = nextEpisode(r.title_id, r.episode_id);
        if (!next) continue;
        ep = next;
        position = 0;
        duration = next.runtimeSec || 1;
        upNext = true;
      }
      if (ep) episode = { id: ep.id, name: ep.name, season: ep.season, number: ep.number, label: `S${ep.season}:E${ep.number}` };
    } else if (r.completed) continue;
    out.push({
      ...entry.card,
      progress: { position, duration, fraction: duration ? Math.min(1, position / duration) : 0, updatedAt: r.updated_at },
      episode,
      upNext,
    });
    if (out.length >= limit) break;
  }
  return out;
}

interface EpisodeInfo {
  id: number;
  name: string;
  number: number;
  season: number;
  runtimeSec: number;
  still: string | null;
  synopsis: string | null;
}

function episodeInfo(id: number): EpisodeInfo | undefined {
  return db
    .prepare(
      'SELECT e.id, e.name, e.number, s.number AS season, e.runtime_sec AS runtimeSec, e.still_url AS still, e.synopsis FROM episodes e JOIN seasons s ON s.id = e.season_id WHERE e.id = ?'
    )
    .get(id) as EpisodeInfo | undefined;
}

function orderedEpisodes(titleId: number): EpisodeInfo[] {
  return db
    .prepare(
      `SELECT e.id, e.name, e.number, s.number AS season, e.runtime_sec AS runtimeSec, e.still_url AS still, e.synopsis
         FROM episodes e JOIN seasons s ON s.id = e.season_id WHERE e.title_id = ? ORDER BY s.number, e.number`
    )
    .all(titleId) as EpisodeInfo[];
}

function nextEpisode(titleId: number, episodeId: number) {
  const list = orderedEpisodes(titleId);
  const i = list.findIndex((e) => e.id === episodeId);
  return i >= 0 ? list[i + 1] : undefined;
}

meRouter.get('/continue', (req, res) => res.json({ items: continueWatching(req.profile!.id, aud(req)) }));

meRouter.delete(
  '/continue/:titleId',
  route((req, res) => {
    db.prepare('DELETE FROM progress WHERE profile_id = ? AND title_id = ?').run(req.profile!.id, intParam(req.params.titleId));
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------

/** Everything the player needs: sources, subtitles, where to resume, and what's next. */
meRouter.get(
  '/play/:slug',
  route(async (req, res) => {
    await refreshMovieDetail(req.params.slug);
    const t = db.prepare(`SELECT id, slug, type, title, backdrop_url, poster_url, maturity, status FROM titles WHERE slug = ? AND external_key LIKE 'animedoc:%'`).get(req.params.slug) as
      | { id: number; slug: string; type: string; title: string; backdrop_url: string | null; poster_url: string | null; maturity: string; status: string }
      | undefined;
    if (!t || (t.status !== 'published' && req.user!.role !== 'admin')) throw notFound('That title isn’t available.');
    const pid = req.profile!.id;

    let episode: EpisodeInfo | undefined;
    let episodes: EpisodeInfo[] = [];
    if (t.type === 'series') {
      episodes = orderedEpisodes(t.id);
      if (!episodes.length) throw notFound('No episodes are available yet.');
      const requested = req.query.episode !== undefined ? intParam(req.query.episode, 'episode') : undefined;
      if (requested) {
        episode = episodes.find((e) => e.id === requested);
        if (!episode) throw notFound('That episode is not available for this series.');
      }
      if (!episode) {
        // Resume where the profile left off.
        const last = db
          .prepare('SELECT episode_id, completed FROM progress WHERE profile_id = ? AND title_id = ? ORDER BY updated_at DESC LIMIT 1')
          .get(pid, t.id) as { episode_id: number; completed: number } | undefined;
        if (last) {
          const i = episodes.findIndex((e) => e.id === last.episode_id);
          episode = last.completed ? episodes[i + 1] ?? episodes[i] : episodes[i];
        }
        episode ??= episodes[0];
      }
    } else if (req.query.episode !== undefined) throw badRequest('Movies do not have episodes.');
    const epId = episode?.id ?? 0;

    // Movie-level rows have episode_id NULL; episode rows point at their episode.
    const scope = episode ? 'episode_id = ?' : 'episode_id IS NULL';
    const scopeArgs = episode ? [t.id, epId] : [t.id];
    const sources = await movieSources(t.slug, episode, true);
    if (!sources) throw notFound('This title is not available from AnimeDoc.');
    if (!sources.length) throw notFound('This title has no playable source yet.');
    const subs = db
      .prepare(`SELECT id, lang, label FROM subtitles WHERE title_id = ? AND ${scope} ORDER BY id`)
      .all(...scopeArgs) as { id: number; lang: string; label: string }[];
    const prog = db
      .prepare('SELECT position_sec, duration_sec, completed FROM progress WHERE profile_id = ? AND title_id = ? AND episode_id = ?')
      .get(pid, t.id, epId) as { position_sec: number; duration_sec: number; completed: number } | undefined;

    const i = episode ? episodes.findIndex((e) => e.id === episode!.id) : -1;
    const toEp = (e?: EpisodeInfo) => (e ? { id: e.id, name: e.name, season: e.season, number: e.number, still: e.still, runtimeSec: e.runtimeSec } : null);

    logEvent('play', { titleId: t.id, userId: req.user!.id, meta: epId ? { episode: epId } : undefined });
    res.json({
      title: { id: t.id, slug: t.slug, type: t.type, title: t.title, backdrop: t.backdrop_url ?? t.poster_url },
      episode: toEp(episode),
      next: toEp(i >= 0 ? episodes[i + 1] : undefined),
      prev: toEp(i > 0 ? episodes[i - 1] : undefined),
      sources: sources.map((s) => ({ url: `/api/me/stream/${t.slug}/${s.id}${episode ? `?episode=${episode.id}` : ''}`, kind: s.kind, codec: s.codec, quality: s.quality, primary: !!s.isPrimary })),
      subtitles: subs.map((s) => ({ id: s.id, lang: s.lang, label: s.label, src: `/api/subtitles/${s.id}.vtt` })),
      resume: prog && !prog.completed && prog.position_sec > 15 ? { position: prog.position_sec, duration: prog.duration_sec } : null,
    });
  })
);

// Same-origin playback keeps the provider credential on the server and avoids
// CDN hotlink limits. Only catalog sources can be streamed, never arbitrary URLs.
meRouter.get('/stream/:slug/:source', route(async (req, res) => {
  const title = db.prepare("SELECT maturity, type FROM titles WHERE slug = ? AND status = ? AND external_key LIKE 'animedoc:%'").get(req.params.slug, 'published') as { maturity: string; type: string } | undefined;
  if (!title) throw notFound('That movie is unavailable.');
  const sourceId = parse(z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/), req.params.source);
  let episode: EpisodeInfo | undefined;
  if (req.query.episode) {
    const episodeId = parse(z.coerce.number().int().positive(), req.query.episode);
    const titleId = db.prepare('SELECT id FROM titles WHERE slug = ?').pluck().get(req.params.slug) as number;
    episode = orderedEpisodes(titleId).find((e) => e.id === episodeId);
    if (!episode) throw notFound('That episode is unavailable.');
  }
  if (title.type === 'series' && !episode) throw badRequest('Choose an episode to play.');
  const sources = await movieSources(req.params.slug, episode);
  const source = sources?.find((s) => s.id === sourceId);
  if (!source) throw notFound('This video source is unavailable.');
  const url = new URL('https://api.animedoc.cloud/api/v2/anime/stream-file/');
  url.searchParams.set('video_url', source.url);
  // Limit the initial open-ended request so browsers can discover MP4 metadata
  // without waiting on a multi-gigabyte response. Subsequent ranges stay intact.
  const range = req.headers.range === 'bytes=0-' || !req.headers.range ? 'bytes=0-1048575' : req.headers.range;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  res.on('close', () => controller.abort());
  let upstream: globalThis.Response;
  try {
    upstream = await fetch(url, {
      headers: { 'X-API-Key': config.animedocApiKey, Range: range },
      signal: controller.signal, redirect: 'error',
    });
  } catch {
    throw new HttpError(502, 'The movie stream is unavailable. Please try again.', 'movie_stream');
  } finally { clearTimeout(timeout); }
  if (!upstream.ok && upstream.status !== 416) {
    await upstream.body?.cancel();
    const retryAfter = upstream.headers.get('retry-after');
    if (retryAfter) res.set('Retry-After', retryAfter);
    throw new HttpError(upstream.status === 429 ? 503 : 502,
      upstream.status === 403 ? 'Your AnimeDoc API plan does not include streaming. Enable stream proxy access on your AnimeDoc account.' : upstream.status === 429 ? 'AnimeDoc’s request limit has been reached. Please try again shortly.' : 'The movie stream is unavailable. Please try again.', 'movie_stream');
  }
  res.status(upstream.status);
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const value = upstream.headers.get(name);
    if (value) res.set(name, value);
  }
  if (req.method === 'HEAD' || !upstream.body) {
    await upstream.body?.cancel();
    return res.end();
  }
  res.flushHeaders();
  Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream)
    .on('error', () => { if (!res.destroyed) res.destroy(); }).pipe(res);
}));

const progressBody = z.object({
  titleId: z.number().int().positive(),
  episodeId: z.number().int().positive().nullable().optional(),
  position: z.number().min(0).max(60 * 60 * 12),
  duration: z.number().min(1).max(60 * 60 * 12),
});

/** Called every few seconds by the player (and via sendBeacon on exit). */
meRouter.post(
  '/progress',
  route((req, res) => {
    const body = parse(progressBody, typeof req.body === 'string' ? JSON.parse(req.body) : req.body);
    const pid = req.profile!.id;
    const epId = body.episodeId ?? 0;
    const title = availableTitle(req, body.titleId);
    if (body.position > body.duration) throw badRequest('Playback position cannot exceed the video duration.');
    if (title.type === 'series' && !epId) throw badRequest('Choose an episode before saving series progress.');
    if (title.type === 'movie' && epId) throw badRequest('Movies do not have episodes.');
    if (epId && !db.prepare('SELECT 1 FROM episodes WHERE id = ? AND title_id = ?').get(epId, body.titleId)) throw badRequest('Unknown episode.');

    const remaining = body.duration - body.position;
    const completed = body.position / body.duration > 0.95 || (body.duration > 600 && remaining < 90) ? 1 : 0;
    const t = now();
    const prev = db.prepare('SELECT completed FROM progress WHERE profile_id = ? AND title_id = ? AND episode_id = ?').get(pid, body.titleId, epId) as
      | { completed: number }
      | undefined;
    db.prepare(
      `INSERT INTO progress (profile_id, title_id, episode_id, position_sec, duration_sec, completed, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (profile_id, title_id, episode_id) DO UPDATE SET position_sec = excluded.position_sec,
         duration_sec = excluded.duration_sec, completed = excluded.completed, updated_at = excluded.updated_at`
    ).run(pid, body.titleId, epId, body.position, body.duration, completed, t);

    // One history entry per sitting (6h window); later updates extend it.
    const recent = db
      .prepare('SELECT id FROM history WHERE profile_id = ? AND title_id = ? AND episode_id = ? AND watched_at > ? ORDER BY watched_at DESC LIMIT 1')
      .get(pid, body.titleId, epId, t - 6 * 3_600_000) as { id: number } | undefined;
    if (recent) db.prepare('UPDATE history SET watched_at = ?, seconds = MAX(seconds, ?) WHERE id = ?').run(t, body.position, recent.id);
    else db.prepare('INSERT INTO history (profile_id, title_id, episode_id, watched_at, seconds) VALUES (?, ?, ?, ?, ?)').run(pid, body.titleId, epId, t, body.position);

    if (completed && !prev?.completed) logEvent('complete', { titleId: body.titleId, userId: req.user!.id });
    res.json({ ok: true, completed: !!completed });
  })
);

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------

meRouter.get('/list', (req, res) => {
  const ids = db.prepare('SELECT title_id FROM watchlist WHERE profile_id = ? ORDER BY added_at DESC').pluck().all(req.profile!.id) as number[];
  res.json({ items: cards(ids, aud(req)) });
});

meRouter.put(
  '/list/:titleId',
  route((req, res) => {
    const id = intParam(req.params.titleId);
    availableTitle(req, id);
    db.prepare('INSERT OR IGNORE INTO watchlist (profile_id, title_id, added_at) VALUES (?, ?, ?)').run(req.profile!.id, id, now());
    res.json({ ok: true, inList: true });
  })
);

meRouter.delete(
  '/list/:titleId',
  route((req, res) => {
    db.prepare('DELETE FROM watchlist WHERE profile_id = ? AND title_id = ?').run(req.profile!.id, intParam(req.params.titleId));
    res.json({ ok: true, inList: false });
  })
);

// ---------------------------------------------------------------------------
// Ratings
// ---------------------------------------------------------------------------

meRouter.put(
  '/ratings/:titleId',
  route((req, res) => {
    const id = intParam(req.params.titleId);
    const { score } = parse(z.object({ score: z.number().int().min(1).max(10) }), req.body);
    availableTitle(req, id);
    db.prepare(
      'INSERT INTO ratings (profile_id, title_id, score, rated_at) VALUES (?, ?, ?, ?) ON CONFLICT (profile_id, title_id) DO UPDATE SET score = excluded.score, rated_at = excluded.rated_at'
    ).run(req.profile!.id, id, score, now());
    invalidate();
    res.json({ ok: true, rating: getIndex().byId.get(id)?.card.rating ?? null, myRating: score });
  })
);

meRouter.delete(
  '/ratings/:titleId',
  route((req, res) => {
    const id = intParam(req.params.titleId);
    db.prepare('DELETE FROM ratings WHERE profile_id = ? AND title_id = ?').run(req.profile!.id, id);
    invalidate();
    res.json({ ok: true, rating: getIndex().byId.get(id)?.card.rating ?? null, myRating: null });
  })
);

// ---------------------------------------------------------------------------
// History & recommendations
// ---------------------------------------------------------------------------

meRouter.get('/history', (req, res) => {
  const rows = db
    .prepare(
      `SELECT h.id, h.title_id, h.episode_id, h.watched_at, h.seconds, e.name AS episode_name, e.number AS episode_number, s.number AS season_number
         FROM history h LEFT JOIN episodes e ON e.id = h.episode_id LEFT JOIN seasons s ON s.id = e.season_id
        WHERE h.profile_id = ? ORDER BY h.watched_at DESC LIMIT 200`
    )
    .all(req.profile!.id) as {
    id: number;
    title_id: number;
    episode_id: number;
    watched_at: number;
    seconds: number;
    episode_name: string | null;
    episode_number: number | null;
    season_number: number | null;
  }[];
  const idx = getIndex();
  res.json({
    items: rows
      .map((r) => {
        const entry = idx.byId.get(r.title_id);
        if (!entry || !visible(entry, aud(req))) return null;
        const card = entry.card;
        return {
          id: r.id,
          watchedAt: r.watched_at,
          seconds: r.seconds,
          title: card,
          episode: r.episode_id ? { id: r.episode_id, name: r.episode_name, label: `S${r.season_number}:E${r.episode_number}` } : null,
        };
      })
      .filter(Boolean),
  });
});

meRouter.delete('/history', (req, res) => {
  db.transaction(() => {
    db.prepare('DELETE FROM history WHERE profile_id = ?').run(req.profile!.id);
    db.prepare('DELETE FROM progress WHERE profile_id = ?').run(req.profile!.id);
  })();
  res.json({ ok: true });
});

meRouter.delete(
  '/history/:id',
  route((req, res) => {
    db.prepare('DELETE FROM history WHERE id = ? AND profile_id = ?').run(intParam(req.params.id), req.profile!.id);
    res.json({ ok: true });
  })
);

meRouter.get('/recommendations', (req, res) => {
  const rec = recommendFor(req.profile!.id, aud(req), 36);
  res.json(rec);
});
