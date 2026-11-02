/** Moves the run between levels: weather, background crossfade, music and announcement. */
import Phaser from 'phaser';
import { AudioManager } from '../audio/AudioManager';
import { COCKROACH_START_X } from '../config/constants';
import { getLevelForDistance, LevelConfig } from '../config/levels';
import { playLevelGlitch } from '../effects/LevelTransitionFX';
import { SeededRNG } from '../multiplayer/SeededRNG';
import { GameHUD } from '../ui/GameHUD';
import { ParallaxBackground } from './ParallaxBackground';
import { RunState } from './RunState';
import { WeatherSystem } from './WeatherSystem';

export function distanceAt(x: number): number {
  return Math.floor((x - COCKROACH_START_X) / 50);
}

export class LevelProgression {
  private scene: Phaser.Scene;
  private run: RunState;
  private background: ParallaxBackground;
  private audio: AudioManager;
  private hud: GameHUD;
  private rng: SeededRNG | null;
  private weather: WeatherSystem;

  constructor(
    scene: Phaser.Scene,
    run: RunState,
    background: ParallaxBackground,
    audio: AudioManager,
    hud: GameHUD,
    rng: SeededRNG | null,
  ) {
    this.scene = scene;
    this.run = run;
    this.background = background;
    this.audio = audio;
    this.hud = hud;
    this.rng = rng;
    this.weather = new WeatherSystem(scene);
    this.weather.setWeather(WeatherSystem.rollWeather(getLevelForDistance(0).weatherChances, rng));
  }

  update(distance: number): void {
    const config = getLevelForDistance(distance);
    if (config.level !== this.run.currentLevel && this.switchLevel(config)) {
      this.run.currentLevel = config.level;
    }
  }

  /** Applies the current level's backgrounds if they were skipped while deferred assets loaded. */
  applyDeferredLevel(distance: number): void {
    const config = getLevelForDistance(distance);
    if (config.level > 3) {
      this.switchLevel(config);
    }
  }

  destroy(): void {
    this.weather.destroy();
  }

  private switchLevel(config: LevelConfig): boolean {
    // Rolled before the texture check: on seeded runs this draw is part of the shared RNG sequence.
    const weather = WeatherSystem.rollWeather(config.weatherChances, this.rng);

    if (!this.scene.textures.exists(`lv${config.level}-sky`)) {
      if (this.scene.cache.audio.exists(config.bgmKey)) {
        this.audio.switchBGM(config.bgmKey);
      }
      return false;
    }

    playLevelGlitch(this.scene);
    this.audio.glitchBGM();

    this.weather.setWeather(weather);
    this.background.crossfadeTo(config);

    this.audio.switchBGM(config.bgmKey);
    if (!this.run.isDead) {
      this.hud.showLevelAnnouncement(config);
    }
    return true;
  }
}
