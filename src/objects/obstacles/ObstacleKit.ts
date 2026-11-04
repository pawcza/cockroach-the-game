/** What every obstacle needs to exist: its sprite, its floor, cleanup, and a shared source of randomness. */
import Phaser from 'phaser';
import { AudioManager } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { addContactShadow } from '../../effects/ContactShadow';
import { ATLAS, SPRITE_SCALE, fitBody, frameOf, playLoop } from '../../config/sprites';
import { SeededRNG } from '../../multiplayer/SeededRNG';
import { Floor } from '../Player';

/** Obstacles stand this far into the floor's top edge, like the roach's feet. */
const OBSTACLE_SINK = 6;

/** Contact shadow width against the obstacle's hitbox. */
const SHADOW_WIDTH = 1.5;

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
  /** The run's own clock (ms of play, paused with the game). Every client of a match reads about the same value. */
  runTime: number;
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
    return this.scene.floorTopY + OBSTACLE_SINK;
  }

  get bottomY(): number {
    return this.scene.floorBottomY + OBSTACLE_SINK;
  }

  /** Where an obstacle's baseline sits on this floor. */
  standY(floor: Floor): number {
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
    art: string,
    type: string,
    floor: Floor | null,
    opts?: { hitbox?: { w: number; h: number } },
  ): Phaser.Physics.Arcade.Sprite {
    const sprite = this.obstacles.create(x, y, ATLAS, frameOf(art)) as Phaser.Physics.Arcade.Sprite;
    sprite.setScale(SPRITE_SCALE);
    sprite.setDepth(DEPTH.OBSTACLES);
    sprite.setImmovable(true);
    sprite.setData('floor', floor);
    sprite.setData('type', type);
    (sprite.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    // Centred in the art, so the forgiving margin is even all round. A swinging obstacle's box doesn't swing
    fitBody(sprite, opts?.hitbox ?? DEFAULT_HITBOX, true);
    playLoop(sprite, art);
    if (floor) this.plant(sprite, floor);

    return sprite;
  }

  /** A bare obstacle from its own texture, for one not drawn in the atlas. */
  createPlain(x: number, y: number, key: string): Phaser.Physics.Arcade.Sprite {
    return this.obstacles.create(x, y, key) as Phaser.Physics.Arcade.Sprite;
  }

  /** Adds a contact shadow that follows the obstacle along its ledge. */
  private plant(sprite: Phaser.Physics.Arcade.Sprite, floor: Floor): void {
    const shadow = addContactShadow(this.scene, sprite.x, this.standY(floor), sprite.body!.width * SHADOW_WIDTH);
    sprite.setData('shadow', shadow);
    this.track(sprite, { updates: [() => { shadow.x = sprite.x; }], objects: [shadow] });
  }

  /**
   * An update that turns a patrolling sprite to face the way it is moving, the frame it turns. The cat and bison art
   * face left, so moving right is the flipped one.
   */
  faceTravel(sprite: Phaser.Physics.Arcade.Sprite): () => void {
    let lastX = sprite.x;
    return () => {
      const dx = sprite.x - lastX;
      lastX = sprite.x;
      if (dx > 0) sprite.setFlipX(true);
      else if (dx < 0) sprite.setFlipX(false);
    };
  }

  /** An obstacle that floats between the two floors. */
  createFloater(
    x: number,
    art: string,
    type: string,
    duration: number,
    sound: { key: string; volume: number },
    opts?: { hitbox?: { w: number; h: number } },
  ): Phaser.Physics.Arcade.Sprite {
    const startTop = this.random() > 0.5;

    const sprite = this.createSprite(x, startTop ? this.topY : this.bottomY, art, type, null, opts);
    this.playSoundOnVisible(sprite, sound.key, sound.volume);
    this.track(sprite, { updates: [this.swing(sprite, 'y', sprite.y, startTop ? this.bottomY : this.topY, duration)] });
    return sprite;
  }

  /**
   * Moves a property from one value to another and back, eased, on the run's clock rather than from the moment this
   * client spawned it: each client spawns an obstacle at its own moment, so a tween would put the same cat in a
   * different place on every screen. Where in its swing it starts comes from its x, so neighbours don't move as one.
   * Stops for good once the body is off (falling with its ledge, or punted by the pill), so those tweens own it.
   */
  swing(sprite: Phaser.Physics.Arcade.Sprite, prop: 'x' | 'y', from: number, to: number, halfMs: number): () => void {
    const offset = (Math.abs(Math.round(from)) * 37) % (halfMs * 2);
    return () => {
      if (!sprite.body?.enable) return;
      const t = ((this.scene.runTime + offset) % (halfMs * 2)) / halfMs;
      const there = t <= 1 ? t : 2 - t;
      sprite[prop] = from + (to - from) * (1 - Math.cos(Math.PI * there)) / 2;
    };
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
