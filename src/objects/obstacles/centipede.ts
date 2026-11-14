import { VOL } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { getFx } from '../../effects/Fx';
import { EnemyPlan, setOffScuttle } from './behaviours';
import { TIMINGS, feetY } from './cast';
import { ObstacleKit } from './ObstacleKit';
import { cruiseAt } from './vacuum';

/**
 * The house centipede (scuttle in behaviours.ts): sets off from beyond the screen's right edge once this client's roach
 * comes near its slot, runs at the roach, legs rippling, rears up (the telegraph: it lifts and flares) and switches
 * lanes, all on screen. Watch where it lands. Sounds: its own hiss and scuttle when it rears.
 */
export function spawnCentipede(kit: ObstacleKit, plan: EnemyPlan): void {
  const { scene } = kit;
  const fx = getFx(scene);
  const bug = kit.enemy(plan);
  bug.anims.stop();
  // The art faces right; it runs left, at the roach
  bug.setFlipX(true);
  bug.setData('flies', true);
  // Local: when it sets off depends on this client's roach. Before the drive below, so the frame it sets off is drawn
  kit.track(bug, {
    updates: [() => {
      if (plan.run || !bug.active || scene.isDead) return;
      const roach = scene.cockroach;
      setOffScuttle(plan, TIMINGS.centipede, scene.runTime, {
        x: roach.x,
        cruise: cruiseAt(scene.runTime, roach.x),
        edge: scene.cameras.main.worldView.right - roach.x,
      });
    }],
  });
  kit.drive(bug, plan, (now, before) => {
    bug.setVisible(now.pose !== 'parked');
    if (!before || now.pose === before.pose || !kit.isOnScreen(bug)) return;
    if (now.pose === 'windup') {
      fx.play('flare-big-orange', bug.x - bug.displayWidth * .4, bug.y - 10, { depth: DEPTH.PICKUPS + 1 });
      if (kit.isAhead(bug)) kit.audio.playSfx('centipede-rear', VOL.obstacle * 0.35);
    }
    if (before.pose === 'air' && now.lane) fx.play('dust-land', bug.x, feetY(plan.id, now.lane), { depth: DEPTH.OBSTACLES + 1 });
  });
}
