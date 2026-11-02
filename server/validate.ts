/** Everything the server accepts from a client passes through here. Nothing a client sends is trusted as-is. */

export const MAX_NAME_LENGTH = 20;
export const MAX_SCORE = 1_000_000;
const MAX_STAT = 10_000_000;
const MAX_COORD = 1_000_000_000;
const MAX_PROJECTILE_SPEED = 5000;

export type Lane = 'top' | 'bottom';

const DEATH_CAUSES = new Set([
  'onion', 'spray', 'flipper', 'newspaper', 'bird', 'cat', 'disco',
  'jellyfish', 'pope', 'bison', 'blackhole', 'boss', 'fall',
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

export interface ScoreSubmission {
  name: string;
  score: number;
  deathCause: string | null;
  distance: number | null;
  timeSurvived: number | null;
  applesCollected: number | null;
  tyskiesCollected: number | null;
  pillsCollected: number | null;
  maxLevel: number | null;
  maxCombo: number | null;
}

export function parseScoreSubmission(body: unknown): ScoreSubmission | { error: string } {
  if (!isRecord(body)) return { error: 'Invalid body' };

  const name = cleanName(body.name);
  if (!name || name.length > MAX_NAME_LENGTH) return { error: `Name must be 1-${MAX_NAME_LENGTH} characters` };

  const score = parseScore(body.score);
  if (score === null) return { error: `Score must be an integer from 0 to ${MAX_SCORE}` };

  return {
    name,
    score,
    deathCause: parseDeathCause(body.deathCause),
    distance: wholeStat(body.distance),
    timeSurvived: wholeStat(body.timeSurvived),
    applesCollected: wholeStat(body.applesCollected),
    tyskiesCollected: wholeStat(body.tyskiesCollected),
    pillsCollected: wholeStat(body.pillsCollected),
    maxLevel: wholeStat(body.maxLevel),
    maxCombo: wholeStat(body.maxCombo),
  };
}
