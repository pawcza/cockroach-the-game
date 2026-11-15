/**
 * What a run can have done, at most, by the time it claims a distance: how far the roach can get in the time it had,
 * how many slots the course laid up to there, and so how many pickups, enemies, walls and points there can have been.
 * The server holds every run report to these before it pays or ranks it (runs.ts). No Node imports: the tests import
 * it next to the client's own formulas and hold the two to each other (tests/run-bounds.test.ts), because the server
 * cannot import from src.
 *
 * Mirrored from the client, pinned by the tests: the speed formula (src/objects/obstacles/cast.ts cruiseSpeed and its
 * nominal runner), the levels' thresholds (src/config/levels.ts), the slot spacing (src/systems/RunPatterns.ts
 * beatSpacing), the boss runway (src/systems/CourseLayout.ts), the dash and the pill (src/config/constants.ts) and the
 * points (constants.ts, RiskBonus.ts, gunRules.ts, RunState.ts).
 *
 * What these bounds are: rigorous where the planner gives a hard limit (the slots, the distance from the speed
 * formula, the walls' cooldown), statistical where it only gives odds (how many slots carry a pickup or an enemy,
 * how many pickups are beers or pills): those hold for every course the tests walk with the real planner, with room
 * to spare, and are about a third above what the luckiest of them lays. An honest run is never refused by one: a
 * count above it is held to it.
 */
import { BOSS_TRIGGER_DISTANCE } from './bossDistances';

// ── Mirrored constants ──────────────────────────────────────────────────

export const START_X = 150;
const PX_PER_METRE = 50;
const BASE_SPEED = 200;
const MAX_BOOST = 300;
const SPEED_TAU_S = 200;
const SPEED_PER_LEVEL = 20;
const MAX_CAST_LEVEL = 10;
const ENDLESS_SPEED_PER_LEVEL = 3;
const ENDLESS_TOP_LEVEL = 25;
const DASH_SPEED = 300;
const DASH_MS = 375;
const DASH_COOLDOWN_MS = 1200;
const PILL_MULTIPLIER = 1.5;
const PILL_MS = 5000;
export const STORY_THRESHOLDS = [0, 100, 250, 450, 700, 950, 1200, 1500, 1800, 2200] as const;
const ENDLESS_FROM_M = BOSS_TRIGGER_DISTANCE.eksterminator;
const ENDLESS_ZONE_M = 500;
const SPACING_FROM_7 = [286, 292, 306, 306, 305, 311, 315, 318, 321, 323, 324, 325, 325, 326, 326, 325, 325, 325, 324];
/** The empty runway short of each boss, px by trigger metre: 1 s at the nominal runner's speed there (CourseLayout bossRunway). */
export const BOSS_RUNWAY_PX: Readonly<Record<number, number>> = {
  [BOSS_TRIGGER_DISTANCE.lodzia]: 287, [BOSS_TRIGGER_DISTANCE.bigos]: 473,
  [BOSS_TRIGGER_DISTANCE.zlewiatan]: 545, [BOSS_TRIGGER_DISTANCE.eksterminator]: 612,
};
const BOSS_RESUME_PX = 1000;
const FIRST_SLOT_AHEAD_PX = 400;
const WALL_COOLDOWN_BEATS = 8;
/** The first level a wall chunk (or a cloud wall's) is laid on, and the beat of its chunk the wall is: the third. */
const WALL_FROM_LEVEL = 3;
const WALL_BEAT = 3;
export const POINTS = { apple: 10, beer: 25, pill: 100, near: 15, dash: 25, kill: 20, blast: 30 } as const;
const COMBO_STEP = 0.025;
export const PILL_CHANCE = 0.012;
export const BEER_CHANCE = 0.12;
/**
 * Apples laid by hand, outside the slots (SpawnManager): three past the dash lesson's wall, laid 20 m past Pani Lodzia
 * once her dash is won in the run, and three past the gun lesson's onion, 20 m past DJ Bigos once his pistol is.
 */
