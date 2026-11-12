import Phaser from 'phaser';
import { getMusicVolume, getSfxVolume } from '../utils/Storage';

/** How many rising pitches the combo tick has. */
const COMBO_TICKS = 8;

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
  private bgm: Phaser.Sound.BaseSound | null = null;
  private currentBGMKey: string = '';
  private fadeOutTween: Phaser.Tweens.Tween | null = null;
  private loops = new Set<Phaser.Sound.BaseSound>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.stopLoops());
  }

  private mv(): number { return getMusicVolume(); }

  startBGM(key: string = 'bgm-lv1'): void {
    if (!this.scene.cache.audio.exists(key)) return;
    if (this.bgm) {
      this.bgm.destroy();
    }
    this.currentBGMKey = key;
    this.bgm = this.scene.sound.add(key, { volume: 0.5 * this.mv(), loop: true });
    this.bgm.play();
  }

  switchBGM(newKey: string): void {
    if (this.currentBGMKey === newKey) return;
    if (!this.scene.cache.audio.exists(newKey)) return;
    this.currentBGMKey = newKey;

    if (this.fadeOutTween) {
      const tweenTargetBgm = this.bgm;
      this.fadeOutTween.stop();
      this.fadeOutTween = null;
      if (tweenTargetBgm) {
        tweenTargetBgm.stop();
        tweenTargetBgm.destroy();
      }
    }

    const oldBgm = this.bgm;
    if (oldBgm) {
      this.fadeOutTween = this.scene.tweens.addCounter({
        from: 50,
        to: 0,
        duration: 800,
        onUpdate: (tween) => {
          if (oldBgm && oldBgm.isPlaying) {
            (oldBgm as Phaser.Sound.WebAudioSound).setVolume((tween.getValue() ?? 0) / 100 * this.mv());
          }
        },
        onComplete: () => {
          oldBgm.stop();
          oldBgm.destroy();
          this.fadeOutTween = null;
        },
      });
    }

    this.bgm = this.scene.sound.add(newKey, { volume: 0, loop: true });
    this.bgm.play();

    this.scene.tweens.addCounter({
      from: 0,
      to: 50,
      duration: 800,
      onUpdate: (tween) => {
        if (this.bgm && this.bgm.isPlaying) {
          (this.bgm as Phaser.Sound.WebAudioSound).setVolume((tween.getValue() ?? 0) / 100 * this.mv());
        }
      },
    });
  }

  stopBGM(): void {
    if (this.bgm) {
      this.bgm.stop();
      this.bgm.destroy();
      this.bgm = null;
    }
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
    this.playSfx('jump', VOL.gameplay);
  }

  playHopLand(): void {
    this.playSfx('hop-land', VOL.gameplay * 0.7);
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
    this.playSfx('floor-switch', VOL.gameplay);
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
    if (!this.bgm || !('setRate' in this.bgm)) return;
    const sound = this.bgm as Phaser.Sound.WebAudioSound;
    const originalRate = sound.rate;
    sound.setRate(0.5);
    this.scene.time.delayedCall(150, () => {
      if (this.bgm && this.bgm.isPlaying) {
        (this.bgm as Phaser.Sound.WebAudioSound).setRate(originalRate);
      }
    });
  }

  updatePitch(speedMultiplier: number): void {
    if (!this.bgm) return;
    const rate = Phaser.Math.Clamp(1 + (speedMultiplier - 1) * 0.3, 0.5, 3.0);
    if ('setRate' in this.bgm) {
      (this.bgm as Phaser.Sound.WebAudioSound).setRate(rate);
    }
  }

  destroy(): void {
    this.stopLoops();
    this.stopBGM();
  }
}
