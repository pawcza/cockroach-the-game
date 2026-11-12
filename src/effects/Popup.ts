/**
 * Text that pops up over the run (a score, a combo, a name) on a dark pixel slab from the effects atlas, moving in
 * whole texels: up into place, a hold, then up and out in three steps. The numbers stay text; the slab, the burst
 * behind it and the motion are pixel art.
 */
import Phaser from 'phaser';
import { DEPTH, PIXEL_BLOCK } from '../config/constants';
import { SPRITE_SCALE } from '../config/sprites';
import { VFX_ATLAS, getFx, vfxFrame } from './Fx';

const PAD_X = 8;
const RISE = 16;
const RISE_MS = 140;
const EXIT = 12;
const EXIT_MS = 180;
const SHINE_MS = 260;
/** The sweep starts and ends this far inside the slab's ends, so it never pokes out past them. */
const SHINE_INSET = 10;

export interface PopupOpts {
  /** The slab's rim: gold for gains, red for losses. */
  plate?: 'plate' | 'plate-red' | null;
  /** An effect played behind it as it appears. */
  burst?: string;
  /** A light sweeps across the slab once it is up. */
  shine?: boolean;
  hold?: number;
  scrollFactor?: number;
  depth?: number;
  /** Extra distance down, asked every frame (something else claimed the place it rises into). */
  yOffset?: () => number;
}

const snap = (v: number): number => Math.round(v / PIXEL_BLOCK) * PIXEL_BLOCK;

/** The slab under a line of text: its two caps and a middle stretched to whole texels. Centred on x, y. */
function addPlate(scene: Phaser.Scene, x: number, y: number, width: number, key: string): Phaser.GameObjects.Image[] {
  if (!scene.textures.exists(VFX_ATLAS)) return [];
  const cap = 5 * SPRITE_SCALE;
  const middle = Math.max(1, Math.ceil((width + PAD_X * 2 - cap * 2) / SPRITE_SCALE));
  const total = cap * 2 + middle * SPRITE_SCALE;
  const left = snap(x - total / 2);
  const parts = [
    scene.add.image(left, y, VFX_ATLAS, vfxFrame(key, 0)).setScale(SPRITE_SCALE),
    // The middle is a uniform strip, stretched to the width; the right cap is drawn over its far end
    scene.add.image(left + cap, y, VFX_ATLAS, vfxFrame(key, 1))
      .setScale((middle * SPRITE_SCALE) / scene.textures.getFrame(VFX_ATLAS, vfxFrame(key, 1)).width, SPRITE_SCALE),
    scene.add.image(left + cap + middle * SPRITE_SCALE, y, VFX_ATLAS, vfxFrame(key, 2)).setScale(SPRITE_SCALE),
  ];
  for (const part of parts) part.setOrigin(0, .5);
  return parts;
}

/** Pops text up at x, y on a slab; it goes by itself. Returns everything it made, which is destroyed with it. */
export function popup(
  scene: Phaser.Scene,
  x: number,
  y: number,
  message: string,
  style: Phaser.Types.GameObjects.Text.TextStyle,
  opts: PopupOpts = {},
): Phaser.GameObjects.GameObject[] {
  const depth = opts.depth ?? DEPTH.POPUP;
  const scrollFactor = opts.scrollFactor ?? 1;
  const baseY = snap(y);
  const text = scene.add.text(snap(x), baseY + RISE, message, style).setOrigin(0.5);
  const plate = opts.plate === null ? [] : addPlate(scene, snap(x), baseY + RISE, text.width, opts.plate ?? 'plate');
  const parts: (Phaser.GameObjects.Text | Phaser.GameObjects.Image)[] = [...plate, text];
  // The slab just under the text, so a sweep across it can pass between them
  for (const part of parts) part.setDepth(part === text ? depth : depth - 0.02).setScrollFactor(scrollFactor);
  const fx = getFx(scene);
  if (opts.burst) fx.play(opts.burst, x, baseY, { depth: depth - 1, scrollFactor });
  if (opts.shine && plate.length) {
    const from = plate[0].x + SHINE_INSET;
    const to = plate[2].x + plate[2].displayWidth - SHINE_INSET;
    fx.play('shine-s', from, baseY + (opts.yOffset?.() ?? 0), {
      scrollFactor, depth: depth - 0.01, delay: RISE_MS + 30, frame: 0, vx: ((to - from) * 1000) / SHINE_MS, life: SHINE_MS, alpha: .7,
    });
  }

  // One driver for every part: their offsets from the text are kept, the moves land on whole blocks
  const offsets = parts.map(part => part.y - text.y);
  const setY = (value: number): void => { parts.forEach((part, i) => part.setY(snap(value + (opts.yOffset?.() ?? 0)) + offsets[i])); };
  const setAlpha = (value: number): void => { parts.forEach(part => part.setAlpha(value)); };
  const done = (): void => { parts.forEach(part => part.destroy()); };
  const hold = opts.hold ?? 450;

  scene.tweens.addCounter({
    from: RISE, to: 0, duration: RISE_MS, ease: 'Cubic.easeOut',
    onUpdate: (tween) => setY(baseY + (tween.getValue() ?? 0)),
    onComplete: () => {
      scene.tweens.addCounter({
        from: 0, to: 1, delay: hold, duration: EXIT_MS,
        onUpdate: (tween) => {
          const p = tween.getValue() ?? 0;
          setY(baseY - EXIT * p);
          setAlpha(Math.ceil((1 - p) * 3) / 3);
        },
        onComplete: done,
      });
    },
  });
  return parts;
}