const LESSONS = [
  { after: BOSS_TRIGGER_DISTANCE.lodzia, apples: 3 },
  { after: BOSS_TRIGGER_DISTANCE.bigos, apples: 3 },
];
const LESSON_AHEAD_M = 20;
/** Hits the moult can take in one run (abilities.ts MOULT_CHARGES, one grant a run). */
export const MOULT_SAVES_PER_RUN = 1;

// ── The course ──────────────────────────────────────────────────────────

/** The level at this distance, boss gates aside: levels.ts levelNumberAt. */
export function levelAt(metre: number): number {
  if (metre >= ENDLESS_FROM_M) return STORY_THRESHOLDS.length + 1 + Math.floor((metre - ENDLESS_FROM_M) / ENDLESS_ZONE_M);
  let level = 1;
  for (let i = 0; i < STORY_THRESHOLDS.length; i++) if (metre >= STORY_THRESHOLDS[i]) level = i + 1;
  return level;
}

/** cast.ts cruiseSpeed: px/s at this course time (ms) on this level. */
export function cruiseSpeed(courseMs: number, level: number): number {
  return BASE_SPEED + MAX_BOOST * (1 - Math.exp(-courseMs / 1000 / SPEED_TAU_S))
    + (Math.min(level, MAX_CAST_LEVEL) - 1) * SPEED_PER_LEVEL
    + Math.min(Math.max(level - MAX_CAST_LEVEL, 0), ENDLESS_TOP_LEVEL - MAX_CAST_LEVEL) * ENDLESS_SPEED_PER_LEVEL;
}

/** RunPatterns.ts beatSpacing: world px between slots on this level. */
export function beatSpacing(level: number): number {
  if (level < 7) return 200 + (level - 1) * 16;
  return SPACING_FROM_7[Math.min(level, ENDLESS_TOP_LEVEL) - 7];
}

const metreOf = (x: number): number => Math.floor((x - START_X) / PX_PER_METRE);
const xOf = (metre: number): number => START_X + metre * PX_PER_METRE;

const NOMINAL_STEP_MS = 50;
/**
 * cast.ts nominalCourse.timeAt: when a runner that never dashes reaches this x (ms of course time). A run from a
 * checkpoint starts its course clock here (checkpoints.ts runStart), which sets how fast it already runs.
 */
export function nominalTimeAt(x: number): number {
  if (x <= START_X) return 0;
  let px = START_X;
  let t = 0;
  for (;;) {
    const v = cruiseSpeed(t, levelAt(metreOf(px)));
    const next = px + (v * NOMINAL_STEP_MS) / 1000;
    if (next > x) return t + ((x - px) / (next - px)) * NOMINAL_STEP_MS;
    px = next;
    t += NOMINAL_STEP_MS;
  }
}

/** Where a run from `start` metres has its course clock at its first frame (ms). */
const courseOffset = (start: number): number => (start > 0 ? nominalTimeAt(xOf(start)) : 0);

/**
 * The furthest a roach starting at `start` metres can be after `seconds` of running, having eaten `pills` pills:
 * the speed formula at the most it allows (no checkpoint ramp, no pull), dashing every time the cooldown lets it, every
 * pill's five seconds at the fastest end of the run. Metres, from the course's start.
 */
export function maxDistance(start: number, seconds: number, pills: number): number {
  const offset = courseOffset(start);
  const totalMs = Math.max(0, seconds) * 1000;
  const pillFrom = totalMs - Math.max(0, pills) * PILL_MS;
  const dashShare = DASH_MS / (DASH_MS + DASH_COOLDOWN_MS);
  let x = xOf(start);
  for (let t = 0; t < totalMs; t += NOMINAL_STEP_MS) {
    const step = Math.min(NOMINAL_STEP_MS, totalMs - t);
    // At the speed the step ends on: the speed only rises with time and level, so the bound never falls short
    const v = (cruiseSpeed(offset + t + step, levelAt(metreOf(x) + 1)) + DASH_SPEED * dashShare) * (t + step > pillFrom ? PILL_MULTIPLIER : 1);
    x += (v * step) / 1000;
  }
  // One dash more than the cooldown's share, for a run that dashes on its first frame and its last
  x += (DASH_SPEED * DASH_MS / 1000) * PILL_MULTIPLIER;
  return (x - START_X) / PX_PER_METRE;
}

