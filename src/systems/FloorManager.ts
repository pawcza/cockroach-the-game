import Phaser from 'phaser';
import {
  FLOOR_HEIGHT,
  FLOOR_TILE_W,
  FLOOR_TILE_H,
  FLOOR_TILE_STEP,
  FLOOR_TILE_RADIUS,
  COCKROACH_START_X,
} from '../config/constants';
import { getLevelForDistance } from '../config/levels';

const COLLIDER_DROP = 8;

/**
 * Manages floor physics bodies, tile sprites, crumble effects, and
 * active-floor highlights.
 */
export class FloorManager {
  private scene: Phaser.Scene;

  // Physics bodies
  private _floorTopBody!: Phaser.GameObjects.Rectangle;
  private _floorBottomBody!: Phaser.GameObjects.Rectangle;

  // Visual tile sprites
  private floorTopSprites: Phaser.GameObjects.Image[] = [];
  private floorBottomSprites: Phaser.GameObjects.Image[] = [];

  // Highlight strips
  private floorHighlightTop!: Phaser.GameObjects.Rectangle;
  private floorHighlightBottom!: Phaser.GameObjects.Rectangle;

  // Crumble tracking
  private steppedTopRanges: { from: number; to: number; lastFallX: number }[] = [];
  private steppedBottomRanges: { from: number; to: number; lastFallX: number }[] = [];
  private lastTrackedFloor: 'top' | 'bottom' = 'bottom';

  private floorTopY: number;
  private floorBottomY: number;

  // Public getters so GameScene can wire physics colliders
  get floorTopBody(): Phaser.GameObjects.Rectangle { return this._floorTopBody; }
  get floorBottomBody(): Phaser.GameObjects.Rectangle { return this._floorBottomBody; }

  constructor(scene: Phaser.Scene, floorTopY: number, floorBottomY: number) {
    this.scene = scene;
    this.floorTopY = floorTopY;
    this.floorBottomY = floorBottomY;
  }

  create(): void {
    const w = this.scene.cameras.main.width;

    // Generate rounded floor textures for all levels
    this.generateRoundedFloorTextures();

    this.floorTopSprites = [];
    this.floorBottomSprites = [];

    const FLOOR_WIDTH = w + 200;

    this._floorTopBody = this.scene.add.rectangle(0, this.floorTopY + COLLIDER_DROP, FLOOR_WIDTH, FLOOR_HEIGHT, 0x000000, 0)
      .setOrigin(0, 0);
    this.scene.physics.add.existing(this._floorTopBody, true);

    this._floorBottomBody = this.scene.add.rectangle(0, this.floorBottomY + COLLIDER_DROP, FLOOR_WIDTH, FLOOR_HEIGHT, 0x000000, 0)
      .setOrigin(0, 0);
    this.scene.physics.add.existing(this._floorBottomBody, true);

    // Create visual floor tile sprites
    const tilesNeeded = Math.ceil(FLOOR_WIDTH / FLOOR_TILE_STEP) + 2;
    for (let i = 0; i < tilesNeeded; i++) {
      const topTile = this.scene.add.image(i * FLOOR_TILE_STEP, this.floorTopY, 'floor-rounded-lv1')
        .setOrigin(0, 0).setDepth(3);
      this.floorTopSprites.push(topTile);

      const bottomTile = this.scene.add.image(i * FLOOR_TILE_STEP, this.floorBottomY, 'floor-rounded-lv1')
        .setOrigin(0, 0).setDepth(3);
      this.floorBottomSprites.push(bottomTile);
    }

    // Active floor highlight
    const highlightW = w + 200;
    this.floorHighlightTop = this.scene.add.rectangle(0, this.floorTopY + FLOOR_TILE_H / 2, highlightW, FLOOR_TILE_H + 8, 0xffffff, 0)
      .setOrigin(0, 0.5).setDepth(2).setBlendMode(Phaser.BlendModes.ADD);
    this.floorHighlightBottom = this.scene.add.rectangle(0, this.floorBottomY + FLOOR_TILE_H / 2, highlightW, FLOOR_TILE_H + 8, 0xffffff, 0)
      .setOrigin(0, 0.5).setDepth(2).setBlendMode(Phaser.BlendModes.ADD);
  }

  resetCrumbleState(): void {
    this.steppedTopRanges = [];
    const startSnap = Math.floor(COCKROACH_START_X / FLOOR_TILE_STEP) * FLOOR_TILE_STEP;
    this.steppedBottomRanges = [{ from: startSnap, to: COCKROACH_START_X, lastFallX: startSnap - FLOOR_TILE_STEP }];
    this.lastTrackedFloor = 'bottom';
  }

