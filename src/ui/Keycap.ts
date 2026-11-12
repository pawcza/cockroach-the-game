/**
 * The keycap the game teaches with: a cream plate with the key (or the button's name) on it, the same look as the keys
 * on the info page. The ability lessons and the opening tutorial both draw their prompts with it.
 */
import Phaser from 'phaser';
import { DEPTH, PIXEL_BLOCK } from '../config/constants';
import { bodyStyle } from '../utils/TextStyles';

/** A keycap, centred on its own position, not placed or shown yet. */
export function addKeycap(scene: Phaser.Scene, label: string, fontSize = '20px'): Phaser.GameObjects.Text {
  return scene.add.text(0, 0, label, bodyStyle({
    fontSize, color: '#15100d', strokeThickness: 0, backgroundColor: '#f1e3c6', padding: { x: 10, y: 6 },
  })).setOrigin(0.5).setDepth(DEPTH.POPUP);
}

/** How far a prompt sways on this frame, so the eye finds it. */
export function keycapBob(now: number): number {
  return Math.sin(now / 120) * 4;
}

export type Arrow = 'up' | 'down' | 'left' | 'right';

/** A keycap with an arrow on it: drawn here, not typed, because the pixel font's arrows read as a cross. */
export type ArrowKeycap = Phaser.GameObjects.Image;

/** The plate is this many native pixels square. */
const PLATE = 26;
const PLATE_COLOR = '#f1e3c6';
const PLATE_EDGE = '#b9a78d';
const INK = '#15100d';

/** The arrow pointing up, as rows of [first column, width]: a solid head 14 wide over a stem 4 wide. */
const UP_HEAD: [number, number][] = [[12, 2], [11, 4], [10, 6], [9, 8], [8, 10], [7, 12], [6, 14]];
const UP_STEM = { x: 11, width: 4, from: 12, to: 21 };

/** Whether native pixel (x, y) of the plate is ink, for an arrow pointing up. */
function upInk(x: number, y: number): boolean {
  const headRow = UP_HEAD[y - 5];
  if (headRow) return x >= headRow[0] && x < headRow[0] + headRow[1];
  return y >= UP_STEM.from && y <= UP_STEM.to && x >= UP_STEM.x && x < UP_STEM.x + UP_STEM.width;
}

/** The arrow's ink at (x, y) for a direction: the up arrow turned about the plate's middle. */
function inkAt(arrow: Arrow, x: number, y: number): boolean {
  const last = PLATE - 1;
  switch (arrow) {
    case 'up': return upInk(x, y);
    case 'down': return upInk(x, last - y);
    case 'left': return upInk(y, x);
    case 'right': return upInk(y, last - x);
  }
}

function arrowTexture(scene: Phaser.Scene, arrow: Arrow): string {
  const key = `keycap-${arrow}`;
  if (scene.textures.exists(key)) return key;
  const canvas = scene.textures.createCanvas(key, PLATE, PLATE)!;
  const ctx = canvas.getContext();
  ctx.fillStyle = PLATE_EDGE;
  ctx.fillRect(0, 0, PLATE, PLATE);
  ctx.fillStyle = PLATE_COLOR;
  ctx.fillRect(0, 0, PLATE - 1, PLATE - 2);
  ctx.fillStyle = INK;
  for (let y = 0; y < PLATE; y++) for (let x = 0; x < PLATE; x++) if (inkAt(arrow, x, y)) ctx.fillRect(x, y, 1, 1);
  canvas.refresh();
  canvas.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

/** An arrow keycap on the same pixel grid as the art, centred on its own position, not placed or shown yet. */
export function addArrowKeycap(scene: Phaser.Scene, arrow: Arrow): ArrowKeycap {
  return scene.add.image(0, 0, arrowTexture(scene, arrow)).setScale(PIXEL_BLOCK).setDepth(DEPTH.POPUP);
}

/** Turns an arrow keycap to point another way. */
export function setArrow(keycap: ArrowKeycap, arrow: Arrow): void {
  keycap.setTexture(arrowTexture(keycap.scene, arrow));
}

/** A pulse, as a multiple of the keycap's resting size. */
export function pulseArrow(keycap: ArrowKeycap, factor: number): void {
  keycap.setScale(PIXEL_BLOCK * factor);
}
