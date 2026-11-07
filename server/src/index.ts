import compression from 'compression';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { adminRouter } from './admin.js';
import { accountRouter, authRouter, loadSession, profilesRouter, pruneAuthTables, requireAppHeader } from './auth.js';
import { catalogRouter } from './catalog.js';
import { config } from './config.js';
import { db, migrate } from './db.js';
import { errorHandler, notFound } from './http.js';
import { meRouter } from './me.js';
import { initializeApp } from './seed.js';
import { subtitlesRouter } from './subtitles.js';

if (config.isProd && (!process.env.ADMIN_PASSWORD || !config.appUrl)) {
  console.error('Refusing to start: set ADMIN_PASSWORD and APP_URL in production (see server/.env.example).');
  process.exit(1);
}

migrate();
initializeApp();
pruneAuthTables();
setInterval(pruneAuthTables, 6 * 3_600_000).unref();

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', 1);

// Hosts the web app loads media and artwork from, for the Content Security Policy.
const providerHosts = config.animedocApiKey ? ['https://*.aoneroom.com', 'https://*.hakunaymatata.com'] : [];
const mediaHosts = [...config.authorisedVideoHosts.map((h) => `https://${h}`), ...providerHosts];
const imageHosts = ['https://upload.wikimedia.org', 'https://thumb.wikimedia.org', 'https://archive.org', 'https://*.archive.org', ...providerHosts];

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', ...imageHosts],
        mediaSrc: ["'self'", 'blob:', ...mediaHosts],
        connectSrc: ["'self'", ...mediaHosts],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    strictTransportSecurity: config.isProd,
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));

// Optional CORS for a separately hosted frontend (same-origin needs none).
app.use('/api', (req, res, next) => {
  const origin = req.get('origin');
  if (origin && config.allowedOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE');
      res.set('Access-Control-Allow-Headers', 'Content-Type,X-BingeBox-Client');
      res.set('Access-Control-Max-Age', '600');
      return res.sendStatus(204);
    }
  }
  next();
});

app.use('/api', loadSession, requireAppHeader);
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.get('/api/health', (_req, res) => {
  const titles = db.prepare('SELECT COUNT(*) FROM titles').pluck().get();
  res.json({ ok: true, titles, uptime: Math.round(process.uptime()) });
});
app.use('/api/auth', authRouter);
app.use('/api/profiles', profilesRouter);
app.use('/api/account', accountRouter);
app.use('/api/me', meRouter);
app.use('/api/admin', adminRouter);
app.use('/api/subtitles', subtitlesRouter);
app.use('/api', catalogRouter);
app.use('/api', (_req, _res, next) => next(notFound('No such API endpoint.')));

app.use(
  '/uploads',
  express.static(config.uploadsDir, {
    maxAge: '30d',
    immutable: true,
    fallthrough: false,
    setHeaders: (res, file) => {
      if (file.endsWith('.vtt')) res.set('Content-Type', 'text/vtt; charset=utf-8');
    },
  })
);

// In production the same server hosts the built web app (npm run build).
const distDir = path.resolve(config.root, '..', 'dist');
if (existsSync(path.join(distDir, 'index.html'))) {
  app.use('/assets', express.static(path.join(distDir, 'assets'), { maxAge: '1y', immutable: true }));
  app.use(express.static(distDir, { maxAge: '1h', index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

app.use(errorHandler);

const server = app.listen(config.port, () => {
  console.log(`BingeBox API listening on http://localhost:${config.port}`);
});

function shutdown(signal: string) {
  console.log(`\n${signal} received — shutting down`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
