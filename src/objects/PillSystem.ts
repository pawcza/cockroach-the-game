import Phaser from 'phaser';
import {
  PILL_SPEED_MULTIPLIER,
  PILL_DURATION,
  PILL_WARN_TIME,
  DEPTH,
} from '../config/constants';
import { neonStyle, popupStyle, headingStyle } from '../utils/TextStyles';
import { AudioManager } from '../audio/AudioManager';

export class PillSystem {
  private scene: Phaser.Scene;
  private audio: AudioManager;
  private sprite: Phaser.Physics.Arcade.Sprite;
  private setInvulnerable: (val: boolean) => void;
  private isDeadFn: () => boolean;

  private _isPillActive = false;
  private _pillSpeedBoost = 1;
  private pillRainbowTimer: Phaser.Time.TimerEvent | null = null;
  private pillTrailTimer: Phaser.Time.TimerEvent | null = null;
  private _pillStartTime = 0;
  private _isPillWarning = false;
  private pillSpeedLines: Phaser.GameObjects.Rectangle[] = [];
  private pillOverlay!: Phaser.GameObjects.Rectangle;

  constructor(
    scene: Phaser.Scene,
    audio: AudioManager,
    sprite: Phaser.Physics.Arcade.Sprite,
    setInvulnerable: (val: boolean) => void,
    isDeadFn: () => boolean,
  ) {
    this.scene = scene;
    this.audio = audio;
    this.sprite = sprite;
    this.setInvulnerable = setInvulnerable;
    this.isDeadFn = isDeadFn;
  }

  // --- Getters ---
  get isPillActive(): boolean { return this._isPillActive; }
  get isPillWarning(): boolean { return this._isPillWarning; }
  get speedBoost(): number { return this._pillSpeedBoost; }
  get pillStartTime(): number { return this._pillStartTime; }

  createOverlay(): void {
    const w = this.scene.cameras.main.width;
    const h = this.scene.cameras.main.height;
    this.pillOverlay = this.scene.add.rectangle(w / 2, h / 2, w, h, 0xff00ff, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.PILL_OVERLAY)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  reset(): void {
    this._isPillActive = false;
    this._pillSpeedBoost = 1;
    if (this.pillRainbowTimer) { this.pillRainbowTimer.destroy(); this.pillRainbowTimer = null; }
    if (this.pillTrailTimer) { this.pillTrailTimer.destroy(); this.pillTrailTimer = null; }
    this._pillStartTime = 0;
    this.pillSpeedLines.forEach(l => l.destroy());
    this.pillSpeedLines = [];
    this._isPillWarning = false;
  }

  update(): void {
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
    if (this._isPillActive) {
      if (this._isPillWarning) {
        const blinkOn = Math.floor(this.scene.time.now / 100) % 2 === 0;
        if (blinkOn) {
          this.sprite.setTint(0xff00ff);
          this.sprite.setAlpha(1);
        } else {
          this.sprite.clearTint();
          this.sprite.setAlpha(0.4);
        }
        this.sprite.setScale(0.30);
        this.pillOverlay.setFillStyle(0xff00ff, blinkOn ? 0.1 : 0);
      } else {
        const t = this.scene.time.now * 0.003;
        const r = Math.floor((Math.sin(t) + 1) * 127);
        const g = Math.floor((Math.sin(t + 2.094) + 1) * 127);
        const b = Math.floor((Math.sin(t + 4.189) + 1) * 127);
        this.pillOverlay.setFillStyle(Phaser.Display.Color.GetColor(r, g, b), 0.15 + Math.sin(t * 1.5) * 0.05);

        const throb = 0.30 + Math.sin(this.scene.time.now * 0.01) * 0.02;
        this.sprite.setScale(throb);
      }
    }
  }

  activatePill(px: number, py: number): void {
    this.audio.playPill();

    // If pill already active, refresh the duration
    this._isPillActive = true;
    this._pillSpeedBoost = PILL_SPEED_MULTIPLIER;
    this.setInvulnerable(true);

    // --- "PIGULKA!" floating text ---
    const pillText = this.scene.add.text(px, py - 30, 'PIGULKA!', neonStyle());
    pillText.setOrigin(0.5);
    pillText.setDepth(DEPTH.POPUP);
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
    const scorePopup = this.scene.add.text(px, py, '+100', popupStyle());
    scorePopup.setOrigin(0.5);
    scorePopup.setDepth(DEPTH.POPUP);
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
        if (!this._isPillActive || this.isDeadFn()) return;
        const hue = (this.scene.time.now * 0.5) % 360;
        const color = Phaser.Display.Color.HSLToColor(hue / 360, 1, 0.6);
        this.sprite.setTint(color.color);
        this.sprite.setAlpha(0.7 + Math.sin(this.scene.time.now * 0.02) * 0.3);
      },
    });

    // --- Rainbow afterimage trail ---
    if (this.pillTrailTimer) this.pillTrailTimer.destroy();
    this.pillTrailTimer = this.scene.time.addEvent({
      delay: 80,
      repeat: -1,
      callback: () => {
        if (!this._isPillActive || this.isDeadFn()) return;
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
      this.sprite.x,
      this.sprite.y,
      this.sprite.texture.key,
      this.sprite.frame.name,
    );
    afterimage.setScale(this.sprite.scaleX, this.sprite.scaleY);
    afterimage.setAlpha(0.5);
    afterimage.setFlipY(this.sprite.flipY);

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
      if (!this._isPillActive || this.isDeadFn()) return;
      const lineY = Phaser.Math.Between(0, this.scene.cameras.main.height);
      const lineWidth = Phaser.Math.Between(40, 120);
      const lineColors = [0xff00ff, 0x00ffff, 0xffff00, 0xff0088, 0x00ff88];
      const color = lineColors[Math.floor(Math.random() * lineColors.length)];
      const line = this.scene.add.rectangle(
        this.scene.cameras.main.width + lineWidth, lineY,
        lineWidth, 2, color, 0.6,
      );
      line.setScrollFactor(0);
      line.setDepth(DEPTH.PILL_SPEED_LINES);
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
    this.setInvulnerable(false);
    this._pillStartTime = 0;

    if (this.pillRainbowTimer) {
      this.pillRainbowTimer.destroy();
      this.pillRainbowTimer = null;
    }
    if (this.pillTrailTimer) {
      this.pillTrailTimer.destroy();
      this.pillTrailTimer = null;
    }

    this.sprite.clearTint();
    this.sprite.setAlpha(1);
    this.sprite.setScale(0.30);

    this.pillOverlay.setFillStyle(0x000000, 0);

    this.pillSpeedLines.forEach(l => l.destroy());
    this.pillSpeedLines = [];

    this.scene.cameras.main.flash(200, 255, 255, 255);

    const endText = this.scene.add.text(
      this.scene.cameras.main.width / 2, this.scene.cameras.main.height / 2 - 20,
      'KONIEC JAZDY!', headingStyle({ color: '#ffff00' }),
    );
    endText.setOrigin(0.5);
    endText.setScrollFactor(0);
    endText.setDepth(DEPTH.POPUP);
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

  resetOnDeath(): void {
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
  }
}
