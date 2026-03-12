import Phaser from 'phaser';
import {
  COCKROACH_START_X,
  COCKROACH_BASE_SPEED,
  COCKROACH_ACCELERATION,
  DASH_DURATION,
  DASH_COOLDOWN,
  DASH_SPEED_BOOST,
  PILL_SPEED_MULTIPLIER,
  PILL_DURATION,
  PILL_WARN_TIME,
  SPEED_BOOST_PER_LEVEL,
} from '../config/constants';
import { AudioManager } from '../audio/AudioManager';

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
  private _dashCooldown = 0;
  private _dashReady = true;
  private dashTrailTimer: Phaser.Time.TimerEvent | null = null;
  private _dashStartTime = 0;

  // Invulnerability
  private _isInvulnerable = false;

  // Pill
  private _isPillActive = false;
  private _pillSpeedBoost = 1;
  private pillRainbowTimer: Phaser.Time.TimerEvent | null = null;
  private pillTrailTimer: Phaser.Time.TimerEvent | null = null;
  private _pillStartTime = 0;
  private _isPillWarning = false;
  private pillSpeedLines: Phaser.GameObjects.Rectangle[] = [];
  private pillOverlay!: Phaser.GameObjects.Rectangle;

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
  get isDashing(): boolean { return this._isDashing; }
  get dashReady(): boolean { return this._dashReady; }
  get dashStartTime(): number { return this._dashStartTime; }
  get isInvulnerable(): boolean { return this._isInvulnerable; }
  get isPillActive(): boolean { return this._isPillActive; }
  get isPillWarning(): boolean { return this._isPillWarning; }
  get pillSpeedBoost(): number { return this._pillSpeedBoost; }
  get pillStartTime(): number { return this._pillStartTime; }
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

    // Pill psychedelic overlay (hidden by default)
    const w = this.scene.cameras.main.width;
    const h = this.scene.cameras.main.height;
    this.pillOverlay = this.scene.add.rectangle(w / 2, h / 2, w, h, 0xff00ff, 0)
      .setScrollFactor(0)
      .setDepth(989)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  resetState(): void {
    this._currentFloor = 'bottom';
    this._isDead = false;
    this._currentSpeed = COCKROACH_BASE_SPEED;
    this._speedMultiplier = 1;
    this._isDashing = false;
    this._dashCooldown = 0;
    this._dashReady = true;
    if (this.dashTrailTimer) { this.dashTrailTimer.destroy(); }
    this.dashTrailTimer = null;
    this._isInvulnerable = true;
    this._dashStartTime = 0;
    this._isPillActive = false;
    this._pillSpeedBoost = 1;
    if (this.pillRainbowTimer) { this.pillRainbowTimer.destroy(); this.pillRainbowTimer = null; }
    if (this.pillTrailTimer) { this.pillTrailTimer.destroy(); this.pillTrailTimer = null; }
    this._pillStartTime = 0;
    this.pillSpeedLines.forEach(l => l.destroy());
    this.pillSpeedLines = [];
    this._isPillWarning = false;
  }

  updateSpeed(activePlayTime: number, currentLevel: number): void {
    const elapsedSeconds = activePlayTime / 1000;
    const levelBonus = (currentLevel - 1) * SPEED_BOOST_PER_LEVEL;
    this._currentSpeed = COCKROACH_BASE_SPEED + elapsedSeconds * COCKROACH_ACCELERATION + levelBonus;
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
        if (this.pillTrailTimer) {
          this.pillTrailTimer.destroy();
          this.pillTrailTimer = null;
        }
        if (this.pillRainbowTimer) {
          this.pillRainbowTimer.destroy();
          this.pillRainbowTimer = null;
        }
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
      const frameInterval = Math.max(60, 200 / this._speedMultiplier);
      this.runAnimTimer += this.scene.game.loop.delta;
      if (this.runAnimTimer >= frameInterval) {
        this.runAnimTimer = 0;
        this.runAnimFrame = (this.runAnimFrame + 1) % this.runFrames.length;
        this.cockroach.setTexture(this.runFrames[this.runAnimFrame]);
      }
    }

    if (this._isPillActive) {
      if (this._isPillWarning) {
        const blinkOn = Math.floor(this.scene.time.now / 100) % 2 === 0;
        if (blinkOn) {
          this.cockroach.setTint(0xff00ff);
          this.cockroach.setAlpha(1);
        } else {
          this.cockroach.clearTint();
          this.cockroach.setAlpha(0.4);
        }
        this.cockroach.setScale(0.30);
        this.pillOverlay.setFillStyle(0xff00ff, blinkOn ? 0.1 : 0);
      } else {
        const t = this.scene.time.now * 0.003;
        const r = Math.floor((Math.sin(t) + 1) * 127);
        const g = Math.floor((Math.sin(t + 2.094) + 1) * 127);
        const b = Math.floor((Math.sin(t + 4.189) + 1) * 127);
        this.pillOverlay.setFillStyle(Phaser.Display.Color.GetColor(r, g, b), 0.15 + Math.sin(t * 1.5) * 0.05);

        const throb = 0.30 + Math.sin(this.scene.time.now * 0.01) * 0.02;
        this.cockroach.setScale(throb);
      }
    } else if (this._speedMultiplier >= 3 && !this._isDashing && !this._isInvulnerable) {
      const glowIntensity = Math.min((this._speedMultiplier - 3) / 5, 1);
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

    // Destroy any obstacles currently overlapping the cockroach so they don't kill on next frame
    const cockroachBounds = this.cockroach.getBounds();
    const obstacles = this.scene.data.get('obstacles') as Phaser.Physics.Arcade.Group | undefined;
    if (obstacles) {
      obstacles.getChildren().forEach((obj) => {
        const sprite = obj as Phaser.Physics.Arcade.Sprite;
        if (sprite.getBounds().contains(cockroachBounds.centerX, cockroachBounds.centerY)) {
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
  }

  private spawnAfterimage(): void {
    const afterimage = this.scene.add.sprite(
      this.cockroach.x,
      this.cockroach.y,
      this.cockroach.texture.key,
      this.cockroach.frame.name,
    );
    afterimage.setScale(this.cockroach.scaleX, this.cockroach.scaleY);
    afterimage.setAlpha(0.4);
    const trailColors = [0xffff00, 0xff6600, 0xff00ff, 0x00ffff, 0x00ff00];
    const colorIndex = Math.floor(this._speedMultiplier) % trailColors.length;
    afterimage.setTint(trailColors[colorIndex]);
    afterimage.setFlipY(this.cockroach.flipY);

    this.scene.tweens.add({
      targets: afterimage,
      alpha: 0,
      duration: 200,
      onComplete: () => {
        afterimage.destroy();
      },
    });
  }

  private playDashReadyEffect(): void {
    if (this._isDead) return;
    this.cockroach.setTint(0x00ffff);
    this.scene.tweens.add({
      targets: this.cockroach,
      alpha: { from: 1, to: 0.4 },
      duration: 150,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        this.cockroach.clearTint();
        this.cockroach.setAlpha(1);
      },
    });

    const dashText = this.scene.add.text(
      this.cockroach.x, this.cockroach.y - 50,
      'Prędkozapierdalacz', {
        fontSize: '9px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#00ffff',
        stroke: '#000000',
        strokeThickness: 3,
      },
    );
    dashText.setOrigin(0.5);
    dashText.setDepth(999);
    this.scene.tweens.add({
      targets: dashText,
      y: dashText.y - 30,
      alpha: 0,
      duration: 800,
      ease: 'Power2',
      onComplete: () => dashText.destroy(),
    });
  }

  activatePill(px: number, py: number): void {
    this.audio.playPill();

    // If pill already active, refresh the duration
    this._isPillActive = true;
    this._pillSpeedBoost = PILL_SPEED_MULTIPLIER;
    this._isInvulnerable = true;

    // --- "PIGULKA!" floating text ---
    const pillText = this.scene.add.text(px, py - 30, 'PIGULKA!', {
      fontSize: '16px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#ff00ff',
      stroke: '#000000',
      strokeThickness: 5,
      shadow: {
        offsetX: 2,
        offsetY: 2,
        color: '#00ffff',
        blur: 10,
        fill: true,
        stroke: true,
      },
    });
    pillText.setOrigin(0.5);
    pillText.setDepth(999);
    this.scene.tweens.add({
      targets: pillText,
      y: pillText.y - 60,
      alpha: 0,
      scale: 2,
      duration: 1200,
      ease: 'Power2',
      onComplete: () => pillText.destroy(),
    });

    // --- Score popup ---
    const scorePopup = this.scene.add.text(px, py, '+100', {
      fontSize: '12px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#00ffff',
      stroke: '#000000',
      strokeThickness: 3,
    });
    scorePopup.setOrigin(0.5);
    scorePopup.setDepth(999);
    this.scene.tweens.add({
      targets: scorePopup,
      y: scorePopup.y - 40,
      alpha: 0,
      duration: 800,
      ease: 'Power2',
      onComplete: () => scorePopup.destroy(),
    });

    // --- Screen flash ---
    this.scene.cameras.main.flash(300, 180, 0, 255);

    // --- Rainbow blink on cockroach ---
    if (this.pillRainbowTimer) this.pillRainbowTimer.destroy();
    this.pillRainbowTimer = this.scene.time.addEvent({
      delay: 60,
      repeat: -1,
      callback: () => {
        if (!this._isPillActive || this._isDead) return;
        const hue = (this.scene.time.now * 0.5) % 360;
        const color = Phaser.Display.Color.HSLToColor(hue / 360, 1, 0.6);
        this.cockroach.setTint(color.color);
        this.cockroach.setAlpha(0.7 + Math.sin(this.scene.time.now * 0.02) * 0.3);
      },
    });

    // --- Rainbow afterimage trail ---
    if (this.pillTrailTimer) this.pillTrailTimer.destroy();
    this.pillTrailTimer = this.scene.time.addEvent({
      delay: 80,
      repeat: -1,
      callback: () => {
        if (!this._isPillActive || this._isDead) return;
        this.spawnPillAfterimage();
      },
    });

    // --- Speed lines ---
    this.startPillSpeedLines();

    // --- Pill overlay activation ---
    this.pillOverlay.setFillStyle(0xff00ff, 0.1);

    // --- Track pill start time ---
    this._isPillWarning = false;
    this._pillStartTime = this.scene.time.now;
  }

  private spawnPillAfterimage(): void {
    const afterimage = this.scene.add.sprite(
      this.cockroach.x,
      this.cockroach.y,
      this.cockroach.texture.key,
      this.cockroach.frame.name,
    );
    afterimage.setScale(this.cockroach.scaleX, this.cockroach.scaleY);
    afterimage.setAlpha(0.5);
    afterimage.setFlipY(this.cockroach.flipY);

    const rainbowColors = [0xff0000, 0xff8800, 0xffff00, 0x00ff00, 0x00ffff, 0x0088ff, 0xff00ff];
    const colorIdx = Math.floor(this.scene.time.now / 60) % rainbowColors.length;
    afterimage.setTint(rainbowColors[colorIdx]);

    this.scene.tweens.add({
      targets: afterimage,
      alpha: 0,
      scaleX: afterimage.scaleX * 1.3,
      scaleY: afterimage.scaleY * 1.3,
      duration: 300,
      onComplete: () => afterimage.destroy(),
    });
  }

  private startPillSpeedLines(): void {
    this.pillSpeedLines.forEach(l => l.destroy());
    this.pillSpeedLines = [];

    const spawnLine = () => {
      if (!this._isPillActive || this._isDead) return;
      const lineY = Phaser.Math.Between(0, this.scene.cameras.main.height);
      const lineWidth = Phaser.Math.Between(40, 120);
      const lineColors = [0xff00ff, 0x00ffff, 0xffff00, 0xff0088, 0x00ff88];
      const color = lineColors[Math.floor(Math.random() * lineColors.length)];
      const line = this.scene.add.rectangle(
        this.scene.cameras.main.width + lineWidth, lineY,
        lineWidth, 2, color, 0.6,
      );
      line.setScrollFactor(0);
      line.setDepth(988);
      line.setBlendMode(Phaser.BlendModes.ADD);
      this.pillSpeedLines.push(line);

      this.scene.tweens.add({
        targets: line,
        x: -lineWidth,
        alpha: 0,
        duration: 200 + Math.random() * 200,
        ease: 'Linear',
        onComplete: () => {
          const idx = this.pillSpeedLines.indexOf(line);
          if (idx >= 0) this.pillSpeedLines.splice(idx, 1);
          line.destroy();
        },
      });
    };

    this.scene.time.addEvent({
      delay: 60,
      repeat: Math.floor(PILL_DURATION / 60),
      callback: spawnLine,
    });
  }

  private endPillEffect(): void {
    this._isPillActive = false;
    this._isPillWarning = false;
    this._pillSpeedBoost = 1;
    this._isInvulnerable = false;
    this._pillStartTime = 0;

    if (this.pillRainbowTimer) {
      this.pillRainbowTimer.destroy();
      this.pillRainbowTimer = null;
    }
    if (this.pillTrailTimer) {
      this.pillTrailTimer.destroy();
      this.pillTrailTimer = null;
    }

    this.cockroach.clearTint();
    this.cockroach.setAlpha(1);
    this.cockroach.setScale(0.30);

    this.pillOverlay.setFillStyle(0x000000, 0);

    this.pillSpeedLines.forEach(l => l.destroy());
    this.pillSpeedLines = [];

    this.scene.cameras.main.flash(200, 255, 255, 255);

    const endText = this.scene.add.text(
      this.scene.cameras.main.width / 2, this.scene.cameras.main.height / 2 - 20,
      'KONIEC JAZDY!', {
        fontSize: '18px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#ffff00',
        stroke: '#000000',
        strokeThickness: 5,
      },
    );
    endText.setOrigin(0.5);
    endText.setScrollFactor(0);
    endText.setDepth(999);
    this.scene.tweens.add({
      targets: endText,
      y: endText.y - 50,
      alpha: 0,
      scale: 1.5,
      duration: 1500,
      ease: 'Power2',
      onComplete: () => endText.destroy(),
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

    // Reset pill state on death
    if (this._isPillActive) {
      this._isPillActive = false;
      this._isPillWarning = false;
      this._pillSpeedBoost = 1;
      if (this.pillRainbowTimer) { this.pillRainbowTimer.destroy(); this.pillRainbowTimer = null; }
      if (this.pillTrailTimer) { this.pillTrailTimer.destroy(); this.pillTrailTimer = null; }
      this._pillStartTime = 0;
      this.pillOverlay.setFillStyle(0x000000, 0);
      this.pillSpeedLines.forEach(l => l.destroy());
      this.pillSpeedLines = [];
    }

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
