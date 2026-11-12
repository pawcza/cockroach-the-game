import Phaser from 'phaser';
import { VOL } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { SPRITE_SCALE } from '../../config/sprites';
import { getFx, VFX_ATLAS, vfxFrame } from '../../effects/Fx';
import { CHASER_CUE_MS, EnemyPlan, ROACH_BACK, laneY } from './behaviours';
import { ENEMIES, bodyOf } from './cast';
import { ObstacleKit } from './ObstacleKit';

/** Its legs at a sprint: the walk cycle this much faster. */
const SPRINT = 2.2;
/** The cue's blink, ms per half: calm while it runs, quick while it crouches to change lanes. */
const BLINK_MS = 220;
const BLINK_FAST_MS = 70;
/** The cue's place in from the left edge. */
const CUE_X = 24;
/** The cue's middle, above its lane's line. */
const CUE_RISE = 30;
/** Gone for good this far past the right edge, once it has run by. */
const EXIT_MARGIN = 400;

/**
 * The cat again, running the roach down from behind (chaser in behaviours.ts). Behind the left edge, a red pixel "!"
 * (the effects atlas) at its lane's height says it is coming and where; it crouches before it jumps lanes, and the
 * "!" blinks fast and white-hot and moves.
 */
export function spawnCatChase(kit: ObstacleKit, plan: EnemyPlan): void {
  const { scene } = kit;
  const cat = kit.enemy(plan);
  cat.setFlipX(true);
  cat.setData('behind', true);
  // It runs in over the ledge the roach has left crumbling behind it: it leaps the gaps
  cat.setData('flies', true);
  cat.anims.timeScale = SPRINT;
  const half = bodyOf(ENEMIES.catChase).half;
  const speed = plan.chase!.speed;

  const fx = getFx(scene);
  const cue = scene.add.image(CUE_X, 0, VFX_ATLAS, vfxFrame('alert')).setScale(SPRITE_SCALE)
    .setScrollFactor(0).setDepth(DEPTH.WARNING).setVisible(false);
  let cued = false;

  kit.drive(cat, plan, (now, before) => {
    cat.setVisible(now.pose !== 'parked');
    (cat.body as Phaser.Physics.Arcade.Body).checkCollision.none = now.pose === 'parked';
    if (now.pose !== before?.pose) {
      if (now.pose === 'windup' || now.pose === 'air') cat.anims.pause();
      else if (cat.anims.isPaused) cat.anims.resume();
      // In view: dust from its crouch, and where it lands in the other lane
      if (before && kit.isOnScreen(cat)) {
        const depth = DEPTH.OBSTACLES + 0.5;
        if (now.pose === 'windup' && now.lane) fx.play('skid', cat.x - 10, laneY(now.lane), { depth });
        if (before.pose === 'air' && now.lane) fx.play('dust-land', cat.x, laneY(now.lane), { depth });
      }
    }

    // The cue: only while it is still off the left edge and gaining, from CHASER_CUE_MS before it reaches the roach
    const camera = scene.cameras.main;
    const roach = scene.cockroach;
    const closing = speed - (roach.body as Phaser.Physics.Arcade.Body).velocity.x;
    const gap = roach.x - ROACH_BACK - (now.x + half);
    const due = now.pose !== 'parked' && !scene.isDead && now.x + half < camera.scrollX && closing > 0
      && gap <= (closing * CHASER_CUE_MS) / 1000;
    cue.setVisible(due && Math.floor(scene.time.now / (now.pose === 'windup' ? BLINK_FAST_MS : BLINK_MS)) % 2 === 0);
    if (due) {
      const lane = now.lane ?? (before?.lane === 'top' ? 'bottom' : 'top');
      cue.setFrame(vfxFrame('alert', now.pose === 'windup' ? 1 : 0));
      cue.y = Math.round((laneY(lane) - CUE_RISE) / SPRITE_SCALE) * SPRITE_SCALE;
      if (!cued) {
        cued = true;
        kit.audio.playSfx('cat-sfx', VOL.obstacle * 0.6);
      }
    }

    if (now.x - half > camera.scrollX + camera.width + EXIT_MARGIN) cat.destroy();
  });

  kit.track(cat, { objects: [cue] });
}
