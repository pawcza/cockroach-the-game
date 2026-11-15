/**
 * The dash and the lane swap, generously. Pure and Phaser-free, so the rules can be tested.
 *
 * Swap first, dash right after is what a player does on seeing something on the other lane: the lane counts from the
 * press, so the roach is in the new lane at once, and the dash arrives some tens of ms later, after the obstacle
 * there may already have touched it. So a lethal touch soon after a swap is HELD for a moment, if the roach has a dash
 * to give. The hold is settled by its own clock, never by whether the overlap lasts: when its time is up the roach dies
 * of what it was touching, unless a dash was started inside the window, in which case the dash punts it (even if the
 * overlap has just ended). One hold at a time; it is never extended, a swap never earns a second one, and nothing
 * touching during a hold gets a window of its own. The other order (dash, then swap) never needed any of this: the
 * dash was already on.
 *
 * And a dash pressed a few frames before it is ready is kept for those frames, not dropped.
 */

/** A touch counts as "right after a swap" up to this long after the press. */
export const SWAP_DASH_WINDOW_MS = 250;
/** How long a held touch waits for the dash before it kills. */
export const SWAP_DASH_GRACE_MS = 220;
/** A dash pressed this long before it is ready still goes off when it is. */
export const DASH_BUFFER_MS = 120;

/** A hold: from the first held touch to the end of its wait (scene time). */
export interface Hold { since: number; until: number }

/**
 * The hold a lethal touch at `now` falls under, or null when it kills at once. `hold`: the one on now, if any (it is
 * returned as it is, never extended, until its time is up; then nothing is held: the touch kills). `swappedAt`: when
 * the lane was last changed (null: not in this run). `spentFor`: the swap that already had its hold, which earns no
 * second one.
 */
export function holdOn(
  now: number, hold: Hold | null, swappedAt: number | null, spentFor: number | null, dashAvailable: boolean,
): Hold | null {
  if (hold) return now < hold.until ? hold : null;
  if (!dashAvailable || swappedAt === null || swappedAt === spentFor) return null;
  if (now < swappedAt || now - swappedAt > SWAP_DASH_WINDOW_MS) return null;
  return { since: now, until: now + SWAP_DASH_GRACE_MS };
}

export type Verdict = 'wait' | 'punt' | 'kill';

/**
 * What a hold comes to at `now`: `punt` when a dash was started inside its window (`dashStartedAt`: scene time of the
 * last dash start, null: none), `kill` when its time is up with none, otherwise `wait`. Overlap plays no part.
 */
export function settleHold(now: number, hold: Hold, dashStartedAt: number | null): Verdict {
  if (dashStartedAt !== null && dashStartedAt >= hold.since && dashStartedAt <= hold.until) return 'punt';
  return now >= hold.until ? 'kill' : 'wait';
}

/** The hold after the game stood still for `ms` (the pause): its wait is what was left. */
export const shiftHold = (hold: Hold, ms: number): Hold => ({ since: hold.since + ms, until: hold.until + ms });

/** Whether a dash pressed at `pressedAt` (null: none) is still wanted at `now`. */
export const dashStillWanted = (now: number, pressedAt: number | null): boolean =>
  pressedAt !== null && now - pressedAt <= DASH_BUFFER_MS;
