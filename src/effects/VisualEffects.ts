import Phaser from 'phaser';
import { COLORS, DEPTH } from '../config/constants';
import { popupStyle } from '../utils/TextStyles';

// Speed tops out near 3.4x. The scene keeps its colours at every speed: only the edges of the screen close in.
const VIGNETTE_FROM = 2.7; // ~Lv8
const VIGNETTE_MAX = 0.35;
const MAX_SPEED = 3.4;

const COLLECT_TEXTURE = 'collect-spark';

export class VisualEffects {
  private scene: Phaser.Scene;

  private vignetteGraphics!: Phaser.GameObjects.Graphics;
  private flashOverlay!: Phaser.GameObjects.Rectangle;
  private collectBurst!: Phaser.GameObjects.Particles.ParticleEmitter;

  private initialized = false;
  private deathSlowMoTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  init(): void {
    if (this.initialized) return;

    const camera = this.scene.cameras.main;
    const w = camera.width;
    const h = camera.height;

    this.vignetteGraphics = this.scene.add.graphics();
    this.vignetteGraphics.setScrollFactor(0);
    this.vignetteGraphics.setDepth(DEPTH.VFX_VIGNETTE);
    this.vignetteGraphics.setAlpha(0);
    this.drawVignette();

    this.flashOverlay = this.scene.add.rectangle(w / 2, h / 2, w, h, 0xffffff, 0);
    this.flashOverlay.setScrollFactor(0);
    this.flashOverlay.setDepth(DEPTH.VFX_FLASH);

    if (!this.scene.textures.exists(COLLECT_TEXTURE)) {
      this.scene.make.graphics({}, false).fillStyle(0xffffff).fillCircle(3, 3, 3)
        .generateTexture(COLLECT_TEXTURE, 6, 6).destroy();
    }
    this.collectBurst = this.scene.add.particles(0, 0, COLLECT_TEXTURE, {
      emitting: false,
      speed: { min: 120, max: 260 },
      lifespan: { min: 330, max: 500 },
      scale: { start: 1, end: 0.1 },
      alpha: { start: 1, end: 0 },
      tint: [...COLORS.COLLECT],
    }).setDepth(DEPTH.VFX_TEXT);

    this.initialized = true;
  }

  resize(width: number, height: number): void {
    this.flashOverlay.setPosition(width / 2, height / 2).setSize(width, height);
    this.drawVignette();
  }

  private drawVignette(): void {
    const w = this.scene.cameras.main.width;
    const h = this.scene.cameras.main.height;
    const g = this.vignetteGraphics;
    g.clear();

    for (let i = 0; i < 20; i++) {
      const alpha = (1 - i / 20) * 0.6;
      const thickness = 8;
      const offset = i * thickness;

      g.fillStyle(0x000000, alpha);
      g.fillRect(0, offset, w, thickness);
      g.fillRect(0, h - offset - thickness, w, thickness);
      g.fillRect(offset, 0, thickness, h);
      g.fillRect(w - offset - thickness, 0, thickness, h);
    }
  }

  update(speedMultiplier: number): void {
    if (!this.initialized) return;
    const closing = Math.min(Math.max(speedMultiplier - VIGNETTE_FROM, 0) / (MAX_SPEED - VIGNETTE_FROM), 1);
    this.vignetteGraphics.setAlpha(closing * VIGNETTE_MAX);
  }

  pickupCollectEffect(x: number, y: number): void {
    if (!this.initialized) return;

    this.collectBurst.explode(12, x, y);
  }

  comboLostEffect(comboLost: number): void {
    if (!this.initialized || comboLost <= 0) return;

    const camera = this.scene.cameras.main;

    // Small screen shake
    camera.shake(150, 0.008);

    // Text at top of screen
    const w = camera.width;
    const text = this.scene.add.text(w / 2, 80, `${comboLost} kombo w dupę`, popupStyle({
      fontSize: '12px',
      color: '#ff4444',
      strokeThickness: 4,
    }));
    text.setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.POPUP);

    this.scene.tweens.add({
      targets: text,
      alpha: { from: 1, to: 0 },
      y: text.y - 20,
      duration: 3000,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });
  }

  comboTierFlash(color: number): void {
    const { width, height } = this.scene.cameras.main;
    const flash = this.scene.add.rectangle(width / 2, height / 2, width, height, color, 0.15)
      .setScrollFactor(0).setDepth(DEPTH.VFX_VIGNETTE).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 400,
      ease: 'Power2',
      onComplete: () => flash.destroy(),
    });
  }

  deathEffect(): void {
    if (!this.initialized) return;

    this.scene.cameras.main.shake(260, 0.012);

    // A short red hit, then the world sinks while the roach stays lit above it
    this.flashOverlay.setBlendMode(Phaser.BlendModes.NORMAL).setFillStyle(0xff0000, 0.3);
    this.scene.tweens.add({
      targets: this.flashOverlay,
      fillAlpha: 0,
      duration: 40,
      onComplete: () => {
        this.flashOverlay.setFillStyle(0x000000, 0);
        this.scene.tweens.add({ targets: this.flashOverlay, fillAlpha: 0.6, duration: 120 });
      },
    });

    this.scene.time.timeScale = 0.3;
    this.deathSlowMoTimeout = setTimeout(() => {
      this.scene.time.timeScale = 1.0;
      this.deathSlowMoTimeout = null;
    }, 800);
  }

  destroy(): void {
    if (!this.initialized) return;
    if (this.deathSlowMoTimeout !== null) {
      clearTimeout(this.deathSlowMoTimeout);
      this.deathSlowMoTimeout = null;
    }
    this.vignetteGraphics.destroy();
    this.flashOverlay.destroy();
    this.collectBurst.destroy();
    this.initialized = false;
  }
}
