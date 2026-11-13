/**
 * Moves the run between levels: weather, background crossfade, music and announcement. A level that starts where a boss
 * waits (Hala Targowa with Pani Lodzia, the Baltic with DJ Bigos, Żubrówka with Zlewiatan) arrives only once that boss
 * is beaten: the fight is fought in the old level, and the new one comes after the reward beat, as the reward. The
 * floor ahead follows the same cap (levelCap), so nothing of the next level shows before the boss falls.
 */
import Phaser from 'phaser';
import { AudioManager } from '../audio/AudioManager';
import { COCKROACH_START_X } from '../config/constants';
import { getLevelForDistance, LevelConfig, LEVELS, levelBefore } from '../config/levels';
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
  /** Where the next boss still to be beaten waits, in metres, as of the last update (Infinity: none). */
  private gate = Infinity;
  private nextBossAt: () => number;

  constructor(
    scene: Phaser.Scene,
    run: RunState,
    background: ParallaxBackground,
    audio: AudioManager,
    hud: GameHUD,
    seed: number | null,
    /** Where the next boss still to be beaten waits, in metres; Infinity when none is left. */
    nextBossAt: () => number,
  ) {
    this.nextBossAt = nextBossAt;
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

  /**
   * The highest level the course ahead may show: the last one before the next boss to beat. It moves on only here,
   * on a running frame, so after a fight it moves on together with the level itself, after the reward beat.
   */
  get levelCap(): number {
    return this.gate === Infinity ? LEVELS[LEVELS.length - 1].level : levelBefore(Infinity, this.gate).level;
  }

  update(distance: number): void {
    this.gate = this.nextBossAt();
    const config = levelBefore(distance, this.gate);
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
