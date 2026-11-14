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
  DEPTH,
} from '../config/constants';
import {
  ATLAS,
  FLIP_HOP_MS,
  HOP_MS,
  ROACH_FEET_OFFSET,
  SPRITE_SCALE,
  fitRoachBody,
  frameOf,
  hopY,
} from '../config/sprites';
import { AudioManager, VOL } from '../audio/AudioManager';
import { addContactShadow } from '../effects/ContactShadow';
import { getFx, roachGhost, type TrailHandle } from '../effects/Fx';
import { popup } from '../effects/Popup';
import { popupStyle } from '../utils/TextStyles';
import { RunPistol } from './RunPistol';
import { dress, parseRoach, pistolPoint, PLAIN, roachAnim, type Look, type RoachAnim, type Worn } from '../config/skins';
import { PillEffect } from './PillEffect';

export type Floor = 'top' | 'bottom';

const ROACH_SHADOW_WIDTH = 104;
const SHADOW_HOP_SHRINK = 0.4;
/** After the pill: still unhurt and still crushing, long enough to clear whatever is on screen at top speed. */
const PILL_GRACE_MS = 1200;
const GRACE_BLINK_MS = 70;
/** The wylinka: the world stands still this long (real time) when the shell comes off, and the roach blinks this long after. */
const MOULT_HIT_STOP_MS = 90;
const MOULT_GRACE_MS = 1500;
/** The roach while it dashes: 1 is solid, its teal afterimages the cue. Set it to 0.5 for the old see-through dash. */
const DASH_ALPHA = 1;

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
  private dashTrail: TrailHandle | null = null;
  private _dashStartTime = 0;
  /** The dash under way was forced (forceDash): no cooldown after it. */
  private cooldownWaived = false;

  // Invulnerability
  private _isInvulnerable = false;
  private moultGraceUntil = 0;

  /** The share of forward speed something is sucking away this frame (setPull), and what the last frame's was. */
  private pull = 0;
  private pulledBy = 0;

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
  private _lastHop: { at: number; from: Floor } | null = null;
  // What the roach wears: its skin's animations, and things on its head and back
  private look: Look = PLAIN;
  private worn: Worn[] = [];
  /** The pistol it carries through the run once the gun is earned (solo). */
  private pistol: RunPistol | null = null;
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
  /** 0 just after a dash, 1 when the next is ready: the dash and its cooldown as one sweep. */
  get dashCharge(): number {
    if (this._dashReady) return 1;
    return Phaser.Math.Clamp((this.scene.time.now - this._dashStartTime) / (DASH_DURATION + DASH_COOLDOWN), 0, 1);
  }
  /** Nothing hurts: the countdown and boss blink, a pill, and the pill's grace after it. */
  get isInvulnerable(): boolean { return this._isInvulnerable || this.crushesObstacles; }
  /** On a pill, and for its grace after, obstacles the roach touches are punted away instead of killing it. */
  get crushesObstacles(): boolean {
    return !this._isDead && (this._isPillActive || this.scene.time.now < this.pillGraceUntil);
  }
  /** Just shed its shell: hits in a boss fight, which have no overlap check of their own, must pass through. */
  get inMoultGrace(): boolean { return this.scene.time.now < this.moultGraceUntil; }
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
      frameOf(this.anim('idle')),
    );
    this.cockroach.setCollideWorldBounds(false);
    this.cockroach.setFlipY(false);
    this.cockroach.setScale(SPRITE_SCALE);
    this.cockroach.setDepth(DEPTH.PICKUPS);
    fitRoachBody(this.cockroach);
    // The boss fight's frames are taller: the hitbox is measured from the pivot again whenever the frame changes
    const refit = () => fitRoachBody(this.cockroach);
    this.cockroach.on(Phaser.Animations.Events.ANIMATION_START, refit);
    this.cockroach.on(Phaser.Animations.Events.ANIMATION_UPDATE, refit);
    // Armed, every move (the catch, a shot, a lane flip) ends back on aiming
    this.cockroach.on(Phaser.Animations.Events.ANIMATION_COMPLETE, (animation: Phaser.Animations.Animation) => {
      const done = parseRoach(animation.key)?.anim;
      if (this.inBossStance && !this._isDead && (done === 'catch' || done === 'shoot' || done === 'flip')) {
        this.cockroach.play(this.anim('aim'));
      }
    });
    this.cockroach.y = this.laneY('bottom');
    this.cockroach.play(this.anim('idle'));
    this.worn = dress(this.scene, this.cockroach, this.look);
    this.pistol = new RunPistol(this.scene, this.cockroach);

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
    this._lastHop = null;
    this._currentFloor = 'bottom';
    this._isDead = false;
    this._currentSpeed = COCKROACH_BASE_SPEED;
    this._speedMultiplier = 1;
    this._isDashing = false;
    this._dashReady = true;

    this.dashTrail?.stop();
    this.dashTrail = null;
    this._isInvulnerable = true;
    this.pillGraceUntil = 0;
    this.moultGraceUntil = 0;
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

    // Auto-run (flat dash boost + pill multiplier), less what sucks at it; a dash breaks free of that
    const dashBoost = this._isDashing ? DASH_SPEED_BOOST : 0;
    const drag = this._isDashing ? 0 : this.pull;
    this.pulledBy = drag;
    this.pull = 0;
    this.cockroach.setVelocityX((this._currentSpeed + dashBoost) * this._pillSpeedBoost * (1 - drag));
  }

  /**
   * Something sucks at the roach (the vacuum): this share of its forward speed goes, this frame only (the strongest
   * pull counts). Local to this client: its position reports carry it to the others like any speed.
   */
  setPull(share: number): void {
    this.pull = Math.max(this.pull, Math.min(.9, share));
  }

  /** Being pulled right now (as of the last speed update): for the strain it shows. */
  get pulled(): boolean {
    return this.pulledBy > 0;
  }

  updateDash(): void {
    if (this._dashStartTime > 0 && !this._dashReady) {
      const dashElapsed = this.scene.time.now - this._dashStartTime;
      if (this._isDashing && dashElapsed >= DASH_DURATION) {
        this.endDash();
      }
      if (!this._isDashing && (dashElapsed >= DASH_DURATION + DASH_COOLDOWN || this.cooldownWaived)) {
        this._dashReady = true;
        this._dashStartTime = 0;
        this.cooldownWaived = false;
        this.playDashReadyEffect();
      }
    }
  }

  /**
   * A dash whatever the cooldown, done for the player: the first dash lesson's rescue at its wall. Its own cooldown is
   * waived, so the dash is ready again the moment it ends.
   */
  forceDash(): void {
    if (this._isDashing) return;
    this.startDash();
    this.cooldownWaived = true;
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
      const animation = this.anim(this._isDashing ? 'dash' : 'run');
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
    this._lastHop = { at: this.scene.time.now, from: this._currentFloor };
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

  private anim(name: RoachAnim): string {
    return roachAnim(name, this.look);
  }

  /** Dresses the roach: its skin from the next animation on, and what it wears at once. */
  setLook(look: Look): void {
    this.look = look;
    this.worn.forEach(item => item.destroy());
    this.worn = this.cockroach ? dress(this.scene, this.cockroach, look) : [];
    if (this.cockroach) {
      const playing = parseRoach(this.cockroach.anims.getName() ?? '');
      if (playing) this.cockroach.play(this.anim(playing.anim));
    }
  }

  /** When the last lane change was pressed, and the lane it left. */
  get lastHop(): { at: number; from: Floor } | null { return this._lastHop; }

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
    this.cockroach.anims.timeScale = 1;
    // Armed, it changes lanes with a somersault, pistol in hand
    this.cockroach.play(this.anim(this.inBossStance ? 'flip' : 'hop'));
    this.hopTween = this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: this.inBossStance ? FLIP_HOP_MS : HOP_MS,
      ease: 'Sine.easeInOut',
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 0;
        this.cockroach.y = hopY(fromY, targetY, t);
        this.hopShadowY = Phaser.Math.Linear(fromShadowY, toShadowY, t);
        this.hopLift = Math.sin(t * Math.PI);
      },
      onComplete: () => { this.audio.playHopLand(); this.endHop(true); this.kickDust('dust-land', 0); },
    });
    // A new tween spends its first frame taking its start values, which left the roach standing in the lane it had
    // just left for a frame after the press. Taking them now, the very next frame already carries it off
    this.hopTween.update(0);
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

    this.audio.playDash();
    if (DASH_ALPHA < 1) this.cockroach.setAlpha(DASH_ALPHA);

    // A kick of dust off the ledge, speed lines past it, and teal afterimages of its own frames left behind
    const fx = getFx(this.scene);
    this.kickDust('skid', -30);
    for (let i = 0; i < 3; i++) {
      fx.play('streak-teal', this.cockroach.x + 30 + Math.random() * 70, this.cockroach.y - 24 + i * 16 + Math.random() * 6, {
        depth: this.cockroach.depth + 0.1, delay: i * 50,
      });
    }
    this.dashTrail = fx.trail(this.cockroach, () => roachGhost(this.cockroach.frame.name, 'teal'), 60, {
      depth: this.cockroach.depth - 0.1, life: 240, fadeOut: 160,
    });
  }

  /** Dust off the ledge under the roach, dx px behind (negative) or ahead of its middle. */
  private kickDust(name: string, dx: number): void {
    if (this._isDead) return;
    getFx(this.scene).play(name, this.cockroach.x + dx, this.cockroach.y + ROACH_FEET_OFFSET, { depth: this.cockroach.depth - 0.5 });
  }

  private endDash(): void {
    this._isDashing = false;
    if (DASH_ALPHA < 1) this.cockroach.setAlpha(1);
    this.dashTrail?.stop();
    this.dashTrail = null;
    this.kickDust('skid', 10);

    // Clear whatever the dash ended inside of, or it would kill on the next frame: knocked out of the world in a poof
    const body = this.cockroach.body as Phaser.Physics.Arcade.Body;
    const bounds = new Phaser.Geom.Rectangle(body.x, body.y, body.width, body.height);
    const obstacles = this.scene.data.get('obstacles') as Phaser.Physics.Arcade.Group | undefined;
    obstacles?.getChildren().forEach((obj) => {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      const other = sprite.body as Phaser.Physics.Arcade.Body;
      if (!other.enable) return;
      const hit = new Phaser.Geom.Rectangle(other.x, other.y, other.width, other.height);
      if (Phaser.Geom.Intersects.RectangleToRectangle(bounds, hit)) {
        getFx(this.scene).play('poof', sprite.x, sprite.getCenter().y, { depth: sprite.depth + 0.1 });
        sprite.destroy();
      }
    });
  }

  private playDashReadyEffect(): void {
    if (this._isDead) return;

    this.audio.playSfx('dash-ready', VOL.pickup);

    // The roach lights up for a moment and a glint flares on its head
    this.flashWhite(120);
    getFx(this.scene).play('glint', this.cockroach.x + (this.cockroach.flipX ? -56 : 56), this.cockroach.y - 8, {
      depth: this.cockroach.depth + 1,
    });
  }

  /** The roach lit white for ms: its own silhouette over it, or a tint fill for frames that have none. */
  private flashWhite(ms: number): void {
    const { cockroach } = this;
    const ghost = roachGhost(cockroach.frame.name, 'white');
    if (ghost) {
      getFx(this.scene).play(ghost.name, 0, 0, {
        follow: cockroach, frame: ghost.frame, life: ms, fadeOut: ms / 2, depth: cockroach.depth + 0.5, light: true,
        flipX: cockroach.flipX, flipY: cockroach.flipY,
      });
      return;
    }
    cockroach.setTintFill(0xffffff);
    this.scene.time.delayedCall(ms, () => { if (!this._isDead) cockroach.clearTint(); });
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
    this.audio.playSfx('pill-end', VOL.pickup);
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
    this.dashTrail?.stop();
    this.dashTrail = null;
    this._isDashing = false;
    this._dashReady = true;

    this.stopPill();
    this.endHop(false);

    // Dies where it stood, on the ledge and above the dimming world, so the flip and the kicking read
    this.cockroach.anims.timeScale = 1;
    this.cockroach.play(this.anim('death'));
    this.cockroach.setVelocity(0, 0);
    (this.cockroach.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    this.cockroach.setAlpha(1).clearTint().setDepth(DEPTH.VFX_TEXT);
  }

  /**
   * The wylinka: a hit that would have killed sheds the shell instead. A pale copy of the roach's current frame is left
   * behind and tumbles off, the world stops for a beat with a flash, and the roach blinks unhurt for a moment. The
   * caller has already spent the charge and punts whatever hit it.
   */
  moult(): void {
    const { scene, cockroach } = this;
    this.audio.playSfx('moult-pop', VOL.boss);

    // The shell pops off with a spark and a ring, tumbles up and away behind, and bits of it scatter. The hit-stop
    // below holds all of it for a beat before it flies
    const fx = getFx(scene);
    fx.play('shell', cockroach.x, cockroach.y, {
      depth: cockroach.depth - 0.1, vx: -160, vy: -520, gravity: 1500, life: 820, fadeOut: 200, loop: true,
    });
    fx.burst('chunk-shell', cockroach.x, cockroach.y - 6, 7, 18, {
      depth: cockroach.depth + 0.1, speed: [160, 320], angle: [190, 340], gravity: 1100, life: 600, fadeOut: 180, loop: true,
    });
    fx.play('spark-big', cockroach.x + 24, cockroach.y - 8, { depth: cockroach.depth + 0.2 });
    fx.play('shield', cockroach.x, cockroach.y, { depth: cockroach.depth + 0.2 });
    popup(scene, cockroach.x, cockroach.y - 70, 'WYLINKA!', popupStyle({ color: '#f1e3c6', strokeThickness: 4 }), { hold: 600 });

    scene.cameras.main.flash(100, 255, 255, 255);
    scene.cameras.main.shake(160, 0.01);
    this.flashWhite(110);

    // Hit-stop on the wall clock: the scene's own timers would stand still with it
    scene.physics.pause();
    window.setTimeout(() => {
      if (scene.sys.isActive() && !scene.time.paused) scene.physics.resume();
    }, MOULT_HIT_STOP_MS);

    this.moultGraceUntil = scene.time.now + MOULT_GRACE_MS;
    const blink = this.startInvulnerabilityBlink();
    scene.time.delayedCall(MOULT_GRACE_MS, () => this.endInvulnerability(blink));
  }

  /** Watching a run you joined too late for: out of it from the start, unseen and untouchable. */
  benchForWatching(): void {
    this._isDead = true;
    this.cockroach.setVisible(false);
    this.shadow.setVisible(false);
    (this.cockroach.body as Phaser.Physics.Arcade.Body).enable = false;
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

  /** Up on its hind legs for the boss: it rears up and waits, front legs raised, for the pistol to come down. */
  enterBossStance(): void {
    this.inBossStance = true;
    this.cockroach.anims.timeScale = 1;
    this.cockroach.play(this.anim('rear'));
  }

  /** Where the falling pistol is caught, in the world: its grip, as the catch's first frame holds it. */
  get catchPoint(): { x: number; y: number } {
    return pistolPoint(this.cockroach, 'catch', 0, 'grip');
  }

  /** The pistol lands in its hands: it brings it down and aims. */
  catchPistol(): void {
    this.cockroach.play(this.anim('catch'));
  }

  /**
   * Fires: the recoil plays, then it aims again. Returns where the shot leaves, the muzzle as it aims: the same
   * height above the sprite whatever frame is showing, so shots cross the boss's lanes as they always have.
   */
  shoot(): { x: number; y: number } {
    const muzzle = pistolPoint(this.cockroach, 'aim', 0, 'muzzle');
    if (!this.hopTween) this.cockroach.play(this.anim('shoot'));
    return muzzle;
  }

  /** Carrying the pistol through the run, or not. */
  carryPistol(on: boolean): void {
    this.pistol?.setShown(on);
  }

  /** A shot in the run: the carried pistol kicks. Returns where the bullet leaves. */
  runShoot(): { x: number; y: number } {
    return this.pistol?.fire() ?? { x: this.cockroach.x + 40, y: this.cockroach.y - 30 };
  }

  /** The boss is down: a twirl of the pistol, which it tosses away, and back on all six. */
  celebrate(): void {
    this.cockroach.play(this.anim('win'));
  }

  /** Back to running after the boss fight, on all six and without the pistol. */
  resumeAfterBossFight(): void {
    this.inBossStance = false;
    this.endHop(true);
    this.cockroach.clearTint();
    this.cockroach.play(this.anim('run'));
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
    // On and off, not a fade: a blink in whole steps
    return this.scene.tweens.add({
      targets: this.cockroach,
      alpha: { from: 1, to: 0.3 },
      duration: 120,
      ease: 'Stepped',
      easeParams: [1],
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
