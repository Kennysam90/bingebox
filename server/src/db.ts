import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

mkdirSync(path.dirname(config.dbFile), { recursive: true });

export const db = new Database(config.dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

/**
 * Schema migrations, applied in order and recorded in `schema_migrations`.
 * Never edit a shipped migration — add a new one.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
    status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
    created_at    INTEGER NOT NULL,
    last_login_at INTEGER
  );

  CREATE TABLE profiles (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    avatar     TEXT NOT NULL DEFAULT 'ember',
    is_kids    INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX profiles_user ON profiles(user_id);

  CREATE TABLE sessions (
    id          TEXT PRIMARY KEY,            -- sha256 of the cookie token
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    profile_id  INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    user_agent  TEXT,
    ip          TEXT
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at    INTEGER
  );

  CREATE TABLE genres (
    id          INTEGER PRIMARY KEY,
    slug        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    description TEXT,
    sort        INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE titles (
    id             INTEGER PRIMARY KEY,
    slug           TEXT NOT NULL UNIQUE,
    external_key   TEXT UNIQUE,
    type           TEXT NOT NULL CHECK (type IN ('movie','series')),
    title          TEXT NOT NULL,
    tagline        TEXT,
    synopsis       TEXT NOT NULL DEFAULT '',
    about          TEXT,
    release_date   TEXT,
    year           INTEGER,
    end_year       INTEGER,
    runtime_min    INTEGER,
    maturity       TEXT NOT NULL DEFAULT 'NR',
    poster_url     TEXT,
    backdrop_url   TEXT,
    thumbnail_url  TEXT,
    trailer_url    TEXT,
    imdb_id        TEXT,
    wikidata_id    TEXT,
    country        TEXT,
    language       TEXT,
    tags           TEXT NOT NULL DEFAULT '[]',
    popularity     REAL NOT NULL DEFAULT 0,
    featured       INTEGER NOT NULL DEFAULT 0,
    status         TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','draft')),
    rights_kind    TEXT NOT NULL DEFAULT 'licensed',
    rights_license TEXT,
    rights_attribution TEXT,
    rights_source_url  TEXT,
    synopsis_source    TEXT,
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL
  );
  CREATE INDEX titles_type ON titles(type, status);
  CREATE INDEX titles_created ON titles(created_at);
  CREATE INDEX titles_popularity ON titles(popularity);

  CREATE TABLE title_genres (
    title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
    PRIMARY KEY (title_id, genre_id)
  );
  CREATE INDEX title_genres_genre ON title_genres(genre_id);

  CREATE TABLE people (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    photo_url   TEXT,
    wikidata_id TEXT UNIQUE
  );

  CREATE TABLE credits (
    id        INTEGER PRIMARY KEY,
    title_id  INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    role      TEXT NOT NULL,
    character TEXT,
    ord       INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX credits_title ON credits(title_id);
  CREATE INDEX credits_person ON credits(person_id);

  CREATE TABLE seasons (
    id       INTEGER PRIMARY KEY,
    title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    number   INTEGER NOT NULL,
    name     TEXT NOT NULL,
    UNIQUE (title_id, number)
  );

  CREATE TABLE episodes (
    id          INTEGER PRIMARY KEY,
    title_id    INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    season_id   INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    number      INTEGER NOT NULL,
    name        TEXT NOT NULL,
    synopsis    TEXT,
    runtime_sec INTEGER,
    still_url   TEXT
  );
  CREATE INDEX episodes_season ON episodes(season_id, number);
  CREATE INDEX episodes_title ON episodes(title_id);

  CREATE TABLE video_sources (
    id         INTEGER PRIMARY KEY,
    title_id   INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    episode_id INTEGER REFERENCES episodes(id) ON DELETE CASCADE,
    url        TEXT NOT NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('mp4','hls')),
    quality    TEXT NOT NULL DEFAULT 'Auto',
    is_primary INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX video_sources_title ON video_sources(title_id, episode_id);

  CREATE TABLE subtitles (
    id         INTEGER PRIMARY KEY,
    title_id   INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    episode_id INTEGER REFERENCES episodes(id) ON DELETE CASCADE,
    lang       TEXT NOT NULL,
    label      TEXT NOT NULL,
    url        TEXT NOT NULL
  );
  CREATE INDEX subtitles_title ON subtitles(title_id, episode_id);

  CREATE TABLE watchlist (
    profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title_id   INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    added_at   INTEGER NOT NULL,
    PRIMARY KEY (profile_id, title_id)
  );

  -- One row per profile+title+episode (episode 0 = the movie itself).
  CREATE TABLE progress (
    profile_id   INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title_id     INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    episode_id   INTEGER NOT NULL DEFAULT 0,
    position_sec REAL NOT NULL,
    duration_sec REAL NOT NULL,
    completed    INTEGER NOT NULL DEFAULT 0,
    updated_at   INTEGER NOT NULL,
    PRIMARY KEY (profile_id, title_id, episode_id)
  );
  CREATE INDEX progress_recent ON progress(profile_id, updated_at);

  CREATE TABLE history (
    id         INTEGER PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title_id   INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    episode_id INTEGER NOT NULL DEFAULT 0,
    watched_at INTEGER NOT NULL,
    seconds    REAL NOT NULL DEFAULT 0
  );
  CREATE INDEX history_profile ON history(profile_id, watched_at);

  CREATE TABLE ratings (
    profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title_id   INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    score      INTEGER NOT NULL CHECK (score BETWEEN 1 AND 10),
    rated_at   INTEGER NOT NULL,
    PRIMARY KEY (profile_id, title_id)
  );
  CREATE INDEX ratings_title ON ratings(title_id);

  CREATE TABLE events (
    id         INTEGER PRIMARY KEY,
    type       TEXT NOT NULL,             -- view | play | signup | login | search
    title_id   INTEGER,
    user_id    INTEGER,
    meta       TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX events_type_time ON events(type, created_at);

  CREATE VIRTUAL TABLE titles_fts USING fts5(
    title, people, genres, synopsis,
    tokenize='unicode61 remove_diacritics 2'
  );
  `,
  `
  ALTER TABLE titles ADD COLUMN provider_rating REAL;
  ALTER TABLE titles ADD COLUMN provider_rating_count INTEGER;
  ALTER TABLE titles ADD COLUMN provider_path TEXT;
  ALTER TABLE titles ADD COLUMN provider_edited INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE people ADD COLUMN provider_key TEXT;
  CREATE UNIQUE INDEX people_provider_key ON people(provider_key) WHERE provider_key IS NOT NULL;
  CREATE TABLE provider_exclusions (external_key TEXT PRIMARY KEY);
  `,
  `
  CREATE TABLE catalog_feeds (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL);
  DELETE FROM events WHERE title_id IN (SELECT id FROM titles WHERE external_key IS NULL OR external_key NOT LIKE 'animedoc:%')
    OR user_id IN (SELECT id FROM users WHERE email = 'demo@bingebox.local' AND name = 'Demo Viewer');
  DELETE FROM titles_fts WHERE rowid IN (SELECT id FROM titles WHERE external_key IS NULL OR external_key NOT LIKE 'animedoc:%');
  DELETE FROM titles WHERE external_key IS NULL OR external_key NOT LIKE 'animedoc:%';
  DELETE FROM users WHERE email = 'demo@bingebox.local' AND name = 'Demo Viewer';
  DELETE FROM people WHERE NOT EXISTS (SELECT 1 FROM credits WHERE person_id = people.id);
  `,
  `
  UPDATE titles SET language = 'Yoruba', country = CASE WHEN country IS NULL OR country = '' THEN 'Nigeria' ELSE country END
    WHERE id IN (SELECT tg.title_id FROM title_genres tg JOIN genres g ON g.id = tg.genre_id WHERE lower(g.slug) = 'yoruba');
  DELETE FROM genres WHERE lower(slug) = 'yoruba';
  `,
];

export function migrate() {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)`);
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').pluck().all() as number[]);
  MIGRATIONS.forEach((sql, i) => {
    const version = i + 1;
    if (applied.has(version)) return;
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, Date.now());
    })();
    console.log(`[db] applied migration ${version}`);
  });
}

function indexRow(titleId: number) {
  const t = db.prepare('SELECT id, title, synopsis FROM titles WHERE id = ?').get(titleId) as
    | { id: number; title: string; synopsis: string }
    | undefined;
  if (!t) return;
  const people = (db.prepare(`SELECT p.name FROM credits c JOIN people p ON p.id = c.person_id WHERE c.title_id = ?`).pluck().all(titleId) as string[]).join(' ');
  const genres = (db.prepare(`SELECT g.name FROM title_genres tg JOIN genres g ON g.id = tg.genre_id WHERE tg.title_id = ?`).pluck().all(titleId) as string[]).join(' ');
  db.prepare('INSERT INTO titles_fts (rowid, title, people, genres, synopsis) VALUES (?, ?, ?, ?, ?)').run(t.id, t.title, people, genres, t.synopsis);
}

/** Refreshes one title in the full-text index (or removes it if the title is gone). */
export function reindexTitle(titleId: number) {
  db.prepare('DELETE FROM titles_fts WHERE rowid = ?').run(titleId);
  indexRow(titleId);
}

export function rebuildSearchIndex() {
  db.transaction(() => {
    db.exec('DELETE FROM titles_fts');
    for (const id of db.prepare('SELECT id FROM titles').pluck().all() as number[]) indexRow(id);
  })();
}

export const now = () => Date.now();
