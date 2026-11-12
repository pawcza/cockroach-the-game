/**
 * Pani Lodzia's frames: her own atlas (tools/art/bake_bosses.py), loaded with the other boss assets after boot. Every
 * frame shares one cell whose pivot is on the floor under the middle of her body.
 */
import Phaser from 'phaser';

export const LODZIA_TEXTURE = 'boss-lodzia';
export const LODZIA_ATLAS = { image: 'boss/lodzia.webp', json: 'boss/lodzia.json' };

export type LodziaAnim =
  'idle' | 'walk' | 'windup-top' | 'windup-bottom' | 'slam-top' | 'slam-bottom' | 'throw-top' | 'throw-bottom'
  | 'boomerang' | 'tantrum' | 'tired' | 'hurt' | 'defeat';

/** As baked: bake_bosses.py checks these against the rig. */
export const LODZIA_ANIMS: Record<LodziaAnim, { frames: number; fps: number; loop: boolean }> = {
  'idle': { frames: 8, fps: 8, loop: true },
  'walk': { frames: 6, fps: 10, loop: true },
  'windup-top': { frames: 5, fps: 12, loop: false },
  'windup-bottom': { frames: 5, fps: 12, loop: false },
  'slam-top': { frames: 5, fps: 18, loop: false },
  'slam-bottom': { frames: 5, fps: 18, loop: false },
  'throw-top': { frames: 6, fps: 12, loop: false },
  'throw-bottom': { frames: 6, fps: 12, loop: false },
  'boomerang': { frames: 8, fps: 12, loop: false },
  'tantrum': { frames: 8, fps: 10, loop: false },
  'tired': { frames: 6, fps: 6, loop: true },
  'hurt': { frames: 4, fps: 12, loop: false },
  'defeat': { frames: 10, fps: 10, loop: false },
};

/** The slam's frame where the slipper lands, and its shockwave sets off. */
export const IMPACT_FRAME = 1;

/** Where the slipper lands, native px from her pivot: the top slam on the ledge 68 px up, the bottom one on the floor. */
export const LODZIA_LANDING = {
  top: { x: -50, y: -68 },
  bottom: { x: -42, y: 0 },
} as const;

/** How far right of her middle she reaches, native px: the slipper drawn back behind her for the boomerang. */
export const LODZIA_REACH_BACK = 69;

/** The frame of each throw on which it leaves her hand, and where (native px from her pivot): the far wrist for the
 * slippers, the near fist for the curlers (the tantrum throws two, on frames 2 and 6, from the same spot). */
export const RELEASE_FRAME = { 'throw-top': 4, 'throw-bottom': 4, 'boomerang': 6, 'tantrum': 2 } as const;
export const TANTRUM_SECOND_RELEASE = 6;
export const LODZIA_RELEASE = {
  'throw-top': { x: -44, y: -82 },
  'throw-bottom': { x: -40, y: -24 },
  'boomerang': { x: -42, y: -64 },
  'tantrum': { x: -22, y: -26 },
} as const;
/**
 * Where what she is about to throw is in each frame of its wind-up, native px from her pivot (the slipper's middle, or
 * the near fist for the tantrum; null: in her pocket): the glint and glow of her telegraph sit there. The bake checks it.
 */
export const LODZIA_HELD = {
  'throw-top': [null, { x: 45, y: -71 }, { x: 46, y: -84 }, { x: 46, y: -85 }],
  'throw-bottom': [null, { x: 39, y: -26 }, { x: 54, y: -39 }, { x: 55, y: -39 }],
  'boomerang': [{ x: 26, y: -121 }, { x: 17, y: -102 }, { x: 6, y: -109 }, { x: 15, y: -122 }, { x: 51, y: -58 }, { x: 52, y: -56 }],
  'tantrum': [{ x: -23, y: -50 }, { x: -25, y: -40 }, { x: -22, y: -26 }, { x: -24, y: -41 }, { x: -24, y: -42 }, { x: -22, y: -49 }, { x: -22, y: -26 }],
} as const;
/** Her face, where the boomerang comes home. */
export const LODZIA_FACE = { x: -30, y: -76 };

/** What she throws: each its own looping animation, drawn round its middle. */
export type LodziaProjectile = 'kapec' | 'boomerang-slipper' | 'curler' | 'puff';
export const LODZIA_PROJECTILES: Record<LodziaProjectile, { frames: number; fps: number; loop: boolean }> = {
  'kapec': { frames: 6, fps: 18, loop: true },
  'boomerang-slipper': { frames: 8, fps: 20, loop: true },
  'curler': { frames: 3, fps: 12, loop: true },
  'puff': { frames: 3, fps: 16, loop: false },
};

export const lodziaFrame = (anim: LodziaAnim | LodziaProjectile, index = 0): string => `lodzia-${anim}_${index}`;
export const lodziaAnimKey = (anim: LodziaAnim | LodziaProjectile): string => `lodzia-${anim}`;

export function createLodziaAnimations(scene: Phaser.Scene): void {
  const all = { ...LODZIA_ANIMS, ...LODZIA_PROJECTILES };
  for (const [anim, { frames, fps, loop }] of Object.entries(all) as [LodziaAnim, typeof LODZIA_ANIMS.idle][]) {
    const key = lodziaAnimKey(anim);
    if (scene.anims.exists(key)) continue;
    scene.anims.create({
      key,
      frames: scene.anims.generateFrameNames(LODZIA_TEXTURE, { prefix: `lodzia-${anim}_`, start: 0, end: frames - 1 }),
      frameRate: fps,
      repeat: loop ? -1 : 0,
    });
  }
}
