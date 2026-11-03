import Phaser from 'phaser';

export const FONT_FAMILY = '"Press Start 2P", monospace';
const BASE_FONT = FONT_FAMILY;

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
  return { fontSize: '24px', fontFamily: BASE_FONT, color: '#ffffff', stroke: '#000000', strokeThickness: 6, ...overrides };
}

/** Mid-size heading. */
export function headingStyle(overrides?: Partial<Phaser.Types.GameObjects.Text.TextStyle>): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontSize: '18px', fontFamily: BASE_FONT, color: '#ffffff', stroke: '#000000', strokeThickness: 5, ...overrides };
}

/** Standard body copy. */
export function bodyStyle(overrides?: Partial<Phaser.Types.GameObjects.Text.TextStyle>): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontSize: '12px', fontFamily: BASE_FONT, color: '#ffffff', stroke: '#000000', strokeThickness: 3, ...overrides };
}

/** Small helper / label text. */
export function smallStyle(overrides?: Partial<Phaser.Types.GameObjects.Text.TextStyle>): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontSize: '9px', fontFamily: BASE_FONT, color: '#ffffff', stroke: '#000000', strokeThickness: 3, ...overrides };
}

/** HUD elements. */
export function hudStyle(overrides?: Partial<Phaser.Types.GameObjects.Text.TextStyle>): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontSize: '14px', fontFamily: BASE_FONT, color: '#ffffff', stroke: '#000000', strokeThickness: 3, ...overrides };
}

/** Floating popup text (score, combo, etc.). */
export function popupStyle(overrides?: Partial<Phaser.Types.GameObjects.Text.TextStyle>): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontSize: '12px', fontFamily: BASE_FONT, color: '#00ffff', stroke: '#000000', strokeThickness: 3, ...overrides };
}

/** Button / interactive label. */
export function buttonStyle(overrides?: Partial<Phaser.Types.GameObjects.Text.TextStyle>): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontSize: '16px', fontFamily: BASE_FONT, color: '#ffffff', stroke: '#000000', strokeThickness: 4, ...overrides };
}

/** Neon-glow text with shadow. */
export function neonStyle(overrides?: Partial<Phaser.Types.GameObjects.Text.TextStyle>): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontSize: '16px',
    fontFamily: BASE_FONT,
    color: '#ff00ff',
    stroke: '#000000',
    strokeThickness: 5,
    shadow: { offsetX: 2, offsetY: 2, color: '#00ffff', blur: 10, fill: true, stroke: true },
    ...overrides,
  };
}
