import Phaser from 'phaser';
import {
  COCKROACH_START_X,
  COCKROACH_BASE_SPEED,
  COCKROACH_SPEED_MAX_BOOST,
  COCKROACH_SPEED_TAU,
  DASH_DURATION,
  DASH_COOLDOWN,
  DASH_SPEED_BOOST,
  PILL_SPEED_MULTIPLIER,
  PILL_DURATION,
  PILL_WARN_TIME,
  SPEED_BOOST_PER_LEVEL,
  COLORS,
  DEPTH,
} from '../config/constants';
import { AudioManager } from '../audio/AudioManager';
import { fadeAndDestroy } from '../utils/TweenPatterns';
import { PillEffect } from './PillEffect';

export type Floor = 'top' | 'bottom';

export class Player {
  private scene: Phaser.Scene;
  private audio: AudioManager;

  // Sprite
  private cockroach!: Phaser.Physics.Arcade.Sprite;
  private cockroachOffset = 24;
  private _currentFloor: Floor = 'bottom';
  private _isDead = false;

  // Speed
  private _currentSpeed = COCKROACH_BASE_SPEED;
  private _speedMultiplier = 1;

  // Dash
  private _isDashing = false;
  private _dashReady = true;
  private dashTrailTimer: Phaser.Time.TimerEvent | null = null;
  private _dashStartTime = 0;

  // Invulnerability
  private _isInvulnerable = false;

  // Pill
  private _isPillActive = false;
  private _pillSpeedBoost = 1;
  private _pillStartTime = 0;
  private _isPillWarning = false;
  private pill: PillEffect;

  // Floor positions
  private floorTopY: number;
  private floorBottomY: number;

  // Run animation
  private runAnimTimer = 0;
  private runAnimFrame = 0;
  private readonly runFrames = ['cockroach-idle', 'cockroach-running'];

  constructor(
    scene: Phaser.Scene,
    audio: AudioManager,
    floorTopY: number,
    floorBottomY: number,
  ) {
    this.scene = scene;
    this.audio = audio;
    this.floorTopY = floorTopY;
    this.floorBottomY = floorBottomY;
    this.pill = new PillEffect(scene);
  }

  // --- Getters ---
  get sprite(): Phaser.Physics.Arcade.Sprite { return this.cockroach; }
  get currentFloor(): Floor { return this._currentFloor; }
  get isDead(): boolean { return this._isDead; }
  get isDashing(): boolean { return this._isDashing; }
  get dashReady(): boolean { return this._dashReady; }
  get dashStartTime(): number { return this._dashStartTime; }
  get isInvulnerable(): boolean { return this._isInvulnerable; }
  get isPillActive(): boolean { return this._isPillActive; }
  get isPillWarning(): boolean { return this._isPillWarning; }
  get pillSpeedBoost(): number { return this._pillSpeedBoost; }
  get pillStartTime(): number { return this._pillStartTime; }

  adjustTimersForPause(pausedMs: number): void {
    if (this._dashStartTime > 0) this._dashStartTime += pausedMs;
    if (this._pillStartTime > 0) this._pillStartTime += pausedMs;
  }
  get currentSpeed(): number { return this._currentSpeed; }
  get speedMultiplier(): number { return this._speedMultiplier; }
  get x(): number { return this.cockroach.x; }
  get y(): number { return this.cockroach.y; }

  set isInvulnerable(val: boolean) { this._isInvulnerable = val; }

  create(): void {
    this.cockroach = this.scene.physics.add.sprite(
      COCKROACH_START_X,
      0, // positioned correctly below after offset is calculated
      'cockroach-idle',
    );
    this.cockroach.setCollideWorldBounds(false);
    this.cockroach.setFlipY(false);
    this.cockroach.setScale(0.30);
    this.cockroach.setDepth(DEPTH.PICKUPS);
    this.cockroach.body!.setSize(200, 200);
    this.cockroach.body!.setOffset(100, 0);
    this.cockroachOffset = this.cockroach.displayHeight / 2;
    this.cockroach.y = this.floorBottomY - this.cockroachOffset;

    this.pill.create(this.cockroach);
  }

  resize(width: number, height: number): void {
    this.pill.resize(width, height);
  }

  resetState(): void {
    this._currentFloor = 'bottom';
    this._isDead = false;
    this._currentSpeed = COCKROACH_BASE_SPEED;
    this._speedMultiplier = 1;
    this._isDashing = false;
    this._dashReady = true;

    if (this.dashTrailTimer) { this.dashTrailTimer.destroy(); }
    this.dashTrailTimer = null;
    this._isInvulnerable = true;
    this._dashStartTime = 0;
    this.stopPill();
  }

  /** Clears the pill's state and stops its effects, however it ended. */
  private stopPill(): void {
    this._isPillActive = false;
    this._isPillWarning = false;
    this._pillSpeedBoost = 1;
    this._pillStartTime = 0;
    this.pill.stop();
  }

