import { STORY_LEVELS } from '../config/levels';
import { Abilities } from './abilities';
import { RunFeats } from './RunFeats';

/** Per-run values that GameScene and its systems read and write together. */
export class RunState {
  isDead = false;
  isCountingDown = true;
  currentLevel = 1;
  /** Time actually played (ms), pauses and fights excluded: what the run's stats and time survived count. */
  activePlayTime = 0;
  /**
   * Where the course clock starts (ms): 0, or for a run started from a checkpoint the nominal runner's time there
   * (checkpoints.ts). The one place the offset lives: the speed formula and the enemies' timing read courseTime.
   */
  courseOffset = 0;

  score = 0;
  lastScoreTime = 0;
  /** Where the run started (metres): the distance points count only what is run from here. */
  startMetre = 0;
  /** The distance's points, metre by metre (DistancePoints). */
  distancePoints = new DistancePoints(0);

  pickupCombo = 0;
  maxCombo = 0;
  applesCollected = 0;
  beersCollected = 0;
  pillsCollected = 0;
  nearMisses = 0;
  dashThroughs = 0;
  wallsBroken = 0;
  /** Enemies the run's pistol took down. */
  kills = 0;

  /** Bosses beaten, hits, the moult and the pistol's silence: what the achievements ask beyond the counters. */
  readonly feats = new RunFeats();

  /** What the roach can do, earned from bosses. Reset with the run. */
  readonly abilities = new Abilities();

  /** The course clock: time played plus where the run started on the course. */
  get courseTime(): number {
    return this.activePlayTime + this.courseOffset;
  }

  reset(now: number, multiplayer: boolean, keepsDash = false, startMetre = 0): void {
    this.isDead = false;
    this.isCountingDown = true;
    this.currentLevel = 1;
    this.courseOffset = 0;
    this.startMetre = startMetre;
    this.restartCounts(now);
    this.abilities.reset(multiplayer, keepsDash);
  }

  /** Back to 0 m, 0 points and no records, keeping what the roach owns: where the real run starts after the tutorial. */
  restartCounts(now: number): void {
    this.activePlayTime = 0;
    this.score = 0;
    this.lastScoreTime = now;
    this.distancePoints = new DistancePoints(this.startMetre);
    this.pickupCombo = 0;
    this.maxCombo = 0;
    this.applesCollected = 0;
    this.beersCollected = 0;
    this.pillsCollected = 0;
    this.nearMisses = 0;
    this.dashThroughs = 0;
    this.wallsBroken = 0;
    this.kills = 0;
    this.feats.restart();
  }
}

export function comboMultiplier(combo: number): number {
  return 1 + combo * 0.025;
}

/** A pickup let go by halves the combo, rounded down: a streak of 120 drops to 60, one of 1 to 0. */
export function comboAfterMiss(combo: number): number {
  return Math.floor(combo / 2);
}

/**
 * The combo after `missed` pickups let go by, one halving each, in the order they went: the same however the frames
 * split them (two pickups leaving in one long frame halve it twice, as in two short ones).
 */
export function comboAfterMisses(combo: number, missed: number): number {
  let left = combo;
  for (let i = 0; i < missed; i++) left = comboAfterMiss(left);
  return left;
}

/** What a drop of the combo shows: nothing, a new slab (with its shake and sting), or the slab already up, retotalled. */
export type DropBeat = { kind: 'none' } | { kind: 'slab'; lost: number } | { kind: 'update'; lost: number };

/**
 * One clear beat for the combo's drops. A drop of fewer than SMALL_DROP shows nothing of its own (the HUD's number
 * changing is enough). A bigger one puts up the slab, with the shake and the sting; while that slab is up (its hold),
 * every further drop only adds to the number on it, the total lost since it appeared: no second slab, shake or sting.
 */
export class ComboDrops {
  static readonly SMALL_DROP = 5;
  /** How long a slab counts as up after it appears, ms (VisualEffects.comboLostEffect holds it this long). */
  static readonly HOLD_MS = 1400;
  private shownAt = -Infinity;
  private total = 0;

  drop(lost: number, now: number): DropBeat {
    if (lost <= 0) return { kind: 'none' };
    if (now - this.shownAt < ComboDrops.HOLD_MS) {
      this.total += lost;
      return { kind: 'update', lost: this.total };
    }
    if (lost < ComboDrops.SMALL_DROP) return { kind: 'none' };
    this.shownAt = now;
    this.total = lost;
    return { kind: 'slab', lost };
  }
}

/**
 * In endless level 10 + z, pickups and close calls (and kills) pay (1 + 0.1z) times as much, on top of the combo:
 * level / 10, so 1.1 in level 11 and 2 in level 20. No cap. 1 in the story.
 */
export function endlessBonus(level: number): number {
  return level > STORY_LEVELS ? level / 10 : 1;
}

/** What a pickup or a close call multiplies its points by: the combo's multiplier, and the endless bonus on top. */
export function pickupMultiplier(combo: number, level: number): number {
  return comboMultiplier(combo) * endlessBonus(level);
}

/**
 * Distance pays: a quarter point for every metre run, times the level the roach is in at that metre (11, 12, ... in
 * endless), never times the combo. Counted from whole metres crossed, in quarters, so it is exact whatever the frame
 * timing: no rounding drift, the same total for the same metres. Only metres past where it started count (a checkpoint
 * pays nothing for the metres before it), and only while the distance moves (the tutorial and the boss fights hold it).
 */
export class DistancePoints {
  /** The next metre to pay for. */
  private metre: number;
  /** Quarter points earned and not yet paid as a whole point. */
  private quarters = 0;

  constructor(startMetre: number) {
    this.metre = Math.floor(startMetre);
  }

  /** The roach has run to `distance` metres: the whole points the metres crossed since the last call earned. */
  advance(distance: number, levelAt: (metre: number) => number): number {
    const reached = Math.floor(distance);
    for (; this.metre < reached; this.metre++) this.quarters += levelAt(this.metre);
    const points = Math.floor(this.quarters / 4);
    this.quarters -= points * 4;
    return points;
  }
}
