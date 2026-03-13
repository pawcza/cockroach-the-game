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

export class FloorRenderer {
  private scene: Phaser.Scene;

  // Physics bodies
  public floorTopBody!: Phaser.GameObjects.Rectangle;
  public floorBottomBody!: Phaser.GameObjects.Rectangle;

  // Visual tiles
  private floorTopSprites: Phaser.GameObjects.Image[] = [];
  private floorBottomSprites: Phaser.GameObjects.Image[] = [];

  // Floor highlights
  private floorHighlightTop!: Phaser.GameObjects.Rectangle;
  private floorHighlightBottom!: Phaser.GameObjects.Rectangle;

  // Floor crumble ranges
  private steppedTopRanges: { from: number; to: number; lastFallX: number }[] = [];
  private steppedBottomRanges: { from: number; to: number; lastFallX: number }[] = [];
  private lastTrackedFloor: 'top' | 'bottom' = 'bottom';

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  create(floorTopY: number, floorBottomY: number): void {
    const w = this.scene.cameras.main.width;
    this.generateRoundedFloorTextures();
    this.floorTopSprites = [];
    this.floorBottomSprites = [];
    const FLOOR_WIDTH = w + 200;
    const COLLIDER_DROP = 8;

    this.floorTopBody = this.scene.add.rectangle(0, floorTopY + COLLIDER_DROP, FLOOR_WIDTH, FLOOR_HEIGHT, 0x000000, 0).setOrigin(0, 0);
    this.scene.physics.add.existing(this.floorTopBody, true);
    this.floorBottomBody = this.scene.add.rectangle(0, floorBottomY + COLLIDER_DROP, FLOOR_WIDTH, FLOOR_HEIGHT, 0x000000, 0).setOrigin(0, 0);
    this.scene.physics.add.existing(this.floorBottomBody, true);

    const tilesNeeded = Math.ceil(FLOOR_WIDTH / FLOOR_TILE_STEP) + 2;
    for (let i = 0; i < tilesNeeded; i++) {
      this.floorTopSprites.push(this.scene.add.image(i * FLOOR_TILE_STEP, floorTopY, 'floor-rounded-lv1').setOrigin(0, 0).setDepth(3));
      this.floorBottomSprites.push(this.scene.add.image(i * FLOOR_TILE_STEP, floorBottomY, 'floor-rounded-lv1').setOrigin(0, 0).setDepth(3));
    }

    const highlightW = w + 200;
    this.floorHighlightTop = this.scene.add.rectangle(0, floorTopY + FLOOR_TILE_H / 2, highlightW, FLOOR_TILE_H + 8, 0xffffff, 0)
      .setOrigin(0, 0.5).setDepth(2).setBlendMode(Phaser.BlendModes.ADD);
    this.floorHighlightBottom = this.scene.add.rectangle(0, floorBottomY + FLOOR_TILE_H / 2, highlightW, FLOOR_TILE_H + 8, 0xffffff, 0)
      .setOrigin(0, 0.5).setDepth(2).setBlendMode(Phaser.BlendModes.ADD);
  }

  resetRanges(startX: number): void {
    this.steppedTopRanges = [];
    const startSnap = Math.floor(startX / FLOOR_TILE_STEP) * FLOOR_TILE_STEP;
    this.steppedBottomRanges = [{ from: startSnap, to: startX, lastFallX: startSnap - FLOOR_TILE_STEP }];
    this.lastTrackedFloor = 'bottom';
  }

