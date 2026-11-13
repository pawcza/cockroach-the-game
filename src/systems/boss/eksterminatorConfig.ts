/**
 * The Eksterminator's frames and his own sprites (the spray stream, the canister, the gas cloud): one atlas
 * (tools/art/bake_eksterminator.py), loaded with the other boss assets after boot. His frames share one cell whose pivot
 * is on the floor under the middle of his feet; every sprite has its own pivot, as the bake sets it.
 */
import Phaser from 'phaser';

export const EKS_TEXTURE = 'boss-eksterminator';
export const EKS_ATLAS = { image: 'boss/eksterminator.webp', json: 'boss/eksterminator.json' };

export type EksAnim =
  'idle' | 'idle-hot' | 'walk' | 'pump' |
  'spray-top-windup' | 'spray-top' | 'spray-top-release' |
  'spray-bottom-windup' | 'spray-bottom' | 'spray-bottom-release' |
  'lob' | 'stagger' | 'defeat' | 'charge';

/** As baked: the bake checks these against the rig. */
export const EKS_ANIMS: Record<EksAnim, { frames: number; fps: number; loop: boolean }> = {
  'idle': { frames: 8, fps: 6, loop: true },
  'idle-hot': { frames: 8, fps: 6, loop: true },
  'walk': { frames: 8, fps: 8, loop: true },
  'pump': { frames: 6, fps: 10, loop: false },
  'spray-top-windup': { frames: 4, fps: 10, loop: false },
  'spray-top': { frames: 4, fps: 14, loop: true },
  'spray-top-release': { frames: 3, fps: 10, loop: false },
  'spray-bottom-windup': { frames: 4, fps: 10, loop: false },
  'spray-bottom': { frames: 4, fps: 14, loop: true },
  'spray-bottom-release': { frames: 3, fps: 10, loop: false },
  'lob': { frames: 6, fps: 10, loop: false },
  'stagger': { frames: 5, fps: 14, loop: false },
  'defeat': { frames: 12, fps: 10, loop: false },
  'charge': { frames: 8, fps: 16, loop: true },
};

/** His sprites: frame counts and speeds. */
export type EksSprite = 'jet' | 'jet-burst' | 'jet-dive' | 'jet-splash' | 'canister' | 'cloud' | 'mine';
export const EKS_SPRITES: Record<EksSprite, { frames: number; fps: number }> = {
  'jet': { frames: 4, fps: 14 },
  'jet-burst': { frames: 3, fps: 14 },
  'jet-dive': { frames: 3, fps: 14 },
  'jet-splash': { frames: 3, fps: 14 },
  'canister': { frames: 3, fps: 14 },
  'cloud': { frames: 6, fps: 8 },
  'mine': { frames: 3, fps: 6 },
};

/** Native px, as baked. */
export const JET_TILE = 16;

/** Points the fight aims by, native px from his pivot (checked by the bake). */
export const EKS_POINTS = {
  /** The nozzle's mouth while spraying: the stream leaves here. Top: level, 10 px over the top ledge. */
  nozzleTop: { x: -75, y: -78 },
  /** Bottom: pointed down at the floor; the pour (jet-dive) takes the stream down to its lane. */
  nozzleBottom: { x: -45, y: -16 },
  /** The far hand as it whips the canister over: where the canister's flight starts. */
  release: { x: -20, y: -132 },
  /** The fist in the lob's cocked frame (1) and its whip (2): the canister he holds, glowing, is there. */
  cocked: { x: 22, y: -132 },
  whip: { x: -20, y: -132 },
  /** The middle of his tank: where bullets hit it and it glows. */
  tank: { x: 22, y: -86 },
  /** The nozzle at rest. */
  rest: { x: -73, y: -72 },
} as const;

/** The bottom spray's stream runs this far above the floor (its middle row), native px. */
export const BOTTOM_STREAM_Y = -10;
/** And falls this far from the nozzle's mouth to get there: the pour's height. */
export const DIVE_DROP = 6;

/** How far left and right of his middle he reaches, standing and spraying, native px (for keeping him on screen). */
export const EKS_REACH = { left: 81, right: 53 };

/** The lob's frame where the canister leaves his hand. */
export const RELEASE_FRAME = 3;

export const eksFrame = (name: EksAnim | EksSprite, index = 0): string => `eksterminator-${name}_${index}`;
export const eksAnimKey = (name: EksAnim | EksSprite): string => `eksterminator-${name}`;

export function createEksAnimations(scene: Phaser.Scene): void {
  const all: [EksAnim | EksSprite, { frames: number; fps: number; loop?: boolean }][] = [
    ...Object.entries(EKS_ANIMS) as [EksAnim, typeof EKS_ANIMS.idle][],
    ...(Object.entries(EKS_SPRITES) as [EksSprite, typeof EKS_SPRITES.jet][]).map(([k, v]) => [k, { ...v, loop: true }] as [EksSprite, { frames: number; fps: number; loop: boolean }]),
  ];
  for (const [name, { frames, fps, loop }] of all) {
    const key = eksAnimKey(name);
    if (scene.anims.exists(key)) continue;
    scene.anims.create({
      key,
      frames: scene.anims.generateFrameNames(EKS_TEXTURE, { prefix: `eksterminator-${name}_`, start: 0, end: frames - 1 }),
      frameRate: fps,
      repeat: loop ? -1 : 0,
    });
  }
}
