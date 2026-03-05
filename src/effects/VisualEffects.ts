import Phaser from 'phaser';

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

  private static readonly DEPTH_TINT = 990;
  private static readonly DEPTH_VIGNETTE = 991;
  private static readonly DEPTH_FLASH = 995;
  private static readonly DEPTH_BORDER = 993;
  private static readonly DEPTH_TEXT = 996;

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
    this.tintOverlay.setDepth(VisualEffects.DEPTH_TINT);
    this.tintOverlay.setBlendMode(Phaser.BlendModes.ADD);

    this.vignetteGraphics = this.scene.add.graphics();
    this.vignetteGraphics.setScrollFactor(0);
    this.vignetteGraphics.setDepth(VisualEffects.DEPTH_VIGNETTE);
    this.vignetteGraphics.setAlpha(0);
    this.drawVignette();

    this.flashOverlay = this.scene.add.rectangle(w / 2, h / 2, w, h, 0xffffff, 0);
    this.flashOverlay.setScrollFactor(0);
    this.flashOverlay.setDepth(VisualEffects.DEPTH_FLASH);

    this.borderOverlay = this.scene.add.graphics();
    this.borderOverlay.setScrollFactor(0);
    this.borderOverlay.setDepth(VisualEffects.DEPTH_BORDER);
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

    // 1.5x: Subtle camera tint shift
    if (speedMultiplier >= 1.5) {
      const intensity = Math.min((speedMultiplier - 1.5) / 2, 1.0);
      const cycleSpeed = 0.5 + speedMultiplier * 0.1;
      const t = (Math.sin(this.colorCycleTime * cycleSpeed) + 1) / 2;
      const r = Math.floor(Phaser.Math.Linear(80, 20, t));
      const g = Math.floor(Phaser.Math.Linear(20, 80, t));
      const b = Math.floor(Phaser.Math.Linear(120, 40, t));
      const color = Phaser.Display.Color.GetColor(r, g, b);
      this.tintOverlay.setFillStyle(color, intensity * 0.25);
    } else {
      this.tintOverlay.setFillStyle(0x000000, 0);
    }

    // 2.0x: Background "breathes"
    if (speedMultiplier >= 2.0) {
      const breatheIntensity = Math.min((speedMultiplier - 2.0) / 3, 1.0);
      const breatheAmount = Math.sin(this.breatheTime * 2) * 0.1 * breatheIntensity;
      this.scene.data.set('breatheFactor', 1.0 + breatheAmount);
    } else {
      this.scene.data.set('breatheFactor', 1.0);
    }

    // 3.0x: Vignette effect
    if (speedMultiplier >= 3.0) {
      const vignetteAlpha = Math.min((speedMultiplier - 3.0) / 5, 0.8);
      const pulse = Math.sin(this.colorCycleTime * 1.5) * 0.1;
      this.vignetteGraphics.setAlpha(vignetteAlpha + pulse);
    } else {
      this.vignetteGraphics.setAlpha(0);
    }

    // 4.0x: Pulsing edge glow
    if (speedMultiplier >= 4.0) {
      const edgeIntensity = Math.min((speedMultiplier - 4.0) / 4, 0.6);
      const edgePulse = (Math.sin(this.colorCycleTime * 3) + 1) / 2;
      const edgeAlpha = edgeIntensity * edgePulse;

      this.borderOverlay.clear();
      const edgeColor = speedMultiplier >= 10 ? 0xff0000 : speedMultiplier >= 7 ? 0xff6600 : 0xff00ff;
      this.borderOverlay.lineStyle(3, edgeColor, edgeAlpha);
      this.borderOverlay.strokeRect(1, 1, this.scene.cameras.main.width - 2, this.scene.cameras.main.height - 2);
      this.borderOverlay.setAlpha(1);
    }

    // 5.0x: Color inversion flashes
    if (speedMultiplier >= 5.0) {
      this.invertTimer += delta;
      const invertInterval = Math.max(3000 - speedMultiplier * 100, 800);

      if (!this.invertFlashActive && this.invertTimer >= invertInterval) {
        this.invertTimer = 0;
        this.invertFlashActive = true;

        this.flashOverlay.setFillStyle(0xffffff, 0.6);
        this.flashOverlay.setBlendMode(Phaser.BlendModes.DIFFERENCE);

        this.scene.time.delayedCall(100, () => {
          this.invertFlashActive = false;
          this.flashOverlay.setFillStyle(0xffffff, 0);
          this.flashOverlay.setBlendMode(Phaser.BlendModes.NORMAL);
        });
      }
    }

    // 8.0x: Reality breaks
    if (speedMultiplier >= 8.0) {
      this.glitchTimer += delta;
      const glitchInterval = Math.max(2000 - speedMultiplier * 50, 500);

      if (this.glitchTimer >= glitchInterval) {
        this.glitchTimer = 0;

        const jitterX = (Math.random() - 0.5) * 6;
        const jitterY = (Math.random() - 0.5) * 4;
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

        camera.shake(150, 0.005 * Math.min(speedMultiplier / 10, 1.5));
      }
    }

    // 15.0x+: Full psychedelic mode
    if (speedMultiplier >= 15.0) {
      const rapidCycle = this.colorCycleTime * 5;
      const r = Math.floor((Math.sin(rapidCycle) + 1) * 127);
      const g = Math.floor((Math.sin(rapidCycle + 2.094) + 1) * 127);
      const b = Math.floor((Math.sin(rapidCycle + 4.189) + 1) * 127);

      this.tintOverlay.setFillStyle(
        Phaser.Display.Color.GetColor(r, g, b),
        0.35,
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

    const colors = [0xffd700, 0xff6b35, 0xff1493, 0x00ff88, 0xffff00];

    for (let i = 0; i < 12; i++) {
      const color = colors[i % colors.length];
      const particle = this.scene.add.circle(x, y, 3, color, 1);
      particle.setDepth(VisualEffects.DEPTH_TEXT);

      const angle = (i / 12) * Math.PI * 2;
      const speed = 80 + Math.random() * 60;
      const targetX = x + Math.cos(angle) * speed;
      const targetY = y + Math.sin(angle) * speed;

      this.scene.tweens.add({
        targets: particle,
        x: targetX,
        y: targetY,
        alpha: 0,
        scale: 0.1,
        duration: 400 + Math.random() * 200,
        ease: 'Power2',
        onComplete: () => particle.destroy(),
      });
    }

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

  speedMilestoneEffect(multiplier: number): void {
    if (!this.initialized) return;

    const camera = this.scene.cameras.main;
    const w = camera.width;
    const h = camera.height;

    let label: string;
    if (multiplier >= 15) {
      label = `${Math.floor(multiplier)}X ZAPOMNIENIE KURCZĘ!`;
    } else if (multiplier >= 10) {
      label = `${Math.floor(multiplier)}X BURDEL NA KÓŁKACH`;
    } else if (multiplier >= 5) {
      label = `${Math.floor(multiplier)}X SZALEŃSTWO TOTALNE!`;
    } else {
      label = `${Math.floor(multiplier)}X JAZDA BEZ TRZYMANKI!`;
    }

    const text = this.scene.add.text(w / 2, h / 2, label, {
      fontSize: '48px',
      fontFamily: 'Georgia, serif',
      color: '#ff00ff',
      stroke: '#000000',
      strokeThickness: 6,
      shadow: {
        offsetX: 2,
        offsetY: 2,
        color: '#ff6600',
        blur: 8,
        fill: true,
        stroke: true,
      },
    });
    text.setOrigin(0.5);
    text.setScrollFactor(0);
    text.setDepth(VisualEffects.DEPTH_TEXT);
    text.setScale(0.5);
    text.setAlpha(0);

    this.scene.tweens.add({
      targets: text,
      scale: 1.2,
      alpha: 1,
      duration: 300,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: text,
          scale: 1.5,
          alpha: 0,
          duration: 500,
          ease: 'Power2',
          delay: 400,
          onComplete: () => text.destroy(),
        });
      },
    });

    const neonColors = [0xff00ff, 0x00ffff, 0xff6600, 0x00ff00, 0xff0055];
    const neonColor = neonColors[Math.floor(multiplier) % neonColors.length];

    this.borderOverlay.clear();
    this.borderOverlay.lineStyle(4, neonColor, 1);
    this.borderOverlay.strokeRect(2, 2, w - 4, h - 4);
    this.borderOverlay.lineStyle(2, neonColor, 0.6);
    this.borderOverlay.strokeRect(6, 6, w - 12, h - 12);
    this.borderOverlay.setAlpha(1);

    this.scene.tweens.add({
      targets: this.borderOverlay,
      alpha: 0,
      duration: 800,
      ease: 'Power2',
    });

    this.scene.tweens.add({
      targets: camera,
      zoom: 0.95,
      duration: 200,
      ease: 'Quad.easeOut',
      yoyo: true,
      onComplete: () => { camera.zoom = 1.0; },
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
