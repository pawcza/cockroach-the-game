import Phaser from 'phaser';
import {
  COCKROACH_START_X,
  APPLE_SPAWN_CHANCE,
  PILL_SPAWN_CHANCE,
  BEER_SPAWN_CHANCE,
  SPAWN_DISTANCE_AHEAD,
  MIN_OBSTACLE_SPACING,
  COLORS,
  DEPTH,
} from '../config/constants';
import { getLevelForDistance } from '../config/levels';
import { floatUpDown, pulse, attachGlow, outlineGlow } from '../utils/TweenPatterns';
import { popupStyle } from '../utils/TextStyles';
import { ObstacleSpawner } from '../objects/ObstacleSpawner';
import { SeededRNG } from '../multiplayer/SeededRNG';
import { Floor } from '../objects/Player';

/** Spawned objects stay hidden until this close to the screen: their outline shader isn't culled by Phaser. */
const SHOW_MARGIN = 250;

export class SpawnManager {
  private scene: Phaser.Scene;
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
      if (roll < PILL_SPAWN_CHANCE) {
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

    const showBefore = cameraRight + SHOW_MARGIN;
    for (const group of [this.obstacles, this.apples, this.beers, this.pills]) {
      for (const obj of group.getChildren()) {
        const sprite = obj as Phaser.Physics.Arcade.Sprite;
        sprite.setVisible(sprite.x < showBefore);
      }
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

  private spawnPickup(
    group: Phaser.Physics.Arcade.Group,
    x: number,
    textureKey: string,
    config: {
      scale: number;
      floatDistance: number;
      floatDuration: number;
      glowRadius: number;
      glowColor: number;
      glowIntensity: number;
      glowPulse?: { toAlpha: number; toScale?: number; duration: number };
      pulse?: { toScale: number; duration: number };
    },
  ): Phaser.Physics.Arcade.Sprite {
    const floor: Floor = (this.rng?.next() ?? Math.random()) > 0.5 ? 'top' : 'bottom';
    const y = (floor === 'top' ? this.floorTopY : this.floorBottomY) - 30;
    const sprite = group.create(x, y, textureKey) as Phaser.Physics.Arcade.Sprite;
    sprite.setScale(config.scale);
    sprite.setDepth(DEPTH.PICKUPS);
    (sprite.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    sprite.setImmovable(true);
    sprite.once('destroy', () => this.scene.tweens.killTweensOf(sprite));
    floatUpDown(this.scene, sprite, config.floatDistance, config.floatDuration);
    attachGlow(this.scene, sprite, config.glowRadius, config.glowColor, config.glowIntensity, config.glowPulse);
    outlineGlow(this.scene, sprite, COLORS.PICKUP_OUTLINE, true);
    if (config.pulse) {
      pulse(this.scene, sprite, config.pulse.toScale, config.pulse.duration);
    }
    return sprite;
  }

  private spawnPill(slotX: number): void {
    const pill = this.spawnPickup(this.pills, slotX, 'pill', {
      scale: 0.15,
      floatDistance: 10,
      floatDuration: 400,
      glowRadius: 28,
      glowColor: COLORS.PILL_GLOW,
      glowIntensity: 0.5,
      glowPulse: { toAlpha: 0.18, toScale: 1.3, duration: 400 },
      pulse: { toScale: 0.18, duration: 300 },
    });
    const pillGlowTween = this.scene.tweens.addCounter({
      from: 0,
      to: 360,
      duration: 1500,
      repeat: -1,
      onUpdate: (tween) => {
        const hue = tween.getValue() ?? 0;
        pill.setTint(Phaser.Display.Color.HSLToColor(hue / 360, 1, 0.5).color);
      },
    });
    pill.once('destroy', () => pillGlowTween.destroy());
  }

  private spawnBeer(slotX: number): void {
    const beerKey = `beer-${Phaser.Math.Between(1, 6)}`;
    this.spawnPickup(this.beers, slotX, beerKey, {
      scale: 0.18,
      floatDistance: 8,
      floatDuration: 400,
      glowRadius: 24,
      glowColor: COLORS.BEER_GLOW,
      glowIntensity: 0.4,
      glowPulse: { toAlpha: 0.15, duration: 600 },
      pulse: { toScale: 0.22, duration: 600 },
    });
  }

  private spawnApple(slotX: number): void {
    this.spawnPickup(this.apples, slotX, 'apple', {
      scale: 0.15,
      floatDistance: 8,
      floatDuration: 500,
      glowRadius: 22,
      glowColor: COLORS.APPLE_GLOW,
      glowIntensity: 0.35,
      glowPulse: { toAlpha: 0.12, duration: 500 },
    });
  }
}
