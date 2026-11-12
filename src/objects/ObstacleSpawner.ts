import Phaser from 'phaser';
import { AudioManager } from '../audio/AudioManager';
import type { EnemyPlan, Lane } from './obstacles/behaviours';
import type { EnemyId } from './obstacles/cast';
import { spawnAerosol } from './obstacles/aerosol';
import { spawnBait } from './obstacles/bait';
import { spawnBird } from './obstacles/bird';
import { spawnBison } from './obstacles/bison';
import { spawnBlackHole } from './obstacles/blackHole';
import { spawnBleach } from './obstacles/bleach';
import { spawnCatChase } from './obstacles/catChase';
import { spawnCatPaw } from './obstacles/catPaw';
import { spawnBoots } from './obstacles/boots';
import { spawnCentipede } from './obstacles/centipede';
import { spawnFrog } from './obstacles/frog';
import { spawnHedgehog } from './obstacles/hedgehog';
import { spawnHen } from './obstacles/hen';
import { spawnSprayWall } from './obstacles/sprayWall';
import { spawnVacuum } from './obstacles/vacuum';
import { spawnFlipper } from './obstacles/flipper';
import { spawnGlue } from './obstacles/glue';
import { spawnGull } from './obstacles/gull';
import { spawnJellyfish } from './obstacles/jellyfish';
import { spawnLamp } from './obstacles/lamp';
import { spawnMop } from './obstacles/mop';
import { spawnNewspaper } from './obstacles/newspaper';
import { ObstacleKit, ObstacleScene } from './obstacles/ObstacleKit';
import { spawnOnion } from './obstacles/onion';
import { spawnPestSpray } from './obstacles/pestSpray';
import { spawnPope } from './obstacles/pope';
import { spawnRepeller } from './obstacles/repeller';
import { spawnRobotVacuum } from './obstacles/robotVacuum';
import { spawnWall } from './obstacles/wall';
import { spawnWasp } from './obstacles/wasp';
import { spawnZapper } from './obstacles/zapper';

/**
 * How each enemy is built. What it is and how it behaves is data in obstacles/cast.ts; replacing one is a new entry
 * there and its spawn function here.
 */
const SPAWN: Record<EnemyId, (kit: ObstacleKit, plan: EnemyPlan) => void> = {
  onion: spawnOnion,
  flipper: spawnFlipper,
  spray: spawnPestSpray,
  newspaper: spawnNewspaper,
  bird: spawnBird,
  cat: spawnCatPaw,
  catChase: spawnCatChase,
  jellyfish: spawnJellyfish,
  pope: spawnPope,
  bison: spawnBison,
  blackhole: spawnBlackHole,
  glue: spawnGlue,
  bleach: spawnBleach,
  lamp: spawnLamp,
  mop: spawnMop,
  vacuum: spawnVacuum,
  hen: spawnHen,
  frog: spawnFrog,
  centipede: spawnCentipede,
  boots: spawnBoots,
  hedgehog: spawnHedgehog,
  sprayWall: spawnSprayWall,
  gull: spawnGull,
  wasp: spawnWasp,
  zapper: spawnZapper,
  robotVacuum: spawnRobotVacuum,
  repeller: spawnRepeller,
  aerosol: spawnAerosol,
  bait: spawnBait,
};

/** Builds the enemies the course plans (systems/CourseLayout.ts). Draws nothing from the seed. */
export class ObstacleSpawner {
  private kit: ObstacleKit;

  constructor(scene: Phaser.Scene, obstacles: Phaser.Physics.Arcade.Group, audio: AudioManager) {
    // GameScene exposes floorTopY/floorBottomY/cockroach/isDead/runTime publicly at runtime
    this.kit = new ObstacleKit(scene as unknown as ObstacleScene, obstacles, audio);
  }

  /** A wall of the level's ledge across both lanes. */
  spawnWall(x: number, level: number): void {
    spawnWall(this.kit, x, level);
  }

  spawn(plan: EnemyPlan): void {
    SPAWN[plan.id as EnemyId](this.kit, plan);
  }

  /** An onion standing in this lane: the one enemy that does nothing, for the tutorial's first dodge. */
  spawnBlocker(x: number, lane: Lane): void {
    this.spawn({ id: 'onion', x, lane, phase: 0 });
  }
}
