import Phaser from 'phaser';

export class GameClock {
  private scene: Phaser.Scene;
  private wallClockStart = 0;
  private pausedDuration = 0;
  private pauseStart = 0;
  private _isPaused = false;
  private _isStarted = false;
  private timers: Phaser.Time.TimerEvent[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  get activePlayTime(): number {
    if (!this._isStarted) return 0;
    if (this._isPaused) return this.pauseStart - this.wallClockStart - this.pausedDuration;
    return Date.now() - this.wallClockStart - this.pausedDuration;
  }

  get isStarted(): boolean { return this._isStarted; }
  get isPaused(): boolean { return this._isPaused; }

  start(): void {
    this.wallClockStart = Date.now();
    this.pausedDuration = 0;
    this._isPaused = false;
    this._isStarted = true;
  }

  pause(): void {
    if (this._isPaused || !this._isStarted) return;
    this._isPaused = true;
    this.pauseStart = Date.now();
  }

  resume(): void {
    if (!this._isPaused) return;
    this.pausedDuration += Date.now() - this.pauseStart;
    this._isPaused = false;
  }

  delay(ms: number, fn: () => void): Phaser.Time.TimerEvent {
    const timer = this.scene.time.delayedCall(ms, fn);
    this.timers.push(timer);
    return timer;
  }

  repeat(ms: number, fn: () => void): Phaser.Time.TimerEvent {
    const timer = this.scene.time.addEvent({ delay: ms, callback: fn, loop: true });
    this.timers.push(timer);
    return timer;
  }

  destroy(): void {
    for (const timer of this.timers) {
      timer.destroy();
    }
    this.timers = [];
    this._isStarted = false;
  }
}
