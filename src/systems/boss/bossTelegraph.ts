/**
 * What a boss shows on himself before he lets something go, and the trail what he threw leaves behind it: a glow round
 * the thing in his hand, a glint when it appears, a burst in its colour when it leaves, a trail of blocks in flight.
 * All of it is baked pixel art from the effects atlas (tools/art/vfx.py), on the pixel grid, in the nearest of its
 * colour families to the colour asked for. A thrown thing never marks the lane it flies down (only an attack that
 * closes the whole lane does): its warning is the boss's wind-up, and these.
 */
import Phaser from 'phaser';
import { DEPTH } from '../../config/constants';
import { SPRITE_SCALE } from '../../config/sprites';
import { getFx, VFX_ATLAS, vfxFrame, type FxHandle } from '../../effects/Fx';

const B = SPRITE_SCALE;
const snap = (v: number): number => Math.round(v / B) * B;

type Family = 'cream' | 'orange' | 'pink' | 'violet' | 'green' | 'grey' | 'white' | 'cyan';

/** The baked colour family nearest a colour: greys and whites by lightness, the rest by hue. */
export function family(color: number): Family {
  const c = Phaser.Display.Color.IntegerToColor(color);
  const { h, s, v } = Phaser.Display.Color.RGBToHSV(c.red, c.green, c.blue);
  if (s < 0.15) return v > 0.9 ? 'white' : 'grey';
  const deg = h * 360;
  if (deg < 20 || deg >= 300) return 'pink';
  if (deg < 38) return 'orange';
  if (deg < 70) return 'cream';
  if (deg < 160) return 'green';
  if (deg < 215) return 'cyan';
  return 'violet';
}

/** The glow's baked sizes: radius 4 to 26 texels in steps of 2. */
const GLOW_SIZES = 12;
/** The glints' arms at full flare, world px: past this a glint uses the big one. */
const SMALL_FLARE = 22;
const FLARE_FRAMES = 5;
/** The trail's baked blocks: 7 texels down to 1. */
const TRAIL_SIZES = 7;

/** A glow round something held: stepped bands of its colour, added to what is behind, sized by the radius asked. */
export class Halo {
  private image: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, public color: number, depth = DEPTH.OBSTACLES + 1) {
    this.image = scene.add.image(0, 0, VFX_ATLAS, vfxFrame(`glow-${family(color)}`))
      .setScale(B).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
  }

  show(x: number, y: number, radius: number, alpha: number): void {
    const size = Phaser.Math.Clamp(Math.round((radius / B - 4) / 2), 0, GLOW_SIZES - 1);
    this.image.setFrame(vfxFrame(`glow-${family(this.color)}`, size))
      .setPosition(snap(x), snap(y)).setAlpha(0.85 * alpha).setVisible(true);
  }

  hide(): void {
    this.image.setVisible(false);
  }

  destroy(): void {
    this.image.destroy();
  }
}

/** A four-pointed flare with a white heart, flashed where something appears or leaves, and gone. */
export function glint(scene: Phaser.Scene, x: number, y: number, color: number, size = 14, ms = 280): FxHandle | null {
  const name = `${size > SMALL_FLARE ? 'flare-big' : 'flare'}-${family(color)}`;
  return getFx(scene).play(name, x, y, { depth: DEPTH.POPUP - 2, fps: (FLARE_FRAMES * 1000) / ms });
}

/** A small burst of bits in one colour (and white), thrown out and up. dir: -1 flies left, 1 right. */
export function sparkBurst(scene: Phaser.Scene, x: number, y: number, color: number, count = 8, dir = -1, reach = 36): void {
  const fx = getFx(scene);
  const angle: [number, number] = dir < 0 ? [140, 215] : [-35, 40];
  const opts = { depth: DEPTH.POPUP - 2, speed: [reach * 2, reach * 4] as [number, number], angle, drag: 3, life: 320 };
  const white = Math.floor(count / 4);
  fx.burst(`bit-${family(color)}`, x, y, count - white, 4, opts);
  if (white) fx.burst('bit-white', x, y, white, 4, opts);
}

/**
 * What a thrown thing leaves behind it: blocks along where it has been, shrinking over `ms`. Call push every frame
 * with where it is.
 */
export class Trail {
  private points: { x: number; y: number; t: number }[] = [];
  private blocks: Phaser.GameObjects.Image[] = [];
  private key: string;
  private texels: number;

  constructor(private scene: Phaser.Scene, color: number, private ms: number, size: number,
              private depth: number = DEPTH.PICKUPS) {
    this.key = `trail-${family(color)}`;
    this.texels = Phaser.Math.Clamp(Math.round(size / B), 1, TRAIL_SIZES);
  }

  push(x: number, y: number): void {
    const last = this.points[this.points.length - 1];
    if (last && last.x === x && last.y === y) return;
    this.points.push({ x, y, t: this.scene.time.now });
    this.draw();
  }

  private draw(): void {
    const now = this.scene.time.now;
    this.points = this.points.filter(p => now - p.t < this.ms);
    let used = 0;
    const at = (x: number, y: number, k: number): void => {
      const texels = Math.max(1, Math.round(this.texels * (1 - k)));
      let block = this.blocks[used];
      if (!block) {
        block = this.scene.add.image(0, 0, VFX_ATLAS, vfxFrame(this.key)).setScale(B).setDepth(this.depth);
        this.blocks.push(block);
      }
      used++;
      // Whole blocks, stepping down in thirds rather than fading smoothly
      block.setFrame(vfxFrame(this.key, TRAIL_SIZES - texels)).setPosition(snap(x), snap(y))
        .setAlpha(0.9 * Math.ceil((1 - k) * 3) / 3).setVisible(true);
    };
    const step = this.texels * B * 0.7;
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      at(p.x, p.y, (now - p.t) / this.ms);
      // Between two far apart samples (a fast frame) fill in, so the trail is one line, not dots
      const prev = this.points[i - 1];
      if (!prev) continue;
      const steps = Math.min(12, Math.floor(Math.hypot(p.x - prev.x, p.y - prev.y) / step));
      for (let s = 1; s <= steps; s++) {
        const f = s / (steps + 1);
        at(Phaser.Math.Linear(prev.x, p.x, f), Phaser.Math.Linear(prev.y, p.y, f), (now - Phaser.Math.Linear(prev.t, p.t, f)) / this.ms);
      }
    }
    for (let i = used; i < this.blocks.length; i++) this.blocks[i].setVisible(false);
  }

  /** Lets it fade while nothing new is pushed. */
  update(): void {
    if (this.points.length) this.draw();
  }

  destroy(): void {
    this.blocks.forEach(block => block.destroy());
    this.blocks = [];
    this.points = [];
  }
}
