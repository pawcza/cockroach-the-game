/**
 * Moves the run between levels: weather, background crossfade, music and announcement. Past the Eksterminator each
 * endless level wears the look and music of a story level (levels.ts endlessLook, by the run's look seed). A level that starts where a boss
 * waits (Hala Targowa with Pani Lodzia, the Baltic with DJ Bigos, Żubrówka with Zlewiatan) arrives only once that boss
 * is beaten: the fight is fought in the old level, and the new one comes after the reward beat, as the reward. The
 * floor ahead follows the same cap (levelCap), so nothing of the next level shows before the boss falls.
 */
import Phaser from 'phaser';
import { AudioManager } from '../audio/AudioManager';
import { COCKROACH_START_X } from '../config/constants';
import { getLevelForDistance, LevelConfig, levelBefore, levelConfig, lookLevel } from '../config/levels';
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
  /** What decides the endless levels' looks (levels.ts endlessLook): the run's seed, or a solo run's own. */
  private lookSeed: number;
  private weather: WeatherSystem;
  /** Where the next boss still to be beaten waits, in metres, as of the last update (Infinity: none). */
  private gate = Infinity;
  private nextBossAt: () => number;
  private levelReady: (level: number) => boolean;
  /** The level whose look is showing: behind the run's level while that level's images are still loading. */
  private shownLevel = 1;

  constructor(
    scene: Phaser.Scene,
    run: RunState,
    background: ParallaxBackground,
    audio: AudioManager,
    hud: GameHUD,
    seed: number | null,
    /** Where the next boss still to be beaten waits, in metres; Infinity when none is left. */
    nextBossAt: () => number,
    /** Whether a story level's images are in whole (src/config/packs.ts level-N): its look switches on them. */
    levelReady: (level: number) => boolean,
    lookSeed = 0,
  ) {
    this.lookSeed = lookSeed;
    this.levelReady = levelReady;
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
    return this.gate === Infinity ? Infinity : levelBefore(Infinity, this.gate).level;
  }

  /**
   * The run's level is game state (speed, score, records, what the HUD says): it follows distance and the boss gates at
   * once, whatever has loaded. Only its look and sound follow when they are in: the look in present(), the music as
   * its file lands (AudioManager), the last level's playing on until then.
   */
  update(distance: number): void {
    this.gate = this.nextBossAt();
    const config = levelBefore(distance, this.gate, this.lookSeed);
    if (config.level !== this.run.currentLevel) {
      this.run.currentLevel = config.level;
      this.audio.switchBGM(config.bgmKey, undefined, true);
    }
    this.present();
    this.run.feats.observe(this.run.currentLevel, this.run.abilities.canShootInRun);
  }

  /**
   * A run that starts in this level (from a checkpoint): its look and weather from the first frame. Its assets are in:
   * GameScene waits for them before building such a run.
   */
  startIn(config: LevelConfig): void {
    this.background.showLevel(config);
    this.weather.setWeather(rollLevelWeather(config.weatherChances, this.seed, config.level));
    this.run.currentLevel = config.level;
    this.shownLevel = config.level;
  }

  /** The run's music: now if it is in, otherwise as soon as it arrives. */
  playMusic(key: string): void {
    this.audio.startBGM(key);
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

  /**
   * The level's look catches up with its state: the background crossfades, the weather and the announcement come, once
   * its images are in (a level's textures arrive a frame apart, its ledge segments once all are in); until then the
   * last level's look stays. Its music joins whenever it arrives, on its own: it never holds the look.
   */
  private present(): void {
    const level = this.run.currentLevel;
    if (level === this.shownLevel) return;
    const config = levelConfig(level, this.lookSeed);
    if (!this.levelReady(lookLevel(config))) return;
    this.shownLevel = level;
    playLevelGlitch(this.scene);
    this.audio.glitchBGM();
    this.weather.setWeather(rollLevelWeather(config.weatherChances, this.seed, config.level));
    this.background.crossfadeTo(config);
    if (!this.run.isDead) this.hud.showLevelAnnouncement(config);
  }
}
