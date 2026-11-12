/**
 * What Pani Lodzia's slipper sends along the lane it hits: a crest racing left along the ledge, dust kicked up behind
 * it, the ledge's tiles bumping up as it passes. It reaches the roach in a set time whatever the screen's width, so
 * every screen gets the same time to hop, and tells the fight when it gets there.
 */
import Phaser from 'phaser';
import { DEPTH } from '../../config/constants';
import { getFx } from '../../effects/Fx';

const CREST_COLOR = 0xfff1d6;
const CREST_SHADE = 0xc4baac;
/** The crest's shape, 2 px columns from its front: how tall each is. */
const CREST = [4, 10, 16, 22, 26, 28, 26, 24, 20, 16, 14, 12, 10, 8, 6, 6, 4, 4, 2, 2];
const BLOCK = 2;
/** A ledge tile rises this much as the crest passes under it, over this distance either side. */
const BUMP_PX = 8;
const BUMP_REACH = 120;
/** A puff of dust behind the crest every this many px. */
const DUST_EVERY_PX = 12;
/** Ledge tiles sit at most this far above or below their lane's line. */
const TILE_SLACK = 8;

export interface ShockwaveOptions {
  laneY: number;
  fromX: number;
  roachX: number;
  /** From the impact to the roach. */
  toRoachMs: number;
  onReachRoach: () => void;
  /** The scene time the slipper landed by the attack's plan; now, if not given. */
  startedAt?: number;
}

export class Shockwave {
  private scene: Phaser.Scene;
  private opts: ShockwaveOptions;
  private startedAt: number;
  private speed: number;
  private crest: Phaser.GameObjects.Graphics;
  private tiles: Phaser.GameObjects.Image[];
  private lastDustX: number;
  private reached = false;
  private _done = false;

  constructor(scene: Phaser.Scene, opts: ShockwaveOptions) {
    this.scene = scene;
    this.opts = opts;
    this.startedAt = opts.startedAt ?? scene.time.now;
    this.speed = Math.max(1, opts.fromX - opts.roachX) / opts.toRoachMs;
    this.lastDustX = opts.fromX;
    this.crest = scene.add.graphics().setDepth(DEPTH.PICKUPS + 1);
    // The ledge's own tiles in this lane: the floor redraws them every frame, so they are only nudged after it has
    this.tiles = scene.children.list.filter((obj): obj is Phaser.GameObjects.Image =>
      obj instanceof Phaser.GameObjects.Image && obj.depth === DEPTH.FLOOR && Math.abs(obj.y - opts.laneY) <= TILE_SLACK);
  }

  get done(): boolean { return this._done; }

  /** Call after the floor has placed its tiles for the frame (the scene's postupdate). */
  update(): void {
    if (this._done) return;
    const { laneY, fromX, roachX, onReachRoach } = this.opts;
    const x = fromX - (this.scene.time.now - this.startedAt) * this.speed;
    if (!this.reached && x <= roachX) {
      this.reached = true;
      onReachRoach();
      // A hit tore the fight down from inside that call, and this wave with it: nothing more to draw
      if (this._done) return;
    }
    const cam = this.scene.cameras.main;
    if (x < cam.scrollX - CREST.length * BLOCK) {
      this.finish();
      return;
    }
    this.drawCrest(x, laneY);
    for (const tile of this.tiles) {
      if (!tile.active || !tile.visible) continue;
      const middle = tile.x + tile.displayWidth / 2;
      const near = 1 - Math.abs(middle - x) / BUMP_REACH;
      if (near > 0) tile.y -= 2 * Math.round(BUMP_PX * near / 2);
    }
    while (this.lastDustX - x >= DUST_EVERY_PX) {
      this.lastDustX -= DUST_EVERY_PX;
      this.kickDust(this.lastDustX, laneY);
    }
  }

  private drawCrest(x: number, y: number): void {
    const g = this.crest.clear();
    const left = Math.round(x / BLOCK) * BLOCK;
    CREST.forEach((height, i) => {
      g.fillStyle(CREST_SHADE, 1).fillRect(left + i * BLOCK, y - height, BLOCK, height);
      g.fillStyle(CREST_COLOR, 1).fillRect(left + i * BLOCK, y - height, BLOCK, Math.max(BLOCK, height / 2));
    });
    // Its leading edge lit, and a streak along the ledge behind it
    CREST.forEach((height, i) => {
      if (i < 4) g.fillStyle(0xffffff, 1).fillRect(left + i * BLOCK, y - height, BLOCK, BLOCK * 2);
    });
    g.fillStyle(CREST_COLOR, 0.7).fillRect(left + CREST.length * BLOCK, y - BLOCK * 2, 120, BLOCK * 2);
    g.fillStyle(CREST_COLOR, 0.35).fillRect(left + CREST.length * BLOCK, y - BLOCK * 4, 70, BLOCK * 2);
  }

  /** Dust kicked up off the crest as it rolls along the ledge. */
  private kickDust(x: number, y: number): void {
    getFx(this.scene).play('dust', x, y, { depth: DEPTH.PICKUPS + 1, vx: 40 + Math.random() * 40, flipX: true });
  }

  private finish(): void {
    this._done = true;
    this.crest.destroy();
  }

  destroy(): void {
    if (!this._done) this.finish();
  }
}
