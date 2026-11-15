/**
 * A player's lifetime stats as the server counts them: built only from runs it has checked (runs.ts) and matches it ran
 * (multiplayer.ts), never from the profile a client saves. The achievements are paid from these (economy.ts), the
 * endless board and the dash missions read the checkpoints from them. The profile a client saves (db.ts profiles) is
 * still kept, for the client's own page on every device, but nothing is paid from it.
 */
import db from './db';
import { BOSS_WINS, type Stats } from './achievements';
import { BOSS_TRIGGER_DISTANCE, CHECKPOINT_STARTS, ENDLESS_START } from './bossDistances';
import {
  BEER_CHANCE, BOSS_FIGHTS, bossesOf, busySlots, cruiseSpeed, distancePoints, eventPoints, lessonApples, levelAt, luckyShare, PILL_CHANCE,
  richSlots, slotsUpTo, wallsIn,
} from './runBounds';
import { parseProfile } from './validate';

export const EMPTY_STATS: Stats = {
  runs: 0, distance: 0, apples: 0, beers: 0, pills: 0, nearMisses: 0, dashThroughs: 0, wallsBroken: 0, kills: 0, dailyRuns: 0,
  matches: 0, matchWins: 0, seconds: 0, bestScore: 0, bestDistance: 0, bestLevel: 0, bestCombo: 0,
  checkpoints: 0,
  lodziaWins: 0, bigosWins: 0, zlewiatanWins: 0, eksterminatorWins: 0, noHitBossWins: 0, allBossRuns: 0, moultSaves: 0,
  bestKills: 0, pacifistRuns: 0, endlessRuns: 0, endlessBestLevel: 0, endlessBestDistance: 0, missionsDone: 0, itemsOwned: 0,
};

