/**
 * The menus' shared sizes and frame: every sub-page has its title at the top centre and a back button in the top left
 * corner, and its content in the area under them (contentArea). Tabs are a row of buttons, one of them lit.
 * Scrolling lists are in ScrollList.ts.
 */
import Phaser from 'phaser';
import { buttonStyle, headingStyle, smallStyle, UI_TEXT } from '../utils/TextStyles';
import { createButton, type UIButton } from './shared';

/** The smallest a button's face may be, both ways, so a finger on a phone hits it. */
export const TOUCH_MIN = 48;
/** At least this much between neighbouring buttons. */
export const GAP = 8;
/** In from the screen's edges. */
export const EDGE = 12;
/** The band at the top of a page that holds its title and back button. */
export const HEADER_H = 64;
/** Centre line of that band. */
export const HEADER_Y = HEADER_H / 2;
export const BACK_W = 136;
export const TAB_H = TOUCH_MIN;
/** The gold of a lit tab, and the grey of the rest. */
export const TAB_ON = 0xe8c15a;
export const TAB_OFF = 0x444444;

export interface Rect { x: number; y: number; w: number; h: number }

/** The widest a page's content gets: the widest screen the pages were laid out for (1108) less its edges. Past it, the content is centred. */
export const CONTENT_MAX_W = 1084;

/** Where a page's content goes: under the header, the screen's width less its edges (at most CONTENT_MAX_W, centred), down to the bottom edge. */
export function contentArea(width: number, height: number): Rect {
  const w = Math.min(width - EDGE * 2, CONTENT_MAX_W);
  return { x: Math.round((width - w) / 2), y: HEADER_H + GAP, w, h: height - HEADER_H - GAP - EDGE };
}

/**
 * A page's frame, added to its container: the title at the top centre and the back button (an arrow and "Powrót") in
 * the top left corner. Returns the back button: put it in the page's MenuNav list, with `onBack` as its Esc too.
 */
export function addPageHeader(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  width: number,
  title: string,
  onBack: () => void,
): UIButton {
  container.add(scene.add.text(Math.round(width / 2), HEADER_Y, title, headingStyle({
    fontSize: '20px', color: UI_TEXT.bone, strokeThickness: 6,
    shadow: { offsetX: 0, offsetY: 3, color: '#5a0d0d', blur: 0, fill: true, stroke: true },
  })).setOrigin(0.5));
  // Over the content's left edge, which on a very wide screen is in from the screen's
  const back = createButton(scene, contentArea(width, 0).x + BACK_W / 2, HEADER_Y, BACK_W, TOUCH_MIN, 'Powrót', TAB_OFF, buttonStyle({ fontSize: '10px' }),
    onBack, { icon: 'btn-back', sound: 'back' });
  container.add(back.all);
  return back;
}

export interface Tabs {
  buttons: UIButton[];
  /** Lights tab `i` (the others go grey). Doesn't call onPick. */
  setActive: (i: number) => void;
  readonly active: number;
}

/**
 * A row of tabs centred on `cx`, `y` its middle, each as wide as fits `maxW` (at most `tabW`). Pressing the lit one
 * does nothing; another lights it and calls `onPick` with its index.
 */
export function addTabs(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  opts: { cx: number; y: number; maxW: number; labels: string[]; active?: number; tabW?: number; onPick: (i: number) => void },
): Tabs {
  const n = opts.labels.length;
  const w = 2 * Math.floor(Math.min(opts.tabW ?? 200, (opts.maxW - GAP * (n - 1)) / n) / 2);
  let active = opts.active ?? 0;
  const buttons = opts.labels.map((label, i) => {
    const button = createButton(scene, opts.cx + (i - (n - 1) / 2) * (w + GAP), opts.y, w, TAB_H, label, i === active ? TAB_ON : TAB_OFF,
      smallStyle({ fontSize: '7px' }), () => {
        if (i === active) return;
        setActive(i);
        opts.onPick(i);
      });
    container.add(button.all);
    return button;
  });
  const setActive = (i: number): void => {
    active = i;
    buttons.forEach((button, j) => button.setColor(j === i ? TAB_ON : TAB_OFF));
  };
  return { buttons, setActive, get active() { return active; } };
}
