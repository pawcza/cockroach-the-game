import Phaser from 'phaser';

/** Create a styled rectangle button with hover effects and click handler. */
export function createButton(
  scene: Phaser.Scene,
  x: number, y: number,
  w: number, h: number,
  label: string,
  color: number,
  style: Phaser.Types.GameObjects.Text.TextStyle,
  action: () => void,
): { bg: Phaser.GameObjects.Rectangle; txt: Phaser.GameObjects.Text } {
  const bg = scene.add.rectangle(x, y, w, h, color, 0.9)
    .setInteractive({ useHandCursor: true });
  const txt = scene.add.text(x, y, label, style).setOrigin(0.5);
  bg.on('pointerover', () => { bg.setAlpha(1); txt.setColor('#ffff00'); });
  bg.on('pointerout', () => { bg.setAlpha(0.9); txt.setColor('#ffffff'); });
  bg.on('pointerdown', action);
  return { bg, txt };
}
