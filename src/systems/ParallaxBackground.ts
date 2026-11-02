/** The three parallax layers, their level crossfade, and the camera look that follows speed. */
import Phaser from 'phaser';
import { DEPTH } from '../config/constants';
import { LevelConfig } from '../config/levels';

const SKY_ALPHA = 0.8;
const MID_ALPHA = 0.15;
const FADE_DURATION = 3000;

export class ParallaxBackground {
  private scene: Phaser.Scene;

  // A second set of layers sits behind the first so levels can crossfade.
  private skyBg: Phaser.GameObjects.TileSprite;
  private midBg: Phaser.GameObjects.TileSprite;
  private fgBg: Phaser.GameObjects.TileSprite;
  private nextSkyBg: Phaser.GameObjects.TileSprite;
  private nextMidBg: Phaser.GameObjects.TileSprite;
  private nextFgBg: Phaser.GameObjects.TileSprite;
  private transitioning = false;

  constructor(scene: Phaser.Scene, w: number, h: number) {
    this.scene = scene;

    // Lit by normal maps when available
    this.skyBg = scene.add.tileSprite(0, 0, w, h, 'lv1-sky').setOrigin(0, 0).setScrollFactor(0).setAlpha(SKY_ALPHA);
    this.skyBg.setPipeline('Light2D');
    this.midBg = scene.add.tileSprite(0, 0, w, h, 'lv1-bg').setOrigin(0, 0).setScrollFactor(0)
      .setDepth(DEPTH.MID_BG).setAlpha(MID_ALPHA).setBlendMode(Phaser.BlendModes.SOFT_LIGHT);
    this.fgBg = scene.add.tileSprite(0, 0, w, h, 'lv1-fg').setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.FG_BG);
    this.fgBg.setPipeline('Light2D');

    this.nextSkyBg = scene.add.tileSprite(0, 0, w, h, 'lv1-sky').setOrigin(0, 0).setScrollFactor(0).setAlpha(0);
    this.nextSkyBg.setPipeline('Light2D');
    this.nextMidBg = scene.add.tileSprite(0, 0, w, h, 'lv1-bg').setOrigin(0, 0).setScrollFactor(0)
      .setDepth(DEPTH.MID_BG).setAlpha(0).setBlendMode(Phaser.BlendModes.SOFT_LIGHT);
    this.nextFgBg = scene.add.tileSprite(0, 0, w, h, 'lv1-fg').setOrigin(0, 0).setScrollFactor(0)
      .setDepth(DEPTH.FG_BG).setAlpha(0);
    this.nextFgBg.setPipeline('Light2D');
  }

  crossfadeTo(config: LevelConfig): void {
    this.nextSkyBg.setTexture(config.skyKey);
    this.nextMidBg.setTexture(config.bgKey);
    this.nextFgBg.setTexture(config.fgKey);
    this.nextFgBg.setDepth(DEPTH.FG_BG);
    this.transitioning = true;

    const fade = { duration: FADE_DURATION, ease: 'Sine.easeInOut' };
    const tweens = this.scene.tweens;
    tweens.add({ targets: this.nextSkyBg, alpha: SKY_ALPHA, ...fade });
    tweens.add({ targets: this.nextMidBg, alpha: MID_ALPHA, ...fade });
    tweens.add({ targets: this.nextFgBg, alpha: 1, ...fade });

    tweens.add({ targets: this.skyBg, alpha: 0, ...fade });
    tweens.add({ targets: this.midBg, alpha: 0, ...fade });
    tweens.add({
      targets: this.fgBg, alpha: 0, ...fade,
      onComplete: () => {
        this.skyBg.setTexture(config.skyKey).setAlpha(SKY_ALPHA);
        this.midBg.setTexture(config.bgKey).setAlpha(MID_ALPHA);
        this.fgBg.setTexture(config.fgKey).setAlpha(1);
        this.fgBg.setDepth(DEPTH.FG_BG);
        this.nextSkyBg.setAlpha(0);
        this.nextMidBg.setAlpha(0);
        this.nextFgBg.setAlpha(0);
        this.transitioning = false;
      },
    });
  }

  update(speedMultiplier: number): void {
    const breatheFactor = this.scene.data.get('breatheFactor') ?? 1.0;
    const camera = this.scene.cameras.main;
    const scrollX = camera.scrollX;
    this.skyBg.tilePositionX = scrollX * 0.1 * breatheFactor;
    this.midBg.tilePositionX = scrollX * 0.4 * breatheFactor;
    this.fgBg.tilePositionX = scrollX * 0.7 * breatheFactor;

    if (this.transitioning) {
      this.nextSkyBg.tilePositionX = scrollX * 0.1 * breatheFactor;
      this.nextMidBg.tilePositionX = scrollX * 0.4 * breatheFactor;
      this.nextFgBg.tilePositionX = scrollX * 0.7 * breatheFactor;
    }

    const targetZoom = Math.max(0.88, 1 - Math.max(speedMultiplier - 5, 0) * 0.02);
    camera.zoom = Phaser.Math.Linear(camera.zoom, targetZoom, 0.02);

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

    camera.scrollY = 0;
  }
}
