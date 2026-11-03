import Phaser from 'phaser';
import { GAME_HEIGHT, PIXEL_BLOCK } from '../config/constants';

// The menus stand in the game's own world: a level's painted plates drifting past, dimmed so the UI reads
const LAYERS = [
  { suffix: 'sky', rate: 0.1 },
  { suffix: 'bg', rate: 0.4 },
  { suffix: 'fg', rate: 1.2 },
] as const;

const SCRIM = 0x07050a;
const SCRIM_BANDS = 8;

export interface SceneBackgroundOptions {
  /** Which level's plates to show. Falls back to level 1 while the others are still loading. */
  level?: number;
  /** How dark the scrim over the plates is in the middle (0–1). The edges go darker. Default 0.45. */
  dim?: number;
  /** Logical px per frame the world drifts by. Default 0.4. */
  scrollSpeed?: number;
}

export interface SceneBackgroundResult {
  /** Override the drift at runtime (e.g. for page-transition effects). */
  setScrollSpeed: (speed: number) => void;
}

export function createSceneBackground(scene: Phaser.Scene, opts: SceneBackgroundOptions = {}): SceneBackgroundResult {
  const { width, height } = scene.cameras.main;
  const { dim = 0.45, scrollSpeed = 0.4 } = opts;
  const level = scene.textures.exists(`lv${opts.level}-sky`) ? opts.level : 1;

  const plates = LAYERS.map(({ suffix, rate }, i) => {
    const key = `lv${level}-${suffix}`;
    const scale = GAME_HEIGHT / scene.textures.getFrame(key).height;
    const plate = scene.add.tileSprite(0, 0, width, height, key).setOrigin(0, 0).setTileScale(scale, scale).setDepth(-30 + i);
    return { plate, rate };
  });

  // Darker at the top and bottom edges, so titles and footers sit on calm ground
  const scrim = scene.add.graphics().setDepth(-20);
  const bandH = Math.ceil(height / SCRIM_BANDS / PIXEL_BLOCK) * PIXEL_BLOCK;
  for (let i = 0; i < SCRIM_BANDS; i++) {
    const edge = Math.abs(i - (SCRIM_BANDS - 1) / 2) / ((SCRIM_BANDS - 1) / 2);
    scrim.fillStyle(SCRIM, Math.min(0.92, dim + edge * edge * 0.35)).fillRect(0, i * bandH, width, bandH);
  }

  let speed = scrollSpeed;
  let travelled = 0;
  const drift = (): void => {
    travelled += speed;
    for (const { plate, rate } of plates) {
      plate.tilePositionX = Math.round(travelled * rate / PIXEL_BLOCK) * PIXEL_BLOCK / plate.tileScaleX;
    }
  };
  scene.events.on('update', drift);
  scene.events.once('shutdown', () => scene.events.off('update', drift));

  const resize = (size: Phaser.Structs.Size): void => {
    for (const { plate } of plates) plate.setSize(size.width, size.height);
    scrim.setScale(size.width / width, size.height / height);
  };
  scene.scale.on(Phaser.Scale.Events.RESIZE, resize);
  scene.events.once('shutdown', () => scene.scale.off(Phaser.Scale.Events.RESIZE, resize));

  return { setScrollSpeed: (value) => { speed = value; } };
}
