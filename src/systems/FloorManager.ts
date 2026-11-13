import Phaser from 'phaser';
import {
  FLOOR_HEIGHT,
  FLOOR_TILE_W,
  FLOOR_TILE_H,
  FLOOR_TILE_STEP,
  FLOOR_TILE_RADIUS,
  COCKROACH_START_X,
  DEPTH,
  PIXEL_BLOCK,
} from '../config/constants';
import { getLevelForDistance, LEVELS } from '../config/levels';
import { getFx } from '../effects/Fx';

const COLLIDER_DROP = 8;
/** A soft pulse of light over the lane the roach is on. Off: the roach shows its lane. true brings it back. */
const LANE_HIGHLIGHT = false;
const FLOOR_OVERHANG = 200;

// A painted ledge strip is one seamless image cut into tile-wide segments. Matches tools/art/levels.py.
const LEDGE_SEGMENTS = 10;
const LEDGE_SEGMENT_W = FLOOR_TILE_STEP / PIXEL_BLOCK;
/** The strip's top row sits this far above the floor line, so feet land on its top surface. */
const LEDGE_LIFT = 4;

interface TileLook {
  key: string;
  frame?: string;
  scale: number;
  lift: number;
}

export class FloorManager {
  private scene: Phaser.Scene;
  private floorTopY: number;
  private floorBottomY: number;

  private floorTopBody!: Phaser.GameObjects.Rectangle;
  private floorBottomBody!: Phaser.GameObjects.Rectangle;
  private floorTopSprites: Phaser.GameObjects.Image[] = [];
  private floorBottomSprites: Phaser.GameObjects.Image[] = [];
  private floorHighlightTop: Phaser.GameObjects.Rectangle | null = null;
  private floorHighlightBottom: Phaser.GameObjects.Rectangle | null = null;

  // Floor crumble — tiles behind cockroach fall away
  private steppedTopRanges: { from: number; to: number; lastFallX: number }[] = [];
  private steppedBottomRanges: { from: number; to: number; lastFallX: number }[] = [];
  private lastTrackedFloor: 'top' | 'bottom' = 'bottom';
  /**
   * The highest level a tile may wear (LevelProgression.levelCap): past a boss still to be beaten the ledge keeps the
   * level before it, so the next level's floor never shows ahead of the fight.
   */
  levelCap = Infinity;
  /**
   * How far the tile grid is shifted, after the world was moved back under the camera (rebase): the ledge keeps its
   * place on screen and its painted pattern, whatever the distance moved.
   */
  private phase = 0;

  get topBody(): Phaser.GameObjects.Rectangle { return this.floorTopBody; }
  get bottomBody(): Phaser.GameObjects.Rectangle { return this.floorBottomBody; }
  get topColliderY(): number { return this.floorTopY + COLLIDER_DROP; }
  get bottomColliderY(): number { return this.floorBottomY + COLLIDER_DROP; }

  constructor(scene: Phaser.Scene, floorTopY: number, floorBottomY: number) {
    this.scene = scene;
    this.floorTopY = floorTopY;
    this.floorBottomY = floorBottomY;
  }

