import { EnemyPlan } from './behaviours';
import { ObstacleKit } from './ObstacleKit';
import { swatter } from './swatter';

/**
 * The rolled newspaper, swung in from the back of the room flat onto a lane with a slap. It takes the lanes in turns,
 * so the lane it waits over is the one it hits next (depthSwat in behaviours.ts).
 */
export function spawnNewspaper(kit: ObstacleKit, plan: EnemyPlan): void {
  swatter(kit, plan, 'newspaper-sfx');
}
