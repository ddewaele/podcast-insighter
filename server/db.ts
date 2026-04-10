import Database from 'better-sqlite3'
import { join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const DB_PATH = join(__dirname, '..', 'data', 'app.db')

export const db = new Database(DB_PATH)

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    google_id   TEXT UNIQUE NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    avatar_url  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transcripts (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title         TEXT NOT NULL,
    youtube_url   TEXT,
    video_id      TEXT,
    status        TEXT NOT NULL DEFAULT 'ready',
    is_public     INTEGER NOT NULL DEFAULT 0,
    json_path     TEXT,
    error_message TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id            TEXT PRIMARY KEY,
    transcript_id TEXT REFERENCES transcripts(id) ON DELETE SET NULL,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    youtube_url   TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'queued',
    progress      INTEGER NOT NULL DEFAULT 0,
    detail        TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

// --- User queries ---

export interface DbUser {
  id: string
  google_id: string
  email: string
  name: string
  avatar_url: string | null
  created_at: string
}

export const userQueries = {
  findByGoogleId: db.prepare<[string], DbUser>(
    'SELECT * FROM users WHERE google_id = ?'
  ),
  findById: db.prepare<[string], DbUser>(
    'SELECT * FROM users WHERE id = ?'
  ),
  create: db.prepare<[string, string, string, string, string | null]>(
    'INSERT INTO users (id, google_id, email, name, avatar_url) VALUES (?, ?, ?, ?, ?)'
  ),
}

// --- Transcript queries ---

export interface DbTranscript {
  id: string
  user_id: string
  title: string
  youtube_url: string | null
  video_id: string | null
  status: string
  is_public: number
  json_path: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export const transcriptQueries = {
  // All public transcripts + own transcripts
  listForUser: db.prepare<[string], DbTranscript & { owner_name: string; owner_avatar: string | null }>(`
    SELECT t.*, u.name as owner_name, u.avatar_url as owner_avatar
    FROM transcripts t
    JOIN users u ON t.user_id = u.id
    WHERE t.is_public = 1 OR t.user_id = ?
    ORDER BY t.created_at DESC
  `),
  findById: db.prepare<[string], DbTranscript>(
    'SELECT * FROM transcripts WHERE id = ?'
  ),
  create: db.prepare<[string, string, string, string | null, string | null, string, string | null]>(
    `INSERT INTO transcripts (id, user_id, title, youtube_url, video_id, status, json_path)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ),
  updateStatus: db.prepare<[string, string | null, string | null, string]>(
    `UPDATE transcripts SET status = ?, json_path = ?, error_message = ?, updated_at = datetime('now')
     WHERE id = ?`
  ),
  updateVisibility: db.prepare<[number, string]>(
    `UPDATE transcripts SET is_public = ?, updated_at = datetime('now') WHERE id = ?`
  ),
  delete: db.prepare<[string]>(
    'DELETE FROM transcripts WHERE id = ?'
  ),
}

// --- Job queries ---

export interface DbJob {
  id: string
  transcript_id: string | null
  user_id: string
  youtube_url: string
  status: string
  progress: number
  detail: string | null
  created_at: string
  updated_at: string
}

export const jobQueries = {
  findById: db.prepare<[string], DbJob>(
    'SELECT * FROM jobs WHERE id = ?'
  ),
  create: db.prepare<[string, string, string]>(
    `INSERT INTO jobs (id, user_id, youtube_url) VALUES (?, ?, ?)`
  ),
  update: db.prepare<[string, number, string | null, string | null, string]>(
    `UPDATE jobs SET status = ?, progress = ?, detail = ?, transcript_id = ?, updated_at = datetime('now')
     WHERE id = ?`
  ),
}
