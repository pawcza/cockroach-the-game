import Phaser from 'phaser';
import { VOL } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { SPRITE_SCALE } from '../../config/sprites';
import { FxHandle, getFx } from '../../effects/Fx';
import { EnemyPlan, laneY } from './behaviours';
import { TIMINGS, feetY } from './cast';
import { ObstacleKit, PASSABLE_ALPHA } from './ObstacleKit';

/** The cloud's hitbox height in each lane, frame px. */
export const CLOUD_H = 26;
/** How far back on the upper ledge the can stands (px up from the lane): a prop out of the way, like the bleach jug. */
const SET_BACK = 8;

/**
 * The spray's cloud wall (cloudWall in behaviours.ts): a big can at the back of the upper ledge shakes (both lanes
 * flicker green: the warning, this one shuts them both) and puffs a tall cloud that hangs across both lanes ahead of it
 * for a moment. Dash through it any time, or come by between puffs: a dash (or the pill) through either lane's cloud
 * punts the whole wall away, like the plain wall. Laid where walls go, with the "DASH!" hint the first times. Sounds:
 * its own, a can-shake rattle and a big puff. The can itself hurts nowhere (it stands back on the upper ledge), so it
 * is drawn see-through; the clouds are solid.
 */
export function spawnSprayWall(kit: ObstacleKit, plan: EnemyPlan): void {
  const { scene } = kit;
  const fx = getFx(scene);
  const t = TIMINGS.sprayWall;
  const can = kit.enemy(plan, { shadow: false });
  can.setDepth(DEPTH.OBSTACLES - 1).setAlpha(PASSABLE_ALPHA);
  (can.body as Phaser.Physics.Arcade.Body).checkCollision.none = true;
  can.setData('flies', true);
  kit.playSoundOnVisible(can, 'spraywall-puff', VOL.obstacle);
  // What hurts: the cloud in each lane, harmless between puffs
  const clouds = (['top', 'bottom'] as const).map((lane) => {
    const c = kit.createSprite(plan.x - t.reach / 2, laneY(lane), 'spray-big', 'spray', null);
    c.anims.stop();
    // A hit on either cloud is a hit on the wall (CollisionManager.crushObstacle): it counts as a wall broken
    c.setVisible(false).setData('floor', lane).setData('harmless', true).setData('telegraphs', true).setData('flies', true)
      .setData('partOf', can).setData('dashAs', 'wall');
    const b = c.body as Phaser.Physics.Arcade.Body;
    const w = t.reach / SPRITE_SCALE;
    b.setSize(w, CLOUD_H, false);
    b.setOffset((c.width - w) / 2, c.height * c.originY - CLOUD_H);
    return c;
  });
  const hazard = kit.hazard(can);
  // The puffs on screen, so a wall punted away takes its clouds with it
  let puffs: FxHandle[] = [];
  const remember = (handle: FxHandle | null): void => {
    if (handle) puffs = [...puffs.filter(h => h.alive), handle];
  };
  can.once('crushed', () => {
    hazard(null, []);
    puffs.forEach(h => h.stop());
    clouds.forEach(c => { (c.body as Phaser.Physics.Arcade.Body).enable = false; });
  });
  kit.drive(can, plan, (now, before) => {
    can.setDepth(DEPTH.OBSTACLES - 1);
    can.y -= SET_BACK;
    can.setData('harmless', true);
    const puffing = now.pose === 'strike';
    clouds.forEach(c => c.setData('harmless', !puffing));
    // Both lanes: winding up they warn, the hanging cloud kills (its zones, one a lane)
    const warn = now.warn;
    hazard(!puffing && warn ? (['top', 'bottom'] as const).map(lane => ({ ...warn, lane })) : null, puffing ? now.zones : []);
    can.anims.timeScale = now.pose === 'windup' ? 3 : 1;
    if (!before || now.pose === before.pose || !kit.isOnScreen(can)) return;
    if (now.pose === 'windup') fx.play('flare-big-green', can.x - 10, can.y - can.displayHeight * .7, { depth: DEPTH.PICKUPS + 1 });
    if (puffing) {
      for (const lane of ['top', 'bottom'] as const) {
        for (const dx of [0, t.reach / 2]) {
          const at = { x: plan.x - dx, y: feetY(plan.id, lane) };
          remember(fx.play('spray-cloud', at.x, at.y, {
            depth: DEPTH.OBSTACLES + 1, life: t.puff,
            onComplete: () => remember(fx.play('spray-cloud-out', at.x, at.y, { depth: DEPTH.OBSTACLES + 1 })),
          }));
        }
      }
      if (kit.isAhead(can)) kit.audio.playSfx('spraywall-puff', VOL.obstacle * 0.5);
    }
  });
  kit.track(can, { objects: clouds });
}
