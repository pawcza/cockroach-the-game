import { VOL } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { getFx } from '../../effects/Fx';
import { EnemyPlan, laneY } from './behaviours';
import { TIMINGS } from './cast';
import { ObstacleKit } from './ObstacleKit';

/** The warning on the stretch it is about to sweep: soapy water. */
const SUDS = 0x9fd8ff;
const WARN_ALPHA = 0.22;
const SWEEP_ALPHA = 0.32;

/**
 * The mop (mopSweep in behaviours.ts): soapy water kills roaches. It waits raised over its lane ahead of its spot,
 * dripping suds; then a warning lies along the stretch it will sweep, it presses down and sweeps towards the runner,
 * strings splayed, leaving suds behind, and lifts. Sounds (placeholders): the spray's hiss as it presses down.
 */
export function spawnMop(kit: ObstacleKit, plan: EnemyPlan): void {
  const fx = getFx(kit.scene);
  const mop = kit.enemy(plan);
  mop.anims.stop();
  mop.setData('flies', true);
  const band = kit.laneBand(mop, SUDS, DEPTH.CONTACT_SHADOW);
  // The wet floor it leaves: a sheen on the stretch it has swept, drying off as it goes back
  const sheen = kit.laneBand(mop, 0xd8f2ff, DEPTH.CONTACT_SHADOW);
  const start = plan.x + TIMINGS.mop.from;
  let wet = 0;
  let drips = 0;
  kit.drive(mop, plan, (now, before) => {
    band(now.warn, now.pose === 'strike' ? SWEEP_ALPHA : WARN_ALPHA);
    if (now.pose === 'strike') wet = Math.min(1, wet + .08);
    else wet = Math.max(0, wet - .015);
    sheen(wet > 0 ? { lane: plan.lane, x0: now.pose === 'strike' ? mop.x : plan.x + TIMINGS.mop.to, x1: start, level: 1 } : undefined, wet * .35);
    if (!kit.isOnScreen(mop)) return;
    const floor = laneY(plan.lane);
    // Suds drip from the raised head, faster as it winds up; while it sweeps, suds and bubbles left behind it
    if (now.pose !== 'strike' && laneY(plan.lane) - now.y > 10 && ++drips % (now.pose === 'windup' ? 6 : 20) === 0) {
      fx.play('drip', mop.x + (Math.random() - .5) * 30, now.y - 4, { depth: DEPTH.OBSTACLES + 1, vy: 120, gravity: 500, life: 380 });
    }
    if (now.pose === 'strike' && ++drips % 4 === 0) {
      fx.play('bit-white', mop.x + 30, floor - Math.random() * 10, { depth: DEPTH.OBSTACLES - 0.5, vy: -20, life: 500, fadeOut: 200 });
    }
    if (now.pose === before?.pose || !before) return;
    if (now.pose === 'windup' && before.pose === 'idle') fx.play('flare-big-cyan', mop.x, now.y - mop.displayHeight * 0.3, { depth: DEPTH.PICKUPS + 1 });
    if (now.pose === 'strike') {
      fx.play('splash', mop.x, floor, { depth: DEPTH.OBSTACLES + 1 });
      if (kit.isAhead(mop)) kit.audio.playSfx('spray-sfx', VOL.obstacle * 0.4);
    }
  });
}
