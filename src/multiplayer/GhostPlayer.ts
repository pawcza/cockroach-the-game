import Phaser from 'phaser';
import {
  COCKROACH_BASE_SPEED,
  COCKROACH_SPEED_MAX_BOOST,
  COCKROACH_SPEED_TAU,
  DASH_SPEED_BOOST,
  DASH_DURATION,
  PILL_SPEED_MULTIPLIER,
  PILL_DURATION,
  SPEED_BOOST_PER_LEVEL,
  DEPTH,
} from '../config/constants';
import { ATLAS, HOP_MS, ROACH_FEET_OFFSET, SPRITE_SCALE, frameOf, hopY } from '../config/sprites';
import { smallStyle } from '../utils/TextStyles';
import { getLevelForDistance } from '../config/levels';
import { PLAYER_COLORS } from '../../server/lobby';

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

  // Dead reckoning — position recalculated each frame from last server snapshot
  // No accumulation = no drift
  private lastServerX = 0;         // X from last position event
  private serverTime = 0;          // activePlayTime (ms) from last event
  private serverTimeLocal = 0;     // Date.now() when event was received
  private hasServerTime = false;   // don't move until first position event
  private visualOffset = 0;        // smooth visual transition (decays to 0)

  private _inBossFight = false;
  private bossGlockSprite: Phaser.GameObjects.Image | null = null;

  private laneTween: Phaser.Tweens.Tween | null = null;

  get alive(): boolean { return this._alive; }
  get score(): number { return this._score; }
  get liveScore(): number { return this._liveScore; }
  get combo(): number { return this._combo; }
  get stats(): Record<string, unknown> { return this._stats; }
  get lane(): string { return this.currentFloor; }
  get isDashing(): boolean { return this._isDashing; }
  get inBossFight(): boolean { return this._inBossFight; }
  get speedMultiplier(): number {
    return this.getCurrentSpeed() / COCKROACH_BASE_SPEED;
  }

  /** Receive authoritative position + time from real player */
  pushPosition(x: number, activePlayTimeMs?: number): void {
    const now = Date.now();

    if (this.hasServerTime) {
      this.visualOffset = this.sprite.x - x;
    }

    this.lastServerX = x;
    this.serverTimeLocal = now;

    if (activePlayTimeMs != null) {
      this.serverTime = activePlayTimeMs;
    } else if (!this.hasServerTime) {
      // First event without t — assume t=0 so ghost can start moving
      this.serverTime = 0;
    }
    // else: keep serverTime as-is, it gets extrapolated forward

    this.hasServerTime = true;
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
    this.color = PLAYER_COLORS[colorIndex] ?? 0xffffff;
    this.startX = startX;

    this.sprite = scene.add.sprite(startX, floorBottomY - ROACH_FEET_OFFSET, ATLAS, frameOf('roach-run'));
    this.sprite.setScale(SPRITE_SCALE);
    this.sprite.play('roach-run');
    this.sprite.setAlpha(0.2);
    this.sprite.setTint(this.color);
    this.sprite.setDepth(DEPTH.GHOST_SPRITE);

    const colorStr = '#' + this.color.toString(16).padStart(6, '0');
    this.nameLabel = scene.add.text(startX, floorBottomY - 100, name, smallStyle({ color: colorStr }));
    this.nameLabel.setOrigin(0.5, 1);
    this.nameLabel.setAlpha(0.5);
    this.nameLabel.setDepth(DEPTH.GHOST_LABEL);
  }

  /** Compute current speed using server-authoritative time extrapolated to now */
  private getCurrentSpeed(): number {
    // Extrapolate server time forward using wall clock (same clock player uses)
    const timeSinceUpdate = this.hasServerTime ? Date.now() - this.serverTimeLocal : 0;
    const effectiveTime = this.serverTime + timeSinceUpdate;
    const elapsedSeconds = effectiveTime / 1000;

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

    const targetY = (this.currentFloor === 'top' ? floorTopY : floorBottomY) - ROACH_FEET_OFFSET;
    this.sprite.stop();
    this.sprite.setFrame(frameOf('roach-idle'));
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
    this.sprite.play('roach-run');
    this.sprite.setAngle(0);
    this.updateAlpha();
    if (this.bossGlockSprite) {
      this.bossGlockSprite.destroy();
      this.bossGlockSprite = null;
    }
  }

  setLane(lane: string, floorTopY: number, floorBottomY: number): void {
    this.currentFloor = lane;
    const targetY = (lane === 'top' ? floorTopY : floorBottomY) - ROACH_FEET_OFFSET;
    const fromY = this.sprite.y;
    this.laneTween?.destroy();
    if (!this._inBossFight && this._alive) {
      this.sprite.anims.timeScale = 1;
      this.sprite.play('roach-hop');
    }
    this.laneTween = this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: HOP_MS,
      ease: 'Sine.easeInOut',
      onUpdate: (tween) => {
        const y = hopY(fromY, targetY, tween.getValue() ?? 0);
        this.sprite.y = y;
        if (this._inBossFight && this.bossGlockSprite) this.bossGlockSprite.y = y;
      },
      onComplete: () => { this.laneTween = null; },
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
          const afterimage = this.scene.add.sprite(this.sprite.x, this.sprite.y, ATLAS, this.sprite.frame.name);
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

    this.laneTween?.destroy();
    this.laneTween = null;
    this.sprite.anims.timeScale = 1;
    this.sprite.play('roach-death');
    this.nameLabel.setVisible(false);
    this.scene.tweens.add({
      targets: this.sprite,
      y: this.sprite.y - 80,
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
      this.nameLabel.setPosition(Math.round(this.sprite.x), Math.round(this.sprite.y) - 60);
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

    // Don't move until we receive the first position event
    if (!this.hasServerTime) return;

    // Dead reckoning: position = lastServerX + speed * elapsed
    // Recalculated from scratch each frame — no accumulation, no drift
    const speed = this.getCurrentSpeed();
    const elapsed = (Date.now() - this.serverTimeLocal) / 1000;
    const predictedX = this.lastServerX + speed * elapsed;

    // Smooth visual transition (decays offset from prediction snap)
    this.visualOffset *= 0.5;
    if (Math.abs(this.visualOffset) < 0.5) this.visualOffset = 0;

    this.sprite.x = predictedX + this.visualOffset;

    // Keep name label above sprite
    this.nameLabel.setPosition(Math.round(this.sprite.x), Math.round(this.sprite.y) - 60);

    // Legs follow the run speed; a hop plays out first
    if (!this.laneTween && !this._inBossFight) {
      const animation = this._isDashing ? 'roach-dash' : 'roach-run';
      if (this.sprite.anims.getName() !== animation) this.sprite.play(animation);
      this.sprite.anims.timeScale = this._isDashing ? 1 : speed / COCKROACH_BASE_SPEED;
    }
  }

  destroy(): void {
    if (this.bossGlockSprite) {
      this.bossGlockSprite.destroy();
      this.bossGlockSprite = null;
    }
    this.laneTween?.destroy();
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
