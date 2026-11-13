import Phaser from 'phaser';
import { VOL } from '../../audio/AudioManager';
import { DEPTH, FLOOR_TOP_Y } from '../../config/constants';
import { ATLAS, SPRITE_SCALE, frameOf } from '../../config/sprites';
import { getFx } from '../../effects/Fx';
import { EnemyPlan, laneY } from './behaviours';
import { TIMINGS } from './cast';
import { ObstacleKit } from './ObstacleKit';

/**
 * The jug lies at the back of the upper shelf, behind its front edge: this far down into the ledge (px), so the edge
 * hides its foot. It is baked small and dimmed towards the room (tools/art/hopact.py): scenery, not in the lane.
 */
const SINK_BEHIND = 6;
/** The upper ledge's underside: the falling drop is lit (red glow, the danger) only below it, in the lower lane. */
const SHELF_UNDERSIDE = FLOOR_TOP_Y + 30;
/** The drop's frames: three swelling at the cap, unlit (harmless-looking), then the falling one, lit. */
const FALLING = 3;
/** The transparent margin round an atlas frame, world px (8 frame px). */
const GLOW_MARGIN = 8 * SPRITE_SCALE;
/** The splash's hitbox: the spot that hurts (frame px). */
const SPLASH_BODY_W = TIMINGS.bleach.spot / SPRITE_SCALE;
const SPLASH_BODY_H = 16;

/**
 * Dripping bleach (drip in behaviours.ts): a jug lying tipped at the back of the upper shelf, dim and behind the
 * ledge's edge, its cap over the lower lane. A drop swells at the cap (the telegraph, unlit) while the spot it will hit
 * on the lower lane warns; it falls, lit only once it is under the shelf, and splashes on that spot, which stays wet a
 * moment: only that spot, only then, hurts (the kill-zone look over exactly it). Sounds (placeholders): the spray's hiss when it splashes.
 */
export function spawnBleach(kit: ObstacleKit, plan: EnemyPlan): void {
  const { scene } = kit;
  const fx = getFx(scene);
  const jug = kit.enemy(plan, { shadow: false });
  jug.anims.timeScale = 0.5;
  jug.setDepth(DEPTH.BEHIND_LEDGE);
  // The jug never hurts: the lane runs in front of it
  (jug.body as Phaser.Physics.Arcade.Body).checkCollision.none = true;
  jug.setData('flies', true);

  const drop = scene.add.image(plan.x, laneY('top'), ATLAS, frameOf('bleach-drop', 0))
    .setScale(SPRITE_SCALE).setDepth(DEPTH.OBSTACLES).setVisible(false);
  const hazard = kit.hazard(jug);
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
    jug.setDepth(DEPTH.BEHIND_LEDGE);
    jug.y += SINK_BEHIND;
    const d = now.parts!.drop;
    const s = now.parts!.splash;
    // It hangs off the shelf's front edge unlit; falling, it is lit (the danger) only once it is under the shelf
    drop.setVisible(d.visible).setPosition(d.x, d.y).setFrame(frameOf('bleach-drop', Math.min(d.frame, FALLING - 1)));
    // (Its frame's pivot is its baseline: the drop's own top is that far up, less the glow's margin)
    const top = d.y - drop.displayHeight * drop.originY + GLOW_MARGIN;
    if (d.frame === FALLING && top > SHELF_UNDERSIDE) drop.setFrame(frameOf('bleach-drop', FALLING));
    const spot = { lane: 'bottom' as const, x0: plan.x - TIMINGS.bleach.spot / 2, x1: plan.x + TIMINGS.bleach.spot / 2 };
    hazard(now.warn ?? null, s.danger ? [spot] : []);
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
