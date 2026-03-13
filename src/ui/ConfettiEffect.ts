import Phaser from 'phaser';

const CONFETTI_COLORS = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xff6600];

/**
 * Spawns a burst of falling confetti rectangles across the scene.
 */
export function spawnConfetti(scene: Phaser.Scene, width: number, height: number): void {
  for (let i = 0; i < 40; i++) {
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    const size = Phaser.Math.Between(3, 8);
    const confetti = scene.add.rectangle(
      Phaser.Math.Between(0, width), -20,
      size, size * 2, color, 0.9,
    );
    confetti.setAngle(Phaser.Math.Between(0, 360));

    scene.tweens.add({
      targets: confetti,
      y: height + 20,
      x: confetti.x + Phaser.Math.Between(-100, 100),
      angle: confetti.angle + Phaser.Math.Between(-360, 360),
      duration: Phaser.Math.Between(1500, 3000),
      delay: Phaser.Math.Between(0, 1000),
      ease: 'Cubic.easeIn',
      onComplete: () => confetti.destroy(),
    });
  }
}

/**
 * Spawns a single floating particle that drifts upward and respawns.
 * Used for ambient death-scene atmosphere.
 */
export function spawnDeathParticle(
  scene: Phaser.Scene,
  sceneWidth: number,
  sceneHeight: number,
): void {
  const size = Phaser.Math.Between(2, 6);
  const x = Phaser.Math.Between(0, sceneWidth);
  const y = Phaser.Math.Between(sceneHeight * 0.5, sceneHeight);

  const particle = scene.add.circle(x, y, size, 0xaa0000, 0.5);
  particle.setBlendMode(Phaser.BlendModes.ADD);

  scene.tweens.add({
    targets: particle,
    y: y - Phaser.Math.Between(100, 300),
    alpha: 0,
    duration: Phaser.Math.Between(2000, 5000),
    ease: 'Sine.easeIn',
    onComplete: () => {
      particle.destroy();
      spawnDeathParticle(scene, sceneWidth, sceneHeight);
    },
  });
}

/**
 * Spawns a single floating neon particle that drifts and respawns.
 * Used for multiplayer game-over atmosphere.
 */
export function spawnFloatingParticle(
  scene: Phaser.Scene,
  sceneWidth: number,
  sceneHeight: number,
  colors: number[],
): void {
  const color = Phaser.Utils.Array.GetRandom(colors);
  const size = Phaser.Math.Between(2, 8);
  const x = Phaser.Math.Between(0, sceneWidth);
  const y = Phaser.Math.Between(0, sceneHeight);

  const particle = scene.add.circle(x, y, size, color, 0.6);
  particle.setBlendMode(Phaser.BlendModes.ADD);

  scene.tweens.add({
    targets: particle,
    x: x + Phaser.Math.Between(-100, 100),
    y: y + Phaser.Math.Between(-150, -50),
    alpha: 0,
    duration: Phaser.Math.Between(3000, 7000),
    ease: 'Sine.easeIn',
    onComplete: () => {
      particle.destroy();
      spawnFloatingParticle(scene, sceneWidth, sceneHeight, colors);
    },
  });
}
