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
import {
  ATLAS,
  HOP_MS,
  ROACH_FEET_OFFSET,
  SPRITE_SCALE,
  fitRoachBody,
  frameOf,
  hopY,
} from '../config/sprites';
import { AudioManager } from '../audio/AudioManager';
import { addContactShadow } from '../effects/ContactShadow';
import { fadeAndDestroy } from '../utils/TweenPatterns';
import { PillEffect } from './PillEffect';

export type Floor = 'top' | 'bottom';

const ROACH_SHADOW_WIDTH = 104;
const SHADOW_HOP_SHRINK = 0.4;
/** After the pill: still unhurt and still crushing, long enough to clear whatever is on screen at top speed. */
const PILL_GRACE_MS = 1200;
const GRACE_BLINK_MS = 70;

export class Player {
  private scene: Phaser.Scene;
  private audio: AudioManager;

  // Sprite
  private cockroach!: Phaser.Physics.Arcade.Sprite;
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
  private pillGraceUntil = 0;
  private pill: PillEffect;

  private shadow!: Phaser.GameObjects.Image;

  // Floor positions
  private floorTopY: number;
  private floorBottomY: number;

  private shadowScaleX = 1;
  private shadowScaleY = 1;

  // Lane hop: the lane counts from the press, the sprite, its body and its shadow travel over
  private hopTween: Phaser.Tweens.Tween | null = null;
  private hopTargetY = 0;
  private hopShadowY = 0;
  private hopLift = 0;
  private inBossStance = false;

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
  /** Nothing hurts: the countdown and boss blink, a pill, and the pill's grace after it. */
  get isInvulnerable(): boolean { return this._isInvulnerable || this.crushesObstacles; }
  /** On a pill, and for its grace after, obstacles the roach touches are punted away instead of killing it. */
  get crushesObstacles(): boolean {
    return !this._isDead && (this._isPillActive || this.scene.time.now < this.pillGraceUntil);
  }
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
      ATLAS,
      frameOf('roach-idle'),
    );
    this.cockroach.setCollideWorldBounds(false);
    this.cockroach.setFlipY(false);
    this.cockroach.setScale(SPRITE_SCALE);
    this.cockroach.setDepth(DEPTH.PICKUPS);
    fitRoachBody(this.cockroach);
    this.cockroach.y = this.laneY('bottom');
    this.cockroach.play('roach-idle');

    this.pill.create(this.cockroach);

    this.shadow = addContactShadow(this.scene, this.cockroach.x, this.floorBottomY, ROACH_SHADOW_WIDTH);
    this.shadowScaleX = this.shadow.scaleX;
    this.shadowScaleY = this.shadow.scaleY;
    const followShadow = () => this.updateShadow();
    this.scene.events.on('postupdate', followShadow);
    this.scene.events.once('shutdown', () => this.scene.events.off('postupdate', followShadow));
  }

  private updateShadow(): void {
    const { x, visible } = this.cockroach;
    const floorY = this._currentFloor === 'top' ? this.floorTopY : this.floorBottomY;
    this.shadow.setPosition(x, this.hopTween ? this.hopShadowY : floorY);
    // Smaller and fainter at the top of the arc, so the shadow reads as the ground under a jump
    this.shadow.setScale(this.shadowScaleX * (1 - SHADOW_HOP_SHRINK * this.hopLift), this.shadowScaleY * (1 - SHADOW_HOP_SHRINK * this.hopLift));
    this.shadow.setAlpha(1 - SHADOW_HOP_SHRINK * this.hopLift);
    this.shadow.setVisible(visible && !this._isDead);
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
    this.pillGraceUntil = 0;
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
    this.updatePillGrace();
    // Legs speed up with the run. A hop plays out first, then the run picks up again
    if (!this._isDead && !this.hopTween) {
      const animation = this._isDashing ? 'roach-dash' : 'roach-run';
      if (this.cockroach.anims.getName() !== animation) this.cockroach.play(animation);
      this.cockroach.anims.timeScale = this._isDashing ? 1 : this._speedMultiplier;
    }

    if (this._isPillActive) {
      this.pill.update(this._isPillWarning, this._pillStartTime);
    } else if (!this._isDashing && !this._isInvulnerable && this._dashReady) {
      this.cockroach.clearTint();
    }
  }

  swapLane(): void {
    const toTop = this._currentFloor === 'bottom';
    this._currentFloor = toTop ? 'top' : 'bottom';
    this.cockroach.setVelocityY(0);
    if (toTop) this.audio.playJump();
    else this.audio.playFloorSwitch();
    this.startHop(this.laneY(this._currentFloor));
  }

  private laneY(floor: Floor): number {
    return (floor === 'top' ? this.floorTopY : this.floorBottomY) - ROACH_FEET_OFFSET;
  }

  get isHopping(): boolean { return this.hopTween !== null; }

  /**
   * The hitbox and shadow travel with the art, so what you see is what can hit you. The lane itself still counts from
   * the press, so leaving a lane is instant and multiplayer events don't change.
   */
  private startHop(targetY: number): void {
    this.hopTween?.destroy();
    const fromY = this.cockroach.y;
    const fromShadowY = this.shadow.y;
    const toShadowY = this._currentFloor === 'top' ? this.floorTopY : this.floorBottomY;
    this.hopTargetY = targetY;
    this.hopShadowY = fromShadowY;
    this.hopLift = 0;
    const body = this.cockroach.body as Phaser.Physics.Arcade.Body;
    body.allowGravity = false;
    body.setVelocityY(0);
    if (!this.inBossStance) {
      this.cockroach.anims.timeScale = 1;
      this.cockroach.play('roach-hop');
    }
    this.hopTween = this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: HOP_MS,
      ease: 'Sine.easeInOut',
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 0;
        this.cockroach.y = hopY(fromY, targetY, t);
        this.hopShadowY = Phaser.Math.Linear(fromShadowY, toShadowY, t);
        this.hopLift = Math.sin(t * Math.PI);
      },
      onComplete: () => this.endHop(true),
    });
  }

  private endHop(landed: boolean): void {
    if (!this.hopTween) return;
    this.hopTween.destroy();
    this.hopTween = null;
    this.hopLift = 0;
    if (landed) this.cockroach.y = this.hopTargetY;
    const body = this.cockroach.body as Phaser.Physics.Arcade.Body;
    body.allowGravity = true;
    body.setVelocityY(0);
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
    this.pillGraceUntil = 0;
    this.pill.start(px, py);
    this._isPillWarning = false;
    this._pillStartTime = this.scene.time.now;
  }

  private endPillEffect(): void {
    this.stopPill();
    this.pill.showEnd();
    // Still crushing for a moment, blinking, so the pill never ends with the roach inside an obstacle
    this.pillGraceUntil = this.scene.time.now + PILL_GRACE_MS;
  }

  /** The blink that says the pill's grace is running out. Runs every frame; a no-op outside the grace. */
  private updatePillGrace(): void {
    if (this.pillGraceUntil === 0) return;
    if (this._isDead || this._isPillActive) { this.pillGraceUntil = 0; return; }
    const left = this.pillGraceUntil - this.scene.time.now;
    if (left > 0) {
      this.cockroach.setAlpha(Math.floor(left / GRACE_BLINK_MS) % 2 ? 0.35 : 1);
      return;
    }
    this.pillGraceUntil = 0;
    this.cockroach.setAlpha(1).clearTint();
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
    this.endHop(false);

    // Dies where it stood, on the ledge and above the dimming world, so the flip and the kicking read
    this.cockroach.anims.timeScale = 1;
    this.cockroach.play('roach-death');
    this.cockroach.setVelocity(0, 0);
    (this.cockroach.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    this.cockroach.setAlpha(1).clearTint().setDepth(DEPTH.VFX_TEXT);
  }

  freezeForCountdown(): void {
    this.cockroach.setVelocity(0, 0);
    (this.cockroach.body as Phaser.Physics.Arcade.Body).allowGravity = false;
  }

  startRunning(): void {
    this.endHop(false);
    this.cockroach.y = this.laneY('bottom');
    this.cockroach.setVelocity(0, 0);
    (this.cockroach.body as Phaser.Physics.Arcade.Body).allowGravity = true;
  }

  /** Up on its hind legs for the boss, the same art turned upright. */
  enterBossStance(): void {
    this.inBossStance = true;
    this.cockroach.stop();
    this.cockroach.setFrame(frameOf('roach-idle'));
  }

  /** Reset cockroach after boss fight. Only undoes the stance and angle. */
  resumeAfterBossFight(): void {
    this.inBossStance = false;
    this.endHop(true);
    this.cockroach.setAngle(0);
    this.cockroach.clearTint();
  }

  /** Force-end pill and dash effects immediately. */
  forceEndEffects(): void {
    this.endHop(true);
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
