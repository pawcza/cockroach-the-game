import Phaser from 'phaser';
import { DEPTH } from '../config/constants';
import { titleStyle, bodyStyle, smallStyle, buttonStyle } from '../utils/TextStyles';
import { floatUpDown } from '../utils/TweenPatterns';
import { createSceneBackground } from '../ui/SceneBackground';
import { createButton } from '../ui/shared';
import { sceneManager } from '../systems/SceneManager';
import { getPlayerNameOrDefault, isPlayerNameCustom } from '../utils/Storage';
import { showNameInput } from '../ui/NameInputOverlay';
import { mpClient } from '../multiplayer/MultiplayerClient';
import { buildInfoPage } from './menu/infoPage';
import { buildScorePage } from './menu/scorePage';
import { buildSettingsPage } from './menu/settingsPage';

export class MenuScene extends Phaser.Scene {
  private bgScroll = { speed: 0.05 };
  private scoreCleanups: (() => void)[] = [];

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const { width, height } = this.cameras.main;

    // Menu background with all effects (scrolling, lighting, overlays, vignette)
    const { setScrollSpeed } = createSceneBackground(this, {
      textureKey: 'menu-bg',
      lighting: { colors: [0xffcc66, 0xff8844, 0xffaa22, 0xffddaa, 0xdd6622] },
    });
    // Wire up bgScroll proxy so page-transition tweens can target bgScroll.speed
    this.bgScroll.speed = 0.05;
    const syncScroll = (): void => setScrollSpeed(this.bgScroll.speed);
    this.events.on('update', syncScroll);

    const isMobile = !this.sys.game.device.os.desktop;

    // --- Main page container ---
    const mainPage = this.add.container(0, 0).setDepth(DEPTH.MENU_PAGE);

    // --- TITLE ---
    const title = this.add.text(width / 2, 140, 'KARALUCH', titleStyle({
      fontSize: '32px',
      color: '#8b0000',
    })).setOrigin(0.5);
    mainPage.add(title);

    floatUpDown(this, title, 10, 1500);

    const subtitle = this.add.text(width / 2, 185, 'Gra przegra\u0144c\u00f3w', bodyStyle({
      fontSize: '14px',
      color: '#ff6600',
      strokeThickness: 4,
    })).setOrigin(0.5);
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

