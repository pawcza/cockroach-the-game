import Phaser from 'phaser';
import { getMusicVolume, getSfxVolume } from '../utils/Storage';
import { MusicDeck } from './MusicDeck';

/** How many rising pitches the combo tick has. */
const COMBO_TICKS = 8;
/** How long one level's music takes to give way to the next. */
const CROSSFADE_MS = 800;
/** The boss music coming in off the pre-battle loop when the player presses start: quick, so it lands with the press. */
export const BOSS_CROSSFADE_MS = 500;
/** The level music going under the pre-battle loop as the versus splash opens. */
const PRELUDE_IN_MS = 400;
/** A boss's music giving way under his victory stinger. */
const BOSS_OUT_MS = 350;

/** A sound effect's base volume scaled by the player's Efekty setting. */
export function sfxVolume(base: number): number {
  return base * getSfxVolume();
}

/**
 * Base volumes per category, for the sound set built by tools/audio. The files are normalised per category (ui -22
 * LUFS, pickups and obstacles -19, gameplay -17, stingers -16, boss -15.5, big impacts -14, loops -20, ambient -27),
 * so the call sites pick the category and the loudness relationship is already in the files. At the default Efekty
 * of 0.8 these sit about 5 dB over the level music (which plays at 0.5 of its own setting).
 */
export const VOL = {
  ui: 0.8,
  pickup: 0.8,
  /** The combo tick plays on every pickup: well under the pickup it rides on. */
  tick: 0.5,
  gameplay: 0.7,
  obstacle: 0.7,
  stinger: 0.7,
  boss: 0.6,
  big: 0.6,
  loop: 0.6,
  ambient: 1,
} as const;

/** A lane swap is heard at the press: the take-off is the loud cue, the landing (a hop later, and its file is the
 * hotter one) a quiet thud under it. */
const SWAP_PRESS = 1.3;
const SWAP_LAND = 0.25;

/** Plays a one-shot if its file is loaded and does nothing otherwise: a sound never takes a scene down with it. */
export function playSound(scene: Phaser.Scene, key: string, volume: number, rate = 1): void {
  if (!scene.cache.audio.exists(key)) return;
  try {
    scene.sound.play(key, { volume: sfxVolume(volume), rate });
  } catch {
    // An audio context the browser won't give us is no reason to stop the game
  }
}

/** A menu sound: press, hover, back, slider, purchase, error. Any scene can play one; the Efekty setting scales it. */
export function playUi(scene: Phaser.Scene, key: string): void {
  playSound(scene, key, VOL.ui);
}

export class AudioManager {
  private scene: Phaser.Scene;
  private music: MusicDeck<Phaser.Sound.BaseSound>;
  private loops = new Set<Phaser.Sound.BaseSound>();
  /** While the versus splash holds the screen: the pre-battle loop is the music, and other changes wait. */
  private preluding = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.music = new MusicDeck({
      play: (key, level) => {
        const sound = scene.sound.add(key, { volume: level * this.mv(), loop: true });
        sound.play();
        return sound;
      },
      setLevel: (sound, level) => (sound as Phaser.Sound.WebAudioSound).setVolume(level * this.mv()),
      end: (sound) => {
        sound.stop();
        sound.destroy();
      },
      fade: (from, to, onUpdate, onDone, ms = CROSSFADE_MS) => scene.tweens.addCounter({
        from, to, duration: ms,
        onUpdate: (tween) => onUpdate(tween.getValue() ?? to),
        onComplete: onDone,
      }),
      // The hold's fades: the pause stops the scene's tweens and timers, so these run on the browser's clock
      ramp: (from, to, ms, onUpdate, onDone) => {
        const t0 = performance.now();
        const id = setInterval(() => {
          const k = Math.min(1, (performance.now() - t0) / ms);
          onUpdate(from + (to - from) * k);
          if (k >= 1) {
            clearInterval(id);
            onDone();
          }
        }, 16);
        return { stop: () => clearInterval(id) };
      },
      pause: (sound) => { (sound as Phaser.Sound.WebAudioSound).pause(); },
      resume: (sound) => { (sound as Phaser.Sound.WebAudioSound).resume(); },
    });
    // The sound manager outlives the scene: whatever way the run is left, its music and loops go with it
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  private mv(): number { return getMusicVolume(); }

  startBGM(key: string = 'bgm-lv1'): void {
    if (!this.scene.cache.audio.exists(key)) return;
    this.music.start(key);
  }

  /** Crossfades to a track (the level crossfade unless `ms` is given). Waits while the pre-battle loop holds the music. */
  switchBGM(newKey: string, ms?: number): void {
    if (this.preluding) return;
    if (this.music.key === newKey) return;
    if (!this.scene.cache.audio.exists(newKey)) return;
    this.music.switchTo(newKey, ms);
  }

  stopBGM(): void {
    this.preluding = false;
    this.music.stop();
  }

  /** The versus splash opens: the pre-battle loop takes over from the level's music, and stays until endPrelude. */
  beginPrelude(key: string): void {
    if (!this.scene.cache.audio.exists(key)) return;
    this.music.switchTo(key, PRELUDE_IN_MS);
    this.preluding = true;
  }

  /** The player pressed start (the splash wipes): the boss's music comes in off the pre-battle loop, quickly. */
  endPrelude(bossKey: string, levelKey: string): void {
    if (!this.preluding) return;
    this.preluding = false;
    this.switchBGM(this.scene.cache.audio.exists(bossKey) ? bossKey : levelKey, BOSS_CROSSFADE_MS);
  }

