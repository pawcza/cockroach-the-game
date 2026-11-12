/**
 * The run's ammo, as two kinds of player spend it over a laid course (tests/gun.test.ts): the path is the simulated
 * player's who never shoots (enemySim), the boxes it picks up are the ones in its lane where it passes them.
 * 'all' fires at every enemy it meets while it has a round; 'careful' only at an enemy standing in the lane it is in
 * half a screen before it, the ones it would otherwise have to hop round.
 */
import { ENEMIES, EnemyId } from '../../src/objects/obstacles/cast';
import { Ammo } from '../../src/systems/gunRules';
import type { Laid } from './enemySim';

export interface AmmoRun {
  enemies: number;
  boxes: number;
  shots: number;
  /** Enemies it wanted to shoot with the magazine empty. */
  dry: number;
  /** The rounds in the magazine as it meets each enemy. */
  held: number[];
}

const LOOK_BACK = 300;

export function ammoRun(course: Laid[], path: { xs: number[]; lanes: number[] }, policy: 'all' | 'careful', perBox: number, ammo = new Ammo()): AmmoRun {
  const laneAt = (x: number): 'top' | 'bottom' => {
    let lo = 0;
    let hi = path.xs.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (path.xs[mid] <= x) lo = mid; else hi = mid;
    }
    return path.lanes[lo] === 0 ? 'top' : 'bottom';
  };
  const out: AmmoRun = { enemies: 0, boxes: 0, shots: 0, dry: 0, held: [] };
  for (const slot of course) {
    for (const item of slot.items) {
      if (item.kind === 'pickup' && item.group === 'ammo' && laneAt(slot.x) === item.lane) {
        out.boxes++;
        ammo.add(perBox);
      }
      if (item.kind !== 'enemy') continue;
      out.enemies++;
      out.held.push(ammo.count);
      const def = ENEMIES[item.plan.id as EnemyId];
      const wanted = policy === 'all' || (def.laneBound && laneAt(slot.x - LOOK_BACK) === item.plan.lane);
      if (!wanted) continue;
      if (ammo.take()) out.shots++;
      else out.dry++;
    }
  }
  return out;
}
