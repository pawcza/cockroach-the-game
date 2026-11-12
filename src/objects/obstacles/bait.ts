import Phaser from 'phaser';
import { VOL } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { SPRITE_SCALE } from '../../config/sprites';
import { getFx } from '../../effects/Fx';
import { EnemyPlan, laneY } from './behaviours';
import { TIMINGS } from './cast';
import { ObstacleKit } from './ObstacleKit';

const GEL = 0x9be23a;
const GEL_DARK = 0x4c8a1c;
const GEL_SHINE = 0xe4ff9a;
/** The puddle as drawn: a flat slab on the ledge, this thick. */
const PUDDLE_H = 14;

/**
 * The poison bait (lure in behaviours.ts): a bowl of glowing gel in its lane, deadly to touch, with apples laid either
 * side of it. On a rhythm the gel oozes out (its lane flickers green over the stretch it will cover) and floods that
 * stretch for a while, then dries. Shot, the bowl bursts and the stretch is safe for good. Sounds (placeholders): the
 * toxic splash's, the Eksterminator's gas as it floods.
 */
export function spawnBait(kit: ObstacleKit, plan: EnemyPlan): void {
  const { scene } = kit;
  const fx = getFx(scene);
  const bowl = kit.enemy(plan);
  const band = kit.laneBand(bowl, GEL, DEPTH.CONTACT_SHADOW);
  const puddle = scene.add.rectangle(plan.x, laneY(plan.lane) + 2, 10, PUDDLE_H, GEL, 1).setOrigin(0.5, 1)
    .setDepth(DEPTH.CONTACT_SHADOW + 0.1).setVisible(false);
  // Its glossy top edge and its dark foot
  const rim = scene.add.rectangle(plan.x, laneY(plan.lane) + 2 - PUDDLE_H, 10, 2, GEL_SHINE, 1).setOrigin(0.5, 0)
    .setDepth(DEPTH.CONTACT_SHADOW + 0.2).setVisible(false);
  const foot = scene.add.rectangle(plan.x, laneY(plan.lane) + 2, 10, 2, GEL_DARK, 1).setOrigin(0.5, 1)
    .setDepth(DEPTH.CONTACT_SHADOW + 0.2).setVisible(false);
  // The flood, where it hurts: an invisible hitbox over the stretch, harmless unless it is flooded
  const { spread } = TIMINGS.bait;
  const hurt = kit.createSprite(plan.x, laneY(plan.lane), 'bait', 'bait', null);
  hurt.anims.stop();
  hurt.setVisible(false).setData('floor', plan.lane).setData('harmless', true).setData('telegraphs', true)
    .setData('unpuntable', true).setData('shows', bowl);
  const body = hurt.body as Phaser.Physics.Arcade.Body;
  const w = (spread * 2) / SPRITE_SCALE;
  body.setSize(w, 12, false);
  body.setOffset((hurt.width - w) / 2, hurt.height * hurt.originY - 12);
  let bubbles = 0;
  kit.drive(bowl, plan, (now, before) => {
    const p = now.parts?.puddle;
    const wet = now.mark?.progress ?? 0;
    hurt.setData('harmless', !p?.danger);
    band(now.warn && { ...now.warn }, now.pose === 'strike' ? 0.25 : 0.12 + 0.18 * (now.warn?.level ?? 0));
    const width = Math.round(spread * 2 * wet / 2) * 2;
    puddle.setVisible(wet > 0).setSize(width, PUDDLE_H).setAlpha(p?.danger ? 1 : 0.65);
    rim.setVisible(wet > 0).setSize(Math.max(0, width - 4), 2);
    foot.setVisible(wet > 0).setSize(width, 2);
    if (now.pose === 'strike' && kit.isOnScreen(bowl) && ++bubbles % 8 === 0) {
      fx.play('bit-green', plan.x - spread + Math.random() * spread * 2, laneY(plan.lane) - 4, { depth: DEPTH.OBSTACLES + 1, vy: -50, life: 400 });
    }
    if (!before || now.pose === before.pose || !kit.isOnScreen(bowl)) return;
    if (now.pose === 'windup') fx.play('flare-big-green', bowl.x, bowl.y - bowl.displayHeight * 0.4, { depth: DEPTH.PICKUPS + 1 });
    if (now.pose === 'strike') {
      fx.play('splash-toxic', bowl.x, laneY(plan.lane), { depth: DEPTH.OBSTACLES + 1 });
      if (kit.isAhead(bowl)) kit.audio.playSfx('ex-gas', VOL.obstacle * 0.4);
    }
  });
  const shootable = bowl.getData('shootable');
  shootable.onDown = (): boolean => {
    fx.play('splash-toxic', bowl.x, laneY(plan.lane), { depth: DEPTH.POPUP });
    fx.burst('bit-green', bowl.x, bowl.y - 12, 10, 16, { depth: DEPTH.POPUP, speed: [60, 180] });
    return false;
  };
  kit.track(bowl, { objects: [puddle, rim, foot, hurt] });
}
