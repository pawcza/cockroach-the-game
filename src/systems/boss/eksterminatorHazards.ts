/**
 * What the Eksterminator puts on the lanes: the spray's stream, the canister in the air and the gas cloud it leaves.
 * Each draws itself from his atlas and reports where it is; the fight decides the hits.
 */
import Phaser from 'phaser';
import { DEPTH } from '../../config/constants';
import { SPRITE_SCALE } from '../../config/sprites';
import { DIVE_DROP, EKS_SPRITES, EKS_TEXTURE, eksAnimKey, eksFrame, JET_TILE } from './eksterminatorConfig';
import type { Lane } from './eksterminatorPatterns';
import { Trail } from './bossTelegraph';

const S = SPRITE_SCALE;
/** The pour onto the bottom lane and the burst at the nozzle, native px wide (as baked). */
const DIVE_W = 22;
const BURST_W = 12;

/** The frame of a looping sprite at this moment: every piece of the stream churns in step. */
function frameAt(name: keyof typeof EKS_SPRITES, now: number): number {
  const { frames, fps } = EKS_SPRITES[name];
  return Math.floor((now * fps) / 1000) % frames;
}

export interface StreamOptions {
  lane: Lane;
  /** The nozzle's mouth, in the world. */
  nozzleX: number;
  nozzleY: number;
  /** The stream's middle row along its lane, in the world. */
  laneY: number;
  /** It races from the nozzle to the screen's left edge in this long. */
  growMs: number;
}

/** The spray: out of the nozzle and down its lane to the screen's edge, its front racing left as it starts. */
export class SprayStream {
  private scene: Phaser.Scene;
  private opts: StreamOptions;
  private startedAt: number;
  private head: Phaser.GameObjects.Image;
  private tiles: Phaser.GameObjects.Image[] = [];
  private splash: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, opts: StreamOptions) {
    this.scene = scene;
    this.opts = opts;
    this.startedAt = scene.time.now;
    const top = opts.lane === 'top';
    this.head = scene.add.image(opts.nozzleX, opts.nozzleY, EKS_TEXTURE, eksFrame(top ? 'jet-burst' : 'jet-dive'))
      .setScale(S).setDepth(DEPTH.OBSTACLES + 1);
    this.splash = scene.add.image(opts.nozzleX, opts.laneY, EKS_TEXTURE, eksFrame('jet-splash'))
      .setScale(S).setDepth(DEPTH.OBSTACLES + 1);
    this.update();
  }

  /** Where the stream's own row starts, left of the burst or the pour. */
  private get startX(): number {
    return this.opts.nozzleX - (this.opts.lane === 'top' ? BURST_W : DIVE_W) * S;
  }

  /** The stream's front, in the world: it reaches the screen's left edge once it has grown. */
  get frontX(): number {
    const cam = this.scene.cameras.main;
    const t = Math.min(1, (this.scene.time.now - this.startedAt) / this.opts.growMs);
    return Phaser.Math.Linear(this.startX, cam.scrollX - 20, t);
  }

  get lane(): Lane { return this.opts.lane; }

  /** Everything it is drawn with, to flash when it hits. */
  get parts(): Phaser.GameObjects.Image[] {
    return [this.head, this.splash, ...this.tiles];
  }

  update(): void {
    const now = this.scene.time.now;
    const top = this.opts.lane === 'top';
    this.head.setFrame(eksFrame(top ? 'jet-burst' : 'jet-dive', frameAt(top ? 'jet-burst' : 'jet-dive', now)));
    const front = this.frontX;
    const tileW = JET_TILE * S;
    const k = frameAt('jet', now);
    let i = 0;
    for (let right = this.startX; right > front; right -= tileW, i++) {
      let tile = this.tiles[i];
      if (!tile) {
        tile = this.scene.add.image(0, 0, EKS_TEXTURE, eksFrame('jet')).setScale(S).setDepth(DEPTH.OBSTACLES + 1);
        this.tiles.push(tile);
      }
      tile.setFrame(eksFrame('jet', k)).setPosition(right, this.opts.laneY).setVisible(true);
    }
    for (; i < this.tiles.length; i++) this.tiles[i].setVisible(false);
    this.splash.setFrame(eksFrame('jet-splash', frameAt('jet-splash', now))).setPosition(Math.max(front, this.scene.cameras.main.scrollX + 8), this.opts.laneY);
  }

  destroy(): void {
    this.head.destroy();
    this.splash.destroy();
    for (const tile of this.tiles) tile.destroy();
    this.tiles = [];
  }
}

/** The pour's height is the bake's: the bottom nozzle sits this far above the stream's row. */
export const DIVE_DROP_PX = DIVE_DROP * S;

