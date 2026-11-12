import Phaser from 'phaser';
import { VOL } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { ATLAS, SPRITE_SCALE, frameOf } from '../../config/sprites';
import { getFx } from '../../effects/Fx';
import { EnemyPlan, laneY } from './behaviours';
import { TIMINGS } from './cast';
import { ObstacleKit } from './ObstacleKit';

/** How far back on the upper ledge the jug lies (up the screen, px): scenery, not in the lane. */
const SET_BACK = 8;
/** The splash's hitbox: the spot that hurts (frame px). */
const SPLASH_BODY_W = TIMINGS.bleach.spot / SPRITE_SCALE;
const SPLASH_BODY_H = 16;

/**
 * Dripping bleach (drip in behaviours.ts): a jug lying tipped at the back of the upper ledge, out of the way, its cap
 * over the lower lane. A drop swells at the cap (the telegraph), falls and splashes on one spot of the lower lane, which
 * stays wet a moment: only that spot, only then, hurts. Sounds (placeholders): the spray's hiss when it splashes.
 */
export function spawnBleach(kit: ObstacleKit, plan: EnemyPlan): void {
  const { scene } = kit;
  const fx = getFx(scene);
  const jug = kit.enemy(plan, { shadow: false });
  jug.anims.timeScale = 0.5;
  jug.setDepth(DEPTH.OBSTACLES - 1);
  // The jug never hurts: the lane runs in front of it
  (jug.body as Phaser.Physics.Arcade.Body).checkCollision.none = true;
  jug.setData('flies', true);

  const drop = scene.add.image(plan.x, laneY('top'), ATLAS, frameOf('bleach-drop', 0))
    .setScale(SPRITE_SCALE).setOrigin(0.5, 0).setDepth(DEPTH.OBSTACLES).setVisible(false);
  const splash = kit.createSprite(plan.x, laneY('bottom'), 'bleach-splash', 'bleach', null);
  splash.anims.stop();
  splash.setVisible(false);
  splash.setData('floor', 'bottom');
  splash.setData('harmless', true);
  splash.setData('telegraphs', true);
  const body = splash.body as Phaser.Physics.Arcade.Body;
  body.setSize(SPLASH_BODY_W, SPLASH_BODY_H, false);
  body.setOffset((splash.width - SPLASH_BODY_W) / 2, splash.height * splash.originY - SPLASH_BODY_H);

  kit.drive(jug, plan, (now, before) => {
    // The jug carries no lane: what hurts is the splash. It lies back from the edge, out of the way
    jug.setData('harmless', true);
    jug.setDepth(DEPTH.OBSTACLES - 1);
    jug.y -= SET_BACK;
    const d = now.parts!.drop;
    const s = now.parts!.splash;
    drop.setVisible(d.visible).setPosition(d.x, d.y).setFrame(frameOf('bleach-drop', d.frame));
    splash.setVisible(s.visible).setFrame(frameOf('bleach-splash', s.frame));
    splash.setData('harmless', !s.danger);
    if (now.pose === before?.pose || !before || !kit.isOnScreen(jug)) return;
    if (now.pose === 'windup' && before.pose === 'idle') fx.play('flare-big-green', d.x, d.y + 6, { depth: DEPTH.PICKUPS + 1 });
    if (now.pose === 'strike') {
      fx.play('splash-toxic', plan.x, laneY('bottom'), { depth: DEPTH.OBSTACLES + 1 });
      fx.burst('bit-green', plan.x, laneY('bottom') - 6, 5, 6, { depth: DEPTH.OBSTACLES + 1, speed: [60, 130], angle: [200, 340], gravity: 400, life: 400 });
      if (kit.isAhead(jug)) kit.audio.playSfx('spray-sfx', VOL.obstacle * 0.4);
    }
  });
  kit.track(jug, { objects: [drop, splash] });
}
