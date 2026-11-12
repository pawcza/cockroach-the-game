import Phaser from 'phaser';
import { VOL } from '../../audio/AudioManager';
import { DEPTH, FLOOR_TOP_Y } from '../../config/constants';
import { SPRITE_SCALE } from '../../config/sprites';
import { getFx } from '../../effects/Fx';
import { EnemyPlan, laneY } from './behaviours';
import { TIMINGS } from './cast';
import { ObstacleKit } from './ObstacleKit';

/** The light's colour, and how bright its band is while it flickers (the warning) and when it is on. */
const WARM = 0xffd27a;
const FLICKER_ALPHA = 0.14;
const ON_ALPHA = 0.5;
/** Where the bulb hangs: over the upper lane from a cord out of the top of the screen; over the lower one from under
 * the upper ledge, its socket hidden behind the ledge and the whole glass below it. Px from the frame's top (the cord's
 * end) to the upper lane; over the lower lane, px above the upper ledge's top. */
const HANG_TOP = 236;
const HANG_BOTTOM = 4;
const CORD = 0x1a1a22;
/** The light's hitbox: as tall as the roach, along the stretch it lights. */
const BODY_H = 26;
/** The cone's three steps, widest at the floor (px), and how bright each is against the band. */
const CONE = [36, 80, 130];
const CONE_ALPHA = [.9, .6, .4];
/** The lit lane: its height, and the two end steps at each end of the reach (STEP px each, dimmer outwards). */
const BAND_H = 60;
const STEP = 36;
const BAND_ALPHA = [.3, .6, 1, .6, .3];

/**
 * The light (light in behaviours.ts): a bare bulb over a lane. Dark; then it stutters on and off, and its lane flickers
 * faintly (the warning: this one closes a lane end to end); then it snaps on and floods the lane with light for a
 * moment. Caught in it, the roach is seen and done for: the hit-stop holds it there in the light, the bulb blinking.
 * Be on the dark lane. Sounds (placeholders): the floor switch's click as it flickers, the disco's for the snap on.
 */
