import Phaser from 'phaser';
import { ATLAS, SPRITE_SCALE, frameOf, playLoop } from '../../config/sprites';
import { bodyStyle, headingStyle, smallStyle, UI_TEXT } from '../../utils/TextStyles';
import { getGamesPlayed, getHighScore } from '../../utils/Storage';
import { createPanel } from '../../ui/shared';
import { addContactShadow } from '../../effects/ContactShadow';

/** Each quarter keeps its old colour, but only as a bar beside its heading. */
const GOOD = 0x6fc25a;
const BAD = 0xc8503c;
const CONTROLS = 0x4aa3b8;
const STATS = 0xc9a0dc;

export function buildInfoPage(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  width: number,
  height: number,
  isMobile: boolean,
): void {
  // 2x2 grid of panels above the back button
  const gap = 14;
  const zoneW = Math.floor((width - gap * 3) / 2);
  const zoneH = Math.floor((height - 84 - gap * 3) / 2);
  const zones = {
    good: { x: gap, y: gap },
    bad: { x: gap * 2 + zoneW, y: gap },
    controls: { x: gap, y: gap * 2 + zoneH },
    stats: { x: gap * 2 + zoneW, y: gap * 2 + zoneH },
  };

  const zone = (at: { x: number; y: number }, title: string, accent: number): void => {
    container.add(createPanel(scene, at.x, at.y, zoneW, zoneH));
    container.add(scene.add.rectangle(at.x + 16, at.y + 24, 6, 18, accent).setOrigin(0, 0.5));
    container.add(scene.add.text(at.x + 30, at.y + 24, title, headingStyle({
      fontSize: '14px', color: UI_TEXT.bone, strokeThickness: 0,
    })).setOrigin(0, 0.5));
  };

  // A row of art standing on one line, animated like in the game
  const lineUp = (at: { x: number; y: number }, keys: string[]): void => {
    const feetY = at.y + zoneH - 34;
    const step = zoneW / (keys.length + 1);
    keys.forEach((key, i) => {
      const x = Math.round(at.x + step * (i + 1));
      container.add(addContactShadow(scene, x, feetY, 60));
      const sprite = scene.add.sprite(x, feetY, ATLAS, frameOf(key)).setScale(SPRITE_SCALE);
      playLoop(sprite, key);
      container.add(sprite);
    });
  };

  zone(zones.good, 'Pyszniutkie', GOOD);
  lineUp(zones.good, ['apple', 'beer-1', 'pill']);

  zone(zones.bad, 'Fujka', BAD);
  lineUp(zones.bad, ['onion', 'spray', 'flipper']);
  container.add(scene.add.text(zones.bad.x + zoneW - 16, zones.bad.y + 24, '...i inne', smallStyle({
    fontSize: '8px', color: UI_TEXT.muted, strokeThickness: 0,
  })).setOrigin(1, 0.5));

  zone(zones.controls, 'Sterowanie', CONTROLS);
  const bindings: [string[], string][] = isMobile
    ? [
        [['Lewa strona'], 'Zmiana toru'],
        [['Prawa strona'], 'Dash'],
        [['II'], 'Pauza'],
      ]
    : [
        [['SPACJA', '↑', '↓'], 'Zmiana toru'],
        [['SHIFT', 'CTRL'], 'Dash'],
        [['ESC'], 'Pauza'],
      ];
  const keyStyle = bodyStyle({
    fontSize: '10px',
    color: '#15100d',
    strokeThickness: 0,
    backgroundColor: '#cdbfa9',
    padding: { x: 6, y: 5 },
  });
  const descStyle = smallStyle({ fontSize: '9px', color: UI_TEXT.bone, strokeThickness: 0 });
  bindings.forEach(([keys, desc], i) => {
    const rowY = zones.controls.y + 64 + i * 34;
    let kx = zones.controls.x + 18;
    for (const k of keys) {
      const keyText = scene.add.text(kx, rowY, k, keyStyle).setOrigin(0, 0.5);
      container.add(keyText);
      kx += keyText.width + 6;
    }
    container.add(scene.add.text(zones.controls.x + zoneW - 18, rowY, desc, descStyle).setOrigin(1, 0.5));
  });

  zone(zones.stats, 'Moje Staty', STATS);
  const statStyle = bodyStyle({ fontSize: '14px', color: UI_TEXT.bone, strokeThickness: 0 });
  const labelStyle = smallStyle({ fontSize: '10px', color: UI_TEXT.muted, strokeThickness: 0 });
  const statRows: [string, string][] = [
    ['Najlepszy wynik', String(getHighScore())],
    ['Rozegrane biegi', String(getGamesPlayed())],
  ];
  statRows.forEach(([label, value], i) => {
    const rowY = zones.stats.y + 70 + i * 40;
    container.add(scene.add.text(zones.stats.x + 18, rowY, label, labelStyle).setOrigin(0, 0.5));
    container.add(scene.add.text(zones.stats.x + zoneW - 18, rowY, value, statStyle).setOrigin(1, 0.5));
  });
}
