import Phaser from 'phaser';

/** Shared font family used across all UI scenes. */
export const FONT_FAMILY = '"Press Start 2P", monospace';

/** Returns a mobile-aware scale factor (1.5x on mobile, 1x on desktop). */
export function getScale(): number {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 1.5 : 1;
}

/**
 * Creates a styled interactive button (rectangle + label) with hover effects.
 * Returns the background and text objects for further customisation.
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
): { bg: Phaser.GameObjects.Rectangle; txt: Phaser.GameObjects.Text } {
  const bg = scene.add
    .rectangle(x, y, w, h, color, 0.9)
    .setInteractive({ useHandCursor: true });
  const txt = scene.add.text(x, y, label, style).setOrigin(0.5);
  bg.on('pointerover', () => { bg.setAlpha(1); txt.setColor('#ffff00'); });
  bg.on('pointerout', () => { bg.setAlpha(0.9); txt.setColor('#ffffff'); });
  bg.on('pointerdown', action);
  return { bg, txt };
}
