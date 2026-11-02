import Phaser from 'phaser';

/** Create a styled button with grimy cockroach aesthetic and scrolling texture. */
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
): { bg: Phaser.GameObjects.Graphics; txt: Phaser.GameObjects.Text; hitZone: Phaser.GameObjects.Rectangle; all: Phaser.GameObjects.GameObject[]; setColor: (c: number) => void } {
  const radius = 8;

  let baseColor = color;
  let borderColor: number;
  let highlightColor: number;

  const computeColors = (c: number): void => {
    const r = (c >> 16) & 0xff;
    const g = (c >> 8) & 0xff;
    const b = c & 0xff;
    borderColor = Phaser.Display.Color.GetColor(
      Math.floor(r * 0.4), Math.floor(g * 0.4), Math.floor(b * 0.4),
    );
    highlightColor = Phaser.Display.Color.GetColor(
      Math.min(255, Math.floor(r * 1.3)), Math.min(255, Math.floor(g * 1.3)), Math.min(255, Math.floor(b * 1.3)),
    );
  };
  computeColors(baseColor);

  const bg = scene.add.graphics();

  // Tiled texture background for the button
  const tileScale = h / 128;
  const tile = scene.add.tileSprite(x, y, w, h, 'btn-bg')
    .setTileScale(tileScale)
    .setTint(color)
    .setAlpha(0.9);

  // Rounded-rect mask for the tile sprite
  const maskGfx = scene.make.graphics({});
  maskGfx.fillRoundedRect(x - w / 2, y - h / 2, w, h, radius);
  tile.setMask(new Phaser.Display.Masks.GeometryMask(scene, maskGfx));

  // Track scroll state
  let scrolling = false;

  const drawButton = (fillColor: number, alpha: number): void => {
    bg.clear();
    // Shadow
    bg.fillStyle(0x000000, 0.5);
    bg.fillRoundedRect(x - w / 2 + 2, y - h / 2 + 3, w, h, radius);
    // Border
    bg.fillStyle(borderColor, 1);
    bg.fillRoundedRect(x - w / 2 - 1, y - h / 2 - 1, w + 2, h + 2, radius + 1);
    // Main fill (darker base behind texture)
    bg.fillStyle(fillColor, alpha * 0.3);
    bg.fillRoundedRect(x - w / 2, y - h / 2, w, h, radius);
    // Inner highlight (top edge grime shine)
    bg.fillStyle(0xffffff, 0.08);
    bg.fillRoundedRect(x - w / 2 + 2, y - h / 2 + 1, w - 4, h * 0.35, { tl: radius - 2, tr: radius - 2, bl: 0, br: 0 });

    tile.setTint(fillColor);
    tile.setAlpha(alpha);
  };

  drawButton(baseColor, 0.9);

  // Scroll the texture when hovered/pressed
  const scrollTile = (): void => {
    if (scrolling) tile.tilePositionX += 1;
  };
  scene.events.on('update', scrollTile);
  tile.once('destroy', () => scene.events.off('update', scrollTile));

  // Invisible hit area
  const hitZone = scene.add.rectangle(x, y, w, h, 0x000000, 0)
    .setInteractive({ useHandCursor: true });

  const txt = scene.add.text(x, y, label, {
    ...style,
    color: '#dddddd',
  }).setOrigin(0.5);

  hitZone.on('pointerover', () => {
    scrolling = true;
    drawButton(highlightColor, 1);
    txt.setColor('#ffff00');
    txt.setShadow(0, 0, '#ffff00', 6);
  });
  hitZone.on('pointerout', () => {
    scrolling = false;
    drawButton(baseColor, 0.9);
    txt.setColor('#dddddd');
    txt.setShadow(0, 0, '#000000', 0);
  });
  hitZone.on('pointerdown', () => {
    drawButton(borderColor, 1);
    txt.setY(y + 1);
  });
  hitZone.on('pointerup', () => {
    drawButton(baseColor, 0.9);
    txt.setY(y);
    action();
  });

  /** Change the button's base color and redraw. */
  const setColor = (c: number): void => {
    baseColor = c;
    computeColors(c);
    drawButton(baseColor, 0.9);
  };

  return { bg, txt, hitZone, all: [bg, tile, maskGfx, hitZone, txt], setColor };
}

/** Obstacle type to texture key mapping. */
export const OBSTACLE_TEXTURE: Record<string, string> = {
  bird: 'bird',
  cat: 'cat-paw',
  flipper: 'flipper',
  newspaper: 'newspaper',
  onion: 'onion',
  spray: 'pest-spray',
  disco: 'disco-ball',
  jellyfish: 'jellyfish',
  pope: 'pope',
  bison: 'bison',
  blackhole: 'black-hole',
  boss: 'boss-face2',
};

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
