/**
 * Okruszki: the currency every run, the missions and the achievements pay and the shop takes. Earned only, never
 * bought. Signed-in players only: it lives on the account. Prices and rewards are decided here, never by the client,
 * and what they are paid on is a run the server checked (runs.ts). Item ids match src/config/skins.ts and
 * tools/art/skins.py.
 */
import db from './db';
import { dailyDate } from './daily';
import { ACHIEVEMENTS, achievementTitle, type Stats } from './achievements';
import { forgetStats, statsOf } from './playerStats';
import { isRecord } from './validate';

export type Slot = 'skin' | 'head' | 'back';

export const SHOP: Record<string, { slot: Slot; price: number }> = {
  // Skins, the roach repainted
  zombie: { slot: 'skin', price: 600 },
  lodowy: { slot: 'skin', price: 800 },
  robot: { slot: 'skin', price: 1000 },
  lawa: { slot: 'skin', price: 1200 },
  metal: { slot: 'skin', price: 1500 },
  kosmiczny: { slot: 'skin', price: 2000 },
  // On the head
  czapka: { slot: 'head', price: 300 },
  imprezowa: { slot: 'head', price: 400 },
  kowbojski: { slot: 'head', price: 500 },
  sluchawki: { slot: 'head', price: 500 },
  cylinder: { slot: 'head', price: 600 },
  wiking: { slot: 'head', price: 700 },
  smiglo: { slot: 'head', price: 800 },
  korona: { slot: 'head', price: 1000 },
  aureola: { slot: 'head', price: 1200 },
  // On the back
  balonik: { slot: 'back', price: 300 },
  piwo: { slot: 'back', price: 400 },
  peleryna: { slot: 'back', price: 700 },
  plecak: { slot: 'back', price: 900 },
  skrzydla: { slot: 'back', price: 1000 },
  rakieta: { slot: 'back', price: 1200 },
};

/** A finished run, as the missions measure it: the numbers of a run the server checked (runs.ts), never the client's. */
export interface RunReport {
  score: number;
  distance: number;
  level: number;
  combo: number;
  apples: number;
  beers: number;
  pills: number;
  nearMisses: number;
  dashThroughs: number;
  wallsBroken: number;
  daily: boolean;
  multiplayer: boolean;
}

interface Mission {
  text: string;
  goal: number;
  reward: number;
  /** What a run adds towards it. */
  measure: (run: RunReport) => number;
  /** In one run (the best run counts), or added up across runs. */
  perRun: boolean;
}

/**
 * Set against the scoring of 2026-11 (distance points, a miss halving the combo) and the live board then: a median run
 * of about 2 200 points (some 800 m), a good one 8 000, the best 21 000. A one-run mission asks for about a median run
 * or more; one added up over runs, two or three of them.
 */
export const MISSIONS: Record<string, Mission> = {
  'jablka-bieg': { text: 'Zjedz 60 jabłek w jednym biegu', goal: 60, reward: 70, measure: r => r.apples, perRun: true },
  'jablka': { text: 'Zjedz łącznie 250 jabłek', goal: 250, reward: 90, measure: r => r.apples, perRun: false },
  'dystans-bieg': { text: 'Przebiegnij 1000 m w jednym biegu', goal: 1000, reward: 100, measure: r => r.distance, perRun: true },
  'dystans': { text: 'Przebiegnij łącznie 3 km', goal: 3000, reward: 90, measure: r => r.distance, perRun: false },
  'poziom-4': { text: 'Dobiegnij do poziomu 4', goal: 4, reward: 80, measure: r => r.level, perRun: true },
  'poziom-6': { text: 'Dobiegnij do poziomu 6', goal: 6, reward: 120, measure: r => r.level, perRun: true },
  'styk-bieg': { text: '3 razy na styk w jednym biegu', goal: 3, reward: 60, measure: r => r.nearMisses, perRun: true },
  'styk': { text: '15 razy na styk', goal: 15, reward: 80, measure: r => r.nearMisses, perRun: false },
  'przebicia': { text: 'Przebij dashem 8 przeszkód', goal: 8, reward: 70, measure: r => r.dashThroughs, perRun: false },
  'sciana': { text: 'Przebij ścianę', goal: 1, reward: 70, measure: r => r.wallsBroken, perRun: false },
  'kombo': { text: 'Kombo x30', goal: 30, reward: 90, measure: r => r.combo, perRun: true },
  'piwa': { text: 'Wypij 15 piw', goal: 15, reward: 60, measure: r => r.beers, perRun: false },
  'pigulka': { text: 'Zjedz pigułkę', goal: 1, reward: 70, measure: r => r.pills, perRun: false },
  'wynik': { text: '3000 punkciorów w jednym biegu', goal: 3000, reward: 100, measure: r => r.score, perRun: true },
  'wynik-duzy': { text: '8000 punkciorów w jednym biegu', goal: 8000, reward: 150, measure: r => r.score, perRun: true },
  'dnia': { text: 'Zagraj w Karalucha Dnia', goal: 1, reward: 50, measure: r => (r.daily ? 1 : 0), perRun: false },
  'zjazd': { text: 'Zagraj zjazd ze znajomymi', goal: 1, reward: 80, measure: r => (r.multiplayer ? 1 : 0), perRun: false },
  'biegi': { text: 'Zagraj 5 biegów', goal: 5, reward: 50, measure: () => 1, perRun: false },
};

