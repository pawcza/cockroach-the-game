import Phaser from 'phaser';
import { VOL } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { SPRITE_SCALE } from '../../config/sprites';
import { getFx } from '../../effects/Fx';
import { EnemyPlan, laneY } from './behaviours';
import { TIMINGS } from './cast';
import { ObstacleKit } from './ObstacleKit';

/** Her neck, as it stretches down to peck: square texels along the line from her chest to her head. */
const NECK = 0x9c3a1e;
const NECK_STEP = 6;
/** Her beak's hitbox, frame px: as wide as the spot she pecks (what the fairness test counts), and this tall. */
const BEAK = 12;
const BEAK_W = TIMINGS.hen.spot / SPRITE_SCALE;

/**
 * The hen (peck in behaviours.ts): stands on the upper ledge, blocking that lane; rears back clucking (the telegraph,
 * a shadow growing on the lower lane where she will strike), then her head darts down to peck that spot, well in front
 * of her, and back. Sounds: her own cluck and peck.
 */
export function spawnHen(kit: ObstacleKit, plan: EnemyPlan): void {
  const { scene } = kit;
  const fx = getFx(scene);
  const hen = kit.enemy(plan);
  hen.anims.stop();
  kit.playSoundOnVisible(hen, 'hen-cluck', 0.4);
  const head = kit.createSprite(plan.x, laneY('bottom'), 'hen-head', 'hen', null);
  head.anims.stop();
  head.setVisible(false).setData('floor', 'bottom').setData('harmless', true).setData('telegraphs', true).setData('flies', true);
  const hb = head.body as Phaser.Physics.Arcade.Body;
  hb.setSize(BEAK_W, BEAK, false);
  hb.setOffset((head.width - BEAK_W) / 2, head.height * head.originY - BEAK);
  const neck: Phaser.GameObjects.Rectangle[] = [];

  kit.drive(hen, plan, (now, before) => {
    const h = now.parts!.head;
    const n = now.parts!.neck;
    head.setVisible(h.visible).setPosition(h.x, h.y + 10);
    head.setData('harmless', !h.danger);
    // The neck: square texels from her chest to her head
    const steps = h.visible ? Math.max(1, Math.floor(Math.hypot(h.x - n.x, h.y - n.y) / NECK_STEP)) : 0;
    while (neck.length < steps) neck.push(scene.add.rectangle(0, 0, NECK_STEP, NECK_STEP, NECK).setDepth(DEPTH.OBSTACLES));
    neck.forEach((r, i) => {
      const u = (i + .5) / Math.max(1, steps);
      r.setVisible(i < steps).setPosition(Math.round(n.x + (h.x - n.x) * u), Math.round(n.y + (h.y - n.y) * u));
    });
    if (!before || now.pose === before.pose || !kit.isOnScreen(hen)) return;
    if (now.pose === 'windup') {
      fx.play('flare-big-orange', hen.x - hen.displayWidth * .3, hen.y - hen.displayHeight * .8, { depth: DEPTH.PICKUPS + 1 });
      if (kit.isAhead(hen)) kit.audio.playSfx('hen-cluck', VOL.obstacle * 0.4);
    }
    if (now.pose === 'strike') {
      fx.play('dust-land', plan.x - TIMINGS.hen.ahead, laneY('bottom'), { depth: DEPTH.OBSTACLES + 1 });
      if (kit.isAhead(hen)) kit.audio.playSfx('hen-peck', VOL.obstacle * 0.4);
    }
  });
  hen.once('destroy', () => neck.forEach(r => r.destroy()));
  kit.track(hen, { objects: [head] });
}
