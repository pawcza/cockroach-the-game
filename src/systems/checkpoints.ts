/**
 * Checkpoints: beating a boss in a solo run lets later solo runs start right after him, in the level he guards, with
 * him and every boss before him counted as beaten and their powers owned. Pure and Phaser-free, so the rules can be
 * tested. The last boss's (the Eksterminator's) starts the endless levels: level 11, ranked on a board of its own
 * ("Bez końca"); the others are practice. Bosses are only ever beaten in order, so the unlocked checkpoints are always
 * the first few: the profile keeps how many (Profile.checkpoints).
 */
import { CHECKPOINT_RAMP_MS_PER_SPEED, COCKROACH_BASE_SPEED, COCKROACH_START_X } from '../config/constants';
import { getLevelForDistance, LevelConfig, LEVELS, levelBefore } from '../config/levels';
import { cruiseSpeed, nominalCourse } from '../objects/obstacles/cast';
import { BOSSES, BossDef, BossId } from './boss/bosses';
import { bossX } from './CourseLayout';

/** "po ..." in the menu: who the start comes after, as Polish says it. */
const AFTER: Partial<Record<BossId, string>> = {
  lodzia: 'po Pani Lodzi',
  bigos: 'po DJ Bigosie',
  zlewiatan: 'po Zlewiatanie',
  eksterminator: 'po Eksterminatorze',
};

/** What the endless levels and their board are called. */
export const ENDLESS_NAME = 'Bez końca';

export interface Checkpoint {
  /** 1 for the first boss's, and so on: how many checkpoints must be unlocked for this one. */
  index: number;
  boss: BossDef;
  /** Metres: the boss's trigger distance, where the run starts. */
  distance: number;
  /** The level the run starts in: the one that follows the boss (for the last, level 11: its look is the run's). */
  level: LevelConfig;
  /** Where it starts, as the unlock notice names it: the level, or "Bez końca". */
  place: string;
  /**
   * In the menu, e.g. "Morze Bałtyckie — po DJ Bigosie · trening": a run from there is practice, never ranked. The last
   * one, "Bez końca — po Eksterminatorze", is ranked on the endless board.
   */
  label: string;
  /** The last boss's: the endless levels, on their own board. */
  endless: boolean;
}

const LADDER = [...BOSSES].sort((a, b) => a.triggerDistance - b.triggerDistance);

/** Every boss, in the order they are met: each one's start right after him. */
export const CHECKPOINTS: readonly Checkpoint[] = LADDER.map((boss, i) => {
  const next = LADDER[i + 1]?.triggerDistance ?? Infinity;
  const level = levelBefore(boss.triggerDistance, next);
  const endless = next === Infinity;
  const place = endless ? ENDLESS_NAME : level.name;
  const after = AFTER[boss.id] ?? `po ${boss.name}`;
  return {
    index: i + 1,
    boss,
    distance: boss.triggerDistance,
    level,
    place,
    label: endless ? `${place} — ${after}` : `${place} — ${after} · trening`,
    endless,
  };
});

/** The endless start: the last boss's checkpoint. */
export const ENDLESS_CHECKPOINT: Checkpoint = CHECKPOINTS[CHECKPOINTS.length - 1];

/** The menu's first choice, with nothing beaten. */
export const FROM_START_LABEL = 'Od początku';

/**
 * The board a run is ranked on: a run from 0 m on the main one (and the record, the score achievements); one from the
 * Eksterminator's checkpoint on the endless one ("Bez końca", from 0 points there, with its own local best); one from
 * any other checkpoint on none: it is practice, so the same score earned there isn't set against runs that earned it
 * from the start.
 */
export type Board = 'main' | 'endless';
export function boardOf(start: Pick<RunStart, 'index'>): Board | null {
  if (start.index === 0) return 'main';
  return start.index === ENDLESS_CHECKPOINT.index ? 'endless' : null;
}

/** Only a run from 0 m makes the main board, the record and the score achievements. */
export const isRanked = (start: Pick<RunStart, 'index'>): boolean => boardOf(start) === 'main';

/** The checkpoints a player with `count` unlocked can start from. */
export function unlockedCheckpoints(count: number): readonly Checkpoint[] {
  return CHECKPOINTS.slice(0, Math.max(0, Math.min(CHECKPOINTS.length, Math.floor(count))));
}

/** A start asked for, as one the player may take: 0 (the start) unless that checkpoint is unlocked. */
export function allowedStart(requested: number | undefined, unlocked: number): number {
  const index = Math.floor(requested ?? 0);
  return index >= 1 && index <= unlockedCheckpoints(unlocked).length ? index : 0;
}

