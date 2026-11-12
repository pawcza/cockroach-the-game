import { DEPTH } from '../../config/constants';
import { getFx } from '../../effects/Fx';
import { EnemyPlan } from './behaviours';
import { ObstacleKit } from './ObstacleKit';

/** Floats between the lanes and back (floater in behaviours.ts). */
export function spawnPope(kit: ObstacleKit, plan: EnemyPlan): void {
  const fx = getFx(kit.scene);
  const pope = kit.enemy(plan, { shadow: false });
  kit.drive(pope, plan);
  kit.playSoundOnVisible(pope, 'pope-sfx', 0.4);

  // A smoke trail
  const smoke = kit.emitWhileOnScreen(pope, 260, () => {
    fx.play('smoke', pope.x + Math.random() * 10 - 5, pope.y - pope.displayHeight / 2 + 12, { depth: DEPTH.GLOW, vy: -20 });
  });

  kit.track(pope, { timers: [smoke] });
}
