import Phaser from 'phaser';

/** Shared font family used across all UI scenes. */
export const FONT_FAMILY = '"Press Start 2P", monospace';

/** Returns a mobile-aware scale factor (1.5x on mobile, 1x on desktop). */
export function getScale(): number {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 1.5 : 1;
}

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
  scene.events.on('update', () => {
    if (scrolling) {
      tile.tilePositionX += 1;
    }
  });

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

  return { bg, txt, hitZone, all: [bg, tile, hitZone, txt], setColor };
}

/** Create an HTML button styled to match the in-game buttons (for DOM overlays). */
export function createHtmlButton(text: string, bgColor: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = text;
  btn.style.cssText = `font-family:"Press Start 2P",monospace;font-size:18px;padding:14px 32px;color:#ddd;border:none;cursor:pointer;border-radius:8px;background-color:${bgColor};background-image:url("assets/btn.png");background-size:auto 100%;background-repeat:repeat-x;background-blend-mode:overlay;box-shadow:2px 3px 0 rgba(0,0,0,0.5);`;
  btn.addEventListener('mouseenter', () => {
    btn.style.color = '#ffff00';
    btn.style.textShadow = '0 0 6px #ffff00';
    btn.style.filter = 'brightness(1.3)';
    btn.dataset.scrollAnim = 'true';
    let pos = 0;
    const scroll = (): void => {
      if (btn.dataset.scrollAnim !== 'true') return;
      pos -= 1;
      btn.style.backgroundPositionX = `${pos}px`;
      requestAnimationFrame(scroll);
    };
    requestAnimationFrame(scroll);
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.color = '#ddd';
    btn.style.textShadow = 'none';
    btn.style.filter = 'none';
    btn.dataset.scrollAnim = 'false';
  });
  btn.addEventListener('mousedown', () => {
    btn.style.transform = 'translateY(1px)';
    btn.style.boxShadow = '1px 1px 0 rgba(0,0,0,0.5)';
  });
  btn.addEventListener('mouseup', () => {
    btn.style.transform = 'none';
    btn.style.boxShadow = '2px 3px 0 rgba(0,0,0,0.5)';
  });
  return btn;
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
  fall: 'Spadł',
};
