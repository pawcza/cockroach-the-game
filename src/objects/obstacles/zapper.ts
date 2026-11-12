import Phaser from 'phaser';
import { VOL } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { SPRITE_SCALE, frameOf } from '../../config/sprites';
import { getFx } from '../../effects/Fx';
import { EnemyPlan, laneY } from './behaviours';
import { TIMINGS } from './cast';
import { ObstacleKit } from './ObstacleKit';

const CORD = 0x1a1a22;
const BOLT = 0xc9a8ff;
const BOLT_CORE = 0xffffff;
/** The bolt along the lane: this tall, its core this tall. */
const BOLT_H = 10;
const CORE_H = 4;

/**
 * The bug zapper (zap in behaviours.ts): a tube hung from a cord over the upper lane. Idle it glows violet; then it
 * crackles and flashes (the charge: the stretch of lane it will strike flickers) and a bolt runs from it down to the
 * lane and along it at the runner for a moment. Shot, it bursts in sparks. Sounds (placeholders): Bigos's sizzle for
 * the charge and his beam for the bolt.
 */
export function spawnZapper(kit: ObstacleKit, plan: EnemyPlan): void {
  const { scene } = kit;
  const fx = getFx(scene);
  const zapper = kit.enemy(plan, { shadow: false });
  zapper.anims.stop();
  zapper.setData('flies', true);
  (zapper.body as Phaser.Physics.Arcade.Body).checkCollision.none = true;
  const cord = scene.add.rectangle(plan.x, 0, SPRITE_SCALE, 10, CORD).setOrigin(0.5, 0).setDepth(DEPTH.OBSTACLES - 0.1);
  const band = kit.laneBand(zapper, BOLT, DEPTH.CONTACT_SHADOW);
  // The bolt: a violet streak along the lane with a white core, and its drop from the tube
  const glow = scene.add.rectangle(0, 0, 10, BOLT_H, BOLT, 1).setOrigin(0, 0.5).setDepth(DEPTH.OBSTACLES + 1)
    .setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
  const core = scene.add.rectangle(0, 0, 10, CORE_H, BOLT_CORE, 1).setOrigin(0, 0.5).setDepth(DEPTH.OBSTACLES + 1).setVisible(false);
  const drop = scene.add.rectangle(0, 0, CORE_H, 10, BOLT_CORE, 1).setOrigin(0.5, 0).setDepth(DEPTH.OBSTACLES + 1).setVisible(false);
  // What hurts: the bolt's stretch, an invisible hitbox along it, harmless unless it strikes
  const { reach } = TIMINGS.zapper;
  const hurt = kit.createSprite(plan.x - reach / 2 + 15, laneY(plan.lane), 'bug-zapper', 'zapper', null);
  hurt.anims.stop();
  hurt.setVisible(false).setData('floor', plan.lane).setData('harmless', true).setData('telegraphs', true)
    .setData('flies', true).setData('unpuntable', true).setData('shows', zapper);
  const body = hurt.body as Phaser.Physics.Arcade.Body;
  const w = (reach + 30) / SPRITE_SCALE;
  body.setSize(w, 26, false);
  body.setOffset((hurt.width - w) / 2, hurt.height * hurt.originY - 26);

  kit.drive(zapper, plan, (now, before) => {
    zapper.setData('harmless', true);
    const top = zapper.y - zapper.displayHeight * zapper.originY + 8 * SPRITE_SCALE;
    cord.setPosition(Math.round(zapper.x), 0).setSize(SPRITE_SCALE, Math.max(0, top + 4));
    const striking = now.pose === 'strike';
    hurt.setData('harmless', !striking);
    band(now.warn && { ...now.warn }, striking ? 0.3 : 0.12 + 0.12 * (now.warn?.level ?? 0));
    const y = laneY(plan.lane) - 24;
    const x0 = now.warn?.x0 ?? plan.x;
    const x1 = now.warn?.x1 ?? plan.x;
    const flicker = striking && Math.floor(scene.runTime / 40) % 2 === 0;
    glow.setVisible(striking).setPosition(x0, y + (flicker ? 1 : -1)).setSize(x1 - x0, BOLT_H).setAlpha(flicker ? 0.9 : 0.6);
    core.setVisible(striking).setPosition(x0, y).setSize(x1 - x0, CORE_H);
    const bottom = zapper.y - 6;
    drop.setVisible(striking).setPosition(zapper.x, bottom).setSize(CORE_H, Math.max(0, y - bottom));
    if (!before || now.pose === before.pose || !kit.isOnScreen(zapper)) return;
    if (now.pose === 'windup') {
      fx.play('crackle', zapper.x, zapper.y - zapper.displayHeight * 0.4, { depth: DEPTH.PICKUPS + 1 });
      if (kit.isAhead(zapper)) kit.audio.playSfx('bigos-sizzle', VOL.obstacle * 0.5);
    }
    if (striking) {
      fx.play('flare-big-violet', zapper.x, zapper.y - zapper.displayHeight * 0.4, { depth: DEPTH.PICKUPS + 2 });
      for (let i = 0; i < 3; i++) fx.play('bolt', x0 + Math.random() * (x1 - x0), y, { depth: DEPTH.PICKUPS + 2 });
      if (kit.isAhead(zapper)) kit.audio.playSfx('bigos-beam', VOL.obstacle * 0.5);
    }
  });
  const shootable = zapper.getData('shootable');
  shootable.onDown = (): boolean => {
    fx.burst('spark-blue', zapper.x, zapper.y - zapper.displayHeight * 0.4, 8, 18, { depth: DEPTH.POPUP, speed: [60, 160] });
    fx.play('flare-big-violet', zapper.x, zapper.y - zapper.displayHeight * 0.4, { depth: DEPTH.POPUP });
    return false;
  };
  zapper.setFrame(frameOf('bug-zapper', 0));
  kit.track(zapper, { objects: [cord, glow, core, drop, hurt] });
}
