/** What every enemy needs to exist: its sprite, its floor, cleanup, and its behaviour driven by the run clock. */
import Phaser from 'phaser';
import { AudioManager } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { addContactShadow } from '../../effects/ContactShadow';
import { ATLAS, SPRITE_SCALE, fitBody, frameOf, playLoop } from '../../config/sprites';
import { Floor } from '../Player';
import { EnemyPlan, EnemyState, OBSTACLE_SINK, laneY } from './behaviours';

type Warn = NonNullable<EnemyState['warn']>;
/** A lane band's height: the roach's body, a little more. */
const BAND_H = 60;
import { ENEMIES, EnemyId, enemyState } from './cast';

/** Contact shadow width against the obstacle's hitbox. */
const SHADOW_WIDTH = 1.5;

/** Default hitbox ratios used by most obstacles. */
const DEFAULT_HITBOX = { w: 0.6, h: 0.7 };

/** A swatter's hitbox height, frame px: low on the lane, where it lies flat. */
const SWATTER_BODY_H = 18;
/** Its landing shadow starts this wide (of its footprint) and grows to the full stretch. */
const MARK_MIN = .3;
const MARK_H = 10;

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
  /** Something sucks at the roach this frame (the vacuum): this share of its forward speed is taken away. Local. */
  pullRoach(share: number): void;
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

  /**
   * Nothing here draws from the seed: what an enemy is, its lane and its phase come in its plan (cast.ts), so the course
   * stays the same on every client. Cosmetics use Math.random.
   */
  constructor(scene: ObstacleScene, obstacles: Phaser.Physics.Arcade.Group, audio: AudioManager) {
    this.scene = scene;
    this.obstacles = obstacles;
    this.audio = audio;
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
   * An enemy's sprite where its plan puts it now, with its hitbox and data. Planted with a contact shadow unless it
   * floats free of the lanes. Start it with `drive`.
   */
  enemy(plan: EnemyPlan, opts: { shadow?: boolean } = {}): Phaser.Physics.Arcade.Sprite {
    const def = ENEMIES[plan.id as EnemyId];
    const now = enemyState(plan, this.scene.runTime);
    const sprite = this.createSprite(now.x, now.y, def.art, def.type, opts.shadow === false ? null : plan.lane, { hitbox: def.hitbox });
    if (def.footprint) {
      // A swatter hurts along the stretch it lands on: a box that wide, low on the lane, under its flat pose
      const w = def.footprint / SPRITE_SCALE;
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      body.setSize(w, SWATTER_BODY_H, false);
      body.setOffset((sprite.width - w) / 2, sprite.height * def.frame.pivotY - SWATTER_BODY_H);
    }
    sprite.setData('telegraphs', def.telegraphs);
    sprite.setData('plan', plan);
    return sprite;
  }

  /**
   * Moves an enemy as its behaviour says, on the run's clock rather than from the moment this client spawned it: each
   * client spawns at its own moment, so a tween would put the same cat in a different place on every screen. Sets
   * the lane it threatens and whether it can hurt now, for the collision rule, and carries its shadow to its lane.
   * `onChange` gets each frame's state and the one before, for poses, sounds and effects. Stops for good once the
   * body is off (falling with its ledge, or punted), so those tweens own it.
   */
  drive(
    sprite: Phaser.Physics.Arcade.Sprite,
    plan: EnemyPlan,
    onChange?: (now: EnemyState, before: EnemyState | null) => void,
  ): void {
    const def = ENEMIES[plan.id as EnemyId];
    const shadow = sprite.getData('shadow') as Phaser.GameObjects.Image | undefined;
    const shadowAlpha = shadow?.alpha ?? 1;
    let mark: Phaser.GameObjects.Ellipse[] | null = null;
    let before: EnemyState | null = null;
    const update = (): void => {
      if (!sprite.body?.enable) {
        mark?.forEach(m => m.setVisible(false));
        return;
      }
      const now = enemyState(plan, this.scene.runTime);
      sprite.setPosition(now.x, now.y);
      // Far back in the room it is behind both ledges; close, in front of its lane
      sprite.setDepth(now.behind ? DEPTH.BEHIND_LEDGE : DEPTH.OBSTACLES);
      if (now.frame !== undefined) sprite.setFrame(frameOf(def.art, now.frame));
      // A swatter's landing spot: a shadow exactly where it will land, growing and darkening as it comes
      // Landing spots: each a dark patch with a darker core, flat on the ledge
      const marks = now.marks ?? (now.mark ? [now.mark] : []);
      if (marks.length) {
        mark ??= [];
        while (mark.length < marks.length * 2) mark.push(this.scene.add.ellipse(0, 0, 10, 10, 0x000000).setDepth(DEPTH.CONTACT_SHADOW));
        marks.forEach((m, i) => {
          const p = m.progress;
          const width = (def.footprint ?? sprite.body!.width) * (MARK_MIN + (1 - MARK_MIN) * p);
          const y = laneY(m.lane) - 1;
          mark![i * 2].setPosition(m.x, y).setSize(width, MARK_H).setFillStyle(0x000000, .25 + .35 * p).setVisible(true);
          mark![i * 2 + 1].setPosition(m.x, y).setSize(width * .6, MARK_H * .6).setFillStyle(0x000000, .2 + .3 * p).setVisible(true);
        });
        for (let i = marks.length * 2; i < mark.length; i++) mark[i].setVisible(false);
      } else {
        mark?.forEach(m => m.setVisible(false));
      }
      sprite.setData('floor', now.lane);
      sprite.setData('harmless', !now.danger);
      if (shadow) {
        shadow.x = now.x;
        shadow.setVisible(now.lane !== null);
        if (now.lane) {
          shadow.y = laneY(now.lane);
          // Fainter the higher it is over its lane: the shadow under a raised slipper is its cue
          shadow.setAlpha(shadowAlpha * Phaser.Math.Clamp(1 - (laneY(now.lane) - now.y) / 200, 0.6, 1));
        }
      }
      onChange?.(now, before);
      before = now;
    };
    update();
    sprite.once('destroy', () => mark?.forEach(m => m.destroy()));
    this.track(sprite, { updates: [update] });
  }

  /**
   * A hard-edged band over a stretch of one lane, as tall as the roach (world px; clipped to the screen): the warning,
   * or the light, of something that closes a lane. Returns its updater; it goes with the sprite.
   */
  laneBand(sprite: Phaser.GameObjects.GameObject, colour: number, depth: number, light = false): (warn?: Warn, alpha?: number) => void {
    const band = this.scene.add.rectangle(0, 0, 10, BAND_H, colour, 1).setOrigin(0, 1).setDepth(depth).setVisible(false);
    if (light) band.setBlendMode(Phaser.BlendModes.ADD);
    sprite.once('destroy', () => band.destroy());
    return (warn, alpha = 1) => {
      if (!warn || alpha <= 0) {
        band.setVisible(false);
        return;
      }
      const camera = this.scene.cameras.main;
      const x0 = Math.max(warn.x0, camera.scrollX - 8);
      const x1 = Math.min(warn.x1, camera.scrollX + camera.width + 8);
      if (x1 <= x0) {
        band.setVisible(false);
        return;
      }
      band.setPosition(x0, laneY(warn.lane) + 2).setSize(x1 - x0, BAND_H).setAlpha(alpha).setVisible(true);
    };
  }

  /** Whether the sprite is on screen and still ahead of the roach: where an attack's sound is worth playing. */
  isAhead(sprite: Phaser.GameObjects.Components.Transform): boolean {
    const camera = this.scene.cameras.main;
    return sprite.x >= this.scene.cockroach.x && sprite.x <= camera.scrollX + camera.width;
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
