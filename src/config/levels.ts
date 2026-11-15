import { BOSS_TRIGGER_DISTANCE } from '../../server/bossDistances';

export type WeatherType = 'clear' | 'rain' | 'fog' | 'wind';

export interface LevelConfig {
  level: number;
  name: string;
  skyKey: string;
  bgKey: string;
  fgKey: string;
  floorKey: string;
  bgmKey: string;
  distanceThreshold: number; // distance in meters to reach this level
  color: number; // theme color for UI elements
  painted?: boolean; // baked by tools/art/levels.py: far, mid and near plates plus a ledge strip
  weatherChances?: { type: WeatherType; weight: number }[];
  /** An endless level (11 on): the story level whose look and music it wears (endlessLook). */
  borrows?: number;
}

export const LEVELS: LevelConfig[] = [
  { level: 1, name: 'Zwykła Kuchnia', skyKey: 'lv1-sky', bgKey: 'lv1-bg', fgKey: 'lv1-fg', floorKey: 'lv1-floor', bgmKey: 'bgm-lv1', distanceThreshold: 0, color: 0x8b6914, painted: true },
  { level: 2, name: 'Klatka Schodowa', skyKey: 'lv2-sky', bgKey: 'lv2-bg', fgKey: 'lv2-fg', floorKey: 'lv2-floor', bgmKey: 'bgm-lv2', distanceThreshold: 100, color: 0x607060, painted: true },
  { level: 3, name: 'Hala Targowa', skyKey: 'lv3-sky', bgKey: 'lv3-bg', fgKey: 'lv3-fg', floorKey: 'lv3-floor', bgmKey: 'bgm-lv3', distanceThreshold: 250, color: 0xcc6633, painted: true, weatherChances: [{ type: 'rain', weight: 4 }, { type: 'clear', weight: 6 }] },
  { level: 4, name: 'Las Grochodrzew', skyKey: 'lv4-sky', bgKey: 'lv4-bg', fgKey: 'lv4-fg', floorKey: 'lv4-floor', bgmKey: 'bgm-lv4', distanceThreshold: 450, color: 0x2d6b2d, painted: true },
  { level: 5, name: 'Wigilia u Babci', skyKey: 'lv5-sky', bgKey: 'lv5-bg', fgKey: 'lv5-fg', floorKey: 'lv5-floor', bgmKey: 'bgm-lv5', distanceThreshold: 700, color: 0xaa2222, painted: true, weatherChances: [{ type: 'fog', weight: 5 }, { type: 'clear', weight: 5 }] },
  { level: 6, name: 'Dyskoteka w Remizie', skyKey: 'lv6-sky', bgKey: 'lv6-bg', fgKey: 'lv6-fg', floorKey: 'lv6-floor', bgmKey: 'bgm-lv6', distanceThreshold: 950, color: 0xff00ff, painted: true },
  { level: 7, name: 'Morze Bałtyckie', skyKey: 'lv7-sky', bgKey: 'lv7-bg', fgKey: 'lv7-fg', floorKey: 'lv7-floor', bgmKey: 'bgm-lv7', distanceThreshold: 1200, color: 0x2266aa, painted: true, weatherChances: [{ type: 'wind', weight: 4 }, { type: 'clear', weight: 6 }] },
  { level: 8, name: 'Papież na Księżycu', skyKey: 'lv8-sky', bgKey: 'lv8-bg', fgKey: 'lv8-fg', floorKey: 'lv8-floor', bgmKey: 'bgm-lv8', distanceThreshold: 1500, color: 0xddcc44, painted: true },
  { level: 9, name: 'Wymiar Żubrówki', skyKey: 'lv9-sky', bgKey: 'lv9-bg', fgKey: 'lv9-fg', floorKey: 'lv9-floor', bgmKey: 'bgm-lv9', distanceThreshold: 1800, color: 0x44bb44, painted: true, weatherChances: [{ type: 'rain', weight: 3 }, { type: 'fog', weight: 3 }, { type: 'clear', weight: 4 }] },
  { level: 10, name: 'KARALUCH WIDZI WSZYSTKO', skyKey: 'lv10-sky', bgKey: 'lv10-bg', fgKey: 'lv10-fg', floorKey: 'lv10-floor', bgmKey: 'bgm-lv10', distanceThreshold: 2200, color: 0xff4400, painted: true },
];

