import { config } from './config.js';
import { db, now } from './db.js';
import { hashPassword } from './security.js';
import { PUBLIC_GENRES } from './public-genres.js';

/** Initialise taxonomy and the administrator. Titles come exclusively from AnimeDoc. */
export function initializeApp() {
  db.transaction(() => {
    PUBLIC_GENRES.forEach((g, sort) => db.prepare('INSERT OR IGNORE INTO genres (slug, name, sort) VALUES (?, ?, ?)')
      .run(g.slug, g.name, sort));
    if (db.prepare("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1").get()) return;
    const id = Number(db.prepare("INSERT INTO users (email, name, password_hash, role, created_at) VALUES (?, ?, ?, 'admin', ?)")
      .run(config.admin.email, config.admin.name, hashPassword(config.admin.password), now()).lastInsertRowid);
    db.prepare("INSERT INTO profiles (user_id, name, avatar, created_at) VALUES (?, 'Admin', 'crimson', ?)").run(id, now());
  })();
}
