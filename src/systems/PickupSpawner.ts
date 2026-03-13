import Phaser from 'phaser';
import {
  COCKROACH_START_X,
  COCKROACH_BASE_SPEED,
  SPAWN_DISTANCE_AHEAD,
  MIN_OBSTACLE_SPACING,
  APPLE_SPAWN_CHANCE,
  PILL_SPAWN_CHANCE,
  SPEED_BOOST_PER_LEVEL,
} from '../config/constants';
import { Floor } from '../objects/Player';
import { ObstacleSpawner } from '../objects/ObstacleSpawner';
import { SeededRNG } from '../multiplayer/SeededRNG';
import { getLevelForDistance } from '../config/levels';

const TYSKIE_SPAWN_CHANCE = 0.05;

export class PickupSpawner {
  private scene: Phaser.Scene;
  private obstacles: Phaser.Physics.Arcade.Group;
  private apples: Phaser.Physics.Arcade.Group;
  private tyskies: Phaser.Physics.Arcade.Group;
  private pills: Phaser.Physics.Arcade.Group;
  private obstacleSpawner: ObstacleSpawner;
  private rng: SeededRNG | null;
  private floorTopY: number;
  private floorBottomY: number;

  private nextSpawnX = 0;
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

  queuePickupDestruction(x: number): void {
    if (!this.destroyPickupNear(x)) {
      this.pendingPickupDestructions.push(x);
    }
  }

  handleSpawning(): void {
    const spawnHorizon = this.scene.cameras.main.scrollX + this.scene.cameras.main.width + SPAWN_DISTANCE_AHEAD;
    while (this.nextSpawnX <= spawnHorizon) {
      const slotX = this.nextSpawnX;
      const slotDistance = Math.floor((slotX - COCKROACH_START_X) / 50);
      const spawnLevel = getLevelForDistance(slotDistance).level;
      const levelSpeedMult = 1 + (spawnLevel - 1) * (SPEED_BOOST_PER_LEVEL / COCKROACH_BASE_SPEED);
      this.nextSpawnX += MIN_OBSTACLE_SPACING * Math.max(1, levelSpeedMult * 0.3);
      const roll = this.rng?.next() ?? Math.random();
      if (roll < PILL_SPAWN_CHANCE) this.spawnPickup(slotX, 'pill');
      else if (roll < PILL_SPAWN_CHANCE + TYSKIE_SPAWN_CHANCE) this.spawnPickup(slotX, 'tyskie');
      else if (roll < PILL_SPAWN_CHANCE + TYSKIE_SPAWN_CHANCE + APPLE_SPAWN_CHANCE) this.spawnPickup(slotX, 'apple');
      else this.obstacleSpawner.spawn(slotX, spawnLevel);
    }
    if (this.pendingPickupDestructions.length > 0) {
      this.pendingPickupDestructions = this.pendingPickupDestructions.filter(x => !this.destroyPickupNear(x));
    }
  }

  cleanupOffscreen(pickupComboReset: () => void): void {
    const cameraLeft = this.scene.cameras.main.scrollX - 200;
    this.obstacles.getChildren().forEach((obj) => {
      const s = obj as Phaser.Physics.Arcade.Sprite;
      if (s.x < cameraLeft) s.destroy();
    });
    for (const group of [this.apples, this.tyskies, this.pills]) {
      group.getChildren().forEach((obj) => {
        const s = obj as Phaser.Physics.Arcade.Sprite;
        if (s.x < cameraLeft) { pickupComboReset(); s.destroy(); }
      });
    }
  }

  private spawnPickup(slotX: number, type: 'pill' | 'tyskie' | 'apple'): void {
    const pFloor: Floor = (this.rng?.next() ?? Math.random()) > 0.5 ? 'top' : 'bottom';
    const baseY = (pFloor === 'top' ? this.floorTopY : this.floorBottomY) - 30;
    const config = type === 'pill'
      ? { group: this.pills, tex: 'pill', scale: 0.15, bob: 10, bobDur: 400 }
      : type === 'tyskie'
        ? { group: this.tyskies, tex: 'tyskie', scale: 0.18, bob: 8, bobDur: 400 }
        : { group: this.apples, tex: 'apple', scale: 0.15, bob: 8, bobDur: 500 };

    const sprite = config.group.create(slotX, baseY, config.tex) as Phaser.Physics.Arcade.Sprite;
    sprite.setScale(config.scale).setDepth(10);
    (sprite.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    sprite.setImmovable(true);
    this.scene.tweens.add({ targets: sprite, y: baseY - config.bob, duration: config.bobDur, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    if (type === 'pill') {
      const glowTween = this.scene.tweens.addCounter({
        from: 0, to: 360, duration: 1500, repeat: -1,
        onUpdate: (tw) => { if (sprite.active) sprite.setTint(Phaser.Display.Color.HSLToColor((tw.getValue() ?? 0) / 360, 1, 0.5).color); },
      });
      sprite.setData('glowTween', glowTween);
      const glow = this.scene.add.circle(slotX, baseY, 20, 0xff00ff, 0.3).setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
      this.scene.tweens.add({ targets: glow, alpha: 0.1, scale: 1.3, duration: 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      sprite.on('destroy', () => { this.scene.tweens.killTweensOf(sprite); this.scene.tweens.killTweensOf(glow); glow.destroy(); });
      this.scene.tweens.add({ targets: sprite, scaleX: 0.18, scaleY: 0.18, duration: 300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else if (type === 'tyskie') {
      sprite.setTint(0xffdd00);
      this.scene.tweens.add({ targets: sprite, scale: 0.22, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      const glow = this.scene.add.circle(slotX, baseY, 18, 0xffdd00, 0.25).setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
      this.scene.tweens.add({ targets: glow, alpha: 0.1, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      sprite.on('destroy', () => { this.scene.tweens.killTweensOf(sprite); this.scene.tweens.killTweensOf(glow); glow.destroy(); });
    } else {
      const glow = this.scene.add.circle(slotX, baseY, 16, 0x00ff44, 0.2).setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
      this.scene.tweens.add({ targets: glow, alpha: 0.08, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      sprite.on('destroy', () => { this.scene.tweens.killTweensOf(sprite); this.scene.tweens.killTweensOf(glow); glow.destroy(); });
    }
  }

  private destroyPickupNear(x: number): boolean {
    for (const group of [this.apples, this.tyskies, this.pills]) {
      for (const obj of group.getChildren()) {
        const s = obj as Phaser.Physics.Arcade.Sprite;
        if (Math.abs(s.x - x) < 30) { s.destroy(); return true; }
      }
    }
    return false;
  }
}
