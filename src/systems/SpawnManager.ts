import Phaser from 'phaser';
import { addContactShadow } from '../effects/ContactShadow';
import { getFx } from '../effects/Fx';
import {
  COCKROACH_START_X,
  SPAWN_DISTANCE_AHEAD,
  DEPTH,
} from '../config/constants';
import { ATLAS, SPRITE_SCALE, frameOf, playLoop } from '../config/sprites';
import { getLevelForDistance } from '../config/levels';
import { popupStyle } from '../utils/TextStyles';
import { ObstacleSpawner } from '../objects/ObstacleSpawner';
import { SeededRNG } from '../multiplayer/SeededRNG';
import { Floor } from '../objects/Player';
import { beatSpacing } from './RunPatterns';
import { BOSS_RESUME_PX, CourseLayout, SlotItem, bossX, courseEnd } from './CourseLayout';
import { BOSS_DEFEATED_EVENT } from './BossEncounter';
import { bossById, type BossDef } from './boss/bosses';
import { MULTIPLAYER_BOSS, soloLadder } from './boss/fights';

/**
 * Pickups hover in their lane's airspace, not on its ledge: their middle this high over the ledge's surface (a lane is
 * 136 px tall; the roach's body 52), bobbing a little, a soft shadow on the ledge under them. Their hitbox reaches from
 * their top down to the ledge, so a running roach of any height takes them as surely as it did off the floor.
 */
const PICKUP_HOVER = 60;
const PICKUP_BOB = 4;
const PICKUP_BOB_MS = 650;
const PICKUP_HITBOX_W = 0.9;
/** The glow's transparent margin round every atlas frame, frame px (config/sprites.ts GLOW_PAD). */
const PICKUP_PAD = 8;

/** Dev only: with `?pill` in the address, every solo run's first slot is a pill, for testing it. */
const FIRST_PILL = import.meta.env.DEV && new URLSearchParams(window.location.search).has('pill');

/** How far and how long an obstacle falls when its ledge crumbles, like the falling tiles. */
const FALL_DROP = 250;
const FALL_MS = 800;

/** How many walls of a run carry the DASH! hint. */
const WALL_HINTS = 2;

/** The dash lesson's wall stands this far ahead of the roach when the reward ends: past the grace blink at any speed. */
const DASH_LESSON_AHEAD = 1000;
/** The apples laid past it, the reward for dashing through (before it they were bait for a dash that came too early). */
const DASH_LESSON_APPLES = [180, 260, 340];
/** The gun lesson's apples, past its onion in its lane. */
const GUN_LESSON_APPLES = [90, 170, 250];

export class SpawnManager {
  private scene: Phaser.Scene;
  private firstSlot = true;
  private obstacles: Phaser.Physics.Arcade.Group;
  private apples: Phaser.Physics.Arcade.Group;
  private beers: Phaser.Physics.Arcade.Group;
  private pills: Phaser.Physics.Arcade.Group;
  /** The run's pistol's ammo boxes (solo, from level 7). */
  private ammo: Phaser.Physics.Arcade.Group;
  private obstacleSpawner: ObstacleSpawner;
  private layout: CourseLayout;
  private rng: SeededRNG | null;
  private floorTopY: number;
  private floorBottomY: number;
  /** Whether the roach can dash yet: a wall is only a wall with the dash to get through it. */
  private canDash: () => boolean;

  private nextSpawnX: number;
  /** The bosses not beaten yet, nearest first or not: the course stops short of the nearest. */
  private bosses: BossDef[];
  /** The opening tutorial lays its own stretch: until it resumes, no beat of the regular course is laid. */
  private held = false;
  private wallsShown = 0;
  private hints: Phaser.GameObjects.Text[] = [];
  private pendingPickupDestructions: number[] = [];

