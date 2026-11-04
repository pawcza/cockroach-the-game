/**
 * Your stats and achievements. Kept in the browser; signed in, also on your account, so they follow you between
 * devices. Two copies merge by keeping the larger of every number and every achievement either one has.
 */
import { account } from '../ui/Account';
import { ACHIEVEMENTS, type Achievement, type Stats } from '../../server/achievements';

export { ACHIEVEMENTS, type Achievement, type Stats };

/** One run as it stands, during it or at its end. */
export interface RunSnapshot {
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
  seconds: number;
  daily: boolean;
}

interface ProfileData {
  stats: Stats;
  /** Achievement id → when it was earned (ms). */
  achievements: Record<string, number>;
}

const EMPTY: Stats = {
  runs: 0, distance: 0, apples: 0, beers: 0, pills: 0, nearMisses: 0, dashThroughs: 0, wallsBroken: 0, dailyRuns: 0,
  matches: 0, matchWins: 0, seconds: 0, bestScore: 0, bestDistance: 0, bestLevel: 0, bestCombo: 0,
};
const BESTS: (keyof Stats)[] = ['bestScore', 'bestDistance', 'bestLevel', 'bestCombo'];

const KEY = 'cockroach-profile';

let current: ProfileData = load();

function load(): ProfileData {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<ProfileData> | null;
    const stats = { ...EMPTY, ...saved?.stats };
    return { stats, achievements: reached(stats, { ...saved?.achievements }) };
  } catch {
    return { stats: { ...EMPTY }, achievements: {} };
  }
}

/**
 * Only achievements that exist and these stats reach: ones since retired or made harder drop out. Stats only grow,
 * so anything earned under today's rules always stays.
 */
function reached(stats: Stats, achievements: Record<string, number>): Record<string, number> {
  return Object.fromEntries(ACHIEVEMENTS.filter(a => achievements[a.id] && a.test(stats)).map(a => [a.id, achievements[a.id]]));
}

function store(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage full or blocked: the stats live on for this session
  }
}

export function profile(): Readonly<ProfileData> {
  return current;
}

/** The totals with a run counted in: sums for the totals, the larger for the bests. */
function withRun(stats: Stats, run: RunSnapshot, finished: boolean): Stats {
  return {
    ...stats,
    runs: stats.runs + (finished ? 1 : 0),
    distance: stats.distance + run.distance,
    apples: stats.apples + run.apples,
    beers: stats.beers + run.beers,
    pills: stats.pills + run.pills,
    nearMisses: stats.nearMisses + run.nearMisses,
    dashThroughs: stats.dashThroughs + run.dashThroughs,
    wallsBroken: stats.wallsBroken + run.wallsBroken,
    dailyRuns: stats.dailyRuns + (finished && run.daily ? 1 : 0),
    seconds: stats.seconds + run.seconds,
    bestScore: Math.max(stats.bestScore, run.score),
    bestDistance: Math.max(stats.bestDistance, run.distance),
    bestLevel: Math.max(stats.bestLevel, run.level),
    bestCombo: Math.max(stats.bestCombo, run.combo),
  };
}

/** Earns whatever these stats reach that isn't earned yet, and returns those. */
function award(stats: Stats): Achievement[] {
  const earned = ACHIEVEMENTS.filter(a => !current.achievements[a.id] && a.test(stats));
  for (const achievement of earned) current.achievements[achievement.id] = Date.now();
  if (earned.length > 0) store();
  return earned;
}

/** During a run: what the run so far has earned, at once, without counting the run yet. */
export function awardDuringRun(run: RunSnapshot): Achievement[] {
  return award(withRun(current.stats, run, false));
}

/** A run is over: count it, earn what it reached, save, and send it to the account. */
export function recordRun(run: RunSnapshot): Achievement[] {
  current.stats = withRun(current.stats, run, true);
  const earned = award(current.stats);
  store();
  void pushProfile();
  return earned;
}

/** A multiplayer match is over. */
export function recordMatch(won: boolean): Achievement[] {
  current.stats = { ...current.stats, matches: current.stats.matches + 1, matchWins: current.stats.matchWins + (won ? 1 : 0) };
  const earned = award(current.stats);
  store();
  void pushProfile();
  return earned;
}

function merge(a: ProfileData, b: Partial<ProfileData> | null): ProfileData {
  const stats = { ...a.stats };
  for (const key of Object.keys(EMPTY) as (keyof Stats)[]) {
    const other = b?.stats?.[key];
    if (typeof other === 'number') stats[key] = Math.max(stats[key], other);
  }
  const achievements = { ...a.achievements };
  for (const [id, at] of Object.entries(b?.achievements ?? {})) {
    if (typeof at === 'number') achievements[id] = achievements[id] ? Math.min(achievements[id], at) : at;
  }
  return { stats, achievements: reached(stats, achievements) };
}

let pushing: Promise<void> = Promise.resolve();

/** Settles once the last copy sent to the account has landed, achievements paid; the shop asks after that. */
export const profilePushed = (): Promise<void> => pushing;

function pushProfile(): Promise<void> {
  pushing = send();
  return pushing;
}

async function send(): Promise<void> {
  if (!account()) return;
  try {
    await fetch('/api/me/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(current),
    });
  } catch {
    // Offline: the next run or sign-in sends it
  }
}

/** Signed in: fold the account's copy into this browser's and send the result back. Bests are kept, not summed. */
export async function syncProfile(): Promise<void> {
  if (!account()) return;
  try {
    const res = await fetch('/api/me/profile');
    if (!res.ok) return;
    const { profile: remote } = await res.json() as { profile: Partial<ProfileData> | null };
    current = merge(current, remote);
    // Anything the merged totals now reach is earned too
    award(current.stats);
    store();
    await pushProfile();
  } catch {
    // Offline: try again next time
  }
}

/** How many of the achievements are earned. */
export function earnedCount(): number {
  return ACHIEVEMENTS.filter(a => current.achievements[a.id]).length;
}
