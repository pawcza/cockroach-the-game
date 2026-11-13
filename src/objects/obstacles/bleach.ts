import Phaser from 'phaser';
import { VOL } from '../../audio/AudioManager';
import { DEPTH, FLOOR_TOP_Y } from '../../config/constants';
import { ATLAS, SPRITE_SCALE, frameOf } from '../../config/sprites';
import { getFx } from '../../effects/Fx';
import { BLEACH_JUG_UP, EnemyPlan, laneY } from './behaviours';
import { TIMINGS, partOf, placeOf } from './cast';
import { ObstacleKit } from './ObstacleKit';

/** The falling drop's frame: the lit one (the three before it are the bead swelling at the cap, unlit). */
const FALLING = 3;
/** The splash is heard on one drop in this many: every one would be a rattle. */
const HEARD_EVERY = 4;
/** The splash's hitbox: the spot that hurts (frame px). */
const SPLASH_BODY_W = TIMINGS.bleach.spot / SPRITE_SCALE;
const SPLASH_BODY_H = 16;

/**
 * Dripping bleach (drip in behaviours.ts): a jug tipped in the background half way up the upper lane, dim, in neither
 * lane. A bead swells at its cap and falls behind the upper ledge, unlit: it never hurts. Under the ledge lit drops
 * fall one after another onto one spot of the lower lane, which stays wet and always hurts (the kill-zone look over
 * exactly it). Sounds (placeholders): the spray's hiss on some of the splashes.
 */
export function spawnBleach(kit: ObstacleKit, plan: EnemyPlan): void {
  const { scene } = kit;
  const fx = getFx(scene);
  const jug = kit.enemy(plan, { shadow: false });
  jug.anims.timeScale = 0.5;
  jug.setDepth(DEPTH.BEHIND_LEDGE);
  // The jug never hurts: both lanes run in front of it
  (jug.body as Phaser.Physics.Arcade.Body).checkCollision.none = true;
  jug.setData('flies', true);

  const bead = scene.add.image(plan.x, laneY('top'), ATLAS, frameOf('bleach-drop', 0))
    .setScale(SPRITE_SCALE).setDepth(DEPTH.BEHIND_LEDGE);
  const drop = scene.add.image(plan.x, laneY('bottom'), ATLAS, frameOf('bleach-drop', FALLING))
    .setScale(SPRITE_SCALE).setDepth(DEPTH.OBSTACLES).setVisible(false);
  // The jug and its bead are hand-tuned (cast.ts Placement); the drop, the splash and the wet spot stay put
  const jugAt = placeOf(plan.id);
  const beadAt = partOf(plan.id, 'bead');
  const hazard = kit.hazard(jug);
  const splash = kit.createSprite(plan.x, laneY('bottom'), 'bleach-splash', 'bleach', null);
  splash.anims.stop();
  splash.setData('floor', 'bottom');
  splash.setData('telegraphs', false);
  const body = splash.body as Phaser.Physics.Arcade.Body;
  body.setSize(SPLASH_BODY_W, SPLASH_BODY_H, false);
  body.setOffset((splash.width - SPLASH_BODY_W) / 2, splash.height * splash.originY - SPLASH_BODY_H);
  const spot = { lane: 'bottom' as const, x0: plan.x - TIMINGS.bleach.spot / 2, x1: plan.x + TIMINGS.bleach.spot / 2 };

  kit.drive(jug, plan, (now, before) => {
    // The jug carries no lane: what hurts is the wet spot. It hangs centred on the middle of the upper lane
    jug.setData('harmless', true);
    jug.setDepth(DEPTH.BEHIND_LEDGE);
    jug.y = FLOOR_TOP_Y - BLEACH_JUG_UP + jug.displayHeight * (jug.originY - 0.5) + jugAt.dy;
    const { bead: b, drop: d, splash: s } = now.parts!;
    bead.setPosition(b.x + beadAt.dx, b.y + beadAt.dy).setFrame(frameOf('bleach-drop', b.frame));
    drop.setVisible(d.visible).setPosition(d.x, d.y);
    hazard(null, [spot]);
    splash.setFrame(frameOf('bleach-splash', s.frame));
    if (now.pose !== 'strike' || before?.pose === 'strike' || !before || !kit.isOnScreen(jug)) return;
    fx.burst('bit-green', plan.x, laneY('bottom') - 6, 3, 6, { depth: DEPTH.OBSTACLES + 1, speed: [60, 130], angle: [200, 340], gravity: 400, life: 400 });
    if (now.cycle % HEARD_EVERY === 0 && kit.isAhead(jug)) kit.audio.playSfx('spray-sfx', VOL.obstacle * 0.4);
  });
  kit.track(jug, { objects: [bead, drop, splash] });
}
