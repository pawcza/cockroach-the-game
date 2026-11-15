/**
 * Where each boss waits (metres into a run), kept here because the client's boss registry (src/systems/boss/bosses.ts)
 * and the server's score check both read it, and the server cannot import from src. No Node imports: the client imports
 * this file too (like lobby.ts and achievements.ts).
 */
export const BOSS_TRIGGER_DISTANCE = {
  lodzia: 250,
  bigos: 1200,
  zlewiatan: 1800,
  eksterminator: 2600,
} as const;

/** The distances a run may start from besides 0: every boss's (src/systems/checkpoints.ts). */
export const CHECKPOINT_STARTS: readonly number[] = Object.values(BOSS_TRIGGER_DISTANCE).sort((a, b) => a - b);

/** The last boss's start: the endless levels, ranked on their own board ("Bez końca"). */
export const ENDLESS_START: number = BOSS_TRIGGER_DISTANCE.eksterminator;

/** The other starts: practice, never ranked. */
export const PRACTICE_STARTS: readonly number[] = CHECKPOINT_STARTS.filter(start => start !== ENDLESS_START);
