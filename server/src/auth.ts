import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from './config.js';
import { db, now } from './db.js';
import { logEvent } from './events.js';
import { badRequest, forbidden, HttpError, intParam, notFound, parse, route, unauthorized } from './http.js';
import { DUMMY_HASH, hashPassword, newToken, passwordProblem, sha256, verifyPassword } from './security.js';
import { emailConfigured, sendPasswordResetEmail } from './email.js';

export const SESSION_COOKIE = 'bb_session';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  created_at: number;
}
export interface AuthProfile {
  id: number;
  user_id: number;
  name: string;
  avatar: string;
  is_kids: number;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
    profile?: AuthProfile;
    sessionId?: string;
  }
}

export const AVATARS = ['ember', 'crimson', 'ocean', 'violet', 'forest', 'sunny', 'slate', 'rose'] as const;
const MAX_PROFILES = 5;

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

function cookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.isProd,
    path: '/',
    maxAge: maxAgeMs,
  };
}

function startSession(req: Request, res: Response, userId: number, profileId: number | null) {
  const token = newToken();
  const t = now();
  const ttl = config.sessionDays * 86_400_000;
  db.prepare('INSERT INTO sessions (id, user_id, profile_id, created_at, expires_at, user_agent, ip) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    sha256(token),
    userId,
    profileId,
    t,
    t + ttl,
    (req.get('user-agent') ?? '').slice(0, 300),
    req.ip ?? null
  );
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(t, userId);
  res.cookie(SESSION_COOKIE, token, cookieOptions(ttl));
}

/** Attaches req.user / req.profile when a valid session cookie is present. Never rejects. */
export function loadSession(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === 'string' && token.length > 20) {
    const id = sha256(token);
    const row = db
      .prepare(
        `SELECT s.id AS sid, s.expires_at, s.profile_id, u.id, u.email, u.name, u.role, u.status, u.created_at
           FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`
      )
      .get(id) as (AuthUser & { sid: string; expires_at: number; profile_id: number | null }) | undefined;
    if (row && row.expires_at > now() && row.status === 'active') {
      req.sessionId = row.sid;
      req.user = { id: row.id, email: row.email, name: row.name, role: row.role, status: row.status, created_at: row.created_at };
      if (row.profile_id) {
        req.profile = db.prepare('SELECT id, user_id, name, avatar, is_kids FROM profiles WHERE id = ? AND user_id = ?').get(row.profile_id, row.id) as
          | AuthProfile
          | undefined;
      }
      // Fall back to the account's first profile so personal features always have one.
      if (!req.profile) {
        req.profile = db.prepare('SELECT id, user_id, name, avatar, is_kids FROM profiles WHERE user_id = ? ORDER BY id LIMIT 1').get(row.id) as
          | AuthProfile
          | undefined;
      }
    }
  }
  next();
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.user || !req.profile) return next(unauthorized());
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'admin') return next(forbidden('Administrator access is required.'));
  next();
}

/**
 * CSRF defence for cookie-authenticated writes: browsers can't send custom
 * headers cross-site without a CORS preflight, which we never approve for
 * foreign origins. Combined with SameSite=Lax cookies.
 */
export function requireAppHeader(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-bingebox-client') !== 'web') return next(forbidden('Missing client header.'));
  next();
}

// ---------------------------------------------------------------------------
// Serialisers
// ---------------------------------------------------------------------------

export const publicUser = (u: AuthUser) => ({ id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.created_at });
export const publicProfile = (p: AuthProfile) => ({ id: p.id, name: p.name, avatar: p.avatar, isKids: false });

const listProfiles = (userId: number) =>
  (db.prepare('SELECT id, user_id, name, avatar, is_kids FROM profiles WHERE user_id = ? ORDER BY id').all(userId) as AuthProfile[]).map(publicProfile);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Too many attempts. Please wait a few minutes and try again.', code: 'rate_limited' } },
});

const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254);
const password = z.string().min(1, 'Enter your password.').max(200);

export const authRouter = Router();

authRouter.get('/me', (req, res) => {
  if (!req.user) return res.json({ user: null, profile: null, profiles: [] });
  res.json({ user: publicUser(req.user), profile: req.profile ? publicProfile(req.profile) : null, profiles: listProfiles(req.user.id) });
});

