import Phaser from 'phaser';
import { toggleScoreboard } from '../ui/Scoreboard';

export class MenuScene extends Phaser.Scene {
  private menuBgm: Phaser.Sound.BaseSound | null = null;

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const { width, height } = this.cameras.main;

    // Sky background as a tileSprite
    this.add.tileSprite(0, 0, width, height, 'sky').setOrigin(0, 0);

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
    const title = this.add.text(width / 2, height / 3, 'KARALUCH', {
      fontSize: '64px',
      color: '#8b0000',
      fontFamily: 'Georgia, serif',
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
    const subtitle = this.add.text(width / 2, height / 3 + 60, 'GRA PRZEGRAŃCÓW', {
      fontSize: '32px',
      color: '#ff6600',
      fontFamily: 'Georgia, serif',
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

    // --- GAME DESCRIPTION ---
    this.add.text(width / 2, height / 2 + 10, 'Zbieraj jabłuszka i piwka, uciekaj przed zagładą!', {
      fontSize: '13px',
      color: '#cc8844',
      fontFamily: 'monospace',
      fontStyle: 'italic',
    }).setOrigin(0.5).setDepth(10);

    // High score from localStorage
    const highScore = localStorage.getItem('cockroach-highscore') || '0';
    const gamesPlayed = parseInt(localStorage.getItem('cockroach-games-played') || '0', 10);
    this.add.text(width / 2, height / 2 + 35, `Najlepszy Wyńczyk: ${highScore}  |  Gierki: ${gamesPlayed}`, {
      fontSize: '14px',
      color: '#999999',
      fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(10);

    // --- Pulsing start text ---
    const isMobile = !this.sys.game.device.os.desktop;
    const startLabel = isMobile ? 'Dotknij ekran żeby Zacząść' : 'Walnij SPACJĘ żeby Zacząść';
    const startText = this.add.text(width / 2, height - 110, startLabel, {
      fontSize: '24px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: startText,
      alpha: 0,
      duration: 500,
      ease: 'Power2',
      yoyo: true,
      repeat: -1,
    });

    this.tweens.add({
      targets: startText,
      scaleX: 1.05,
      scaleY: 1.05,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    startText.setScale(0.95);

    // --- CONTROLS DISPLAY ---
    const controlsLines = isMobile
      ? [
          'Dotknij ekran — Zmień tor',
          'Przycisk DASH — Dasherówka!',
          'Przycisk ⏸ — Pauzka!',
        ]
      : [
          'SPACJA / GÓRA — Skocz na górę',
          'CTRL / DÓŁ — Spadaj na dół',
          'SHIFT / PRAWO — Dasherówka!',
          'ESC — Pauzka!',
        ];
    const controlsText = controlsLines.join('\n');
    this.add.text(width / 2, height - 45, controlsText, {
      fontSize: '12px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
      align: 'center',
      lineSpacing: 4,
    }).setOrigin(0.5);

    this.add
      .text(width - 10, height - 10, 'v0.3.0 KARALUCH', {
        fontSize: '10px',
        color: '#444444',
        fontFamily: 'monospace',
      })
      .setOrigin(1, 1)
      .setDepth(10);

    // --- SCOREBOARD BUTTON ---
    const scoreboardBtn = this.add
      .text(width / 2, height / 2 + 65, '[ T — Tablica Wyników ]', {
        fontSize: '14px',
        color: '#888888',
        fontFamily: 'monospace',
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
      this.scene.start('GameScene');
    };

    this.input.keyboard!.once('keydown-SPACE', startGame);
    this.input.once('pointerdown', startGame);
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