  constructor(
    scene: Phaser.Scene,
    obstacles: Phaser.Physics.Arcade.Group,
    apples: Phaser.Physics.Arcade.Group,
    beers: Phaser.Physics.Arcade.Group,
    pills: Phaser.Physics.Arcade.Group,
    ammo: Phaser.Physics.Arcade.Group,
    obstacleSpawner: ObstacleSpawner,
    rng: SeededRNG | null,
    floorTopY: number,
    floorBottomY: number,
    canDash: () => boolean,
    /**
     * A solo run: the course lays ammo boxes from level 7 (the gun is carried between the fights), and stops short of
     * every boss of the solo ladder; a match has its one boss.
     */
    solo: boolean,
  ) {
    this.scene = scene;
    this.obstacles = obstacles;
    this.apples = apples;
    this.beers = beers;
    this.pills = pills;
    this.ammo = ammo;
    this.obstacleSpawner = obstacleSpawner;
    this.rng = rng;
    this.layout = new CourseLayout(rng ?? { next: Math.random }, undefined, solo);
    // The bosses still to come: the course is laid up to a runway short of the nearest. A beaten boss takes every one
    // at or before its distance with it (the dev `?boss=` skip counts the earlier ones beaten)
    this.bosses = solo ? soloLadder() : [bossById(MULTIPLAYER_BOSS)];
    const onDefeated = (id: string): void => {
      const beaten = this.bosses.find(b => b.id === id);
      if (!beaten) return;
      this.bosses = this.bosses.filter(b => b.triggerDistance > beaten.triggerDistance);
      this.nextSpawnX = Math.max(this.nextSpawnX, bossX(beaten.triggerDistance) + BOSS_RESUME_PX);
    };
    scene.events.on(BOSS_DEFEATED_EVENT, onDefeated);
    scene.events.once('shutdown', () => scene.events.off(BOSS_DEFEATED_EVENT, onDefeated));
    this.floorTopY = floorTopY;
    this.floorBottomY = floorBottomY;
    this.canDash = canDash;
    this.nextSpawnX = COCKROACH_START_X + 400;
  }

  advanceSpawnX(x: number): void {
    if (x > this.nextSpawnX) this.nextSpawnX = x;
  }

  /** Nothing of the regular course is laid until `resumeSpawning`. */
  holdSpawning(): void {
    this.held = true;
  }

  /**
   * The gun is in the run now: the next wall (or cloud wall) carries the DASH! hint again, so it is plain that a bullet
   * does nothing to it and the dash still does.
   */
  hintNextWall(): void {
    this.wallsShown = Math.min(this.wallsShown, WALL_HINTS - 1);
  }

  /** The regular course starts at this x (once, after a hold). */
  resumeSpawning(fromX: number): void {
    if (!this.held) return;
    this.held = false;
    this.nextSpawnX = fromX;
  }

  handleSpawning(cameraRight: number): void {
    const spawnHorizon = cameraRight + SPAWN_DISTANCE_AHEAD;

    const end = courseEnd(this.bosses.map(b => b.triggerDistance));
    while (!this.held && this.nextSpawnX <= spawnHorizon && this.nextSpawnX < end) {
      const slotX = this.nextSpawnX;
      const slotDistance = Math.floor((slotX - COCKROACH_START_X) / 50);
      const level = getLevelForDistance(slotDistance).level;
      this.nextSpawnX += beatSpacing(level);

      const testPill = FIRST_PILL && this.firstSlot && !this.rng;
      this.firstSlot = false;
      if (testPill) this.spawnPickup(this.pills, slotX, 'pill', 'bottom');
      else this.fill(slotX, this.layout.next(slotX, level), level);
    }

    if (this.pendingPickupDestructions.length > 0) {
      this.pendingPickupDestructions = this.pendingPickupDestructions.filter(
        x => !this.destroyPickupNear(x),
      );
    }
  }

  /**
   * An obstacle standing where the ledge has crumbled falls with it, harmless from the first frame. Cosmetic only:
   * nothing seeded is drawn here.
   */
  dropObstaclesOverGaps(isGap: (x: number, floor: Floor) => boolean): void {
    for (const obj of this.obstacles.getChildren()) {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      const floor = sprite.getData('floor') as Floor | null;
      // What flies (a bird, a slipper in a hand) has no ledge to lose, nor the chasing cat, which leaps the gaps
      if (!floor || sprite.getData('flies') || sprite.getData('falling') || !isGap(sprite.x, floor)) continue;
      sprite.setData('falling', true);
      (sprite.body as Phaser.Physics.Arcade.Body).enable = false;
      this.scene.tweens.killTweensOf(sprite);
      (sprite.getData('shadow') as Phaser.GameObjects.Image | undefined)?.setVisible(false);
      // It drops straight with its ledge, unturned, in a puff of the ledge's dust
      getFx(this.scene).play('dust-land', sprite.x, floor === 'top' ? this.floorTopY : this.floorBottomY, { depth: DEPTH.OBSTACLES + 0.5 });
      this.scene.tweens.add({
        targets: sprite,
        y: sprite.y + FALL_DROP,
        alpha: 0,
        duration: FALL_MS,
        ease: 'Quad.easeIn',
        onComplete: () => sprite.destroy(),
      });
    }
  }

