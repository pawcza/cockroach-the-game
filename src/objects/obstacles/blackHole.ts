import Phaser from 'phaser';
import { DEPTH } from '../../config/constants';
import { getFx } from '../../effects/Fx';
import { EnemyPlan } from './behaviours';
import { ObstacleKit } from './ObstacleKit';

const PULL_RADIUS = 250;
/** Velocity added per 60 Hz frame at the centre of the pull. */
const PULL_STRENGTH = 80;
const FRAME_MS = 1000 / 60;

export function spawnBlackHole(kit: ObstacleKit, { x }: EnemyPlan): void {
  const { scene } = kit;
  const hole = kit.createSprite(x, 0, 'blackhole', 'blackhole', null, {
    hitbox: { w: 0.5, h: 0.5 },
  });
  const centerY = (kit.topY + kit.bottomY) / 2;
  hole.y = centerY + hole.displayHeight * (hole.originY - 0.5);
  kit.playSoundOnVisible(hole, 'blackhole-sfx', 0.5);

  // Gravitational pull on cockroach. Vertical only: the run's speed overwrites horizontal velocity every frame.
  const gravityUpdate = (_time: number, delta: number): void => {
    if (scene.isDead || scene.physics.world.isPaused) return;
    const camera = scene.cameras.main;
    if (hole.x < camera.scrollX - 200 || hole.x > camera.scrollX + camera.width + 200) return;
    const cockroach = scene.cockroach;
    if (!cockroach) return;
    const dist = Phaser.Math.Distance.Between(cockroach.x, cockroach.y, hole.x, centerY);
    if (dist < PULL_RADIUS && dist > 0) {
      const force = PULL_STRENGTH * (1 - dist / PULL_RADIUS) * (delta / FRAME_MS);
      const angle = Phaser.Math.Angle.Between(cockroach.x, cockroach.y, hole.x, centerY);
      (cockroach.body as Phaser.Physics.Arcade.Body).velocity.y += Math.sin(angle) * force;
    }
  };

  // Violet motes drawn in to its middle
  const fx = getFx(scene);
  const particlesTimer = kit.emitWhileOnScreen(hole, 120, () => {
    const angle = Math.random() * Math.PI * 2;
    const dist = 30 + Math.random() * 40;
    const life = 500;
    fx.play('twinkle-violet', hole.x + Math.cos(angle) * dist, centerY + Math.sin(angle) * dist, {
      depth: DEPTH.GLOW, vx: (-Math.cos(angle) * dist * 1000) / life, vy: (-Math.sin(angle) * dist * 1000) / life, life, loop: true,
    });
  });

  kit.track(hole, { timers: [particlesTimer], updates: [gravityUpdate] });
}
