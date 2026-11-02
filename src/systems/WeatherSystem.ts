import Phaser from 'phaser';
import { WeatherType } from '../config/levels';
import { DEPTH } from '../config/constants';

export class WeatherSystem {
  private scene: Phaser.Scene;
  private currentWeather: WeatherType = 'clear';
  private fogOverlay: Phaser.GameObjects.Graphics | null = null;
  private rainOverlay: Phaser.GameObjects.Rectangle | null = null;
  private rainTimer: Phaser.Time.TimerEvent | null = null;
  private windDrift = 0;
  private activeRainDrops: Phaser.GameObjects.Rectangle[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  get drift(): number { return this.windDrift; }

  setWeather(weather: WeatherType): void {
    this.clear();
    this.currentWeather = weather;
    if (weather === 'rain') {
      this.startRain();
      const cam = this.scene.cameras.main;
      this.rainOverlay = this.scene.add.rectangle(cam.width / 2, cam.height / 2, cam.width, cam.height, 0x000022, 0.08)
        .setScrollFactor(0).setDepth(DEPTH.VFX_VIGNETTE - 1);
    }
    if (weather === 'fog') this.startFog();
    if (weather === 'wind') this.startWind();
  }

  private startRain(): void {
    this.rainTimer = this.scene.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        if (this.currentWeather !== 'rain') return;
        if (this.scene.physics.world.isPaused) return;
        const cam = this.scene.cameras.main;
        const x = Math.random() * cam.width;
        const y = -10;
        const width = Math.random() < 0.5 ? 1 : 2;
        const alpha = 0.3 + Math.random() * 0.3;
        const color = Math.random() < 0.6 ? 0x8888cc : 0xaaaadd;
        const drop = this.scene.add.rectangle(x, y, width, Phaser.Math.Between(8, 16), color, alpha)
          .setScrollFactor(0).setDepth(DEPTH.VFX_VIGNETTE);
        this.activeRainDrops.push(drop);
        this.scene.tweens.add({
          targets: drop,
          x: x - 30,
          y: cam.height + 20,
          duration: Phaser.Math.Between(400, 800),
          onComplete: () => {
            const idx = this.activeRainDrops.indexOf(drop);
            if (idx !== -1) this.activeRainDrops.splice(idx, 1);
            drop.destroy();
          },
        });
      },
    });
  }

  private startFog(): void {
    const cam = this.scene.cameras.main;
    this.fogOverlay = this.scene.add.graphics()
      .setScrollFactor(0).setDepth(DEPTH.VFX_VIGNETTE);
    const fogWidth = cam.width * 0.4;
    for (let i = 0; i < 20; i++) {
      const alpha = (i / 20) * 0.5;
      const x = cam.width - fogWidth + (fogWidth / 20) * i;
      this.fogOverlay.fillStyle(0x222233, alpha);
      this.fogOverlay.fillRect(x, 0, fogWidth / 20, cam.height);
    }
    this.scene.tweens.add({
      targets: this.fogOverlay,
      alpha: { from: 0.7, to: 1 },
      duration: 3000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private startWind(): void {
    this.windDrift = -30;
  }

  clear(): void {
    this.currentWeather = 'clear';
    this.windDrift = 0;
    if (this.fogOverlay) {
      this.scene.tweens.killTweensOf(this.fogOverlay);
      this.fogOverlay.destroy();
      this.fogOverlay = null;
    }
    if (this.rainTimer) {
      this.rainTimer.destroy();
      this.rainTimer = null;
    }
    for (const drop of this.activeRainDrops) {
      this.scene.tweens.killTweensOf(drop);
      drop.destroy();
    }
    this.activeRainDrops = [];
    if (this.rainOverlay) {
      this.rainOverlay.destroy();
      this.rainOverlay = null;
    }
  }

  destroy(): void {
    this.clear();
  }
}
