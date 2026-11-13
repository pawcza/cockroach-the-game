/**
 * The Eksterminator's spray stream: out of the nozzle and down its lane to the screen's edge, drawn from his atlas.
 * It runs on the fight's own clock (so a hit-stop holds it too); the fight decides the hits.
 */
import Phaser from 'phaser';
import { DEPTH } from '../../config/constants';
import { SPRITE_SCALE } from '../../config/sprites';
import { EKS_SPRITES, EKS_TEXTURE, eksFrame, JET_TILE } from './eksterminatorConfig';
import type { Lane } from './eksterminatorPatterns';

const S = SPRITE_SCALE;
/** The pour onto the bottom lane and the burst at the nozzle, native px wide (as baked). */
const DIVE_W = 22;
const BURST_W = 12;

/** The frame of a looping sprite at this moment of the fight's clock: every piece of the stream churns in step. */
export function frameAt(name: keyof typeof EKS_SPRITES, now: number): number {
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
  /** When it left the nozzle (fight clock), and how long its front takes to the screen's left edge. */
  startedAt: number;
  growMs: number;
}

/** The spray: out of the nozzle and down its lane to the screen's edge, its front racing left as it starts. */
export class SprayStream {
  private head: Phaser.GameObjects.Image;
  private tiles: Phaser.GameObjects.Image[] = [];
  private splash: Phaser.GameObjects.Image;

  constructor(private scene: Phaser.Scene, private opts: StreamOptions) {
    const top = opts.lane === 'top';
    this.head = scene.add.image(opts.nozzleX, opts.nozzleY, EKS_TEXTURE, eksFrame(top ? 'jet-burst' : 'jet-dive'))
      .setScale(S).setDepth(DEPTH.OBSTACLES + 1);
    this.splash = scene.add.image(opts.nozzleX, opts.laneY, EKS_TEXTURE, eksFrame('jet-splash'))
      .setScale(S).setDepth(DEPTH.OBSTACLES + 1);
    this.update(opts.startedAt);
  }

  /** Where the stream's own row starts, left of the burst or the pour. */
  private get startX(): number {
    return this.opts.nozzleX - (this.opts.lane === 'top' ? BURST_W : DIVE_W) * S;
  }

  /** The stream's front, in the world, at this moment of the fight's clock. */
  frontX(now: number): number {
    const cam = this.scene.cameras.main;
    const t = Phaser.Math.Clamp((now - this.opts.startedAt) / this.opts.growMs, 0, 1);
    return Phaser.Math.Linear(this.startX, cam.scrollX - 20, t);
  }

  get lane(): Lane { return this.opts.lane; }

  /** Everything it is drawn with, to flash when it hits. */
  get parts(): Phaser.GameObjects.Image[] {
    return [this.head, this.splash, ...this.tiles];
  }

  update(now: number): void {
    const top = this.opts.lane === 'top';
    this.head.setFrame(eksFrame(top ? 'jet-burst' : 'jet-dive', frameAt(top ? 'jet-burst' : 'jet-dive', now)));
    const front = this.frontX(now);
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
    this.splash.setFrame(eksFrame('jet-splash', frameAt('jet-splash', now)))
      .setPosition(Math.max(front, this.scene.cameras.main.scrollX + 8), this.opts.laneY);
  }

  destroy(): void {
    this.head.destroy();
    this.splash.destroy();
    for (const tile of this.tiles) tile.destroy();
    this.tiles = [];
  }
}
