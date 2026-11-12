import { DEPTH } from '../../config/constants';
import { getFx } from '../../effects/Fx';
import { EnemyPlan } from './behaviours';
import { ObstacleKit } from './ObstacleKit';

/** Floats between the lanes and back (floater in behaviours.ts). */
export function spawnJellyfish(kit: ObstacleKit, plan: EnemyPlan): void {
  const fx = getFx(kit.scene);
  const jelly = kit.enemy(plan, { shadow: false });
  kit.drive(jelly, plan);
  kit.playSoundOnVisible(jelly, 'jellyfish-sfx', 0.4);

  // Violet motes drifting down off its tentacles
  const motes = kit.emitWhileOnScreen(jelly, 260, () => {
    fx.play('twinkle-violet', jelly.x + Math.random() * 20 - 10, jelly.y - 8, { depth: DEPTH.GLOW, vy: 40 });
  });

  kit.track(jelly, { timers: [motes] });
}
