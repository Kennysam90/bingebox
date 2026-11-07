import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// scrypt parameters (N=2^15, r=8, p=1) ≈ OWASP's recommended minimum.
const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

/** Returns "scrypt$N$r$p$salt$hash" (base64url parts). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return ['scrypt', N, R, P, salt.toString('base64url'), hash.toString('base64url')].join('$');
}

export function verifyPassword(password: string, stored: string): boolean {
  const [alg, n, r, p, saltB64, hashB64] = stored.split('$');
  if (alg !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64url');
  const actual = scryptSync(password.normalize('NFKC'), Buffer.from(saltB64, 'base64url'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAXMEM,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** A hash to compare against when the email is unknown, so timing doesn't reveal which accounts exist. */
export const DUMMY_HASH = hashPassword(randomBytes(12).toString('hex'));

export const newToken = () => randomBytes(32).toString('base64url');
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** At least 8 characters with a letter and a number. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (password.length > 200) return 'That password is too long.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Include at least one letter and one number.';
  return null;
}
