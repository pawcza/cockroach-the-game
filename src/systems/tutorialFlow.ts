/**
 * The opening tutorial's steps, without Phaser: which one the run is in, what moves it on, and where its pieces stand.
 * Each step ends on the player's own action; only the last, the send-off, is on a timer. The hop steps never complete
 * by themselves, the run just keeps waiting on a safe empty course.
 */

export type Lane = 'top' | 'bottom';

/** Hop up, drop back, dodge a lone obstacle, collect a trail of apples, "Powodzenia!", then the course. */
export type TutorialStep = 'hopUp' | 'dropDown' | 'obstacle' | 'apples' | 'finish' | 'done';

/** How long a hop step lets the empty run breathe before its prompt shows. */
export const PROMPT_DELAY_MS: Partial<Record<TutorialStep, number>> = { hopUp: 1000, dropDown: 500 };
/** A prompt nobody has acted on for this long pulses bigger. */
export const NUDGE_AFTER_MS = 4000;
/** "Powodzenia!" stays this long before the tutorial is over. */
export const FINISH_MS = 1800;
/** A hit on the lesson's obstacle repeats it this many times at most, then the tutorial moves on anyway. */
export const MAX_RETRIES = 2;
/** The obstacle (or the last apple) counts as passed this far behind the roach. */
export const PASS_PX = 50;
/** The dodge prompt shows once the obstacle is this close ahead. */
export const SHOW_WITHIN_PX = 560;

/** The apple trail: this far past the obstacle, this far apart. */
export const APPLES_AFTER_PX = 380;
export const APPLE_STEP_PX = 80;
export const APPLES_PER_LANE = 3;
/** Regular beats start this far past the last apple. */
export const COURSE_GAP_PX = 700;

export const otherLane = (lane: Lane): Lane => (lane === 'top' ? 'bottom' : 'top');

/** The key that changes lanes from this one: up only counts from the bottom lane, down only from the top. */
export const hopKey = (from: Lane): '↑' | '↓' => (from === 'bottom' ? '↑' : '↓');

/** The apples after the lesson's obstacle: first the lane the roach dodged into, then back across to the other. */
export function applePlan(obstacleLane: Lane, obstacleX: number): { x: number; lane: Lane }[] {
  const safe = otherLane(obstacleLane);
  const start = obstacleX + APPLES_AFTER_PX;
  return Array.from({ length: APPLES_PER_LANE * 2 }, (_, i) => ({
    x: start + i * APPLE_STEP_PX,
    lane: i < APPLES_PER_LANE ? safe : obstacleLane,
  }));
}

/** Whether the dodge prompt shows: the obstacle is close, and the roach is still in its lane. */
export function dodgeDue(obstacleX: number, obstacleLane: Lane, playerX: number, floor: Lane): boolean {
  return floor === obstacleLane && obstacleX - playerX < SHOW_WITHIN_PX;
}

export const isNudging = (shownForMs: number): boolean => shownForMs >= NUDGE_AFTER_MS;

export type HitVerdict = 'retry' | 'giveUp' | 'ignore';

export class TutorialFlow {
  step: TutorialStep = 'hopUp';
  retries = 0;
  /** Where the lesson's obstacle and the last apple stand; null until laid (and again after a hit). */
  obstacleX: number | null = null;
  obstacleLane: Lane = 'bottom';
  lastAppleX = 0;
  private since: number;

  /** `now` is the run's own clock (ms of play, paused with the game). */
  constructor(now: number) {
    this.since = now;
  }

  /** Whether the step's prompt may show yet. */
  promptDue(now: number): boolean {
    return now - this.since >= (PROMPT_DELAY_MS[this.step] ?? 0);
  }

  /** The lesson's obstacle and apples are standing: `x` of the obstacle, its lane, and where the last apple is. */
  laid(obstacleX: number, lane: Lane, lastAppleX: number): void {
    this.obstacleX = obstacleX;
    this.obstacleLane = lane;
    this.lastAppleX = lastAppleX;
  }

  /** Hits do no harm until the send-off: the obstacle is punted and the step repeats, a couple of times. */
  get protects(): boolean {
    return this.step !== 'finish' && this.step !== 'done';
  }

  hit(): HitVerdict {
    if (this.step !== 'obstacle') return 'ignore';
    this.retries++;
    if (this.retries > MAX_RETRIES) {
      this.advance('apples', this.since);
      return 'giveUp';
    }
    this.obstacleX = null;
    return 'retry';
  }

  /** Looks at the roach, moves the step on if its action is done, and returns the new step (null if it stayed). */
  update(now: number, floor: Lane, playerX: number): TutorialStep | null {
    switch (this.step) {
      case 'hopUp':
        return floor === 'top' ? this.advance('dropDown', now) : null;
      case 'dropDown':
        return floor === 'bottom' ? this.advance('obstacle', now) : null;
      case 'obstacle':
        return this.obstacleX !== null && playerX > this.obstacleX + PASS_PX ? this.advance('apples', now) : null;
      case 'apples':
        return playerX > this.lastAppleX + PASS_PX ? this.advance('finish', now) : null;
      case 'finish':
        return now - this.since >= FINISH_MS ? this.advance('done', now) : null;
      case 'done':
        return null;
    }
  }

  /** The player skipped it. */
  finish(): void {
    this.step = 'done';
  }

  private advance(step: TutorialStep, now: number): TutorialStep {
    this.step = step;
    this.since = now;
    return step;
  }
}
