import Phaser from 'phaser';

// Client-side player colors (same as server but avoids importing server code)
export const MP_PLAYER_COLORS = [
  0xff0000, 0x00ff00, 0x0000ff, 0xffff00,
  0xff00ff, 0x00ffff, 0xff6600, 0x6600ff,
  0x00ff66, 0xff0066, 0x66ff00, 0x0066ff,
  0xff3399, 0x33ff99, 0x9933ff, 0x99ff33,
];

export class GhostPlayer {
  readonly id: string;
  readonly name: string;
  readonly color: number;
  readonly sprite: Phaser.GameObjects.Sprite;

  private scene: Phaser.Scene;
  private targetX: number;
  private targetLane: string = 'bottom';
  private _alive = true;
  private _score = 0;
  private _stats: Record<string, unknown> = {};

  // Dead reckoning
  private lastX: number;
  private velocity = 0; // pixels per ms
  private lastUpdateTime = 0;
  private timeSinceUpdate = 0;

  // Animation
  private runFrames = ['cockroach-idle', 'cockroach-running'];
  private animFrame = 0;
  private animTimer = 0;

  get alive(): boolean { return this._alive; }
  get score(): number { return this._score; }
  get stats(): Record<string, unknown> { return this._stats; }
  get lane(): string { return this.targetLane; }

  constructor(scene: Phaser.Scene, id: string, name: string, colorIndex: number, startX: number, floorBottomY: number) {
    this.scene = scene;
    this.id = id;
    this.name = name;
    this.color = MP_PLAYER_COLORS[colorIndex] ?? 0xffffff;
    this.targetX = startX;
    this.lastX = startX;

    this.sprite = scene.add.sprite(startX, floorBottomY - 20, 'cockroach-idle');
    this.sprite.setAlpha(0.2);
    this.sprite.setTint(this.color);
    this.sprite.setDepth(500);
  }

  setLane(lane: string, floorTopY: number, floorBottomY: number): void {
    this.targetLane = lane;
    const targetY = (lane === 'top' ? floorTopY : floorBottomY) - 20;
    // Smooth animated lane swap instead of instant snap
    this.scene.tweens.add({
      targets: this.sprite,
      y: targetY,
      duration: 120,
      ease: 'Power2',
    });
  }

  setPosition(x: number, lane: string, floorTopY: number, floorBottomY: number): void {
    // Calculate velocity from position delta / time delta for dead reckoning
    const now = Date.now();
    if (this.lastUpdateTime > 0) {
      const dt = now - this.lastUpdateTime;
      if (dt > 0) {
        this.velocity = (x - this.lastX) / dt;
      }
    }
    this.lastX = x;
    this.lastUpdateTime = now;
    this.timeSinceUpdate = 0;
    this.targetX = x;

    if (lane !== this.targetLane) {
      this.setLane(lane, floorTopY, floorBottomY);
    }
  }

  setDashing(active: boolean): void {
    this.sprite.setAlpha(active ? 0.35 : 0.2);
  }

  setPill(active: boolean): void {
    if (active) {
      this.sprite.setTint(0xff00ff);
    } else {
      this.sprite.setTint(this.color);
    }
  }

  die(score: number, stats: Record<string, unknown>): void {
    this._alive = false;
    this._score = score;
    this._stats = stats;
    this.sprite.setAlpha(0.05);
    this.sprite.setTint(0x444444);
  }

  update(delta: number): void {
    if (!this._alive) return;

    // Dead reckoning: extrapolate forward using velocity, then blend with interpolation
    this.timeSinceUpdate += delta;
    const extrapolatedX = this.targetX + this.velocity * this.timeSinceUpdate;
    // Blend: mostly extrapolation when fresh, more interpolation as time passes
    const blend = Math.min(this.timeSinceUpdate / 500, 1); // 0→1 over 500ms
    const goalX = Phaser.Math.Linear(extrapolatedX, this.targetX, blend * 0.5);
    // Frame-rate independent smoothing (exponential decay)
    const factor = 1 - Math.pow(1 - 0.15, delta / 16.667);
    this.sprite.x += (goalX - this.sprite.x) * factor;

    // Run animation
    this.animTimer += delta;
    if (this.animTimer >= 200) {
      this.animTimer = 0;
      this.animFrame = (this.animFrame + 1) % this.runFrames.length;
      this.sprite.setTexture(this.runFrames[this.animFrame]);
    }
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
