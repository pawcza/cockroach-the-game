import { VOL } from '../../audio/AudioManager';
import { EnemyPlan } from './behaviours';
import { ObstacleKit } from './ObstacleKit';

/**
 * The glue trap: a tray of glue lying flat in its lane, a wet shine sliding across it (baked). It just lies there
 * (blocker), the other static one beside the onion. Its sound: the onion's, quieter (a placeholder).
 */
export function spawnGlue(kit: ObstacleKit, plan: EnemyPlan): void {
  const glue = kit.enemy(plan);
  kit.drive(glue, plan);
  kit.playSoundOnVisible(glue, 'onion-sfx', VOL.obstacle * 0.5);
}
