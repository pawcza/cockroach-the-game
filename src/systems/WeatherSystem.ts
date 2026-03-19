import Phaser from 'phaser';
import { WeatherType } from '../config/levels';
import { SeededRNG } from '../multiplayer/SeededRNG';
import { DEPTH } from '../config/constants';

export class WeatherSystem {
  private scene: Phaser.Scene;
  private currentWeather: WeatherType = 'clear';
  private fogOverlay: Phaser.GameObjects.Graphics | null = null;
  private rainTimer: Phaser.Time.TimerEvent | null = null;
  private windDrift = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  get drift(): number { return this.windDrift; }

  setWeather(weather: WeatherType): void {
    this.clear();
    this.currentWeather = weather;
    if (weather === 'rain') this.startRain();
    if (weather === 'fog') this.startFog();
    if (weather === 'wind') this.startWind();
  }

  static rollWeather(
    chances: { type: WeatherType; weight: number }[] | undefined,
    rng: SeededRNG | null,
  ): WeatherType {
    if (!chances || chances.length === 0) return 'clear';
    const total = chances.reduce((s, c) => s + c.weight, 0);
    const roll = (rng?.next() ?? Math.random()) * total;
    let acc = 0;
    for (const c of chances) {
      acc += c.weight;
      if (roll < acc) return c.type;
    }
    return 'clear';
  }

  private startRain(): void {
    this.rainTimer = this.scene.time.addEvent({
      delay: 30,
      loop: true,
      callback: () => {
        if (this.currentWeather !== 'rain') return;
        const cam = this.scene.cameras.main;
        const x = cam.scrollX + Math.random() * cam.width;
        const y = cam.scrollY - 10;
        const drop = this.scene.add.rectangle(x, y, 1, Phaser.Math.Between(8, 16), 0x8888cc, 0.3)
          .setDepth(DEPTH.VFX_VIGNETTE);
        this.scene.tweens.add({
          targets: drop,
          x: x - 30,
          y: y + cam.height + 20,
          duration: Phaser.Math.Between(300, 600),
          onComplete: () => drop.destroy(),
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
  }

  destroy(): void {
    this.clear();
  }
}