  update(
    floorTopY: number,
    floorBottomY: number,
    trackX: number,
    trackFloor: 'top' | 'bottom',
    shouldTrack: boolean,
    currentFloor: 'top' | 'bottom',
  ): void {
    const camX = this.scene.cameras.main.scrollX;
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
        const snap = Math.floor(trackX / FLOOR_TILE_STEP) * FLOOR_TILE_STEP;
        ranges.push({ from: snap, to: trackX, lastFallX: snap - FLOOR_TILE_STEP });
        this.lastTrackedFloor = trackFloor;
      }
      if (ranges.length > 0) {
        ranges[ranges.length - 1].to = Math.max(ranges[ranges.length - 1].to, trackX);
      }
    }

    const firstTileX = Math.floor((camX - 100) / FLOOR_TILE_STEP) * FLOOR_TILE_STEP;
    for (let i = 0; i < this.floorTopSprites.length; i++) {
      const tx = firstTileX + i * FLOOR_TILE_STEP;
      this.floorTopSprites[i].x = tx;
      this.floorBottomSprites[i].x = tx;
      const texKey = `floor-rounded-lv${getLevelForDistance((tx - COCKROACH_START_X) / 50).level}`;

      const topStepped = this.isTileStepped(tx, this.steppedTopRanges);
      this.floorTopSprites[i].setVisible(!topStepped);
      if (!topStepped && this.floorTopSprites[i].texture.key !== texKey) this.floorTopSprites[i].setTexture(texKey);

      const bottomStepped = this.isTileStepped(tx, this.steppedBottomRanges);
      this.floorBottomSprites[i].setVisible(!bottomStepped);
      if (!bottomStepped && this.floorBottomSprites[i].texture.key !== texKey) this.floorBottomSprites[i].setTexture(texKey);
    }

    for (const r of this.steppedTopRanges) this.spawnFallingTilesForRange(r, floorTopY);
    for (const r of this.steppedBottomRanges) this.spawnFallingTilesForRange(r, floorBottomY);

    this.floorHighlightTop.x = bodyX;
    this.floorHighlightBottom.x = bodyX;
    const pulse = 0.08 + Math.sin(this.scene.time.now * 0.004) * 0.04;
    this.floorHighlightTop.setAlpha(currentFloor === 'top' ? pulse : 0);
    this.floorHighlightBottom.setAlpha(currentFloor === 'bottom' ? pulse : 0);
  }

  private isTileStepped(tx: number, ranges: { from: number; to: number }[]): boolean {
    const tileEnd = tx + FLOOR_TILE_W;
    for (const r of ranges) { if (tileEnd > r.from && tileEnd < r.to) return true; }
    return false;
  }

  private spawnFallingTilesForRange(range: { from: number; to: number; lastFallX: number }, floorY: number): void {
    let startX = Math.floor((range.lastFallX + 1) / FLOOR_TILE_STEP) * FLOOR_TILE_STEP;
    if (startX <= range.lastFallX) startX += FLOOR_TILE_STEP;
    let n = 0;
    while (startX + FLOOR_TILE_W < range.to && n < 3) {
      const texKey = `floor-rounded-lv${getLevelForDistance((startX - COCKROACH_START_X) / 50).level}`;
      const tile = this.scene.add.image(startX, floorY, texKey).setOrigin(0, 0).setDepth(3);
      const dir = Math.random() > 0.5 ? 1 : -1;
      this.scene.tweens.add({
        targets: tile, y: floorY + 200 + Math.random() * 100,
        angle: dir * (30 + Math.random() * 60), alpha: 0,
        duration: 600 + Math.random() * 400, ease: 'Quad.easeIn',
        onComplete: () => tile.destroy(),
      });
      range.lastFallX = startX;
      startX += FLOOR_TILE_STEP;
      n++;
    }
  }

  private generateRoundedFloorTextures(): void {
    for (let i = 1; i <= 10; i++) {
      const key = `floor-rounded-lv${i}`;
      const src = this.scene.textures.get(`lv${i}-floor`).getSourceImage() as HTMLImageElement;
      if (this.scene.textures.exists(key)) {
        const tex = this.scene.textures.get(key);
        const canvas = tex.getSourceImage() as HTMLCanvasElement;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, FLOOR_TILE_W, FLOOR_TILE_H);
        ctx.save(); ctx.beginPath();
        ctx.roundRect(0, 0, FLOOR_TILE_W, FLOOR_TILE_H, FLOOR_TILE_RADIUS);
        ctx.clip(); ctx.drawImage(src, 0, 0, FLOOR_TILE_W, FLOOR_TILE_H);
        ctx.restore();
        (tex.source[0] as Phaser.Textures.TextureSource).update();
      } else {
        const canvas = document.createElement('canvas');
        canvas.width = FLOOR_TILE_W; canvas.height = FLOOR_TILE_H;
        const ctx = canvas.getContext('2d')!;
        ctx.beginPath();
        ctx.roundRect(0, 0, FLOOR_TILE_W, FLOOR_TILE_H, FLOOR_TILE_RADIUS);
        ctx.clip(); ctx.drawImage(src, 0, 0, FLOOR_TILE_W, FLOOR_TILE_H);
        this.scene.textures.addCanvas(key, canvas);
      }
    }
  }
}
