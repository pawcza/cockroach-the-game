import Phaser from 'phaser';
import { DEPTH } from '../config/constants';

export function playLevelGlitch(scene: Phaser.Scene): void {
  const { width, height } = scene.cameras.main;
  const duration = 300;

  scene.cameras.main.flash(100, 255, 255, 255, true);

  const red = scene.add.rectangle(width / 2 - 3, height / 2, width, height, 0xff0000, 0.12)
    .setScrollFactor(0).setDepth(DEPTH.VFX_VIGNETTE).setBlendMode(Phaser.BlendModes.ADD);
  const cyan = scene.add.rectangle(width / 2 + 3, height / 2, width, height, 0x00ffff, 0.12)
    .setScrollFactor(0).setDepth(DEPTH.VFX_VIGNETTE).setBlendMode(Phaser.BlendModes.ADD);

  const scanlines = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.VFX_VIGNETTE);
  for (let y = 0; y < height; y += 4) {
    scanlines.fillStyle(0x000000, 0.15);
    scanlines.fillRect(0, y, width, 2);
  }

  scene.cameras.main.shake(duration, 0.008);

  scene.tweens.add({
    targets: [red, cyan, scanlines],
    alpha: 0,
    duration,
    ease: 'Power2',
    onComplete: () => {
      red.destroy();
      cyan.destroy();
      scanlines.destroy();
    },
  });
}
