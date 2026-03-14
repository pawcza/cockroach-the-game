import Phaser from 'phaser';
import {
  COCKROACH_START_X,
  COCKROACH_BASE_SPEED,
  APPLE_SPAWN_CHANCE,
  PILL_SPAWN_CHANCE,
  TYSKIE_SPAWN_CHANCE,
  SPAWN_DISTANCE_AHEAD,
  MIN_OBSTACLE_SPACING,
  SPEED_BOOST_PER_LEVEL,
  COLORS,
  DEPTH,
} from '../config/constants';
import { getLevelForDistance } from '../config/levels';
import { floatUpDown, pulse, attachGlow } from '../utils/TweenPatterns';
import { popupStyle } from '../utils/TextStyles';
import { ObstacleSpawner } from '../objects/ObstacleSpawner';
import { SeededRNG } from '../multiplayer/SeededRNG';
import { Floor } from '../objects/Player';

export class SpawnManager {
  private scene: Phaser.Scene;
  private obstacles: Phaser.Physics.Arcade.Group;
  private apples: Phaser.Physics.Arcade.Group;
  private tyskies: Phaser.Physics.Arcade.Group;
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
    tyskies: Phaser.Physics.Arcade.Group,
    pills: Phaser.Physics.Arcade.Group,
    obstacleSpawner: ObstacleSpawner,
    rng: SeededRNG | null,
    floorTopY: number,
    floorBottomY: number,
  ) {
    this.scene = scene;
    this.obstacles = obstacles;
    this.apples = apples;
    this.tyskies = tyskies;
    this.pills = pills;
    this.obstacleSpawner = obstacleSpawner;
    this.rng = rng;
    this.floorTopY = floorTopY;
    this.floorBottomY = floorBottomY;
    this.nextSpawnX = COCKROACH_START_X + 400;
  }

  handleSpawning(cameraRight: number): void {
    const spawnHorizon = cameraRight + SPAWN_DISTANCE_AHEAD;

    while (this.nextSpawnX <= spawnHorizon) {
      const slotX = this.nextSpawnX;

      const slotDistance = Math.floor((slotX - COCKROACH_START_X) / 50);
      const spawnLevel = getLevelForDistance(slotDistance).level;
      const levelSpeedMult = 1 + (spawnLevel - 1) * (SPEED_BOOST_PER_LEVEL / COCKROACH_BASE_SPEED);
      const slotWidth = MIN_OBSTACLE_SPACING * Math.max(1, levelSpeedMult * 0.3);
      this.nextSpawnX += slotWidth;

      const roll = this.rng?.next() ?? Math.random();
      if (roll < PILL_SPAWN_CHANCE) {
        this.spawnPill(slotX);
      } else if (roll < PILL_SPAWN_CHANCE + TYSKIE_SPAWN_CHANCE) {
        this.spawnTyskie(slotX);
      } else if (roll < PILL_SPAWN_CHANCE + TYSKIE_SPAWN_CHANCE + APPLE_SPAWN_CHANCE) {
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

  cleanupOffscreen(cameraLeft: number, onPickupMissed: (comboLost: number) => void, currentCombo: number): void {
    this.obstacles.getChildren().forEach((obj) => {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      if (sprite.x < cameraLeft - 200) sprite.destroy();
    });

    let comboWasLost = false;
    const groups = [this.apples, this.tyskies, this.pills];
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
    const groups = [this.apples, this.tyskies, this.pills];
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

  private spawnPill(slotX: number): void {
    const pFloor: Floor = (this.rng?.next() ?? Math.random()) > 0.5 ? 'top' : 'bottom';
    const pY = (pFloor === 'top' ? this.floorTopY : this.floorBottomY) - 30;
    const pill = this.pills.create(slotX, pY, 'pill') as Phaser.Physics.Arcade.Sprite;
    pill.setScale(0.15);
    pill.setDepth(DEPTH.PICKUPS);
    (pill.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    pill.setImmovable(true);
    floatUpDown(this.scene, pill, 10, 400);
    const pillGlowTween = this.scene.tweens.addCounter({
      from: 0,
      to: 360,
      duration: 1500,
      repeat: -1,
      onUpdate: (tween) => {
        if (pill.active) {
          const hue = tween.getValue() ?? 0;
          const color = Phaser.Display.Color.HSLToColor(hue / 360, 1, 0.5);
          pill.setTint(color.color);
        }
      },
    });
    pill.setData('glowTween', pillGlowTween);
    attachGlow(this.scene, pill, 20, COLORS.PILL_GLOW, 0.3, { toAlpha: 0.1, toScale: 1.3, duration: 400 });
    pulse(this.scene, pill, 0.18, 300);
  }

  private spawnTyskie(slotX: number): void {
    const tFloor: Floor = (this.rng?.next() ?? Math.random()) > 0.5 ? 'top' : 'bottom';
    const tY = (tFloor === 'top' ? this.floorTopY : this.floorBottomY) - 30;
    const tyskie = this.tyskies.create(slotX, tY, 'tyskie') as Phaser.Physics.Arcade.Sprite;
    tyskie.setScale(0.18);
    tyskie.setDepth(DEPTH.PICKUPS);
    (tyskie.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    tyskie.setImmovable(true);
    floatUpDown(this.scene, tyskie, 8, 400);
    pulse(this.scene, tyskie, 0.22, 600);
    tyskie.setTint(COLORS.TYSKIE_GLOW);
    attachGlow(this.scene, tyskie, 18, COLORS.TYSKIE_GLOW, 0.25, { toAlpha: 0.1, duration: 600 });
  }

  private spawnApple(slotX: number): void {
    const appleFloor: Floor = (this.rng?.next() ?? Math.random()) > 0.5 ? 'top' : 'bottom';
    const appleY = (appleFloor === 'top' ? this.floorTopY : this.floorBottomY) - 30;
    const apple = this.apples.create(slotX, appleY, 'apple') as Phaser.Physics.Arcade.Sprite;
    apple.setScale(0.15);
    apple.setDepth(DEPTH.PICKUPS);
    (apple.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    apple.setImmovable(true);
    floatUpDown(this.scene, apple, 8, 500);
    attachGlow(this.scene, apple, 16, COLORS.APPLE_GLOW, 0.2, { toAlpha: 0.08, duration: 500 });
  }
}