authRouter.post(
  '/signup',
  authLimiter,
  route((req, res) => {
    const body = parse(z.object({ name: z.string().trim().min(1, 'Enter your name.').max(60), email, password: z.string().max(200) }), req.body);
    const problem = passwordProblem(body.password);
    if (problem) throw badRequest(problem, { fields: { password: problem } });
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(body.email)) {
      throw new HttpError(409, 'An account with that email already exists. Try signing in instead.', 'email_taken', { fields: { email: 'Already registered.' } });
    }
    const t = now();
    const userId = Number(
      db.prepare('INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)').run(body.email, body.name, hashPassword(body.password), t)
        .lastInsertRowid
    );
    const firstName = body.name.split(/\s+/)[0].slice(0, 20);
    const profileId = Number(db.prepare(`INSERT INTO profiles (user_id, name, avatar, created_at) VALUES (?, ?, 'ember', ?)`).run(userId, firstName, t).lastInsertRowid);
    startSession(req, res, userId, profileId);
    logEvent('signup', { userId });
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as AuthUser;
    res.status(201).json({ user: publicUser(user), profile: listProfiles(userId)[0], profiles: listProfiles(userId) });
  })
);

authRouter.post(
  '/login',
  authLimiter,
  route((req, res) => {
    const body = parse(z.object({ email, password }), req.body);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(body.email) as (AuthUser & { password_hash: string }) | undefined;
    const ok = verifyPassword(body.password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) throw new HttpError(401, 'That email and password combination is not right.', 'invalid_credentials');
    if (user.status !== 'active') throw forbidden('This account has been suspended. Contact support for help.');
    const profiles = listProfiles(user.id);
    startSession(req, res, user.id, profiles.length === 1 ? profiles[0].id : null);
    logEvent('login', { userId: user.id });
    res.json({ user: publicUser(user), profile: profiles[0] ?? null, profiles, chooseProfile: profiles.length > 1 });
  })
);

authRouter.post('/logout', (req, res) => {
  if (req.sessionId) db.prepare('DELETE FROM sessions WHERE id = ?').run(req.sessionId);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

authRouter.post(
  '/forgot-password',
  authLimiter,
  route(async (req, res) => {
    if (config.isProd && !emailConfigured()) throw new HttpError(503, 'Password recovery is temporarily unavailable. Please try again later.', 'email_unavailable');
    const body = parse(z.object({ email }), req.body);
    const user = db.prepare(`SELECT id, email FROM users WHERE email = ? AND status = 'active'`).get(body.email) as { id: number; email: string } | undefined;
    let devLink: string | undefined;
    if (user) {
      const token = newToken();
      const t = now();
      db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id);
      db.prepare('INSERT INTO password_resets (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(sha256(token), user.id, t, t + 60 * 60_000);
      // Production always uses APP_URL (never request headers, which can be forged).
      // In development the browser's Origin points at whichever port Vite is on.
      const origin = req.get('origin');
      const base = config.appUrl ?? (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ? origin : `${req.protocol}://${req.get('host')}`);
      const link = `${base}/reset-password?token=${token}`;
      await sendPasswordResetEmail(user.email, link);
      if (config.exposeResetLinks && !emailConfigured()) devLink = link;
    }
    // Same answer whether or not the account exists.
    res.json({ ok: true, message: 'If that email has an account, a reset link is on its way.', devResetLink: devLink });
  })
);

authRouter.post(
  '/reset-password',
  authLimiter,
  route((req, res) => {
    const body = parse(z.object({ token: z.string().min(20).max(200), password: z.string().max(200) }), req.body);
    const problem = passwordProblem(body.password);
    if (problem) throw badRequest(problem, { fields: { password: problem } });
    const row = db.prepare('SELECT user_id, expires_at, used_at FROM password_resets WHERE token_hash = ?').get(sha256(body.token)) as
      | { user_id: number; expires_at: number; used_at: number | null }
      | undefined;
    if (!row || row.used_at || row.expires_at < now()) throw badRequest('This reset link is invalid or has expired. Request a new one.');
    db.transaction(() => {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(body.password), row.user_id);
      db.prepare('UPDATE password_resets SET used_at = ? WHERE token_hash = ?').run(now(), sha256(body.token));
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id); // sign out everywhere
    })();
    res.json({ ok: true });
  })
);

// --- Profiles --------------------------------------------------------------

export const profilesRouter = Router();
profilesRouter.use(requireUser);

const profileBody = z.object({
  name: z.string().trim().min(1, 'Give the profile a name.').max(20),
  avatar: z.enum(AVATARS).default('ember'),
  isKids: z.literal(false, { errorMap: () => ({ message: 'Kids profiles have been removed. Create a standard profile.' }) }).optional(),
});

