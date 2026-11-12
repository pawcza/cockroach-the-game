import { VOL } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { frameOf } from '../../config/sprites';
import { getFx } from '../../effects/Fx';
import { EnemyPlan, laneY } from './behaviours';
import { ObstacleKit, Shootable } from './ObstacleKit';

/** How long the first shot shakes it, and how far. */
const STAGGER_MS = 350;
const STAGGER_PX = 4;

/**
 * The robot vacuum (patrol in behaviours.ts): low and wide, it drives along its lane at the runner, waits, drives back.
 * The one tough enemy: the first shot staggers and cracks it (its broken frames, a smoke trail), the second finishes
 * it. Sounds (placeholders): the vacuum's roar, quiet, as it comes into view; a ricochet for the first shot.
 */
export function spawnRobotVacuum(kit: ObstacleKit, plan: EnemyPlan): void {
  const { scene } = kit;
  const fx = getFx(scene);
  const robot = kit.enemy(plan);
  robot.anims.stop();
  kit.playSoundOnVisible(robot, 'blackhole-sfx', VOL.obstacle * 0.25);
  let cracked = false;
  let staggerUntil = 0;
  let smoke = 0;
  kit.drive(robot, plan, (now) => {
    robot.setFrame(frameOf('robot-vacuum', (cracked ? 2 : 0) + (now.frame ?? 0)));
    if (scene.runTime < staggerUntil) robot.x += Math.round(Math.sin(scene.runTime / 20) * STAGGER_PX);
    if (cracked && kit.isOnScreen(robot) && ++smoke % 6 === 0) {
      fx.play('smoke', robot.x - 6 + Math.random() * 12, robot.y - robot.displayHeight * 0.35, { depth: DEPTH.OBSTACLES + 0.5, vy: -40, life: 500 });
    }
    // Driving, dust off its brushes
    if (now.pose === 'strike' && kit.isOnScreen(robot) && smoke++ % 9 === 0) {
      fx.play('dust', robot.x + robot.displayWidth * 0.3, laneY(plan.lane), { depth: DEPTH.OBSTACLES + 0.5, vx: 60, life: 300 });
    }
  });
  const shootable = robot.getData('shootable') as Shootable;
  shootable.onHit = (): void => {
    cracked = true;
    staggerUntil = scene.runTime + STAGGER_MS;
    fx.burst('spark', robot.x, robot.y - robot.displayHeight * 0.3, 6, 14, { depth: DEPTH.POPUP, speed: [60, 140] });
    fx.play('crack', robot.x, robot.y - robot.displayHeight * 0.3, { depth: DEPTH.POPUP });
    kit.audio.playSfx('bullet-ricochet', VOL.obstacle);
  };
}