  updateSpeed(activePlayTime: number, currentLevel: number): void {
    const elapsedSeconds = activePlayTime / 1000;
    const levelBonus = (currentLevel - 1) * SPEED_BOOST_PER_LEVEL;
    const timeBoost = COCKROACH_SPEED_MAX_BOOST * (1 - Math.exp(-elapsedSeconds / COCKROACH_SPEED_TAU));
    this._currentSpeed = COCKROACH_BASE_SPEED + timeBoost + levelBonus;
    this._speedMultiplier = this._currentSpeed / COCKROACH_BASE_SPEED;

    // Auto-run (flat dash boost + pill multiplier)
    const dashBoost = this._isDashing ? DASH_SPEED_BOOST : 0;
    this.cockroach.setVelocityX((this._currentSpeed + dashBoost) * this._pillSpeedBoost);
  }

  updateDash(): void {
    if (this._dashStartTime > 0 && !this._dashReady) {
      const dashElapsed = this.scene.time.now - this._dashStartTime;
      if (this._isDashing && dashElapsed >= DASH_DURATION) {
        this.endDash();
      }
      if (!this._isDashing && dashElapsed >= DASH_DURATION + DASH_COOLDOWN) {
        this._dashReady = true;
        this._dashStartTime = 0;
        this.playDashReadyEffect();
      }
    }
  }

  updatePill(): void {
    if (this._isPillActive && this._pillStartTime > 0) {
      const pillElapsed = this.scene.time.now - this._pillStartTime;

      // Enter warning phase
      if (!this._isPillWarning && pillElapsed >= PILL_DURATION - PILL_WARN_TIME) {
        this._isPillWarning = true;
        this.pill.enterWarning();
      }

      // End pill effect
      if (pillElapsed >= PILL_DURATION) {
        this.endPillEffect();
      }
    }
  }

  updateVisuals(): void {
    // Run animation — swap frames faster at higher speeds
    if (!this._isDead) {
      if (this._isDashing) {
        this.cockroach.setTexture('cockroach-dashing');
      } else {
        const frameInterval = Math.max(60, 200 / this._speedMultiplier);
        this.runAnimTimer += this.scene.game.loop.delta;
        if (this.runAnimTimer >= frameInterval) {
          this.runAnimTimer = 0;
          this.runAnimFrame = (this.runAnimFrame + 1) % this.runFrames.length;
          this.cockroach.setTexture(this.runFrames[this.runAnimFrame]);
        }
      }
    }

    if (this._isPillActive) {
      this.pill.update(this._isPillWarning, this._pillStartTime);
    } else if (this._speedMultiplier >= 3 && !this._isDashing && !this._isInvulnerable) {
      const glowIntensity = Math.min((this._speedMultiplier - 3) / 0.4, 1);
      const r = Math.floor(255 * glowIntensity);
      const gVal = Math.floor(100 + 155 * (1 - glowIntensity));
      this.cockroach.setTint(Phaser.Display.Color.GetColor(r, gVal, 50));
    } else if (!this._isDashing && !this._isInvulnerable && this._dashReady) {
      this.cockroach.clearTint();
    }
  }

  swapLane(): void {
    if (this._currentFloor === 'bottom') {
      this.cockroach.y = this.floorTopY - this.cockroachOffset;
      this.cockroach.setVelocityY(0);
      this._currentFloor = 'top';
      this.audio.playJump();
    } else {
      this.cockroach.y = this.floorBottomY - this.cockroachOffset;
      this.cockroach.setVelocityY(0);
      this._currentFloor = 'bottom';
      this.audio.playFloorSwitch();
    }
  }

  startDash(): void {
    this._isDashing = true;
    this._dashReady = false;
    this._dashStartTime = this.scene.time.now;

    this.cockroach.setAlpha(0.5);
    this.cockroach.setTint(0xffffaa);

    this.audio.playDash();

    this.dashTrailTimer = this.scene.time.addEvent({
      delay: 80,
      repeat: Math.floor(DASH_DURATION / 80) - 1,
      callback: () => {
        this.spawnAfterimage();
      },
    });
  }

  private endDash(): void {
    this._isDashing = false;
    this.cockroach.setAlpha(1);
    this.cockroach.clearTint();

    if (this.dashTrailTimer) {
      this.dashTrailTimer.destroy();
      this.dashTrailTimer = null;
    }

    // Clear whatever the dash ended inside of, or it would kill on the next frame. The body has to go now:
    // the fade below keeps the sprite around for another 200 ms
    const body = this.cockroach.body as Phaser.Physics.Arcade.Body;
    const bounds = new Phaser.Geom.Rectangle(body.x, body.y, body.width, body.height);
    const obstacles = this.scene.data.get('obstacles') as Phaser.Physics.Arcade.Group | undefined;
    obstacles?.getChildren().forEach((obj) => {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      const other = sprite.body as Phaser.Physics.Arcade.Body;
      if (!other.enable) return;
      const hit = new Phaser.Geom.Rectangle(other.x, other.y, other.width, other.height);
      if (Phaser.Geom.Intersects.RectangleToRectangle(bounds, hit)) {
        sprite.disableBody();
        this.scene.tweens.add({
          targets: sprite,
          alpha: 0,
          scale: 0.5,
          duration: 200,
          onComplete: () => sprite.destroy(),
        });
      }
    });
  }

