/** What every obstacle needs to exist: its sprite, its floor, cleanup, and a shared source of randomness. */
import Phaser from 'phaser';
import { AudioManager } from '../../audio/AudioManager';
import { COLORS, DEPTH } from '../../config/constants';
import { SeededRNG } from '../../multiplayer/SeededRNG';
import { outlineGlow } from '../../utils/TweenPatterns';
import { Floor } from '../Player';

/** Vertical offset from floor Y to center obstacles on the running lane. */
const OBSTACLE_OFFSET = 25;

/** Default hitbox ratios used by most obstacles. */
const DEFAULT_HITBOX = { w: 0.6, h: 0.7 };

/** How far past the screen edge an obstacle may be and still throw particles. */
const CULL_MARGIN = 100;

/** Properties ObstacleKit needs from GameScene without importing it directly. */
export interface ObstacleScene extends Phaser.Scene {
  floorTopY: number;
  floorBottomY: number;
  cockroach: Phaser.Physics.Arcade.Sprite;
  isDead: boolean;
}

interface SpriteResources {
  tweens?: Phaser.Tweens.Tween[];
  timers?: Phaser.Time.TimerEvent[];
  updates?: ((time: number, delta: number) => void)[];
  objects?: Phaser.GameObjects.GameObject[];
}

export class ObstacleKit {
  readonly scene: ObstacleScene;
  readonly audio: AudioManager;
  private obstacles: Phaser.Physics.Arcade.Group;
  private rng: SeededRNG | null;

  constructor(scene: ObstacleScene, obstacles: Phaser.Physics.Arcade.Group, audio: AudioManager, rng: SeededRNG | null) {
    this.scene = scene;
    this.obstacles = obstacles;
    this.audio = audio;
    this.rng = rng;
  }

  // ── Seeded randomness ────────────────────────────────────────────────
  // Only for what every client must agree on. Cosmetics use Math.random, or the seed desyncs.

  between(min: number, max: number): number {
    return this.rng ? this.rng.between(min, max) : Phaser.Math.Between(min, max);
  }

  random(): number {
    return this.rng ? this.rng.next() : Math.random();
  }

  randomFloor(): Floor {
    return this.random() < 0.5 ? 'top' : 'bottom';
  }

  // ── Positions ────────────────────────────────────────────────────────

  get topY(): number {
    return this.scene.floorTopY - OBSTACLE_OFFSET;
  }

  get bottomY(): number {
    return this.scene.floorBottomY - OBSTACLE_OFFSET;
  }

  centerY(floor: Floor): number {
    return floor === 'top' ? this.topY : this.bottomY;
  }

  isOnScreen(sprite: Phaser.GameObjects.Components.Transform): boolean {
    const camera = this.scene.cameras.main;
    return sprite.x >= camera.scrollX - CULL_MARGIN && sprite.x <= camera.scrollX + camera.width + CULL_MARGIN;
  }

  // ── Building an obstacle ─────────────────────────────────────────────

  /** A physics sprite with the boilerplate common to every obstacle. */
  createSprite(
    x: number,
    y: number,
    texture: string,
    type: string,
    floor: Floor | null,
    opts?: { scale?: number; hitbox?: { w: number; h: number } },
  ): Phaser.Physics.Arcade.Sprite {
    const hitbox = opts?.hitbox ?? DEFAULT_HITBOX;

    const sprite = this.obstacles.create(x, y, texture) as Phaser.Physics.Arcade.Sprite;
    sprite.setOrigin(0.5, 0.5);
    sprite.setScale(opts?.scale ?? 0.2);
    sprite.setDepth(DEPTH.OBSTACLES);
    sprite.setImmovable(true);
    sprite.setData('floor', floor);
    sprite.setData('type', type);
    (sprite.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    sprite.body!.setSize(sprite.width * hitbox.w, sprite.height * hitbox.h);
    outlineGlow(this.scene, sprite, COLORS.OBSTACLE_OUTLINE, false);

    return sprite;
  }

  /** An obstacle that floats between the two floors. */
  createFloater(
    x: number,
    texture: string,
    type: string,
    duration: number,
    sound: { key: string; volume: number },
    opts?: { hitbox?: { w: number; h: number } },
  ): { sprite: Phaser.Physics.Arcade.Sprite; floatTween: Phaser.Tweens.Tween } {
    const startTop = this.random() > 0.5;

    const sprite = this.createSprite(x, startTop ? this.topY : this.bottomY, texture, type, null, opts);
    this.playSoundOnVisible(sprite, sound.key, sound.volume);

    const floatTween = this.scene.tweens.add({
      targets: sprite,
      y: startTop ? this.bottomY : this.topY,
      duration,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    return { sprite, floatTween };
  }

  /** Plays a sound once, when the sprite scrolls into view. */
  playSoundOnVisible(sprite: Phaser.Physics.Arcade.Sprite, key: string, volume: number): void {
    const check = this.scene.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => {
        if (!sprite.active) { check.destroy(); return; }
        const camera = this.scene.cameras.main;
        if (sprite.x <= camera.scrollX + camera.width) {
          this.audio.playSfx(key, volume);
          check.destroy();
        }
      },
    });
  }

  /** Runs a cosmetic emitter on a timer for as long as the sprite is alive and on screen. */
  emitWhileOnScreen(sprite: Phaser.Physics.Arcade.Sprite, delay: number, emit: () => void): Phaser.Time.TimerEvent {
    return this.scene.time.addEvent({
      delay,
      loop: true,
      callback: () => {
        if (sprite.active && this.isOnScreen(sprite)) emit();
      },
    });
  }

  /** Ties tweens, timers, update listeners and extra objects to the sprite, so they all go when it does. */
  track(sprite: Phaser.Physics.Arcade.Sprite, resources: SpriteResources): void {
    const { tweens = [], timers = [], updates = [], objects = [] } = resources;
    for (const update of updates) this.scene.events.on('update', update);
    sprite.once('destroy', () => {
      tweens.forEach(t => t.destroy());
      timers.forEach(t => t.destroy());
      updates.forEach(update => this.scene.events.off('update', update));
      objects.forEach(object => {
        this.scene.tweens.killTweensOf(object);
        object.destroy();
      });
    });
  }
}
