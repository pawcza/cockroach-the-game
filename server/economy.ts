/**
 * Okruszki: the currency missions pay and the shop takes. Earned only, never bought. Signed-in players only: it lives
 * on the account. Prices and rewards are decided here, never by the client. Item ids match src/config/skins.ts and
 * tools/art/skins.py.
 */
import db from './db';
import { dailyDate } from './daily';
import { ACHIEVEMENTS, type Stats } from './achievements';
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

/** A finished run as the client reports it. Trusted like a score is: there is nothing to buy with real money. */
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

export const MISSIONS: Record<string, Mission> = {
  'jablka-bieg': { text: 'Zjedz 30 jabłek w jednym biegu', goal: 30, reward: 60, measure: r => r.apples, perRun: true },
  'jablka': { text: 'Zjedz łącznie 150 jabłek', goal: 150, reward: 80, measure: r => r.apples, perRun: false },
  'dystans-bieg': { text: 'Przebiegnij 500 m w jednym biegu', goal: 500, reward: 70, measure: r => r.distance, perRun: true },
  'dystans': { text: 'Przebiegnij łącznie 3 km', goal: 3000, reward: 90, measure: r => r.distance, perRun: false },
  'poziom-4': { text: 'Dobiegnij do poziomu 4', goal: 4, reward: 80, measure: r => r.level, perRun: true },
  'poziom-6': { text: 'Dobiegnij do poziomu 6', goal: 6, reward: 120, measure: r => r.level, perRun: true },
  'styk-bieg': { text: '3 razy na styk w jednym biegu', goal: 3, reward: 60, measure: r => r.nearMisses, perRun: true },
  'styk': { text: '15 razy na styk', goal: 15, reward: 80, measure: r => r.nearMisses, perRun: false },
  'przebicia': { text: 'Przebij dashem 8 przeszkód', goal: 8, reward: 70, measure: r => r.dashThroughs, perRun: false },
  'sciana': { text: 'Przebij ścianę', goal: 1, reward: 70, measure: r => r.wallsBroken, perRun: false },
  'kombo': { text: 'Kombo x15', goal: 15, reward: 80, measure: r => r.combo, perRun: true },
  'piwa': { text: 'Wypij 5 piw', goal: 5, reward: 60, measure: r => r.beers, perRun: false },
  'pigulka': { text: 'Zjedz pigułkę', goal: 1, reward: 70, measure: r => r.pills, perRun: false },
  'wynik': { text: '500 punkciorów w jednym biegu', goal: 500, reward: 70, measure: r => r.score, perRun: true },
  'wynik-duzy': { text: '1500 punkciorów w jednym biegu', goal: 1500, reward: 130, measure: r => r.score, perRun: true },
  'dnia': { text: 'Zagraj w Karalucha Dnia', goal: 1, reward: 50, measure: r => (r.daily ? 1 : 0), perRun: false },
  'zjazd': { text: 'Zagraj zjazd ze znajomymi', goal: 1, reward: 80, measure: r => (r.multiplayer ? 1 : 0), perRun: false },
  'biegi': { text: 'Zagraj 5 biegów', goal: 5, reward: 50, measure: () => 1, perRun: false },
};

const SLOTS = 3;

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
  CREATE TABLE IF NOT EXISTS missions (
    user_id INTEGER NOT NULL,
    slot INTEGER NOT NULL,
    mission TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    done_on TEXT,
    PRIMARY KEY (user_id, slot)
  );
`);

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
    const pool = Object.keys(MISSIONS).filter(id => !active.has(id) && id !== row?.mission);
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
      completed.push({ text: mission.text, reward: mission.reward });
    }
  }
  return completed;
});

/**
 * Pays every achievement these stats reach that this account hasn't been paid for. The stats are the client's, like
 * run reports, but each achievement pays once, so the most anyone can take this way is the list's total.
 */
export const payAchievements = db.transaction((userId: number, stats: Record<string, number>) => {
  // A stat the client didn't send is undefined, and undefined >= n is false: it reaches nothing
  const full = stats as unknown as Stats;
  wallet(userId);
  const paid: { id: string; reward: number }[] = [];
  for (const achievement of ACHIEVEMENTS) {
    if (!achievement.test(full)) continue;
    const fresh = db.prepare('INSERT OR IGNORE INTO achievements_paid (user_id, achievement) VALUES (?, ?)').run(userId, achievement.id);
    if (fresh.changes === 0) continue;
    db.prepare('UPDATE wallets SET crumbs = crumbs + ? WHERE user_id = ?').run(achievement.reward, userId);
    paid.push({ id: achievement.id, reward: achievement.reward });
  }
  return paid;
});

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

/** Forgets a player's okruszki, items, missions and paid achievements, with their account. */
export function forgetPlayer(userId: number): void {
  for (const table of ['wallets', 'owned', 'missions', 'achievements_paid']) db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
}

const COUNT = 1_000_000;

/** A run report from the client: whole numbers in range, flags as booleans. */
export function parseRunReport(body: unknown): RunReport | null {
  if (!isRecord(body)) return null;
  const keys = ['score', 'distance', 'level', 'combo', 'apples', 'beers', 'pills', 'nearMisses', 'dashThroughs', 'wallsBroken'] as const;
  const out: Partial<RunReport> = {};
  for (const key of keys) {
    const value = body[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > COUNT) return null;
    out[key] = Math.floor(value);
  }
  return { ...out, daily: body.daily === true, multiplayer: body.multiplayer === true } as RunReport;
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
