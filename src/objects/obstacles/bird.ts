import Phaser from 'phaser';
import { VOL } from '../../audio/AudioManager';
import { frameOf } from '../../config/sprites';
import { DEPTH } from '../../config/constants';
import { getFx } from '../../effects/Fx';
import { EnemyPlan, laneY } from './behaviours';
import { ObstacleKit } from './ObstacleKit';

/** The flap's frame with the wings swept back (tools/art/creatures.py): held as the dive pose. */
const DIVE_FRAME = 4;
/** Its shadow: a spot on the lane under it (not a strip along it), big enough to see at speed. */
const SHADOW_W = 48;
const SHADOW_H = 10;

/**
 * The pigeon, swooping: it circles high, out of reach; screeches into a dive pose over the lane it is about to hit
 * (its small shadow lands there), dives, glides along that lane at the runner and climbs away (swoop in behaviours.ts).
 */
export function spawnBird(kit: ObstacleKit, plan: EnemyPlan): void {
  const fx = getFx(kit.scene);
  const bird = kit.enemy(plan);
  bird.setData('flies', true);
  const shadow = bird.getData('shadow') as Phaser.GameObjects.Image | undefined;
  shadow?.setDisplaySize(SHADOW_W, SHADOW_H);
  kit.playSoundOnVisible(bird, 'bird-sfx', 0.4);

  // The stretch it will skim: warned from its screech on, deadly while it hurts (the kill-zone look)
  const hazard = kit.hazard(bird);
  kit.drive(bird, plan, (now, before) => {
    hazard(now.zones.length === 0 ? now.warn ?? null : null, now.zones.length > 0 && now.warn ? [now.warn] : []);
    // It hits the lane at the bottom of its dive: dust thrown up where it lands, along the way it glides
    if (now.pose === 'strike' && before?.pose === 'strike' && now.lane && now.y >= laneY(now.lane) - 1
        && before.y < laneY(now.lane) - 1 && kit.isOnScreen(bird)) {
      fx.play('dust-land', bird.x, laneY(now.lane), { depth: DEPTH.OBSTACLES + 0.5 });
      fx.play('skid', bird.x + 20, laneY(now.lane), { depth: DEPTH.OBSTACLES + 0.5, flipX: true });
    }
    if (now.pose === before?.pose) return;
    // Climbing back it flies the other way, so it faces it
    bird.setFlipX(now.pose === 'recover');
    if (now.pose === 'windup' || now.pose === 'strike') {
      bird.anims.pause();
      bird.setFrame(frameOf('bird', DIVE_FRAME));
    } else if (bird.anims.isPaused) {
      bird.anims.resume();
    }
    if (now.pose === 'windup' && before && kit.isOnScreen(bird)) {
      // The dive pose's first frame: a white flare on its head, a ring of light round it, the screech
      fx.play('flare-big-white', bird.x - bird.displayWidth * 0.25, bird.y - bird.displayHeight * 0.55, { depth: DEPTH.PICKUPS + 1 });
      fx.play('shield', bird.x, bird.getCenter().y, { depth: DEPTH.PICKUPS + 1 });
      if (kit.isAhead(bird)) kit.audio.playSfx('bird-sfx', VOL.obstacle * 0.5);
    }
  });
}
