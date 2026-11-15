/** Everything the server accepts from a client passes through here. Nothing a client sends is trusted as-is. */
import { mergeProfileCopies } from './achievements';
import { CHECKPOINT_STARTS, ENDLESS_START } from './bossDistances';
import { COURSE_VERSION } from './daily';
import { SKIN_CAUSES } from './enemySkins';

export const MAX_NAME_LENGTH = 20;
export const MAX_SCORE = 1_000_000;
const MAX_STAT = 10_000_000;
const MAX_COORD = 1_000_000_000;
const MAX_PROJECTILE_SPEED = 5000;

export type Lane = 'top' | 'bottom';

const DEATH_CAUSES = new Set([
  'onion', 'spray', 'flipper', 'newspaper', 'bird', 'cat', 'disco',
  'jellyfish', 'pope', 'bison', 'blackhole', 'glue', 'bleach', 'lamp', 'mop', 'vacuum', 'hen', 'frog', 'centipede', 'boots', 'hedgehog',
  'gull', 'wasp', 'zapper', 'robotVacuum', 'repeller', 'aerosol', 'bait', 'boss', 'lodzia', 'bigos', 'eksterminator', 'fall', 'wall',
  // The enemies' level skins, each its own cause (enemySkins.ts). An older client never sends one; an older server drops
  // one it doesn't know (the cause is left out, the run still counts)
  ...SKIN_CAUSES,
]);

const NUMERIC_STATS = [
  'timeSurvived', 'distance', 'maxSpeed', 'applesCollected', 'beersCollected',
  'tyskiesCollected', 'pillsCollected', 'maxCombo', 'maxLevel',
] as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Trimmed text without control characters, or null when nothing is left. */
export function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.replace(/\p{Cc}/gu, '').trim();
  return name.length > 0 ? name : null;
}

export function parseLobbyId(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Z2-9]{6}$/.test(value) ? value : null;
}

export function parseLane(value: unknown): Lane | null {
  return value === 'top' || value === 'bottom' ? value : null;
}

/** A world position or play time; undefined when it isn't usable. */
export function parseCoord(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_COORD ? value : undefined;
}

export function parseScore(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_SCORE ? value : null;
}

function parseStat(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_STAT ? value : null;
}

function wholeStat(value: unknown): number | null {
  const stat = parseStat(value);
  return stat === null ? null : Math.round(stat);
}

export function parseDeathCause(value: unknown): string | null {
  return typeof value === 'string' && DEATH_CAUSES.has(value) ? value : null;
}

/** Keeps only the known stat fields, so a client can't relay anything else to the rest of its lobby. */
export function parseRunStats(value: unknown): Record<string, number | string> {
  const stats: Record<string, number | string> = {};
  if (!isRecord(value)) return stats;
  for (const key of NUMERIC_STATS) {
    const stat = parseStat(value[key]);
    if (stat !== null) stats[key] = stat;
  }
  const cause = parseDeathCause(value.obstacleType);
  if (cause) stats.obstacleType = cause;
  return stats;
}

export interface BossProjectile {
  lane: Lane;
  speed: number;
  faceIdx: number;
  indestructible: boolean;
  volley: boolean;
}

export function parseBossProjectile(value: unknown): BossProjectile | null {
  if (!isRecord(value)) return null;
  const lane = parseLane(value.lane);
  const { speed, faceIdx, indestructible, volley } = value;
  if (!lane) return null;
  if (typeof speed !== 'number' || !Number.isFinite(speed) || Math.abs(speed) > MAX_PROJECTILE_SPEED) return null;
  if (typeof faceIdx !== 'number' || !Number.isInteger(faceIdx) || faceIdx < -1 || faceIdx > 2) return null;
  if (typeof indestructible !== 'boolean' || typeof volley !== 'boolean') return null;
  return { lane, speed, faceIdx, indestructible, volley };
}

/** A finished run as a client reports it. The name on the board comes from the signed-in account, not from here. */
export interface ScoreSubmission {
  score: number;
  deathCause: string | null;
  distance: number | null;
  timeSurvived: number | null;
  applesCollected: number | null;
  tyskiesCollected: number | null;
  pillsCollected: number | null;
  maxLevel: number | null;
  maxCombo: number | null;
  /** The day of a Karaluch Dnia run; null for an ordinary one. */
  daily: string | null;
  /** The board it goes on besides the day's: null for the main one, 'endless' for a run from the Eksterminator's start. */
  board: 'endless' | null;
}

/**
 * Where the run started (metres): 0, or a checkpoint's distance. Absent counts as 0: a client cached from before
 * checkpoints can only start there, and one from before the endless board cannot start at the Eksterminator. A start
 * that is neither is junk.
 */
