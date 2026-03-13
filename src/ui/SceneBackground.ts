import Phaser from 'phaser';

/** Default neon color palette used across menu and multiplayer scenes. */
export const NEON_COLORS = [0xff00ff, 0x00ffff, 0xff6600, 0x00ff66, 0xffff00, 0xff0088, 0x8800ff];

/**
 * Spawn a single floating neon particle that drifts upward and fades out,
 * then respawns automatically to keep a constant particle count.
 */
export function spawnFloatingParticle(
  scene: Phaser.Scene,
  sceneWidth: number,
  sceneHeight: number,
  colors: readonly number[] = NEON_COLORS,
): void {
  const color = Phaser.Utils.Array.GetRandom(colors as number[]);
  const size = Phaser.Math.Between(2, 8);
  const x = Phaser.Math.Between(0, sceneWidth);
  const y = Phaser.Math.Between(0, sceneHeight);

  const particle = scene.add.circle(x, y, size, color, 0.6);
  particle.setBlendMode(Phaser.BlendModes.ADD);

  const duration = Phaser.Math.Between(3000, 7000);
  const targetX = x + Phaser.Math.Between(-100, 100);
  const targetY = y + Phaser.Math.Between(-150, -50);

  scene.tweens.add({
    targets: particle,
    x: targetX,
    y: targetY,
    alpha: 0,
    duration,
    ease: 'Sine.easeIn',
    onComplete: () => {
      particle.destroy();
      spawnFloatingParticle(scene, sceneWidth, sceneHeight, colors);
    },
  });
}

/**
 * Spawn an initial batch of floating neon particles.
 *
 * @param count Number of particles to spawn immediately (they self-replenish).
 */
export function startFloatingParticles(
  scene: Phaser.Scene,
  width: number,
  height: number,
  count: number,
  colors: readonly number[] = NEON_COLORS,
): void {
  for (let i = 0; i < count; i++) {
    spawnFloatingParticle(scene, width, height, colors);
  }
}
