import Phaser from 'phaser';

export const FONT_FAMILY = '"Press Start 2P", monospace';

/** Returns a mobile-aware scale factor. */
export function getScale(): number {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 1.5 : 1;
}

/** Large title text — used for scene headings and death messages. */
export function titleStyle(overrides?: Partial<Phaser.Types.GameObjects.Text.TextStyle>): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontSize: '20px',
    color: '#ffff00',
    fontFamily: FONT_FAMILY,
    fontStyle: 'bold',
    stroke: '#000000',
    strokeThickness: 6,
    ...overrides,
  };
}

/** Adaptive title that scales font size based on text length and device. */
export function adaptiveTitleStyle(message: string, overrides?: Partial<Phaser.Types.GameObjects.Text.TextStyle>): Phaser.Types.GameObjects.Text.TextStyle {
  const s = getScale();
  return {
    fontSize: `${Math.round((message.length > 15 ? 18 : 28) * s)}px`,
    color: '#8b0000',
    fontFamily: FONT_FAMILY,
    fontStyle: 'bold',
    stroke: '#000000',
    strokeThickness: 6 * s,
    ...overrides,
  };
}

/** Section heading — slightly smaller than title, used for sub-sections. */
export function headingStyle(overrides?: Partial<Phaser.Types.GameObjects.Text.TextStyle>): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontSize: '16px',
    color: '#ffff00',
    fontFamily: FONT_FAMILY,
    stroke: '#000000',
    strokeThickness: 5,
    ...overrides,
  };
}

/** Standard body text. */
export function bodyStyle(overrides?: Partial<Phaser.Types.GameObjects.Text.TextStyle>): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontSize: '12px',
    color: '#ffffff',
    fontFamily: FONT_FAMILY,
    stroke: '#000000',
    strokeThickness: 3,
    ...overrides,
  };
}

/** Small/caption text. */
export function smallStyle(overrides?: Partial<Phaser.Types.GameObjects.Text.TextStyle>): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontSize: '9px',
    color: '#aaaaaa',
    fontFamily: FONT_FAMILY,
    stroke: '#000000',
    strokeThickness: 2,
    ...overrides,
  };
}

/** HUD primary text (score, distance). */
export function hudStyle(isMobile: boolean, overrides?: Partial<Phaser.Types.GameObjects.Text.TextStyle>): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontSize: isMobile ? '14px' : '11px',
    color: '#ffffff',
    fontFamily: FONT_FAMILY,
    stroke: '#000000',
    strokeThickness: 3,
    ...overrides,
  };
}

/** HUD secondary text (level name, distance, speed). */
export function hudSmallStyle(isMobile: boolean, overrides?: Partial<Phaser.Types.GameObjects.Text.TextStyle>): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontSize: isMobile ? '10px' : '8px',
    color: '#aaaaaa',
    fontFamily: FONT_FAMILY,
    stroke: '#000000',
    strokeThickness: 2,
    ...overrides,
  };
}

/** Popup / overlay text (pause, announcements). */
export function popupStyle(overrides?: Partial<Phaser.Types.GameObjects.Text.TextStyle>): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontSize: '24px',
    color: '#ffffff',
    fontFamily: FONT_FAMILY,
    stroke: '#000000',
    strokeThickness: 4,
    ...overrides,
  };
}

/** Button label text. */
export function buttonStyle(overrides?: Partial<Phaser.Types.GameObjects.Text.TextStyle>): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontSize: '12px',
    color: '#ffffff',
    fontFamily: FONT_FAMILY,
    stroke: '#000000',
    strokeThickness: 3,
    align: 'center',
    ...overrides,
  };
}

/** Neon/glow text for special effects. */
export function neonStyle(overrides?: Partial<Phaser.Types.GameObjects.Text.TextStyle>): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontSize: '18px',
    color: '#00ffff',
    fontFamily: FONT_FAMILY,
    fontStyle: 'bold',
    stroke: '#000000',
    strokeThickness: 5,
    ...overrides,
  };
}
