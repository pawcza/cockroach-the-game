import Phaser from 'phaser';
import { COLORS, DEPTH } from '../config/constants';
import { popupStyle } from '../utils/TextStyles';

// Speed tops out near 3.4x (3.05x on reaching level 10), so each effect starts where its level is reached.
const TINT_FROM = 2.5; // ~Lv7
const BREATHE_FROM = 2.6;
const VIGNETTE_FROM = 2.7; // ~Lv8
const EDGE_FROM = 2.85; // ~Lv9
const INVERT_FROM = 3.0;
const GLITCH_FROM = 3.15; // well into Lv10
const PSYCHEDELIC_FROM = 3.3;
const MAX_SPEED = 3.4;

const COLLECT_TEXTURE = 'collect-spark';
/** The camera's horizontal offset during a run, set by GameScene. */
const RUN_FOLLOW_OFFSET_X = -200;

export class VisualEffects {
  private scene: Phaser.Scene;

  private tintOverlay!: Phaser.GameObjects.Rectangle;
  private vignetteGraphics!: Phaser.GameObjects.Graphics;
  private flashOverlay!: Phaser.GameObjects.Rectangle;
  private borderOverlay!: Phaser.GameObjects.Graphics;
  private collectBurst!: Phaser.GameObjects.Particles.ParticleEmitter;

  private initialized = false;
  private colorCycleTime = 0;
  private breatheTime = 0;
  private glitchTimer = 0;
  private invertFlashActive = false;
  private invertTimer = 0;
  private wasPsychedelic = false;
  private deathSlowMoTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  init(): void {
    if (this.initialized) return;

    const camera = this.scene.cameras.main;
    const w = camera.width;
    const h = camera.height;

    this.tintOverlay = this.scene.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0);
    this.tintOverlay.setScrollFactor(0);
    this.tintOverlay.setDepth(DEPTH.VFX_TINT);
    this.tintOverlay.setBlendMode(Phaser.BlendModes.ADD);

    this.vignetteGraphics = this.scene.add.graphics();
    this.vignetteGraphics.setScrollFactor(0);
    this.vignetteGraphics.setDepth(DEPTH.VFX_VIGNETTE);
    this.vignetteGraphics.setAlpha(0);
    this.drawVignette();

    this.flashOverlay = this.scene.add.rectangle(w / 2, h / 2, w, h, 0xffffff, 0);
    this.flashOverlay.setScrollFactor(0);
    this.flashOverlay.setDepth(DEPTH.VFX_FLASH);

    this.borderOverlay = this.scene.add.graphics();
    this.borderOverlay.setScrollFactor(0);
    this.borderOverlay.setDepth(DEPTH.VFX_BORDER);
    this.borderOverlay.setAlpha(0);

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
    this.tintOverlay.setPosition(width / 2, height / 2).setSize(width, height);
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

    const time = this.scene.time.now;
    const delta = this.scene.game.loop.delta;

    this.colorCycleTime += delta * 0.001;
    this.breatheTime += delta * 0.001;

    // Subtle camera tint shift
    if (speedMultiplier >= TINT_FROM) {
      const intensity = Math.min((speedMultiplier - TINT_FROM) / 0.6, 1.0);
      const cycleSpeed = 0.5 + speedMultiplier * 0.05;
      const t = (Math.sin(this.colorCycleTime * cycleSpeed) + 1) / 2;
      const r = Math.floor(Phaser.Math.Linear(80, 20, t));
      const g = Math.floor(Phaser.Math.Linear(20, 80, t));
      const b = Math.floor(Phaser.Math.Linear(120, 40, t));
      const color = Phaser.Display.Color.GetColor(r, g, b);
      this.tintOverlay.setFillStyle(color, intensity * 0.2);
    } else {
      this.tintOverlay.setFillStyle(0x000000, 0);
    }

    // Background "breathes"
    if (speedMultiplier >= BREATHE_FROM) {
      const breatheIntensity = Math.min((speedMultiplier - BREATHE_FROM) / (MAX_SPEED - BREATHE_FROM), 1.0);
      const breatheAmount = Math.sin(this.breatheTime * 2) * 0.08 * breatheIntensity;
      this.scene.data.set('breatheFactor', 1.0 + breatheAmount);
    } else {
      this.scene.data.set('breatheFactor', 1.0);
    }

    // Vignette effect
    if (speedMultiplier >= VIGNETTE_FROM) {
      const vignetteAlpha = Math.min((speedMultiplier - VIGNETTE_FROM) / (MAX_SPEED - VIGNETTE_FROM), 1) * 0.7;
      const pulse = Math.sin(this.colorCycleTime * 1.5) * 0.08;
      this.vignetteGraphics.setAlpha(vignetteAlpha + pulse);
    } else {
      this.vignetteGraphics.setAlpha(0);
    }

    // Pulsing edge glow
    if (speedMultiplier >= EDGE_FROM) {
      const edgeIntensity = Math.min((speedMultiplier - EDGE_FROM) / (MAX_SPEED - EDGE_FROM), 1) * 0.6;
      const edgePulse = (Math.sin(this.colorCycleTime * 3) + 1) / 2;
      const edgeAlpha = edgeIntensity * edgePulse;

      this.borderOverlay.clear();
      const edgeColor = speedMultiplier >= GLITCH_FROM ? 0xff0000 : speedMultiplier >= INVERT_FROM ? 0xff6600 : 0xff00ff;
      this.borderOverlay.lineStyle(3, edgeColor, edgeAlpha);
      this.borderOverlay.strokeRect(1, 1, this.scene.cameras.main.width - 2, this.scene.cameras.main.height - 2);
      this.borderOverlay.setAlpha(1);
    } else {
      this.borderOverlay.clear();
    }