profilesRouter.get('/', (req, res) => res.json({ profiles: listProfiles(req.user!.id), current: publicProfile(req.profile!) }));

profilesRouter.post(
  '/',
  route((req, res) => {
    const body = parse(profileBody, req.body);
    const count = db.prepare('SELECT COUNT(*) FROM profiles WHERE user_id = ?').pluck().get(req.user!.id) as number;
    if (count >= MAX_PROFILES) throw badRequest(`An account can have up to ${MAX_PROFILES} profiles.`);
    db.prepare('INSERT INTO profiles (user_id, name, avatar, is_kids, created_at) VALUES (?, ?, ?, ?, ?)').run(
      req.user!.id,
      body.name,
      body.avatar,
      0,
      now()
    );
    res.status(201).json({ profiles: listProfiles(req.user!.id) });
  })
);

profilesRouter.patch(
  '/:id',
  route((req, res) => {
    const id = intParam(req.params.id);
    const body = parse(profileBody.partial(), req.body);
    const p = db.prepare('SELECT * FROM profiles WHERE id = ? AND user_id = ?').get(id, req.user!.id) as AuthProfile | undefined;
    if (!p) throw notFound('Profile not found.');
    db.prepare('UPDATE profiles SET name = ?, avatar = ?, is_kids = ? WHERE id = ?').run(
      body.name ?? p.name,
      body.avatar ?? p.avatar,
      0,
      id
    );
    res.json({ profiles: listProfiles(req.user!.id) });
  })
);

profilesRouter.delete(
  '/:id',
  route((req, res) => {
    const id = intParam(req.params.id);
    const count = db.prepare('SELECT COUNT(*) FROM profiles WHERE user_id = ?').pluck().get(req.user!.id) as number;
    if (count <= 1) throw badRequest('Every account needs at least one profile.');
    const info = db.prepare('DELETE FROM profiles WHERE id = ? AND user_id = ?').run(id, req.user!.id);
    if (!info.changes) throw notFound('Profile not found.');
    res.json({ profiles: listProfiles(req.user!.id) });
  })
);

profilesRouter.post(
  '/:id/select',
  route((req, res) => {
    const id = intParam(req.params.id);
    const p = db.prepare('SELECT id, user_id, name, avatar, is_kids FROM profiles WHERE id = ? AND user_id = ?').get(id, req.user!.id) as AuthProfile | undefined;
    if (!p) throw notFound('Profile not found.');
    db.prepare('UPDATE sessions SET profile_id = ? WHERE id = ?').run(id, req.sessionId);
    res.json({ profile: publicProfile(p) });
  })
);

// --- Account ---------------------------------------------------------------

export const accountRouter = Router();
accountRouter.use(requireUser);

accountRouter.patch(
  '/',
  route((req, res) => {
    const body = parse(z.object({ name: z.string().trim().min(1).max(60) }), req.body);
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(body.name, req.user!.id);
    res.json({ user: publicUser({ ...req.user!, name: body.name }) });
  })
);

accountRouter.post(
  '/password',
  authLimiter,
  route((req, res) => {
    const body = parse(z.object({ currentPassword: password, newPassword: z.string().max(200) }), req.body);
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as { password_hash: string };
    if (!verifyPassword(body.currentPassword, row.password_hash)) throw badRequest('Your current password is not right.', { fields: { currentPassword: 'Incorrect.' } });
    const problem = passwordProblem(body.newPassword);
    if (problem) throw badRequest(problem, { fields: { newPassword: problem } });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(body.newPassword), req.user!.id);
    // Keep this session, end all others.
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(req.user!.id, req.sessionId);
    res.json({ ok: true });
  })
);

accountRouter.get('/sessions', (req, res) => {
  const rows = db
    .prepare('SELECT id, created_at, user_agent, ip FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC')
    .all(req.user!.id, now()) as { id: string; created_at: number; user_agent: string; ip: string }[];
  res.json({ sessions: rows.map((r) => ({ createdAt: r.created_at, userAgent: r.user_agent, current: r.id === req.sessionId })) });
});

accountRouter.post('/sessions/revoke-others', (req, res) => {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(req.user!.id, req.sessionId);
  res.json({ ok: true });
});

/** Housekeeping: drop expired sessions and reset tokens. */
export function pruneAuthTables() {
  const t = now();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(t);
  db.prepare('DELETE FROM password_resets WHERE expires_at < ?').run(t - 86_400_000);
}
