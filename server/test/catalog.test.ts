import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import express from 'express';
import { parseSearchQuery } from '../src/search-query.js';

test('search understands genre aliases, years and decades without losing the title', () => {
  const genres = [{ slug: 'science-fiction', name: 'Science Fiction' }, { slug: 'comedy', name: 'Comedy' }];
  assert.deepEqual(parseSearchQuery('sci-fi 2025', genres), { text: '', year: 2025, decade: undefined, genre: genres[0] });
  assert.deepEqual(parseSearchQuery('comedys 1920s', genres), { text: '', year: undefined, decade: 1920, genre: genres[1] });
  assert.equal(parseSearchQuery('Top Gun 2022', genres).text, 'top gun');
});

test('provider catalog, seasons, media and admin changes survive sync', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bingebox-test-'));
  process.env.DATABASE_FILE = path.join(dir, 'test.db');
  process.env.DATA_DIR = dir;
  process.env.UPLOADS_DIR = path.join(dir, 'uploads');
  process.env.ANIMEDOC_API_KEY = 'test-provider-secret';
  process.env.RESEND_API_KEY = 'test-email-secret';
  process.env.EMAIL_FROM = 'BingeBox <hello@example.com>';
  process.env.NODE_ENV = 'test';
  const { db, migrate } = await import('../src/db.js');
  migrate();
  // Simulate an existing installation before the provider-only migration.
  db.prepare("INSERT INTO titles (slug, external_key, type, title, created_at, updated_at) VALUES ('old-demo','archive-demo','movie','Seeded movie',0,0)").run();
  const oldId = db.prepare("SELECT id FROM titles WHERE slug='old-demo'").pluck().get() as number;
  db.prepare("INSERT INTO titles_fts (rowid, title) VALUES (?, 'Seeded movie')").run(oldId);
  db.prepare("INSERT INTO users (email, name, password_hash, created_at) VALUES ('demo@bingebox.local','Demo Viewer','unused',0)").run();
  db.exec('DROP TABLE catalog_feeds; DELETE FROM schema_migrations WHERE version = 3');
  migrate();
  assert.equal(db.prepare('SELECT COUNT(*) FROM titles').pluck().get(), 0);
  assert.equal(db.prepare('SELECT COUNT(*) FROM titles_fts').pluck().get(), 0);
  assert.equal(db.prepare("SELECT COUNT(*) FROM users WHERE email='demo@bingebox.local'").pluck().get(), 0);
  const { initializeApp } = await import('../src/seed.js');
  initializeApp();
  assert.equal(db.prepare('SELECT COUNT(*) FROM titles').pluck().get(), 0, 'Startup must not seed movies');
  const { refreshMovies, refreshMovieDetail, searchMovies, movieSources, providerSection, providerTrending, browseCatalog } = await import('../src/animedoc.js');
  const { catalogRouter } = await import('../src/catalog.js');
  const { adminRouter } = await import('../src/admin.js');
  const { meRouter } = await import('../src/me.js');
  const { errorHandler } = await import('../src/http.js');
  const { sendPasswordResetEmail } = await import('../src/email.js');
  const movie = { subjectId: '9007199254740993111', subjectType: 1, title: 'Test Film', detailPath: 'test-film-AbC123', genre: 'Action,Animation', releaseDate: '2025-04-01', rating: '8.2', cover: 'https://pbcdn.aoneroom.com/poster.jpg', description: 'A sufficiently detailed synopsis for the test movie.', trailer: 'https://macdn.aoneroom.com/trailer.mp4' };
  const series = { ...movie, subjectId: '9007199254740993222', subjectType: 2, title: 'Test Series', detailPath: 'test-series-XyZ123', genre: 'Drama', stills: null };
  const requests: URL[] = [];
  let streamRange = '';
  let emailBody: { to: string[]; text: string; html: string } | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === 'api.resend.com') {
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-email-secret');
      emailBody = JSON.parse(String(init?.body));
      return Response.json({ id: 'test-email-id' });
    }
    if (url.hostname !== 'api.animedoc.cloud') return originalFetch(input, init);
    requests.push(url);
    assert.equal(new Headers(init?.headers).get('X-API-Key'), 'test-provider-secret');
    if (url.pathname.endsWith('/stream-file/')) {
      streamRange = new Headers(init?.headers).get('Range') ?? '';
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 206, headers: { 'Content-Type': 'video/mp4', 'Content-Length': '4', 'Content-Range': 'bytes 0-3/100', 'Accept-Ranges': 'bytes' } });
    }
    let data: unknown;
    if (url.pathname.endsWith('/section/') && url.searchParams.get('id') === 'nollywood') data = {
      pager: { page: Number(url.searchParams.get('page') ?? 1), hasMore: true },
      items: [{ ...movie, subjectId: '666', detailPath: 'yoruba-drama-Unique', title: 'Yoruba Drama', genre: 'Yoruba,Drama', country: 'Nigeria' }],
    };
    else if (url.pathname.endsWith('/section/')) data = { featured: [movie, series], rows: [{ id: 'popular', title: 'Popular', items: [movie, series, { ...movie, subjectId: '333', detailPath: 'anime-film-Unique', title: 'Anime film', genre: 'Anime' }] }] };
    else if (url.pathname.endsWith('/trending/')) data = { items: [series, movie] };
    else if (url.pathname.endsWith('/browse/') && url.searchParams.get('genre') === 'Yoruba') data = {
      pager: { page: Number(url.searchParams.get('page')), hasMore: true },
      items: [{ ...movie, subjectId: '666', detailPath: 'yoruba-drama-Unique', title: 'Yoruba Drama', genre: 'yoruba,Drama', country: 'Nigeria' },
        { ...movie, subjectId: '667', detailPath: 'english-drama-Unique', title: 'English Drama', genre: 'Drama', country: 'Nigeria' }],
    };
    else if (url.pathname.endsWith('/browse/')) {
      const page = Number(url.searchParams.get('page'));
      data = { pager: { page, hasMore: page === 1 }, items: page === 1 ? [movie, { ...series, genre: 'Anime,Drama' }] : [
        { ...movie, subjectId: '444', detailPath: 'animation-on-page-two', title: 'Animation on page two', genre: 'Animation,Comedy' },
        { ...series, subjectId: '555', detailPath: 'anime-on-page-two', title: 'Anime on page two', genre: 'Anime,Drama' },
      ] };
    }
    else if (url.pathname.endsWith('/search/')) data = { items: [movie] };
    else if (url.pathname.endsWith('/detail/')) data = { subject: url.searchParams.get('detailPath') === series.detailPath ? series : movie, stars: [{ staffId: '111', name: 'Test Actor', character: 'Lead', avatarUrl: 'https://pbcdn.aoneroom.com/actor.jpg' }], resource: { seasons: [{ se: 1, maxEp: 3 }] } };
    else data = { downloads: url.searchParams.get('se') === '1' && url.searchParams.get('ep') === '1' && url.searchParams.get('subjectId') === movie.subjectId ? [] : [{ id: 'source-1080', url: 'https://bcdnw.hakunaymatata.com/test.mp4', resolution: 1080, codecName: 'h264' }], captions: [{ lan: 'en', lanName: 'English', url: 'https://cacdn.hakunaymatata.com/test.srt' }] };
    return Response.json({ code: 0, data });
  }) as typeof fetch;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 1, email: 'admin@example.com', name: 'Admin', role: 'admin', status: 'active', created_at: 0 }; req.profile = { id: 1, user_id: 1, name: 'Admin', is_kids: 0, avatar: 'ember' }; next(); });
  app.use('/admin', adminRouter);
  app.use('/me', meRouter);
  app.use('/catalog', catalogRouter);
  app.use(errorHandler);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;
  try {
    await refreshMovies();
    assert(providerSection('movie', {}).hero.every((c) => c.type === 'movie'));
    assert(providerSection('series', {}).hero.every((c) => c.type === 'series'));
    assert.deepEqual(providerTrending({}).map((c) => c.title), ['Test Series', 'Test Film'], 'Trending must preserve the provider order');
    assert.equal(db.prepare('SELECT COUNT(*) FROM titles').pluck().get(), 3, 'Animation must include anime as well as animated films');
    const animationQuery = { genre: 'animation', sort: 'popular', page: 1, pageSize: 30 };
    const pageOne = await browseCatalog(animationQuery, {});
    assert.equal(pageOne.items.length, 2);
    assert.equal(pageOne.hasMore, true, 'A short upstream page must not end pagination');
    assert.equal(pageOne.totalExact, false, 'A partial page must not be presented as the entire catalog count');
    const beforeCache = requests.length;
    await browseCatalog(animationQuery, {});
    assert.equal(requests.length, beforeCache, 'Repeated pages should reuse provider cache');
    const pageTwo = await originalFetch(`http://localhost:${port}/catalog/titles?genre=animation&page=2`);
    const second = await pageTwo.json();
    assert.equal(pageTwo.status, 200);
    assert(second.items.some((t: { title: string }) => t.title === 'Animation on page two'));
    assert(second.items.some((t: { title: string }) => t.title === 'Anime on page two'));
    assert.equal(second.hasMore, false);
    const moviePage = await browseCatalog({ ...animationQuery, type: 'movie', page: 2 }, {});
    assert(moviePage.items.every((t) => t.type === 'movie'));
    assert(moviePage.items.some((t) => t.title === 'Animation on page two'));
    const sparse = await browseCatalog({ ...animationQuery, year: 2024 }, {});
    assert.equal(sparse.items.length, 0);
    assert.equal(sparse.hasMore, true, 'A locally filtered empty page must not truncate the upstream catalog');
    await browseCatalog({ ...animationQuery, genre: 'science-fiction', type: 'movie' }, {});
    assert(requests.some((u) => u.pathname.endsWith('/browse/') && u.searchParams.get('genre') === 'Sci-Fi' && u.searchParams.get('channelId') === '1'));
    await browseCatalog({ ...animationQuery, genre: 'action', type: 'series' }, {});
    assert(requests.some((u) => u.pathname.endsWith('/browse/') && u.searchParams.get('genre') === 'Action' && u.searchParams.get('channelId') === '2'));
    assert(requests.some((u) => u.pathname.endsWith('/browse/') && u.searchParams.get('channelId') === '1006' && u.searchParams.get('page') === '2'));
    const yoruba = await browseCatalog({ ...animationQuery, genre: undefined, collection: 'nollywood', language: 'yoruba' }, {});
    assert.equal(yoruba.items[0]?.title, 'Yoruba Drama');
    assert(yoruba.items.every((t) => t.title === 'Yoruba Drama'), 'Do not mislabel all Nigerian movies as Yoruba');
    assert(requests.some((u) => u.pathname.endsWith('/browse/') && u.searchParams.get('country') === 'Nigeria' && u.searchParams.get('genre') === 'Yoruba'));
    await browseCatalog({ ...animationQuery, genre: undefined, collection: 'nollywood' }, {});
    assert(requests.some((u) => u.searchParams.get('id') === 'nollywood'));
    const yorubaTitle = db.prepare("SELECT language, country FROM titles WHERE external_key='animedoc:666'").get() as { language: string; country: string };
    assert.equal(yorubaTitle.language, 'Yoruba');
    assert.equal(yorubaTitle.country, 'Nigeria');
    assert(!yoruba.items[0].genreSlugs.includes('yoruba'));
    const categories = await originalFetch(`http://localhost:${port}/catalog/genres`);
    const genreNames = (await categories.json()).genres.map((g: { name: string }) => g.name);
    assert.deepEqual(genreNames, ['Action', 'Comedy', 'Horror', 'Thriller', 'Sci-Fi', 'Romance', 'Drama', 'Crime', 'Adventure', 'Animation']);
    const stored = db.prepare('SELECT * FROM titles WHERE external_key = ?').get(`animedoc:${movie.subjectId}`) as { id: number; slug: string; provider_rating: number };
    assert.equal(stored.provider_rating, 8.2);
    await refreshMovieDetail(stored.slug);
    assert.equal(db.prepare('SELECT COUNT(*) FROM credits WHERE title_id = ?').pluck().get(stored.id), 1);
    const source = await movieSources(stored.slug);
    assert.equal(source?.[0].quality, '1080p');
    assert.equal(source?.[0].codec, 'h264');
    assert(requests.some((u) => u.pathname.endsWith('/media-sources/') && u.searchParams.get('se') === '0'));
    assert(!requests.some((u) => u.pathname.endsWith('/media-sources/') && u.searchParams.get('subjectId') === movie.subjectId && u.searchParams.get('se') === '1'), 'Movies should start with 0/0 without wasting a request on 1/1');
    const playback = await originalFetch(`http://localhost:${port}/me/play/${stored.slug}`);
    const playing = await playback.json();
    assert.equal(playback.status, 200);
    assert(playing.sources[0].url.endsWith('/source-1080'));
    const streamed = await originalFetch(`http://localhost:${port}${playing.sources[0].url.replace('/api/me/', '/me/')}`, { headers: { Range: 'bytes=0-' } });
    assert.equal(streamed.status, 206);
    assert.equal((await streamed.arrayBuffer()).byteLength, 4);
    assert.equal(streamRange, 'bytes=0-1048575');
    const seriesTitle = db.prepare('SELECT id, slug FROM titles WHERE type = ?').get('series') as { id: number; slug: string };
    await refreshMovieDetail(seriesTitle.slug);
    const episodes = db.prepare('SELECT id, number FROM episodes WHERE title_id = ? ORDER BY number').all(seriesTitle.id) as { id: number; number: number }[];
    assert.equal(episodes.length, 3);
    await movieSources(seriesTitle.slug, { ...episodes[1], season: 1 });
    assert(requests.some((u) => u.searchParams.get('ep') === '2'));
    assert.equal(db.prepare('SELECT COUNT(*) FROM subtitles WHERE episode_id = ?').pluck().get(episodes[1].id), 1);
    const get = await originalFetch(`http://localhost:${port}/admin/titles/${stored.id}`);
    const editable = (await get.json()).title;
    const update = await originalFetch(`http://localhost:${port}/admin/titles/${stored.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...editable, title: 'Editor’s choice' }) });
    assert.equal(update.status, 200, await update.text());
    await searchMovies('changed test');
    assert.equal(db.prepare('SELECT title FROM titles WHERE id = ?').pluck().get(stored.id), 'Editor’s choice');
    const deleted = await originalFetch(`http://localhost:${port}/admin/titles/${stored.id}`, { method: 'DELETE' });
    assert.equal(deleted.status, 200);
    await searchMovies('deleted test');
    assert.equal(db.prepare('SELECT COUNT(*) FROM titles WHERE id = ?').pluck().get(stored.id), 0, 'Deleted provider titles must not reappear');
    await sendPasswordResetEmail('viewer@example.com', 'https://bingebox.example/reset-password?token=test-token');
    assert.equal(emailBody?.to[0], 'viewer@example.com');
    assert(emailBody?.text.includes('token=test-token'));
    assert(emailBody?.html.includes('Reset password'));
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
