import Phaser from 'phaser';
import {
  COCKROACH_BASE_SPEED,
  DASH_DURATION,
  PILL_SPEED_MULTIPLIER,
  PILL_DURATION,
  DEPTH,
} from '../config/constants';
import { smallStyle } from '../utils/TextStyles';

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
  private _liveScore = 0;
  private _combo = 0;
  private _lastSurvivalTick = 0;
  private _stats: Record<string, unknown> = {};
  private _isSpectated = false;

  // Movement state
  private currentFloor: string = 'bottom';
  private _isDashing = false;
  private _isPillActive = false;
  private pillSpeedBoost = 1;
  private dashTrailTimer: Phaser.Time.TimerEvent | null = null;

  // Entity interpolation — server-authoritative position
  private posBuffer: Array<{ x: number; t: number }> = [];
  private lastKnownSpeed = COCKROACH_BASE_SPEED; // for extrapolation

  private _inBossFight = false;
  private bossGlockSprite: Phaser.GameObjects.Image | null = null;

  // Animation
  private runFrames = ['cockroach-idle', 'cockroach-running'];
  private animFrame = 0;
  private animTimer = 0;

  get alive(): boolean { return this._alive; }
  get score(): number { return this._score; }
  get liveScore(): number { return this._liveScore; }
  get combo(): number { return this._combo; }
  get stats(): Record<string, unknown> { return this._stats; }
  get lane(): string { return this.currentFloor; }
  get isDashing(): boolean { return this._isDashing; }
  get inBossFight(): boolean { return this._inBossFight; }
  get speedMultiplier(): number {
    return Math.max(1, this.lastKnownSpeed / COCKROACH_BASE_SPEED);
  }

  /** Push an authoritative position snapshot from the server */
  pushPosition(x: number): void {
    const now = performance.now();
    this.posBuffer.push({ x, t: now });
    // Keep only last 10 snapshots
    if (this.posBuffer.length > 10) this.posBuffer.shift();
    // Update speed estimate from last two snapshots
    if (this.posBuffer.length >= 2) {
      const a = this.posBuffer[this.posBuffer.length - 2];
      const b = this.posBuffer[this.posBuffer.length - 1];
      const dt = (b.t - a.t) / 1000;
      if (dt > 0) this.lastKnownSpeed = (b.x - a.x) / dt;
    }
  }

  updateLiveScore(score: number, combo?: number): void {
    this._liveScore = score;
    if (combo != null) this._combo = combo;
  }

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
    this.sprite.setDepth(DEPTH.GHOST_SPRITE);

    const colorStr = '#' + this.color.toString(16).padStart(6, '0');
    this.nameLabel = scene.add.text(startX, floorBottomY - 45, name, smallStyle({ color: colorStr }));
    this.nameLabel.setOrigin(0.5, 1);
    this.nameLabel.setAlpha(0.5);
    this.nameLabel.setDepth(DEPTH.GHOST_LABEL);
  }

  /** Get interpolated X position from the position buffer */
  private getInterpolatedX(): number {
    const now = performance.now();
    const INTERP_DELAY = 100; // render 100ms behind for smooth interpolation
    const renderTime = now - INTERP_DELAY;

    const buf = this.posBuffer;
    if (buf.length === 0) return this.sprite.x;

    // Find the two snapshots surrounding renderTime
    if (renderTime <= buf[0].t) return buf[0].x;

    for (let i = 0; i < buf.length - 1; i++) {
      const a = buf[i];
      const b = buf[i + 1];
      if (renderTime >= a.t && renderTime <= b.t) {
        const t = (renderTime - a.t) / (b.t - a.t);
        return a.x + (b.x - a.x) * t;
      }
    }

    // Extrapolate beyond last snapshot using estimated speed
    const last = buf[buf.length - 1];
    const elapsed = (renderTime - last.t) / 1000;
    return last.x + this.lastKnownSpeed * elapsed;
  }

  enterBossFight(targetX: number, floorTopY: number, floorBottomY: number): void {
    this._inBossFight = true;

    const targetY = (this.currentFloor === 'top' ? floorTopY : floorBottomY) - 20;
    this.sprite.setTexture('cockroach-standing');
    this.sprite.setAngle(-90);
    this.sprite.x = targetX;
    this.sprite.y = targetY;
    this.sprite.setAlpha(0.6);
    this.nameLabel.setAlpha(0.8);

    this.bossGlockSprite = this.scene.add.image(targetX + 15, targetY, 'boss-gun');
    this.bossGlockSprite.setScale(0.25).setDepth(this.sprite.depth + 1);
    this.bossGlockSprite.setOrigin(0, 0.5);
    this.bossGlockSprite.setTint(this.color);
    this.bossGlockSprite.setAlpha(0.6);
  }

  leaveBossFight(): void {
    this._inBossFight = false;
    this.sprite.setTexture('cockroach-idle');
    this.sprite.setAngle(0);
    this.updateAlpha();
    if (this.bossGlockSprite) {
      this.bossGlockSprite.destroy();
      this.bossGlockSprite = null;
    }
  }

  setLane(lane: string, floorTopY: number, floorBottomY: number): void {
    this.currentFloor = lane;
    const targetY = (lane === 'top' ? floorTopY : floorBottomY) - 20;
    const targets: object[] = [this.sprite];
    if (this._inBossFight && this.bossGlockSprite) targets.push(this.bossGlockSprite);
    this.scene.tweens.add({
      targets,
      y: targetY,
      duration: 120,
      ease: 'Power2',
    });
  }

  private updateAlpha(): void {
    if (this._isSpectated) {
      this.sprite.setAlpha(this._isDashing ? 0.5 : 1);
      this.nameLabel.setAlpha(1);
    } else {
      this.sprite.setAlpha(this._isDashing ? 0.35 : 0.2);
      this.nameLabel.setAlpha(0.5);
    }
  }

  setDashing(active: boolean): void {
    this._isDashing = active;
    this.updateAlpha();

    if (active) {
      this.sprite.setTint(this.color);
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
      onComplete: () => {
        this.sprite.setVisible(false);
      },
    });
  }

  playShootAnimation(): void {
    if (!this.bossGlockSprite) return;
    this.scene.tweens.add({
      targets: this.bossGlockSprite,
      angle: -15,
      duration: 50,
      ease: 'Power2',
      yoyo: true,
    });

    const bulletX = this.sprite.x + 30;
    const bulletY = this.sprite.y;
    const bullet = this.scene.add.image(bulletX, bulletY, 'boss-shell');
    bullet.setScale(0.3).setDepth(this.sprite.depth + 1);
    bullet.setTint(this.color);
    bullet.setAlpha(this.sprite.alpha);
    this.scene.tweens.add({
      targets: bullet,
      x: bulletX + 600,
      alpha: { from: this.sprite.alpha, to: 0 },
      duration: 800,
      ease: 'Linear',
      onComplete: () => bullet.destroy(),
    });
  }

  update(delta: number): void {
    if (!this._alive) return;

    if (this._inBossFight) {
      this.nameLabel.setPosition(Math.round(this.sprite.x), Math.round(this.sprite.y) - 25);
      if (this.bossGlockSprite) {
        this.bossGlockSprite.setPosition(this.sprite.x + 15, this.sprite.y);
      }
      return;
    }

    // Survival score: +1 per second
    this._lastSurvivalTick += delta;
    if (this._lastSurvivalTick >= 1000) {
      this._liveScore += 1;
      this._lastSurvivalTick -= 1000;
    }

    // Entity interpolation — position is driven entirely by server snapshots
    if (this.posBuffer.length > 0) {
      this.sprite.x = this.getInterpolatedX();
    }

    // Keep name label above sprite
    this.nameLabel.setPosition(Math.round(this.sprite.x), Math.round(this.sprite.y) - 25);

    // Run animation
    if (this._isDashing) {
      this.sprite.setTexture('cockroach-dashing');
    } else {
      const speedMult = this.speedMultiplier;
      const frameInterval = Math.max(60, 200 / speedMult);
      this.animTimer += delta;
      if (this.animTimer >= frameInterval) {
        this.animTimer = 0;
        this.animFrame = (this.animFrame + 1) % this.runFrames.length;
        this.sprite.setTexture(this.runFrames[this.animFrame]);
      }
    }
  }

  destroy(): void {
    if (this.bossGlockSprite) {
      this.bossGlockSprite.destroy();
      this.bossGlockSprite = null;
    }
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.killTweensOf(this.nameLabel);
    if (this.dashTrailTimer) {
      this.dashTrailTimer.destroy();
      this.dashTrailTimer = null;
    }
    this.sprite.destroy();
    this.nameLabel.destroy();
  }
}