  create(camWidth: number): void {
    const startSnap = Math.floor(COCKROACH_START_X / FLOOR_TILE_STEP) * FLOOR_TILE_STEP;
    this.phase = 0;
    this.steppedTopRanges = [];
    this.steppedBottomRanges = [{ from: startSnap, to: COCKROACH_START_X, lastFallX: startSnap - FLOOR_TILE_STEP }];
    this.lastTrackedFloor = 'bottom';
    this.floorTopSprites = [];
    this.floorBottomSprites = [];

    this.generateRoundedFloorTextures();

    const FLOOR_WIDTH = camWidth + FLOOR_OVERHANG;

    this.floorTopBody = this.scene.add.rectangle(0, this.floorTopY + COLLIDER_DROP, FLOOR_WIDTH, FLOOR_HEIGHT, 0x000000, 0)
      .setOrigin(0, 0);
    this.scene.physics.add.existing(this.floorTopBody, true);

    this.floorBottomBody = this.scene.add.rectangle(0, this.floorBottomY + COLLIDER_DROP, FLOOR_WIDTH, FLOOR_HEIGHT, 0x000000, 0)
      .setOrigin(0, 0);
    this.scene.physics.add.existing(this.floorBottomBody, true);

    this.addTiles(FLOOR_WIDTH);

    if (LANE_HIGHLIGHT) {
      this.floorHighlightTop = this.scene.add.rectangle(0, this.floorTopY + FLOOR_TILE_H / 2, FLOOR_WIDTH, FLOOR_TILE_H + 8, 0xffffff, 0)
        .setOrigin(0, 0.5).setDepth(DEPTH.FLOOR - 1).setBlendMode(Phaser.BlendModes.ADD);
      this.floorHighlightBottom = this.scene.add.rectangle(0, this.floorBottomY + FLOOR_TILE_H / 2, FLOOR_WIDTH, FLOOR_TILE_H + 8, 0xffffff, 0)
        .setOrigin(0, 0.5).setDepth(DEPTH.FLOOR - 1).setBlendMode(Phaser.BlendModes.ADD);
    }
  }

  resize(camWidth: number): void {
    const floorWidth = camWidth + FLOOR_OVERHANG;
    this.floorTopBody.setSize(floorWidth, FLOOR_HEIGHT);
    this.floorBottomBody.setSize(floorWidth, FLOOR_HEIGHT);
    this.floorHighlightTop?.setSize(floorWidth, FLOOR_TILE_H + 8);
    this.floorHighlightBottom?.setSize(floorWidth, FLOOR_TILE_H + 8);
    this.addTiles(floorWidth);
  }

  /** Tiles are only ever added: on a narrower screen the spares sit off to the right. */
  private addTiles(floorWidth: number): void {
    const tilesNeeded = Math.ceil(floorWidth / FLOOR_TILE_STEP) + 2;
    for (let i = this.floorTopSprites.length; i < tilesNeeded; i++) {
      const topTile = this.scene.add.image(i * FLOOR_TILE_STEP, this.floorTopY, 'lv1-floor')
        .setOrigin(0, 0).setDepth(DEPTH.FLOOR);
      this.floorTopSprites.push(topTile);

      const bottomTile = this.scene.add.image(i * FLOOR_TILE_STEP, this.floorBottomY, 'lv1-floor')
        .setOrigin(0, 0).setDepth(DEPTH.FLOOR);
      this.floorBottomSprites.push(bottomTile);
    }
  }

