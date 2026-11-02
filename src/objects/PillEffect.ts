/** The pill power-up's screen and trail effects. Player owns the state that gameplay reads; this owns the show. */
import Phaser from 'phaser';
import { COLORS, DEPTH, PILL_DURATION, PILL_SCORE, PILL_WARN_TIME } from '../config/constants';
import { neonStyle, popupStyle } from '../utils/TextStyles';
import { fadeAndDestroy, floatingText } from '../utils/TweenPatterns';

const BASE_SCALE = 0.30;

export class PillEffect {
  private scene: Phaser.Scene;
  private cockroach!: Phaser.Physics.Arcade.Sprite;
  private overlay!: Phaser.GameObjects.Rectangle;
  private rainbowTimer: Phaser.Time.TimerEvent | null = null;
  private trailTimer: Phaser.Time.TimerEvent | null = null;
  private speedLinesTimer: Phaser.Time.TimerEvent | null = null;
  private speedLines: Phaser.GameObjects.Rectangle[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  create(cockroach: Phaser.Physics.Arcade.Sprite): void {
    this.cockroach = cockroach;
    const { width, height } = this.scene.cameras.main;
    this.overlay = this.scene.add.rectangle(width / 2, height / 2, width, height, COLORS.PILL_GLOW, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.PILL_OVERLAY)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  resize(width: number, height: number): void {
    this.overlay.setPosition(width / 2, height / 2).setSize(width, height);
  }

  start(px: number, py: number): void {
    floatingText(this.scene, px, py - 30, 'PIGULKA!', neonStyle(), { floatY: 60, scale: 2, duration: 1200 });
    floatingText(this.scene, px, py, `+${PILL_SCORE}`, popupStyle(), { floatY: 40 });
    this.scene.cameras.main.flash(300, 180, 0, 255);

    this.rainbowTimer?.destroy();
    this.rainbowTimer = this.scene.time.addEvent({
      delay: 60,
      repeat: -1,
      callback: () => {
        const hue = (this.scene.time.now * 0.5) % 360;
        const color = Phaser.Display.Color.HSLToColor(hue / 360, 1, 0.6);
        this.cockroach.setTint(color.color);
        this.cockroach.setAlpha(0.7 + Math.sin(this.scene.time.now * 0.02) * 0.3);
      },
    });

    this.trailTimer?.destroy();
    this.trailTimer = this.scene.time.addEvent({
      delay: 80,
      repeat: -1,
      callback: () => this.spawnAfterimage(),
    });

    this.startSpeedLines();
    this.overlay.setFillStyle(COLORS.PILL_GLOW, 0.1);
  }

  /** The last PILL_WARN_TIME fades out, so the blink and the trail stop early. */
  enterWarning(): void {
    this.stopTimers(false);
  }

  update(isWarning: boolean, pillStartTime: number): void {
    const t = this.scene.time.now * 0.003;
    const color = Phaser.Display.Color.GetColor(
      Math.floor((Math.sin(t) + 1) * 127),
      Math.floor((Math.sin(t + 2.094) + 1) * 127),
      Math.floor((Math.sin(t + 4.189) + 1) * 127),
    );

    if (isWarning) {
      const elapsed = this.scene.time.now - pillStartTime;
      const warnProgress = Math.min(1, (elapsed - (PILL_DURATION - PILL_WARN_TIME)) / PILL_WARN_TIME);
      const fade = 1 - warnProgress;
      this.cockroach.setTint(color);
      this.cockroach.setAlpha(0.4 + fade * 0.6);
      this.cockroach.setScale(BASE_SCALE);
      this.overlay.setFillStyle(color, fade * 0.15);
    } else {
      this.overlay.setFillStyle(color, 0.15 + Math.sin(t * 1.5) * 0.05);
      this.cockroach.setScale(BASE_SCALE + Math.sin(this.scene.time.now * 0.01) * 0.02);
    }
  }

  /** Stops everything the effect has running: timers, speed lines and the overlay. */
  stop(): void {
    this.stopTimers(true);
    this.overlay.setFillStyle(0x000000, 0);
    this.speedLines.forEach(l => l.destroy());
    this.speedLines = [];
  }

  private stopTimers(includingSpeedLines: boolean): void {
    this.rainbowTimer?.destroy();
    this.rainbowTimer = null;
    this.trailTimer?.destroy();
    this.trailTimer = null;
    if (includingSpeedLines) {
      this.speedLinesTimer?.destroy();
      this.speedLinesTimer = null;
    }
  }

  showEnd(): void {
    this.cockroach.clearTint();
    this.cockroach.setScale(BASE_SCALE);
    this.scene.cameras.main.flash(200, 255, 255, 255);

    const { width, height } = this.scene.cameras.main;
    floatingText(
      this.scene,
      width / 2,
      height / 2 - 20,
      'KONIEC JAZDY!',
      popupStyle({ fontSize: '18px', color: '#ffff00', strokeThickness: 5 }),
      { floatY: 50, scale: 1.5, duration: 1500, scrollFactor: 0 },
    );
  }

  private spawnAfterimage(): void {
    const afterimage = this.scene.add.sprite(
      this.cockroach.x,
      this.cockroach.y,
      this.cockroach.texture.key,
      this.cockroach.frame.name,
    );
    afterimage.setScale(this.cockroach.scaleX, this.cockroach.scaleY);
    afterimage.setAlpha(0.5);
    afterimage.setFlipY(this.cockroach.flipY);

    const rainbowColors = COLORS.RAINBOW;
    const colorIdx = Math.floor(this.scene.time.now / 60) % rainbowColors.length;
    afterimage.setTint(rainbowColors[colorIdx]);

    fadeAndDestroy(this.scene, afterimage, 300, {
      scaleX: afterimage.scaleX * 1.3,
      scaleY: afterimage.scaleY * 1.3,
    });
  }

  private startSpeedLines(): void {
    this.speedLinesTimer?.destroy();
    this.speedLines.forEach(l => l.destroy());
    this.speedLines = [];

    this.speedLinesTimer = this.scene.time.addEvent({
      delay: 60,
      repeat: Math.floor(PILL_DURATION / 60),
      callback: () => this.spawnSpeedLine(),
    });
  }

  private spawnSpeedLine(): void {
    const camera = this.scene.cameras.main;
    const lineWidth = Phaser.Math.Between(40, 120);
    const lineColors = COLORS.PILL_LINES;
    const color = lineColors[Math.floor(Math.random() * lineColors.length)];
    const line = this.scene.add.rectangle(camera.width + lineWidth, Phaser.Math.Between(0, camera.height), lineWidth, 2, color, 0.6);
    line.setScrollFactor(0);
    line.setDepth(DEPTH.PILL_SPEED_LINES);
    line.setBlendMode(Phaser.BlendModes.ADD);
    this.speedLines.push(line);

    this.scene.tweens.add({
      targets: line,
      x: -lineWidth,
      alpha: 0,
      duration: 200 + Math.random() * 200,
      ease: 'Linear',
      onComplete: () => {
        const idx = this.speedLines.indexOf(line);
        if (idx >= 0) this.speedLines.splice(idx, 1);
        line.destroy();
      },
    });
  }
}
