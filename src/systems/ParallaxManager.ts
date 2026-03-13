import Phaser from 'phaser';
import { LevelConfig } from '../config/levels';

/**
 * Manages the three-layer parallax background (sky, mid, fg) and
 * crossfade transitions between levels.
 */
export class ParallaxManager {
  private scene: Phaser.Scene;

  // Current layers
  private skyBg!: Phaser.GameObjects.TileSprite;
  private midBg!: Phaser.GameObjects.TileSprite;
  private fgBg!: Phaser.GameObjects.TileSprite;

  // Next-level layers (for crossfade)
  private nextSkyBg!: Phaser.GameObjects.TileSprite;
  private nextMidBg!: Phaser.GameObjects.TileSprite;
  private nextFgBg!: Phaser.GameObjects.TileSprite;

  private bgTransitioning = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  create(): void {
    const w = this.scene.cameras.main.width;
    const h = this.scene.cameras.main.height;

    this.skyBg = this.scene.add
      .tileSprite(0, 0, w, h, 'lv1-sky')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setAlpha(0.8);

    this.midBg = this.scene.add
      .tileSprite(0, 0, w, h, 'lv1-bg')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1)
      .setAlpha(0.15);
    this.midBg.setBlendMode(Phaser.BlendModes.SOFT_LIGHT);

    this.fgBg = this.scene.add
      .tileSprite(0, 0, w, h, 'lv1-fg')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(2);

    // Next-level background layers (for crossfade transitions)
    this.nextSkyBg = this.scene.add.tileSprite(0, 0, w, h, 'lv1-sky')
      .setOrigin(0, 0).setScrollFactor(0).setAlpha(0);
    this.nextMidBg = this.scene.add.tileSprite(0, 0, w, h, 'lv1-bg')
      .setOrigin(0, 0).setScrollFactor(0).setDepth(1).setAlpha(0)
      .setBlendMode(Phaser.BlendModes.SOFT_LIGHT);
    this.nextFgBg = this.scene.add.tileSprite(0, 0, w, h, 'lv1-fg')
      .setOrigin(0, 0).setScrollFactor(0).setDepth(2).setAlpha(0);
    this.bgTransitioning = false;
  }

  update(speedMultiplier: number): void {
    const breatheFactor = this.scene.data.get('breatheFactor') ?? 1.0;
    const scrollX = this.scene.cameras.main.scrollX;
    this.skyBg.tilePositionX = scrollX * 0.1 * breatheFactor;
    this.midBg.tilePositionX = scrollX * 0.4 * breatheFactor;
    this.fgBg.tilePositionX = scrollX * 0.7 * breatheFactor;

    // Keep next-level backgrounds in sync during crossfade
    if (this.bgTransitioning) {
      this.nextSkyBg.tilePositionX = scrollX * 0.1 * breatheFactor;
      this.nextMidBg.tilePositionX = scrollX * 0.4 * breatheFactor;
      this.nextFgBg.tilePositionX = scrollX * 0.7 * breatheFactor;
    }

    const targetZoom = Math.max(0.88, 1 - Math.max(speedMultiplier - 5, 0) * 0.02);
    this.scene.cameras.main.zoom = Phaser.Math.Linear(this.scene.cameras.main.zoom, targetZoom, 0.02);

    const darkening = Math.min(Math.max(speedMultiplier - 3.5, 0) * 0.08, 0.5);
    if (darkening > 0) {
      this.skyBg.setTint(
        Phaser.Display.Color.GetColor(
          Math.floor(255 * (1 - darkening)),
          Math.floor(255 * (1 - darkening * 0.8)),
          Math.floor(255 * (1 - darkening * 0.3)),
        ),
      );
    }

    this.scene.cameras.main.scrollY = 0;
  }

  crossfade(config: LevelConfig): void {
    this.nextSkyBg.setTexture(config.skyKey);
    this.nextMidBg.setTexture(config.bgKey);
    this.nextFgBg.setTexture(config.fgKey);
    this.nextFgBg.setDepth(2);
    this.bgTransitioning = true;

    const fadeDuration = 3000;

    // Fade in next backgrounds to their target alphas
    this.scene.tweens.add({ targets: this.nextSkyBg, alpha: 0.8, duration: fadeDuration, ease: 'Sine.easeInOut' });
    this.scene.tweens.add({ targets: this.nextMidBg, alpha: 0.15, duration: fadeDuration, ease: 'Sine.easeInOut' });
    this.scene.tweens.add({ targets: this.nextFgBg, alpha: 1, duration: fadeDuration, ease: 'Sine.easeInOut' });

    // Fade out current backgrounds, then swap
    this.scene.tweens.add({ targets: this.skyBg, alpha: 0, duration: fadeDuration, ease: 'Sine.easeInOut' });
    this.scene.tweens.add({ targets: this.midBg, alpha: 0, duration: fadeDuration, ease: 'Sine.easeInOut' });
    this.scene.tweens.add({
      targets: this.fgBg, alpha: 0, duration: fadeDuration, ease: 'Sine.easeInOut',
      onComplete: () => {
        // Swap: current takes next's textures, reset alphas
        this.skyBg.setTexture(config.skyKey).setAlpha(0.8);
        this.midBg.setTexture(config.bgKey).setAlpha(0.15);
        this.fgBg.setTexture(config.fgKey).setAlpha(1);
        this.fgBg.setDepth(2);
        this.nextSkyBg.setAlpha(0);
        this.nextMidBg.setAlpha(0);
        this.nextFgBg.setAlpha(0);
        this.bgTransitioning = false;
      },
    });
  }
}
