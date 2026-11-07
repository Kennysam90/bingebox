import type { Statement } from 'better-sqlite3';
import { db, now } from './db.js';

export type EventType = 'view' | 'play' | 'signup' | 'login' | 'search' | 'complete';

let insert: Statement | undefined;

/** Records a lightweight analytics event. Never throws into request handling. */
export function logEvent(type: EventType, opts: { titleId?: number; userId?: number; meta?: unknown } = {}) {
  try {
    insert ??= db.prepare('INSERT INTO events (type, title_id, user_id, meta, created_at) VALUES (?, ?, ?, ?, ?)');
    insert.run(type, opts.titleId ?? null, opts.userId ?? null, opts.meta === undefined ? null : JSON.stringify(opts.meta), now());
  } catch (err) {
    console.warn('[events] failed to record', type, err);
  }
}
