import Phaser from 'phaser';
import {
  COCKROACH_BASE_SPEED,
  COCKROACH_SPEED_MAX_BOOST,
  COCKROACH_SPEED_TAU,
  DASH_SPEED_BOOST,
  DASH_DURATION,
  DASH_COOLDOWN,
  PILL_SPEED_MULTIPLIER,
  PILL_DURATION,
  SPEED_BOOST_PER_LEVEL,
  DEPTH,
} from '../config/constants';
import { smallStyle } from '../utils/TextStyles';
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
  private _liveScore = 0;
  private _lastSurvivalTick = 0;
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
  private _inBossFight = false;
  private bossGlockSprite: Phaser.GameObjects.Image | null = null;

  // Animation
  private runFrames = ['cockroach-idle', 'cockroach-running'];
  private animFrame = 0;
  private animTimer = 0;

  get alive(): boolean { return this._alive; }
  get score(): number { return this._score; }
  get liveScore(): number { return this._liveScore; }
  get stats(): Record<string, unknown> { return this._stats; }
  get lane(): string { return this.currentFloor; }
  get isDashing(): boolean { return this._isDashing; }
  get inBossFight(): boolean { return this._inBossFight; }
  get speedMultiplier(): number {
    return this.getCurrentSpeed() / COCKROACH_BASE_SPEED;
  }

  updateLiveScore(score: number): void {
    this._liveScore = score;
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

  /** Compute current speed using the same formula as Player.updateSpeed */
  private getCurrentSpeed(): number {
    const elapsedSeconds = this.activePlayTime / 1000;
    const distance = Math.floor((this.sprite.x - this.startX) / 50);
    const level = getLevelForDistance(distance).level;
    const levelBonus = (level - 1) * SPEED_BOOST_PER_LEVEL;
    const timeBoost = COCKROACH_SPEED_MAX_BOOST * (1 - Math.exp(-elapsedSeconds / COCKROACH_SPEED_TAU));
    const baseSpeed = COCKROACH_BASE_SPEED + timeBoost + levelBonus;
    const dashBoost = this._isDashing ? DASH_SPEED_BOOST : 0;
    return (baseSpeed + dashBoost) * this.pillSpeedBoost;
  }

  enterBossFight(targetX: number, floorTopY: number, floorBottomY: number): void {
    this._inBossFight = true;

    const targetY = (this.currentFloor === 'top' ? floorTopY : floorBottomY) - 20;
    this.sprite.setTexture('cockroach-standing');
    this.sprite.setAngle(-90);
    this.sprite.x = targetX;
    this.sprite.y = targetY;

    this.bossGlockSprite = this.scene.add.image(targetX + 15, targetY, 'boss-gun');
    this.bossGlockSprite.setScale(0.25).setDepth(this.sprite.depth + 1);
    this.bossGlockSprite.setOrigin(0, 0.5);
    this.bossGlockSprite.setTint(this.color);
    this.bossGlockSprite.setAlpha(this.sprite.alpha);
  }

  leaveBossFight(): void {
    this._inBossFight = false;
    this.sprite.setTexture('cockroach-idle');
    this.sprite.setAngle(0);
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
      this.dashReady = false;
      this.dashStartTime = this.activePlayTime;
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

    this.activePlayTime += delta;

    // Survival score: +1 per second (mirrors GameScene scoring)
    this._lastSurvivalTick += delta;
    if (this._lastSurvivalTick >= 1000) {
      this._liveScore += 1;
      this._lastSurvivalTick -= 1000;
    }

    // Move at computed speed — same formula as the real player
    const speed = this.getCurrentSpeed(); // px/s
    this.sprite.x += speed * (delta / 1000);

    // Keep name label above sprite (round to avoid sub-pixel flicker)
    this.nameLabel.setPosition(Math.round(this.sprite.x), Math.round(this.sprite.y) - 25);

    // Run animation — use dashing texture when dashing, cycle idle/running otherwise
    if (this._isDashing) {
      this.sprite.setTexture('cockroach-dashing');
    } else {
      const speedMult = speed / COCKROACH_BASE_SPEED;
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
