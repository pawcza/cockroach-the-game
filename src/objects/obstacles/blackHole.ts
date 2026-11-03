import Phaser from 'phaser';
import { DEPTH } from '../../config/constants';
import { ObstacleKit } from './ObstacleKit';

const PULL_RADIUS = 250;
/** Velocity added per 60 Hz frame at the centre of the pull. */
const PULL_STRENGTH = 80;
const FRAME_MS = 1000 / 60;

export function spawnBlackHole(kit: ObstacleKit, x: number): void {
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

  // Particle swirl
  const particlesTimer = kit.emitWhileOnScreen(hole, 80, () => {
    const angle = Math.random() * Math.PI * 2;
    const dist = 30 + Math.random() * 40;
    const particle = scene.add.circle(
      hole.x + Math.cos(angle) * dist,
      centerY + Math.sin(angle) * dist,
      Phaser.Math.Between(1, 3),
      0x6600cc,
      0.7,
    );
    particle.setDepth(DEPTH.GLOW);
    scene.tweens.add({
      targets: particle,
      x: hole.x,
      y: centerY,
      alpha: 0,
      scale: 0.1,
      duration: 500,
      ease: 'Cubic.easeIn',
      onComplete: () => particle.destroy(),
    });
  });

  kit.track(hole, { timers: [particlesTimer], updates: [gravityUpdate] });
}
