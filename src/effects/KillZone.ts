/**
 * The one look the game has for "this stretch of lane is about to be deadly" and "this stretch is deadly now": a low
 * band of pixel hazard along the ledge's surface, laid tile by tile from the effects atlas (zone-warn / zone-kill and
 * their stepped ends, tools/art/vfx.py) over exactly the stretch that hurts. Warning, amber stripes march along it;
 * killing, it is a hot red band of flickering teeth with embers rising. Every lane-wide hazard of the run draws it
 * under its own look (the light's warm glow, the mop's suds, the frog's tongue...), so a player learns it once; a boss
 * fight can use it the same way: `show` every frame it is up, `hide` when it is not.
 */
import Phaser from 'phaser';
import { DEPTH, PIXEL_BLOCK } from '../config/constants';
import { SPRITE_SCALE } from '../config/sprites';
import { VFX_ATLAS, getFx, vfxFrame } from './Fx';

export type ZoneState = 'warn' | 'kill';

/** The tiles' sizes in world px (vfx.py's ZONE_TILE and ZONE_CAP, in texels). */
const TILE = 8 * SPRITE_SCALE;
const CAP = 4 * SPRITE_SCALE;
const FPS: Record<ZoneState, number> = { warn: 8, kill: 14 };
/** Off-screen tiles are not drawn: this much past the camera's edges. */
const MARGIN = 24;
/** An ember rises off a killing zone about this often, per 100 px of it. */
const EMBER_MS = 260;

const snap = (v: number): number => Math.round(v / PIXEL_BLOCK) * PIXEL_BLOCK;

export class KillZone {
  private images: Phaser.GameObjects.Image[] = [];
  private emberAt = 0;

  constructor(private scene: Phaser.Scene, private depth: number = DEPTH.CONTACT_SHADOW + 0.5) {}

  /**
   * Shows the zone over [x0, x1] of the lane whose ledge surface is at `floorY` (world px), in this state, this
   * frame. The ends are inside the stretch: what is drawn is what hurts.
   */
  show(floorY: number, x0: number, x1: number, state: ZoneState): void {
    if (!this.scene.textures.exists(VFX_ATLAS) || x1 - x0 < 2) {
      this.hide();
      return;
    }
    const camera = this.scene.cameras.main;
    const left = camera.scrollX - MARGIN;
    const right = camera.scrollX + camera.width + MARGIN;
    const a = snap(x0);
    const b = snap(x1);
    const tick = Math.floor((this.scene.time.now * FPS[state]) / 1000);
    const name = `zone-${state}`;
    let used = 0;
    const place = (frame: string, x: number, width: number, flip: boolean): void => {
      if (x + width < left || x > right || width <= 0) return;
      const image = this.images[used] ?? this.make();
      used++;
      image.setFrame(frame).setPosition(x, floorY + PIXEL_BLOCK).setFlipX(flip).setVisible(true);
      // A tile cut short at the far end of the stretch: only what lies inside it shows
      if (width < image.frame.width * SPRITE_SCALE) image.setCrop(0, 0, width / SPRITE_SCALE, image.frame.height);
      else image.setCrop();
    };
    const capW = Math.min(CAP, (b - a) / 2);
    place(vfxFrame(`${name}-end`, tick % 4), a, capW, false);
    let k = 0;
    for (let x = a + capW; x < b - capW; x += TILE, k++) {
      // Each tile a frame on from its neighbour, so the teeth never line up into a pattern
      place(vfxFrame(name, (tick + (state === 'kill' ? k * 3 : 0)) % 4), x, Math.min(TILE, b - capW - x), false);
    }
    place(vfxFrame(`${name}-end`, tick % 4), b - capW, capW, true);
    for (let i = used; i < this.images.length; i++) this.images[i].setVisible(false);
    if (state === 'kill') this.embers(floorY, Math.max(a, left), Math.min(b, right));
  }

  hide(): void {
    for (const image of this.images) image.setVisible(false);
  }

  destroy(): void {
    for (const image of this.images) image.destroy();
    this.images = [];
  }

  private make(): Phaser.GameObjects.Image {
    const image = this.scene.add.image(0, 0, VFX_ATLAS, vfxFrame('zone-warn', 0))
      .setOrigin(0, 1).setScale(SPRITE_SCALE).setDepth(this.depth);
    this.images.push(image);
    return image;
  }

  /** Embers off a killing zone, cosmetic (Math.random, never the seed). */
  private embers(floorY: number, x0: number, x1: number): void {
    const now = this.scene.time.now;
    if (x1 <= x0 || now < this.emberAt) return;
    this.emberAt = now + EMBER_MS * 100 / Math.max(100, x1 - x0);
    getFx(this.scene).play('bit-orange', x0 + Math.random() * (x1 - x0), floorY - 10,
      { depth: this.depth + 0.1, vy: -60 - Math.random() * 40, life: 420 });
  }
}
