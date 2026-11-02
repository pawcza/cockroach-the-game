import Phaser from 'phaser';
import { getMusicVolume, getSfxVolume } from '../utils/Storage';

/** A sound effect's base volume scaled by the player's Efekty setting. */
export function sfxVolume(base: number): number {
  return base * getSfxVolume();
}

export class AudioManager {
  private scene: Phaser.Scene;
  private bgm: Phaser.Sound.BaseSound | null = null;
  private currentBGMKey: string = '';
  private fadeOutTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  private mv(): number { return getMusicVolume(); }

  startBGM(key: string = 'bgm-lv1'): void {
    if (this.bgm) {
      this.bgm.destroy();
    }
    this.currentBGMKey = key;
    this.bgm = this.scene.sound.add(key, { volume: 0.5 * this.mv(), loop: true });
    this.bgm.play();
  }

  switchBGM(newKey: string): void {
    if (this.currentBGMKey === newKey) return;
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

  /** Plays a one-shot sound effect. */
  playSfx(key: string, volume: number): void {
    this.scene.sound.play(key, { volume: sfxVolume(volume) });
  }

  /** Creates a sound effect the caller controls, such as a loop. */
  addSfx(key: string, volume: number, loop = false): Phaser.Sound.BaseSound {
    return this.scene.sound.add(key, { volume: sfxVolume(volume), loop });
  }

  playJump(): void {
    this.scene.sound.play('jump', { volume: sfxVolume(0.6) });
  }

  playApple(): void {
    this.scene.sound.play('apple', { volume: sfxVolume(0.7) });
  }

  playDeath(): void {
    this.stopBGM();
    this.scene.sound.play('death', { volume: sfxVolume(0.8) });
  }

  playFloorSwitch(): void {
    this.scene.sound.play('floor-switch', { volume: sfxVolume(0.4) });
  }

  playDash(): void {
    this.scene.sound.play('dash', { volume: sfxVolume(0.6) });
  }

  playPill(): void {
    this.scene.sound.play('pill-sfx', { volume: sfxVolume(0.8) });
  }

  playComboChime(tier: number): void {
    const rate = 1.0 + tier * 0.15;
    this.scene.sound.play('apple', { volume: sfxVolume(0.4 + tier * 0.05), rate });
  }

  playComboLost(): void {
    this.scene.sound.play('combo-lost', { volume: sfxVolume(0.6) });
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
    this.stopBGM();
  }
}