export interface CanisterOptions {
  from: { x: number; y: number };
  to: { x: number; y: number };
  flightMs: number;
  /** How far above the higher end the arc peaks, px. */
  peakPx: number;
  /** The lane it comes down on. */
  lands: Lane;
}

/** A canister in the air, spinning along its arc. Coming down, it is in its landing lane's sights. */
export class Canister {
  private scene: Phaser.Scene;
  private opts: CanisterOptions;
  private startedAt: number;
  readonly sprite: Phaser.GameObjects.Sprite;
  /** A green trail behind it: it reads against a dark level. */
  private trail: Trail;
  private _landed = false;
  private descending = false;
  /** Called once its business is done: shot down, or its cloud past the roach. */
  onResolved?: () => void;

  constructor(scene: Phaser.Scene, opts: CanisterOptions) {
    this.scene = scene;
    this.opts = opts;
    this.startedAt = scene.time.now;
    this.sprite = scene.add.sprite(opts.from.x, opts.from.y, EKS_TEXTURE, eksFrame('canister')).setScale(S)
      .setDepth(DEPTH.PICKUPS + 2);
    this.sprite.play(eksAnimKey('canister'));
    this.trail = new Trail(scene, 0x9be04a, 340, 10, DEPTH.PICKUPS + 1);
  }

  get x(): number { return this.sprite.x; }
  get y(): number { return this.sprite.y; }
  get lands(): Lane { return this.opts.lands; }
  get landed(): boolean { return this._landed; }
  get target(): { x: number; y: number } { return this.opts.to; }

  /**
   * The lane whose shots can meet it now: its landing lane once it is coming down, as it is then dropping towards
   * that lane's roach; null on its way up.
   */
  get lane(): Lane | null {
    return this.descending ? this.opts.lands : null;
  }

  /** Moves it along; true on the frame it lands. */
  update(): boolean {
    if (this._landed) return false;
    const { from, to, flightMs, peakPx } = this.opts;
    const t = Math.min(1, (this.scene.time.now - this.startedAt) / flightMs);
    const lift = Math.max(0, Math.min(from.y, to.y) - peakPx);
    // A parabola through both ends with its top peakPx over the higher one
    const h0 = from.y - lift;
    const h1 = to.y - lift;
    const a = Math.sqrt(h0);
    const b = Math.sqrt(h1);
    const peakT = a / (a + b);
    const y = t < peakT
      ? lift + h0 * Math.pow(1 - t / peakT, 2)
      : lift + h1 * Math.pow((t - peakT) / (1 - peakT), 2);
    this.sprite.setPosition(Phaser.Math.Linear(from.x, to.x, t), y);
    this.trail.push(this.sprite.x, this.sprite.y);
    this.descending = t >= peakT;
    if (t >= 1) {
      this._landed = true;
      return true;
    }
    return false;
  }

  destroy(): void {
    this.sprite.destroy();
    this.trail.destroy();
  }
}

export interface CloudOptions {
  lane: Lane;
  x: number;
  laneY: number;
  /** It boils where it landed this long, then rolls towards the roach. */
  sitMs: number;
  /** px/s, to the left. */
  rollSpeed: number;
}

/** The gas a canister leaves: it boils on its lane where it landed, then rolls along it to the left and off screen. */
export class GasCloud {
  private scene: Phaser.Scene;
  private opts: CloudOptions;
  private startedAt: number;
  readonly sprite: Phaser.GameObjects.Sprite;
  /** The roach dashed through it. */
  dashedThrough = false;
  /** It has reached the roach and gone past (or got it): its business is done. */
  resolved = false;
  /** The canister's: called once the cloud is past the roach. */
  onResolved?: () => void;

  constructor(scene: Phaser.Scene, opts: CloudOptions) {
    this.scene = scene;
    this.opts = opts;
    this.startedAt = scene.time.now;
    this.sprite = scene.add.sprite(opts.x, opts.laneY, EKS_TEXTURE, eksFrame('cloud')).setScale(S)
      .setDepth(DEPTH.PICKUPS + 1);
    this.sprite.play(eksAnimKey('cloud'));
    this.sprite.setScale(S * 0.3);
    scene.tweens.add({ targets: this.sprite, scale: S, duration: 260, ease: 'Back.easeOut' });
  }

  get lane(): Lane { return this.opts.lane; }
  get x(): number { return this.sprite.x; }
  get rolling(): boolean { return this.scene.time.now - this.startedAt >= this.opts.sitMs; }
  get done(): boolean { return this.sprite.x < this.scene.cameras.main.scrollX - 80; }

  update(delta: number): void {
    if (this.rolling) this.sprite.x -= (this.opts.rollSpeed * delta) / 1000;
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}