const SLOTS = 3;

/** Missions only a roach with the dash can do. */
const NEEDS_DASH = new Set(['przebicia', 'sciana']);

/** The dash is theirs from the start of every run once Pani Lodzia is beaten: the `checkpoints` stat, as the server counts it. */
function ownsDash(userId: number): boolean {
  return statsOf(userId).checkpoints >= 1;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS wallets (
    user_id INTEGER PRIMARY KEY,
    crumbs INTEGER NOT NULL DEFAULT 0,
    skin TEXT,
    head TEXT,
    back TEXT
  );
  CREATE TABLE IF NOT EXISTS owned (
    user_id INTEGER NOT NULL,
    item TEXT NOT NULL,
    PRIMARY KEY (user_id, item)
  );
  CREATE TABLE IF NOT EXISTS achievements_paid (
    user_id INTEGER NOT NULL,
    achievement TEXT NOT NULL,
    PRIMARY KEY (user_id, achievement)
  );
  CREATE TABLE IF NOT EXISTS missions_done (
    user_id INTEGER PRIMARY KEY,
    done INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS missions (
    user_id INTEGER NOT NULL,
    slot INTEGER NOT NULL,
    mission TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    done_on TEXT,
    PRIMARY KEY (user_id, slot)
  );
`);

/**
 * What each achievement paid before the rebalance of 2026-11-15: every row of achievements_paid from before it paid this
 * much. Read once, by the migration below, so a reward raised since is topped up by the difference (payAchievements).
 */
const PAID_BEFORE_REBALANCE: Record<string, number> = {
  'jablka-1': 50, sadownik: 150, 'jablka-3': 350, 'jablka-4': 800, 'dystans-1': 50, maraton: 300, 'dystans-3': 500, 'dystans-4': 800,
  'piwa-1': 40, piwosz: 100, 'piwa-3': 200, 'pigulki-1': 40, pigularz: 100, 'pigulki-3': 200, 'biegi-1': 40, wytrwaly: 150, 'biegi-3': 300,
  'styk-1': 40, 'na-styk': 100, 'styk-3': 200, 'dash-1': 40, przebijak: 100, 'dash-3': 200, 'strzaly-1': 40, 'strzaly-2': 120,
  'strzaly-3': 300, 'sciany-1': 40, sciana: 120, 'sciany-3': 250, 'codziennie-1': 40, dnia: 100, 'codziennie-3': 200, 'misje-1': 50,
  'misje-2': 150, 'misje-3': 350, 'bez-konca-1': 100, 'bez-konca-2': 250, 'bez-konca-3': 400, 'poziom-4': 60, 'poziom-6': 120,
  'poziom-8': 200, 'poziom-10': 400, 'piec-tysiecy': 100, 'dziesiec-tysiecy': 200, bog: 400, 'piecdziesiat-tysiecy': 400,
  'kombo-30': 100, 'kombo-60': 250, 'kombo-100': 400, 'boss-lodzia': 60, 'boss-bigos': 120, 'boss-zlewiatan': 200,
  'boss-eksterminator': 300, nietykalny: 250, 'cztery-bossy': 400, skroty: 100, 'wylinka-10': 100, kanonada: 100, pacyfista: 250,
  'trzy-tysiace': 200, 'szafa-gra': 150, towarzyski: 100, 'krol-zjazdu': 200,
};

// What each paid achievement paid, so a raised reward tops it up once: added on the first start with it, every row from
// before filled with the reward of then
try {
  db.exec('ALTER TABLE achievements_paid ADD COLUMN reward INTEGER');
} catch {
  // Column already exists
}
db.transaction(() => {
  const unset = db.prepare('UPDATE achievements_paid SET reward = ? WHERE achievement = ? AND reward IS NULL');
  for (const [id, reward] of Object.entries(PAID_BEFORE_REBALANCE)) unset.run(reward, id);
})();

export interface Look {
  skin: string | null;
  head: string | null;
  back: string | null;
}

const SLOTS_WORN: Slot[] = ['skin', 'head', 'back'];

export interface ShopState {
  crumbs: number;
  /** Item id → price, so the shop shows the server's prices. */
  prices: Record<string, number>;
  owned: string[];
  look: Look;
  missions: { id: string; text: string; goal: number; progress: number; reward: number; done: boolean }[];
  /** Missions finished since the account began: the record the achievements on missions are paid from. */
  missionsDone: number;
}

interface MissionRow { slot: number; mission: string; progress: number; done_on: string | null }

/** Fills empty slots, and gives a slot finished before today a new mission. */
function rotate(userId: number, today: string): MissionRow[] {
  const rows = db.prepare('SELECT slot, mission, progress, done_on FROM missions WHERE user_id = ? ORDER BY slot').all(userId) as MissionRow[];
  const bySlot = new Map(rows.map(row => [row.slot, row]));
  const active = new Set(rows.filter(row => !(row.done_on && row.done_on < today)).map(row => row.mission));
  for (let slot = 0; slot < SLOTS; slot++) {
    const row = bySlot.get(slot);
    if (row && !(row.done_on && row.done_on < today)) continue;
    const pool = Object.keys(MISSIONS).filter(id => !active.has(id) && id !== row?.mission && (!NEEDS_DASH.has(id) || ownsDash(userId)));
    const mission = pool[Math.floor(Math.random() * pool.length)];
    active.add(mission);
    db.prepare(`
      INSERT INTO missions (user_id, slot, mission, progress, done_on) VALUES (?, ?, ?, 0, NULL)
      ON CONFLICT(user_id, slot) DO UPDATE SET mission = excluded.mission, progress = 0, done_on = NULL
    `).run(userId, slot, mission);
    bySlot.set(slot, { slot, mission, progress: 0, done_on: null });
  }
  return [...bySlot.values()].sort((a, b) => a.slot - b.slot);
}

function wallet(userId: number): { crumbs: number } & Look {
  db.prepare('INSERT OR IGNORE INTO wallets (user_id) VALUES (?)').run(userId);
  return db.prepare('SELECT crumbs, skin, head, back FROM wallets WHERE user_id = ?').get(userId) as { crumbs: number } & Look;
}

/** How many missions this account has finished. Counted here from the first one finished after this was added. */
function missionsDone(userId: number): number {
  const row = db.prepare('SELECT done FROM missions_done WHERE user_id = ?').get(userId) as { done: number } | undefined;
  return row?.done ?? 0;
}

export function shopState(userId: number, now = Date.now()): ShopState {
  const missions = rotate(userId, dailyDate(now));
  const { crumbs, skin, head, back } = wallet(userId);
  const owned = (db.prepare('SELECT item FROM owned WHERE user_id = ?').all(userId) as { item: string }[]).map(row => row.item);
  return {
    crumbs,
    prices: Object.fromEntries(Object.entries(SHOP).map(([id, entry]) => [id, entry.price])),
    owned,
    look: { skin, head, back },
    missions: missions.map(row => {
      const mission = MISSIONS[row.mission];
      return { id: row.mission, text: mission.text, goal: mission.goal, progress: Math.min(row.progress, mission.goal), reward: mission.reward, done: row.done_on !== null };
    }),
    missionsDone: missionsDone(userId),
  };
}

/** What a player wears, for multiplayer: only things they own. */
export function lookOf(userId: number): Look {
  const { skin, head, back } = wallet(userId);
  return { skin, head, back };
}

/** Counts a run towards the missions and pays the finished ones. */
export const reportRun = db.transaction((userId: number, run: RunReport, now: number = Date.now()) => {
  const today = dailyDate(now);
  wallet(userId);
  const completed: { text: string; reward: number }[] = [];
  for (const row of rotate(userId, today)) {
    if (row.done_on) continue;
    const mission = MISSIONS[row.mission];
    const gained = mission.measure(run);
    const progress = mission.perRun ? Math.max(row.progress, gained) : row.progress + gained;
    const done = progress >= mission.goal;
    db.prepare('UPDATE missions SET progress = ?, done_on = ? WHERE user_id = ? AND slot = ?')
      .run(Math.min(progress, mission.goal), done ? today : null, userId, row.slot);
    if (done) {
      db.prepare('UPDATE wallets SET crumbs = crumbs + ? WHERE user_id = ?').run(mission.reward, userId);
      db.prepare('INSERT INTO missions_done (user_id, done) VALUES (?, 1) ON CONFLICT(user_id) DO UPDATE SET done = done + 1').run(userId);
      completed.push({ text: mission.text, reward: mission.reward });
    }
  }
  return completed;
});

/** An achievement paid, as a receipt shows it. */
export interface PaidAchievement {
  id: string;
  name: string;
  reward: number;
}

/**
 * Pays every achievement this account's stats reach that it hasn't been paid for, and tops up one paid before its
 * reward was raised by the difference. The stats are the server's own (playerStats.ts: checked runs and matches), with
 * the missions done and items owned from its own record; each achievement pays its reward once in all. One whose
 * threshold was raised after it was paid stays paid, and is topped up only once the stats reach it again.
 */
export const payAchievements = db.transaction((userId: number): PaidAchievement[] => {
  const full: Stats = {
    ...statsOf(userId),
    missionsDone: missionsDone(userId),
    itemsOwned: (db.prepare('SELECT COUNT(*) AS n FROM owned WHERE user_id = ?').get(userId) as { n: number }).n,
  };
  wallet(userId);
  const paid: PaidAchievement[] = [];
  for (const achievement of ACHIEVEMENTS) {
    if (!achievement.test(full)) continue;
    const row = db.prepare('SELECT reward FROM achievements_paid WHERE user_id = ? AND achievement = ?').get(userId, achievement.id) as
      { reward: number | null } | undefined;
    const owed = achievement.reward - (row ? row.reward ?? achievement.reward : 0);
    if (owed <= 0) continue;
    db.prepare(`
      INSERT INTO achievements_paid (user_id, achievement, reward) VALUES (?, ?, ?)
      ON CONFLICT(user_id, achievement) DO UPDATE SET reward = excluded.reward
    `).run(userId, achievement.id, achievement.reward);
    db.prepare('UPDATE wallets SET crumbs = crumbs + ? WHERE user_id = ?').run(owed, userId);
    paid.push({ id: achievement.id, name: achievementTitle(achievement), reward: owed });
  }
  return paid;
});

/** Adds okruszki to a wallet (a run's own pay); returns the new balance. */
export function credit(userId: number, crumbs: number): number {
  wallet(userId);
  db.prepare('UPDATE wallets SET crumbs = crumbs + ? WHERE user_id = ?').run(crumbs, userId);
  return wallet(userId).crumbs;
}

/** The okruszki in a wallet now. */
export const balanceOf = (userId: number): number => wallet(userId).crumbs;

export const buy = db.transaction((userId: number, item: string): string | null => {
  const entry = SHOP[item];
  if (!entry) return 'Unknown item';
  if (db.prepare('SELECT 1 FROM owned WHERE user_id = ? AND item = ?').get(userId, item)) return 'Already owned';
  if (wallet(userId).crumbs < entry.price) return 'Not enough crumbs';
  db.prepare('UPDATE wallets SET crumbs = crumbs - ? WHERE user_id = ?').run(entry.price, userId);
  db.prepare('INSERT INTO owned (user_id, item) VALUES (?, ?)').run(userId, item);
  return null;
});

/** Wears these (null takes a slot off). Only things the player owns, each in its own slot. */
export function wear(userId: number, look: Look): string | null {
  for (const slot of SLOTS_WORN) {
    const item = look[slot];
    if (item === null) continue;
    if (SHOP[item]?.slot !== slot) return 'Wrong item';
    if (!db.prepare('SELECT 1 FROM owned WHERE user_id = ? AND item = ?').get(userId, item)) return 'Not owned';
  }
  wallet(userId);
  db.prepare('UPDATE wallets SET skin = ?, head = ?, back = ? WHERE user_id = ?').run(look.skin, look.head, look.back, userId);
  return null;
}

/** Forgets a player's okruszki, items, missions, paid achievements and counted stats, with their account. */
export function forgetPlayer(userId: number): void {
  for (const table of ['wallets', 'owned', 'missions', 'missions_done', 'achievements_paid']) db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
  forgetStats(userId);
}

/** A look from the client: each slot an item id or null. Ownership is checked by wear(). */
export function parseLook(body: unknown): Look | null {
  if (!isRecord(body)) return null;
  const item = (value: unknown): string | null | undefined =>
    value === null ? null : typeof value === 'string' && /^[a-z]{1,16}$/.test(value) ? value : undefined;
  const skin = item(body.skin);
  const head = item(body.head);
  const back = item(body.back);
  return skin === undefined || head === undefined || back === undefined ? null : { skin, head, back };
}