db.exec(`
  CREATE TABLE IF NOT EXISTS player_stats (
    user_id INTEGER PRIMARY KEY,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS migrations (
    name TEXT PRIMARY KEY,
    done_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

/**
 * The ceilings of the one-time seed: about twice the largest account the game had when it began counting runs
 * (production on 2026-11-15: 31 runs, 13 752 m, best 21 177 points at 2 830 m, combo 292, 1 182 apples, 87 close calls;
 * nobody past DJ Bigos yet), the best distance a quarter over the longest run (short of the endless levels' cards). They only bound the seed from the profiles saved before this release: no profile feeds
 * the stats after it.
 */
const SEED_CEILINGS: Partial<Record<keyof Stats, number>> = {
  runs: 62, distance: 27_504, apples: 2_364, beers: 372, pills: 50, nearMisses: 174, dashThroughs: 236, wallsBroken: 46, kills: 14,
  dailyRuns: 8, matches: 4, matchWins: 4, seconds: 4_230, bestScore: 42_354, bestDistance: 3_500, bestCombo: 584, checkpoints: 2,
  lodziaWins: 6, noHitBossWins: 6, bigosWins: 0, zlewiatanWins: 0, eksterminatorWins: 0, allBossRuns: 0, moultSaves: 0, bestKills: 0,
  pacifistRuns: 0, endlessRuns: 0, endlessBestLevel: 0, endlessBestDistance: 0, missionsDone: 0, itemsOwned: 0,
};

/** The fastest a roach ever runs (m/s): the speed formula's top, dashing, on a pill. */
const TOP_SPEED_MS = ((cruiseSpeed(Infinity, 25) + 300) * 1.5) / 50;

/** The most one run from 0 m to `distance` can hold, by the run bounds (runBounds.ts): what each total may grow by a run. */
function perRun(distance: number) {
  const { slots, wallSlots } = slotsUpTo(0, distance, bossesOf(false));
  const rich = richSlots(slots);
  const walls = wallsIn(wallSlots);
  const lessons = lessonApples(0, distance);
  const beers = luckyShare(rich, BEER_CHANCE);
  const pills = luckyShare(rich, PILL_CHANCE);
  const enemies = rich + walls;
  const events = busySlots(slots) + lessons;
  const fights = bossesOf(false).filter(at => at <= distance + 2)
    .reduce((sum, at) => sum + BOSS_FIGHTS[Object.keys(BOSS_TRIGGER_DISTANCE).find(id => (BOSS_TRIGGER_DISTANCE as Record<string, number>)[id] === at)!].cap, 0);
  // A generous time for it: no slower than 4 m/s, and a minute more
  const seconds = distance / 4 + 60;
  const score = distancePoints(0, distance) + seconds + fights
    + eventPoints({ apples: rich + lessons, beers, pills, nearMisses: enemies, dashThroughs: walls, kills: 0 }, events, levelAt(distance));
  return { apples: rich + lessons, beers, pills, enemies, walls, events, score };
}

/**
 * A profile saved before the server counted runs, made consistent: every stat held to what its own runs and best
 * distance allow, and to the seed's ceilings. A stat that fails is held to the consistent value; nothing is thrown away.
 * Board rows are neither needed nor used (only one account in eight had any).
 */
export function consistentStats(claimed: Record<string, number>): Stats {
  const seeded = { ...EMPTY_STATS };
  const take = (key: keyof Stats, ...bounds: number[]): number => {
    seeded[key] = Math.max(0, Math.floor(Math.min(claimed[key] ?? 0, SEED_CEILINGS[key] ?? Infinity, ...bounds)));
    return seeded[key];
  };
  const runs = take('runs');
  const seconds = take('seconds');
  // Not faster than the fastest roach, no more than its runs times its best
  let bestDistance = Math.min(claimed.bestDistance ?? 0, SEED_CEILINGS.bestDistance!);
  const distance = take('distance', runs * bestDistance, seconds * TOP_SPEED_MS);
  // A best from the endless start counts the 2 600 m it starts at; any other best is metres run
  bestDistance = take('bestDistance', distance + ENDLESS_START, runs > 0 ? Infinity : 0);
  take('bestLevel', levelAt(bestDistance));
  const run = perRun(bestDistance);
  take('bestScore', run.score);
  take('bestCombo', run.events);
  take('apples', runs * run.apples);
  take('beers', runs * run.beers);
  take('pills', runs * run.pills);
  take('nearMisses', runs * run.enemies);
  take('dashThroughs', runs * run.enemies);
  take('wallsBroken', runs * run.walls);
  const matches = take('matches', runs);
  take('matchWins', matches);
  take('dailyRuns', runs);
  // A boss beaten only by an account whose best got past him; the pistol from Bigos, the moult from Zlewiatan
  const past = (at: number): boolean => bestDistance > at + 2;
  let wins = 0;
  for (const [id, key] of Object.entries(BOSS_WINS)) wins += take(key, past((BOSS_TRIGGER_DISTANCE as Record<string, number>)[id]) ? runs : 0);
  take('checkpoints', CHECKPOINT_STARTS.filter(past).length);
  take('noHitBossWins', wins);
  take('allBossRuns', seeded.eksterminatorWins);
  const gun = past(BOSS_TRIGGER_DISTANCE.bigos) ? run.enemies : 0;
  take('kills', runs * gun);
  take('bestKills', gun);
  take('moultSaves', past(BOSS_TRIGGER_DISTANCE.zlewiatan) ? runs : 0);
  take('pacifistRuns', past(BOSS_TRIGGER_DISTANCE.zlewiatan) ? runs : 0);
  take('endlessRuns', past(ENDLESS_START) ? runs : 0);
  take('endlessBestDistance', bestDistance);
  take('endlessBestLevel', seeded.bestLevel);
  // The server's own records, never a client's
  seeded.missionsDone = 0;
  seeded.itemsOwned = 0;
  return seeded;
}

/**
 * Once, on the first start with this table: every account's stats begin where its saved profile stood, made
 * consistent (consistentStats), so nobody loses their progress. Achievements already paid stay paid; a raised reward is
 * topped up where the seeded stats reach it (economy.ts). After it, only checked runs count: a profile saved later
 * never feeds these.
 */
const SEED = 'player_stats_from_profiles';
if (!db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(SEED)) {
  db.transaction(() => {
    const rows = db.prepare('SELECT user_id, data FROM profiles').all() as { user_id: number; data: string }[];
    const insert = db.prepare('INSERT OR IGNORE INTO player_stats (user_id, data) VALUES (?, ?)');
    for (const row of rows) {
      let saved: unknown = null;
      try { saved = JSON.parse(row.data); } catch { /* a broken row seeds nothing */ }
      insert.run(row.user_id, JSON.stringify(consistentStats(parseProfile(saved)?.stats ?? {})));
    }
    db.prepare('INSERT INTO migrations (name) VALUES (?)').run(SEED);
  })();
}

export function statsOf(userId: number): Stats {
  const row = db.prepare('SELECT data FROM player_stats WHERE user_id = ?').get(userId) as { data: string } | undefined;
  return { ...EMPTY_STATS, ...(row ? JSON.parse(row.data) as Partial<Stats> : {}) };
}

export function saveStats(userId: number, stats: Stats): void {
  db.prepare('INSERT INTO player_stats (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data')
    .run(userId, JSON.stringify(stats));
}

export function forgetStats(userId: number): void {
  db.prepare('DELETE FROM player_stats WHERE user_id = ?').run(userId);
}

/** A checked run, as it moves the lifetime stats. */
export interface CountedRun {
  score: number;
  start: number;
  distance: number;
  level: number;
  combo: number;
  apples: number;
  beers: number;
  pills: number;
  nearMisses: number;
  dashThroughs: number;
  wallsBroken: number;
  kills: number;
  seconds: number;
  bosses: string[];
  noHitWins: number;
  allBosses: boolean;
  moultSaves: number;
  pacifist: boolean;
  daily: boolean;
  multiplayer: boolean;
}

/** The stats with a checked run counted in: the client's profileStats.ts withRun, on the server's numbers. */
export function withCheckedRun(stats: Stats, run: CountedRun): Stats {
  const next: Stats = {
    ...stats,
    runs: stats.runs + 1,
    distance: stats.distance + run.distance - run.start,
    apples: stats.apples + run.apples,
    beers: stats.beers + run.beers,
    pills: stats.pills + run.pills,
    nearMisses: stats.nearMisses + run.nearMisses,
    dashThroughs: stats.dashThroughs + run.dashThroughs,
    wallsBroken: stats.wallsBroken + run.wallsBroken,
    kills: stats.kills + run.kills,
    bestKills: Math.max(stats.bestKills, run.kills),
    noHitBossWins: stats.noHitBossWins + run.noHitWins,
    allBossRuns: stats.allBossRuns + (run.allBosses ? 1 : 0),
    moultSaves: stats.moultSaves + run.moultSaves,
    pacifistRuns: stats.pacifistRuns + (run.pacifist ? 1 : 0),
    dailyRuns: stats.dailyRuns + (run.daily ? 1 : 0),
    seconds: stats.seconds + run.seconds,
    // From a checkpoint the same score is easier: only a run from 0 m moves the record and its achievements
    bestScore: run.start === 0 ? Math.max(stats.bestScore, run.score) : stats.bestScore,
    bestDistance: Math.max(stats.bestDistance, run.distance),
    bestLevel: Math.max(stats.bestLevel, run.level),
    bestCombo: Math.max(stats.bestCombo, run.combo),
  };
  // Bez końca's own records: runs from the Eksterminator's checkpoint (a match never starts there)
  if (run.start === ENDLESS_START && !run.multiplayer) {
    next.endlessRuns = stats.endlessRuns + 1;
    next.endlessBestLevel = Math.max(stats.endlessBestLevel, run.level);
    next.endlessBestDistance = Math.max(stats.endlessBestDistance, run.distance);
  }
  for (const boss of run.bosses) {
    const key = BOSS_WINS[boss];
    if (key) next[key] += 1;
    // Beating a boss solo opens his checkpoint (checkpoints.ts unlockedAfter); a match opens none
    const index = CHECKPOINT_STARTS.indexOf((BOSS_TRIGGER_DISTANCE as Record<string, number>)[boss]) + 1;
    if (!run.multiplayer && index > next.checkpoints) next.checkpoints = index;
  }
  return next;
}
