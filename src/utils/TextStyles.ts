import Phaser from 'phaser';
import { FONT_FAMILY, getScale } from '../ui/shared';

/**
 * Scaled text style factory.
 * Every call applies the shared font family and mobile scale factor automatically.
 */
function scaled(
  fontSize: number,
  color: string,
  strokeThickness = 2,
  extras: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {},
): Phaser.Types.GameObjects.Text.TextStyle {
  const s = getScale();
  return {
    fontSize: `${Math.round(fontSize * s)}px`,
    fontFamily: FONT_FAMILY,
    color,
    stroke: '#000000',
    strokeThickness: Math.round(strokeThickness * s),
    ...extras,
  };
}

// ---------------------------------------------------------------------------
//  Preset factories — each returns a fresh style object so callers can mutate
// ---------------------------------------------------------------------------

/** Large scene titles (game over, menus). */
export const titleStyle = (color = '#ffffff') => scaled(28, color, 6, { fontStyle: 'bold' });

/** Medium headings / section titles. */
export const headingStyle = (color = '#ffff00') => scaled(16, color, 4);

/** Standard body / paragraph text. */
export const bodyStyle = (color = '#ffffff') => scaled(10, color, 2);

/** Small labels and captions. */
export const smallStyle = (color = '#cccccc') => scaled(8, color, 2);

/** HUD elements (score, level, floor indicator). */
export const hudStyle = (color = '#ffffff') => scaled(12, color, 3);

/** In-game floating popups (+10, PIGULKA!, etc.). */
export const popupStyle = (color = '#ffff00', size = 12) => scaled(size, color, 3);

/** Button label text. */
export const buttonStyle = (color = '#ffffff', size = 10) => scaled(size, color, 3);

/** Neon-glow style for special effects text. */
export const neonStyle = (color = '#ff00ff', size = 16) =>
  scaled(size, color, 5, {
    shadow: {
      offsetX: 2,
      offsetY: 2,
      color: '#00ffff',
      blur: 10,
      fill: true,
      stroke: true,
    },
  });

// ---------------------------------------------------------------------------
//  One-off helper for dynamic sizing (e.g. title that shrinks for long text)
// ---------------------------------------------------------------------------

/** Title that auto-sizes down if the message is long. */
export const adaptiveTitleStyle = (message: string, color = '#8b0000') => {
  const fontSize = message.length > 15 ? 18 : 28;
  return scaled(fontSize, color, 6, { fontStyle: 'bold' });
};
