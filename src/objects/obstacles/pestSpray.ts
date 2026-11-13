import Phaser from 'phaser';
import { VOL } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { SPRITE_SCALE } from '../../config/sprites';
import { getFx } from '../../effects/Fx';
import { EnemyPlan, laneY } from './behaviours';
import { TIMINGS, bodyOf, ENEMIES, feetY } from './cast';
import { ObstacleKit } from './ObstacleKit';
import { CLOUD_H } from './sprayWall';

/** The wind-up: the can's baked shake played this much faster. */
const SHAKE = 3;
/** Mist spat from the nozzle while it shakes, ms apart. */
const DRIBBLE_MS = 70;
/** The nozzle, up the can from its baseline, as a share of its height. */
const NOZZLE = 0.62;
/** How long the cloud takes to thin out once it has hurt (looks only): spray-cloud-out's 3 frames at 12 fps. */
const THIN_MS = 250;

/**
 * The pest spray: a can in its lane that, on a rhythm, shakes and puffs a cloud that hangs in the lane just ahead of
 * it, closing that stretch for a moment (sweeper in behaviours.ts). The can itself always blocks. The cloud kills over
 * exactly the stretch it covers while it is out, and the shake before it warns over that stretch, in the run's
 * kill-zone look (kit.hazard).
 */
export function spawnPestSpray(kit: ObstacleKit, plan: EnemyPlan): void {
  const { scene } = kit;
  const fx = getFx(scene);
  const standY = feetY(plan.id, plan.lane);
  const spray = kit.enemy(plan);
  kit.playSoundOnVisible(spray, 'spray-sfx', VOL.obstacle);
  const half = bodyOf(ENEMIES.spray).half;
  const hazard = kit.hazard(spray);
  // What hurts: the cloud's stretch, an invisible hitbox on the lane, harmless unless the cloud is out. A dash or a pill
  // goes through it (the can is what gets punted), and it is the can that blinks when it kills
  const { reach } = TIMINGS.spray;
  const cloud = kit.createSprite(plan.x - half - reach / 2, laneY(plan.lane), 'spray', 'spray', null);
  cloud.anims.stop();
  cloud.setVisible(false).setData('floor', plan.lane).setData('harmless', true).setData('telegraphs', true)
    .setData('unpuntable', true).setData('shows', spray);
  const hurt = cloud.body as Phaser.Physics.Arcade.Body;
  const w = reach / SPRITE_SCALE;
  hurt.setSize(w, CLOUD_H, false);
  hurt.setOffset((cloud.width - w) / 2, cloud.height * cloud.originY - CLOUD_H);
  const nozzle = (): { x: number; y: number } => ({ x: spray.x - half, y: spray.y - spray.displayHeight * NOZZLE });

  // The cloud fills exactly the stretch that hurts, from its first frame: its pivot is the can's front edge, and the
  // baked cloud's core is TIMINGS.spray.reach wide (SPRAY_REACH in tools/art/vfx.py). It churns while it hurts, then
  // thins out
  const puff = (): void => {
    const at = { x: spray.x - half, y: standY };
    const depth = DEPTH.OBSTACLES + 1;
    fx.play('spray-cloud', at.x, at.y, {
      depth, life: TIMINGS.spray.sweep,
      onComplete: () => fx.play('spray-cloud-out', at.x, at.y, { depth, fps: (3 * 1000) / THIN_MS }),
    });
  };

  // The nozzle spits as the can shakes: the puff is coming
  let shaking = false;
  const dribble = kit.emitWhileOnScreen(spray, DRIBBLE_MS, () => {
    if (!shaking) return;
    const { x, y } = nozzle();
    fx.burst('bit-green', x, y, 2, 2, { depth: DEPTH.OBSTACLES + 1, speed: [50, 110], angle: [150, 210], gravity: 200, life: 300 });
  });

  kit.drive(spray, plan, (now, before) => {
    shaking = now.pose === 'windup';
    cloud.setData('harmless', now.pose !== 'strike');
    // Shaking, the stretch the cloud will fill warns; out, it kills
    hazard(now.pose === 'windup' ? now.warn ?? null : null, now.pose === 'strike' && now.warn ? [now.warn] : []);
    if (now.pose === before?.pose) return;
    spray.anims.timeScale = now.pose === 'windup' ? SHAKE : 1;
    if (!before || !kit.isOnScreen(spray)) return;
    // The wind-up's first frame: a green flare on the nozzle and a ring of light round the can
    if (now.pose === 'windup') {
      const { x, y } = nozzle();
      fx.play('flare-big-green', x, y, { depth: DEPTH.PICKUPS + 1 });
      fx.play('shield', spray.x, spray.getCenter().y, { depth: DEPTH.PICKUPS + 1 });
    }
    if (now.pose === 'strike') {
      puff();
      if (kit.isAhead(spray)) kit.audio.playSfx('spray-sfx', VOL.obstacle * 0.4);
    }
  });

  kit.track(spray, { timers: [dribble], objects: [cloud] });
}