/** The bosses each kind of run stops for (SpawnManager): every one solo, Zlewiatan alone in a match. */
export function bossesOf(multiplayer: boolean): number[] {
  return multiplayer ? [BOSS_TRIGGER_DISTANCE.zlewiatan] : Object.values(BOSS_TRIGGER_DISTANCE).sort((a, b) => a - b);
}

export interface Slots {
  /** Slots the course laid up to there. */
  slots: number;
  /** Of them, the slots of level 3 and up: the only ones a wall or a cloud wall can stand in (RunPatterns). */
  wallSlots: number;
  /** The level of the last of them (the highest). */
  topLevel: number;
}

/**
 * How many slots the course lays from `start` up to `distance` metres, laid as SpawnManager lays them: the first
 * 400 px ahead of the start, each the level's spacing on, none in a boss's runway, resuming past him. A lesson or a
 * fight's end may push the next slot on (SpawnManager.advanceSpawnX), which only ever lays fewer. A pickup is taken a
 * little ahead of the roach's x, so slots up to a few metres past the distance count.
 */
export function slotsUpTo(start: number, distance: number, bosses: readonly number[]): Slots {
  const endX = xOf(distance) + 120;
  let x = xOf(start) + FIRST_SLOT_AHEAD_PX;
  let ahead = bosses.filter(b => b > start);
  let slots = 0;
  let wallSlots = 0;
  let topLevel = levelAt(start);
  while (x <= endX) {
    const gate = ahead.length > 0 ? xOf(ahead[0]) - BOSS_RUNWAY_PX[ahead[0]] : Infinity;
    if (x >= gate) {
      x = Math.max(x, xOf(ahead[0]) + BOSS_RESUME_PX);
      ahead = ahead.slice(1);
      continue;
    }
    const level = levelAt(metreOf(x));
    slots++;
    if (level >= WALL_FROM_LEVEL) wallSlots++;
    topLevel = level;
    x += beatSpacing(level);
  }
  return { slots, wallSlots, topLevel };
}

/**
 * At most how many of `slots` slots carry a pickup, or an enemy: about half of them do, in waves (a trail of apples, a
 * corridor of pairs), so a short stretch can run richer than a long one. Measured against the real planner over every
 * start and distance the tests walk; never below what any course of theirs laid.
 */
export function richSlots(slots: number): number {
  // A slot carries one pickup and one enemy at most: none laid, none taken
  return Math.min(slots, Math.floor(0.5 * slots + 2.5 * Math.sqrt(slots) + 4));
}

/**
 * At most how many pickups, enemies and walls `slots` slots carry together: a pair is two in one slot, an empty slot
 * none, and over a stretch they come to about one a slot. Measured like richSlots.
 */
export function busySlots(slots: number): number {
  return Math.min(2 * slots, Math.floor(slots + 2 * Math.sqrt(slots) + 4));
}

/**
 * Walls and cloud walls in `wallSlots` slots of level 3 and up: the first is its chunk's third beat, every next one at
 * least WALL_COOLDOWN_BEATS + 1 beats on (RunPatterns). None before the third such slot.
 */
export function wallsIn(wallSlots: number): number {
  return wallSlots < WALL_BEAT ? 0 : Math.floor((wallSlots - WALL_BEAT) / (WALL_COOLDOWN_BEATS + 1)) + 1;
}

