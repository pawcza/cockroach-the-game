/**
 * What a profile is made of and how it changes, without the browser: a run counted into the stats, the achievements the
 * stats still reach, and two copies (this browser's and the account's) merged. Profile.ts keeps them and stores them.
 */
import { ACHIEVEMENTS, BOSS_WINS, mergeProfileCopies, type ProfileCopy, type Stats } from '../../server/achievements';
import type { BossId } from './boss/bosses';
import type { FeatsSnapshot } from './RunFeats';

/** One run as it stands, during it or at its end. */
export interface RunSnapshot {
  score: number;
  /** Metres, counted from the course's start: a run from a checkpoint starts at its distance. */
  distance: number;
  /** Where the run started (0, or a checkpoint's distance): only the metres past it were run. */
  startDistance: number;
  /** The highest level the run ran into (checkpoints.ts levelReached): a checkpoint's start level does not count. */
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
  daily: boolean;
  /** What the run did that its counters don't say: bosses, hits, the moult, the pistol (RunFeats). */
  feats: FeatsSnapshot;
}

export interface ProfileData {
  stats: Stats;
  /** Achievement id → when it was earned (ms). */
  achievements: Record<string, number>;
}

export const EMPTY: Stats = {
  runs: 0, distance: 0, apples: 0, beers: 0, pills: 0, nearMisses: 0, dashThroughs: 0, wallsBroken: 0, kills: 0, dailyRuns: 0,
  matches: 0, matchWins: 0, seconds: 0, bestScore: 0, bestDistance: 0, bestLevel: 0, bestCombo: 0,
  checkpoints: 0,
  lodziaWins: 0, bigosWins: 0, zlewiatanWins: 0, eksterminatorWins: 0, noHitBossWins: 0, allBossRuns: 0, moultSaves: 0,
  bestKills: 0, pacifistRuns: 0, missionsDone: 0, itemsOwned: 0,
};
/**
 * Only achievements that exist and these stats reach: ones since retired or made harder drop out. Stats only grow,
 * so anything earned under today's rules always stays.
 */
export function reached(stats: Stats, achievements: Record<string, number>): Record<string, number> {
  return Object.fromEntries(ACHIEVEMENTS.filter(a => achievements[a.id] && a.test(stats)).map(a => [a.id, achievements[a.id]]));
}

/** Each boss the run beat, one more win. */
function bossWins(stats: Stats, beaten: readonly BossId[]): Partial<Stats> {
  const wins: Partial<Stats> = {};
  for (const id of beaten) {
    const key = BOSS_WINS[id];
    if (key) wins[key] = (wins[key] ?? stats[key]) + 1;
  }
  return wins;
}

/** The totals with a run counted in: sums for the totals, the larger for the bests. */
export function withRun(stats: Stats, run: RunSnapshot, finished: boolean): Stats {
  return {
    ...stats,
    runs: stats.runs + (finished ? 1 : 0),
    distance: stats.distance + run.distance - run.startDistance,
    apples: stats.apples + run.apples,
    beers: stats.beers + run.beers,
    pills: stats.pills + run.pills,
    nearMisses: stats.nearMisses + run.nearMisses,
    dashThroughs: stats.dashThroughs + run.dashThroughs,
    wallsBroken: stats.wallsBroken + run.wallsBroken,
    kills: stats.kills + run.kills,
    bestKills: Math.max(stats.bestKills, run.kills),
    ...bossWins(stats, run.feats.bosses),
    noHitBossWins: stats.noHitBossWins + run.feats.noHitWins,
    allBossRuns: stats.allBossRuns + (run.feats.allBosses ? 1 : 0),
    moultSaves: stats.moultSaves + run.feats.moultSaves,
    pacifistRuns: stats.pacifistRuns + (run.feats.pacifist ? 1 : 0),
    dailyRuns: stats.dailyRuns + (finished && run.daily ? 1 : 0),
    seconds: stats.seconds + run.seconds,
    // A record of a ranked run: from a checkpoint the same score is easier, so it moves neither this nor its achievements
    bestScore: run.startDistance === 0 ? Math.max(stats.bestScore, run.score) : stats.bestScore,
    bestDistance: Math.max(stats.bestDistance, run.distance),
    bestLevel: Math.max(stats.bestLevel, run.level),
    bestCombo: Math.max(stats.bestCombo, run.combo),
  };
}

export function merge(a: ProfileData, b: Partial<ProfileData> | null): ProfileData {
  const merged = mergeProfileCopies(a as unknown as ProfileCopy, b as Partial<ProfileCopy> | null);
  return { stats: merged.stats as unknown as Stats, achievements: reached(merged.stats as unknown as Stats, merged.achievements) };
}