  update(
    camX: number,
    trackX: number,
    trackFloor: 'top' | 'bottom',
    shouldTrack: boolean,
    currentPlayerFloor: 'top' | 'bottom',
    timeNow: number,
  ): void {
    const bodyX = camX - 100;

    this.floorTopBody.x = bodyX;
    (this.floorTopBody.body as Phaser.Physics.Arcade.StaticBody).x = bodyX;
    (this.floorTopBody.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
    this.floorBottomBody.x = bodyX;
    (this.floorBottomBody.body as Phaser.Physics.Arcade.StaticBody).x = bodyX;
    (this.floorBottomBody.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();

    if (shouldTrack) {
      const ranges = trackFloor === 'top' ? this.steppedTopRanges : this.steppedBottomRanges;

      if (trackFloor !== this.lastTrackedFloor) {
        const snapX = this.snap(trackX);
        ranges.push({ from: snapX, to: trackX, lastFallX: snapX - FLOOR_TILE_STEP });
        this.lastTrackedFloor = trackFloor;
      }

      if (ranges.length > 0) {
        const current = ranges[ranges.length - 1];
        current.to = Math.max(current.to, trackX);
      }
    }

    this.dropRangesBehind(camX - 100, this.steppedTopRanges);
    this.dropRangesBehind(camX - 100, this.steppedBottomRanges);

    const firstTileX = this.snap(camX - 100);
    for (let i = 0; i < this.floorTopSprites.length; i++) {
      const tx = firstTileX + i * FLOOR_TILE_STEP;
      this.floorTopSprites[i].x = tx;
      this.floorBottomSprites[i].x = tx;

      const look = this.tileLook(tx);
      const topStepped = this.isTileStepped(tx, this.steppedTopRanges);
      this.floorTopSprites[i].setVisible(!topStepped);
      if (!topStepped && look) this.dressTile(this.floorTopSprites[i], look, this.floorTopY);

      const bottomStepped = this.isTileStepped(tx, this.steppedBottomRanges);
      this.floorBottomSprites[i].setVisible(!bottomStepped);
      if (!bottomStepped && look) this.dressTile(this.floorBottomSprites[i], look, this.floorBottomY);
    }

    for (const range of this.steppedTopRanges) {
      this.spawnFallingTilesForRange(range, this.floorTopY);
    }
    for (const range of this.steppedBottomRanges) {
      this.spawnFallingTilesForRange(range, this.floorBottomY);
    }

    if (this.floorHighlightTop && this.floorHighlightBottom) {
      this.floorHighlightTop.x = bodyX;
      this.floorHighlightBottom.x = bodyX;
      const pulseAlpha = 0.08 + Math.sin(timeNow * 0.004) * 0.04;
      this.floorHighlightTop.setAlpha(currentPlayerFloor === 'top' ? pulseAlpha : 0);
      this.floorHighlightBottom.setAlpha(currentPlayerFloor === 'bottom' ? pulseAlpha : 0);
    }
  }

  regenerateFloorTextures(): void {
    this.generateRoundedFloorTextures();
  }

  /** How the tile at this world x looks, or null while its level's art is still loading (it keeps the look it had). */
  private tileLook(tx: number): TileLook | null {
    const byX = getLevelForDistance((tx - COCKROACH_START_X) / 50);
    const config = byX.level > this.levelCap ? LEVELS[this.levelCap - 1] : byX;
    if (config.painted) {
      if (!this.scene.textures.exists(config.floorKey)) return null;
      const index = Math.round((tx + this.phase) / FLOOR_TILE_STEP);
      const segment = ((index % LEDGE_SEGMENTS) + LEDGE_SEGMENTS) % LEDGE_SEGMENTS;
      return { key: config.floorKey, frame: `segment-${segment}`, scale: PIXEL_BLOCK, lift: LEDGE_LIFT };
    }
    const key = `floor-rounded-lv${config.level}`;
    return this.scene.textures.exists(key) ? { key, scale: 1, lift: 0 } : null;
  }

  private dressTile(tile: Phaser.GameObjects.Image, look: TileLook, floorY: number): void {
    if (tile.texture.key !== look.key || (look.frame && tile.frame.name !== look.frame)) {
      tile.setTexture(look.key, look.frame);
    }
    tile.setScale(look.scale);
    tile.y = floorY - look.lift;
  }

  private cutLedgeSegments(key: string): void {
    const texture = this.scene.textures.get(key);
    if (texture.has('segment-0')) return;
    const height = texture.source[0].height;
    for (let i = 0; i < LEDGE_SEGMENTS; i++) {
      texture.add(`segment-${i}`, 0, i * LEDGE_SEGMENT_W, 0, LEDGE_SEGMENT_W, height);
    }
  }

  private generateRoundedFloorTextures(): void {
    for (let i = 1; i <= 10; i++) {
      const key = `floor-rounded-lv${i}`;
      const sourceKey = `lv${i}-floor`;
      if (!this.scene.textures.exists(sourceKey)) continue;
      if (LEVELS[i - 1].painted) {
        this.cutLedgeSegments(sourceKey);
        continue;
      }
      const sourceImage = this.scene.textures.get(sourceKey).getSourceImage() as HTMLImageElement;

      if (this.scene.textures.exists(key)) {
        const tex = this.scene.textures.get(key);
        const existingCanvas = tex.getSourceImage() as HTMLCanvasElement;
        const ctx = existingCanvas.getContext('2d')!;
        ctx.clearRect(0, 0, FLOOR_TILE_W, FLOOR_TILE_H);
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(0, 0, FLOOR_TILE_W, FLOOR_TILE_H, FLOOR_TILE_RADIUS);
        ctx.clip();
        ctx.drawImage(sourceImage, 0, 0, FLOOR_TILE_W, FLOOR_TILE_H);
        ctx.restore();
        (tex.source[0] as Phaser.Textures.TextureSource).update();
      } else {
        const canvas = document.createElement('canvas');
        canvas.width = FLOOR_TILE_W;
        canvas.height = FLOOR_TILE_H;
        const ctx = canvas.getContext('2d')!;
        ctx.beginPath();
        ctx.roundRect(0, 0, FLOOR_TILE_W, FLOOR_TILE_H, FLOOR_TILE_RADIUS);
        ctx.clip();
        ctx.drawImage(sourceImage, 0, 0, FLOOR_TILE_W, FLOOR_TILE_H);
        this.scene.textures.addCanvas(key, canvas);
      }
    }
  }

  /** Whether the ledge under this world x has crumbled away behind a runner. */
  isGap(x: number, floor: 'top' | 'bottom'): boolean {
    const tileX = this.snap(x);
    return this.isTileStepped(tileX, floor === 'top' ? this.steppedTopRanges : this.steppedBottomRanges);
  }

  /** The left edge of the tile under world x. */
  private snap(x: number): number {
    return Math.floor((x + this.phase) / FLOOR_TILE_STEP) * FLOOR_TILE_STEP - this.phase;
  }

  /**
   * The world moved back by `dx` under the camera (the tutorial's hand-off): the grid and what has crumbled move with
   * it, so the ledge on screen does not change. The tiles themselves follow the camera on the next update.
   */
  rebase(dx: number): void {
    this.phase = (((this.phase + dx) % (FLOOR_TILE_STEP * LEDGE_SEGMENTS)) + FLOOR_TILE_STEP * LEDGE_SEGMENTS) % (FLOOR_TILE_STEP * LEDGE_SEGMENTS);
    for (const range of [...this.steppedTopRanges, ...this.steppedBottomRanges]) {
      range.from -= dx;
      range.to -= dx;
      range.lastFallX -= dx;
    }
  }

  /** The newest range is the one still growing, so it always stays. */
  private dropRangesBehind(x: number, ranges: { to: number }[]): void {
    while (ranges.length > 1 && ranges[0].to < x) ranges.shift();
  }

  private isTileStepped(tx: number, ranges: { from: number; to: number }[]): boolean {
    const tileEnd = tx + FLOOR_TILE_W;
    for (const range of ranges) {
      if (tileEnd > range.from && tileEnd < range.to) return true;
    }
    return false;
  }

  private spawnFallingTilesForRange(range: { from: number; to: number; lastFallX: number }, floorY: number): void {
    let startX = this.snap(range.lastFallX + 1);
    if (startX <= range.lastFallX) startX += FLOOR_TILE_STEP;

    const MAX_TILES_PER_FRAME = 3;
    let tilesSpawned = 0;

    while (startX + FLOOR_TILE_W < range.to && tilesSpawned < MAX_TILES_PER_FRAME) {
      const look = this.tileLook(startX);
      if (!look) { startX += FLOOR_TILE_STEP; tilesSpawned++; continue; }

      const fallingTile = this.scene.add.image(startX, floorY - look.lift, look.key, look.frame)
        .setOrigin(0, 0).setScale(look.scale).setDepth(DEPTH.FLOOR);

      // It drops straight, unturned, so the painted ledge stays on the grid, and sheds a couple of bits as it goes
      this.scene.tweens.add({
        targets: fallingTile,
        y: floorY + 200 + Math.random() * 100,
        duration: 600 + Math.random() * 400,
        ease: 'Quad.easeIn',
        onComplete: () => fallingTile.destroy(),
      });
      getFx(this.scene).burst('chunk-stone', startX + FLOOR_TILE_W / 2, floorY + 6, 2, FLOOR_TILE_W / 3, {
        depth: DEPTH.FLOOR, speed: [20, 90], angle: [200, 340], gravity: 900, life: 700, loop: true,
      });

      range.lastFallX = startX;
      startX += FLOOR_TILE_STEP;
      tilesSpawned++;
    }
  }
}