/** The last level of the story; past it, beyond the Eksterminator, the run goes on in endless levels (11, 12, ...). */
export const STORY_LEVELS = LEVELS.length;
/** Where the first endless level begins (metres): the Eksterminator's distance. Each one after it, ENDLESS_ZONE_M on. */
export const ENDLESS_FROM_M: number = BOSS_TRIGGER_DISTANCE.eksterminator;
export const ENDLESS_ZONE_M = 500;

/** The level a run is in at this distance (metres), boss gates aside: 1-10 by the story's thresholds, then 11, 12, ... */
export function levelNumberAt(distance: number): number {
  if (distance >= ENDLESS_FROM_M) return STORY_LEVELS + 1 + Math.floor((distance - ENDLESS_FROM_M) / ENDLESS_ZONE_M);
  let level = LEVELS[0].level;
  for (const lvl of LEVELS) {
    if (distance >= lvl.distanceThreshold) level = lvl.level;
    else break;
  }
  return level;
}

/** A 32-bit integer mix: the same on every engine (integer arithmetic only), so every client of a match agrees. */
export function mix32(...values: number[]): number {
  let h = 0x811c9dc5;
  for (const value of values) {
    h = Math.imul(h ^ (value | 0), 0x01000193);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
  }
  return h >>> 0;
}

/**
 * The story level (1-10) whose look and music an endless level wears: a pure function of the run's look seed and the
 * level, never the one the level before wore (level 11 never looks like level 10, which it follows). Cosmetic: nothing
 * of the course depends on it.
 */
export function endlessLook(seed: number, level: number): number {
  let previous = STORY_LEVELS;
  for (let n = STORY_LEVELS + 1; n <= level; n++) {
    // One of the nine others, skipping the previous one
    const pick = 1 + (mix32(seed, n) % (STORY_LEVELS - 1));
    previous = pick >= previous ? pick + 1 : pick;
  }
  return previous;
}

/**
 * A level's config: the story's own, or for an endless level the look of the story level it borrows (its name too), with
 * its own number and stretch. `seed` is the run's look seed: it only decides an endless level's look.
 */
export function levelConfig(level: number, seed = 0): LevelConfig {
  if (level <= STORY_LEVELS) return LEVELS[Math.max(1, level) - 1];
  const key = `${seed}:${level}`;
  let config = endlessConfigs.get(key);
  if (!config) {
    const borrows = endlessLook(seed, level);
    config = {
      ...LEVELS[borrows - 1],
      level,
      distanceThreshold: ENDLESS_FROM_M + (level - STORY_LEVELS - 1) * ENDLESS_ZONE_M,
      borrows,
    };
    // The floor asks for every tile on every frame: one object per level, not one per call
    if (endlessConfigs.size > 256) endlessConfigs.clear();
    endlessConfigs.set(key, config);
  }
  return config;
}
const endlessConfigs = new Map<string, LevelConfig>();

/** The story level whose images, floor and music a level shows: its own, or the one an endless level borrows. */
export const lookLevel = (config: LevelConfig): number => config.borrows ?? config.level;

/** Where the level after this one begins (metres): the next story level's threshold, then every ENDLESS_ZONE_M. */
export function levelEnd(level: number): number {
  return level < STORY_LEVELS ? LEVELS[level].distanceThreshold : ENDLESS_FROM_M + (level - STORY_LEVELS) * ENDLESS_ZONE_M;
}

/** The level at this distance; its look (for an endless level) by the run's look seed. */
export function getLevelForDistance(distance: number, seed = 0): LevelConfig {
  return levelConfig(levelNumberAt(distance), seed);
}

/**
 * The level a run is in at this distance while the boss at `gate` metres is still to be beaten (Infinity: no boss
 * ahead). A level that starts at or past that boss is not reached until it is beaten: the fight is fought in the level
 * before, and the new one arrives after it, as the reward.
 */
export function levelBefore(distance: number, gate: number, seed = 0): LevelConfig {
  return getLevelForDistance(Math.min(distance, gate - 1e-6), seed);
}
