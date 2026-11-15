/**
 * Your stats and achievements. Kept in the browser; signed in, also on your account, so they follow you between
 * devices. Two copies merge by keeping the larger of every number and every achievement either one has.
 */
import { account } from '../ui/Account';
import { getAchievementsSeen, setAchievementsSeen } from '../utils/Storage';
import { ACHIEVEMENTS, achievementTitle, CARDS, ONE_OFFS, type Achievement, type Stats } from '../../server/achievements';
import { devRunFrom } from './devRun';
import { EMPTY, kept, merge, withRun, type ProfileData, type RunSnapshot } from './profileStats';

export { ACHIEVEMENTS, achievementTitle, CARDS, ONE_OFFS, type Achievement, type RunSnapshot, type Stats };

const KEY = 'cockroach-profile';

let current: ProfileData = load();

function load(): ProfileData {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<ProfileData> | null;
    const stats = { ...EMPTY, ...saved?.stats };
    const achievements = kept({ ...saved?.achievements });
    // Levels and achievements added since this was saved: what the stats already reach is earned, without a fanfare
    for (const a of ACHIEVEMENTS) if (!achievements[a.id] && a.test(stats)) achievements[a.id] = Date.now();
    return { stats, achievements };
  } catch {
    return { stats: { ...EMPTY }, achievements: {} };
  }
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

/** Earns whatever these stats reach that isn't earned yet, and returns those. */
function award(stats: Stats): Achievement[] {
  const earned = ACHIEVEMENTS.filter(a => !current.achievements[a.id] && a.test(stats));
  for (const achievement of earned) current.achievements[achievement.id] = Date.now();
  if (earned.length > 0) store();
  return earned;
}

/** A run under a dev switch (devRun.ts) records nothing here: no stats, no achievements, no missions. */
const DEV_RUN = devRunFrom(window.location.search, import.meta.env.DEV);
export const devRun = (): boolean => DEV_RUN;

/** During a run: what the run so far has earned, at once, without counting the run yet. */
export function awardDuringRun(run: RunSnapshot): Achievement[] {
  if (DEV_RUN) return [];
  return award(withRun(current.stats, run, false));
}

/** A run is over: count it, earn what it reached, save, and send it to the account. */
export function recordRun(run: RunSnapshot): Achievement[] {
  if (DEV_RUN) return [];
  current.stats = withRun(current.stats, run, true);
  const earned = award(current.stats);
  store();
  void pushProfile();
  return earned;
}

/** A multiplayer match is over. */
export function recordMatch(won: boolean): Achievement[] {
  if (DEV_RUN) return [];
  current.stats = { ...current.stats, matches: current.stats.matches + 1, matchWins: current.stats.matchWins + (won ? 1 : 0) };
  const earned = award(current.stats);
  store();
  void pushProfile();
  return earned;
}

/** Dev only, `?checkpoints=<n>`: that many checkpoints count as unlocked, without saving it, to try them. */
const DEV_CHECKPOINTS = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('checkpoints') : null;

/** How many boss checkpoints are unlocked (checkpoints.ts). */
export function checkpointsUnlocked(): number {
  return DEV_CHECKPOINTS !== null ? Number(DEV_CHECKPOINTS) || 0 : current.stats.checkpoints;
}

/** Unlocks the checkpoints up to this many, saved at once and sent to the account; true when it is news. */
export function unlockCheckpoints(count: number): boolean {
  // A run under a dev shortcut was never earned: it saves nothing
  if (DEV_RUN || count <= current.stats.checkpoints) return false;
  current.stats = { ...current.stats, checkpoints: count };
  store();
  void pushProfile();
  return true;
}

/** Earned when the server's record moved (missions done, items owned), not in a run: said where the player is next. */
let notices: Achievement[] = [];

/**
 * What the server counted that the client can't: missions done and items owned. The achievements on them are paid from
 * the server's record, and earned here from the same numbers, to be announced by whoever is on screen (takeNotices).
 */
export function noteFacts(facts: Pick<Stats, 'missionsDone' | 'itemsOwned'>): void {
  const { stats } = current;
  if (facts.missionsDone <= stats.missionsDone && facts.itemsOwned <= stats.itemsOwned) return;
  current.stats = {
    ...stats,
    missionsDone: Math.max(stats.missionsDone, facts.missionsDone),
    itemsOwned: Math.max(stats.itemsOwned, facts.itemsOwned),
  };
  notices.push(...award(current.stats));
  store();
}

/** The achievements earned off a run since this was last asked, for the screen to announce. */
export function takeNotices(): Achievement[] {
  const taken = notices;
  notices = [];
  return taken;
}

/** Sends this browser's copy to the account: kept there for every device (nothing is paid from it: the server counts runs). */
async function pushProfile(): Promise<void> {
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

/** Whether anything was earned since the achievements page was last opened (the trophy on the home screen shows it). */
export function achievementsUnseen(): boolean {
  const seen = new Set(getAchievementsSeen());
  return Object.keys(current.achievements).some(id => !seen.has(id));
}

/** The achievements page was opened: everything earned so far is seen. */
export function markAchievementsSeen(): void {
  setAchievementsSeen(Object.keys(current.achievements));
}

/** How many of the achievements are earned. */
export function earnedCount(): number {
  return ACHIEVEMENTS.filter(a => current.achievements[a.id]).length;
}
