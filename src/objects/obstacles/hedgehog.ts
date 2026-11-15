import { VOL } from '../../audio/AudioManager';
import { frameOf } from '../../config/sprites';
import { EnemyPlan } from './behaviours';
import { ObstacleKit } from './ObstacleKit';

/**
 * The hedgehog (charger in behaviours.ts): stands in its lane, curls (the charge frame) and rushes along it at the
 * runner, then walks back. For level 9 later: in no cast yet. Sounds: its own, a snuffling chuff and scurry.
 */
export function spawnHedgehog(kit: ObstacleKit, plan: EnemyPlan): void {
  const look = kit.look(plan);
  const hog = kit.enemy(plan);
  hog.anims.stop();
  kit.playSoundOnVisible(hog, look.sound('hedgehog'), 0.4);
  kit.drive(hog, plan, (now, before) => {
    if (now.pose === before?.pose) return;
    hog.setFrame(frameOf(look.anim('hedgehog'), now.pose === 'windup' || now.pose === 'strike' ? 1 : 0));
    hog.setFlipX(now.pose === 'recover');
    if (now.pose === 'windup' && before && kit.isAhead(hog)) kit.audio.playSfx(look.sound('hedgehog'), VOL.obstacle * 0.4);
  });
}
