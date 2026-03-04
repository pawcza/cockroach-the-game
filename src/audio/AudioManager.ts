import Phaser from 'phaser';

export class AudioManager {
  private scene: Phaser.Scene;
  private bgm: Phaser.Sound.BaseSound | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  startBGM(): void {
    if (this.bgm) {
      this.bgm.destroy();
    }
    this.bgm = this.scene.sound.add('bgm', { volume: 0.5, loop: true });
    this.bgm.play();
  }

  stopBGM(): void {
    if (this.bgm) {
      this.bgm.stop();
      this.bgm.destroy();
      this.bgm = null;
    }
  }

  playJump(): void {
    this.scene.sound.play('jump', { volume: 0.6 });
  }

  playApple(): void {
    this.scene.sound.play('apple', { volume: 0.7 });
  }

  playDeath(): void {
    this.stopBGM();
    this.scene.sound.play('death', { volume: 0.8 });
  }

  playFloorSwitch(): void {
    this.scene.sound.play('floor-switch', { volume: 0.4 });
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
