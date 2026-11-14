import Phaser from 'phaser';
import { VOL } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { SPRITE_SCALE } from '../../config/sprites';
import { getFx } from '../../effects/Fx';
import { EnemyPlan, laneY } from './behaviours';
import { TIMINGS, placeOf } from './cast';
import { ObstacleKit } from './ObstacleKit';

const TONGUE = 0xd9607a;
const TONGUE_DARK = 0x9a3550;
const TIP = 0xf2a0b0;
/** The tongue's thickness and its sticky tip's size, world px; its hitbox height, frame px. */
const TONGUE_H = 6;
const TIP_W = 10;
const TIP_H = 10;
const LICK_H = 10;

/**
 * The frog (tongue in behaviours.ts): sits in its lane; its throat swells and its mouth opens (the telegraph, and a
 * warning along the stretch it will lick), then its tongue shoots along its lane at the runner and snaps back. Be on
 * the other lane, or dash through. Sounds: a croak for the swell, a wet thwip for the lick.
 */
export function spawnFrog(kit: ObstacleKit, plan: EnemyPlan): void {
  const { scene } = kit;
  const fx = getFx(scene);
  const frog = kit.enemy(plan);
  frog.anims.stop();
  kit.playSoundOnVisible(frog, 'frog-croak', 0.4);
  const y = laneY(plan.lane) - 14;
  const tongue = scene.add.rectangle(0, y, 10, TONGUE_H, TONGUE).setOrigin(0, .5).setDepth(DEPTH.OBSTACLES + 1).setVisible(false);
  const under = scene.add.rectangle(0, y + TONGUE_H / 2, 10, 2, TONGUE_DARK).setOrigin(0, .5).setDepth(DEPTH.OBSTACLES + 1).setVisible(false);
  const tip = scene.add.rectangle(0, y, TIP_W, TIP_H, TIP).setDepth(DEPTH.OBSTACLES + 1).setVisible(false);
  // What hurts: the tongue's length, an invisible hitbox along it
  const lick = kit.createSprite(plan.x, laneY(plan.lane), 'frog', 'frog', null);
  lick.anims.stop();
  lick.setVisible(false).setData('floor', plan.lane).setData('harmless', true).setData('telegraphs', true);
  const hazard = kit.hazard(frog);
  const mouth = plan.x - TIMINGS.frog.mouth;

  kit.drive(frog, plan, (now, before) => {
    const tp = now.parts!.tip;
    const len = mouth - tp.x;
    const out = tp.visible && len > 2;
    tongue.setVisible(out).setPosition(tp.x, y).setSize(Math.max(1, len), TONGUE_H);
    under.setVisible(out).setPosition(tp.x, y + TONGUE_H / 2).setSize(Math.max(1, len), 2);
    tip.setVisible(out).setPosition(tp.x, y);
    // Winding up, the stretch it will lick warns; out, the tongue's length kills
    hazard(now.pose === 'windup' ? now.warn ?? null : null, out ? [{ lane: plan.lane, x0: tp.x, x1: mouth }] : []);
    lick.setData('harmless', !out);
    // The hitbox can go before the frog (left behind off screen, or punted by a dash or a pill): nothing left to size
    if (out && lick.active) {
      const w = len / SPRITE_SCALE;
      const b = lick.body as Phaser.Physics.Arcade.Body;
      lick.x = tp.x + len / 2;
      b.setSize(w, LICK_H, false);
      b.setOffset((lick.width - w) / 2, lick.height * lick.originY - LICK_H - 4);
    }
    if (!before || now.pose === before.pose || !kit.isOnScreen(frog)) return;
    if (now.pose === 'windup') fx.play('flare-big-pink', frog.x - 10 * placeOf(plan.id).size, frog.y - frog.displayHeight * .4, { depth: DEPTH.PICKUPS + 1 });
    if (now.pose === 'strike' && kit.isAhead(frog)) kit.audio.playSfx('frog-tongue', VOL.obstacle * 0.4);
  });
  kit.track(frog, { objects: [tongue, under, tip, lick] });
}
