/**
 * What fills each slot of the run: the pattern's beat turned into enemies (with their lanes and phases), pickups and
 * walls. Pure and seeded: every client of a match, and every daily runner, gets the same list for the same slots, in
 * the same order of random draws, whatever their own roach is doing. SpawnManager only builds what this returns.
 */
import { BEER_CHANCE, COCKROACH_START_X, PILL_CHANCE } from '../config/constants';
import { mix32 } from '../config/levels';
import {
  ENEMIES, EnemyId, EnemyPicker, OWN_PATTERN, Random, CourseClock, castFor, followsSafely, nominalCourse,
} from '../objects/obstacles/cast';
import type { EnemyPlan, Lane } from '../objects/obstacles/behaviours';
import { AMMO_CHANCE, AMMO_FROM_LEVEL } from './gunRules';
import { Beat, RunPatterns, beatSpacing } from './RunPatterns';

export type SlotItem =
  | { kind: 'enemy'; plan: EnemyPlan }
  | { kind: 'pickup'; group: 'apples' | 'beers' | 'pills' | 'ammo'; art: string; lane: Lane }
  | { kind: 'wall' }
  /** The spray's cloud wall: built like a wall (only with the dash owned), its phase from its x. */
  | { kind: 'cloud'; plan: EnemyPlan };

/**
 * Before a boss the course ends in an empty runway short of its trigger, and nothing more is laid until it is beaten:
 * no enemy, pickup or wall of the next stretch shows up behind the fight. The runway is a time, BOSS_LEAD_S at the
 * nominal runner's speed at the trigger (cast.ts nominalCourse), in whole px: 287, 473, 545 and 612 for the four bosses
 * (tests/enemies.test.ts), so the last threat passes about as long before every fight. After it the course picks up
 * BOSS_RESUME_PX past the trigger: a fixed place, the same on every client and in every daily run (the fight holds the
 * roach near the trigger; a match puts every roach on the server's trigger x). The slots in between are not laid at
 * all, so no draw is made for them. server/runBounds.ts mirrors both.
 */
export const BOSS_LEAD_S = 1;
export const BOSS_RESUME_PX = 1000;

/** A boss's trigger distance (m) as world x. */
export const bossX = (metres: number): number => COCKROACH_START_X + metres * 50;

/** The runway before the boss at this trigger distance (m), world px. */
export const bossRunway = (metres: number): number => Math.round(nominalCourse.speedAt(bossX(metres)) * BOSS_LEAD_S);

/** How far the course may be laid with these bosses still to beat (their trigger distances, m): Infinity if none. */
export function courseEnd(unbeaten: readonly number[]): number {
  if (unbeaten.length === 0) return Infinity;
  const next = Math.min(...unbeaten);
  return bossX(next) - bossRunway(next);
}

/** Six beer labels; which one stands where comes from its x, so it never depends on the order things were drawn in. */
const BEER_ARTS = 6;
export const beerArt = (x: number): string => `beer-${(Math.abs(Math.round(x / 2)) % BEER_ARTS) + 1}`;

export class CourseLayout {
  private patterns: RunPatterns;
  private picker: EnemyPicker;
  private rng: Random;
  /** The last number the run's source gave: a filler's picks are hashed from it and the slot's x. */
  private drawn = 0;
  /** The course's end the last slot was laid against: it moves on when a boss is beaten. */
  private end: number | undefined;
  /** The enemies of the last slot laid: what the next slot's enemy must be able to follow (cast.ts followsSafely). */
  private before: EnemyId[] = [];

  /**
   * `ammo`: the run carries the pistol between the fights (solo), so from level 7 some apples are ammo boxes instead.
   * They come out of the same draw as the apple would have: a course with them is the same course, box for apple.
   */
  constructor(rng: Random, private clock: CourseClock = nominalCourse, private ammo = false) {
    this.rng = { next: () => (this.drawn = rng.next()) };
    this.patterns = new RunPatterns(this.rng);
    this.picker = new EnemyPicker(this.rng, clock);
  }

  /**
   * The next slot's contents, at x on this level. `end`: where the course stops short of the next boss (courseEnd),
   * as SpawnManager lays it; the last slots before a boss take no breather, and past him the course starts afresh.
   */
  next(x: number, level: number, end = Infinity): SlotItem[] {
    if (this.end !== undefined && end !== this.end) this.patterns.resume(level);
    this.end = end;
    return this.fill(x, this.patterns.next(level, Math.ceil((end - x) / beatSpacing(level))), level);
  }

