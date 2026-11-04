/**
 * The baked sprite atlas: frame names, animations and how sprites sit on the floor. The art comes from tools/art.
 * Frames are native pixels, so everything draws at SPRITE_SCALE, and their pivots sit on the object's baseline.
 */
import Phaser from 'phaser';
import { PIXEL_BLOCK } from './constants';

export const ATLAS = 'sprites';
export const SPRITE_SCALE = PIXEL_BLOCK;

/** Transparent margin around obstacles and pickups that holds their glow. Matches PAD in tools/art/bake.py. */
const GLOW_PAD = 8;

// The roach's cell: feet on row 47 of 55, body around the middle of its 88 columns
const ROACH_FEET_ROW = 47;
const ROACH_CENTER_ROW = 27.5;
const ROACH_BODY = { x: 26, w: 40, h: 26 };

/** From the roach sprite's centre down to its feet, in world px. */
export const ROACH_FEET_OFFSET = (ROACH_FEET_ROW - ROACH_CENTER_ROW) * SPRITE_SCALE;
/** Body offset (frame px) that puts the hitbox on the roach's feet. */
const ROACH_BODY_OFFSET_Y = ROACH_FEET_ROW - ROACH_BODY.h;

export const HOP_MS = 90;
const HOP_ARC = 12;

/** Eased lane hop from fromY to toY with a small arc: t runs 0 to 1. */
export function hopY(fromY: number, toY: number, t: number): number {
  return Phaser.Math.Linear(fromY, toY, t) - Math.sin(t * Math.PI) * HOP_ARC;
}

const ANIMATIONS: Record<string, { frames: number; fps: number; once?: boolean }> = {
  'roach-run': { frames: 8, fps: 14 },
  'roach-idle': { frames: 6, fps: 8 },
  'roach-hop': { frames: 5, fps: 56, once: true },
  'roach-dash': { frames: 4, fps: 16 },
  'roach-death': { frames: 8, fps: 12, once: true },
  bison: { frames: 8, fps: 14 },
  cat: { frames: 8, fps: 10 },
  bird: { frames: 8, fps: 14 },
  apple: { frames: 6, fps: 8 },
  'beer-1': { frames: 6, fps: 8 },
  'beer-2': { frames: 6, fps: 8 },
  'beer-3': { frames: 6, fps: 8 },
  'beer-4': { frames: 6, fps: 8 },
  'beer-5': { frames: 6, fps: 8 },
  'beer-6': { frames: 6, fps: 8 },
  pill: { frames: 6, fps: 8 },
  jellyfish: { frames: 8, fps: 10 },
  disco: { frames: 8, fps: 12 },
  blackhole: { frames: 8, fps: 10 },
  onion: { frames: 6, fps: 6 },
  spray: { frames: 6, fps: 14 },
  flipper: { frames: 6, fps: 8 },
  newspaper: { frames: 6, fps: 8 },
  pope: { frames: 8, fps: 8 },
};

export const frameOf = (name: string, index = 0): string => `${name}_${index}`;

/** The shop's skins, baked as roach-<skin>-<anim>: the same timing as the plain roach. Matches skins.ts. */
const SKINS = ['zombie', 'lodowy', 'robot', 'lawa', 'metal', 'kosmiczny'];

export function createSpriteAnimations(scene: Phaser.Scene): void {
  const skinned = Object.entries(ANIMATIONS)
    .filter(([key]) => key.startsWith('roach-'))
    .flatMap(([key, config]) => SKINS.map(skin => [key.replace('roach-', `roach-${skin}-`), config] as const));
  for (const [key, { frames, fps, once }] of [...Object.entries(ANIMATIONS), ...skinned]) {
    if (scene.anims.exists(key)) continue;
    scene.anims.create({
      key,
      frames: scene.anims.generateFrameNames(ATLAS, { prefix: `${key}_`, start: 0, end: frames - 1 }),
      frameRate: fps,
      repeat: once ? 0 : -1,
    });
  }
}

/** Starts a looping animation on a random frame, so a row of apples doesn't move in lockstep. Purely cosmetic. */
export function playLoop(sprite: Phaser.GameObjects.Sprite, name: string): void {
  sprite.play({ key: name, startFrame: Math.floor(Math.random() * ANIMATIONS[name].frames) });
}

/** Sizes an arcade body to a ratio of the art, ignoring the glow margin: standing on the baseline, or centred. */
export function fitBody(
  sprite: Phaser.Physics.Arcade.Sprite,
  ratio: { w: number; h: number },
  centered = false,
): void {
  const artW = sprite.width - GLOW_PAD * 2;
  const artH = sprite.height - GLOW_PAD * 2;
  const w = artW * ratio.w;
  const h = artH * ratio.h;
  const body = sprite.body as Phaser.Physics.Arcade.Body;
  body.setSize(w, h, false);
  body.setOffset((sprite.width - w) / 2, centered ? (sprite.height - h) / 2 : sprite.height - GLOW_PAD - h);
}

export function fitRoachBody(sprite: Phaser.Physics.Arcade.Sprite): void {
  const body = sprite.body as Phaser.Physics.Arcade.Body;
  body.setSize(ROACH_BODY.w, ROACH_BODY.h, false);
  body.setOffset(ROACH_BODY.x, ROACH_BODY_OFFSET_Y);
}
