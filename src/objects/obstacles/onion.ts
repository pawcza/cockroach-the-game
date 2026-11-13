import { VOL } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { getFx } from '../../effects/Fx';
import { EnemyPlan } from './behaviours';
import { feetY } from './cast';
import { ObstacleKit } from './ObstacleKit';

/** A curl of stink off its top, and a tear down its side, this often. */
const STINK_MS = 700;
const TEAR_MS = 800;

/** The onion just stands in its lane (blocker): the one enemy that does nothing. */
export function spawnOnion(kit: ObstacleKit, plan: EnemyPlan): void {
  const fx = getFx(kit.scene);
  const { x } = plan;
  const standY = feetY(plan.id, plan.lane);

  const onion = kit.enemy(plan);
  kit.drive(onion, plan);
  // The commonest obstacle there is, so the quietest of them
  kit.playSoundOnVisible(onion, 'onion-sfx', VOL.obstacle * 0.7);

  const stinkY = standY - onion.displayHeight * 0.75;
  const stink = kit.emitWhileOnScreen(onion, STINK_MS, () => {
    fx.play('wisp', x + Math.random() * 16 - 8, stinkY, { depth: DEPTH.OBSTACLES, vy: -30, flipX: Math.random() < .5 });
  });

  const tearY = standY - onion.displayHeight * 0.6;
  const tears = kit.emitWhileOnScreen(onion, TEAR_MS, () => {
    const side = Math.random() < .5 ? -1 : 1;
    fx.play('drip', x + side * (4 + Math.random() * 6), tearY, { depth: DEPTH.OBSTACLES + 0.5 });
  });

  kit.track(onion, { timers: [stink, tears] });
}
