import Phaser from 'phaser';
import { GameHUD } from '../ui/GameHUD';

export class PauseManager {
  private scene: Phaser.Scene;
  private hud: GameHUD;
  private isMultiplayer: boolean;

  private _isPaused = false;
  private _isUnpauseCountdown = false;
  private pauseStartTime = 0;
  private frozenEmitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];

  get isPaused(): boolean { return this._isPaused; }
  get isUnpauseCountdown(): boolean { return this._isUnpauseCountdown; }

  private onPause: (() => void) | null = null;
  private onResume: ((pausedMs: number) => void) | null = null;

  constructor(scene: Phaser.Scene, hud: GameHUD, isMultiplayer: boolean, onPause?: () => void, onResume?: (pausedMs: number) => void) {
    this.scene = scene;
    this.hud = hud;
    this.isMultiplayer = isMultiplayer;
    this.onPause = onPause ?? null;
    this.onResume = onResume ?? null;
  }

  pause(): void {
    if (this.isMultiplayer) return;
    if (this._isPaused || this._isUnpauseCountdown) return;

    this._isPaused = true;
    this.pauseStartTime = Date.now();
    this.scene.physics.pause();
    this.scene.tweens.pauseAll();
    this.scene.time.paused = true;
    this.scene.anims.pauseAll();
    this.frozenEmitters = this.runningEmitters();
    this.frozenEmitters.forEach(emitter => emitter.pause());
    if (this.onPause) this.onPause();
    this.hud.showPauseOverlay();
  }

  toggle(): void {
    if (this._isPaused) this.resume();
    else this.pause();
  }

  private resume(): void {
    if (this._isUnpauseCountdown) return;

    this._isPaused = false;
    this._isUnpauseCountdown = true;
    const pauseDuration = Date.now() - this.pauseStartTime;
    this.scene.time.paused = false;
    this.hud.hidePauseOverlay();
    this.scene.tweens.resumeAll();
    this.scene.physics.resume();
    this.scene.anims.resumeAll();
    this.frozenEmitters.forEach(emitter => emitter.resume());
    this.frozenEmitters = [];
    if (this.onResume) this.onResume(pauseDuration);
    this.scene.time.delayedCall(100, () => {
      this._isUnpauseCountdown = false;
    });
  }

  /** Emitters don't run on the scene clock, so each has to be held by hand. */
  private runningEmitters(): Phaser.GameObjects.Particles.ParticleEmitter[] {
    return this.scene.children.list.filter(
      (child): child is Phaser.GameObjects.Particles.ParticleEmitter =>
        child instanceof Phaser.GameObjects.Particles.ParticleEmitter && child.active,
    );
  }
}
