import Phaser from 'phaser';
import {
  COCKROACH_BASE_SPEED,
  COCKROACH_ACCELERATION,
  DASH_SPEED_BOOST,
  DASH_DURATION,
  DASH_COOLDOWN,
  PILL_SPEED_MULTIPLIER,
  PILL_DURATION,
  SPEED_BOOST_PER_LEVEL,
} from '../config/constants';
import { getLevelForDistance } from '../config/levels';

// Re-export for convenience — must match server/lobby.ts PLAYER_COLORS exactly
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
  private nameLabel: Phaser.GameObjects.Text;

  private scene: Phaser.Scene;
  private startX: number;
  private _alive = true;
  private _score = 0;
  private _stats: Record<string, unknown> = {};
  private _isSpectated = false;

  // Simulated physics — mirrors Player.ts logic exactly
  private activePlayTime = 0; // ms
  private currentFloor: string = 'bottom';
  private _isDashing = false;
  private dashStartTime = 0;
  private dashReady = true;
  private _isPillActive = false;
  private pillStartTime = 0;
  private pillSpeedBoost = 1;
  private dashTrailTimer: Phaser.Time.TimerEvent | null = null;

  // Animation
  private runFrames = ['cockroach-idle', 'cockroach-running'];
  private animFrame = 0;
  private animTimer = 0;

  get alive(): boolean { return this._alive; }
  get score(): number { return this._score; }
  get stats(): Record<string, unknown> { return this._stats; }
  get lane(): string { return this.currentFloor; }
  get isDashing(): boolean { return this._isDashing; }

  setSpectated(spectated: boolean): void {
    this._isSpectated = spectated;
    if (!this._alive) return;
    this.updateAlpha();
  }

  constructor(scene: Phaser.Scene, id: string, name: string, colorIndex: number, startX: number, floorBottomY: number) {
    this.scene = scene;
    this.id = id;
    this.name = name;
    this.color = MP_PLAYER_COLORS[colorIndex] ?? 0xffffff;
    this.startX = startX;

    this.sprite = scene.add.sprite(startX, floorBottomY - 20, 'cockroach-idle');
    this.sprite.setScale(0.30);
    this.sprite.setAlpha(0.2);
    this.sprite.setTint(this.color);
    this.sprite.setDepth(500);

    const colorStr = '#' + this.color.toString(16).padStart(6, '0');
    this.nameLabel = scene.add.text(startX, floorBottomY - 45, name, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '5px',
      color: colorStr,
      stroke: '#000000',
      strokeThickness: 2,
    });
    this.nameLabel.setOrigin(0.5, 1);
    this.nameLabel.setAlpha(0.4);
    this.nameLabel.setDepth(501);
  }

  /** Compute current speed using the same formula as Player.updateSpeed */
  private getCurrentSpeed(): number {
    const elapsedSeconds = this.activePlayTime / 1000;
    const distance = Math.floor((this.sprite.x - this.startX) / 50);
    const level = getLevelForDistance(distance).level;
    const levelBonus = (level - 1) * SPEED_BOOST_PER_LEVEL;
    const baseSpeed = COCKROACH_BASE_SPEED + elapsedSeconds * COCKROACH_ACCELERATION + levelBonus;
    const dashBoost = this._isDashing ? DASH_SPEED_BOOST : 0;
    return (baseSpeed + dashBoost) * this.pillSpeedBoost;
  }

  setLane(lane: string, floorTopY: number, floorBottomY: number): void {
    this.currentFloor = lane;
    const targetY = (lane === 'top' ? floorTopY : floorBottomY) - 20;
    this.scene.tweens.add({
      targets: this.sprite,
      y: targetY,
      duration: 120,
      ease: 'Power2',
    });
  }

  private updateAlpha(): void {
    if (this._isSpectated) {
      this.sprite.setAlpha(this._isDashing ? 0.5 : 1);
    } else {
      this.sprite.setAlpha(this._isDashing ? 0.35 : 0.2);
    }
  }

  setDashing(active: boolean): void {
    this._isDashing = active;
    this.updateAlpha();

    if (active) {
      this.dashReady = false;
      this.dashStartTime = this.activePlayTime;
      this.sprite.setTint(0xffffaa);
      this.dashTrailTimer = this.scene.time.addEvent({
        delay: 80,
        repeat: Math.floor(DASH_DURATION / 80) - 1,
        callback: () => {
          if (!this._alive) return;
          const afterimage = this.scene.add.sprite(this.sprite.x, this.sprite.y, this.sprite.texture.key);
          afterimage.setScale(this.sprite.scaleX, this.sprite.scaleY);
          afterimage.setAlpha(this._isSpectated ? 0.3 : 0.15);
          afterimage.setTint(this.color);
          afterimage.setDepth(this.sprite.depth - 1);
          this.scene.tweens.add({
            targets: afterimage,
            alpha: 0,
            duration: 200,
            onComplete: () => afterimage.destroy(),
          });
        },
      });
    } else {
      this.sprite.setTint(this._isPillActive ? 0xff00ff : this.color);
      if (this.dashTrailTimer) {
        this.dashTrailTimer.destroy();
        this.dashTrailTimer = null;
      }
    }
  }

  setPill(active: boolean): void {
    this._isPillActive = active;
    if (active) {
      this.pillSpeedBoost = PILL_SPEED_MULTIPLIER;
      this.pillStartTime = this.activePlayTime;
      this.sprite.setTint(0xff00ff);
    } else {
      this.pillSpeedBoost = 1;
      if (!this._isDashing) {
        this.sprite.setTint(this.color);
      }
    }
  }

  die(score: number, stats: Record<string, unknown>): void {
    this._alive = false;
    this._score = score;
    this._stats = stats;
    this._isDashing = false;
    this._isPillActive = false;
    this.pillSpeedBoost = 1;
    if (this.dashTrailTimer) {
      this.dashTrailTimer.destroy();
      this.dashTrailTimer = null;
    }

    this.sprite.setTint(0x444444);
    this.nameLabel.setVisible(false);
    this.scene.tweens.add({
      targets: this.sprite,
      y: this.sprite.y - 80,
      angle: 720,
      alpha: 0,
      duration: 800,
      ease: 'Quad.easeOut',
    });
  }

  update(delta: number): void {
    if (!this._alive) return;

    this.activePlayTime += delta;

    // Move at computed speed — same formula as the real player
    const speed = this.getCurrentSpeed(); // px/s
    this.sprite.x += speed * (delta / 1000);

    // Keep name label above sprite
    this.nameLabel.setPosition(this.sprite.x, this.sprite.y - 25);

    // Run animation — faster at higher speeds
    const speedMult = speed / COCKROACH_BASE_SPEED;
    const frameInterval = Math.max(60, 200 / speedMult);
    this.animTimer += delta;
    if (this.animTimer >= frameInterval) {
      this.animTimer = 0;
      this.animFrame = (this.animFrame + 1) % this.runFrames.length;
      this.sprite.setTexture(this.runFrames[this.animFrame]);
    }
  }

  destroy(): void {
    if (this.dashTrailTimer) {
      this.dashTrailTimer.destroy();
      this.dashTrailTimer = null;
    }
    this.sprite.destroy();
    this.nameLabel.destroy();
  }
}
