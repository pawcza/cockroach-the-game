import Phaser from 'phaser';
import { ATLAS, SPRITE_SCALE, frameOf } from '../config/sprites';

export interface UIButton {
  bg: Phaser.GameObjects.Graphics;
  txt: Phaser.GameObjects.Text;
  hitZone: Phaser.GameObjects.Rectangle;
  all: Phaser.GameObjects.GameObject[];
  /** Centre, in the coordinates of whatever holds the button. */
  x: number;
  y: number;
  setColor: (c: number) => void;
  setLabel: (label: string) => void;
  setEnabled: (enabled: boolean) => void;
  readonly enabled: boolean;
  setFocused: (focused: boolean) => void;
  activate: () => void;
  /** Set on rows like sliders: the arrows left and right turn it instead of moving focus. */
  adjust?: (direction: number) => void;
}

// One look for every button: a dark slab painted like the ledges, its colour only in a side bar and the focus rim
const SLAB = 0x15100d;
const SLAB_FOCUS = 0x2a1f18;
const RIM = 0x3d2e25;
const TEXT_IDLE = '#cdbfa9';
const TEXT_FOCUS = '#fff1c2';
const TEXT_DISABLED = '#5f554b';
const BAR_W = 4;

/** The button colour lifted to a readable accent; greys become warm bone, so neutral buttons still read as buttons. */
function accentOf(color: number): number {
  const c = Phaser.Display.Color.IntegerToColor(color);
  if (c.s < 0.15) return 0xb9a78d;
  const lifted = Phaser.Display.Color.HSVToRGB(c.h, Math.min(1, c.s * 0.9), 0.92) as Phaser.Display.Color;
  return lifted.color;
}

/**
 * A menu button on the pixel grid: square corners, a hard drop shadow, the colour as a side bar. Focus (keyboard or
 * hover) lights the rim and the label; see MenuNav for moving it with the arrows.
 */
export function createButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  color: number,
  style: Phaser.Types.GameObjects.Text.TextStyle,
  action: () => void,
): UIButton {
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w / 2) * 2;
  h = Math.round(h / 2) * 2;
  let accent = accentOf(color);
  let focused = false;
  let hovered = false;
  let pressed = false;
  let enabled = true;

  const bg = scene.add.graphics();
  const txt = scene.add.text(x, y, label, { ...style, color: TEXT_IDLE, stroke: '#000000' }).setOrigin(0.5);

  const draw = (): void => {
    const lit = enabled && (focused || hovered);
    const dy = pressed ? 2 : 0;
    const left = x - w / 2;
    const top = y - h / 2 + dy;
    bg.clear();
    if (!pressed) bg.fillStyle(0x000000, 0.55).fillRect(left + 2, top + 4, w, h);
    frame(bg, left, top, w, h, lit ? accent : RIM);
    bg.fillStyle(lit ? SLAB_FOCUS : SLAB, enabled ? 0.96 : 0.8).fillRect(left, top, w, h);
    bg.fillStyle(0xffffff, lit ? 0.1 : 0.05).fillRect(left, top, w, 2);
    bg.fillStyle(0x000000, 0.35).fillRect(left, top + h - 2, w, 2);
    bg.fillStyle(accent, enabled ? (lit ? 1 : 0.7) : 0.25).fillRect(left, top, BAR_W, h);
    txt.setY(y + dy);
    txt.setColor(!enabled ? TEXT_DISABLED : lit ? TEXT_FOCUS : TEXT_IDLE);
  };

  const hitZone = scene.add.rectangle(x, y, w + 4, h + 4, 0x000000, 0).setInteractive({ useHandCursor: true });
  hitZone.on('pointerover', () => { hovered = true; draw(); });
  hitZone.on('pointerout', () => { hovered = false; pressed = false; draw(); });
  hitZone.on('pointerdown', () => { if (enabled) { pressed = true; draw(); } });
  hitZone.on('pointerup', () => {
    if (!pressed) return;
    pressed = false;
    draw();
    action();
  });

  draw();

  return {
    bg, txt, hitZone, all: [bg, hitZone, txt], x, y,
    setColor: (c) => { accent = accentOf(c); draw(); },
    setLabel: (text) => { txt.setText(text); },
    setEnabled: (value) => { enabled = value; hitZone.input!.cursor = value ? 'pointer' : 'default'; draw(); },
    get enabled() { return enabled; },
    setFocused: (value) => { focused = value; draw(); },
    // Straight away: the scene clock may be paused (the pause menu)
    activate: () => { if (enabled) action(); },
  };
}

/** A dark slab for lists and stat blocks, the same make as the buttons. x, y is the top-left corner. */
export function createPanel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, alpha = 0.82): Phaser.GameObjects.Graphics {
  x = Math.round(x);
  y = Math.round(y);
  const g = scene.add.graphics();
  frame(g, x, y, w, h, RIM);
  return g.fillStyle(SLAB, alpha).fillRect(x, y, w, h).fillStyle(0xffffff, 0.04).fillRect(x, y, w, 2);
}

/** A 2px rim just outside the rectangle, drawn as four strips so a see-through fill doesn't show it through. */
function frame(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number): void {
  g.fillStyle(color, 1)
    .fillRect(x - 2, y - 2, w + 4, 2).fillRect(x - 2, y + h, w + 4, 2)
    .fillRect(x - 2, y, 2, h).fillRect(x + w, y, 2, h);
}

const OBSTACLE_ART =new Set(['bird', 'cat', 'flipper', 'newspaper', 'onion', 'spray', 'disco', 'jellyfish', 'pope', 'bison', 'blackhole']);

/** An obstacle's still picture, for game-over screens and replays. Null for a death with no culprit, such as a fall. */
export function addObstacleArt(
  scene: Phaser.Scene,
  x: number,
  y: number,
  type: string,
): Phaser.GameObjects.Image | null {
  if (type === 'boss') return scene.add.image(x, y, 'boss-face2').setScale(0.25);
  if (!OBSTACLE_ART.has(type)) return null;
  return scene.add.image(x, y, ATLAS, frameOf(type)).setScale(SPRITE_SCALE);
}

/** Polish death cause labels. */
export const OBSTACLE_LABEL: Record<string, string> = {
  onion: 'Cebula',
  spray: 'Spray',
  flipper: 'Klapek',
  newspaper: 'Gazeta',
  bird: 'Ptak',
  cat: 'Łapa kota',
  disco: 'Dyskoteka',
  jellyfish: 'Meduza',
  pope: 'Papież',
  bison: 'Żubr',
  blackhole: 'Czarna dziura',
  boss: 'Bestia spod Zlewu',
  fall: 'Spadł',
};
