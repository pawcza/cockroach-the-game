/** Moves the run between levels: weather, background crossfade, music and announcement. */
import Phaser from 'phaser';
import { AudioManager } from '../audio/AudioManager';
import { COCKROACH_START_X } from '../config/constants';
import { getLevelForDistance, LevelConfig } from '../config/levels';
import { playLevelGlitch } from '../effects/LevelTransitionFX';
import { GameHUD } from '../ui/GameHUD';
import { ParallaxBackground } from './ParallaxBackground';
import { RunState } from './RunState';
import { rollLevelWeather } from './rollLevelWeather';
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
  private seed: number | null;
  private weather: WeatherSystem;

  constructor(
    scene: Phaser.Scene,
    run: RunState,
    background: ParallaxBackground,
    audio: AudioManager,
    hud: GameHUD,
    seed: number | null,
  ) {
    this.scene = scene;
    this.run = run;
    this.background = background;
    this.audio = audio;
    this.hud = hud;
    this.seed = seed;
    this.weather = new WeatherSystem(scene);
    const first = getLevelForDistance(0);
    this.weather.setWeather(rollLevelWeather(first.weatherChances, seed, first.level));
  }

  update(distance: number): void {
    const config = getLevelForDistance(distance);
    if (config.level !== this.run.currentLevel && this.switchLevel(config)) {
      this.run.currentLevel = config.level;
    }
  }

  setPaused(paused: boolean): void {
    this.weather.setPaused(paused);
  }

  resize(): void {
    this.weather.resize();
  }

  destroy(): void {
    this.weather.destroy();
  }

  /** False while the level's assets are still downloading; update() tries again next frame. */
  private switchLevel(config: LevelConfig): boolean {
    if (!this.scene.textures.exists(`lv${config.level}-sky`)) {
      if (this.scene.cache.audio.exists(config.bgmKey)) {
        this.audio.switchBGM(config.bgmKey);
      }
      return false;
    }

    playLevelGlitch(this.scene);
    this.audio.glitchBGM();

    this.weather.setWeather(rollLevelWeather(config.weatherChances, this.seed, config.level));
    this.background.crossfadeTo(config);

    this.audio.switchBGM(config.bgmKey);
    if (!this.run.isDead) {
      this.hud.showLevelAnnouncement(config);
    }
    return true;
  }
}
