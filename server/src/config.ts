import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Load server/.env without a dependency (Node ≥ 20.12).
try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  /* no .env file — rely on the real environment */
}

const env = process.env;
const isProd = env.NODE_ENV === 'production';

export const config = {
  animedocApiKey: env.ANIMEDOC_API_KEY ?? '',
  resendApiKey: env.RESEND_API_KEY ?? '',
  emailFrom: env.EMAIL_FROM ?? '',
  isProd,
  port: Number(env.PORT ?? 8787),
  root: ROOT,
  dataDir: path.resolve(ROOT, env.DATA_DIR ?? 'data'),
  dbFile: path.resolve(ROOT, env.DATABASE_FILE ?? 'data/bingebox.db'),
  uploadsDir: path.resolve(ROOT, env.UPLOADS_DIR ?? 'data/uploads'),
  /** Public URL of the web app, used in password-reset links (defaults to the requesting host). */
  appUrl: env.APP_URL ? env.APP_URL.replace(/\/$/, '') : null,
  allowedOrigins: (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  sessionDays: Number(env.SESSION_DAYS ?? 30),
  admin: {
    email: (env.ADMIN_EMAIL ?? 'admin@bingebox.local').toLowerCase(),
    password: env.ADMIN_PASSWORD ?? 'BingeBox!2026',
    name: env.ADMIN_NAME ?? 'BingeBox Admin',
  },
  /** Dev convenience: return reset links in the API response instead of only logging them. */
  exposeResetLinks: !isProd && env.EXPOSE_RESET_LINKS !== 'false',
  /**
   * Hosts that video sources may point at. Admins can only save streams from
   * these authorised origins (plus files uploaded to BingeBox itself).
   * Add your licensed CDN here via AUTHORISED_VIDEO_HOSTS (comma-separated).
   */
  authorisedVideoHosts: (
    env.AUTHORISED_VIDEO_HOSTS ??
    ''
  )
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  /** Trust X-Forwarded-* headers (set when behind a proxy / load balancer). */
  trustProxy: env.TRUST_PROXY === 'true',
};
