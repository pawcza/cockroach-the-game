import Phaser from 'phaser';
import { VOL } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { frameOf } from '../../config/sprites';
import { getFx } from '../../effects/Fx';
import { EnemyPlan, Lane, newWasp, stepWasp, waspDiveLane } from './behaviours';
import { ENEMIES, WASP, bodyOf } from './cast';
import { ObstacleKit, Shootable } from './ObstacleKit';

/** The roach's centre from its sprite's x: ROACH_BACK and ROACH_FRONT round it (behaviours.ts) are from there. */
const roachLane = (y: number, kit: ObstacleKit): Lane => (y > (kit.topY + kit.bottomY) / 2 ? 'bottom' : 'top');

/**
 * The jewel wasp (stepWasp in behaviours.ts): it flies in ahead of the roach and hovers there, buzzing, in the roach's
 * lane; when the roach hops it follows after a moment. Then it draws back, trembling in its sting-first pose, a glint on
 * its sting and the stretch of lane its dive will sweep marked (its lane is locked from here on), and dives sting first
 * down that lane. Hop once it has locked on, dash through the dive, or shoot it while it hovers. It hunts this client's
 * roach only. Sounds (placeholders): the pigeon's screech, high, for the lock.
 */
export function spawnWasp(kit: ObstacleKit, plan: EnemyPlan): void {
  const { scene } = kit;
  const fx = getFx(scene);
  const wasp = kit.enemy(plan, { shadow: false });
  wasp.anims.stop();
  wasp.setVisible(false).setData('flies', true).setData('harmless', true);
  const body = bodyOf(ENEMIES.wasp);
  const w = newWasp(plan.lane);
  wasp.setData('hunt', w);
  const hazard = kit.hazard(wasp);
  let last = scene.runTime;
  let was = w.phase;
  const update = (): void => {
    if (!wasp.active || !wasp.body?.enable) return;
    const now = scene.runTime;
    const dt = Math.min(50, now - last);
    last = now;
    if (scene.isDead) { hazard(null); return; }
    const roach = scene.cockroach;
    const zones = stepWasp(w, WASP, plan, dt, roach.x, roachLane(roach.y, kit), body);
    if (w.phase === 'waiting') return;
    if (w.phase === 'gone') { wasp.destroy(); return; }
    // Locked on, it holds its sting-first pose and trembles as it draws back: the cue to hop now
    const shiver = w.phase === 'windup' ? Math.round(Math.sin(now / 14) * 2) : 0;
    wasp.setVisible(true).setPosition(Math.round(w.x) + shiver, Math.round(w.y));
    const frame = w.phase === 'dive' || w.phase === 'windup' ? 2 : Math.floor(now / 45) % 2;
    wasp.setFrame(frameOf('wasp', frame));
    wasp.setData('floor', w.lane).setData('harmless', zones.length === 0);
    // The stretch of its lane the dive will sweep, from the lock; then where the sting is
    hazard(waspDiveLane(w, WASP, roach.x, body), zones);
    if (w.phase !== was) {
      if (w.phase === 'windup') {
        // A glint on its sting and a pink flare round it, riding with it as it draws back
        fx.play('glint-white', -18, -6, { follow: wasp, depth: DEPTH.PICKUPS + 2 });
        fx.play('flare-big-pink', 0, -14, { follow: wasp, depth: DEPTH.PICKUPS + 1 });
        kit.audio.playSfx('bird-sfx', VOL.obstacle * 0.4);
      }
      if (w.phase === 'dive') fx.play('streak-pink', 30, -10, { follow: wasp, depth: DEPTH.PICKUPS + 1 });
      was = w.phase;
    }
  };
  kit.track(wasp, { updates: [update] });
  // Shot where it is, in its lane, unless it is between lanes following a hop
  const shootable = wasp.getData('shootable') as Shootable;
  shootable.span = (lane) => (w.phase === 'waiting' || w.phase === 'gone' || w.from !== null || lane !== w.lane
    ? null : { x0: w.x - body.half, x1: w.x + body.half });
  void Phaser;
}
