import Phaser from 'phaser';

export const FONT_FAMILY = '"Press Start 2P", monospace';
const BASE_FONT = FONT_FAMILY;

/** Returns a mobile-aware scale factor (1.5x on mobile, 1x on desktop). */
export function getScale(): number {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 1.5 : 1;
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

/** HUD elements — mobile-aware. */
export function hudStyle(mobile?: boolean, overrides?: Partial<Phaser.Types.GameObjects.Text.TextStyle>): Phaser.Types.GameObjects.Text.TextStyle {
  const size = mobile ? '18px' : '14px';
  return { fontSize: size, fontFamily: BASE_FONT, color: '#ffffff', stroke: '#000000', strokeThickness: 3, ...overrides };
}

/** Small HUD text — mobile-aware. */
export function hudSmallStyle(mobile?: boolean, overrides?: Partial<Phaser.Types.GameObjects.Text.TextStyle>): Phaser.Types.GameObjects.Text.TextStyle {
  const size = mobile ? '12px' : '10px';
  return { fontSize: size, fontFamily: BASE_FONT, color: '#ffffff', stroke: '#000000', strokeThickness: 3, ...overrides };
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

/** Responsive title that scales with camera width. */
export function adaptiveTitleStyle(cameraWidth: number, overrides?: Partial<Phaser.Types.GameObjects.Text.TextStyle>): Phaser.Types.GameObjects.Text.TextStyle {
  const size = Math.max(16, Math.min(32, Math.floor(cameraWidth / 25)));
  return titleStyle({ fontSize: `${size}px`, ...overrides });
}
