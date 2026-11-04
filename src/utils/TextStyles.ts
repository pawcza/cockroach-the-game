import Phaser from 'phaser';

/**
 * A true pixel face on an 8-unit grid, with every Polish letter drawn properly (Press Start 2P's ą and ę read as @).
 * Self-hosted, OFL.
 */
export const FONT_FAMILY = '"Tiny5", monospace';
const BASE_FONT = FONT_FAMILY;

/** Tiny5 is only crisp at whole multiples of its grid: 8, 16, 24... */
export const FONT_GRID = 8;
/**
 * Every size in the game was picked for Press Start 2P, whose capitals fill most of the size; Tiny5's fill 5/8 of it.
 * Sizes are scaled to the same capitals and snapped to the grid here, so nothing anywhere else changes. Anything but
 * the very smallest gets at least 16 px, where one font pixel is one pixel of the art.
 */
const FONT_SCALE = 1.4;
const READABLE_FROM = 7;

/** Tiny5's capitals stand 5 of its 8 units tall. */
const CAP_HEIGHT = 5 / 8;

/**
 * How far to move a text with origin 0.5 so its capitals, not its line box, are centred. Phaser's box reserves the
 * full size above the baseline plus room below it, and Tiny5's letters fill only part of that.
 */
export function capCentreShift(text: Phaser.GameObjects.Text): number {
  const metrics = text.style.getTextMetrics();
  const size = parseFloat(String(text.style.fontSize));
  const capsMiddle = text.style.strokeThickness / 2 + metrics.ascent - (size * CAP_HEIGHT) / 2;
  return Math.round(text.height / 2 - capsMiddle);
}

type Style = Phaser.Types.GameObjects.Text.TextStyle;

function scaled(style: Style): Style {
  const px = typeof style.fontSize === 'number' ? style.fontSize : parseFloat(String(style.fontSize));
  if (Number.isFinite(px)) {
    const cells = Math.max(px >= READABLE_FROM ? 2 : 1, Math.round((px * FONT_SCALE) / FONT_GRID));
    style.fontSize = `${cells * FONT_GRID}px`;
  }
  return style;
}

/** The menus' text colours: warm bone on the dark scrim, never pure white or neon. */
export const UI_TEXT = {
  bone: '#f1e3c6',
  muted: '#8a7d6b',
  amber: '#e0a040',
  named: '#9fe08a',
};

/** Returns a UI scale factor. */
export function getScale(): number {
  return 1;
}

/** Large centered title text. */
export function titleStyle(overrides?: Partial<Phaser.Types.GameObjects.Text.TextStyle>): Phaser.Types.GameObjects.Text.TextStyle {
  return scaled({ fontSize: '24px', fontFamily: BASE_FONT, color: '#ffffff', stroke: '#000000', strokeThickness: 6, ...overrides });
}

/** Mid-size heading. */
export function headingStyle(overrides?: Partial<Phaser.Types.GameObjects.Text.TextStyle>): Phaser.Types.GameObjects.Text.TextStyle {
  return scaled({ fontSize: '18px', fontFamily: BASE_FONT, color: '#ffffff', stroke: '#000000', strokeThickness: 5, ...overrides });
}

/** Standard body copy. */
export function bodyStyle(overrides?: Partial<Phaser.Types.GameObjects.Text.TextStyle>): Phaser.Types.GameObjects.Text.TextStyle {
  return scaled({ fontSize: '12px', fontFamily: BASE_FONT, color: '#ffffff', stroke: '#000000', strokeThickness: 3, ...overrides });
}

/** Small helper / label text. */
export function smallStyle(overrides?: Partial<Phaser.Types.GameObjects.Text.TextStyle>): Phaser.Types.GameObjects.Text.TextStyle {
  return scaled({ fontSize: '9px', fontFamily: BASE_FONT, color: '#ffffff', stroke: '#000000', strokeThickness: 3, ...overrides });
}

/** HUD elements. */
export function hudStyle(overrides?: Partial<Phaser.Types.GameObjects.Text.TextStyle>): Phaser.Types.GameObjects.Text.TextStyle {
  return scaled({ fontSize: '14px', fontFamily: BASE_FONT, color: '#ffffff', stroke: '#000000', strokeThickness: 3, ...overrides });
}

/** Floating popup text (score, combo, etc.). */
export function popupStyle(overrides?: Partial<Phaser.Types.GameObjects.Text.TextStyle>): Phaser.Types.GameObjects.Text.TextStyle {
  return scaled({ fontSize: '12px', fontFamily: BASE_FONT, color: '#00ffff', stroke: '#000000', strokeThickness: 3, ...overrides });
}

/** Button / interactive label. */
export function buttonStyle(overrides?: Partial<Phaser.Types.GameObjects.Text.TextStyle>): Phaser.Types.GameObjects.Text.TextStyle {
  return scaled({ fontSize: '16px', fontFamily: BASE_FONT, color: '#ffffff', stroke: '#000000', strokeThickness: 4, ...overrides });
}

/** Neon-glow text with shadow. */
export function neonStyle(overrides?: Partial<Phaser.Types.GameObjects.Text.TextStyle>): Phaser.Types.GameObjects.Text.TextStyle {
  return scaled({
    fontSize: '16px',
    fontFamily: BASE_FONT,
    color: '#ff00ff',
    stroke: '#000000',
    strokeThickness: 5,
    shadow: { offsetX: 2, offsetY: 2, color: '#00ffff', blur: 10, fill: true, stroke: true },
    ...overrides,
  });
}