  /** Builds what the course planned for this slot. */
  private fill(x: number, items: SlotItem[], level: number): void {
    for (const item of items) {
      switch (item.kind) {
        case 'enemy':
          this.obstacleSpawner.spawn(item.plan);
          break;
        case 'pickup':
          this.spawnPickup(this[item.group], x, item.art, item.lane);
          break;
        case 'wall':
          // It only goes missing when a boss fight was late to load and the run got past the first boss without its
          // dash. Nothing seeded was drawn for it, so the rest of the course stays the same
          if (!this.canDash()) break;
          this.obstacleSpawner.spawnWall(x, level);
          if (this.wallsShown++ < WALL_HINTS) this.addWallHint(x);
          break;
        case 'cloud':
          // A wall that is sometimes open: laid, like a wall, only with the dash to get through it, and hinted alike
          if (!this.canDash()) break;
          this.obstacleSpawner.spawn(item.plan);
          if (this.wallsShown++ < WALL_HINTS) this.addWallHint(x - 45);
          break;
      }
    }
  }

  /**
   * Teaching the dash: one wall ahead of the roach, with apples just past it, and normal beats resume past them.
   * Laid by hand and drawing nothing from the seed, so it never moves the rest of a seeded course. Returns the wall's x.
   */
  layDashLesson(fromX: number): number {
    const x = fromX + DASH_LESSON_AHEAD;
    const level = getLevelForDistance(Math.floor((x - COCKROACH_START_X) / 50)).level;
    this.obstacleSpawner.spawnWall(x, level);
    this.addWallHint(x);
    for (const ahead of DASH_LESSON_APPLES) this.spawnPickup(this.apples, x + ahead, 'apple', 'bottom');
    this.advanceSpawnX(x + beatSpacing(level) * 2);
    return x;
  }

  /**
   * Teaching the gun, right after DJ Bigos hands it over: one onion standing in the roach's lane ahead, apples behind it
   * in that lane (the reward for shooting it out of the way), and normal beats resume past them. Laid by hand, drawing
   * nothing from the seed. Returns the onion, so the lesson knows when it is shot, and its x.
   */
  layGunLesson(fromX: number, lane: Floor): { x: number; target: Phaser.Physics.Arcade.Sprite | null } {
    const x = fromX + DASH_LESSON_AHEAD;
    const level = getLevelForDistance(Math.floor((x - COCKROACH_START_X) / 50)).level;
    const target = this.layTutorialObstacle(x, lane)[0] ?? null;
    for (const ahead of GUN_LESSON_APPLES) this.spawnPickup(this.apples, x + ahead, 'apple', lane);
    this.advanceSpawnX(x + GUN_LESSON_APPLES[GUN_LESSON_APPLES.length - 1] + beatSpacing(level) * 2);
    return { x, target };
  }

  /**
   * The tutorial's lone obstacle: an onion standing in this lane. Returns what was made, so the tutorial can take it
   * away again. Nothing seeded is drawn.
   */
  layTutorialObstacle(x: number, lane: Floor): Phaser.Physics.Arcade.Sprite[] {
    const before = new Set(this.obstacles.getChildren());
    this.obstacleSpawner.spawnBlocker(x, lane);
    return this.obstacles.getChildren().filter(o => !before.has(o)) as Phaser.Physics.Arcade.Sprite[];
  }

  layTutorialApple(x: number, lane: Floor): Phaser.Physics.Arcade.Sprite {
    return this.spawnPickup(this.apples, x, 'apple', lane);
  }

