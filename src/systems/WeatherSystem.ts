import Phaser from 'phaser';
import { WeatherType } from '../config/levels';
import { DEPTH } from '../config/constants';

const FOG_STEPS = 20;
const SPECK_TEXTURE = 'weather-speck';

export class WeatherSystem {
  private scene: Phaser.Scene;
  private fogOverlay: Phaser.GameObjects.Graphics | null = null;
  private rainOverlay: Phaser.GameObjects.Rectangle | null = null;
  private emitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private paused = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    if (!scene.textures.exists(SPECK_TEXTURE)) {
      scene.make.graphics({}, false).fillStyle(0xffffff).fillRect(0, 0, 1, 1)
        .generateTexture(SPECK_TEXTURE, 1, 1).destroy();
    }
  }

  setWeather(weather: WeatherType): void {
    this.clear();
    if (weather === 'rain') {
      this.startRain();
      const cam = this.scene.cameras.main;
      this.rainOverlay = this.scene.add.rectangle(cam.width / 2, cam.height / 2, cam.width, cam.height, 0x000022, 0.08)
        .setScrollFactor(0).setDepth(DEPTH.VFX_VIGNETTE - 1);
    }
    if (weather === 'fog') this.startFog();
    if (weather === 'wind') this.startWind();
  }

  /** Emitters run on the scene's update, which a pause leaves running. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.emitter?.pause();
    else this.emitter?.resume();
  }

  resize(): void {
    const cam = this.scene.cameras.main;
    this.rainOverlay?.setPosition(cam.width / 2, cam.height / 2).setSize(cam.width, cam.height);
    if (this.fogOverlay) this.drawFog(this.fogOverlay);
  }

  private startRain(): void {
    const cam = this.scene.cameras.main;
    this.startEmitter({
      x: { onEmit: () => Math.random() * cam.width },
      y: -10,
      speedX: { min: -75, max: -38 },
      speedY: { min: 660, max: 1320 },
      lifespan: 850,
      frequency: 16,
      scaleX: { min: 1, max: 2 },
      scaleY: { min: 8, max: 16 },
      alpha: { min: 0.3, max: 0.6 },
      tint: [0x8888cc, 0x8888cc, 0xaaaadd],
    });
  }

  private startWind(): void {
    const cam = this.scene.cameras.main;
    this.startEmitter({
      x: { onEmit: () => cam.width + 40 },
      y: { onEmit: () => Math.random() * cam.height },
      speedX: { min: -1400, max: -900 },
      speedY: { min: -30, max: 30 },
      lifespan: 1400,
      frequency: 90,
      scaleX: { min: 30, max: 90 },
      scaleY: 1,
      alpha: { min: 0.08, max: 0.2 },
    });
  }

  private startEmitter(config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig): void {
    this.emitter = this.scene.add.particles(0, 0, SPECK_TEXTURE, config)
      .setScrollFactor(0).setDepth(DEPTH.VFX_VIGNETTE);
    if (this.paused) this.emitter.pause();
  }

  private startFog(): void {
    this.fogOverlay = this.scene.add.graphics()
      .setScrollFactor(0).setDepth(DEPTH.VFX_VIGNETTE);
    this.drawFog(this.fogOverlay);
    this.scene.tweens.add({
      targets: this.fogOverlay,
      alpha: { from: 0.7, to: 1 },
      duration: 3000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private drawFog(fog: Phaser.GameObjects.Graphics): void {
    const cam = this.scene.cameras.main;
    const fogWidth = cam.width * 0.4;
    fog.clear();
    for (let i = 0; i < FOG_STEPS; i++) {
      fog.fillStyle(0x222233, (i / FOG_STEPS) * 0.5);
      fog.fillRect(cam.width - fogWidth + (fogWidth / FOG_STEPS) * i, 0, fogWidth / FOG_STEPS, cam.height);
    }
  }

  clear(): void {
    if (this.fogOverlay) {
      this.scene.tweens.killTweensOf(this.fogOverlay);
      this.fogOverlay.destroy();
      this.fogOverlay = null;
    }
    this.emitter?.destroy();
    this.emitter = null;
    if (this.rainOverlay) {
      this.rainOverlay.destroy();
      this.rainOverlay = null;
    }
  }

  destroy(): void {
    this.clear();
  }
}
