import Phaser from 'phaser';
import { AudioManager } from '../audio/AudioManager';
import { SeededRNG } from '../multiplayer/SeededRNG';
import { spawnBird } from './obstacles/bird';
import { spawnBison } from './obstacles/bison';
import { spawnBlackHole } from './obstacles/blackHole';
import { spawnCatPaw } from './obstacles/catPaw';
import { spawnDiscoBall } from './obstacles/discoBall';
import { spawnFlipper } from './obstacles/flipper';
import { spawnJellyfish } from './obstacles/jellyfish';
import { spawnNewspaper } from './obstacles/newspaper';
import { ObstacleKit, ObstacleScene } from './obstacles/ObstacleKit';
import { spawnOnion } from './obstacles/onion';
import { spawnPestSpray } from './obstacles/pestSpray';
import { spawnPope } from './obstacles/pope';
import { spawnWall } from './obstacles/wall';
import { Floor } from './Player';

/** Config-driven obstacle registry: maps minimum level to spawn functions. */
interface ObstacleEntry {
  minLevel: number;
  /** A lane is given when the pattern needs this obstacle on one floor; otherwise it picks its own. */
  fn: (kit: ObstacleKit, x: number, floor?: Floor) => void;
  basic: boolean;
  /** Stands on one floor, so a pattern can place it in a lane. Floaters, the disco ball and the black hole don't. */
  lane: boolean;
}

/** What a slot asks for: any obstacle, or one in this lane. */
export interface SpawnRequest {
  floor?: Floor;
}

/** Sorted list of obstacle types and when they unlock. */
const REGISTRY: ObstacleEntry[] = [
  { minLevel: 1, fn: spawnOnion, basic: true, lane: true },
  { minLevel: 2, fn: spawnPestSpray, basic: true, lane: true },
  { minLevel: 2, fn: spawnFlipper, basic: true, lane: true },
  { minLevel: 3, fn: spawnNewspaper, basic: false, lane: false },
  { minLevel: 4, fn: spawnBird, basic: false, lane: false },
  { minLevel: 5, fn: spawnCatPaw, basic: false, lane: true },
  { minLevel: 6, fn: spawnDiscoBall, basic: false, lane: false },
  { minLevel: 7, fn: spawnJellyfish, basic: false, lane: false },
  { minLevel: 8, fn: spawnPope, basic: false, lane: false },
  { minLevel: 9, fn: spawnBison, basic: false, lane: true },
  { minLevel: 10, fn: spawnBlackHole, basic: false, lane: false },
];

/** Picks which obstacle fills a slot. The order of seeded calls here must never change: multiplayer depends on it. */
export class ObstacleSpawner {
  private kit: ObstacleKit;
  private lastSpawnedIndex = -1;

  constructor(scene: Phaser.Scene, obstacles: Phaser.Physics.Arcade.Group, audio: AudioManager, rng: SeededRNG | null) {
    // GameScene exposes floorTopY/floorBottomY/cockroach/isDead publicly at runtime
    this.kit = new ObstacleKit(scene as unknown as ObstacleScene, obstacles, audio, rng);
  }

  /** A wall of the level's ledge across both lanes. */
  spawnWall(x: number, level: number): void {
    spawnWall(this.kit, x, level);
  }

  spawn(x: number, level: number = 1, request: SpawnRequest = {}): void {
    const available = REGISTRY.filter((e) =>
      e.minLevel <= level && (!request.floor || e.lane));
    const basics = available.filter((e) => e.basic);
    const hards = available.filter((e) => !e.basic);

    let chosen: ObstacleEntry;

    if (hards.length === 0) {
      // Only basic obstacles available (level 1)
      chosen = basics[this.kit.between(0, basics.length - 1)];
    } else {
      const roll = this.kit.random();
      if (roll < 0.7) {
        // 70% basic
        chosen = basics[this.kit.between(0, basics.length - 1)];
      } else {
        // 30% hard — 50% newly unlocked on their level, 50% other hards
        const newlyUnlocked = hards.filter((e) => e.minLevel === level);
        const others = hards.filter((e) => e.minLevel !== level);

        if (newlyUnlocked.length > 0 && (others.length === 0 || this.kit.random() < 0.5)) {
          chosen = newlyUnlocked[this.kit.between(0, newlyUnlocked.length - 1)];
        } else if (others.length > 0) {
          chosen = others[this.kit.between(0, others.length - 1)];
        } else {
          chosen = hards[this.kit.between(0, hards.length - 1)];
        }
      }
    }

    // Prevent consecutive duplicates (when more than 1 type available)
    const chosenIndex = REGISTRY.indexOf(chosen);
    if (available.length > 1 && chosenIndex === this.lastSpawnedIndex) {
      const pool = (chosen.basic ? basics : hards).filter(
        (e) => REGISTRY.indexOf(e) !== this.lastSpawnedIndex,
      );
      if (pool.length > 0) {
        chosen = pool[this.kit.between(0, pool.length - 1)];
      } else {
        // Fallback: pick from all available excluding last
        const fallback = available.filter((e) => REGISTRY.indexOf(e) !== this.lastSpawnedIndex);
        if (fallback.length > 0) {
          chosen = fallback[this.kit.between(0, fallback.length - 1)];
        }
      }
    }

    this.lastSpawnedIndex = REGISTRY.indexOf(chosen);
    chosen.fn(this.kit, x, request.floor);
  }
}
