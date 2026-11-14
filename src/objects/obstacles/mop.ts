import { VOL } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { getFx } from '../../effects/Fx';
import { EnemyPlan, laneY } from './behaviours';
import { ObstacleKit } from './ObstacleKit';

/**
 * The mop (mopSweep in behaviours.ts): soapy water kills roaches. It waits raised over its lane ahead of its spot,
 * dripping suds; then a warning lies along the stretch it will sweep, it presses down and sweeps towards the runner,
 * strings splayed, leaving suds behind, and lifts. Sounds: a wet slap and swish as it presses down.
 */
export function spawnMop(kit: ObstacleKit, plan: EnemyPlan): void {
  const fx = getFx(kit.scene);
  const mop = kit.enemy(plan);
  mop.anims.stop();
  mop.setData('flies', true);
  // The kill zone: the stretch it will sweep while it winds up; sweeping, the mop's head kills and what is still
  // ahead of it warns
  const hazard = kit.hazard(mop);
  let drips = 0;
  kit.drive(mop, plan, (now, before) => {
    const head = now.zones[0];
    if (now.pose === 'strike' && head) {
      hazard(now.warn && head.x0 > now.warn.x0 ? { lane: plan.lane, x0: now.warn.x0, x1: head.x0 } : null, [head]);
    } else hazard(now.warn ?? null);
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
      if (kit.isAhead(mop)) kit.audio.playSfx('mop-slap', VOL.obstacle * 0.4);
    }
  });
}
