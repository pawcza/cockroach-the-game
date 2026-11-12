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

// The roach's run cell: feet on row 47 of 55, body around the middle of its 88 columns. The boss fight's frames are
// taller and wider, with their pivot on this same point of the roach
const ROACH_FEET_ROW = 47;
const ROACH_CENTER_ROW = 27.5;
const ROACH_CENTER_COLUMN = 44;
const ROACH_BODY = { x: 26, w: 40, h: 26 };

/** From the roach sprite's centre down to its feet, in world px. */
export const ROACH_FEET_OFFSET = (ROACH_FEET_ROW - ROACH_CENTER_ROW) * SPRITE_SCALE;
/** Body offset (frame px) that puts the hitbox on the roach's feet. */
const ROACH_BODY_OFFSET_Y = ROACH_FEET_ROW - ROACH_BODY.h;

export const HOP_MS = 90;
const FLIP_FPS = 60;
/**
 * The armed lane change: the somersault's launch and its five frames in the air, so the roach touches down as the
 * landing frame shows. A little longer than a hop; the lane still counts from the press.
 */
export const FLIP_HOP_MS = (6 * 1000) / FLIP_FPS;
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
  // The boss fight, up on its hind legs with a pistol
  'roach-rear': { frames: 5, fps: 14, once: true },
  'roach-catch': { frames: 3, fps: 16, once: true },
  'roach-aim': { frames: 4, fps: 6 },
  // 250 ms: one shot's recoil fills the boss fight's SHOOT_COOLDOWN
  'roach-shoot': { frames: 5, fps: 20, once: true },
  'roach-flip': { frames: 8, fps: FLIP_FPS, once: true },
  'roach-win': { frames: 9, fps: 12, once: true },
  casing: { frames: 2, fps: 16 },
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
  // The swatters' strips (tools/art/swatters.py): posed frame by frame from their behaviour, never played as loops
  'flipper-swat': { frames: 9, fps: 1 },
  'newspaper-swat': { frames: 9, fps: 1 },
  'flipper-swat-hand': { frames: 9, fps: 1 },
  'newspaper-swat-hand': { frames: 9, fps: 1 },
  // The hop act's (tools/art/hopact.py): the glue's shine loops, the rest are posed frame by frame
  glue: { frames: 6, fps: 8 },
  bleach: { frames: 4, fps: 4 },
  'bleach-drop': { frames: 4, fps: 1 },
  'bleach-splash': { frames: 3, fps: 1 },
  lamp: { frames: 2, fps: 1 },
  mop: { frames: 4, fps: 1 },
  // The dash act's (tools/art/hopact.py): posed frame by frame, the big can's shake looping
  vacuum: { frames: 2, fps: 1 },
  hen: { frames: 2, fps: 1 },
  'hen-head': { frames: 1, fps: 1 },
  frog: { frames: 2, fps: 1 },
  centipede: { frames: 2, fps: 1 },
  boot: { frames: 2, fps: 1 },
  hedgehog: { frames: 2, fps: 1 },
  'spray-big': { frames: 3, fps: 10 },
  pope: { frames: 8, fps: 8 },
  // The gun act's (tools/art/gunact.py): posed frame by frame; the ammo box's glint loops
  gull: { frames: 2, fps: 1 },
  wasp: { frames: 3, fps: 1 },
  'bug-zapper': { frames: 2, fps: 1 },
  repeller: { frames: 2, fps: 1 },
  'robot-vacuum': { frames: 4, fps: 1 },
  aerosol: { frames: 3, fps: 1 },
  bait: { frames: 2, fps: 3 },
  ammo: { frames: 2, fps: 3 },
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

/**
 * The roach's hitbox on its feet. Measured from the frame's pivot, so it stays put when a frame of another size
 * shows (the boss fight's are taller): call it again whenever the frame changes.
 */
export function fitRoachBody(sprite: Phaser.Physics.Arcade.Sprite): void {
  const body = sprite.body as Phaser.Physics.Arcade.Body;
  body.setSize(ROACH_BODY.w, ROACH_BODY.h, false);
  body.setOffset(
    sprite.displayOriginX - ROACH_CENTER_COLUMN + ROACH_BODY.x,
    sprite.displayOriginY - ROACH_CENTER_ROW + ROACH_BODY_OFFSET_Y,
  );
}
