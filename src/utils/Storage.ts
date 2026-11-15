import type { RunTrack } from '../systems/BestRunGhost';

const KEYS = {
  PLAYER_NAME: 'cockroach-mp-name',
  HIGH_SCORE: 'cockroach-highscore',
  BEST_DISTANCE: 'cockroach-best-distance',
  DAILY_BEST: 'cockroach-daily-best',
  BEST_RUN: 'cockroach-best-run',
  DAILY_BEST_RUN: 'cockroach-daily-best-run',
  GAMES_PLAYED: 'cockroach-games-played',
  MUSIC_VOLUME: 'cockroach-music-vol',
  SFX_VOLUME: 'cockroach-sfx-vol',
  TAUNTS: 'cockroach-taunts',
  RECORD_GHOST: 'cockroach-record-ghost',
  TUTORIAL_DONE: 'cockroach-tutorial-done',
  START_CHECKPOINT: 'cockroach-start-checkpoint',
  START_BESTS: 'cockroach-start-bests',
  ACHIEVEMENTS_SEEN: 'cockroach-achievements-seen',
} as const;

const DEFAULT_NAME = 'Karaluch';

export function getPlayerName(): string {
  return localStorage.getItem(KEYS.PLAYER_NAME) || '';
}

export function getPlayerNameOrDefault(): string {
  return getPlayerName() || DEFAULT_NAME;
}

export function isPlayerNameCustom(): boolean {
  return getPlayerName().length > 0;
}

export function setPlayerName(name: string): void {
  localStorage.setItem(KEYS.PLAYER_NAME, name.trim().slice(0, 20));
}

export function getHighScore(): number {
  return parseInt(localStorage.getItem(KEYS.HIGH_SCORE) || '0', 10);
}

export function setHighScore(score: number): void {
  localStorage.setItem(KEYS.HIGH_SCORE, score.toString());
}

export function updateHighScoreIfBetter(score: number): boolean {
  if (score > getHighScore()) {
    setHighScore(score);
    return true;
  }
  return false;
}

export function getBestDistance(): number {
  return parseInt(localStorage.getItem(KEYS.BEST_DISTANCE) || '0', 10);
}

export function updateBestDistanceIfBetter(distance: number): void {
  if (distance > getBestDistance()) localStorage.setItem(KEYS.BEST_DISTANCE, Math.floor(distance).toString());
}

/** Your best Karaluch Dnia score of this day; 0 on a new day. */
export function getDailyBest(date: string): number {
  try {
    const saved = JSON.parse(localStorage.getItem(KEYS.DAILY_BEST) ?? 'null') as { date?: string; score?: number } | null;
    return saved?.date === date && typeof saved.score === 'number' ? saved.score : 0;
  } catch {
    return 0;
  }
}

export function updateDailyBestIfBetter(date: string, score: number): void {
  if (score > getDailyBest(date)) localStorage.setItem(KEYS.DAILY_BEST, JSON.stringify({ date, score }));
}

/**
 * Your best score from each place a solo run can start (metres: 0, or a checkpoint's distance), for the record ghost:
 * a record set from a checkpoint is no race for a run from elsewhere, so each start keeps its own.
 */