  private spawnAfterimage(): void {
    const afterimage = this.scene.add.sprite(
      this.cockroach.x,
      this.cockroach.y,
      this.cockroach.texture.key,
      this.cockroach.frame.name,
    );
    afterimage.setScale(this.cockroach.scaleX, this.cockroach.scaleY);
    afterimage.setAlpha(0.7);
    const trailColors = COLORS.DASH_TRAIL;
    const colorIndex = Math.floor(this._speedMultiplier) % trailColors.length;
    afterimage.setTint(trailColors[colorIndex]);
    afterimage.setFlipY(this.cockroach.flipY);

    fadeAndDestroy(this.scene, afterimage, 350);
  }

  private playDashReadyEffect(): void {
    if (this._isDead) return;

    this.audio.playSfx('dash-ready', 0.6);

    // White flash overlay on top of cockroach
    const flash = this.scene.add.sprite(
      this.cockroach.x, this.cockroach.y,
      this.cockroach.texture.key, this.cockroach.frame.name,
    );
    flash.setScale(this.cockroach.scaleX, this.cockroach.scaleY);
    flash.setFlipY(this.cockroach.flipY);
    flash.setTint(0xffffff);
    flash.setAlpha(1);
    flash.setDepth(this.cockroach.depth + 1);
    flash.setBlendMode(Phaser.BlendModes.ADD);

    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      scaleX: flash.scaleX * 1.3,
      scaleY: flash.scaleY * 1.3,
      duration: 200,
      ease: 'Power2',
      onComplete: () => flash.destroy(),
    });
  }

  activatePill(px: number, py: number): void {
    this.audio.playPill();

    // If pill already active, this refreshes the duration
    this._isPillActive = true;
    this._pillSpeedBoost = PILL_SPEED_MULTIPLIER;
    this._isInvulnerable = true;
    this.pill.start(px, py);
    this._isPillWarning = false;
    this._pillStartTime = this.scene.time.now;
  }

  private endPillEffect(): void {
    this.stopPill();
    this.pill.showEnd();

    // Keep invulnerability for 0.5s with blinking cockroach
    this._isInvulnerable = true;
    const blinkTimer = this.scene.time.addEvent({
      delay: 60,
      repeat: 7,
      callback: () => {
        if (this._isDead) return;
        this.cockroach.setAlpha(this.cockroach.alpha < 1 ? 1 : 0.3);
      },
    });

    this.scene.time.delayedCall(500, () => {
      blinkTimer.destroy();
      if (!this._isDead) {
        this._isInvulnerable = false;
        this.cockroach.setAlpha(1);
        this.cockroach.clearTint();
      }
    });
  }

  die(): void {
    if (this._isDead) return;
    this._isDead = true;

    // Reset dash state on death
    if (this.dashTrailTimer) {
      this.dashTrailTimer.destroy();
      this.dashTrailTimer = null;
    }
    this._isDashing = false;
    this._dashReady = true;

    this.stopPill();

    this.cockroach.setTint(0x444444);
    this.cockroach.setVelocity(-50, -300);
    (this.cockroach.body as Phaser.Physics.Arcade.Body).allowGravity = true;

    // Spin while falling, then hide
    this.scene.tweens.add({
      targets: this.cockroach,
      angle: 720,
      alpha: 0,
      duration: 1000,
      ease: 'Linear',
      onComplete: () => {
        this.cockroach.setVisible(false);
      },
    });
  }

  freezeForCountdown(): void {
    this.cockroach.setVelocity(0, 0);
    (this.cockroach.body as Phaser.Physics.Arcade.Body).allowGravity = false;
  }

  startRunning(): void {
    this.cockroach.y = this.floorBottomY - this.cockroachOffset;
    this.cockroach.setVelocity(0, 0);
    (this.cockroach.body as Phaser.Physics.Arcade.Body).allowGravity = true;
  }

  /** Reset cockroach after boss fight. Only undoes texture and angle. */
  resumeAfterBossFight(): void {
    this.cockroach.setTexture('cockroach-idle');
    this.cockroach.setAngle(0);
    this.cockroach.clearTint();
  }

  /** Force-end pill and dash effects immediately. */
  forceEndEffects(): void {
    if (this._isPillActive) {
      this.endPillEffect();
    }
    if (this._isDashing) {
      this.endDash();
    }
  }

  startInvulnerabilityBlink(): Phaser.Tweens.Tween {
    this._isInvulnerable = true;
    return this.scene.tweens.add({
      targets: this.cockroach,
      alpha: { from: 1, to: 0.3 },
      duration: 120,
      yoyo: true,
      repeat: -1,
    });
  }

  endInvulnerability(blinkTween: Phaser.Tweens.Tween): void {
    this._isInvulnerable = false;
    blinkTween.destroy();
    this.cockroach.setAlpha(1);
  }
}
