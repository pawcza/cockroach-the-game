import { VOL } from '../../audio/AudioManager';
import { EnemyPlan } from './behaviours';
import { ObstacleKit } from './ObstacleKit';

/**
 * The hedgehog (charger in behaviours.ts): stands in its lane, curls (the charge frame) and rushes along it at the
 * runner, then walks back. For level 9 later: in no cast yet. Sounds (placeholders): the bison's.
 */
export function spawnHedgehog(kit: ObstacleKit, plan: EnemyPlan): void {
  const hog = kit.enemy(plan);
  hog.anims.stop();
  kit.playSoundOnVisible(hog, 'bison-sfx', 0.4);
  kit.drive(hog, plan, (now, before) => {
    if (now.pose === before?.pose) return;
    hog.setFrame(`hedgehog_${now.pose === 'windup' || now.pose === 'strike' ? 1 : 0}`);
    hog.setFlipX(now.pose === 'recover');
    if (now.pose === 'windup' && before && kit.isAhead(hog)) kit.audio.playSfx('bison-sfx', VOL.obstacle * 0.4);
  });
}