function startBests(): Record<string, number> {
  try {
    const saved = JSON.parse(localStorage.getItem(KEYS.START_BESTS) ?? 'null') as Record<string, number> | null;
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}

/** The best score from this start. Before checkpoints every run started at 0: the record was the record from 0. */
export function getStartBest(from: number): number {
  const best = startBests()[from];
  return typeof best === 'number' ? best : from === 0 ? getHighScore() : 0;
}

/**
 * Call before the all-time record is updated: the first time, the record from 0 is pinned from it, before a run from a
 * checkpoint can lift it.
 */
export function updateStartBestIfBetter(from: number, score: number): void {
  const bests = startBests();
  if (typeof bests[0] !== 'number') bests[0] = getHighScore();
  if (score > (bests[from] ?? 0)) bests[from] = score;
  localStorage.setItem(KEYS.START_BESTS, JSON.stringify(bests));
}

/** The record run's path from this start (metres), or your best Karaluch Dnia run of that day, for its ghost. */
export function loadBestTrack(daily?: string, from = 0): RunTrack | null {
  try {
    if (daily) {
      const saved = JSON.parse(localStorage.getItem(KEYS.DAILY_BEST_RUN) ?? 'null') as { date?: string; track?: RunTrack } | null;
      return saved?.date === daily && saved.track ? saved.track : null;
    }
    return JSON.parse(localStorage.getItem(bestRunKey(from)) ?? 'null') as RunTrack | null;
  } catch {
    return null;
  }
}

/** From 0 the key it always had, so tracks saved before checkpoints still race. */
const bestRunKey = (from: number): string => (from === 0 ? KEYS.BEST_RUN : `${KEYS.BEST_RUN}-${from}`);

export function saveBestTrack(track: RunTrack, daily?: string, from = 0): void {
  try {
    if (daily) localStorage.setItem(KEYS.DAILY_BEST_RUN, JSON.stringify({ date: daily, track }));
    else localStorage.setItem(bestRunKey(from), JSON.stringify(track));
  } catch {
    // Storage full or blocked: the ghost is a nicety, the run is saved either way
  }
}

export function getGamesPlayed(): number {
  return parseInt(localStorage.getItem(KEYS.GAMES_PLAYED) || '0', 10);
}

export function incrementGamesPlayed(): void {
  localStorage.setItem(KEYS.GAMES_PLAYED, (getGamesPlayed() + 1).toString());
}

export function getMusicVolume(): number {
  return parseFloat(localStorage.getItem(KEYS.MUSIC_VOLUME) ?? '1');
}

export function setMusicVolume(vol: number): void {
  localStorage.setItem(KEYS.MUSIC_VOLUME, vol.toString());
}

/** Effects start a step under the music, so they sit in the mix until the player chooses otherwise. */
const DEFAULT_SFX_VOLUME = '0.8';

export function getSfxVolume(): number {
  return parseFloat(localStorage.getItem(KEYS.SFX_VOLUME) ?? DEFAULT_SFX_VOLUME);
}

export function setSfxVolume(vol: number): void {
  localStorage.setItem(KEYS.SFX_VOLUME, vol.toString());
}

/** Bosses mock the roach while it runs, on by default. */
export function getTauntsEnabled(): boolean {
  return localStorage.getItem(KEYS.TAUNTS) !== 'off';
}

export function setTauntsEnabled(on: boolean): void {
  localStorage.setItem(KEYS.TAUNTS, on ? 'on' : 'off');
}

/** The record run racing beside you as a pale roach, off unless the player turns it on. */
export function getRecordGhostEnabled(): boolean {
  return localStorage.getItem(KEYS.RECORD_GHOST) === 'on';
}

export function setRecordGhostEnabled(on: boolean): void {
  localStorage.setItem(KEYS.RECORD_GHOST, on ? 'on' : 'off');
}

/** Whether the opening tutorial has been finished (or skipped) on this device. */
export function isTutorialDone(): boolean {
  return localStorage.getItem(KEYS.TUTORIAL_DONE) === 'yes';
}

export function setTutorialDone(done: boolean): void {
  if (done) localStorage.setItem(KEYS.TUTORIAL_DONE, 'yes');
  else localStorage.removeItem(KEYS.TUTORIAL_DONE);
}

/** Where the last solo run was started from in the menu: 0 the start, otherwise a checkpoint's index (checkpoints.ts). */
export function getStartCheckpoint(): number {
  return parseInt(localStorage.getItem(KEYS.START_CHECKPOINT) || '0', 10) || 0;
}

export function setStartCheckpoint(index: number): void {
  localStorage.setItem(KEYS.START_CHECKPOINT, index.toString());
}

/** The achievements (ids) that were earned when the achievements page was last opened on this device; the rest are news. */
export function getAchievementsSeen(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(KEYS.ACHIEVEMENTS_SEEN) ?? 'null') as unknown;
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function setAchievementsSeen(ids: string[]): void {
  localStorage.setItem(KEYS.ACHIEVEMENTS_SEEN, JSON.stringify(ids));
}