  /** The next slot of the calm stretch after a checkpoint: only pickups and plain blockers. */
  calm(x: number, level: number): SlotItem[] {
    return this.fill(x, this.patterns.calm(), level);
  }

  private fill(x: number, beat: Beat, level: number): SlotItem[] {
    const items = this.items(x, beat, level);
    this.before = items.flatMap(item => (item.kind === 'enemy' ? [item.plan.id as EnemyId] : []));
    return items;
  }

  private items(x: number, beat: Beat, level: number): SlotItem[] {
    const other = (lane: Lane): Lane => (lane === 'top' ? 'bottom' : 'top');
    switch (beat.kind) {
      case 'obstacle':
        return [{ kind: 'enemy', plan: this.picker.pick(x, level, { lane: beat.lane ?? undefined, role: beat.role, enemy: beat.enemy, after: this.before }) }];
      case 'pickup':
        return [this.pickup(x, beat.lane, level)];
      case 'pair': {
        const enemy: SlotItem = { kind: 'enemy', plan: this.picker.pick(x, level, { lane: beat.obstacle, role: beat.role, pair: true, after: this.before }) };
        return [enemy, this.pickup(x, other(beat.obstacle), level)];
      }
      case 'blocker':
        return [this.blocker(x, beat.lane, level)];
      case 'wall':
        // Nothing seeded is drawn for a wall, so a client that leaves it out keeps every other slot the same
        return [{ kind: 'wall' }];
      case 'cloud':
        // Nor for a cloud wall: its rhythm comes from its x
        return [{ kind: 'cloud', plan: { id: 'sprayWall', x, lane: 'bottom', phase: Math.abs(Math.round(x * 7)) % 12000 } }];
      case 'filler':
        return [{ kind: 'enemy', plan: this.filler(x, level) }];
      case 'empty':
        return [];
    }
  }

  /**
   * The quiet-time guarantee's threat (RunPatterns quietSlots): a plain one of the level's cast, read in either lane
   * where the level fields two or more such (one that isn't held to a lane, or reaches into both), so it is a threat
   * whichever lane the player is in. Its picks are hashed from the last number the run's source gave and the slot's x,
   * the same on every client, and draw nothing from the source: the course round it is laid as it would have been.
   */
  private filler(x: number, level: number): EnemyPlan {
    const key = mix32(Math.floor(this.drawn * 0x100000000), x);
    let n = 0;
    const hashed: Random = { next: () => mix32(key, n++) / 0x100000000 };
    const plain = castFor(level).filter(e => !OWN_PATTERN.has(e.def.role) && followsSafely(e.def, this.before));
    const free = plain.filter(e => !e.def.laneBound || e.def.both);
    const pool = free.length >= 2 ? free : plain;
    let roll = hashed.next() * pool.reduce((sum, e) => sum + e.weight, 0);
    let def = pool[pool.length - 1].def;
    for (const e of pool) {
      roll -= e.weight;
      if (roll < 0) { def = e.def; break; }
    }
    return new EnemyPicker(hashed, this.clock).pick(x, level, { enemy: def.id });
  }

  /** One of the level's plain standing blockers; the onion where the level fields none (the gun act's first level). */
  private blocker(x: number, lane: Lane, level: number): SlotItem {
    const standing = castFor(level).filter(e => e.def.role === 'blocker');
    const pool = standing.length > 0 ? standing : [{ def: ENEMIES.onion, weight: 1 }];
    let roll = this.rng.next() * pool.reduce((sum, e) => sum + e.weight, 0);
    let def = pool[pool.length - 1].def;
    for (const e of pool) {
      roll -= e.weight;
      if (roll < 0) { def = e.def; break; }
    }
    return { kind: 'enemy', plan: this.picker.pick(x, level, { lane, enemy: def.id }) };
  }

  /** An apple, or now and then a beer or (rarely) a pill; from level 7, with the gun, sometimes an ammo box. */
  private pickup(x: number, lane: Lane, level: number): SlotItem {
    const roll = this.rng.next();
    if (roll < PILL_CHANCE) return { kind: 'pickup', group: 'pills', art: 'pill', lane };
    if (roll < PILL_CHANCE + BEER_CHANCE) return { kind: 'pickup', group: 'beers', art: beerArt(x), lane };
    if (this.ammo && level >= AMMO_FROM_LEVEL && roll < PILL_CHANCE + BEER_CHANCE + AMMO_CHANCE) {
      return { kind: 'pickup', group: 'ammo', art: 'ammo', lane };
    }
    return { kind: 'pickup', group: 'apples', art: 'apple', lane };
  }
}
