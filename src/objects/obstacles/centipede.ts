import { VOL } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { getFx } from '../../effects/Fx';
import { EnemyPlan } from './behaviours';
import { feetY } from './cast';
import { ObstacleKit } from './ObstacleKit';

/**
 * The house centipede (scuttle in behaviours.ts): runs at the roach along a lane from far ahead, fast, legs rippling,
 * and switches lanes once or twice on the way, rearing up first (the telegraph: it lifts and flares). Watch its last
 * switch, or dash through. Sounds (placeholders): the cat's hiss when it rears.
 */
export function spawnCentipede(kit: ObstacleKit, plan: EnemyPlan): void {
  const fx = getFx(kit.scene);
  const bug = kit.enemy(plan);
  bug.anims.stop();
  // The art faces right; it runs left, at the roach
  bug.setFlipX(true);
  bug.setData('flies', true);
  kit.drive(bug, plan, (now, before) => {
    bug.setVisible(now.pose !== 'parked');
    if (!before || now.pose === before.pose || !kit.isOnScreen(bug)) return;
    if (now.pose === 'windup') {
      fx.play('flare-big-orange', bug.x - bug.displayWidth * .4, bug.y - 10, { depth: DEPTH.PICKUPS + 1 });
      if (kit.isAhead(bug)) kit.audio.playSfx('cat-sfx', VOL.obstacle * 0.35);
    }
    if (before.pose === 'air' && now.lane) fx.play('dust-land', bug.x, feetY(plan.id, now.lane), { depth: DEPTH.OBSTACLES + 1 });
  });
}
