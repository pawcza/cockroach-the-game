/** The pill power-up's screen and trail effects. Player owns the state that gameplay reads; this owns the show. */
import Phaser from 'phaser';
import { COLORS, DEPTH, PILL_DURATION, PILL_SCORE, PILL_WARN_TIME } from '../config/constants';
import { ROACH_FEET_OFFSET, SPRITE_SCALE } from '../config/sprites';
import { getFx, roachGhost, type FxHandle, type TrailHandle } from '../effects/Fx';
import { popup } from '../effects/Popup';
import { neonStyle, popupStyle } from '../utils/TextStyles';
import { floatingText } from '../utils/TweenPatterns';

const OVERLAY_ALPHA = 0.08;
const GHOST_EVERY_MS = 90;
const STREAK_EVERY_MS = 90;
/** The warning's blink: on and off this often. */
const BLINK_MS = 90;

export class PillEffect {
  private scene: Phaser.Scene;
  private cockroach!: Phaser.Physics.Arcade.Sprite;
  private overlay!: Phaser.GameObjects.Rectangle;
  private aura: FxHandle | null = null;
  private trail: TrailHandle | null = null;
  private streakTimer: Phaser.Time.TimerEvent | null = null;

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
    const fx = getFx(this.scene);
    floatingText(this.scene, px, py - 30, 'PIGULKA!', neonStyle(), { floatY: 60, scale: 2, duration: 1200 });
    popup(this.scene, px, py + 10, `+${PILL_SCORE}`, popupStyle({ color: '#ff9ad0' }));
    this.scene.cameras.main.flash(200, 180, 0, 255);

    // Pink and cyan flames on its back, afterimages left behind in both colours, speed lines crossing the screen
    this.stopShow();
    this.aura = fx.play('aura-pill', 0, ROACH_FEET_OFFSET, { follow: this.cockroach, depth: this.cockroach.depth - 0.2, loop: true });
    let pink = false;
    this.trail = fx.trail(this.cockroach, () => {
      pink = !pink;
      return roachGhost(this.cockroach.frame.name, pink ? 'pink' : 'cyan');
    }, GHOST_EVERY_MS, { depth: this.cockroach.depth - 0.1, life: 260, fadeOut: 180, flipY: this.cockroach.flipY });
    this.streakTimer = this.scene.time.addEvent({
      delay: STREAK_EVERY_MS,
      repeat: Math.floor(PILL_DURATION / STREAK_EVERY_MS),
      callback: () => this.spawnStreak(),
    });
    this.overlay.setFillStyle(COLORS.PILL_GLOW, OVERLAY_ALPHA);
  }

  /** The last PILL_WARN_TIME winds down: the afterimages stop and the roach and its flames blink. */
  enterWarning(): void {
    this.trail?.stop();
    this.trail = null;
  }

  update(isWarning: boolean, pillStartTime: number): void {
    if (!isWarning) return;
    const now = this.scene.time.now;
    const elapsed = now - pillStartTime;
    const fade = 1 - Math.min(1, (elapsed - (PILL_DURATION - PILL_WARN_TIME)) / PILL_WARN_TIME);
    const on = Math.floor(now / BLINK_MS) % 2 === 0;
    this.cockroach.setAlpha(on ? 1 : 0.4);
    this.aura?.image.setVisible(on);
    this.overlay.setFillStyle(COLORS.PILL_GLOW, fade * OVERLAY_ALPHA);
  }

  /** Stops everything the effect has running: flames, trail, speed lines and the overlay. */
  stop(): void {
    this.stopShow();
    this.overlay.setFillStyle(0x000000, 0);
    this.cockroach.setAlpha(1);
  }

  private stopShow(): void {
    this.aura?.stop();
    this.aura = null;
    this.trail?.stop();
    this.trail = null;
    this.streakTimer?.destroy();
    this.streakTimer = null;
  }

  showEnd(): void {
    this.cockroach.clearTint();
    this.cockroach.setScale(SPRITE_SCALE);
    this.scene.cameras.main.flash(200, 255, 255, 255);
    getFx(this.scene).play('poof', this.cockroach.x, this.cockroach.y, { depth: this.cockroach.depth + 0.1 });

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

  /** A pink or cyan line crossing the screen right to left, faster than the world. */
  private spawnStreak(): void {
    const { width, height } = this.scene.cameras.main;
    getFx(this.scene).play(Math.random() < .5 ? 'streak-pink' : 'streak-cyan', width + 8, Phaser.Math.Between(16, height - 40), {
      scrollFactor: 0, depth: DEPTH.PILL_SPEED_LINES, vx: -1400 - Math.random() * 800, frame: 0, life: 420, fadeOut: 140,
    });
  }
}
