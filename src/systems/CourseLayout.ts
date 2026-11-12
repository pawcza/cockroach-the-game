/**
 * What fills each slot of the run: the pattern's beat turned into enemies (with their lanes and phases), pickups and
 * walls. Pure and seeded: every client of a match, and every daily runner, gets the same list for the same slots, in
 * the same order of random draws, whatever their own roach is doing. SpawnManager only builds what this returns.
 */
import { BEER_CHANCE, PILL_CHANCE } from '../config/constants';
import { EnemyPicker, Random, CourseClock, nominalCourse } from '../objects/obstacles/cast';
import type { EnemyPlan, Lane } from '../objects/obstacles/behaviours';
import { Beat, RunPatterns } from './RunPatterns';

export type SlotItem =
  | { kind: 'enemy'; plan: EnemyPlan }
  | { kind: 'pickup'; group: 'apples' | 'beers' | 'pills'; art: string; lane: Lane }
  | { kind: 'wall' }
  /** The spray's cloud wall: built like a wall (only with the dash owned), its phase from its x. */
  | { kind: 'cloud'; plan: EnemyPlan };

/** Six beer labels; which one stands where comes from its x, so it never depends on the order things were drawn in. */
const BEER_ARTS = 6;
export const beerArt = (x: number): string => `beer-${(Math.abs(Math.round(x / 2)) % BEER_ARTS) + 1}`;

export class CourseLayout {
  private patterns: RunPatterns;
  private picker: EnemyPicker;

  constructor(private rng: Random, clock: CourseClock = nominalCourse) {
    this.patterns = new RunPatterns(rng);
    this.picker = new EnemyPicker(rng, clock);
  }

  /** The next slot's contents, at x on this level. */
  next(x: number, level: number): SlotItem[] {
    return this.fill(x, this.patterns.next(level), level);
  }

  private fill(x: number, beat: Beat, level: number): SlotItem[] {
    const other = (lane: Lane): Lane => (lane === 'top' ? 'bottom' : 'top');
    switch (beat.kind) {
      case 'obstacle':
        return [{ kind: 'enemy', plan: this.picker.pick(x, level, { lane: beat.lane ?? undefined, role: beat.role, enemy: beat.enemy }) }];
      case 'pickup':
        return [this.pickup(x, beat.lane)];
      case 'pair': {
        const enemy: SlotItem = { kind: 'enemy', plan: this.picker.pick(x, level, { lane: beat.obstacle, role: beat.role, pair: true }) };
        return [enemy, this.pickup(x, other(beat.obstacle))];
      }
      case 'wall':
        // Nothing seeded is drawn for a wall, so a client that leaves it out keeps every other slot the same
        return [{ kind: 'wall' }];
      case 'cloud':
        // Nor for a cloud wall: its rhythm comes from its x
        return [{ kind: 'cloud', plan: { id: 'sprayWall', x, lane: 'bottom', phase: Math.abs(Math.round(x * 7)) % 12000 } }];
      case 'empty':
        return [];
    }
  }

  /** An apple, or now and then a beer or (rarely) a pill. */
  private pickup(x: number, lane: Lane): SlotItem {
    const roll = this.rng.next();
    if (roll < PILL_CHANCE) return { kind: 'pickup', group: 'pills', art: 'pill', lane };
    if (roll < PILL_CHANCE + BEER_CHANCE) return { kind: 'pickup', group: 'beers', art: beerArt(x), lane };
    return { kind: 'pickup', group: 'apples', art: 'apple', lane };
  }
}
