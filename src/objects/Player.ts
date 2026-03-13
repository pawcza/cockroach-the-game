import Phaser from 'phaser';
import {
  COCKROACH_START_X,
  COCKROACH_BASE_SPEED,
  COCKROACH_ACCELERATION,
  SPEED_BOOST_PER_LEVEL,
} from '../config/constants';
import { AudioManager } from '../audio/AudioManager';
import { DashSystem } from './DashSystem';
import { PillSystem } from './PillSystem';

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

  // Invulnerability
  private _isInvulnerable = false;

  // Systems
  private dashSystem!: DashSystem;
  private pillSystem!: PillSystem;

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
  }

  // --- Getters ---
  get sprite(): Phaser.Physics.Arcade.Sprite { return this.cockroach; }
  get currentFloor(): Floor { return this._currentFloor; }
  get isDead(): boolean { return this._isDead; }
  get isDashing(): boolean { return this.dashSystem.isDashing; }
  get dashReady(): boolean { return this.dashSystem.dashReady; }
  get dashStartTime(): number { return this.dashSystem.dashStartTime; }
  get isInvulnerable(): boolean { return this._isInvulnerable; }
  get isPillActive(): boolean { return this.pillSystem.isPillActive; }
  get isPillWarning(): boolean { return this.pillSystem.isPillWarning; }
  get pillSpeedBoost(): number { return this.pillSystem.speedBoost; }
  get pillStartTime(): number { return this.pillSystem.pillStartTime; }
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
    this.cockroach.setDepth(10);
    this.cockroach.body!.setSize(200, 200);
    this.cockroach.body!.setOffset(100, 0);
    this.cockroachOffset = this.cockroach.displayHeight / 2;
    this.cockroach.y = this.floorBottomY - this.cockroachOffset;

    // Initialize systems
    this.dashSystem = new DashSystem(
      this.scene,
      this.audio,
      this.cockroach,
      () => this._isDead,
    );
    this.pillSystem = new PillSystem(
      this.scene,
      this.audio,
      this.cockroach,
      (val) => { this._isInvulnerable = val; },
      () => this._isDead,
    );
    this.pillSystem.createOverlay();
  }

  resetState(): void {
    this._currentFloor = 'bottom';
    this._isDead = false;
    this._currentSpeed = COCKROACH_BASE_SPEED;
    this._speedMultiplier = 1;
    this._isInvulnerable = true;

    this.dashSystem.reset();
    this.pillSystem.reset();
  }

  updateSpeed(activePlayTime: number, currentLevel: number): void {
    const elapsedSeconds = activePlayTime / 1000;
    const levelBonus = (currentLevel - 1) * SPEED_BOOST_PER_LEVEL;
    this._currentSpeed = COCKROACH_BASE_SPEED + elapsedSeconds * COCKROACH_ACCELERATION + levelBonus;
    this._speedMultiplier = this._currentSpeed / COCKROACH_BASE_SPEED;

    // Auto-run (flat dash boost + pill multiplier)
    const dashBoost = this.dashSystem.speedBoost;
    this.cockroach.setVelocityX((this._currentSpeed + dashBoost) * this.pillSystem.speedBoost);
  }

  updateDash(): void {
    this.dashSystem.update(this._speedMultiplier);
  }

  updatePill(): void {
    this.pillSystem.update();
  }

  updateVisuals(): void {
    // Run animation — swap frames faster at higher speeds
    if (!this._isDead) {
      const frameInterval = Math.max(60, 200 / this._speedMultiplier);
      this.runAnimTimer += this.scene.game.loop.delta;
      if (this.runAnimTimer >= frameInterval) {
        this.runAnimTimer = 0;
        this.runAnimFrame = (this.runAnimFrame + 1) % this.runFrames.length;
        this.cockroach.setTexture(this.runFrames[this.runAnimFrame]);
      }
    }

    if (this.pillSystem.isPillActive) {
      this.pillSystem.updateVisuals();
    } else if (this._speedMultiplier >= 3 && !this.dashSystem.isDashing && !this._isInvulnerable) {
      const glowIntensity = Math.min((this._speedMultiplier - 3) / 5, 1);
      const r = Math.floor(255 * glowIntensity);
      const gVal = Math.floor(100 + 155 * (1 - glowIntensity));
      this.cockroach.setTint(Phaser.Display.Color.GetColor(r, gVal, 50));
    } else if (!this.dashSystem.isDashing && !this._isInvulnerable && this.dashSystem.dashReady) {
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
    this.dashSystem.startDash();
  }

  activatePill(px: number, py: number): void {
    this.pillSystem.activatePill(px, py);
  }

  die(): void {
    if (this._isDead) return;
    this._isDead = true;

    // Reset dash state on death
    this.dashSystem.resetOnDeath();

    // Reset pill state on death
    this.pillSystem.resetOnDeath();

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

  startInvulnerabilityBlink(): Phaser.Tweens.Tween {
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