/** The lessons' hand-laid apples a run from `start` can have reached by `distance` (only where it won the boss's power). */
export function lessonApples(start: number, distance: number): number {
  return LESSONS.filter(l => start < l.after && distance >= l.after + LESSON_AHEAD_M).reduce((sum, l) => sum + l.apples, 0);
}

/**
 * At most how many of `pickups` pickups come up as one with this chance: the expected number plus six standard
 * deviations and one more, so the luckiest honest run is inside it; never more than the pickups.
 */
export function luckyShare(pickups: number, chance: number): number {
  return Math.min(pickups, Math.floor(pickups * chance + 6 * Math.sqrt(pickups * chance * (1 - chance)) + 1));
}

/** RunState.ts DistancePoints: a quarter point a metre times its level, for the metres from start to distance. */
export function distancePoints(start: number, distance: number): number {
  let quarters = 0;
  for (let metre = Math.floor(start); metre < Math.floor(distance); metre++) quarters += levelAt(metre);
  return Math.floor(quarters / 4);
}

/** RunState.ts endlessBonus. */
export function endlessBonus(level: number): number {
  return level > STORY_THRESHOLDS.length ? level / 10 : 1;
}

export interface Events {
  apples: number;
  beers: number;
  pills: number;
  nearMisses: number;
  dashThroughs: number;
  kills: number;
}

/**
 * The most the run's pickups, close calls, dashes through and kills can have scored, with at most `combo` as the combo:
 * every event at the best combo it could have had (the k-th event at most k), the biggest base points on the biggest
 * combos, the level's endless bonus on all of them, and each one's rounding up.
 */
export function eventPoints(events: Events, combo: number, level: number): number {
  const bases: number[] = [];
  const add = (count: number, points: number): void => { for (let i = 0; i < count; i++) bases.push(points); };
  add(events.pills, POINTS.pill);
  add(events.beers, POINTS.beer);
  add(events.dashThroughs, POINTS.dash);
  add(events.kills, POINTS.blast);
  add(events.nearMisses, POINTS.near);
  add(events.apples, POINTS.apple);
  bases.sort((a, b) => b - a);
  const bonus = endlessBonus(level);
  let total = 0;
  for (let i = 0; i < bases.length; i++) {
    const comboThen = Math.min(bases.length - i, combo);
    total += bases[i] * (1 + comboThen * COMBO_STEP) * bonus + 0.5;
  }
  return Math.ceil(total);
}

/**
 * Each boss fight, as its own scoring goes (src/systems/boss/*Fight.ts, measured with each fight's own pattern
 * simulation): the most it may add, victory bonus included, and the least time a win over him takes (s). Two fights end
 * on their own; Zlewiatan and the Eksterminator never do (dodging or shooting down what they throw scores as long as it
 * goes on), so a fight's points are held to twice a strong honest fight's, whatever its length (cockroach#228), and its
 * time is not inferred from the wall clock. A win's least time is about half the fastest simulated clean fight.
 *   Pani Lodzia: strong honest ~260 (at most 430 by an exact search) → 520, +300; clean ~36 s → 18 s.
 *   DJ Bigos: strong honest ~2 600 → 5 200, +400; clean ~37 s → 18 s.
 *   Zlewiatan: strong honest ~8 500 → 17 000, +600; clean ~51 s → 25 s.
 *   Eksterminator: strong honest ~3 800 → 7 600, +800; clean ~71 s → 35 s.
 */
export const BOSS_FIGHTS: Record<string, { cap: number; minSeconds: number }> = {
  lodzia: { cap: 520 + 300, minSeconds: 18 },
  bigos: { cap: 5200 + 400, minSeconds: 18 },
  zlewiatan: { cap: 17000 + 600, minSeconds: 25 },
  eksterminator: { cap: 7600 + 800, minSeconds: 35 },
};
/** A match's own Zlewiatan (ZlewiatanFight.ts): 5 a projectile shot down, ~600 in a strong minute → 1 200, +500. */
export const MATCH_BOSS = { cap: 1200 + 500 };

