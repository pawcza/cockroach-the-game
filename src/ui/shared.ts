import Phaser from 'phaser';
import { ATLAS, SPRITE_SCALE, frameOf } from '../config/sprites';
import { keepCrisp } from '../pixel/PixelCameras';
import { capCentreShift, FONT_GRID, smallStyle } from '../utils/TextStyles';
import { DEPTH } from '../config/constants';
import type { Achievement } from '../systems/Profile';
import { account } from './Account';

export interface UIButton {
  bg: Phaser.GameObjects.Graphics;
  txt: Phaser.GameObjects.Text;
  hitZone: Phaser.GameObjects.Rectangle;
  all: Phaser.GameObjects.GameObject[];
  /** Centre, in the coordinates of whatever holds the button. */
  x: number;
  y: number;
  /** Size of its face, for keyboard navigation between buttons of different sizes. */
  w: number;
  h: number;
  setColor: (c: number) => void;
  setLabel: (label: string) => void;
  setEnabled: (enabled: boolean) => void;
  readonly enabled: boolean;
  setFocused: (focused: boolean) => void;
  activate: () => void;
  /** Set on rows like sliders: the arrows left and right turn it instead of moving focus. */
  adjust?: (direction: number) => void;
  /** On a button made with a second line: changes that line. */
  setSub?: (text: string) => void;
}

// One look for every button: a dark slab painted like the ledges, its colour only in a side bar and the focus rim
const SLAB = 0x15100d;
const SLAB_FOCUS = 0x2a1f18;
const RIM = 0x3d2e25;
const TEXT_IDLE = '#cdbfa9';
const TEXT_FOCUS = '#fff1c2';
const TEXT_DISABLED = '#5f554b';
const BAR_W = 4;
/** With a second line, the label moves up this much and the line sits this far below the middle. */
const SUB_LIFT = 9;
const SUB_DROP = 11;
const SUB_IDLE = '#a89a80';
const SUB_FOCUS = '#e8c15a';

// Sign in with Google keeps Google's dark-theme colours (branding guidelines): the fill must stay the one the G's
// tile was drawn on, so focus shows only in the rim and the label
export const GOOGLE_G = 'google-g';
const GOOGLE_FILL = 0x131314;
const GOOGLE_RIM = 0x8e918f;
const GOOGLE_RIM_FOCUS = 0xe3e3e3;
const GOOGLE_TEXT = '#e3e3e3';
const GOOGLE_TEXT_FOCUS = '#ffffff';
const GOOGLE_G_SIZE = 22;
const GOOGLE_PAD = 4;

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
  opts: { google?: boolean; sub?: string; onFocus?: () => void } = {},
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

  const google = opts.google === true;
  const bg = scene.add.graphics();
  // Google's own 1x G, drawn unscaled on the crisp camera, never through the pixel grid
  const gLeft = x - w / 2 + GOOGLE_PAD;
  const g = google ? keepCrisp(scene.add.image(gLeft + GOOGLE_G_SIZE / 2, y, GOOGLE_G)) : null;
  const txtX = google ? Math.round((gLeft + GOOGLE_G_SIZE + x + w / 2) / 2) : x;
  const txt = scene.add.text(txtX, y, label, { ...style, color: google ? GOOGLE_TEXT : TEXT_IDLE, stroke: '#000000' }).setOrigin(0.5);
  const labelSize = txt.style.fontSize;
  // A label that doesn't fit steps down the font's grid instead of spilling over the frame
  const room = google ? x + w / 2 - (gLeft + GOOGLE_G_SIZE) - 8 : w - BAR_W - 12;
  // Centred on its letters, not on the font's line box, which sits them low
  let shift = 0;
  const fit = (): void => {
    let size = parseFloat(String(txt.style.fontSize));
    while (txt.width > room && size > FONT_GRID) {
      size -= FONT_GRID;
      txt.setFontSize(size);
    }
    shift = capCentreShift(txt) - (sub ? SUB_LIFT : 0);
    txt.setY(y + shift);
  };

  // An optional second line under the label, smaller: what this button is up to, like today's standing
  const sub = opts.sub === undefined ? null : scene.add.text(txtX, y, opts.sub, smallStyle({ fontSize: '7px', strokeThickness: 2 })).setOrigin(0.5);
  const subSize = sub?.style.fontSize;
  let subShift = 0;
  const fitSub = (): void => {
    if (!sub) return;
    sub.setFontSize(subSize!);
    if (sub.width > room) sub.setFontSize(parseFloat(String(subSize)) - FONT_GRID);
    subShift = capCentreShift(sub) + SUB_DROP;
  };
  fitSub();
  fit();

  const draw = (): void => {
    // A button its own action destroyed still gets unfocused by the MenuNav; a destroyed text can't redraw
    if (!txt.active) return;
    const lit = enabled && (focused || hovered);
    const dy = pressed ? 2 : 0;
    const left = x - w / 2;
    const top = y - h / 2 + dy;
    bg.clear();
    if (!pressed) bg.fillStyle(0x000000, 0.55).fillRect(left + 2, top + 4, w, h);
    if (google) {
      frame(bg, left, top, w, h, lit ? GOOGLE_RIM_FOCUS : GOOGLE_RIM);
      bg.fillStyle(GOOGLE_FILL, 1).fillRect(left, top, w, h);
      g!.setY(y + dy).setAlpha(enabled ? 1 : 0.4);
      txt.setY(y + dy + shift);
      txt.setColor(!enabled ? TEXT_DISABLED : lit ? GOOGLE_TEXT_FOCUS : GOOGLE_TEXT);
      return;
    }
    frame(bg, left, top, w, h, lit ? accent : RIM);
    bg.fillStyle(lit ? SLAB_FOCUS : SLAB, enabled ? 0.96 : 0.8).fillRect(left, top, w, h);
    bg.fillStyle(0xffffff, lit ? 0.1 : 0.05).fillRect(left, top, w, 2);
    bg.fillStyle(0x000000, 0.35).fillRect(left, top + h - 2, w, 2);
    bg.fillStyle(accent, enabled ? (lit ? 1 : 0.7) : 0.25).fillRect(left, top, BAR_W, h);
    txt.setY(y + dy + shift);
    txt.setColor(!enabled ? TEXT_DISABLED : lit ? TEXT_FOCUS : TEXT_IDLE);
    sub?.setY(y + dy + subShift).setColor(!enabled ? TEXT_DISABLED : lit ? SUB_FOCUS : SUB_IDLE);
  };

  // Fingers get the whole gap around a button (menus space them 8 apart), a mouse a little margin
  const reach = scene.sys.game.device.os.desktop ? 4 : 8;
  const hitZone = scene.add.rectangle(x, y, w + reach, h + reach, 0x000000, 0).setInteractive({ useHandCursor: true });
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
    bg, txt, hitZone, all: [bg, hitZone, ...(g ? [g] : []), txt, ...(sub ? [sub] : [])], x, y, w, h,
    setSub: sub ? (text) => { sub.setText(text); fitSub(); draw(); } : undefined,
    setColor: (c) => { accent = accentOf(c); draw(); },
    setLabel: (text) => { txt.setFontSize(labelSize); txt.setText(text); fit(); },
    setEnabled: (value) => { enabled = value; hitZone.input!.cursor = value ? 'pointer' : 'default'; draw(); },
    get enabled() { return enabled; },
    setFocused: (value) => { focused = value; draw(); if (value) opts.onFocus?.(); },
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
  wall: 'Ściana',
};

