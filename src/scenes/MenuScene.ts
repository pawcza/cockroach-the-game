import Phaser from 'phaser';
import { toggleScoreboard } from '../ui/Scoreboard';

export class MenuScene extends Phaser.Scene {
  private menuBgm: Phaser.Sound.BaseSound | null = null;
  private menuBg!: Phaser.GameObjects.TileSprite;

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
    const s = isMobile ? 1.5 : 1; // mobile scale factor

    // --- LAYOUT: 3 sections, fixed positions ---
    const sec1Y = 120;  // title area top
    const sec2Y = 220;  // buttons top
    const sec3Y = 310;  // zones top

    // --- SECTION 1: KARALUCH title + subtitle ---
    const title = this.add.text(width / 2, sec1Y + 20, 'KARALUCH', {
      fontSize: `${Math.round(32 * s)}px`,
      color: '#8b0000',
      fontFamily: '"Press Start 2P", monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6 * s,
    }).setOrigin(0.5);

    this.tweens.add({
      targets: title,
      y: title.y - 10,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const subtitle = this.add.text(width / 2, sec1Y + 65 * s, 'Gra przegra\u0144c\u00f3w', {
      fontSize: `${Math.round(14 * s)}px`,
      color: '#ff6600',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000',
      strokeThickness: 4 * s,
    }).setOrigin(0.5);

    this.tweens.add({
      targets: subtitle,
      angle: 3,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    subtitle.setAngle(-3);

    // --- SECTION 2: Action buttons ---
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

    const btnY = sec2Y + 25;
    const btnW = Math.round(170 * s);
    const btnH = Math.round(44 * s);
    const btnGap = Math.round(95 * s);
    const btnStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: `${Math.round(14 * s)}px`,
      fontFamily: '"Press Start 2P", monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4 * s,
      align: 'center',
    };

    const playBg = this.add.rectangle(width / 2 - btnGap, btnY, btnW, btnH, 0x880000, 0.9)
      .setDepth(10).setInteractive({ useHandCursor: true });
    const playLabel = this.add.text(width / 2 - btnGap, btnY, 'GRAJ', btnStyle)
      .setOrigin(0.5).setDepth(11);
    playBg.on('pointerover', () => { playBg.setFillStyle(0xbb0000, 1); playLabel.setColor('#ffff00'); });
    playBg.on('pointerout', () => { playBg.setFillStyle(0x880000, 0.9); playLabel.setColor('#ffffff'); });
    playBg.on('pointerdown', startGame);

    this.tweens.add({
      targets: playBg,
      alpha: { from: 0.85, to: 1 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const scoreBg = this.add.rectangle(width / 2 + btnGap, btnY, btnW, btnH, 0x664400, 0.9)
      .setDepth(10).setInteractive({ useHandCursor: true });
    const scoreLabel = this.add.text(width / 2 + btnGap, btnY, 'Bycze Karaluchy', { ...btnStyle, fontSize: `${Math.round(8 * s)}px` })
      .setOrigin(0.5).setDepth(11);
    scoreBg.on('pointerover', () => { scoreBg.setFillStyle(0x886600, 1); scoreLabel.setColor('#ffff00'); });
    scoreBg.on('pointerout', () => { scoreBg.setFillStyle(0x664400, 0.9); scoreLabel.setColor('#ffffff'); });
    scoreBg.on('pointerdown', () => toggleScoreboard(this, null));

    this.input.keyboard!.once('keydown-SPACE', startGame);
    this.input.keyboard!.on('keydown-T', () => toggleScoreboard(this, null));

    // --- SECTION 3: 4 info zones (2x2) ---
    this.setupTutorialZones(width, sec3Y, s);
    this.setupBottomZones(width, sec3Y + Math.round(80 * s), isMobile, s);

    this.add
      .text(width - 10, height - 5, 'v0.4.2 THE KARALUCH PROJECT', {
        fontSize: `${Math.round(6 * s)}px`,
        color: '#ffffff',
        fontFamily: '"Press Start 2P", monospace',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(1, 1)
      .setDepth(10);
  }

  update(): void {
    this.menuBg.tilePositionX += 0.05;
  }

  private setupBottomZones(width: number, zoneY: number, isMobile: boolean, s: number): void {
    const zoneW = width * 0.38;
    const zoneH = Math.round(60 * s);
    const gap = 16;

    // --- STEROWANIE (cyan, left) ---
    const leftX = width / 2 - gap / 2 - zoneW / 2;
    this.add.rectangle(leftX, zoneY, zoneW, zoneH, 0x003344, 0.3).setDepth(10);

    const sterTitle = this.add.text(leftX, zoneY - Math.round(18 * s), 'Sterowanie', {
      fontSize: `${Math.round(10 * s)}px`,
      color: '#00ccff',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000',
      strokeThickness: 4 * s,
    }).setOrigin(0.5).setDepth(11);

    this.tweens.add({
      targets: sterTitle,
      y: sterTitle.y - 4,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Key bindings
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

    const segW = zoneW / bindings.length;
    const keysStartX = leftX - zoneW / 2 + segW / 2;
    const keysY = zoneY + 2;

    const keyStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: `${Math.round(7 * s)}px`,
      fontFamily: '"Press Start 2P", monospace',
      color: '#111111',
      backgroundColor: '#e8e8e8',
      padding: { x: Math.round(4 * s), y: Math.round(3 * s) },
    };

    const descStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: `${Math.round(5 * s)}px`,
      fontFamily: '"Press Start 2P", monospace',
      color: '#88ccdd',
      stroke: '#000000',
      strokeThickness: 1,
    };

    bindings.forEach(([keys, desc], i) => {
      const cx = keysStartX + i * segW;

      const keyTexts: Phaser.GameObjects.Text[] = [];
      keys.forEach((k) => {
        const rotate = k.endsWith('>rot90');
        const label = rotate ? k.replace('>rot90', '') : k;
        const kt = this.add.text(0, 0, label, keyStyle).setDepth(11);
        if (rotate) kt.setAngle(90);
        keyTexts.push(kt);
      });

      const keyGap = Math.round(3 * s);
      let keysW = 0;
      keyTexts.forEach((kt, ki) => {
        keysW += kt.width;
        if (ki < keyTexts.length - 1) keysW += keyGap;
      });

      let kx = cx - keysW / 2;
      keyTexts.forEach((kt) => {
        if (kt.angle !== 0) {
          kt.setOrigin(0.5, 0.5);
          kt.setPosition(kx + kt.width / 2, keysY);
        } else {
          kt.setPosition(kx, keysY);
          kt.setOrigin(0, 0.5);
        }
        kx += kt.width + keyGap;
      });

      this.add.text(cx, keysY + Math.round(12 * s), desc, descStyle)
        .setOrigin(0.5, 0).setDepth(11);
    });

    // --- MOJE STATY (purple, right) ---
    const rightX = width / 2 + gap / 2 + zoneW / 2;
    this.add.rectangle(rightX, zoneY, zoneW, zoneH, 0x330044, 0.3).setDepth(10);

    const statyTitle = this.add.text(rightX, zoneY - Math.round(18 * s), 'Moje Staty', {
      fontSize: `${Math.round(10 * s)}px`,
      color: '#cc66ff',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000',
      strokeThickness: 4 * s,
    }).setOrigin(0.5).setDepth(11);

    this.tweens.add({
      targets: statyTitle,
      y: statyTitle.y - 4,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const highScore = localStorage.getItem('cockroach-highscore') || '0';
    const gamesPlayed = parseInt(localStorage.getItem('cockroach-games-played') || '0', 10);

    const statStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: `${Math.round(7 * s)}px`,
      fontFamily: '"Press Start 2P", monospace',
      color: '#ddaaff',
      stroke: '#000000',
      strokeThickness: 2,
    };

    this.add.text(rightX, zoneY + 0, `Najlepszy: ${highScore}`, statStyle)
      .setOrigin(0.5).setDepth(11);
    this.add.text(rightX, zoneY + Math.round(16 * s), `Giereczki: ${gamesPlayed}`, statStyle)
      .setOrigin(0.5).setDepth(11);
  }

  private setupTutorialZones(width: number, zoneY: number, s: number): void {
    const zoneW = width * 0.38;
    const zoneH = Math.round(70 * s);
    const gap = 16;

    // --- PYSZNIUTKIE (green, left) ---
    const leftX = width / 2 - gap / 2 - zoneW / 2;
    this.add.rectangle(leftX, zoneY, zoneW, zoneH, 0x005500, 0.3)
      .setDepth(10);

    const pyszTitle = this.add.text(leftX, zoneY - Math.round(22 * s), 'Pyszniutkie', {
      fontSize: `${Math.round(10 * s)}px`,
      color: '#00ff44',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000',
      strokeThickness: 4 * s,
    }).setOrigin(0.5).setDepth(11);

    this.tweens.add({
      targets: pyszTitle,
      y: pyszTitle.y - 4,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Pickup icons
    const pickups = ['apple', 'tyskie', 'pill'];
    const pickupSpacing = zoneW / (pickups.length + 1);
    const iconY = zoneY + Math.round(8 * s);
    const iconScale = 0.12 * s;
    pickups.forEach((key, i) => {
      const ix = leftX - zoneW / 2 + pickupSpacing * (i + 1);
      const icon = this.add.image(ix, iconY, key).setScale(iconScale).setDepth(11);
      this.tweens.add({
        targets: icon,
        y: iconY - 3,
        angle: { from: -5, to: 5 },
        duration: 800 + i * 200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });

    // --- FUJKA (red, right) ---
    const rightX = width / 2 + gap / 2 + zoneW / 2;
    this.add.rectangle(rightX, zoneY, zoneW, zoneH, 0x550000, 0.3)
      .setDepth(10);

    const fujTitle = this.add.text(rightX, zoneY - Math.round(22 * s), 'Fujka', {
      fontSize: `${Math.round(10 * s)}px`,
      color: '#ff3333',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000',
      strokeThickness: 4 * s,
    }).setOrigin(0.5).setDepth(11);

    this.tweens.add({
      targets: fujTitle,
      y: fujTitle.y - 4,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Obstacle icons (only early-game ones to avoid spoilers)
    const obstacles = ['onion', 'pest-spray', 'newspaper', 'flipper'];
    const obstSpacing = zoneW / (obstacles.length + 2);
    const obstScale = 0.1 * s;
    obstacles.forEach((key, i) => {
      const ix = rightX - zoneW / 2 + obstSpacing * (i + 1);
      const icon = this.add.image(ix, iconY, key).setScale(obstScale).setDepth(11);
      this.tweens.add({
        targets: icon,
        y: iconY - 3,
        angle: { from: -5, to: 5 },
        duration: 800 + i * 150,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });
    this.add.text(rightX - zoneW / 2 + obstSpacing * (obstacles.length + 1), iconY, '...i inne', {
      fontSize: `${Math.round(7 * s)}px`,
      color: '#ff6666',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(11);
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
