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

    this.sprite = scene.add.sprite(startX, floorBottomY - 20, 'cockroach-idle');
    this.sprite.setAlpha(0.2);
    this.sprite.setTint(this.color);
    this.sprite.setDepth(500);
  }

  setLane(lane: string, floorTopY: number, floorBottomY: number): void {
    this.targetLane = lane;
    this.sprite.y = (lane === 'top' ? floorTopY : floorBottomY) - 20;
  }

  setPosition(x: number, lane: string, floorTopY: number, floorBottomY: number): void {
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

    // Frame-rate independent interpolation toward target X
    // lerpFactor = 1 - (1 - base)^(delta/16.67) where base=0.15 at 60fps
    const base = 0.15;
    const factor = 1 - Math.pow(1 - base, delta / 16.667);
    this.sprite.x = Phaser.Math.Linear(this.sprite.x, this.targetX, factor);

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
