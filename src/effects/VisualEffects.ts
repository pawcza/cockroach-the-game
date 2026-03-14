import Phaser from 'phaser';
import { COLORS, DEPTH } from '../config/constants';
import { burstParticles } from '../utils/TweenPatterns';
import { popupStyle } from '../utils/TextStyles';

export class VisualEffects {
  private scene: Phaser.Scene;

  private tintOverlay!: Phaser.GameObjects.Rectangle;
  private vignetteGraphics!: Phaser.GameObjects.Graphics;
  private flashOverlay!: Phaser.GameObjects.Rectangle;
  private borderOverlay!: Phaser.GameObjects.Graphics;

  private initialized = false;
  private colorCycleTime = 0;
  private breatheTime = 0;
  private glitchTimer = 0;
  private invertFlashActive = false;
  private invertTimer = 0;

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

    this.initialized = true;
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

    // ~Lv7 (3.5x): Subtle camera tint shift
    if (speedMultiplier >= 3.5) {
      const intensity = Math.min((speedMultiplier - 3.5) / 3, 1.0);
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

    // ~Lv7 (4.0x): Background "breathes"
    if (speedMultiplier >= 4.0) {
      const breatheIntensity = Math.min((speedMultiplier - 4.0) / 4, 1.0);
      const breatheAmount = Math.sin(this.breatheTime * 2) * 0.08 * breatheIntensity;
      this.scene.data.set('breatheFactor', 1.0 + breatheAmount);
    } else {
      this.scene.data.set('breatheFactor', 1.0);
    }

    // ~Lv8 (5.0x): Vignette effect
    if (speedMultiplier >= 5.0) {
      const vignetteAlpha = Math.min((speedMultiplier - 5.0) / 6, 0.7);
      const pulse = Math.sin(this.colorCycleTime * 1.5) * 0.08;
      this.vignetteGraphics.setAlpha(vignetteAlpha + pulse);
    } else {
      this.vignetteGraphics.setAlpha(0);
    }

    // ~Lv9 (6.0x): Pulsing edge glow
    if (speedMultiplier >= 6.0) {
      const edgeIntensity = Math.min((speedMultiplier - 6.0) / 5, 0.6);
      const edgePulse = (Math.sin(this.colorCycleTime * 3) + 1) / 2;
      const edgeAlpha = edgeIntensity * edgePulse;

      this.borderOverlay.clear();
      const edgeColor = speedMultiplier >= 12 ? 0xff0000 : speedMultiplier >= 9 ? 0xff6600 : 0xff00ff;
      this.borderOverlay.lineStyle(3, edgeColor, edgeAlpha);
      this.borderOverlay.strokeRect(1, 1, this.scene.cameras.main.width - 2, this.scene.cameras.main.height - 2);
      this.borderOverlay.setAlpha(1);
    }

    // ~Lv9-10 (8.0x): Color inversion flashes
    if (speedMultiplier >= 8.0) {
      this.invertTimer += delta;
      const invertInterval = Math.max(4000 - speedMultiplier * 100, 1000);

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

    // ~Lv10+ (12.0x): Reality breaks
    if (speedMultiplier >= 12.0) {
      this.glitchTimer += delta;
      const glitchInterval = Math.max(2500 - speedMultiplier * 50, 600);

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

        camera.shake(120, 0.004 * Math.min(speedMultiplier / 12, 1.5));
      }
    }

    // 20.0x+: Full psychedelic mode
    if (speedMultiplier >= 20.0) {
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
      this.scene.cameras.main.setFollowOffset(shakeX, shakeY);

      const trailAlpha = 0.02 + Math.sin(time * 0.005) * 0.01;
      this.scene.cameras.main.setAlpha(1.0 - trailAlpha);
    }
  }

  appleCollectEffect(x: number, y: number): void {
    if (!this.initialized) return;

    burstParticles(this.scene, x, y, COLORS.COLLECT, 12, {
      radius: 3,
      speed: 110,
      duration: 500,
      depth: DEPTH.VFX_TEXT,
    });

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
    this.scene.time.delayedCall(800, () => {
      this.scene.time.timeScale = 1.0;
    });

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
    this.tintOverlay.destroy();
    this.vignetteGraphics.destroy();
    this.flashOverlay.destroy();
    this.borderOverlay.destroy();
    this.initialized = false;
  }
}
