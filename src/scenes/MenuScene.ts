import Phaser from 'phaser';
import { startFloatingParticles } from '../ui/SceneBackground';
import { ScorePage } from '../ui/ScorePage';
import { InfoPage } from '../ui/InfoPage';

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
    startFloatingParticles(this, width, height, 14);

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

    // --- MENU MUSIC (skip if already playing from a previous visit) ---
    const existingBgm = this.sound.getAll('menu-bgm').find(s => s.isPlaying);
    if (existingBgm) {
      this.menuBgm = existingBgm;
    } else {
      this.menuBgm = this.sound.add('menu-bgm', { volume: 0.3, loop: true });
      this.menuBgm.play();
    }

    let startingGame = false;
    const startGame = (): void => {
      if (startingGame) return;
      startingGame = true;
      if (isMobile && !document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }

      // HTML overlay for reliable cross-scene fade
      const fade = document.createElement('div');
      fade.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#000;opacity:0;transition:opacity 0.5s;pointer-events:none;';
      document.body.appendChild(fade);

      // Force reflow then fade in the black overlay
      fade.offsetHeight;
      fade.style.opacity = '1';

      if (this.menuBgm) {
        this.tweens.add({
          targets: this.menuBgm,
          volume: 0,
          duration: 500,
        });
      }

      setTimeout(() => {
        if (this.menuBgm) {
          this.menuBgm.stop();
          this.menuBgm.destroy();
          this.menuBgm = null;
        }
        this.scene.start('GameScene');

        // Fade out the overlay to reveal the game
        requestAnimationFrame(() => {
          fade.style.opacity = '0';
          fade.addEventListener('transitionend', () => fade.remove());
        });
      }, 500);
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
    const btnStartY = 240;
    const btnSpacing = 46;

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

    createBtn(btnStartY, 'Jeden Karaluch', 0x880000, startGame);

    // Pulsing on "Jeden Karaluch" button
    const soloBtn = mainPage.list[mainPage.list.length - 2] as Phaser.GameObjects.Rectangle;
    this.tweens.add({
      targets: soloBtn,
      alpha: { from: 0.85, to: 1 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    createBtn(btnStartY + btnSpacing, 'Zjazd Karaluch\u00f3w', 0x006688, () => {
      this.scene.start('MultiplayerMenuScene');
    });

    // --- Scoreboard page ---
    const scorePage = new ScorePage(this, width, height);

    const showScores = (): void => {
      scorePage.rebuild(hideScores);
      this.tweens.add({ targets: mainPage, x: width, duration: 400, ease: 'Power2' });
      this.tweens.add({ targets: scorePage.getContainer(), x: 0, duration: 400, ease: 'Power2' });
      this.tweens.add({ targets: this, bgScrollSpeed: -6, duration: 200, ease: 'Power2',
        onComplete: () => {
          this.tweens.add({ targets: this, bgScrollSpeed: 0.05, duration: 200, ease: 'Power2' });
        },
      });
    };

    const hideScores = (): void => {
      this.tweens.add({ targets: mainPage, x: 0, duration: 400, ease: 'Power2' });
      this.tweens.add({ targets: scorePage.getContainer(), x: -width, duration: 400, ease: 'Power2' });
      this.tweens.add({ targets: this, bgScrollSpeed: 6, duration: 200, ease: 'Power2',
        onComplete: () => {
          this.tweens.add({ targets: this, bgScrollSpeed: 0.05, duration: 200, ease: 'Power2' });
        },
      });
    };

    createBtn(btnStartY + btnSpacing * 2, 'Bycze Karaluchy', 0x664400, showScores);

    // --- Info page ---
    const infoPage = new InfoPage(this, width, height);

    const showInfo = (): void => {
      infoPage.ensureBuilt(hideInfo);
      this.tweens.add({ targets: mainPage, x: -width, duration: 400, ease: 'Power2' });
      this.tweens.add({ targets: infoPage.getContainer(), x: 0, duration: 400, ease: 'Power2' });
      this.tweens.add({ targets: this, bgScrollSpeed: 6, duration: 200, ease: 'Power2',
        onComplete: () => {
          this.tweens.add({ targets: this, bgScrollSpeed: 0.05, duration: 200, ease: 'Power2' });
        },
      });
    };

    const hideInfo = (): void => {
      this.tweens.add({ targets: mainPage, x: 0, duration: 400, ease: 'Power2' });
      this.tweens.add({ targets: infoPage.getContainer(), x: width, duration: 400, ease: 'Power2' });
      this.tweens.add({ targets: this, bgScrollSpeed: -6, duration: 200, ease: 'Power2',
        onComplete: () => {
          this.tweens.add({ targets: this, bgScrollSpeed: 0.05, duration: 200, ease: 'Power2' });
        },
      });
    };

    createBtn(btnStartY + btnSpacing * 3, 'O co chodzi?', 0x335555, showInfo);

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
    this.input.keyboard!.on('keydown-T', () => { scorePage.getContainer().x === 0 ? hideScores() : showScores(); });
  }

  update(): void {
    this.menuBg.tilePositionX += this.bgScrollSpeed;
  }
}
