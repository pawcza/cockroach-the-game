import Phaser from 'phaser';
import { GameHUD } from '../ui/GameHUD';

export class PauseManager {
  private scene: Phaser.Scene;
  private hud: GameHUD;
  private isMultiplayer: boolean;

  private _isPaused = false;
  private _isUnpauseCountdown = false;
  private unpauseCountdownStart = 0;
  private unpauseCountdownLastShown = -1;

  get isPaused(): boolean { return this._isPaused; }
  get isUnpauseCountdown(): boolean { return this._isUnpauseCountdown; }

  constructor(scene: Phaser.Scene, hud: GameHUD, isMultiplayer: boolean) {
    this.scene = scene;
    this.hud = hud;
    this.isMultiplayer = isMultiplayer;
  }

  togglePause(onResumeTime: () => void): void {
    if (this.isMultiplayer) return;
    if (this._isUnpauseCountdown) return;

    if (!this._isPaused) {
      this._isPaused = true;
      this.scene.physics.pause();
      this.hud.showPauseOverlay();
    } else {
      // Resume with a brief grace period to absorb the unpause input
      this._isPaused = false;
      this._isUnpauseCountdown = true; // acts as input guard for one frame
      this.hud.hidePauseOverlay();
      this.scene.physics.resume();
      onResumeTime();
      this.scene.time.delayedCall(100, () => {
        this._isUnpauseCountdown = false;
      });
    }
  }

  updateUnpauseCountdown(): void {
    const elapsed = performance.now() - this.unpauseCountdownStart;
    const steps = ['3', '2', '1', 'JAZDA!'];
    const step = Math.floor(elapsed / 600);

    if (step < steps.length && step > this.unpauseCountdownLastShown) {
      this.unpauseCountdownLastShown = step;
      const text = steps[step];
      const countText = this.scene.add.text(
        this.scene.cameras.main.width / 2, this.scene.cameras.main.height / 2 - 30, text, {
          fontSize: text === 'JAZDA!' ? '24px' : '32px',
          fontFamily: '"Press Start 2P", monospace',
          color: text === 'JAZDA!' ? '#00ff00' : '#ffffff',
          stroke: '#000000',
          strokeThickness: 6,
        },
      );
      countText.setOrigin(0.5).setScrollFactor(0).setDepth(4003);
      this.scene.tweens.add({
        targets: countText,
        scale: { from: 2, to: 0.5 },
        alpha: { from: 1, to: 0 },
        duration: 500,
        ease: 'Power2',
        onComplete: () => countText.destroy(),
      });
    }

    if (elapsed >= steps.length * 600) {
      this._isUnpauseCountdown = false;
      this.scene.physics.resume();
    }
  }

  reset(): void {
    this._isPaused = false;
    this._isUnpauseCountdown = false;
  }
}
