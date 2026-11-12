/**
 * Zlewiatan's looks and shots: its own atlas (tools/art/bake_bosses.py zlewiatan), loaded with the other boss assets
 * after boot. The creature's frames share one cell whose pivot is the boss's point in the fight; what the frames say
 * about themselves (frame counts, where each mouth is when it spits, the front on every row) is generated into
 * zlewiatanFrames.ts by the bake.
 */
import Phaser from 'phaser';
import { SPRITE_SCALE } from '../../config/sprites';
import { FRONT_CHARGE, FRONT_IDLE, FRONT_TOP, SHOT_HALF, ZLEWIATAN_ANIMS, ZlewiatanAnim } from './zlewiatanFrames';

export const ZLEWIATAN_TEXTURE = 'boss-zlewiatan';
export const ZLEWIATAN_ATLAS = { image: 'boss/zlewiatan.webp', json: 'boss/zlewiatan.json' };

export type Head = 'block' | 'pierog' | 'carp';
export type Lane = 'top' | 'bottom';
export type ShotKind = 'slab' | 'skwarka' | 'bone' | 'radiator' | 'bubble' | 'smietana';

/**
 * Each head and what it spits, in the order of the host's faceIdx (the protocol's index: 0 the tower, 1 the pierog,
 * 2 the carp). speed: against the fight's projectile speed at that moment (300 to 500 px/s over the first minute).
 * The slab is heavy and slow, the bones fast; skwarki come two at a time, three when the volley roll says so.
 * sound: the key of what it makes as it lets go.
 */
export const HEADS: { head: Head; lane: Lane | 'both'; kind: ShotKind; speed: number; sound: string }[] = [
  { head: 'block', lane: 'top', kind: 'slab', speed: 0.8, sound: 'zl-slab-launch' },
  { head: 'pierog', lane: 'both', kind: 'skwarka', speed: 1.1, sound: 'zl-spit' },
  { head: 'carp', lane: 'bottom', kind: 'bone', speed: 1.2, sound: 'zl-fishbone' },
];

/** The radiator, the shot no bullet stops: as slow as the old indestructible stack. */
export const RADIATOR_SPEED = 0.8;
/** Skwarki in a burst, and how far apart along the lane (world px). */
export const SKWARKI = 2;
export const SKWARKA_GAP = 60;

/**
 * How each shot reads in flight besides its own frames: the colour of the glint and burst at the mouth it leaves and of
 * the trail it draws (how long the trail lasts, ms, and its blocks' size, world px).
 */
export const SHOT_LOOK: Record<ShotKind, { color: number; trailMs: number; trailSize: number }> = {
  slab: { color: 0xc9c5b8, trailMs: 300, trailSize: 14 },
  radiator: { color: 0xe8dcb8, trailMs: 300, trailSize: 14 },
  skwarka: { color: 0xffa23c, trailMs: 260, trailSize: 8 },
  bone: { color: 0xf6f2e2, trailMs: 220, trailSize: 6 },
  bubble: { color: 0x9fe4f6, trailMs: 360, trailSize: 10 },
  smietana: { color: 0xf4f0e4, trailMs: 300, trailSize: 10 },
};

/** The roach is hit by a shot whose middle comes this close to its own, world px: the old bomb's rule, for a 19 px half. */
const ROACH_HIT_PX = 25;
const OLD_SHOT_HALF_PX = 19;

/** How close a shot's middle may come to the roach's before it hits: grown by however much wider it is drawn than the
 * old bomb, so a hit happens where they touch on screen. */
export function shotHitRadius(kind: ShotKind): number {
  return ROACH_HIT_PX + Math.max(0, SHOT_HALF[kind].w * SPRITE_SCALE - OLD_SHOT_HALF_PX);
}

/** Half a shot's drawn width, world px: a bullet stops at its edge. */
export function shotHalfWidth(kind: ShotKind): number {
  return SHOT_HALF[kind].w * SPRITE_SCALE;
}

export const zlewiatanFrame = (anim: ZlewiatanAnim, index = 0): string => `zlewiatan-${anim}_${index}`;
export const zlewiatanAnimKey = (anim: ZlewiatanAnim): string => `zlewiatan-${anim}`;

export function createZlewiatanAnimations(scene: Phaser.Scene): void {
  for (const [anim, { frames, fps, loop }] of Object.entries(ZLEWIATAN_ANIMS) as [ZlewiatanAnim, typeof ZLEWIATAN_ANIMS.idle][]) {
    const key = zlewiatanAnimKey(anim);
    if (scene.anims.exists(key)) continue;
    scene.anims.create({
      key,
      frames: scene.anims.generateFrameNames(ZLEWIATAN_TEXTURE, { prefix: `zlewiatan-${anim}_`, start: 0, end: frames - 1 }),
      frameRate: fps,
      repeat: loop ? -1 : 0,
    });
  }
}

/**
 * The creature's front on the row at `dy` native px from its pivot: its leftmost drawn px there, native px from the
 * pivot, or null where nothing is drawn. Leaning in through the charge, it reaches further.
 */
export function frontAt(dy: number, charging: boolean): number | null {
  const rows = charging ? FRONT_CHARGE : FRONT_IDLE;
  const row = Math.round(dy) + FRONT_TOP;
  return row >= 0 && row < rows.length ? rows[row] : null;
}

/** The creature's front on the rows between two heights (native px from its pivot): the furthest it reaches there. */
export function frontBetween(fromDy: number, toDy: number, charging: boolean): number {
  let front = 0;
  for (let dy = Math.round(fromDy); dy <= Math.round(toDy); dy++) {
    const x = frontAt(dy, charging);
    if (x !== null) front = Math.min(front, x);
  }
  return front;
}
