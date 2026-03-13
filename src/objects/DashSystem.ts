import Phaser from 'phaser';
import {
  DASH_DURATION,
  DASH_COOLDOWN,
  DASH_SPEED_BOOST,
} from '../config/constants';
import { AudioManager } from '../audio/AudioManager';

export class DashSystem {
  private scene: Phaser.Scene;
  private audio: AudioManager;
  private sprite: Phaser.Physics.Arcade.Sprite;
  private isDeadFn: () => boolean;

  private _isDashing = false;
  private _dashCooldown = 0;
  private _dashReady = true;
  private dashTrailTimer: Phaser.Time.TimerEvent | null = null;
  private _dashStartTime = 0;
  private speedMultiplier = 1;

  constructor(
    scene: Phaser.Scene,
    audio: AudioManager,
    sprite: Phaser.Physics.Arcade.Sprite,
    isDeadFn: () => boolean,
  ) {
    this.scene = scene;
    this.audio = audio;
    this.sprite = sprite;
    this.isDeadFn = isDeadFn;
  }

  // --- Getters ---
  get isDashing(): boolean { return this._isDashing; }
  get dashReady(): boolean { return this._dashReady; }
  get dashStartTime(): number { return this._dashStartTime; }

  get speedBoost(): number {
    return this._isDashing ? DASH_SPEED_BOOST : 0;
  }

  reset(): void {
    this._isDashing = false;
    this._dashCooldown = 0;
    this._dashReady = true;
    if (this.dashTrailTimer) { this.dashTrailTimer.destroy(); }
    this.dashTrailTimer = null;
    this._dashStartTime = 0;
  }

  update(speedMultiplier: number): void {
    this.speedMultiplier = speedMultiplier;

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

  startDash(): void {
    this._isDashing = true;
    this._dashReady = false;
    this._dashStartTime = this.scene.time.now;

    this.sprite.setAlpha(0.5);
    this.sprite.setTint(0xffffaa);

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
    this.sprite.setAlpha(1);
    this.sprite.clearTint();

    if (this.dashTrailTimer) {
      this.dashTrailTimer.destroy();
      this.dashTrailTimer = null;
    }

    // Destroy any obstacles currently overlapping the cockroach so they don't kill on next frame
    const cockroachBounds = this.sprite.getBounds();
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
      this.sprite.x,
      this.sprite.y,
      this.sprite.texture.key,
      this.sprite.frame.name,
    );
    afterimage.setScale(this.sprite.scaleX, this.sprite.scaleY);
    afterimage.setAlpha(0.4);
    const trailColors = [0xffff00, 0xff6600, 0xff00ff, 0x00ffff, 0x00ff00];
    const colorIndex = Math.floor(this.speedMultiplier) % trailColors.length;
    afterimage.setTint(trailColors[colorIndex]);
    afterimage.setFlipY(this.sprite.flipY);

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
    if (this.isDeadFn()) return;

    this.sprite.setTint(0x00ffff);
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: { from: 1, to: 0.4 },
      duration: 150,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        this.sprite.clearTint();
        this.sprite.setAlpha(1);
      },
    });

    const dashText = this.scene.add.text(
      this.sprite.x, this.sprite.y - 50,
      'Pr\u0119dkozapierdalacz', {
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

  resetOnDeath(): void {
    if (this.dashTrailTimer) {
      this.dashTrailTimer.destroy();
      this.dashTrailTimer = null;
    }
    this._isDashing = false;
    this._dashReady = true;
  }
}
