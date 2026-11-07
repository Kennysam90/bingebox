import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';

test('accounts, profiles, watchlists, recovery, playback validation and admin', async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bingebox-flows-'));
  Object.assign(process.env, { DATABASE_FILE: path.join(dir, 'audit.db'), DATA_DIR: dir, UPLOADS_DIR: path.join(dir, 'uploads'),
    NODE_ENV: 'test', ANIMEDOC_API_KEY: 'isolated-test-key', RESEND_API_KEY: '', EMAIL_FROM: '', EXPOSE_RESET_LINKS: 'true',
    ADMIN_EMAIL: 'admin@audit.local', ADMIN_PASSWORD: 'AuditAdmin!2026' });
  const { db, migrate } = await import('../src/db.js');
  const { initializeApp } = await import('../src/seed.js');
  const { authRouter, accountRouter, profilesRouter, loadSession, requireAppHeader } = await import('../src/auth.js');
  const { meRouter } = await import('../src/me.js');
  const { adminRouter } = await import('../src/admin.js');
  const { errorHandler } = await import('../src/http.js');
  const { refreshMovieDetail } = await import('../src/animedoc.js');
  migrate(); initializeApp();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const u = new URL(String(input));
    if (u.hostname !== 'api.animedoc.cloud') return originalFetch(input, init);
    const series = u.searchParams.get('detailPath') === 'audit-series';
    const data = u.pathname.endsWith('/detail/') ? { subject: { subjectId: series ? '9000000000000000002' : '9000000000000000001',
      subjectType: series ? 2 : 1, title: series ? 'Audit Series' : 'Audit Movie', detailPath: series ? 'audit-series' : 'audit-movie',
      description: 'A detailed synopsis from the isolated test provider.', genre: 'Drama', cover: 'https://pbcdn.aoneroom.com/audit.jpg', duration: 600 },
      stars: [], resource: { seasons: series ? [{ se: 1, maxEp: 2 }] : [] } } : { downloads: [{ id: 'audit-source', url: 'https://bcdnw.hakunaymatata.com/audit.mp4', resolution: 1080, codecName: 'h264' }], captions: [] };
    return Response.json({ code: 0, data });
  }) as typeof fetch;
  await refreshMovieDetail('animedoc-audit-movie'); await refreshMovieDetail('animedoc-audit-series');
  const movie = db.prepare("SELECT id, slug FROM titles WHERE type='movie'").get() as { id: number; slug: string };
  const series = db.prepare("SELECT id, slug FROM titles WHERE type='series'").get() as { id: number; slug: string };
  const episode = db.prepare('SELECT id FROM episodes WHERE title_id=? ORDER BY number').get(series.id) as { id: number };
  const app = express(); app.use(cookieParser(), express.json(), loadSession, requireAppHeader);
  app.use('/auth', authRouter); app.use('/account', accountRouter); app.use('/profiles', profilesRouter);
  app.use('/me', meRouter); app.use('/admin', adminRouter); app.use(errorHandler);
  const server = app.listen(0); await new Promise<void>((r) => server.once('listening', r));
  const base = `http://localhost:${(server.address() as { port: number }).port}`;
  function client() {
    let cookie = '';
    return { async request(url: string, method = 'GET', body?: unknown, csrf = true) {
      const form = body instanceof FormData;
      const r = await originalFetch(base + url, { method, headers: { Cookie: cookie, ...(csrf ? { 'X-BingeBox-Client': 'web' } : {}), ...(!form && body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body === undefined ? undefined : form ? body : JSON.stringify(body) });
      const setCookie = r.headers.get('set-cookie'); if (setCookie) cookie = setCookie.split(';')[0];
      return { status: r.status, data: await r.json(), cookieHeader: setCookie };
    } };
  }
  const a = client(), b = client(), admin = client(), guest = client();
  const password = 'ViewerAudit!2026'; let mainProfile = 0;
  try {
    await t.test('signup, account editing, sessions and access controls', async () => {
      const signed = await a.request('/auth/signup', 'POST', { name: 'Audit Viewer A', email: 'a@audit.local', password });
      assert.equal(signed.status, 201); mainProfile = signed.data.profile.id;
      assert(signed.cookieHeader?.includes('HttpOnly')); assert(signed.cookieHeader?.includes('SameSite=Lax'));
      assert.equal((await b.request('/auth/signup', 'POST', { name: 'Audit Viewer B', email: 'b@audit.local', password })).status, 201);
      assert.equal((await a.request('/account', 'PATCH', { name: 'Updated Name' })).status, 200);
      assert.equal((await a.request('/auth/me')).data.user.name, 'Updated Name');
      assert.equal((await a.request('/account', 'PATCH', { name: 'Blocked' }, false)).status, 403);
      assert.equal((await guest.request('/me/list')).status, 401);
      assert.equal((await a.request('/admin/stats')).status, 403);
      assert.equal((await b.request(`/profiles/${mainProfile}/select`, 'POST', {})).status, 404);
    });
    await t.test('watchlists, ratings, progress, history and profile isolation', async () => {
      assert.equal((await a.request(`/me/list/${movie.id}`, 'PUT', {})).status, 200);
      assert.equal((await a.request('/me/list')).data.items.length, 1);
      assert.equal((await b.request('/me/list')).data.items.length, 0);
      assert.equal((await a.request(`/me/ratings/${movie.id}`, 'PUT', { score: 8 })).status, 200);
      assert.equal((await a.request(`/me/ratings/${movie.id}`, 'PUT', { score: 11 })).status, 400);
      assert.equal((await a.request('/me/progress', 'POST', { titleId: movie.id, position: 60, duration: 600 })).status, 200);
      assert.equal((await a.request('/me/continue')).data.items[0].progress.position, 60);
      assert.equal((await a.request('/me/history')).data.items.length, 1);
      assert.equal((await b.request('/me/history')).data.items.length, 0);
      assert.equal((await a.request('/me/play/' + movie.slug)).data.resume.position, 60);
      await a.request(`/me/list/${movie.id}`, 'DELETE'); assert.equal((await a.request('/me/list')).data.items.length, 0);
      await a.request('/me/history', 'DELETE'); assert.equal((await a.request('/me/history')).data.items.length, 0);
      assert.equal((await a.request('/me/continue')).data.items.length, 0);
    });
    await t.test('episode selection and progress validation', async () => {
      assert.equal((await a.request(`/me/play/${series.slug}?episode=${episode.id}`)).status, 200);
      assert.equal((await a.request(`/me/play/${series.slug}?episode=999999`)).status, 404);
      assert.equal((await a.request(`/me/play/${series.slug}?episode=not-a-number`)).status, 400);
      assert.equal((await a.request('/me/progress', 'POST', { titleId: series.id, position: 10, duration: 600 })).status, 400);
      assert.equal((await a.request('/me/progress', 'POST', { titleId: movie.id, position: 700, duration: 600 })).status, 400);
    });
    await t.test('kids profiles cannot save, rate or track restricted titles', async () => {
      const created = await a.request('/profiles', 'POST', { name: 'Kids', avatar: 'sunny', isKids: true });
      assert.equal(created.status, 201);
      const kidId = created.data.profiles.find((p: { isKids: boolean }) => p.isKids).id;
      await a.request(`/profiles/${kidId}/select`, 'POST', {});
      try {
        assert.equal((await a.request('/me/play/' + movie.slug)).status, 403);
        assert.equal((await a.request(`/me/list/${movie.id}`, 'PUT', {})).status, 403);
        assert.equal((await a.request(`/me/ratings/${movie.id}`, 'PUT', { score: 8 })).status, 403);
        assert.equal((await a.request('/me/progress', 'POST', { titleId: movie.id, position: 10, duration: 600 })).status, 403);
      } finally { await a.request(`/profiles/${mainProfile}/select`, 'POST', {}); }
    });
    await t.test('admin analytics, uploads and user management', async () => {
      assert.equal((await admin.request('/auth/login', 'POST', { email: 'admin@audit.local', password: 'AuditAdmin!2026' })).status, 200);
      assert.equal((await admin.request('/admin/stats')).status, 200);
      assert.equal((await admin.request('/admin/users')).status, 200);
      assert.equal((await a.request('/admin/titles/import', 'POST', { titleId: movie.id })).status, 403);
      assert.equal((await admin.request('/admin/titles/import', 'POST', { titleId: movie.id })).data.title.id, movie.id);
      assert.equal((await admin.request('/admin/titles/import', 'POST', { detailPath: 'audit-series' })).data.title.id, series.id);
      assert.equal((await admin.request('/admin/titles/import', 'POST', { detailPath: 'https://example.com/movie' })).status, 400);
      assert.equal((await admin.request('/admin/titles/import', 'POST', { titleId: 999999 })).status, 404);
      const subtitles = new FormData(); subtitles.append('file', new Blob(['1\n00:00:01,000 --> 00:00:02,000\nHello\n']), 'test.srt');
      assert.equal((await admin.request('/admin/uploads/subtitle', 'POST', subtitles)).status, 201);
      const badImage = new FormData(); badImage.append('file', new Blob(['not an image']), 'bad.jpg');
      assert.equal((await admin.request('/admin/uploads/image', 'POST', badImage)).status, 400);
      const bUser = (await b.request('/auth/me')).data.user.id;
      assert.equal((await admin.request(`/admin/users/${bUser}`, 'PATCH', { status: 'suspended' })).status, 200);
      assert.equal((await b.request('/me/list')).status, 401);
      await admin.request(`/admin/users/${bUser}`, 'PATCH', { status: 'active' });
      assert.equal((await admin.request('/admin/users/1', 'PATCH', { role: 'user' })).status, 400);
    });
    await t.test('recovery links are single-use and revoke old sessions', async () => {
      const reset = await guest.request('/auth/forgot-password', 'POST', { email: 'a@audit.local' });
      assert.equal(reset.status, 200); assert(reset.data.devResetLink);
      const token = new URL(reset.data.devResetLink).searchParams.get('token');
      assert.notEqual(db.prepare('SELECT token_hash FROM password_resets').pluck().get(), token);
      assert.equal((await guest.request('/auth/reset-password', 'POST', { token, password: 'NewViewer!2026' })).status, 200);
      assert.equal((await guest.request('/auth/reset-password', 'POST', { token, password: 'AnotherViewer!2026' })).status, 400);
      assert.equal((await a.request('/me/list')).status, 401);
      assert.equal((await a.request('/auth/login', 'POST', { email: 'a@audit.local', password })).status, 401);
      assert.equal((await a.request('/auth/login', 'POST', { email: 'a@audit.local', password: 'NewViewer!2026' })).status, 200);
      assert.equal((await a.request('/auth/logout', 'POST', {})).status, 200);
      assert.equal((await a.request('/me/list')).status, 401);
    });
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>((r) => server.close(() => r())); db.close(); rmSync(dir, { recursive: true, force: true });
  }
});
