import Phaser from 'phaser';
import { VOL } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { SPRITE_SCALE } from '../../config/sprites';
import { getFx } from '../../effects/Fx';
import { EnemyPlan, laneY } from './behaviours';
import { TIMINGS } from './cast';
import { ObstacleKit } from './ObstacleKit';

const MIST = 0x88dd44;
/** The cloud's hitbox height in each lane, frame px. */
const CLOUD_H = 26;
/** How far back on the upper ledge the can stands (px up from the lane): a prop out of the way, like the bleach jug. */
const SET_BACK = 8;

/**
 * The spray's cloud wall (cloudWall in behaviours.ts): a big can at the back of the upper ledge shakes (both lanes
 * flicker green: the warning, this one shuts them both) and puffs a tall cloud that hangs across both lanes ahead of it
 * for a moment. Dash through it any time, or come by between puffs. Laid where walls go, with the "DASH!" hint the first
 * times. Sounds (placeholders): the spray's.
 */
export function spawnSprayWall(kit: ObstacleKit, plan: EnemyPlan): void {
  const { scene } = kit;
  const fx = getFx(scene);
  const t = TIMINGS.sprayWall;
  const can = kit.enemy(plan, { shadow: false });
  can.setDepth(DEPTH.OBSTACLES - 1);
  (can.body as Phaser.Physics.Arcade.Body).checkCollision.none = true;
  can.setData('flies', true);
  kit.playSoundOnVisible(can, 'spray-sfx', VOL.obstacle);
  // What hurts: the cloud in each lane, harmless between puffs
  const clouds = (['top', 'bottom'] as const).map((lane) => {
    const c = kit.createSprite(plan.x - t.reach / 2, laneY(lane), 'spray-big', 'spray', null);
    c.anims.stop();
    c.setVisible(false).setData('floor', lane).setData('harmless', true).setData('telegraphs', true).setData('flies', true);
    const b = c.body as Phaser.Physics.Arcade.Body;
    const w = t.reach / SPRITE_SCALE;
    b.setSize(w, CLOUD_H, false);
    b.setOffset((c.width - w) / 2, c.height * c.originY - CLOUD_H);
    return c;
  });
  const bands = (['top', 'bottom'] as const).map(() => kit.laneBand(can, MIST, DEPTH.CONTACT_SHADOW));
  kit.drive(can, plan, (now, before) => {
    can.setDepth(DEPTH.OBSTACLES - 1);
    can.y -= SET_BACK;
    can.setData('harmless', true);
    const puffing = now.pose === 'strike';
    clouds.forEach(c => c.setData('harmless', !puffing));
    (['top', 'bottom'] as const).forEach((lane, i) => bands[i](now.warn && { ...now.warn, lane }, puffing ? .2 : .14));
    can.anims.timeScale = now.pose === 'windup' ? 3 : 1;
    if (!before || now.pose === before.pose || !kit.isOnScreen(can)) return;
    if (now.pose === 'windup') fx.play('flare-big-green', can.x - 10, can.y - can.displayHeight * .7, { depth: DEPTH.PICKUPS + 1 });
    if (puffing) {
      for (const lane of ['top', 'bottom'] as const) {
        for (const dx of [0, t.reach / 2]) {
          const at = { x: plan.x - dx, y: laneY(lane) };
          fx.play('spray-cloud', at.x, at.y, { depth: DEPTH.OBSTACLES + 1, life: t.puff, onComplete: () => fx.play('spray-cloud-out', at.x, at.y, { depth: DEPTH.OBSTACLES + 1 }) });
        }
      }
      if (kit.isAhead(can)) kit.audio.playSfx('spray-sfx', VOL.obstacle * 0.5);
    }
  });
  kit.track(can, { objects: clouds });
}