function parseStart(value: unknown): number | null {
  if (value === undefined || value === null) return 0;
  return typeof value === 'number' && (value === 0 || CHECKPOINT_STARTS.includes(value)) ? value : null;
}

export function parseScoreSubmission(body: unknown): ScoreSubmission | { error: string } {
  if (!isRecord(body)) return { error: 'Invalid body' };

  const score = parseScore(body.score);
  if (score === null) return { error: `Score must be an integer from 0 to ${MAX_SCORE}` };

  // A run from a checkpoint is practice, whatever the client thinks it may send: only runs from 0 m make the main board
  // (or the day's), and runs from the Eksterminator's start the endless one
  const start = parseStart(body.start);
  if (start === null) return { error: 'Invalid start' };
  const endless = start === ENDLESS_START;
  if (start > 0 && !endless) return { error: 'A run from a checkpoint is practice and is not ranked' };
  const daily = parseDay(body.daily);
  if (endless && daily) return { error: 'Karaluch Dnia starts from 0 m' };
  // A daily run is laid from the day's seed: only a client laying today's course may be on its board
  if (daily && body.course !== COURSE_VERSION) return { error: 'This version of the game is out of date: reload it' };

  return {
    score,
    deathCause: parseDeathCause(body.deathCause),
    distance: wholeStat(body.distance),
    timeSurvived: wholeStat(body.timeSurvived),
    applesCollected: wholeStat(body.applesCollected),
    tyskiesCollected: wholeStat(body.tyskiesCollected),
    pillsCollected: wholeStat(body.pillsCollected),
    maxLevel: wholeStat(body.maxLevel),
    maxCombo: wholeStat(body.maxCombo),
    daily,
    board: endless ? 'endless' : null,
  };
}

/** A calendar day, YYYY-MM-DD; whether it is still open is the server's call. */
export function parseDay(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

const MAX_PROFILE_STAT = 1_000_000_000;
const MAX_PROFILE_STATS = 48;
const MAX_ACHIEVEMENTS = 128;

/**
 * Stats that can only be so large, whatever a client claims: a boss is beaten once a run, and a run takes minutes. A
 * bigger number is not refused (the profile is saved as it is for the rest) but held to the cap, so nothing a client
 * invents reaches further than a player who played for years would. Missions done and items owned are claims too: what
 * is paid on is the server's own record (economy.ts).
 */
const PROFILE_STAT_CAPS: Record<string, number> = {
  lodziaWins: 100_000, bigosWins: 100_000, zlewiatanWins: 100_000, eksterminatorWins: 100_000,
  noHitBossWins: 400_000, allBossRuns: 100_000, moultSaves: 1_000_000, bestKills: 1_000, pacifistRuns: 100_000,
  missionsDone: 100_000, itemsOwned: 100, checkpoints: 10,
};

export interface ProfileData {
  stats: Record<string, number>;
  achievements: Record<string, number>;
}

/**
 * A player's stats and achievements as the client keeps them. Only short ids and finite numbers get through, so
 * nothing else can be stored or shown to anyone.
 */
export function parseProfile(body: unknown): ProfileData | null {
  if (!isRecord(body) || !isRecord(body.stats) || !isRecord(body.achievements)) return null;
  const pick = (source: Record<string, unknown>, limit: number): Record<string, number> | null => {
    const out: Record<string, number> = {};
    const entries = Object.entries(source);
    if (entries.length > limit) return null;
    for (const [key, value] of entries) {
      if (!/^[a-zA-Z0-9-]{1,32}$/.test(key)) return null;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > (limit === MAX_ACHIEVEMENTS ? Number.MAX_SAFE_INTEGER : MAX_PROFILE_STAT)) return null;
      out[key] = Math.floor(value);
    }
    return out;
  };
  const stats = pick(body.stats, MAX_PROFILE_STATS);
  if (stats) for (const [key, cap] of Object.entries(PROFILE_STAT_CAPS)) if (key in stats) stats[key] = Math.min(stats[key], cap);
  const achievements = pick(body.achievements, MAX_ACHIEVEMENTS);
  return stats && achievements ? { stats, achievements } : null;
}

/**
 * A save folded into the stored profile, so a client that doesn't know a newer stat (an old bundle still cached) can't
 * erase it: the larger of every stat, every achievement with its earlier time. Null when the result would outgrow what
 * a profile may hold, which only junk keys can do.
 */
export function mergeIntoStored(incoming: ProfileData, stored: unknown): ProfileData | null {
  const before = parseProfile(stored);
  const merged = before ? mergeProfileCopies(incoming, before) : incoming;
  if (Object.keys(merged.stats).length > MAX_PROFILE_STATS || Object.keys(merged.achievements).length > MAX_ACHIEVEMENTS) return null;
  return merged;
}
