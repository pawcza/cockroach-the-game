import Phaser from 'phaser';
import { VOL } from '../../audio/AudioManager';
import {
  COCKROACH_BASE_SPEED, COCKROACH_SPEED_MAX_BOOST, COCKROACH_SPEED_TAU, COCKROACH_START_X, DEPTH, SPEED_BOOST_PER_LEVEL,
} from '../../config/constants';
import { getLevelForDistance } from '../../config/levels';
import { SPRITE_SCALE, frameOf } from '../../config/sprites';
import { getFx } from '../../effects/Fx';
import { EnemyPlan, ROACH_BACK, VACUUM_MOUTH, laneY, newVacuum, stepVacuum } from './behaviours';
import { VACUUM, feetY } from './cast';
import { ObstacleKit } from './ObstacleKit';

/** Its hitbox: the mouth of the nozzle, at its front (frame px), VACUUM_MOUTH wide in the world. */
const NOZZLE_W = VACUUM_MOUTH / SPRITE_SCALE;
const NOZZLE_H = 18;
/** The nozzle's front stands this far in from the frame's right edge (its glow), frame px. */
const NOZZLE_INSET = 8;

/** The roach's cruising speed as Player.updateSpeed has it, without a dash, a pill or the pull. */
export const cruiseAt = (runTime: number, roachX: number): number => {
  const level = getLevelForDistance(Math.floor((roachX - COCKROACH_START_X) / 50)).level;
  return COCKROACH_BASE_SPEED + COCKROACH_SPEED_MAX_BOOST * (1 - Math.exp(-runTime / 1000 / COCKROACH_SPEED_TAU))
    + (level - 1) * SPEED_BOOST_PER_LEVEL;
};

/**
 * The vacuum cleaner (stepVacuum in behaviours.ts) comes from behind once the roach reaches its slot. First it is heard
 * (a roar) and felt: dust and crumbs on screen swept off to the left. Then its nozzle slides in from the left edge on
 * the roach's lane and closes in on its tail, dragging at it (dust streaming off the roach into the nozzle, the stretch
 * it is about to swallow marked as a warning on the lane); if the nozzle gets the roach, it is done. A dash breaks its
 * grip and it drops back out of sight; a hop only buys time (it shivers, then swings its nozzle over). It hunts this
 * client's roach only. Sounds: its own motor roar.
 */
export function spawnVacuum(kit: ObstacleKit, plan: EnemyPlan): void {
  const { scene } = kit;
  const fx = getFx(scene);
  const vac = kit.enemy(plan);
  vac.anims.stop();
  vac.setVisible(false).setData('behind', true).setData('flies', true).setData('harmless', true);
  const body = vac.body as Phaser.Physics.Arcade.Body;
  body.setSize(NOZZLE_W, NOZZLE_H, false);
  body.setOffset(vac.width - NOZZLE_INSET - NOZZLE_W, vac.height * vac.originY - NOZZLE_H);
  body.checkCollision.none = true;
  const toFront = vac.displayWidth / 2 - NOZZLE_INSET * SPRITE_SCALE;
  const shadow = (vac.getData('shadow') as Phaser.GameObjects.Image | undefined)?.setVisible(false);
  const hazard = kit.hazard(vac);
  const v = newVacuum(plan.lane);
  vac.setData('hunt', v);
  let last = scene.runTime;
  let dust = 0;

  const update = (): void => {
    if (!vac.active || !body.enable) return;
    const now = scene.runTime;
    const dt = Math.min(250, now - last);
    last = now;
    if (scene.isDead) { hazard(null); return; }
    const roach = scene.cockroach;
    const camera = scene.cameras.main;
    const was = v.phase;
    const { pull, zones } = stepVacuum(v, VACUUM, plan, dt, {
      x: roach.x,
      lane: roach.y > (kit.topY + kit.bottomY) / 2 ? 'bottom' : 'top',
      speed: (roach.body as Phaser.Physics.Arcade.Body).velocity.x,
      cruise: cruiseAt(now, roach.x),
      edge: roach.x - ROACH_BACK - camera.worldView.x,
    });
    if (v.phase === 'gone') { vac.destroy(); return; }
    // Nothing to touch until its nozzle is in, nor once it has let go (not even for a pill to punt)
    body.checkCollision.none = v.phase === 'waiting' || v.phase === 'cue' || v.phase === 'leave';
    if (v.phase === 'waiting') return;
    if (was === 'waiting') kit.audio.playSfx('vacuum-roar', VOL.obstacle * 0.7);
    if (v.phase === 'cue' || v.phase === 'enter') {
      // Heard and felt before it shows: dust and crumbs on screen swept off to the left
      if (++dust % 4 === 0) {
        fx.play(Math.random() < .5 ? 'dust' : 'bit-grey', camera.worldView.x + Math.random() * camera.worldView.width * .7,
          laneY(Math.random() < .5 ? 'top' : 'bottom') - Math.random() * 40, { depth: DEPTH.OBSTACLES + 1, vx: -320 - Math.random() * 200, life: 600 });
      }
    }
    // Swinging its nozzle over to the roach's lane; before that a shiver, the tell that it is about to
    const feet = (lane: typeof v.lane): number => feetY('vacuum', lane);
    const y = v.from !== null ? Phaser.Math.Linear(feet(v.from), feet(v.lane), Phaser.Math.Easing.Sine.InOut(v.move)) : feet(v.lane);
    const shiver = v.wants !== null ? Math.round(Math.sin(now / 14) * 2) : 0;
    vac.setVisible(v.phase !== 'cue').setPosition(Math.round(v.nozzle - toFront + shiver), Math.round(y));
    vac.setFrame(frameOf('vacuum', Math.floor(now / 50) % 2));
    vac.setData('floor', v.from === null ? v.lane : null).setData('harmless', zones.length === 0);
    if (shadow) shadow.setVisible(v.phase !== 'cue' && v.from === null).setY(laneY(v.lane));
    // The stretch it is about to swallow, nozzle to tail, while it sucks in the roach's lane
    hazard(pull > 0 && v.gap > 0 ? { lane: v.lane, x0: v.nozzle, x1: v.nozzle + v.gap } : null);
    if (pull > 0) {
      scene.pullRoach(pull);
      if (++dust % 3 === 0) {
        // Dust and crumbs streaming off the roach into the nozzle
        fx.play(dust % 2 ? 'bit-white' : 'dust', roach.x - ROACH_BACK + Math.random() * 30, roach.y + Math.random() * 24 - 16,
          { depth: DEPTH.PICKUPS + 1, vx: -380 - Math.random() * 120, life: 260 });
      }
    }
  };
  kit.track(vac, { updates: [update] });
}
