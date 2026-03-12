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

    // --- TITLE: "KARALUCH" with floating bob ---
    const title = this.add.text(width / 2, height / 4, 'KARALUCH', {
      fontSize: '32px',
      color: '#8b0000',
      fontFamily: '"Press Start 2P", monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.tweens.add({
      targets: title,
      y: title.y - 10,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // --- SUBTITLE with rotation oscillation ---
    const subtitle = this.add.text(width / 2, height / 4 + 45, 'Gra przegrańców', {
      fontSize: '14px',
      color: '#ff6600',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000',
      strokeThickness: 4,
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

    // --- TUTORIAL ZONES: Pyszniutkie (pickups) & Fujka (obstacles) ---
    this.setupTutorialZones(width, height);

    // High score from localStorage
    const highScore = localStorage.getItem('cockroach-highscore') || '0';
    const gamesPlayed = parseInt(localStorage.getItem('cockroach-games-played') || '0', 10);
    this.add.text(width / 2, height / 2 + 55, `Najlepsiejszy wynik: ${highScore} | Giereczki: ${gamesPlayed}`, {
      fontSize: '8px',
      color: '#ffffff',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10);

    // --- Pulsing start text ---
    const isMobile = !this.sys.game.device.os.desktop;
    const startLabel = isMobile ? 'Stuknij w ekran w celach naukowych' : 'Walnij klawisz SPACJA, aby rozpocząć wynaturzenie';
    const startText = this.add.text(width / 2, height - 110, startLabel, {
      fontSize: '12px',
      color: '#ffffff',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    this.tweens.add({
      targets: startText,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    startText.setScale(0.92);

    // --- CONTROLS DISPLAY ---
    const controlsLines = isMobile
      ? [
          '(SWAP) <- Zmień tor',
          '(DASH) <- Prędkozapierdalacz karaluszany',
          'Pauzka — Przycisk ⏸',
        ]
      : [
          'Spacja / Góra / Dół - Zmiana toru karalucha',
          'Shift / Prawo - Prędkozapierdalacz karaluszany',
          'ESC — Pauzka!',
        ];
    const controlsText = controlsLines.join('\n');
    this.add.text(width / 2, height - 45, controlsText, {
      fontSize: '7px',
      color: '#ffffff',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000',
      strokeThickness: 2,
      align: 'center',
      lineSpacing: 4,
    }).setOrigin(0.5);

    this.add
      .text(width - 10, height - 10, 'v0.4.2 THE KARALUCH PROJECT', {
        fontSize: '7px',
        color: '#ffffff',
        fontFamily: '"Press Start 2P", monospace',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(1, 1)
      .setDepth(10);

    // --- SCOREBOARD BUTTON ---
    const scoreboardBtn = this.add
      .text(width / 2, height / 2 + 75, '[ T - Najbardziej bycze karaluchy świata]', {
        fontSize: '8px',
        color: '#ffffff',
        fontFamily: '"Press Start 2P", monospace',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(10)
      .setInteractive({ useHandCursor: true });

    scoreboardBtn.on('pointerover', () => scoreboardBtn.setColor('#ffffff'));
    scoreboardBtn.on('pointerout', () => scoreboardBtn.setColor('#888888'));
    scoreboardBtn.on('pointerdown', () => toggleScoreboard(this, null));

    this.input.keyboard!.on('keydown-T', () => toggleScoreboard(this, null));

    // --- MENU MUSIC ---
    this.menuBgm = this.sound.add('menu-bgm', { volume: 0.3, loop: true });
    this.menuBgm.play();

    // Start the game
    const startGame = (): void => {
      if (this.menuBgm) {
        this.menuBgm.stop();
        this.menuBgm.destroy();
        this.menuBgm = null;
      }
      // Request fullscreen on mobile (requires user gesture)
      if (isMobile && !document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
      this.scene.start('GameScene');
    };

    this.input.keyboard!.once('keydown-SPACE', startGame);
    this.input.once('pointerdown', startGame);
  }

  update(): void {
    this.menuBg.tilePositionX += 0.05;
  }

  private setupTutorialZones(width: number, height: number): void {
    const zoneY = height / 2 - 5;
    const zoneW = width * 0.38;
    const zoneH = 70;
    const gap = 16;

    // --- PYSZNIUTKIE (green, left) ---
    const leftX = width / 2 - gap / 2 - zoneW / 2;
    this.add.rectangle(leftX, zoneY, zoneW, zoneH, 0x005500, 0.3)
      .setDepth(10);

    const pyszTitle = this.add.text(leftX, zoneY - 22, 'Pyszniutkie', {
      fontSize: '10px',
      color: '#00ff44',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000',
      strokeThickness: 4,
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
    const iconY = zoneY + 8;
    pickups.forEach((key, i) => {
      const ix = leftX - zoneW / 2 + pickupSpacing * (i + 1);
      const icon = this.add.image(ix, iconY, key).setScale(0.12).setDepth(11);
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

    const fujTitle = this.add.text(rightX, zoneY - 22, 'Fujka', {
      fontSize: '10px',
      color: '#ff3333',
      fontFamily: '"Press Start 2P", monospace',
      stroke: '#000000',
      strokeThickness: 4,
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
    obstacles.forEach((key, i) => {
      const ix = rightX - zoneW / 2 + obstSpacing * (i + 1);
      const icon = this.add.image(ix, iconY, key).setScale(0.1).setDepth(11);
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
      fontSize: '7px',
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
