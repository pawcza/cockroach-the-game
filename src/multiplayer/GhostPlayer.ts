import Phaser from 'phaser';

// Client-side player colors — must match server/lobby.ts PLAYER_COLORS exactly
export const MP_PLAYER_COLORS = [
  0xff0000, // red
  0x0000ff, // blue
  0x00cc00, // green
  0xffff00, // yellow
  0xff8800, // orange
  0x8800ff, // purple
  0x00cccc, // cyan
  0xff00ff, // magenta
  0xff4488, // pink
  0x88cc00, // lime
  0x0088ff, // sky blue
  0xcc4400, // brown
  0x8888ff, // lavender
  0x00ff88, // mint
  0xffcc00, // gold
  0xcccccc, // silver
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
    this.sprite.setScale(0.30);
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

    // Dead reckoning: extrapolate forward at last known velocity
    this.timeSinceUpdate += delta;
    const extrapolatedX = this.targetX + this.velocity * this.timeSinceUpdate;
    // Snap quickly to extrapolated position (0.3 base factor at 60fps)
    const factor = 1 - Math.pow(1 - 0.3, delta / 16.667);
    this.sprite.x += (extrapolatedX - this.sprite.x) * factor;

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
