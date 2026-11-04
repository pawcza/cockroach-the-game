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
import { dress, roachAnim, type Look, type RoachAnim, type Worn } from '../config/skins';
import { PLAYER_COLORS } from '../../server/lobby';

/** The name sits above the tallest thing a roach can wear (a balloon on its back). */
const NAME_ABOVE = 84;
/** How long a ghost keeps running past its last report before it waits for the next one. */
const MAX_EXTRAPOLATE_S = 0.5;
/** Further off than this, the ghost jumps to where it should be instead of easing there. */
const SNAP_PX = 250;
/** How quickly a ghost behind its target closes in. */
const CATCH_UP_MS = 60;

export class GhostPlayer {
  readonly id: string;
  readonly name: string;
  readonly color: number;
  readonly sprite: Phaser.GameObjects.Sprite;
  private nameLabel: Phaser.GameObjects.Text;
  private ring: Phaser.GameObjects.Ellipse;
  private look: Look | null;
  private worn: Worn[];

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

  // Where the real player is, from their position reports (10 a second). Between reports the ghost runs on at the
  // speed the reports themselves show, not the speed formula: a client whose game runs slow (a weaker laptop, a
  // dropped frame, a background tab) covers less ground than the formula says, and trusting it made the ghost
  // overshoot and snap back on every report.
  private lastServerX = 0;         // X from the last report
  private serverTime = 0;          // their activePlayTime (ms) at that report
  private serverTimeLocal = 0;     // Date.now() when it arrived
  private hasServerTime = false;   // don't move until the first report
  private measuredSpeed = 0;       // px/s, smoothed from consecutive reports; 0 until there are two

  private _inBossFight = false;
  private bossGlockSprite: Phaser.GameObjects.Image | null = null;

  private laneTween: Phaser.Tweens.Tween | null = null;

  get alive(): boolean { return this._alive; }

  private anim(name: RoachAnim): string {
    return roachAnim(name, this.look);
  }
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

  /** A position report from the real player: x, and their run clock when they sent it. */
  pushPosition(x: number, activePlayTimeMs?: number): void {
    const now = Date.now();

    if (this.hasServerTime && activePlayTimeMs != null) {
      const dt = activePlayTimeMs - this.serverTime;
      const dx = x - this.lastServerX;
      // Their own clock, so network jitter doesn't show up as speed. Skip gaps a pause or a boss fight made
      if (dt >= 50 && dt <= 1000 && dx >= 0) {
        const speed = (dx / dt) * 1000;
        this.measuredSpeed = this.measuredSpeed === 0 ? speed : this.measuredSpeed * 0.5 + speed * 0.5;
      }
    }

    this.lastServerX = x;
    this.serverTimeLocal = now;

    if (activePlayTimeMs != null) {
      this.serverTime = activePlayTimeMs;
    } else if (!this.hasServerTime) {
      // First event without t — assume t=0 so ghost can start moving
      this.serverTime = 0;
    }

    if (!this.hasServerTime) this.sprite.x = x;
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

  constructor(scene: Phaser.Scene, id: string, name: string, colorIndex: number, startX: number, floorBottomY: number, look: Look | null = null) {
    this.scene = scene;
    this.id = id;
    this.name = name;
    this.color = PLAYER_COLORS[colorIndex] ?? 0xffffff;
    this.startX = startX;

    // Their skin as they wear it; their lobby colour is the ring at their feet and their name, not a tint over the skin
    this.look = look;
    this.sprite = scene.add.sprite(startX, floorBottomY - ROACH_FEET_OFFSET, ATLAS, frameOf(this.anim('run')));
    this.sprite.setScale(SPRITE_SCALE);
    this.sprite.play(this.anim('run'));
    this.sprite.setAlpha(0.2);
    this.sprite.setDepth(DEPTH.GHOST_SPRITE);
    this.worn = dress(scene, this.sprite, look);
    this.ring = scene.add.ellipse(startX, floorBottomY, 54, 10).setStrokeStyle(2, this.color, 0.8).setDepth(DEPTH.CONTACT_SHADOW);

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
    this.sprite.setFrame(frameOf(this.anim('idle')));
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
    this.sprite.play(this.anim('run'));
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
      this.sprite.play(this.anim('hop'));
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
      if (!this._isPillActive) this.sprite.clearTint();
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
      this.sprite.clearTint();
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
    this.sprite.play(this.anim('death'));
    this.nameLabel.setVisible(false);
    this.ring.setVisible(false);
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
      this.nameLabel.setPosition(Math.round(this.sprite.x), Math.round(this.sprite.y) - NAME_ABOVE);
    this.ring.setPosition(Math.round(this.sprite.x), Math.round(this.sprite.y + ROACH_FEET_OFFSET));
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

    // Where they should be now: the last report carried on at their measured speed (the formula until there are two
    // reports), for at most half a second, so a silent client doesn't run away
    const speed = this.measuredSpeed || this.getCurrentSpeed();
    const elapsed = Math.min((Date.now() - this.serverTimeLocal) / 1000, MAX_EXTRAPOLATE_S);
    const target = this.lastServerX + speed * elapsed;

    // Shown moving forward only. Behind the target it closes in; ahead of it, it runs on at half speed until the
    // target catches up. Only a big miss (a respawn, a long stall) jumps
    const gap = target - this.sprite.x;
    if (Math.abs(gap) > SNAP_PX) {
      this.sprite.x = target;
    } else if (gap >= 0) {
      this.sprite.x += gap * (1 - Math.exp(-delta / CATCH_UP_MS));
    } else {
      this.sprite.x += (speed * 0.5 * delta) / 1000;
    }

    // Keep name label above sprite
    this.nameLabel.setPosition(Math.round(this.sprite.x), Math.round(this.sprite.y) - NAME_ABOVE);
    this.ring.setPosition(Math.round(this.sprite.x), Math.round(this.sprite.y + ROACH_FEET_OFFSET));

    // Legs follow the run speed; a hop plays out first
    if (!this.laneTween && !this._inBossFight) {
      const animation = this.anim(this._isDashing ? 'dash' : 'run');
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
    this.ring.destroy();
    this.worn.forEach(item => item.destroy());
  }
}
