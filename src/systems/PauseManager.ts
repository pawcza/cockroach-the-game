import Phaser from 'phaser';
import { DEPTH } from '../config/constants';
import { popupStyle } from '../utils/TextStyles';
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

  toggle(getLastFrameTime: () => number, setLastFrameTime: (t: number) => void): void {
    if (this.isMultiplayer) return;
    if (this._isUnpauseCountdown) return;

    if (!this._isPaused) {
      this._isPaused = true;
      this.scene.physics.pause();
      this.hud.showPauseOverlay();
    } else {
      this._isPaused = false;
      this._isUnpauseCountdown = true;
      this.hud.hidePauseOverlay();
      this.scene.physics.resume();
      setLastFrameTime(this.scene.time.now);
      this.scene.time.delayedCall(100, () => {
        this._isUnpauseCountdown = false;
      });
    }
  }

  handlePausedInput(keys: Phaser.Input.Keyboard.Key[], escKeyCode: number, onUnpause: () => void): boolean {
    for (const key of keys) {
      if (key && Phaser.Input.Keyboard.JustDown(key) && key.keyCode !== escKeyCode) {
        onUnpause();
        return true;
      }
    }
    return false;
  }
}