  /** Over the first walls of a run: both lanes are shut, the dash is the way through. */
  private addWallHint(x: number): void {
    // Between the ledges, just above the lower obstacle's head
    const y = (this.floorTopY + this.floorBottomY) / 2 - 12;
    const hint = this.scene.add.text(x, y, 'DASH!', popupStyle({ fontSize: '14px', color: '#ffe066', strokeThickness: 4 }))
      .setOrigin(0.5).setDepth(DEPTH.OBSTACLES + 1);
    this.scene.tweens.add({ targets: hint, scale: 1.15, duration: 300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.hints.push(hint);
  }

  cleanupOffscreen(cameraLeft: number, onPickupMissed: (comboLost: number) => void, currentCombo: number): void {
    this.hints = this.hints.filter((hint) => {
      if (hint.x >= cameraLeft - 200) return true;
      this.scene.tweens.killTweensOf(hint);
      hint.destroy();
      return false;
    });
    this.obstacles.getChildren().forEach((obj) => {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      // A chaser starts out behind the camera and takes itself away once it has run past
      if (sprite.x < cameraLeft - 200 && !sprite.getData('behind')) sprite.destroy();
    });

    let comboWasLost = false;
    const groups = [this.apples, this.beers, this.pills];
    for (const group of groups) {
      group.getChildren().forEach((obj) => {
        const sprite = obj as Phaser.Physics.Arcade.Sprite;
        if (sprite.x < cameraLeft) {
          if (!comboWasLost && currentCombo > 0) {
            comboWasLost = true;
            onPickupMissed(currentCombo);
          }
          sprite.destroy();
        }
      });
    }
    // An ammo box left behind loses no combo: it never scored
    this.ammo.getChildren().forEach((obj) => {
      if ((obj as Phaser.Physics.Arcade.Sprite).x < cameraLeft) obj.destroy();
    });
  }

  /**
   * The red "!" at the right edge: the arrival cue for an obstacle that shows nothing of its own, about to come into
   * view in your lane. Enemies that telegraph on themselves (a pose, a wind-up, a shadow) get none; the chaser, which
   * comes from behind, has its own at the left edge.
   */
  showObstacleWarnings(cameraRight: number, playerFloor: 'top' | 'bottom'): void {
    const warningZoneStart = cameraRight - 50;
    const warningZoneEnd = cameraRight + 300;

    this.obstacles.getChildren().forEach((obj) => {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      if (sprite.x > warningZoneStart && sprite.x < warningZoneEnd && !sprite.getData('warned')) {
        sprite.setData('warned', true);
        if (sprite.getData('telegraphs')) return;
        const obstacleFloor = sprite.getData('floor');
        if (obstacleFloor && obstacleFloor !== playerFloor) return;

        const camHeight = this.scene.cameras.main.height;
        const warningY = sprite.y < camHeight / 2 ? 30 : camHeight - 30;
        const warning = this.scene.add.text(this.scene.cameras.main.width - 30, warningY, '!',
          popupStyle({ color: '#ff0000' }),
        );
        warning.setOrigin(0.5);
        warning.setScrollFactor(0);
        warning.setDepth(DEPTH.WARNING);
        this.scene.tweens.add({
          targets: warning,
          alpha: 0,
          scale: 2,
          duration: 400,
          ease: 'Power2',
          onComplete: () => warning.destroy(),
        });
      }
    });
  }

  destroyPickupNear(x: number): boolean {
    const tolerance = 30;
    const groups = [this.apples, this.beers, this.pills];
    for (const group of groups) {
      for (const obj of group.getChildren()) {
        const sprite = obj as Phaser.Physics.Arcade.Sprite;
        if (Math.abs(sprite.x - x) < tolerance) {
          sprite.destroy();
          return true;
        }
      }
    }
    return false;
  }

  queuePickupDestruction(x: number): void {
    if (!this.destroyPickupNear(x)) {
      this.pendingPickupDestructions.push(x);
    }
  }

  private spawnPickup(group: Phaser.Physics.Arcade.Group, x: number, art: string, floor: Floor): Phaser.Physics.Arcade.Sprite {
    const ledge = floor === 'top' ? this.floorTopY : this.floorBottomY;
    const sprite = group.create(x, ledge, ATLAS, frameOf(art)) as Phaser.Physics.Arcade.Sprite;
    sprite.setScale(SPRITE_SCALE);
    sprite.setDepth(DEPTH.PICKUPS);
    (sprite.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    sprite.setImmovable(true);
    playLoop(sprite, art);
    // Its baseline (the pivot, the bottom of the picture) where its middle is PICKUP_HOVER over the ledge
    const content = sprite.height - PICKUP_PAD * 2;
    const lift = PICKUP_HOVER - (content * SPRITE_SCALE) / 2;
    sprite.y = ledge - lift;
    // The hitbox: its width, from its top down to the ledge (frame px)
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    const w = (sprite.width - PICKUP_PAD * 2) * PICKUP_HITBOX_W;
    const h = content + lift / SPRITE_SCALE;
    body.setSize(w, h, false);
    body.setOffset((sprite.width - w) / 2, sprite.height * sprite.originY - content);
    // A gentle bob, each its own (cosmetic: Math.random, never the seed)
    this.scene.tweens.add({
      targets: sprite, y: sprite.y - PICKUP_BOB, duration: PICKUP_BOB_MS, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      delay: Math.random() * PICKUP_BOB_MS,
    });

    const shadow = addContactShadow(this.scene, x, ledge, w * SPRITE_SCALE).setAlpha(0.6);
    sprite.once('destroy', () => { this.scene.tweens.killTweensOf(sprite); shadow.destroy(); });
    return sprite;
  }
}
