/**
 * How often the bosses may mock the roach mid-run, without Phaser (TauntDirector is the Phaser side). Taunts are an
 * occasional treat, not a commentary:
 *
 * - approach: at 60% and 90% of the way to the next boss; a boss already met this session (a fight against it in an
 *   earlier run since the page loaded) only says the 90% one.
 * - reactive (a dropped combo, a close call, a long streak), solo only: an event is only a chance of one (REACT_CHANCE),
 *   at least REACTIVE_GAP_MS apart, at most REACTIVE_PER_RUN in a run, and never in the quiet around a boss fight, a
 *   level announcement, a score milestone or a reward beat (QUIET_MS either side where it can be known ahead).
 */

export const TAUNT_TIMING = {
  /** No taunts this long into a run. */
  quietStartMs: 5000,
  /** Reactive taunts: at least this long between the starts of two. */
  reactiveGapMs: 45000,
  /** At most this many reactive taunts in one run. */
  reactivePerRun: 3,
  /** The chance an eligible event becomes a taunt at all. */
  reactChance: 0.35,
  /** No reactive taunt this close (in time) to a boss fight, a level announcement, a milestone or a reward. */
  quietMs: 10000,
  /** An approach taunt waits this long after the last one ended. */
  approachGapMs: 4000,
  /** A reaction that could not be said at once is dropped after this. */
  reactionTtlMs: 3500,
} as const;

/** How far to the next boss each approach taunt is said; a boss already met says only the last. */
export const APPROACH_MARKS = [0.6, 0.9] as const;
export const approachMarks = (metBefore: boolean): readonly number[] => (metBefore ? APPROACH_MARKS.slice(-1) : APPROACH_MARKS);

/** The bosses fought since the page loaded: their opening taunt is not news any more. */
const metThisSession = new Set<string>();
export const markMet = (bossId: string): void => { metThisSession.add(bossId); };
export const metBefore = (bossId: string): boolean => metThisSession.has(bossId);

/** Decides whether a reaction may be said; `now` is the scene's clock in ms. */
export class ReactivePacer {
  private said = 0;
  private lastStart = -Infinity;
  private quietUntil = -Infinity;
  private rng: () => number;

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
  }

  get count(): number { return this.said; }

  /** Something that wants the stage happened (or will, at `now` + ms ahead): no reaction until QUIET_MS after it. */
  hush(now: number, aheadMs = 0): void {
    this.quietUntil = Math.max(this.quietUntil, now + aheadMs + TAUNT_TIMING.quietMs);
  }

  /** An event worth reacting to: whether it is taken at all (the run's cap and the chance). */
  roll(): boolean {
    return this.said < TAUNT_TIMING.reactivePerRun && this.rng() < TAUNT_TIMING.reactChance;
  }

  /** Whether a reaction taken earlier may be said now. `msToBoss` is how soon the next fight is due, if known. */
  mayFire(now: number, msToBoss = Infinity): boolean {
    return this.said < TAUNT_TIMING.reactivePerRun
      && now - this.lastStart >= TAUNT_TIMING.reactiveGapMs
      && now >= this.quietUntil
      && msToBoss > TAUNT_TIMING.quietMs;
  }

  /** A reaction was said. */
  fired(now: number): void {
    this.said++;
    this.lastStart = now;
  }
}
