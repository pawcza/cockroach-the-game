/** Everything the server accepts from a client passes through here. Nothing a client sends is trusted as-is. */

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
}

export function parseScoreSubmission(body: unknown): ScoreSubmission | { error: string } {
  if (!isRecord(body)) return { error: 'Invalid body' };

  const score = parseScore(body.score);
  if (score === null) return { error: `Score must be an integer from 0 to ${MAX_SCORE}` };

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
    daily: parseDay(body.daily),
  };
}

/** A calendar day, YYYY-MM-DD; whether it is still open is the server's call. */
export function parseDay(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

const MAX_PROFILE_STAT = 1_000_000_000;
const MAX_ACHIEVEMENTS = 64;

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
  const stats = pick(body.stats, 32);
  const achievements = pick(body.achievements, MAX_ACHIEVEMENTS);
  return stats && achievements ? { stats, achievements } : null;
}
