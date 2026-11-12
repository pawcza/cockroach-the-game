import Phaser from 'phaser';
import { VOL } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { SPRITE_SCALE } from '../../config/sprites';
import { getFx } from '../../effects/Fx';
import { EnemyPlan, ROACH_BACK, laneY } from './behaviours';
import { TIMINGS } from './cast';
import { ObstacleKit } from './ObstacleKit';

/** How hard it sucks a roach in its lane at the nozzle (share of forward speed), and across the lanes. */
const PULL = 0.6;
const CROSS_PULL = 0.12;
/** Its hitbox: the nozzle, at its front (frame px). */
const NOZZLE_W = 20;
const NOZZLE_H = 18;
/** The cue before it is on screen: the left edge darkening as it comes (alpha), how wide. */
const EDGE_W = 70;
const EDGE_ALPHA = 0.55;
/** It is heard and felt from this far behind the left edge. */
const CUE_FROM = 700;

/**
 * The vacuum cleaner (suck in behaviours.ts): it comes from behind. First it is heard (a roar) and felt: dust and
 * crumbs on screen pulled away to the left, the left edge darkening and shuddering. Then its nozzle slides in on its
 * lane and closes in, and a roach in front of it is dragged back (streaks pulled into the nozzle); if the nozzle gets
 * it, it is done. Dash to break free, or hop out (it pulls far less across the lanes; it swings its nozzle over after
 * a wind-up). It gives up after a while and falls back. Sounds (placeholders): the black hole's for the roar.
 */
export function spawnVacuum(kit: ObstacleKit, plan: EnemyPlan): void {
  const { scene } = kit;
  const fx = getFx(scene);
  const t = TIMINGS.vacuum;
  const vac = kit.enemy(plan);
  vac.anims.stop();
  vac.setData('behind', true);
  vac.setData('flies', true);
  const body = vac.body as Phaser.Physics.Arcade.Body;
  body.setSize(NOZZLE_W, NOZZLE_H, false);
  body.setOffset(vac.width - 8 - NOZZLE_W, vac.height * vac.originY - NOZZLE_H);
  const nozzleOf = (): number => vac.x + vac.displayWidth / 2 - 8 * SPRITE_SCALE;

  const { width, height } = scene.cameras.main;
  const edge = scene.add.rectangle(0, 0, EDGE_W, height, 0x000000, 1).setOrigin(0, 0).setScrollFactor(0)
    .setDepth(DEPTH.WARNING - 1).setAlpha(0);
  let roared = false;
  let dust = 0;
  const end = plan.chase!.startAt + t.approach + t.hold + 4500;

  kit.drive(vac, plan, (now) => {
    const camera = scene.cameras.main;
    const parked = now.pose === 'parked';
    vac.setVisible(!parked);
    body.checkCollision.none = parked;
    if (scene.runTime > end) { vac.destroy(); return; }
    if (parked || scene.isDead) { edge.setAlpha(0); return; }
    const nozzle = nozzleOf();
    // Before it shows: heard, and felt at the left edge, the closer the stronger
    const behind = camera.scrollX - nozzle;
    const cue = behind > 0 ? Math.max(0, 1 - behind / CUE_FROM) : nozzle < camera.scrollX + width * .4 ? .4 : 0;
    edge.setAlpha(cue * EDGE_ALPHA).setX(cue > 0 ? Math.round(Math.sin(scene.runTime / 23) * 2) : 0);
    if (cue > 0 && !roared) {
      roared = true;
      kit.audio.playSfx('blackhole-sfx', VOL.obstacle * 0.7);
    }
    if (cue > 0 && ++dust % 5 === 0) {
      fx.play(Math.random() < .5 ? 'dust' : 'bit-grey', camera.scrollX + Math.random() * width * .7,
        laneY(Math.random() < .5 ? 'top' : 'bottom') - Math.random() * 40, { depth: DEPTH.OBSTACLES + 1, vx: -320 - Math.random() * 200, life: 600 });
    }
    // The suction, on this client's roach: harder in its lane, and the nearer the nozzle
    const roach = scene.cockroach;
    const gap = roach.x - ROACH_BACK - nozzle;
    if (gap > -20 && gap < t.reach && now.lane) {
      const sameLane = (roach.y > (laneY('top') + laneY('bottom')) / 2 ? 'bottom' : 'top') === now.lane;
      const share = (sameLane ? PULL : CROSS_PULL) * (1 - Math.max(0, gap) / t.reach);
      scene.pullRoach(share);
      if (sameLane && dust % 3 === 0) {
        // Dust and crumbs streaming off the roach into the nozzle
        fx.play(dust % 2 ? 'bit-white' : 'dust', roach.x - ROACH_BACK + Math.random() * 30, roach.y + Math.random() * 24 - 16,
          { depth: DEPTH.PICKUPS + 1, vx: -380 - Math.random() * 120, life: 260 });
      }
    }
  });
  kit.track(vac, { objects: [edge] });
  void height;
}
