import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'scores.db');

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    score INTEGER NOT NULL,
    death_cause TEXT,
    distance INTEGER,
    time_survived INTEGER,
    apples_collected INTEGER,
    tyskies_collected INTEGER,
    pills_collected INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_scores_score ON scores(score DESC);
`);

// Players who signed in with Google. Only the stable Google id is kept, never the email
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_sub TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Add new columns if missing (existing DBs). user_id is null for the scores saved before sign-in existed
for (const col of ['apples_collected', 'tyskies_collected', 'pills_collected', 'max_level', 'max_combo', 'user_id']) {
  try {
    db.exec(`ALTER TABLE scores ADD COLUMN ${col} INTEGER`);
  } catch {
    // Column already exists
  }
}

// A signed-in player's stats and achievements, as one JSON document: it follows them from device to device
db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    user_id INTEGER PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Karaluch Dnia: a score from the daily run carries its day, and is on that day's board instead of the all-time one
try {
  db.exec('ALTER TABLE scores ADD COLUMN daily TEXT');
} catch {
  // Column already exists
}
db.exec('CREATE INDEX IF NOT EXISTS idx_scores_daily ON scores(daily, score DESC)');

export interface ScoreEntry {
  id: number;
  name: string;
  score: number;
  death_cause: string | null;
  distance: number | null;
  time_survived: number | null;
  apples_collected: number | null;
  tyskies_collected: number | null;
  pills_collected: number | null;
  max_level: number | null;
  max_combo: number | null;
  daily: string | null;
  created_at: string;
}

export interface User {
  id: number;
  name: string;
}

export function getUser(id: number): User | null {
  return (db.prepare('SELECT id, name FROM users WHERE id = ?').get(id) as User | undefined) ?? null;
}

/** The account behind a Google id, created on the first sign-in with Google's first name as its name. */
export function findOrCreateGoogleUser(googleSub: string, name: string): User {
  db.prepare('INSERT OR IGNORE INTO users (google_sub, name) VALUES (?, ?)').run(googleSub, name);
  return db.prepare('SELECT id, name FROM users WHERE google_sub = ?').get(googleSub) as User;
}

/** Renames a player everywhere, their scores on the board included. */
export const renameUser = db.transaction((id: number, name: string): User => {
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, id);
  db.prepare('UPDATE scores SET name = ? WHERE user_id = ?').run(name, id);
  return getUser(id)!;
});

/** Forgets a player completely: the account and every score it saved. */
export const deleteUser = db.transaction((id: number): void => {
  db.prepare('DELETE FROM scores WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM profiles WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
});

/** The all-time board: every saved run that wasn't a daily one. */
export function getProfile(userId: number): unknown {
  const row = db.prepare('SELECT data FROM profiles WHERE user_id = ?').get(userId) as { data: string } | undefined;
  return row ? JSON.parse(row.data) : null;
}

export function saveProfile(userId: number, data: unknown): void {
  db.prepare(`
    INSERT INTO profiles (user_id, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP
  `).run(userId, JSON.stringify(data));
}

export function getTopScores(limit: number = 100): ScoreEntry[] {
  const stmt = db.prepare('SELECT * FROM scores WHERE daily IS NULL ORDER BY score DESC LIMIT ?');
  return stmt.all(limit) as ScoreEntry[];
}

/** One day's board: each player once, with their best run of that day. */
export function getDailyScores(date: string, limit: number = 100): ScoreEntry[] {
  const stmt = db.prepare(`
    SELECT id, user_id, name, score, death_cause, distance, time_survived, apples_collected, tyskies_collected,
           pills_collected, max_level, max_combo, daily, created_at
    FROM (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY score DESC, id) AS place
      FROM scores WHERE daily = ?
    )
    WHERE place = 1 ORDER BY score DESC LIMIT ?
  `);
  return stmt.all(date, limit) as ScoreEntry[];
}

export function getPlayerBest(name: string): { entry: ScoreEntry | null; rank: number | null } {
  const entryStmt = db.prepare('SELECT * FROM scores WHERE name = ? ORDER BY score DESC LIMIT 1');
  const entry = entryStmt.get(name) as ScoreEntry | undefined;
  if (!entry) return { entry: null, rank: null };

  const rankStmt = db.prepare('SELECT COUNT(*) as rank FROM scores WHERE score > ?');
  const result = rankStmt.get(entry.score) as { rank: number };
  return { entry, rank: result.rank + 1 };
}

export function insertScore(
  userId: number,
  name: string,
  score: number,
  deathCause: string | null,
  distance: number | null,
  timeSurvived: number | null,
  applesCollected: number | null,
  tyskiesCollected: number | null,
  pillsCollected: number | null,
  maxLevel: number | null = null,
  maxCombo: number | null = null,
  daily: string | null = null,
): ScoreEntry {
  const stmt = db.prepare(
    'INSERT INTO scores (user_id, name, score, death_cause, distance, time_survived, apples_collected, tyskies_collected, pills_collected, max_level, max_combo, daily) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const info = stmt.run(userId, name, score, deathCause, distance, timeSurvived, applesCollected, tyskiesCollected, pillsCollected, maxLevel, maxCombo, daily);
  const inserted = db.prepare('SELECT * FROM scores WHERE id = ?').get(info.lastInsertRowid) as ScoreEntry;
  return inserted;
}

export default db;
