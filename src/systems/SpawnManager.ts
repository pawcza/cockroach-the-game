import Phaser from 'phaser';
import { addContactShadow } from '../effects/ContactShadow';
import {
  COCKROACH_START_X,
  APPLE_SPAWN_CHANCE,
  PILL_SPAWN_CHANCE,
  BEER_SPAWN_CHANCE,
  SPAWN_DISTANCE_AHEAD,
  MIN_OBSTACLE_SPACING,
  DEPTH,
} from '../config/constants';
import { ATLAS, SPRITE_SCALE, fitBody, frameOf, playLoop } from '../config/sprites';
import { getLevelForDistance } from '../config/levels';
import { popupStyle } from '../utils/TextStyles';
import { ObstacleSpawner } from '../objects/ObstacleSpawner';
import { SeededRNG } from '../multiplayer/SeededRNG';
import { Floor } from '../objects/Player';

/** Pickups stand this far into the floor's top edge, like the roach's feet. */
const PICKUP_SINK = 6;
const PICKUP_HITBOX = { w: 0.9, h: 0.9 };

/** Dev only: with `?pill` in the address, every solo run's first slot is a pill, for testing it. */
const FIRST_PILL = import.meta.env.DEV && new URLSearchParams(window.location.search).has('pill');

/** How far and how long an obstacle falls when its ledge crumbles, like the falling tiles. */
const FALL_DROP = 250;
const FALL_MS = 800;

export class SpawnManager {
  private scene: Phaser.Scene;
  private firstSlot = true;
  private obstacles: Phaser.Physics.Arcade.Group;
  private apples: Phaser.Physics.Arcade.Group;
  private beers: Phaser.Physics.Arcade.Group;
  private pills: Phaser.Physics.Arcade.Group;
  private obstacleSpawner: ObstacleSpawner;
  private rng: SeededRNG | null;
  private floorTopY: number;
  private floorBottomY: number;

  private nextSpawnX: number;
  private pendingPickupDestructions: number[] = [];

  constructor(
    scene: Phaser.Scene,
    obstacles: Phaser.Physics.Arcade.Group,
    apples: Phaser.Physics.Arcade.Group,
    beers: Phaser.Physics.Arcade.Group,
    pills: Phaser.Physics.Arcade.Group,
    obstacleSpawner: ObstacleSpawner,
    rng: SeededRNG | null,
    floorTopY: number,
    floorBottomY: number,
  ) {
    this.scene = scene;
    this.obstacles = obstacles;
    this.apples = apples;
    this.beers = beers;
    this.pills = pills;
    this.obstacleSpawner = obstacleSpawner;
    this.rng = rng;
    this.floorTopY = floorTopY;
    this.floorBottomY = floorBottomY;
    this.nextSpawnX = COCKROACH_START_X + 400;
  }

  advanceSpawnX(x: number): void {
    if (x > this.nextSpawnX) this.nextSpawnX = x;
  }

  handleSpawning(cameraRight: number): void {
    const spawnHorizon = cameraRight + SPAWN_DISTANCE_AHEAD;

    while (this.nextSpawnX <= spawnHorizon) {
      const slotX = this.nextSpawnX;

      const slotDistance = Math.floor((slotX - COCKROACH_START_X) / 50);
      const spawnLevel = getLevelForDistance(slotDistance).level;
      this.nextSpawnX += MIN_OBSTACLE_SPACING;

      const roll = this.rng?.next() ?? Math.random();
      const testPill = FIRST_PILL && this.firstSlot && !this.rng;
      this.firstSlot = false;
      if (testPill || roll < PILL_SPAWN_CHANCE) {
        this.spawnPill(slotX);
      } else if (roll < PILL_SPAWN_CHANCE + BEER_SPAWN_CHANCE) {
        this.spawnBeer(slotX);
      } else if (roll < PILL_SPAWN_CHANCE + BEER_SPAWN_CHANCE + APPLE_SPAWN_CHANCE) {
        this.spawnApple(slotX);
      } else {
        this.obstacleSpawner.spawn(slotX, spawnLevel);
      }
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
      if (!floor || sprite.getData('falling') || !isGap(sprite.x, floor)) continue;
      sprite.setData('falling', true);
      (sprite.body as Phaser.Physics.Arcade.Body).enable = false;
      this.scene.tweens.killTweensOf(sprite);
      (sprite.getData('shadow') as Phaser.GameObjects.Image | undefined)?.setVisible(false);
      this.scene.tweens.add({
        targets: sprite,
        y: sprite.y + FALL_DROP,
        angle: (Math.random() > 0.5 ? 1 : -1) * (20 + Math.random() * 40),
        alpha: 0,
        duration: FALL_MS,
        ease: 'Quad.easeIn',
        onComplete: () => sprite.destroy(),
      });
    }
  }

  cleanupOffscreen(cameraLeft: number, onPickupMissed: (comboLost: number) => void, currentCombo: number): void {
    this.obstacles.getChildren().forEach((obj) => {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      if (sprite.x < cameraLeft - 200) sprite.destroy();
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
  }

  showObstacleWarnings(cameraRight: number, playerFloor: 'top' | 'bottom'): void {
    const warningZoneStart = cameraRight - 50;
    const warningZoneEnd = cameraRight + 300;

    this.obstacles.getChildren().forEach((obj) => {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      if (sprite.x > warningZoneStart && sprite.x < warningZoneEnd && !sprite.getData('warned')) {
        sprite.setData('warned', true);
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

  private spawnPickup(group: Phaser.Physics.Arcade.Group, x: number, art: string): void {
    const floor: Floor = (this.rng?.next() ?? Math.random()) > 0.5 ? 'top' : 'bottom';
    const y = (floor === 'top' ? this.floorTopY : this.floorBottomY) + PICKUP_SINK;
    const sprite = group.create(x, y, ATLAS, frameOf(art)) as Phaser.Physics.Arcade.Sprite;
    sprite.setScale(SPRITE_SCALE);
    sprite.setDepth(DEPTH.PICKUPS);
    (sprite.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    sprite.setImmovable(true);
    fitBody(sprite, PICKUP_HITBOX);
    playLoop(sprite, art);

    const shadow = addContactShadow(this.scene, x, y, sprite.body!.width * 1.5);
    sprite.once('destroy', () => shadow.destroy());
  }

  private spawnPill(slotX: number): void {
    this.spawnPickup(this.pills, slotX, 'pill');
  }

  private spawnBeer(slotX: number): void {
    this.spawnPickup(this.beers, slotX, `beer-${Phaser.Math.Between(1, 6)}`);
  }

  private spawnApple(slotX: number): void {
    this.spawnPickup(this.apples, slotX, 'apple');
  }
}