/**
 * How many checkpoints are unlocked once this boss is beaten: one more if he is the next one's boss. Only a solo run
 * unlocks one (a match fights its own version of Zlewiatan, with others), and never a boss reached by the dev shortcut
 * (`?boss=`), which skips everything before him.
 */
export function unlockedAfter(current: number, beaten: BossId, run: { multiplayer: boolean; devSkip: boolean }): number {
  if (run.multiplayer || run.devSkip) return current;
  const checkpoint = CHECKPOINTS.find(c => c.boss.id === beaten);
  return checkpoint ? Math.max(current, checkpoint.index) : current;
}

/** Everything a run needs to know about where it starts. */
export interface RunStart {
  /** 0: from the start; otherwise the checkpoint's index. */
  index: number;
  /** Metres, and the roach's world x there. */
  distance: number;
  x: number;
  level: LevelConfig;
  /** Counted as beaten from the first frame: they never trigger, and their rewards are owned. In the order met. */
  beaten: readonly BossDef[];
  /**
   * Where the run's course clock starts (ms): the nominal runner's time at this distance (cast.ts nominalCourse), so the
   * speed formula and the enemies' seeded timing see the course as a run that got here would. Never counted as played.
   */
  courseOffsetMs: number;
  /** How long the speed ramps up after the countdown (0: no ramp). */
  rampMs: number;
  /** The course lays only pickups and plain blockers short of this world x: the stretch the ramp covers. */
  calmUntilX: number;
}

/** The ramp starts the run at this share of its speed. */
const RAMP_FROM = 0.6;
const RAMP_STEP_MS = 50;

/** The ramp's length for a start at this speed: longer the further it is above the base speed. */
function rampDuration(startSpeed: number): number {
  return Math.max(0, startSpeed - COCKROACH_BASE_SPEED) * CHECKPOINT_RAMP_MS_PER_SPEED;
}

/** The share of the run's speed the ramp allows `elapsedMs` into it: 0.6 at the start, easing up to 1 at its end. */
export function rampFactor(elapsedMs: number, rampMs: number): number {
  if (rampMs <= 0 || elapsedMs >= rampMs) return 1;
  const p = Math.max(0, elapsedMs) / rampMs;
  return RAMP_FROM + (1 - RAMP_FROM) * (1 - Math.cos(Math.PI * p)) / 2;
}
/** Where a runner that never dashes, starting at `x`, is once the ramp is over: the calm stretch's end. */
function rampEnd(x: number, courseOffsetMs: number, rampMs: number): number {
  for (let t = 0; t < rampMs; t += RAMP_STEP_MS) {
    const level = getLevelForDistance(Math.floor((x - COCKROACH_START_X) / 50)).level;
    // Each step at the speed it ends on: the speed only rises through the ramp, so the stretch never falls short
    x += (cruiseSpeed(courseOffsetMs + t + RAMP_STEP_MS, level) * rampFactor(t + RAMP_STEP_MS, rampMs) * RAMP_STEP_MS) / 1000;
  }
  return x;
}

/** Where a run that starts from this checkpoint (0: the start) begins, and what it has from the first frame. */
export function runStart(index: number): RunStart {
  const checkpoint = CHECKPOINTS[index - 1];
  if (!checkpoint) {
    return {
      index: 0, distance: 0, x: COCKROACH_START_X, level: LEVELS[0], beaten: [],
      courseOffsetMs: 0, rampMs: 0, calmUntilX: -Infinity,
    };
  }
  const beaten = LADDER.filter(b => b.triggerDistance <= checkpoint.distance);
  const x = bossX(checkpoint.distance);
  const courseOffsetMs = nominalCourse.timeAt(x);
  const rampMs = rampDuration(cruiseSpeed(courseOffsetMs, checkpoint.level.level));
  return {
    index: checkpoint.index,
    distance: checkpoint.distance,
    x,
    level: checkpoint.level,
    beaten,
    courseOffsetMs,
    rampMs,
    calmUntilX: rampEnd(x, courseOffsetMs, rampMs),
  };
}

/**
 * The level a run counts as reached, for missions and achievements: one it ran into. A checkpoint's start level was
 * handed over, not reached, so a run from one counts nothing (0) until it gets into the next level. (The game over and
 * the board still show the level the run was in, like its distance.)
 */
export function levelReached(current: number, start: Pick<RunStart, 'index' | 'level'>): number {
  return start.index === 0 || current > start.level.level ? current : 0;
}