  /** The boss is dead: his music fades quickly away under the victory stinger. */
  fadeOutBGM(): void {
    this.preluding = false;
    this.music.fadeOut(BOSS_OUT_MS);
  }

  /** The pause: the music holds where it is, so only the pause menu's crickets sound. */
  holdBGM(): void {
    this.music.hold();
  }

  /** The unpause: the music goes on from where it stopped. */
  releaseBGM(): void {
    this.music.release();
  }

  /**
   * Where the music is in `key` as it is heard now, ms into the file. Null unless `key` is the track playing (not held,
   * not fading out) on Web Audio that is running: a fight on its track's beat reads it to stay on it (boss/beatLock.ts).
   */
  bgmPosition(key: string): number | null {
    const sound = this.playingBGM(key);
    if (!sound) return null;
    return (sound.seek - this.outputLatency()) * 1000;
  }

  /** Moves the track `key` so that what is heard now is `ms` into it; false when it isn't the track playing. */
  seekBGM(key: string, ms: number): boolean {
    const sound = this.playingBGM(key);
    if (!sound) return false;
    const at = ms / 1000 + this.outputLatency();
    sound.setSeek(((at % sound.duration) + sound.duration) % sound.duration);
    return true;
  }

  private playingBGM(key: string): Phaser.Sound.WebAudioSound | null {
    if (this.music.key !== key || this.music.isHeld) return null;
    const sound = this.music.current;
    if (!(sound instanceof Phaser.Sound.WebAudioSound) || !sound.isPlaying || sound.duration <= 0) return null;
    return (this.scene.sound as Phaser.Sound.WebAudioSoundManager).context.state === 'running' ? sound : null;
  }

  /** How far what is heard lags the audio clock, s. */
  private outputLatency(): number {
    const context = (this.scene.sound as Phaser.Sound.WebAudioSoundManager).context;
    return (context.baseLatency ?? 0) + (context.outputLatency ?? 0);
  }

  /** Plays a one-shot sound effect. A key that isn't loaded (yet) is skipped. */
  playSfx(key: string, volume: number, rate = 1): void {
    playSound(this.scene, key, volume, rate);
  }

  /** Creates a sound effect the caller controls, such as a loop. Null if its file isn't loaded. */
  addSfx(key: string, volume: number, loop = false): Phaser.Sound.BaseSound | null {
    if (!this.scene.cache.audio.exists(key)) return null;
    try {
      return this.scene.sound.add(key, { volume: sfxVolume(volume), loop });
    } catch {
      return null;
    }
  }

  /**
   * Starts a looping effect. It runs until `stopLoop`, and is held by `pauseLoops`, ended by `stopLoops` (which a
   * scene's shutdown calls through `destroy`), so no loop is ever left running. Null if its file isn't loaded.
   */
  startLoop(key: string, volume: number): Phaser.Sound.BaseSound | null {
    const sound = this.addSfx(key, volume, true);
    if (!sound) return null;
    this.loops.add(sound);
    sound.play();
    return sound;
  }

  stopLoop(sound: Phaser.Sound.BaseSound | null): void {
    // Already ended with the rest (death, shutdown): nothing left to stop
    if (!sound || !this.loops.delete(sound)) return;
    sound.stop();
    sound.destroy();
  }

  pauseLoops(): void {
    for (const sound of this.loops) if (sound.isPlaying) sound.pause();
  }

  resumeLoops(): void {
    for (const sound of this.loops) if (sound.isPaused) sound.resume();
  }

  stopLoops(): void {
    for (const sound of this.loops) {
      sound.stop();
      sound.destroy();
    }
    this.loops.clear();
  }

  playJump(): void {
    this.playSfx('jump', VOL.gameplay * SWAP_PRESS);
  }

  playHopLand(): void {
    this.playSfx('hop-land', VOL.gameplay * SWAP_LAND);
  }

  playApple(): void {
    this.playSfx('apple', VOL.pickup);
  }

  playDeath(): void {
    this.stopLoops();
    this.stopBGM();
    this.playSfx('death', VOL.gameplay);
  }

  playFloorSwitch(): void {
    this.playSfx('floor-switch', VOL.gameplay * SWAP_PRESS);
  }

  playDash(): void {
    this.playSfx('dash', 0.6);
  }

  playPill(): void {
    this.playSfx('pill-sfx', VOL.pickup);
  }

  /** The tick of a pickup in a combo: one of eight rising pitches by how far the combo has got. */
  playComboTick(combo: number): void {
    this.playSfx(`combo-tick-${Math.min(Math.max(combo, 1), COMBO_TICKS)}`, VOL.tick);
  }

  playComboLost(broken: boolean): void {
    this.playSfx(broken ? 'combo-break' : 'combo-lost', broken ? VOL.stinger : VOL.pickup);
  }

  glitchBGM(): void {
    const bgm = this.music.current;
    if (!bgm || !('setRate' in bgm)) return;
    const sound = bgm as Phaser.Sound.WebAudioSound;
    const originalRate = sound.rate;
    sound.setRate(0.5);
    this.scene.time.delayedCall(150, () => {
      const now = this.music.current;
      if (now && now.isPlaying) {
        (now as Phaser.Sound.WebAudioSound).setRate(originalRate);
      }
    });
  }

  updatePitch(speedMultiplier: number): void {
    const bgm = this.music.current;
    if (!bgm) return;
    const rate = Phaser.Math.Clamp(1 + (speedMultiplier - 1) * 0.3, 0.5, 3.0);
    if ('setRate' in bgm) {
      (bgm as Phaser.Sound.WebAudioSound).setRate(rate);
    }
  }

  destroy(): void {
    this.stopLoops();
    this.stopBGM();
  }
}