    // Color inversion flashes
    if (speedMultiplier >= INVERT_FROM) {
      this.invertTimer += delta;
      const invertInterval = Math.max(3200 - (speedMultiplier - INVERT_FROM) * 2000, 1000);

      if (!this.invertFlashActive && this.invertTimer >= invertInterval) {
        this.invertTimer = 0;
        this.invertFlashActive = true;

        this.flashOverlay.setFillStyle(0xffffff, 0.5);
        this.flashOverlay.setBlendMode(Phaser.BlendModes.DIFFERENCE);

        this.scene.time.delayedCall(80, () => {
          this.invertFlashActive = false;
          this.flashOverlay.setFillStyle(0xffffff, 0);
          this.flashOverlay.setBlendMode(Phaser.BlendModes.NORMAL);
        });
      }
    }

    // Reality breaks
    if (speedMultiplier >= GLITCH_FROM) {
      this.glitchTimer += delta;
      const glitchInterval = Math.max(1900 - (speedMultiplier - GLITCH_FROM) * 3000, 600);

      if (this.glitchTimer >= glitchInterval) {
        this.glitchTimer = 0;

        const jitterX = (Math.random() - 0.5) * 5;
        const jitterY = (Math.random() - 0.5) * 3;
        const camera = this.scene.cameras.main;

        camera.setFollowOffset(
          camera.followOffset.x + jitterX,
          camera.followOffset.y + jitterY,
        );

        this.scene.time.delayedCall(80, () => {
          camera.setFollowOffset(
            camera.followOffset.x - jitterX,
            camera.followOffset.y - jitterY,
          );
        });

        camera.shake(120, 0.004);
      }
    }

    // Full psychedelic mode
    if (speedMultiplier >= PSYCHEDELIC_FROM) {
      const rapidCycle = this.colorCycleTime * 5;
      const r = Math.floor((Math.sin(rapidCycle) + 1) * 127);
      const g = Math.floor((Math.sin(rapidCycle + 2.094) + 1) * 127);
      const b = Math.floor((Math.sin(rapidCycle + 4.189) + 1) * 127);

      this.tintOverlay.setFillStyle(
        Phaser.Display.Color.GetColor(r, g, b),
        0.3,
      );
      this.tintOverlay.setBlendMode(Phaser.BlendModes.ADD);

      const shakeX = Math.sin(time * 0.01) * 2;
      const shakeY = Math.cos(time * 0.013) * 1.5;
      this.scene.cameras.main.setFollowOffset(RUN_FOLLOW_OFFSET_X + shakeX, shakeY);

      const trailAlpha = 0.02 + Math.sin(time * 0.005) * 0.01;
      this.scene.cameras.main.setAlpha(1.0 - trailAlpha);
      this.wasPsychedelic = true;
    } else if (this.wasPsychedelic) {
      this.scene.cameras.main.setFollowOffset(RUN_FOLLOW_OFFSET_X, 0);
      this.scene.cameras.main.setAlpha(1);
      this.wasPsychedelic = false;
    }
  }

  pickupCollectEffect(x: number, y: number): void {
    if (!this.initialized) return;

    this.collectBurst.explode(12, x, y);

    this.flashOverlay.setBlendMode(Phaser.BlendModes.NORMAL);
    this.flashOverlay.setFillStyle(0xffffff, 0.3);
    this.scene.time.delayedCall(50, () => {
      this.flashOverlay.setFillStyle(0xffffff, 0);
    });

    const camera = this.scene.cameras.main;
    this.scene.tweens.add({
      targets: camera,
      zoom: 1.02,
      duration: 80,
      ease: 'Quad.easeOut',
      yoyo: true,
      onComplete: () => { camera.zoom = 1.0; },
    });
  }

  comboLostEffect(comboLost: number): void {
    if (!this.initialized || comboLost <= 0) return;

    const camera = this.scene.cameras.main;

    // Brief red flash
    this.flashOverlay.setBlendMode(Phaser.BlendModes.NORMAL);
    this.flashOverlay.setFillStyle(0xff0000, 0.3);
    this.scene.time.delayedCall(120, () => {
      this.flashOverlay.setFillStyle(0xff0000, 0);
    });

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

    const camera = this.scene.cameras.main;
    camera.shake(500, 0.05);

    this.flashOverlay.setBlendMode(Phaser.BlendModes.NORMAL);
    this.flashOverlay.setFillStyle(0xff0000, 0.5);

    this.scene.tweens.add({
      targets: this.flashOverlay,
      alpha: 0,
      duration: 300,
      onStart: () => { this.flashOverlay.setAlpha(1); },
      onComplete: () => {
        this.flashOverlay.setFillStyle(0xff0000, 0);
        this.flashOverlay.setAlpha(1);
      },
    });

    this.scene.time.timeScale = 0.3;
    this.deathSlowMoTimeout = setTimeout(() => {
      this.scene.time.timeScale = 1.0;
      this.deathSlowMoTimeout = null;
    }, 800);

    this.scene.tweens.add({
      targets: this.tintOverlay,
      alpha: 1,
      duration: 600,
      delay: 200,
      onStart: () => {
        this.tintOverlay.setFillStyle(0x222222, 0.7);
        this.tintOverlay.setBlendMode(Phaser.BlendModes.MULTIPLY);
      },
    });
  }

  destroy(): void {
    if (!this.initialized) return;
    if (this.deathSlowMoTimeout !== null) {
      clearTimeout(this.deathSlowMoTimeout);
      this.deathSlowMoTimeout = null;
    }
    this.tintOverlay.destroy();
    this.vignetteGraphics.destroy();
    this.flashOverlay.destroy();
    this.borderOverlay.destroy();
    this.collectBurst.destroy();
    this.initialized = false;
  }
}
