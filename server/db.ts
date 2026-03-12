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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_scores_score ON scores(score DESC);
`);

export interface ScoreEntry {
  id: number;
  name: string;
  score: number;
  death_cause: string | null;
  distance: number | null;
  time_survived: number | null;
  created_at: string;
}

export function getTopScores(limit: number = 100): ScoreEntry[] {
  const stmt = db.prepare('SELECT * FROM scores ORDER BY score DESC LIMIT ?');
  return stmt.all(limit) as ScoreEntry[];
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
  name: string,
  score: number,
  deathCause: string | null,
  distance: number | null,
  timeSurvived: number | null,
): ScoreEntry {
  const stmt = db.prepare(
    'INSERT INTO scores (name, score, death_cause, distance, time_survived) VALUES (?, ?, ?, ?, ?)',
  );
  const info = stmt.run(name, score, deathCause, distance, timeSurvived);
  const inserted = db.prepare('SELECT * FROM scores WHERE id = ?').get(info.lastInsertRowid) as ScoreEntry;
  return inserted;
}

export function insertScores(entries: Array<{
  name: string;
  score: number;
  deathCause?: string | null;
  distance?: number | null;
  timeSurvived?: number | null;
}>): void {
  const stmt = db.prepare(
    'INSERT INTO scores (name, score, death_cause, distance, time_survived) VALUES (?, ?, ?, ?, ?)',
  );
  const insertMany = db.transaction((rows: typeof entries) => {
    for (const e of rows) {
      stmt.run(e.name, e.score, e.deathCause ?? null, e.distance ?? null, e.timeSurvived ?? null);
    }
  });
  insertMany(entries);
}

export default db;
