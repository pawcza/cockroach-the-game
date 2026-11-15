/**
 * A little window into the game for the wardrobe: a level's painted plates and its ledge, scrolling past at the
 * game's own scale as if the roach in front were running, clipped to a rectangle of the page. Cosmetic only. It uses
 * whatever levels are in already (level 1 always), never waits for one, and rests while the page is off screen.
 */
import Phaser from 'phaser';
import { PIXEL_BLOCK, FLOOR_BOTTOM_Y, FLOOR_TILE_STEP, GAME_HEIGHT } from '../../config/constants';
import { LEDGE_LIFT, LEDGE_SEGMENTS, cutLedgeSegments } from '../../systems/FloorManager';
import type { Rect } from '../../ui/kit';

/** Plates and ledge slide at this many logical px a second at most; the far ones slower, as in the world. */
const RUN_SPEED = 200;
const LAYERS = [
  { suffix: 'sky', rate: 0.05 },
  { suffix: 'bg', rate: 0.25 },
  { suffix: 'fg', rate: 0.6 },
] as const;
/** The ledge strip's top, and where the roach's feet stand on it, in the world (the lower lane's collider line). */
const STRIP_TOP_WORLD_Y = FLOOR_BOTTOM_Y - LEDGE_LIFT;
const FEET_WORLD_Y = FLOOR_BOTTOM_Y + 8;
/** The strip is 27 native rows tall. */
const STRIP_H = 27 * PIXEL_BLOCK;
const LEVELS = 10;

export interface RunWindow {
  /**
   * Shows a random level from 1 to `reached` (never above: no spoilers). One whose art isn't in yet is asked for with
   * `load` and shown when it arrives; until then the level on show stays (level 1 at first).
   */
  pick: (reached: number) => void;
  /** The level on show now (0 before any). */
  readonly level: number;
  /** Where the roach's feet go, on the stage's ledge. */
  readonly feetY: number;
}

/** `rect` is the window, in the page's coordinates; its bottom edge is the ledge's lower edge. */
export function createRunWindow(
  scene: Phaser.Scene,
  page: Phaser.GameObjects.Container,
  rect: Rect,
  /** Brings a level's art in; resolves once it has arrived (or failed). */
  load: (level: number) => Promise<unknown>,
): RunWindow {
  const layer = scene.add.container(0, 0);
  page.add(layer);
  const maskShape = scene.make.graphics({});
  maskShape.fillStyle(0xffffff).fillRect(rect.x, rect.y, rect.w, rect.h);
  layer.setMask(new Phaser.Display.Masks.GeometryMask(scene, maskShape));

  const stripY = rect.y + rect.h - STRIP_H;
  const feetY = stripY + (FEET_WORLD_Y - STRIP_TOP_WORLD_Y);
  const plateTop = feetY - FEET_WORLD_Y;
  const plates = LAYERS.map(({ rate }) => ({
    rate,
    sprite: scene.add.tileSprite(rect.x, rect.y, rect.w, rect.h, '__DEFAULT').setOrigin(0, 0).setVisible(false),
  }));
  const tiles = Array.from({ length: Math.ceil(rect.w / FLOOR_TILE_STEP) + 2 }, () => scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setScale(PIXEL_BLOCK).setVisible(false));
  layer.add([...plates.map(p => p.sprite), ...tiles]);

  let level = 0;
  let travelled = 0;
  const ready = (n: number): boolean => ['sky', 'bg', 'fg', 'floor'].every(part => scene.textures.exists(`lv${n}-${part}`));
  const show = (n: number): void => {
    level = n;
    layer.setData('level', n);
    cutLedgeSegments(scene.textures, `lv${n}-floor`);
    plates.forEach(({ sprite }, i) => {
      const key = `lv${n}-${LAYERS[i].suffix}`;
      const scale = GAME_HEIGHT / scene.textures.getFrame(key).height;
      sprite.setTexture(key).setTileScale(scale, scale).setVisible(true);
      sprite.tilePositionY = (rect.y - plateTop) / scale;
    });
    tiles.forEach(tile => tile.setTexture(`lv${n}-floor`, 'segment-0').setVisible(true));
  };

  const origin = (): { x: number; y: number } => {
    const m = page.getWorldTransformMatrix();
    return { x: m.tx, y: m.ty };
  };
  // The mask follows the page as it slides; the world only runs while the page is in view
  const tick = (_time: number, delta: number): void => {
    const at = origin();
    maskShape.setPosition(at.x, at.y);
    if (!level || !page.visible || Math.abs(at.x) >= scene.scale.width || Math.abs(at.y) >= scene.scale.height) return;
    travelled += (RUN_SPEED * delta) / 1000;
    plates.forEach(({ sprite, rate }) => {
      sprite.tilePositionX = (Math.round((travelled * rate) / PIXEL_BLOCK) * PIXEL_BLOCK) / sprite.tileScaleX;
    });
    const first = Math.floor(travelled / FLOOR_TILE_STEP);
    tiles.forEach((tile, i) => {
      const index = first + i;
      tile.setPosition(rect.x + Math.round((index * FLOOR_TILE_STEP - travelled) / PIXEL_BLOCK) * PIXEL_BLOCK, stripY);
      tile.setFrame(`segment-${index % LEDGE_SEGMENTS}`);
    });
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, tick);
  let closed = false;
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    closed = true;
    scene.events.off(Phaser.Scenes.Events.UPDATE, tick);
    maskShape.destroy();
  });

  let wanted = 0;
  return {
    feetY,
    get level() { return level; },
    pick: (reached) => {
      const n = Phaser.Math.Between(1, Phaser.Math.Clamp(Math.floor(reached), 1, LEVELS));
      wanted = n;
      if (ready(n)) { show(n); return; }
      if (!level && ready(1)) show(1);
      void load(n).then(() => { if (!closed && wanted === n && ready(n)) show(n); });
    },
  };
}
