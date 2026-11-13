/** The three parallax layers, their level crossfade, and the sky's darkening with speed. */
import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT, PIXEL_BLOCK } from '../config/constants';
import { LevelConfig, LEVELS } from '../config/levels';

const FADE_DURATION = 3000;

const OLD_SKY_ALPHA = 0.8;
const OLD_MID_ALPHA = 0.15;

const SKY_SCROLL = 0.1;
const MID_SCROLL = 0.4;
const OLD_FG_SCROLL = 0.7;
const NEAR_SCROLL = 1.2;

interface Layers {
  sky: Phaser.GameObjects.TileSprite;
  mid: Phaser.GameObjects.TileSprite;
  fg: Phaser.GameObjects.TileSprite;
}

export class ParallaxBackground {
  private scene: Phaser.Scene;

  // A second set of layers sits behind the first so levels can crossfade.
  private current: Layers;
  private next: Layers;
  private config: LevelConfig = LEVELS[0];
  private nextConfig: LevelConfig = LEVELS[0];
  private transitioning = false;
  /** How far the world has been moved back under the camera (rebase), so the plates do not jump when it is. */
  private rebased = 0;

  constructor(scene: Phaser.Scene, w: number, h: number) {
    this.scene = scene;
    this.current = this.createLayers(w, h);
    this.next = this.createLayers(w, h);
    this.show(this.current, LEVELS[0]);
    this.hide(this.next);
  }

  private createLayers(w: number, h: number): Layers {
    const layer = (key: string, depth: number) =>
      this.scene.add.tileSprite(0, 0, w, h, key).setOrigin(0, 0).setScrollFactor(0).setDepth(depth);
    return { sky: layer('lv1-sky', DEPTH.SKY_BG), mid: layer('lv1-bg', DEPTH.MID_BG), fg: layer('lv1-fg', DEPTH.FG_BG) };
  }

  /** Dresses the layers for a level: painted plates are native pixels, older ones are logical. */
  private dress(layers: Layers, config: LevelConfig): void {
    const plates: [Phaser.GameObjects.TileSprite, string][] = [
      [layers.sky, config.skyKey], [layers.mid, config.bgKey], [layers.fg, config.fgKey],
    ];
    for (const [layer, key] of plates) {
      const scale = GAME_HEIGHT / this.scene.textures.getFrame(key).height;
      layer.setTexture(key).setTileScale(scale, scale);
    }
    layers.mid.setBlendMode(config.painted ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.SOFT_LIGHT);
    layers.fg.setDepth(config.painted ? DEPTH.NEAR_LAYER : DEPTH.FG_BG);
  }

  private show(layers: Layers, config: LevelConfig): void {
    this.dress(layers, config);
    layers.sky.setAlpha(config.painted ? 1 : OLD_SKY_ALPHA);
    layers.mid.setAlpha(config.painted ? 1 : OLD_MID_ALPHA);
    layers.fg.setAlpha(1);
  }

  private hide(layers: Layers): void {
    layers.sky.setAlpha(0);
    layers.mid.setAlpha(0);
    layers.fg.setAlpha(0);
  }

  resize(w: number, h: number): void {
    for (const layers of [this.current, this.next]) {
      layers.sky.setSize(w, h);
      layers.mid.setSize(w, h);
      layers.fg.setSize(w, h);
    }
  }

  crossfadeTo(config: LevelConfig): void {
    this.dress(this.next, config);
    this.nextConfig = config;
    this.transitioning = true;

    const fade = { duration: FADE_DURATION, ease: 'Sine.easeInOut' };
    const tweens = this.scene.tweens;
    tweens.add({ targets: this.next.sky, alpha: config.painted ? 1 : OLD_SKY_ALPHA, ...fade });
    tweens.add({ targets: this.next.mid, alpha: config.painted ? 1 : OLD_MID_ALPHA, ...fade });
    tweens.add({ targets: this.next.fg, alpha: 1, ...fade });

    tweens.add({ targets: this.current.sky, alpha: 0, ...fade });
    tweens.add({ targets: this.current.mid, alpha: 0, ...fade });
    tweens.add({
      targets: this.current.fg, alpha: 0, ...fade,
      onComplete: () => {
        this.show(this.current, config);
        this.config = config;
        this.hide(this.next);
        this.transitioning = false;
      },
    });
  }

  private scroll(layers: Layers, config: LevelConfig, scrollX: number): void {
    const snapped = (layer: Phaser.GameObjects.TileSprite, rate: number): number =>
      Math.round(scrollX * rate / PIXEL_BLOCK) * PIXEL_BLOCK / layer.tileScaleX;
    layers.sky.tilePositionX = snapped(layers.sky, SKY_SCROLL);
    layers.mid.tilePositionX = snapped(layers.mid, MID_SCROLL);
    layers.fg.tilePositionX = snapped(layers.fg, config.painted ? NEAR_SCROLL : OLD_FG_SCROLL);
  }

  /** The world moved back by `dx` under the camera: the plates stay where they were on screen. */
  rebase(dx: number): void {
    this.rebased += dx;
  }

  update(): void {
    const camera = this.scene.cameras.main;
    const scrollX = camera.scrollX + this.rebased;
    this.scroll(this.current, this.config, scrollX);
    if (this.transitioning) this.scroll(this.next, this.nextConfig, scrollX);

    camera.scrollY = 0;
  }
}
