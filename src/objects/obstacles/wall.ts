/**
 * A wall across both lanes, built from the level's own ledge stood on end: the floor you run on, turned into the thing
 * in your way. Only a dash (or the pill) gets through.
 */
import Phaser from 'phaser';
import { DEPTH, PIXEL_BLOCK } from '../../config/constants';
import { LEVELS } from '../../config/levels';
import { ObstacleKit } from './ObstacleKit';

/** How far above the upper ledge the wall reaches, so it reads as closing the top lane too. Logical px. */
const HEAD_ROOM = 84;
/** How far it stands into the lower ledge, like the obstacles' feet. */
const SINK = 6;
/** The deadly part: most of its width, all of its height. The plank is solid, with no glow around it. */
const HITBOX_W = 0.8;
/** The strip's plank rows; below them is the shadow it casts, which stood on end would look like a ghost. Matches
 * LEDGE_ROWS in tools/art/levels.py. */
const PLANK_ROWS = 19;

/**
 * Always a wall, whatever has loaded: what fills a slot must never depend on one client's downloads, or the seeded
 * layout drifts apart between players. While the level's ledge is still downloading it is built from the first
 * level's, which loads with the game.
 */
export function spawnWall(kit: ObstacleKit, x: number, level: number): void {
  const { scene } = kit;
  const height = kit.bottomY + SINK - (kit.topY - HEAD_ROOM);
  const key = wallTexture(scene, level, height) ?? wallTexture(scene, 1, height)!;

  const wall = kit.createPlain(x, kit.bottomY + SINK, key);
  wall.setOrigin(0.5, 1).setScale(PIXEL_BLOCK).setDepth(DEPTH.OBSTACLES);
  wall.setData('floor', null);
  wall.setData('type', 'wall');
  const body = wall.body as Phaser.Physics.Arcade.Body;
  body.allowGravity = false;
  body.setImmovable(true);
  const w = wall.width * HITBOX_W;
  body.setSize(w, wall.height, false);
  body.setOffset((wall.width - w) / 2, 0);
}

/** The level's ledge strip turned upright, cut to the wall's height. Made once per level. */
function wallTexture(scene: Phaser.Scene, level: number, heightLogical: number): string | null {
  const key = `wall-lv${level}`;
  if (scene.textures.exists(key)) return key;
  const config = LEVELS.find(l => l.level === level);
  if (!config || !scene.textures.exists(config.floorKey)) return null;

  const strip = scene.textures.get(config.floorKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const length = Math.min(strip.width, Math.ceil(heightLogical / PIXEL_BLOCK));
  const canvas = document.createElement('canvas');
  canvas.width = PLANK_ROWS;
  canvas.height = length;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  // A quarter turn, whole pixels only: the strip's lit top edge becomes the face the roach runs at
  ctx.translate(0, length);
  ctx.rotate(-Math.PI / 2);
  ctx.drawImage(strip, 0, 0, length, PLANK_ROWS, 0, 0, length, PLANK_ROWS);
  scene.textures.addCanvas(key, canvas);
  return key;
}