export function spawnLamp(kit: ObstacleKit, plan: EnemyPlan): void {
  const { scene } = kit;
  const fx = getFx(scene);
  const lane = plan.lane;
  const bulb = kit.enemy(plan, { shadow: false });
  bulb.anims.stop();
  bulb.setOrigin(0.5, 0);
  (bulb.body as Phaser.Physics.Arcade.Body).checkCollision.none = true;
  bulb.setData('flies', true);
  const top = lane === 'top' ? laneY(lane) - HANG_TOP : FLOOR_TOP_Y - HANG_BOTTOM;
  // Over the upper lane its cord runs up out of the screen
  const cord = lane === 'top' ? scene.add.rectangle(plan.x, 0, SPRITE_SCALE, top + 2, CORD).setOrigin(0.5, 0).setDepth(DEPTH.OBSTACLES) : null;

  // What hurts: the lit stretch of the lane, an invisible hitbox along it, harmless unless the light is on
  const { ahead, behind } = TIMINGS.lamp;
  const hurt = kit.createSprite(plan.x + (behind - ahead) / 2, laneY(lane), 'lamp', 'lamp', null);
  hurt.anims.stop();
  hurt.setVisible(false);
  hurt.setData('floor', lane);
  hurt.setData('harmless', true);
  hurt.setData('telegraphs', true);
  hurt.setData('flies', true);
  hurt.setData('unpuntable', true);
  hurt.setData('shows', bulb);
  const body = hurt.body as Phaser.Physics.Arcade.Body;
  const w = (ahead + behind) / SPRITE_SCALE;
  body.setSize(w, BODY_H, false);
  body.setOffset((hurt.width - w) / 2, hurt.height * hurt.originY - BODY_H);

  // Its light: a stepped cone from the bulb down to the lane, and the lit lane itself, brightest under the bulb and
  // falling off towards both ends of its reach in hard steps (the reach is exactly what hurts: the steps are inside it)
  const glowX = plan.x;
  const bulbBottom = top + (bulb.displayHeight - 8 * SPRITE_SCALE) * 0.9;
  const floorY = laneY(lane) + 2;
  const add = (): Phaser.GameObjects.Rectangle =>
    scene.add.rectangle(0, 0, 10, 10, WARM, 1).setOrigin(0, 0).setDepth(DEPTH.PICKUPS + 1).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
  const cone = CONE.map(add);
  const lane0 = plan.x - ahead;
  const lane1 = plan.x + behind;
  const bands = BAND_ALPHA.map(add);
  const edges = [lane0, lane0 + STEP, lane0 + 2 * STEP, lane1 - 2 * STEP, lane1 - STEP, lane1];
  // Over the lower lane it hangs from a fitting under the upper ledge, so it plainly hangs from something
  const fitting = lane === 'bottom'
    ? scene.add.rectangle(plan.x, FLOOR_TOP_Y + 30, 8 * SPRITE_SCALE, 2 * SPRITE_SCALE, CORD).setDepth(DEPTH.OBSTACLES) : null;
  let halo: ReturnType<typeof fx.play> = null;
  const light = (level: number): void => {
    const camera = scene.cameras.main;
    const left = camera.scrollX - 8;
    const right = camera.scrollX + camera.width + 8;
    // The cone: three widening steps from the bulb down to the floor
    const h = (floorY - bulbBottom) / CONE.length;
    cone.forEach((r, i) => {
      const w = CONE[i];
      r.setPosition(glowX - w / 2, bulbBottom + h * i).setSize(w, h + 1).setAlpha(level * CONE_ALPHA[i]).setVisible(level > 0);
    });
    // The lane: the bright middle, then two dimmer steps at each end of the reach
    BAND_ALPHA.forEach((alpha, i) => {
      const x0 = Math.max(left, edges[i]);
      const x1 = Math.min(right, edges[i + 1]);
      bands[i].setPosition(x0, floorY - BAND_H).setSize(Math.max(0, x1 - x0), BAND_H).setAlpha(level * alpha).setVisible(level > 0 && x1 > x0);
    });
  };
  kit.drive(bulb, plan, (now, before) => {
    bulb.setPosition(plan.x, top);
    bulb.setOrigin(0.5, 0);
    bulb.setDepth(lane === 'bottom' ? DEPTH.BEHIND_LEDGE : DEPTH.OBSTACLES);
    bulb.setData('harmless', true);
    const on = now.pose === 'strike';
    hurt.setData('harmless', !on);
    light(on ? ON_ALPHA : now.pose === 'windup' ? (now.frame ? FLICKER_ALPHA : FLICKER_ALPHA * 0.4) : 0);
    if (!on && halo) { halo.stop(); halo = null; }
    if (now.frame === before?.frame || !before || !kit.isOnScreen(bulb)) return;
    const glow = { x: plan.x, y: top + bulb.displayHeight * 0.62 };
    if (now.frame === 1 && !on && kit.isAhead(bulb)) kit.audio.playSfx('floor-switch', VOL.obstacle * 0.3);
    if (on && before.pose !== 'strike') {
      fx.play('rays-cream', glow.x, glow.y, { depth: DEPTH.PICKUPS + 1, scale: 2 });
      fx.play('flare-big-cream', glow.x, glow.y, { depth: DEPTH.PICKUPS + 2 });
      // A big glow round the bulb while it is on
      halo = fx.play('glow-cream', glow.x, glow.y, { depth: DEPTH.PICKUPS + 1, scale: 2, loop: true, life: TIMINGS.lamp.on });
      if (kit.isAhead(bulb)) kit.audio.playSfx('disco-sfx', VOL.obstacle * 0.4);
    }
  });
  const extra = [...cone, ...bands, ...(cord ? [cord] : []), ...(fitting ? [fitting] : [])];
  bulb.once('destroy', () => halo?.stop());
  kit.track(bulb, { objects: [hurt, ...extra] });
}