    let startingGame = false;
    const startGame = (): void => {
      if (startingGame) return;
      startingGame = true;
      if (isMobile && !document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
      sceneManager.goto(this, 'GameScene', { multiplayer: false }, () => {
        mpClient.disconnect();
      });
    };

    // --- COCKROACH + PLAYER NAME (centered) ---
    const cockroachImg = this.add.image(width / 2, 225, 'cockroach-idle');
    cockroachImg.setScale(0.35).setOrigin(0.5);
    mainPage.add(cockroachImg);

    // Walking animation — alternate idle/running frames
    let cockroachFrame = false;
    this.time.addEvent({
      delay: 200,
      loop: true,
      callback: () => {
        cockroachFrame = !cockroachFrame;
        cockroachImg.setTexture(cockroachFrame ? 'cockroach-running' : 'cockroach-idle');
      },
    });

    const playerName = getPlayerNameOrDefault();
    const nameText = this.add.text(width / 2, 255, playerName, bodyStyle({
      fontSize: '12px',
      color: isPlayerNameCustom() ? '#00ff66' : '#ffffff',
      strokeThickness: 3,
    })).setOrigin(0.5);
    mainPage.add(nameText);

    // Hint when name is not customized
    const hintText = this.add.text(width / 2, 272, 'Nazwij mnie', smallStyle({
      fontSize: '7px',
      color: '#888888',
      strokeThickness: 2,
    })).setOrigin(0.5).setVisible(!isPlayerNameCustom());
    mainPage.add(hintText);

    // "Zmień" button — positioned to the right of the centered block
    const changeNameBtn = createButton(this, width / 2 + 120, 255, 80, 22, 'Zmień', 0x444444, smallStyle({ fontSize: '7px' }), () => {
      showNameInput(this, (newName) => {
        nameText.setText(newName);
        nameText.setColor('#00ff66');
        hintText.setVisible(false);
      });
    });
    mainPage.add(changeNameBtn.all);

    // --- BUTTONS vertically stacked ---
    const btnS = buttonStyle({ fontSize: '11px', strokeThickness: 3 });
    const btnW = 260;
    const btnH = 38;
    const btnStartY = 310;
    const btnSpacing = 46;

    const addBtn = (y: number, label: string, color: number, action: () => void): { bg: Phaser.GameObjects.Graphics; txt: Phaser.GameObjects.Text } => {
      const { bg, txt, all } = createButton(this, width / 2, y, btnW, btnH, label, color, btnS, action);
      mainPage.add(all);
      return { bg, txt };
    };

    const { bg: soloBtn } = addBtn(btnStartY, 'Jeden Karaluch', 0x880000, startGame);

    // Pulsing on "Jeden Karaluch" button
    this.tweens.add({
      targets: soloBtn,
      alpha: { from: 0.85, to: 1 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    addBtn(btnStartY + btnSpacing, 'Zjazd Karaluch\u00f3w', 0x006688, () => {
      sceneManager.goto(this, 'MultiplayerMenuScene');
    });

    // --- Scoreboard page container (off-screen to the left) ---
    const scorePage = this.add.container(-width, 0).setDepth(DEPTH.MENU_PAGE);
    const showScores = (): void => {
      // Clean up previous score page resources
      this.scoreCleanups.forEach(fn => fn());
      this.scoreCleanups = [];
      scorePage.removeAll(true);
      this.scoreCleanups = buildScorePage(this, scorePage, width, height);
      const scoreBack = createButton(this, width / 2, height - 40, 200, 36, 'Powr\u00f3t \u2192', 0x444444, buttonStyle({ fontSize: '10px' }), hideScores);
      scorePage.add(scoreBack.all);
      this.tweens.add({ targets: mainPage, x: width, duration: 400, ease: 'Power2' });
      this.tweens.add({ targets: scorePage, x: 0, duration: 400, ease: 'Power2' });
      this.tweens.add({ targets: this.bgScroll, speed: -6, duration: 200, ease: 'Power2',
        onComplete: () => {
          this.tweens.add({ targets: this.bgScroll, speed: 0.05, duration: 200, ease: 'Power2' });
        },
      });
    };

    const hideScores = (): void => {
      this.tweens.add({ targets: mainPage, x: 0, duration: 400, ease: 'Power2' });
      this.tweens.add({ targets: scorePage, x: -width, duration: 400, ease: 'Power2' });
      this.tweens.add({ targets: this.bgScroll, speed: 6, duration: 200, ease: 'Power2',
        onComplete: () => {
          this.tweens.add({ targets: this.bgScroll, speed: 0.05, duration: 200, ease: 'Power2' });
        },
      });
    };

    addBtn(btnStartY + btnSpacing * 2, 'Bycze Karaluchy', 0x664400, showScores);

    // --- Info page container (off-screen to the right) ---
    const infoPage = this.add.container(width, 0).setDepth(DEPTH.MENU_PAGE);
    let infoBuilt = false;

    const showInfo = (): void => {
      if (!infoBuilt) {
        buildInfoPage(this, infoPage, width, height, isMobile);
        // Back button
        const infoBack = createButton(this, width / 2, height - 40, 200, 36, '\u2190 Powr\u00f3t', 0x444444, buttonStyle({ fontSize: '10px' }), hideInfo);
        infoPage.add(infoBack.all);
        infoBuilt = true;
      }
      this.tweens.add({ targets: mainPage, x: -width, duration: 400, ease: 'Power2' });
      this.tweens.add({ targets: infoPage, x: 0, duration: 400, ease: 'Power2' });
      this.tweens.add({ targets: this.bgScroll, speed: 6, duration: 200, ease: 'Power2',
        onComplete: () => {
          this.tweens.add({ targets: this.bgScroll, speed: 0.05, duration: 200, ease: 'Power2' });
        },
      });
    };

    const hideInfo = (): void => {
      this.tweens.add({ targets: mainPage, x: 0, duration: 400, ease: 'Power2' });
      this.tweens.add({ targets: infoPage, x: width, duration: 400, ease: 'Power2' });
      this.tweens.add({ targets: this.bgScroll, speed: -6, duration: 200, ease: 'Power2',
        onComplete: () => {
          this.tweens.add({ targets: this.bgScroll, speed: 0.05, duration: 200, ease: 'Power2' });
        },
      });
    };

    addBtn(btnStartY + btnSpacing * 3, 'O co chodzi?', 0x335555, showInfo);

    // --- Settings page container (off-screen below) ---
    const settingsPage = this.add.container(0, height).setDepth(DEPTH.MENU_PAGE);
    let settingsBuilt = false;

    const showSettings = (): void => {
      if (!settingsBuilt) {
        buildSettingsPage(this, settingsPage, width, height);
        const settingsBack = createButton(this, width / 2, height - 40, 200, 36, '\u2191 Powr\u00f3t', 0x444444, buttonStyle({ fontSize: '10px' }), hideSettings);
        settingsPage.add(settingsBack.all);
        settingsBuilt = true;
      }
      this.tweens.add({ targets: mainPage, y: -height, duration: 400, ease: 'Power2' });
      this.tweens.add({ targets: settingsPage, y: 0, duration: 400, ease: 'Power2' });
    };

    const hideSettings = (): void => {
      this.tweens.add({ targets: mainPage, y: 0, duration: 400, ease: 'Power2' });
      this.tweens.add({ targets: settingsPage, y: height, duration: 400, ease: 'Power2' });
    };

    // Gear icon top-right
    const gear = this.add.text(width - 45, 50, '\u2699', {
      fontSize: '32px', color: '#888888',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    gear.on('pointerover', () => gear.setColor('#ffffff'));
    gear.on('pointerout', () => gear.setColor('#888888'));
    gear.on('pointerdown', () => { settingsPage.y === 0 ? hideSettings() : showSettings(); });
    mainPage.add(gear);

    // Version
    const ver = this.add.text(width - 10, height - 5, 'v0.4.2 THE KARALUCH PROJECT', smallStyle({
      fontSize: '6px',
      color: '#ffffff',
    })).setOrigin(1, 1);
    mainPage.add(ver);

    // Keyboard shortcuts
    this.input.keyboard!.once('keydown-SPACE', startGame);
    this.input.keyboard!.on('keydown-T', () => { scorePage.x === 0 ? hideScores() : showScores(); });

    this.events.once('shutdown', () => {
      this.events.off('update', syncScroll);
      this.scoreCleanups = [];
    });
  }
}
