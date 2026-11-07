import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';

/** An error with an HTTP status and a message that is safe to show users. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, 'bad_request', details);
export const unauthorized = (msg = 'Please sign in to continue.') => new HttpError(401, msg, 'unauthorized');
export const forbidden = (msg = "You don't have access to that.") => new HttpError(403, msg, 'forbidden');
export const notFound = (msg = 'Not found.') => new HttpError(404, msg, 'not_found');

/** Wraps an async handler so rejected promises reach the error middleware. */
export const route =
  (fn: (req: Request, res: Response, next: NextFunction) => unknown): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export function parse<S extends ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw zodToHttp(result.error);
  return result.data;
}

function zodToHttp(err: ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) fields[issue.path.join('.') || '_'] ??= issue.message;
  const first = Object.entries(fields)[0];
  return badRequest(first ? (first[0] === '_' ? first[1] : `${first[0]}: ${first[1]}`) : 'Invalid request.', { fields });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  void _next;
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { message: err.message, code: err.code, details: err.details } });
    return;
  }
  // Multer and body-parser errors carry their own status codes.
  const e = err as { status?: number; statusCode?: number; code?: string; message?: string; type?: string };
  if (e?.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: { message: 'That file is too large.', code: 'too_large' } });
    return;
  }
  if (e?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { message: 'Malformed JSON body.', code: 'bad_json' } });
    return;
  }
  const status = e?.status ?? e?.statusCode;
  if (status && status >= 400 && status < 500) {
    res.status(status).json({ error: { message: e.message ?? 'Bad request.', code: e.code } });
    return;
  }
  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({ error: { message: 'Something went wrong on our side. Please try again.', code: 'internal' } });
}

export const intParam = (value: unknown, name = 'id') => {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw badRequest(`Invalid ${name}.`);
  return n;
};