  update(
    trackX: number,
    trackFloor: 'top' | 'bottom',
    shouldTrack: boolean,
    currentFloor: 'top' | 'bottom',
  ): void {
    const camX = this.scene.cameras.main.scrollX;
    const bodyX = camX - 100;

    // Move invisible physics bodies
    this._floorTopBody.x = bodyX;
    (this._floorTopBody.body as Phaser.Physics.Arcade.StaticBody).x = bodyX;
    (this._floorTopBody.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
    this._floorBottomBody.x = bodyX;
    (this._floorBottomBody.body as Phaser.Physics.Arcade.StaticBody).x = bodyX;
    (this._floorBottomBody.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();

    if (shouldTrack) {
      const ranges = trackFloor === 'top' ? this.steppedTopRanges : this.steppedBottomRanges;

      // On floor swap, start a new range at the landing position
      if (trackFloor !== this.lastTrackedFloor) {
        const snapX = Math.floor(trackX / FLOOR_TILE_STEP) * FLOOR_TILE_STEP;
        ranges.push({ from: snapX, to: trackX, lastFallX: snapX - FLOOR_TILE_STEP });
        this.lastTrackedFloor = trackFloor;
      }

      // Extend the current range
      if (ranges.length > 0) {
        const current = ranges[ranges.length - 1];
        current.to = Math.max(current.to, trackX);
      }
    }

    // Position visual tile sprites
    const firstTileX = Math.floor((camX - 100) / FLOOR_TILE_STEP) * FLOOR_TILE_STEP;
    for (let i = 0; i < this.floorTopSprites.length; i++) {
      const tx = firstTileX + i * FLOOR_TILE_STEP;
      this.floorTopSprites[i].x = tx;
      this.floorBottomSprites[i].x = tx;

      const tileDistance = (tx - COCKROACH_START_X) / 50;
      const tileLevelConfig = getLevelForDistance(tileDistance);
      const tileTextureKey = `floor-rounded-lv${tileLevelConfig.level}`;

      const topStepped = this.isTileStepped(tx, this.steppedTopRanges);
      this.floorTopSprites[i].setVisible(!topStepped);
      if (!topStepped && this.floorTopSprites[i].texture.key !== tileTextureKey) {
        this.floorTopSprites[i].setTexture(tileTextureKey);
      }

      const bottomStepped = this.isTileStepped(tx, this.steppedBottomRanges);
      this.floorBottomSprites[i].setVisible(!bottomStepped);
      if (!bottomStepped && this.floorBottomSprites[i].texture.key !== tileTextureKey) {
        this.floorBottomSprites[i].setTexture(tileTextureKey);
      }
    }

    // Spawn falling tile copies for all ranges
    for (const range of this.steppedTopRanges) {
      this.spawnFallingTilesForRange(range, this.floorTopY);
    }
    for (const range of this.steppedBottomRanges) {
      this.spawnFallingTilesForRange(range, this.floorBottomY);
    }

    // Active floor highlight
    this.floorHighlightTop.x = bodyX;
    this.floorHighlightBottom.x = bodyX;
    const pulse = 0.08 + Math.sin(this.scene.time.now * 0.004) * 0.04;
    this.floorHighlightTop.setAlpha(currentFloor === 'top' ? pulse : 0);
    this.floorHighlightBottom.setAlpha(currentFloor === 'bottom' ? pulse : 0);
  }

  private isTileStepped(tx: number, ranges: { from: number; to: number }[]): boolean {
    const tileEnd = tx + FLOOR_TILE_W;
    for (const range of ranges) {
      if (tileEnd > range.from && tileEnd < range.to) return true;
    }
    return false;
  }

  private spawnFallingTilesForRange(range: { from: number; to: number; lastFallX: number }, floorY: number): void {
    let startX = Math.floor((range.lastFallX + 1) / FLOOR_TILE_STEP) * FLOOR_TILE_STEP;
    if (startX <= range.lastFallX) startX += FLOOR_TILE_STEP;

    const MAX_TILES_PER_FRAME = 3;
    let tilesSpawned = 0;

    while (startX + FLOOR_TILE_W < range.to && tilesSpawned < MAX_TILES_PER_FRAME) {
      const tileDistance = (startX - COCKROACH_START_X) / 50;
      const tileLevelConfig = getLevelForDistance(tileDistance);
      const textureKey = `floor-rounded-lv${tileLevelConfig.level}`;

      const fallingTile = this.scene.add.image(startX, floorY, textureKey)
        .setOrigin(0, 0).setDepth(3);

      const spinDir = Math.random() > 0.5 ? 1 : -1;
      this.scene.tweens.add({
        targets: fallingTile,
        y: floorY + 200 + Math.random() * 100,
        angle: spinDir * (30 + Math.random() * 60),
        alpha: 0,
        duration: 600 + Math.random() * 400,
        ease: 'Quad.easeIn',
        onComplete: () => fallingTile.destroy(),
      });

      range.lastFallX = startX;
      startX += FLOOR_TILE_STEP;
      tilesSpawned++;
    }
  }

  private generateRoundedFloorTextures(): void {
    for (let i = 1; i <= 10; i++) {
      const key = `floor-rounded-lv${i}`;
      const sourceKey = `lv${i}-floor`;
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
}
