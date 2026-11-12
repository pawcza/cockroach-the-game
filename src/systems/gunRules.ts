/**
 * The run's pistol as rules (cockroach#100): "dash = invulnerable, gun = destroy". Earned from DJ Bigos (start of level
 * 7), carried in solo runs only; one bullet downs an enemy (two the tough ones), a bullet flies along the lane it was
 * fired from and meets the first enemy in its way. Ammo is a small magazine refilled by the boxes the course lays from
 * level 7: enough that a player who picks targets usually has a few, never enough to shoot everything. Boss fights have
 * their own unlimited gun. Pure, for the tests.
 */

/** Rounds the magazine holds, and how many a full run starts level 7 with. */
export const MAGAZINE = 6;
/** Rounds in one ammo box. */
export const AMMO_PER_BOX = 2;
/** The share of the pickup draw that is an ammo box from this level on (out of the apples' share). */
export const AMMO_CHANCE = 0.2;
export const AMMO_FROM_LEVEL = 7;
/** Between shots, ms: the boss fights' rate. */
export const SHOT_COOLDOWN_MS = 250;
/** A bullet's speed, world px/s: well past the roach's fastest dash. */
export const BULLET_SPEED = 1500;
/** Points for an enemy shot down (times the combo's multiplier, like the close calls). */
export const KILL_SCORE = 20;

export class Ammo {
  count: number;

  constructor(readonly max = MAGAZINE, count = max) {
    this.count = count;
  }

  /** One round for a shot; false when the magazine is empty (a dry click). */
  take(): boolean {
    if (this.count <= 0) return false;
    this.count--;
    return true;
  }

  /** A box picked up: the rounds that fit. Returns how many went in. */
  add(rounds: number): number {
    const added = Math.min(rounds, this.max - this.count);
    this.count += added;
    return added;
  }
}

export interface Target<T> {
  what: T;
  /** Where along the bullet's lane it is met now. */
  span: { x0: number; x1: number } | null;
}

/** The first target a bullet meets as it moves from `from` to `to` (world x) this frame, or null. */
export function firstHit<T>(targets: Target<T>[], from: number, to: number): T | null {
  let best: T | null = null;
  let bestX = Infinity;
  for (const t of targets) {
    if (!t.span || t.span.x1 < from || t.span.x0 > to) continue;
    const x = Math.max(t.span.x0, from);
    if (x < bestX) { bestX = x; best = t.what; }
  }
  return best;
}

/** Whether something at x is caught by a blast at blastX: along both lanes, within the radius. */
export const caughtInBlast = (blastX: number, x: number, radius: number): boolean => Math.abs(x - blastX) <= radius;

/**
 * Everything a shot can at index `first` takes down: its blast catches what is within the radius, and every can it
 * catches goes off in turn. Indices into `items`.
 */
export function blastChain(items: { x: number; can: boolean }[], first: number, radius: number): Set<number> {
  const down = new Set<number>([first]);
  const cans = [first];
  while (cans.length > 0) {
    const at = items[cans.pop()!].x;
    items.forEach((item, i) => {
      if (down.has(i) || !caughtInBlast(at, item.x, radius)) return;
      down.add(i);
      if (item.can) cans.push(i);
    });
  }
  return down;
}
