/** What every enemy needs to exist: its sprite, its floor, cleanup, and its behaviour driven by the run clock. */
import Phaser from 'phaser';
import { AudioManager } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { addContactShadow } from '../../effects/ContactShadow';
import { KillZone, type ZoneState } from '../../effects/KillZone';
import { LandingShadow } from '../../effects/LandingShadow';
import { ATLAS, SPRITE_SCALE, fitBody, frameOf, playLoop } from '../../config/sprites';
import { Floor } from '../Player';
import { EnemyPlan, EnemyState, Lane, OBSTACLE_SINK, laneY } from './behaviours';

/** A stretch of one lane, for the kill-zone look. */
export interface Stretch { lane: Lane; x0: number; x1: number }
import { ENEMIES, EnemyId, enemyState, placeOf, shotSpan } from './cast';

/** Contact shadow width against the obstacle's hitbox. */
const SHADOW_WIDTH = 1.8;

/** Default hitbox ratios used by most obstacles. */
const DEFAULT_HITBOX = { w: 0.6, h: 0.7 };

/** A swatter's hitbox height, frame px: low on the lane, where it lies flat. */
const SWATTER_BODY_H = 18;

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
  /**
   * Something went off (a shot aerosol can): every enemy within `radius` of it along both lanes goes down with it, and
   * the roach too if it is that close (dying of `cause`). Solo only, like the gun.
   */
  blast(source: Phaser.Physics.Arcade.Sprite, radius: number, cause: string): void;
}

/**
 * How the run's pistol meets an enemy (systems/RunGun.ts), kept on its main sprite as 'shootable'. kit.enemy gives
 * every enemy one from its plan; a spawn file changes what it needs to.
 */
export interface Shootable {
  /** Where along `lane` a bullet meets it at run time t, or null when it would fly past. */
  span(lane: Lane, t: number): { x0: number; x1: number } | null;
  /** Bullets still to take. */
  hits: number;
  /** Hit but still standing (the robot vacuum's first shot). */
  onHit?(hitsLeft: number): void;
  /**
   * Down, shot or caught in a blast: return true to see to its own end (the aerosol's fuse); otherwise it bursts and
   * goes at once.
   */
  onDown?(by: 'shot' | 'blast'): boolean;
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
    const place = placeOf(plan.id);
    const sprite = this.createSprite(now.x + place.dx, now.y + place.dy, def.art, def.type, opts.shadow === false ? null : plan.lane, { hitbox: def.hitbox });
    if (def.footprint) {
      // A swatter hurts along the stretch it lands on: a box that wide, low on the lane, under its flat pose
      const w = def.footprint / SPRITE_SCALE;
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      body.setSize(w, SWATTER_BODY_H, false);
      body.setOffset((sprite.width - w) / 2, sprite.height * def.frame.pivotY - SWATTER_BODY_H);
    }
    sprite.setData('telegraphs', def.telegraphs);
    sprite.setData('plan', plan);
    const shootable: Shootable = { span: (lane, t) => shotSpan(plan, t, lane), hits: def.hits ?? 1 };
    sprite.setData('shootable', shootable);
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
    const place = placeOf(plan.id);
    const shadow = sprite.getData('shadow') as Phaser.GameObjects.Image | undefined;
    const shadowAlpha = shadow?.alpha ?? 1;
    let landing: LandingShadow | null = null;
    let before: EnemyState | null = null;
    const update = (): void => {
      if (!sprite.body?.enable) {
        landing?.hide();
        return;
      }
      const now = enemyState(plan, this.scene.runTime);
      sprite.setPosition(now.x + place.dx, now.y + place.dy);
      // Far back in the room it is behind both ledges; close, in front of its lane
      sprite.setDepth(now.behind ? DEPTH.BEHIND_LEDGE : DEPTH.OBSTACLES);
      if (now.frame !== undefined) sprite.setFrame(frameOf(def.art, now.frame));
      // Where its hit will come down: the shared landing shadow, from the start of its tell until it lands
      if (now.landings) (landing ??= new LandingShadow(this.scene)).show(now.landings);
      else landing?.hide();
      sprite.setData('floor', now.lane);
      sprite.setData('harmless', !now.danger);
      if (shadow) {
        shadow.x = sprite.x;
        // Coming down onto its lane, the landing shadow is its shadow: its own would be a second, off to one side
        const comingDown = now.landings?.some(l => l.lane === now.lane) ?? false;
        shadow.setVisible(now.lane !== null && !comingDown);
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
    sprite.once('destroy', () => landing?.destroy());
    this.track(sprite, { updates: [update] });
  }

  /**
   * The run's one kill-zone look (effects/KillZone.ts) under an enemy: call the updater every frame with the stretch
   * that is about to be deadly (warn) and the stretches that are deadly now (kill), each on its lane, or nothing. What
   * is passed must be what hurts (the behaviour's own zones and warning). It goes with the sprite.
   */
  hazard(sprite: Phaser.GameObjects.GameObject): (warn: Stretch | Stretch[] | null, kill?: Stretch[]) => void {
    const zones: KillZone[] = [];
    sprite.once('destroy', () => zones.forEach(z => z.destroy()));
    return (warn, kill = []) => {
      const warns = warn === null ? [] : Array.isArray(warn) ? warn : [warn];
      const all: [Stretch, ZoneState][] = [
        ...warns.map(w => [w, 'warn'] as [Stretch, ZoneState]),
        ...kill.map(k => [k, 'kill'] as [Stretch, ZoneState]),
      ];
      while (zones.length < all.length) zones.push(new KillZone(this.scene));
      zones.forEach((zone, i) => {
        const entry = all[i];
        if (!entry) { zone.hide(); return; }
        const [stretch, state] = entry;
        zone.show(laneY(stretch.lane) - OBSTACLE_SINK, stretch.x0, stretch.x1, state);
      });
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
