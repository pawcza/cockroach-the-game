import Phaser from 'phaser';
import { bodyStyle, headingStyle, smallStyle } from '../../utils/TextStyles';
import { floatUpDown } from '../../utils/TweenPatterns';
import { getGamesPlayed, getHighScore } from '../../utils/Storage';

export function buildInfoPage(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  width: number,
  height: number,
  isMobile: boolean,
): void {
  // 2x2 grid layout
  const gap = 10;
  const zoneW = (width - gap * 3) / 2;
  const zoneH = (height - 80 - gap * 3) / 2;
  const left = gap + zoneW / 2;
  const right = gap * 2 + zoneW + zoneW / 2;
  const top = gap + zoneH / 2;
  const bottom = gap * 2 + zoneH + zoneH / 2;

  const zoneTitleStyle = (color: string): Phaser.Types.GameObjects.Text.TextStyle => headingStyle({
    fontSize: '20px',
    color,
    strokeThickness: 6,
  });

  const animateTitle = (t: Phaser.GameObjects.Text): void => {
    floatUpDown(scene, t, 4, 1200);
  };

  // --- PYSZNIUTKIE (green, top-left) ---
  container.add(scene.add.rectangle(left, top, zoneW, zoneH, 0x005500, 0.3));
  const pyszTitle = scene.add.text(left, top - 30, 'Pyszniutkie', zoneTitleStyle('#00ff44')).setOrigin(0.5);
  container.add(pyszTitle);
  animateTitle(pyszTitle);

  const pickups = ['apple', 'beer-1', 'pill'];
  const pickupSpacing = zoneW / (pickups.length + 1);
  const pickupY = top + 25;
  pickups.forEach((key, i) => {
    const ix = left - zoneW / 2 + pickupSpacing * (i + 1);
    const icon = scene.add.image(ix, pickupY, key).setScale(0.28);
    container.add(icon);
    scene.tweens.add({
      targets: icon,
      y: pickupY - 4,
      angle: { from: -5, to: 5 },
      duration: 800 + i * 200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  });

  // --- FUJKA (red, top-right) ---
  container.add(scene.add.rectangle(right, top, zoneW, zoneH, 0x550000, 0.3));
  const fujTitle = scene.add.text(right, top - 30, 'Fujka', zoneTitleStyle('#ff3333')).setOrigin(0.5);
  container.add(fujTitle);
  animateTitle(fujTitle);

  const obstacles = ['onion', 'pest-spray', 'newspaper', 'flipper'];
  const obstSpacing = zoneW / (obstacles.length + 1);
  const obstY = top + 25;
  obstacles.forEach((key, i) => {
    const ix = right - zoneW / 2 + obstSpacing * (i + 1);
    const icon = scene.add.image(ix, obstY, key).setScale(0.25);
    container.add(icon);
    scene.tweens.add({
      targets: icon,
      y: obstY - 4,
      angle: { from: -5, to: 5 },
      duration: 800 + i * 150,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  });
  const iInne = scene.add.text(right, top + 60, '...i inne', bodyStyle({
    fontSize: '14px',
    color: '#ff6666',
    strokeThickness: 4,
  })).setOrigin(0.5);
  container.add(iInne);

  // --- STEROWANIE (cyan, bottom-left) ---
  container.add(scene.add.rectangle(left, bottom, zoneW, zoneH, 0x003344, 0.3));
  const sterTitle = scene.add.text(left, bottom - 30, 'Sterowanie', zoneTitleStyle('#00ccff')).setOrigin(0.5);
  container.add(sterTitle);
  animateTitle(sterTitle);

  const bindings: [string[], string][] = isMobile
    ? [
        [['Lewy ekran'], 'Zmie\u0144 tor'],
        [['Prawy ekran'], 'Dash'],
        [['\u23f8'], 'Pauza'],
      ]
    : [
        [['SPACJA', '\u2191', '\u2193'], 'Zmiana toru'],
        [['SHIFT', '\u2191>rot90'], 'Dash'],
        [['ESC'], 'Pauza'],
      ];

  const rowStartY = bottom - 10;
  const rowSpacing = 28;

  const keyStyle = bodyStyle({
    fontSize: '13px',
    color: '#111111',
    strokeThickness: 0,
    backgroundColor: '#e8e8e8',
    padding: { x: 6, y: 5 },
  });

  const descStyle = smallStyle({
    fontSize: '10px',
    color: '#88ccdd',
    strokeThickness: 3,
  });

  bindings.forEach(([keys, desc], i) => {
    const rowY = rowStartY + i * rowSpacing;

    const keyTexts: Phaser.GameObjects.Text[] = [];
    keys.forEach((k) => {
      const rotate = k.endsWith('>rot90');
      const label = rotate ? k.replace('>rot90', '') : k;
      const kt = scene.add.text(0, 0, label, keyStyle);
      if (rotate) kt.setAngle(90);
      keyTexts.push(kt);
      container.add(kt);
    });

    const keyGap = 4;
    let kx = left - zoneW / 2 + 8;
    keyTexts.forEach((kt) => {
      if (kt.angle !== 0) {
        kt.setOrigin(0.5, 0.5);
        kt.setPosition(kx + kt.width / 2, rowY);
      } else {
        kt.setPosition(kx, rowY);
        kt.setOrigin(0, 0.5);
      }
      kx += kt.width + keyGap;
    });

    const descText = scene.add.text(left + zoneW / 2 - 8, rowY, desc, descStyle).setOrigin(1, 0.5);
    container.add(descText);
  });

  // --- MOJE STATY (purple, bottom-right) ---
  container.add(scene.add.rectangle(right, bottom, zoneW, zoneH, 0x330044, 0.3));
  const statyTitle = scene.add.text(right, bottom - 30, 'Moje Staty', zoneTitleStyle('#cc66ff')).setOrigin(0.5);
  container.add(statyTitle);
  animateTitle(statyTitle);

  const highScore = String(getHighScore());
  const gamesPlayed = getGamesPlayed();

  const statStyle = bodyStyle({
    fontSize: '14px',
    color: '#ddaaff',
    strokeThickness: 4,
  });

  const stat1 = scene.add.text(right, bottom, `Najlepszy: ${highScore}`, statStyle).setOrigin(0.5);
  const stat2 = scene.add.text(right, bottom + 28, `Giereczki: ${gamesPlayed}`, statStyle).setOrigin(0.5);
  container.add([stat1, stat2]);
}
