import Phaser from 'phaser';
import { VOL } from '../../audio/AudioManager';
import { frameOf } from '../../config/sprites';
import { DEPTH } from '../../config/constants';
import { getFx } from '../../effects/Fx';
import { EnemyPlan, laneY } from './behaviours';
import { ObstacleKit } from './ObstacleKit';

/** Its shadow on the lane it is about to dive into: a spot, big enough to read at the Baltic's speeds. */
const SHADOW_W = 64;
const SHADOW_H = 12;

/**
 * The gull (swoop in behaviours.ts, the pigeon's rhythm, longer and lower): it glides high over the shore, screeches and
 * rises with its beak open (the wind-up; its shadow grows on the lane it picked), dives into that lane and skims along
 * it at the runner, then climbs away. Shot in its dive, it drops; up high a bullet goes under it. Sounds (placeholders):
 * the pigeon's.
 */
export function spawnGull(kit: ObstacleKit, plan: EnemyPlan): void {
  const fx = getFx(kit.scene);
  const gull = kit.enemy(plan);
  gull.anims.stop();
  gull.setData('flies', true);
  const shadow = gull.getData('shadow') as Phaser.GameObjects.Image | undefined;
  shadow?.setDisplaySize(SHADOW_W, SHADOW_H);
  kit.playSoundOnVisible(gull, 'bird-sfx', 0.5);

  kit.drive(gull, plan, (now, before) => {
    if (now.pose === 'strike' && before?.pose === 'strike' && now.lane && now.y >= laneY(now.lane) - 1
        && before.y < laneY(now.lane) - 1 && kit.isOnScreen(gull)) {
      fx.play('dust-land', gull.x, laneY(now.lane), { depth: DEPTH.OBSTACLES + 0.5 });
      fx.play('skid', gull.x + 24, laneY(now.lane), { depth: DEPTH.OBSTACLES + 0.5, flipX: true });
    }
    if (now.pose === before?.pose) return;
    // It faces the runner; climbing back it flies the other way
    gull.setFlipX(now.pose === 'recover');
    gull.setFrame(frameOf('gull', now.pose === 'windup' || now.pose === 'strike' ? 1 : 0));
    if (now.pose === 'windup' && before && kit.isOnScreen(gull)) {
      fx.play('flare-big-white', gull.x - gull.displayWidth * 0.3, gull.y - gull.displayHeight * 0.5, { depth: DEPTH.PICKUPS + 1 });
      fx.play('shield', gull.x, gull.getCenter().y, { depth: DEPTH.PICKUPS + 1 });
      if (kit.isAhead(gull)) kit.audio.playSfx('bird-sfx', VOL.obstacle * 0.6);
    }
  });
}