const TOAST_W = 300;
const TOAST_H = 44;
/** Right side, below the band where level announcements and milestones show, so on a narrow screen they don't meet. */
const TOAST_TOP = 120;
const TOAST_MARGIN = 16;
const TOAST_HOLD_MS = 2600;

/**
 * An achievement just earned: a gold slab in the top right corner that fades in, holds and goes. Several at once stack
 * downwards instead of covering each other.
 */
export function showAchievement(scene: Phaser.Scene, achievement: Achievement): void {
  showToast(scene, account() ? `${achievement.name}! +${achievement.reward} okruszków` : `Osiągnięcie: ${achievement.name}`, achievement.description);
}

/** A finished mission, with what it paid. */
export function showMission(scene: Phaser.Scene, mission: { text: string; reward: number }): void {
  showToast(scene, `Misja wykonana! +${mission.reward} okruszków`, mission.text);
}

/** At most this many toasts at once; the rest wait their turn, so a big run doesn't bury the screen. */
const TOASTS_AT_ONCE = 3;

interface ToastQueue { taken: boolean[]; waiting: [string, string][] }

function showToast(scene: Phaser.Scene, heading: string, line: string): void {
  const queue: ToastQueue = (scene.data.get('toasts') as ToastQueue | undefined)
    ?? { taken: new Array<boolean>(TOASTS_AT_ONCE).fill(false), waiting: [] };
  scene.data.set('toasts', queue);
  const slot = queue.taken.indexOf(false);
  if (slot < 0) {
    queue.waiting.push([heading, line]);
    return;
  }
  queue.taken[slot] = true;
  const camera = scene.cameras.main;
  const x = Math.round(camera.width - TOAST_W - TOAST_MARGIN);
  const y = TOAST_TOP + slot * (TOAST_H + 6);

  const panel = scene.add.graphics();
  frame(panel, x, y, TOAST_W, TOAST_H, 0xe8c15a);
  panel.fillStyle(SLAB, 0.95).fillRect(x, y, TOAST_W, TOAST_H).fillStyle(0xe8c15a, 1).fillRect(x, y, BAR_W, TOAST_H);
  const title = scene.add.text(x + 14, y + 13, heading, smallStyle({ fontSize: '7px', color: '#e8c15a', strokeThickness: 0 }))
    .setOrigin(0, 0.5);
  const detail = scene.add.text(x + 14, y + 31, line, smallStyle({ fontSize: '7px', color: TEXT_IDLE, strokeThickness: 0 }))
    .setOrigin(0, 0.5);
  const parts = [panel, title, detail];
  for (const part of parts) part.setScrollFactor(0).setDepth(DEPTH.ANNOUNCEMENT).setAlpha(0);

  scene.tweens.add({
    targets: parts, alpha: 1, duration: 200,
    onComplete: () => {
      scene.tweens.add({
        targets: parts, alpha: 0, delay: TOAST_HOLD_MS, duration: 400,
        onComplete: () => {
          parts.forEach(part => part.destroy());
          // Its place goes to the next one waiting
          queue.taken[slot] = false;
          const next = queue.waiting.shift();
          if (next) showToast(scene, next[0], next[1]);
        },
      });
    },
  });
}
