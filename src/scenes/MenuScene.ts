import Phaser from 'phaser';
import { fetchScores } from '../ui/Scoreboard';

export class MenuScene extends Phaser.Scene {
  private menuBgm: Phaser.Sound.BaseSound | null = null;
  private menuBg!: Phaser.GameObjects.TileSprite;
  private bgScrollSpeed = 0.05;

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const { width, height } = this.cameras.main;

    // Menu background with dark overlay (scrolling)
    this.menuBg = this.add.tileSprite(0, 0, width, height, 'menu-bg').setOrigin(0, 0);
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.55);

    // --- TRIPPY COLOR-CYCLING OVERLAY ---
    const colorOverlay = this.add.rectangle(width / 2, height / 2, width, height, 0x8800aa, 0.15);
    colorOverlay.setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({
      targets: colorOverlay,
      fillColor: { from: 0x8800aa, to: 0xff0044 },
      duration: 3000,
      yoyo: true,
      repeat: -1,
      onUpdate: (_tween, target) => {
        const progress = Math.sin(this.time.now * 0.001) * 0.5 + 0.5;
        const r = Math.floor(0x88 + progress * (0xff - 0x88));
        const g = Math.floor(0x00 + progress * 0x00);
        const b = Math.floor(0xaa - progress * (0xaa - 0x44));
        (target as Phaser.GameObjects.Rectangle).setFillStyle(
          (r << 16) | (g << 8) | b,
          0.15,
        );
      },
    });

    // --- FLOATING NEON PARTICLES ---
    const neonColors = [0xff00ff, 0x00ffff, 0xff6600, 0x00ff66, 0xffff00, 0xff0088, 0x8800ff];
    for (let i = 0; i < 14; i++) {
      this.spawnFloatingParticle(width, height, neonColors);
    }

    // --- PULSING VIGNETTE ---
    const vignette = this.add.graphics();
    vignette.setDepth(100);
    const drawVignette = (alpha: number): void => {
      vignette.clear();
      for (let i = 5; i >= 0; i--) {
        const ratio = i / 5;
        const a = alpha * ratio * ratio;
        vignette.fillStyle(0x000000, a);
        const inset = (1 - ratio) * 80;
        vignette.fillRect(0, 0, inset, height);
        vignette.fillRect(width - inset, 0, inset, height);
        vignette.fillRect(0, 0, width, inset);
        vignette.fillRect(0, height - inset, width, inset);
      }
    };
    drawVignette(0.6);

    const vignetteData = { alpha: 0.6 };
    this.tweens.add({
      targets: vignetteData,
      alpha: 0.9,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: () => drawVignette(vignetteData.alpha),
    });

    const isMobile = !this.sys.game.device.os.desktop;

    // --- Main page container ---
    const mainPage = this.add.container(0, 0).setDepth(10);

    // --- TITLE ---
    const title = this.add.text(width / 2, 140, 'KARALUCH', {
      fontSize: '32px',
      color: '#8b0000',
      fontFamily: '"Press Start 2P", monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5);
    mainPage.add(title);

    this.tweens.add({
      targets: title,
      y: title.y - 10,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const subtitle = this.add.text(width / 2, 185, 'Gra przegra\u0144c\u00f3w', {
      fontSize: '14px',
      color: '#ff6600',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);
    mainPage.add(subtitle);

    this.tweens.add({
      targets: subtitle,
      angle: 3,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    subtitle.setAngle(-3);

    // --- MENU MUSIC ---
    this.menuBgm = this.sound.add('menu-bgm', { volume: 0.3, loop: true });
    this.menuBgm.play();

    const startGame = (): void => {
      if (this.menuBgm) {
        this.menuBgm.stop();
        this.menuBgm.destroy();
        this.menuBgm = null;
      }
      if (isMobile && !document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
      this.scene.start('GameScene');
    };

    // --- 3 BUTTONS vertically stacked ---
    const btnStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: '12px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
    };

    const btnW = 280;
    const btnH = 40;
    const btnStartY = 260;
    const btnSpacing = 52;

    const createBtn = (y: number, label: string, color: number, action: () => void): void => {
      const bg = this.add.rectangle(width / 2, y, btnW, btnH, color, 0.9)
        .setInteractive({ useHandCursor: true });
      const txt = this.add.text(width / 2, y, label, btnStyle).setOrigin(0.5);
      bg.on('pointerover', () => { bg.setFillStyle(color, 1); txt.setColor('#ffff00'); });
      bg.on('pointerout', () => { bg.setFillStyle(color, 0.9); txt.setColor('#ffffff'); });
      bg.on('pointerdown', action);
      mainPage.add([bg, txt]);
      return;
    };

    createBtn(btnStartY, 'GRAJ', 0x880000, startGame);

    // Pulsing on GRAJ button
    const grajBg = mainPage.list[mainPage.list.length - 2] as Phaser.GameObjects.Rectangle;
    this.tweens.add({
      targets: grajBg,
      alpha: { from: 0.85, to: 1 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // --- Scoreboard page container (off-screen to the left) ---
    const scorePage = this.add.container(-width, 0).setDepth(10);
    let scoreBuilt = false;

    const showScores = (): void => {
      if (!scoreBuilt) {
        this.buildScorePage(scorePage, width, height);
        const backBg = this.add.rectangle(width / 2, height - 40, 200, 36, 0x444444, 0.9)
          .setInteractive({ useHandCursor: true });
        const backTxt = this.add.text(width / 2, height - 40, 'Powrót →', {
          fontSize: '10px',
          fontFamily: '"Press Start 2P", monospace',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 3,
        }).setOrigin(0.5);
        backBg.on('pointerover', () => { backBg.setFillStyle(0x666666, 1); backTxt.setColor('#ffff00'); });
        backBg.on('pointerout', () => { backBg.setFillStyle(0x444444, 0.9); backTxt.setColor('#ffffff'); });
        backBg.on('pointerdown', hideScores);
        scorePage.add([backBg, backTxt]);
        scoreBuilt = true;
      }
      this.tweens.add({ targets: mainPage, x: width, duration: 400, ease: 'Power2' });
      this.tweens.add({ targets: scorePage, x: 0, duration: 400, ease: 'Power2' });
      this.tweens.add({ targets: this, bgScrollSpeed: -6, duration: 200, ease: 'Power2',
        onComplete: () => {
          this.tweens.add({ targets: this, bgScrollSpeed: 0.05, duration: 200, ease: 'Power2' });
        },
      });
    };

    const hideScores = (): void => {
      this.tweens.add({ targets: mainPage, x: 0, duration: 400, ease: 'Power2' });
      this.tweens.add({ targets: scorePage, x: -width, duration: 400, ease: 'Power2' });
      this.tweens.add({ targets: this, bgScrollSpeed: 6, duration: 200, ease: 'Power2',
        onComplete: () => {
          this.tweens.add({ targets: this, bgScrollSpeed: 0.05, duration: 200, ease: 'Power2' });
        },
      });
    };

    createBtn(btnStartY + btnSpacing, 'Bycze Karaluchy', 0x664400, showScores);

    // --- Info page container (off-screen to the right) ---
    const infoPage = this.add.container(width, 0).setDepth(10);
    let infoBuilt = false;

    const showInfo = (): void => {
      if (!infoBuilt) {
        this.buildInfoPage(infoPage, width, height, isMobile);
        // Back button
        const backBg = this.add.rectangle(width / 2, height - 40, 200, 36, 0x444444, 0.9)
          .setInteractive({ useHandCursor: true });
        const backTxt = this.add.text(width / 2, height - 40, '\u2190 Powr\u00f3t', {
          fontSize: '10px',
          fontFamily: '"Press Start 2P", monospace',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 3,
        }).setOrigin(0.5);
        backBg.on('pointerover', () => { backBg.setFillStyle(0x666666, 1); backTxt.setColor('#ffff00'); });
        backBg.on('pointerout', () => { backBg.setFillStyle(0x444444, 0.9); backTxt.setColor('#ffffff'); });
        backBg.on('pointerdown', hideInfo);
        infoPage.add([backBg, backTxt]);
        infoBuilt = true;
      }
      this.tweens.add({ targets: mainPage, x: -width, duration: 400, ease: 'Power2' });
      this.tweens.add({ targets: infoPage, x: 0, duration: 400, ease: 'Power2' });
      this.tweens.add({ targets: this, bgScrollSpeed: 6, duration: 200, ease: 'Power2',
        onComplete: () => {
          this.tweens.add({ targets: this, bgScrollSpeed: 0.05, duration: 200, ease: 'Power2' });
        },
      });
    };

    const hideInfo = (): void => {
      this.tweens.add({ targets: mainPage, x: 0, duration: 400, ease: 'Power2' });
      this.tweens.add({ targets: infoPage, x: width, duration: 400, ease: 'Power2' });
      this.tweens.add({ targets: this, bgScrollSpeed: -6, duration: 200, ease: 'Power2',
        onComplete: () => {
          this.tweens.add({ targets: this, bgScrollSpeed: 0.05, duration: 200, ease: 'Power2' });
        },
      });
    };

    createBtn(btnStartY + btnSpacing * 2, 'O co chodzi?', 0x335555, showInfo);

    // Version
    const ver = this.add.text(width - 10, height - 5, 'v0.4.2 THE KARALUCH PROJECT', {
      fontSize: '6px',
      color: '#ffffff',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(1, 1);
    mainPage.add(ver);

    // Keyboard shortcuts
    this.input.keyboard!.once('keydown-SPACE', startGame);
    this.input.keyboard!.on('keydown-T', () => { scorePage.x === 0 ? hideScores() : showScores(); });
  }

  private buildScorePage(
    container: Phaser.GameObjects.Container,
    width: number,
    height: number,
  ): void {
    const title = this.add.text(width / 2, 30, 'BYCZE KARALUCHY', {
      fontSize: '16px',
      color: '#ffff00',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000',
      strokeThickness: 5,
    }).setOrigin(0.5);
    container.add(title);

    this.tweens.add({
      targets: title,
      y: title.y - 4,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const loadingText = this.add.text(width / 2, height / 2, 'Ładowanie...', {
      fontSize: '12px',
      color: '#888888',
      fontFamily: '"Press Start 2P", monospace',
    }).setOrigin(0.5);
    container.add(loadingText);

    fetchScores().then((scores) => {
      loadingText.destroy();

      if (scores.length === 0) {
        const emptyText = this.add.text(width / 2, height / 2, 'Jeszcze pusto...\nBądź pierwszy!', {
          fontSize: '14px',
          color: '#888888',
          fontFamily: '"Press Start 2P", monospace',
          align: 'center',
        }).setOrigin(0.5);
        container.add(emptyText);
        return;
      }

      const startY = 60;
      const lineHeight = 20;
      const maxVisible = Math.min(scores.length, Math.floor((height - 100) / lineHeight));

      for (let i = 0; i < maxVisible; i++) {
        const entry = scores[i];
        const rank = i + 1;
        const color = rank <= 3 ? '#ffdd00' : '#cccccc';

        const rankText = this.add.text(30, startY + i * lineHeight, `${String(rank).padStart(3, ' ')}.`, {
          fontSize: '10px',
          color,
          fontFamily: '"Press Start 2P", monospace',
        }).setOrigin(0, 0);
        container.add(rankText);

        const nameText = this.add.text(80, startY + i * lineHeight, entry.name, {
          fontSize: '10px',
          color,
          fontFamily: '"Press Start 2P", monospace',
        }).setOrigin(0, 0);
        container.add(nameText);

        const scoreText = this.add.text(width - 30, startY + i * lineHeight, String(entry.score), {
          fontSize: '10px',
          color,
          fontFamily: '"Press Start 2P", monospace',
        }).setOrigin(1, 0);
        container.add(scoreText);
      }
    });
  }

  update(): void {
    this.menuBg.tilePositionX += this.bgScrollSpeed;
  }

  private buildInfoPage(
    container: Phaser.GameObjects.Container,
    width: number,
    height: number,
    isMobile: boolean,
  ): void {
    // 2x2 grid layout
    const gap = 10;
    const zoneW = (width - gap * 3) / 2;
    const zoneH = (height - 80 - gap * 3) / 2; // 80 = back button area
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
      this.tweens.add({
        targets: t,
        y: t.y - 4,
        duration: 1200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    };

    // --- PYSZNIUTKIE (green, top-left) ---
    container.add(this.add.rectangle(left, top, zoneW, zoneH, 0x005500, 0.3));
    const pyszTitle = this.add.text(left, top - 30, 'Pyszniutkie', titleStyle('#00ff44')).setOrigin(0.5);
    container.add(pyszTitle);
    animateTitle(pyszTitle);

    const pickups = ['apple', 'tyskie', 'pill'];
    const pickupSpacing = zoneW / (pickups.length + 1);
    const pickupY = top + 25;
    pickups.forEach((key, i) => {
      const ix = left - zoneW / 2 + pickupSpacing * (i + 1);
      const icon = this.add.image(ix, pickupY, key).setScale(0.28);
      container.add(icon);
      this.tweens.add({
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
    container.add(this.add.rectangle(right, top, zoneW, zoneH, 0x550000, 0.3));
    const fujTitle = this.add.text(right, top - 30, 'Fujka', titleStyle('#ff3333')).setOrigin(0.5);
    container.add(fujTitle);
    animateTitle(fujTitle);

    const obstacles = ['onion', 'pest-spray', 'newspaper', 'flipper'];
    const obstSpacing = zoneW / (obstacles.length + 1);
    const obstY = top + 25;
    obstacles.forEach((key, i) => {
      const ix = right - zoneW / 2 + obstSpacing * (i + 1);
      const icon = this.add.image(ix, obstY, key).setScale(0.25);
      container.add(icon);
      this.tweens.add({
        targets: icon,
        y: obstY - 4,
        angle: { from: -5, to: 5 },
        duration: 800 + i * 150,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });
    const iInne = this.add.text(right, top + 60, '...i inne', {
      fontSize: '14px',
      color: '#ff6666',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);
    container.add(iInne);

    // --- STEROWANIE (cyan, bottom-left) ---
    container.add(this.add.rectangle(left, bottom, zoneW, zoneH, 0x003344, 0.3));
    const sterTitle = this.add.text(left, bottom - 30, 'Sterowanie', titleStyle('#00ccff')).setOrigin(0.5);
    container.add(sterTitle);
    animateTitle(sterTitle);

    const bindings: [string[], string][] = isMobile
      ? [
          [['Lewy ekran'], 'Zmień tor'],
          [['Prawy ekran'], 'Dash'],
          [['⏸'], 'Pauzka'],
        ]
      : [
          [['SPACJA', '↑', '↓'], 'Zmiana toru'],
          [['SHIFT', '↑>rot90'], 'Dash'],
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

      // Keys on the left side of the zone
      const keyTexts: Phaser.GameObjects.Text[] = [];
      keys.forEach((k) => {
        const rotate = k.endsWith('>rot90');
        const label = rotate ? k.replace('>rot90', '') : k;
        const kt = this.add.text(0, 0, label, keyStyle);
        if (rotate) kt.setAngle(90);
        keyTexts.push(kt);
        container.add(kt);
      });

      const keyGap = 4;
      let keysW = 0;
      keyTexts.forEach((kt, ki) => {
        keysW += kt.width;
        if (ki < keyTexts.length - 1) keysW += keyGap;
      });

      // Place keys left-aligned within zone
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

      // Description right-aligned after keys
      const descText = this.add.text(left + zoneW / 2 - 8, rowY, desc, descStyle).setOrigin(1, 0.5);
      container.add(descText);
    });

    // --- MOJE STATY (purple, bottom-right) ---
    container.add(this.add.rectangle(right, bottom, zoneW, zoneH, 0x330044, 0.3));
    const statyTitle = this.add.text(right, bottom - 30, 'Moje Staty', titleStyle('#cc66ff')).setOrigin(0.5);
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

    const stat1 = this.add.text(right, bottom, `Najlepszy: ${highScore}`, statStyle).setOrigin(0.5);
    const stat2 = this.add.text(right, bottom + 28, `Giereczki: ${gamesPlayed}`, statStyle).setOrigin(0.5);
    container.add([stat1, stat2]);
  }

  private spawnFloatingParticle(
    sceneWidth: number,
    sceneHeight: number,
    colors: number[],
  ): void {
    const color = Phaser.Utils.Array.GetRandom(colors);
    const size = Phaser.Math.Between(2, 8);
    const x = Phaser.Math.Between(0, sceneWidth);
    const y = Phaser.Math.Between(0, sceneHeight);

    const particle = this.add.circle(x, y, size, color, 0.6);
    particle.setBlendMode(Phaser.BlendModes.ADD);

    const duration = Phaser.Math.Between(3000, 7000);
    const targetX = x + Phaser.Math.Between(-100, 100);
    const targetY = y + Phaser.Math.Between(-150, -50);

    this.tweens.add({
      targets: particle,
      x: targetX,
      y: targetY,
      alpha: 0,
      duration,
      ease: 'Sine.easeIn',
      onComplete: () => {
        particle.destroy();
        this.spawnFloatingParticle(sceneWidth, sceneHeight, colors);
      },
    });
  }
}
