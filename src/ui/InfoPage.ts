import Phaser from 'phaser';

/**
 * Self-contained info / credits page that lives inside a Phaser container.
 * Built lazily on first show(); subsequent calls are no-ops (content persists).
 */
export class InfoPage {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private width: number;
  private height: number;
  private built = false;

  constructor(scene: Phaser.Scene, width: number, height: number) {
    this.scene = scene;
    this.width = width;
    this.height = height;
    this.container = scene.add.container(width, 0).setDepth(10);
  }

  getContainer(): Phaser.GameObjects.Container {
    return this.container;
  }

  /**
   * Build the info page content (once) and attach the back handler.
   * @param onBack callback invoked when the user presses the back button.
   */
  ensureBuilt(onBack: () => void): void {
    if (this.built) return;
    this.buildContent(onBack);
    this.built = true;
  }

  // ── internal ──────────────────────────────────────────────────────

  private buildContent(onBack: () => void): void {
    const { scene, container, width, height } = this;
    const isMobile = !scene.sys.game.device.os.desktop;

    // 2x2 grid layout
    const gap = 10;
    const zoneW = (width - gap * 3) / 2;
    const zoneH = (height - 80 - gap * 3) / 2;
    const left = gap + zoneW / 2;
    const right = gap * 2 + zoneW + zoneW / 2;
    const top = gap + zoneH / 2;
    const bottom = gap * 2 + zoneH + zoneH / 2;

    const titleStyle = (color: string): Phaser.Types.GameObjects.Text.TextStyle => ({
      fontSize: '20px',
      color,
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000',
      strokeThickness: 6,
    });

    const animateTitle = (t: Phaser.GameObjects.Text): void => {
      scene.tweens.add({
        targets: t,
        y: t.y - 4,
        duration: 1200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    };

    // --- PYSZNIUTKIE (green, top-left) ---
    container.add(scene.add.rectangle(left, top, zoneW, zoneH, 0x005500, 0.3));
    const pyszTitle = scene.add.text(left, top - 30, 'Pyszniutkie', titleStyle('#00ff44')).setOrigin(0.5);
    container.add(pyszTitle);
    animateTitle(pyszTitle);

    const pickups = ['apple', 'tyskie', 'pill'];
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
    const fujTitle = scene.add.text(right, top - 30, 'Fujka', titleStyle('#ff3333')).setOrigin(0.5);
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
    const iInne = scene.add.text(right, top + 60, '...i inne', {
      fontSize: '14px',
      color: '#ff6666',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);
    container.add(iInne);

    // --- STEROWANIE (cyan, bottom-left) ---
    container.add(scene.add.rectangle(left, bottom, zoneW, zoneH, 0x003344, 0.3));
    const sterTitle = scene.add.text(left, bottom - 30, 'Sterowanie', titleStyle('#00ccff')).setOrigin(0.5);
    container.add(sterTitle);
    animateTitle(sterTitle);

    const bindings: [string[], string][] = isMobile
      ? [
          [['Lewy ekran'], 'Zmie\u0144 tor'],
          [['Prawy ekran'], 'Dash'],
          [['\u23f8'], 'Pauzka'],
        ]
      : [
          [['SPACJA', '\u2191', '\u2193'], 'Zmiana toru'],
          [['SHIFT', '\u2191>rot90'], 'Dash'],
          [['ESC'], 'Pauzka'],
        ];

    const rowStartY = bottom - 10;
    const rowSpacing = 28;

    const keyStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: '13px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#111111',
      backgroundColor: '#e8e8e8',
      padding: { x: 6, y: 5 },
    };

    const descStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: '10px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#88ccdd',
      stroke: '#000000',
      strokeThickness: 3,
    };

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
    const statyTitle = scene.add.text(right, bottom - 30, 'Moje Staty', titleStyle('#cc66ff')).setOrigin(0.5);
    container.add(statyTitle);
    animateTitle(statyTitle);

    const highScore = localStorage.getItem('cockroach-highscore') || '0';
    const gamesPlayed = parseInt(localStorage.getItem('cockroach-games-played') || '0', 10);

    const statStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: '14px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#ddaaff',
      stroke: '#000000',
      strokeThickness: 4,
    };

    const stat1 = scene.add.text(right, bottom, `Najlepszy: ${highScore}`, statStyle).setOrigin(0.5);
    const stat2 = scene.add.text(right, bottom + 28, `Giereczki: ${gamesPlayed}`, statStyle).setOrigin(0.5);
    container.add([stat1, stat2]);

    // Back button
    const backBg = scene.add.rectangle(width / 2, height - 40, 200, 36, 0x444444, 0.9)
      .setInteractive({ useHandCursor: true });
    const backTxt = scene.add.text(width / 2, height - 40, '\u2190 Powr\u00f3t', {
      fontSize: '10px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);
    backBg.on('pointerover', () => { backBg.setFillStyle(0x666666, 1); backTxt.setColor('#ffff00'); });
    backBg.on('pointerout', () => { backBg.setFillStyle(0x444444, 0.9); backTxt.setColor('#ffffff'); });
    backBg.on('pointerdown', onBack);
    container.add([backBg, backTxt]);
  }
}
