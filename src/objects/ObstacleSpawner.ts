import Phaser from 'phaser';
import { SeededRNG } from '../multiplayer/SeededRNG';
import {
  obstacleRegistry,
  GameSceneAccessor,
  Floor,
  RNGSource,
  SpawnContext,
  OBSTACLE_OFFSET,
} from './ObstacleRegistry';

function rngBetween(rng: RNGSource, min: number, max: number): number {
  return rng ? rng.between(min, max) : Phaser.Math.Between(min, max);
}
function rngRandom(rng: RNGSource): number {
  return rng ? rng.next() : Math.random();
}

export class ObstacleSpawner {
  private scene: GameSceneAccessor;
  private obstacles: Phaser.Physics.Arcade.Group;
  private forcedFloor: Floor | null = null;
  private rng: RNGSource = null;

  setRNG(rng: RNGSource): void { this.rng = rng; }

  constructor(scene: Phaser.Scene, obstacles: Phaser.Physics.Arcade.Group) {
    this.scene = scene as unknown as GameSceneAccessor;
    this.obstacles = obstacles;
  }

  private get floorTopY(): number {
    return this.scene.floorTopY;
  }

  private get floorBottomY(): number {
    return this.scene.floorBottomY;
  }

  private randomFloor(): Floor {
    if (this.forcedFloor !== null) return this.forcedFloor;
    return rngRandom(this.rng) < 0.5 ? 'top' : 'bottom';
  }

  private getFloorY(floor: Floor): number {
    return floor === 'top' ? this.floorTopY : this.floorBottomY;
  }

  private getCenterY(floor: Floor): number {
    return this.getFloorY(floor) - OBSTACLE_OFFSET;
  }

  /** Build the context object that obstacle spawn functions need. */
  private buildContext(): SpawnContext {
    return {
      scene: this.scene,
      obstacles: this.obstacles,
      rng: this.rng,
      randomFloor: () => this.randomFloor(),
      getFloorY: (floor: Floor) => this.getFloorY(floor),
      getCenterY: (floor: Floor) => this.getCenterY(floor),
      floorTopY: this.floorTopY,
      floorBottomY: this.floorBottomY,
    };
  }

  // ── Public API ─────────────────────────────────────────────────────

  spawn(x: number, level: number = 1): void {
    const available = obstacleRegistry.filter((e) => e.minLevel <= level);
    const pick = rngBetween(this.rng, 0, available.length - 1);
    available[pick].spawn(this.buildContext(), x);
  }
}
