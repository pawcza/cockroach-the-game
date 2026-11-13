/**
 * The one look the game has for "this is where it will come down": a flat pixel-art ellipse on the ledge at the exact
 * spot of a hit, as wide as the hit's footprint, from the moment the enemy has decided on it. It is the kill zone's
 * sibling (KillZone.ts, same palette, same pixel grid), the zone for a spot instead of a stretch: wide and faint amber
 * dashes at first, then the zone's marching stripes round a dark core as it draws in and fills, and at the moment of
 * impact it is hot, the zone's red with a white-hot root and flickering teeth. The boss Pani Lodzia's curler uses the
 * same strip in pink for her last landing; `KillZone` is for what is deadly along a lane.
 *
 * Baked stages (tools/art/vfx.py, `land-<look>-<stage>`, a left end, a tiled middle and a right end each) picked by
 * `progress`, laid like the zone's tiles so any footprint is drawn at its own width without scaling a sprite. Where and
 * when comes from the enemy's own state (`EnemyState.landings`), never the player.
 */
import Phaser from 'phaser';
import { DEPTH, PIXEL_BLOCK } from '../config/constants';
import { SPRITE_SCALE } from '../config/sprites';
import { Landing, laneY } from '../objects/obstacles/behaviours';
import { VFX_ATLAS, vfxFrame } from './Fx';

export type ShadowLook = 'warm' | 'pink';

/** A spot to mark: centred on x0..x1, `y` the middle of the ellipse on the ledge, `progress` 0 as its tell begins, 1 at the impact. */
export interface Spot { x0: number; x1: number; y: number; progress: number }

/** How far to the impact each stage of the strip begins (vfx.py's LANDING_STAGES): the hot two are the last part of it. */
const STAGE_FROM = [0, 0.12, 0.28, 0.42, 0.56, 0.7, 0.82, 0.92];
const STAGES = STAGE_FROM.length;
/** The ends' and the tile's sizes in world px (vfx.py's LANDING_CAP and LANDING_TILE), and the flicker. */
const CAP = 8 * SPRITE_SCALE;
const TILE = 8 * SPRITE_SCALE;
const FPS = 8;
/** Patterns repeat every 4 texels: the middle is laid in steps of that, so the right end joins it. */
const STEP = 4 * SPRITE_SCALE;
/** The ring starts this much of the footprint wider than it and draws in to the footprint itself at the last stage. */
const WIDEN = 0.5;
/** Where the ellipse's middle sits against its lane's baseline: on the ledge's surface, not under it. */
const LIFT = 1;
/** Off-screen shadows are not drawn: this much past the camera's edges. */
const MARGIN = 80;

const snap = (v: number): number => Math.round(v / PIXEL_BLOCK) * PIXEL_BLOCK;

/** One enemy's landing shadows: pooled images, made when first needed and set again every frame one shows. */
export class LandingShadow {
  private images: Phaser.GameObjects.Image[] = [];
  private shown = false;

  constructor(private scene: Phaser.Scene, private depth: number = DEPTH.CONTACT_SHADOW + 0.25) {}

  /** Shows these landings this frame (all of them, on screen), or hides the shadow when there are none. */
  show(landings: readonly Landing[], look: ShadowLook = 'warm'): void {
    this.showSpots(landings.map(l => ({ x0: l.x0, x1: l.x1, y: laneY(l.lane) - LIFT, progress: l.progress })), look);
  }

  showSpots(spots: readonly Spot[], look: ShadowLook = 'warm'): void {
    if (spots.length === 0 || !this.scene.textures.exists(VFX_ATLAS)) { this.hide(); return; }
    // Gone with the scene (a restart, a removed enemy): nothing to draw on
    if (this.images.length > 0 && !this.images[0].active) return;
    const camera = this.scene.cameras.main;
    const left = camera.scrollX - MARGIN;
    const right = camera.scrollX + camera.width + MARGIN;
    const flicker = Math.floor((this.scene.time.now * FPS) / 1000) % 2;
    let used = 0;
    const place = (frame: string, x: number, y: number, width: number, fromEdge: number): void => {
      const image = this.images[used] ?? this.make();
      used++;
      image.setFrame(vfxFrame(frame, flicker)).setPosition(x - fromEdge, y).setVisible(true);
      // A piece cut short (the middle's last tile, an end of a footprint narrower than both): only what lies inside shows
      const full = image.frame.width * SPRITE_SCALE;
      if (width < full) image.setCrop(fromEdge / SPRITE_SCALE, 0, width / SPRITE_SCALE, image.frame.height);
      else image.setCrop();
    };
    for (const s of spots) {
      if (s.x1 < left || s.x0 > right) continue;
      const p = Phaser.Math.Clamp(s.progress, 0, 1);
      const stage = STAGE_FROM.filter(from => p >= from).length - 1;
      const ring = (s.x1 - s.x0) * (1 + WIDEN * (1 - stage / (STAGES - 1)));
      const middle = Math.max(0, Math.round((ring - 2 * CAP) / STEP)) * STEP;
      const capW = Math.min(CAP, snap(ring / 2));
      const total = 2 * capW + middle;
      const a = snap((s.x0 + s.x1) / 2 - total / 2);
      const name = `land-${look}-${stage}`;
      place(`${name}-l`, a, s.y, capW, 0);
      for (let x = 0; x < middle; x += TILE) place(name, a + capW + x, s.y, Math.min(TILE, middle - x), 0);
      place(`${name}-r`, a + capW + middle, s.y, capW, CAP - capW);
    }
    for (let i = used; i < this.images.length; i++) this.images[i].setVisible(false);
    this.shown = used > 0;
  }

  hide(): void {
    if (!this.shown) return;
    for (const image of this.images) if (image.active) image.setVisible(false);
    this.shown = false;
  }

  destroy(): void {
    for (const image of this.images) image.destroy();
    this.images = [];
  }

  private make(): Phaser.GameObjects.Image {
    const image = this.scene.add.image(0, 0, VFX_ATLAS, vfxFrame('land-warm-0', 0))
      .setOrigin(0, 0.5).setScale(SPRITE_SCALE).setDepth(this.depth);
    this.images.push(image);
    return image;
  }
}
