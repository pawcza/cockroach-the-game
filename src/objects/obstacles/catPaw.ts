import { VOL } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { getFx } from '../../effects/Fx';
import { EnemyPlan, laneY } from './behaviours';
import { ObstacleKit } from './ObstacleKit';

/**
 * The cat, pouncing: it sits in its lane, crouches (frozen mid-step, sunk and leaning back), pounces over to the other
 * lane, holds there a moment and springs home (pounce in behaviours.ts). Harmless only in the air.
 */
export function spawnCatPaw(kit: ObstacleKit, plan: EnemyPlan): void {
  const fx = getFx(kit.scene);
  const cat = kit.enemy(plan);
  kit.playSoundOnVisible(cat, 'cat-sfx', 0.5);

  kit.drive(cat, plan, (now, before) => {
    if (now.pose === before?.pose) return;
    if (now.pose === 'windup' || now.pose === 'air') cat.anims.pause();
    else if (cat.anims.isPaused) cat.anims.resume();
    if (before && kit.isOnScreen(cat)) {
      const depth = DEPTH.OBSTACLES + 0.5;
      // The crouch's first frame: an orange flare at its eye, a ring of light round it, dust kicked back from its feet
      if (now.pose === 'windup' && now.lane) {
        fx.play('flare-big-orange', cat.x - cat.displayWidth * 0.28, cat.y - cat.displayHeight * 0.5, { depth: DEPTH.PICKUPS + 1 });
        fx.play('shield', cat.x, cat.getCenter().y, { depth: DEPTH.PICKUPS + 1 });
        fx.play('skid', cat.x + 10, laneY(now.lane), { depth, flipX: true });
      }
      // Landing over there, the strike: dust and a ring where it lands. Landing home again, just the dust
      if (before.pose === 'air' && now.lane) {
        fx.play('dust-land', cat.x, laneY(now.lane), { depth });
        if (now.pose === 'strike') fx.play('ring', cat.x, laneY(now.lane), { depth });
      }
    }
    if (now.pose === 'air' && before?.pose === 'windup' && kit.isAhead(cat)) kit.audio.playSfx('cat-sfx', VOL.obstacle * 0.5);
  });
}
