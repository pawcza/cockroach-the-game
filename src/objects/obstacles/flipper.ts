import { EnemyPlan } from './behaviours';
import { ObstacleKit } from './ObstacleKit';
import { swatter } from './swatter';

/**
 * The slipper, brought down by a hand from the back of the room onto its own lane, flat, with a slap (depthSwat in
 * behaviours.ts, timings in cast.ts, frames from tools/art/swatters.py).
 */
export function spawnFlipper(kit: ObstacleKit, plan: EnemyPlan): void {
  swatter(kit, plan, 'flipper-sfx');
}
