import Phaser from 'phaser';
import { VOL } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { SPRITE_SCALE, frameOf } from '../../config/sprites';
import { getFx } from '../../effects/Fx';
import { EnemyPlan } from './behaviours';
import { ENEMIES, TIMINGS } from './cast';
import { ObstacleKit, Shootable } from './ObstacleKit';

const RADIUS_RED = 0xff4433;
/** The can's own hitbox, frame px: it stands at the bottom of its tall canvas (the burst frame is what makes it tall). */
const CAN_H = 30;
/** A can set off by another's blast: its fuse, ms. */
const CHAIN_FUSE = 100;

/**
 * The aerosol can: it stands in its lane like any blocker (run into it and that's that). Shot, it rattles for a moment
 * with its blast's reach drawn round it, then goes off: every enemy that close, in either lane, goes with it (another
 * can sets off its own), and so does the roach if it is that close: don't shoot it point-blank. Sounds (placeholders):
 * the Eksterminator's canister pop for the shot, his tank burst for the blast.
 */
export function spawnAerosol(kit: ObstacleKit, plan: EnemyPlan): void {
  const { scene } = kit;
  const fx = getFx(scene);
  const can = kit.enemy(plan);
  can.anims.stop();
  const body = can.body as Phaser.Physics.Arcade.Body;
  const w = body.width / SPRITE_SCALE;
  body.setSize(w, CAN_H, false);
  body.setOffset((can.width - w) / 2, can.height * ENEMIES.aerosol.frame.pivotY - CAN_H);
  kit.drive(can, plan);
  const { radius } = TIMINGS.aerosol;
  const ring = scene.add.graphics().setDepth(DEPTH.POPUP - 1).setVisible(false);
  let lit = false;
  const shootable = can.getData('shootable') as Shootable;
  shootable.onDown = (by): boolean => {
    if (lit) return true;
    // Set off by another can's blast it goes almost at once: a chain runs down the line
    const fuse = by === 'blast' ? CHAIN_FUSE : TIMINGS.aerosol.fuse;
    lit = true;
    can.setFrame(frameOf('aerosol', 1));
    kit.audio.playSfx('ex-canister-pop', VOL.obstacle);
    const cy = can.y - 20;
    const started = scene.runTime;
    // The fuse: it rattles, its blast's reach drawn round it and closing in, then it goes
    const tick = (): void => {
      if (!can.active) return;
      const p = Math.min(1, (scene.runTime - started) / fuse);
      can.setFrame(frameOf('aerosol', Math.floor(scene.runTime / 50) % 2));
      ring.clear().setVisible(true).setPosition(can.x, cy);
      ring.lineStyle(4, 0x000000, 0.5).strokeCircle(0, 0, radius);
      ring.lineStyle(2, RADIUS_RED, 0.6 + 0.4 * Math.sin(p * Math.PI * 6)).strokeCircle(0, 0, radius);
      ring.fillStyle(RADIUS_RED, 0.08 + 0.1 * p).fillCircle(0, 0, radius * (1 - p * 0.15));
      if (p < 1) return;
      scene.events.off('update', tick);
      ring.setVisible(false);
      can.setFrame(frameOf('aerosol', 2));
      fx.play('flare-big-orange', can.x, cy, { depth: DEPTH.POPUP, scale: 2 });
      fx.play('ring', can.x, cy, { depth: DEPTH.POPUP, scale: 3 });
      fx.burst('smoke', can.x, cy, 8, radius * 0.5, { depth: DEPTH.POPUP - 0.5, speed: [30, 90], life: 700 });
      fx.burst('chunk-shell', can.x, cy, 8, 10, { depth: DEPTH.POPUP, speed: [160, 320], gravity: 600 });
      scene.cameras.main.shake(180, 0.008);
      kit.audio.playSfx('ex-tank-burst', VOL.obstacle * 1.2);
      scene.blast(can, radius, 'aerosol');
      scene.time.delayedCall(90, () => can.destroy());
    };
    scene.events.on('update', tick);
    can.once('destroy', () => scene.events.off('update', tick));
    return true;
  };
  kit.track(can, { objects: [ring] });
}
