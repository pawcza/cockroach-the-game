import Phaser from 'phaser';
import { fetchScores } from '../ui/Scoreboard';
import { titleStyle, headingStyle, bodyStyle, smallStyle, buttonStyle, FONT_FAMILY } from '../utils/TextStyles';
import { floatUpDown } from '../utils/TweenPatterns';
import { createSceneBackground } from '../ui/SceneBackground';
import { createButton } from '../ui/shared';
import { sceneManager } from '../systems/SceneManager';
import { getHighScore, getGamesPlayed, getPlayerNameOrDefault, isPlayerNameCustom, getMusicVolume, setMusicVolume, getSfxVolume, setSfxVolume } from '../utils/Storage';
import { getLevelForDistance } from '../config/levels';
import { showNameInput } from '../ui/NameInputOverlay';
import { mpClient } from '../multiplayer/MultiplayerClient';

export class MenuScene extends Phaser.Scene {
  private bgScroll = { speed: 0.05 };
  private scoreCleanups: (() => void)[] = [];
  private sliderMoveHandlers: ((pointer: Phaser.Input.Pointer) => void)[] = [];
  private sliderUpHandlers: (() => void)[] = [];

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
    this.events.on('update', () => setScrollSpeed(this.bgScroll.speed));

    const isMobile = !this.sys.game.device.os.desktop;

    // --- Main page container ---
    const mainPage = this.add.container(0, 0).setDepth(10);

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
    const scorePage = this.add.container(-width, 0).setDepth(10);
    const showScores = (): void => {
      // Clean up previous score page resources
      this.scoreCleanups.forEach(fn => fn());
      this.scoreCleanups = [];
      scorePage.removeAll(true);
      this.buildScorePage(scorePage, width, height);
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
    const infoPage = this.add.container(width, 0).setDepth(10);
    let infoBuilt = false;

    const showInfo = (): void => {
      if (!infoBuilt) {
        this.buildInfoPage(infoPage, width, height, isMobile);
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
    const settingsPage = this.add.container(0, height).setDepth(10);
    let settingsBuilt = false;

    const showSettings = (): void => {
      if (!settingsBuilt) {
        this.buildSettingsPage(settingsPage, width, height);
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

    this.events.on('shutdown', () => {
      for (const h of this.sliderMoveHandlers) this.input.off('pointermove', h);
      for (const h of this.sliderUpHandlers) this.input.off('pointerup', h);
      this.sliderMoveHandlers = [];
      this.sliderUpHandlers = [];
    });
  }

  private buildScorePage(
    container: Phaser.GameObjects.Container,
    width: number,
    height: number,
  ): void {
    const title = this.add.text(width / 2, 30, 'BYCZE KARALUCHY', headingStyle()).setOrigin(0.5);
    container.add(title);

    floatUpDown(this, title, 4, 1200);

    const loadingText = this.add.text(width / 2, height / 2, '\u0141adowanie...', bodyStyle({ color: '#888888' })).setOrigin(0.5);
    container.add(loadingText);

    fetchScores().then((scores) => {
      loadingText.destroy();

      if (scores.length === 0) {
        const emptyText = this.add.text(width / 2, height / 2, 'Jeszcze pusto...\nB\u0105d\u017a pierwszy!', bodyStyle({
          fontSize: '14px',
          color: '#888888',
          align: 'center',
        })).setOrigin(0.5);
        container.add(emptyText);
        return;
      }

      // Column layout: rank | name | lv | time | dist | combo | apple | beer | pill | score
      const colRank = 15;
      const colName = 50;
      const colLv = width * 0.32;
      const colTime = width * 0.39;
      const colDist = width * 0.46;
      const colCombo = width * 0.53;
      const colApple = width * 0.60;
      const colBeer = width * 0.67;
      const colPill = width * 0.74;
      const colScore = width - 15;
      const iconScale = 0.10;

      // Fixed header row (outside scroll area)
      const headerY = 60;
      const headerStyle: Phaser.Types.GameObjects.Text.TextStyle = {
        fontSize: '7px', color: '#666666', fontFamily: FONT_FAMILY,
        stroke: '#000000', strokeThickness: 1,
      };
      container.add(this.add.text(colLv, headerY, 'Lv', headerStyle).setOrigin(0.5, 0.5));
      container.add(this.add.text(colTime, headerY, 'Czas', headerStyle).setOrigin(0.5, 0.5));
      container.add(this.add.text(colDist, headerY, 'Dyst', headerStyle).setOrigin(0.5, 0.5));
      container.add(this.add.text(colCombo, headerY, 'Kmb', headerStyle).setOrigin(0.5, 0.5));
      if (this.textures.exists('apple')) {
        container.add(this.add.image(colApple, headerY, 'apple').setScale(iconScale).setOrigin(0.5, 0.5));
      }
      if (this.textures.exists('beer-1')) {
        container.add(this.add.image(colBeer, headerY, 'beer-1').setScale(iconScale).setOrigin(0.5, 0.5));
      }
      if (this.textures.exists('pill')) {
        container.add(this.add.image(colPill, headerY, 'pill').setScale(iconScale).setOrigin(0.5, 0.5));
      }
      container.add(this.add.text(colScore, headerY, 'PKT', headerStyle).setOrigin(1, 0.5));

      // Scrollable list container (below header)
      const listTop = 78;
      const listBottom = height - 70;
      const lineHeight = 26;
      const scrollContainer = this.add.container(0, 0);
      container.add(scrollContainer);

      // Mask so entries don't overflow
      const maskShape = this.make.graphics({});
      maskShape.fillRect(0, listTop, width, listBottom - listTop);
      scrollContainer.setMask(new Phaser.Display.Masks.GeometryMask(this, maskShape));

      const timeEvents: Phaser.Time.TimerEvent[] = [];
      const dataStartY = listTop + 4;

      for (let i = 0; i < scores.length; i++) {
        const entry = scores[i];
        const rank = i + 1;
        const y = dataStartY + i * lineHeight;

        let color: string;
        let fontSize: string;
        let strokeThickness: number;

        if (rank === 1) {
          color = '#ff0000';
          fontSize = '16px';
          strokeThickness = 5;
        } else if (rank === 2) {
          color = '#ff6600';
          fontSize = '14px';
          strokeThickness = 4;
        } else if (rank === 3) {
          color = '#ffdd00';
          fontSize = '13px';
          strokeThickness = 3;
        } else {
          color = '#cccccc';
          fontSize = '11px';
          strokeThickness = 2;
        }

        const style: Phaser.Types.GameObjects.Text.TextStyle = {
          fontSize,
          color,
          fontFamily: FONT_FAMILY,
          stroke: '#000000',
          strokeThickness,
        };

        const smallStatStyle: Phaser.Types.GameObjects.Text.TextStyle = {
          fontSize: rank <= 3 ? '10px' : '9px',
          color,
          fontFamily: FONT_FAMILY,
          stroke: '#000000',
          strokeThickness: Math.max(1, strokeThickness - 1),
        };

        const rankText = this.add.text(colRank, y, `${rank}.`, style).setOrigin(0, 0);
        const nameText = this.add.text(colName, y, entry.name, style).setOrigin(0, 0);
        const displayLevel = entry.max_level ?? (entry.distance != null ? getLevelForDistance(entry.distance).level : null);
        const lvText = this.add.text(colLv, y, displayLevel != null ? String(displayLevel) : '-', smallStatStyle).setOrigin(0.5, 0);
        const timeText = this.add.text(colTime, y, entry.time_survived != null ? `${entry.time_survived}s` : '-', smallStatStyle).setOrigin(0.5, 0);
        const distText = this.add.text(colDist, y, entry.distance != null ? `${Math.floor(entry.distance)}` : '-', smallStatStyle).setOrigin(0.5, 0);
        const comboText = this.add.text(colCombo, y, entry.max_combo != null ? `x${entry.max_combo}` : '-', smallStatStyle).setOrigin(0.5, 0);
        const appleText = this.add.text(colApple, y, entry.apples_collected != null ? String(entry.apples_collected) : '-', smallStatStyle).setOrigin(0.5, 0);
        const beerText = this.add.text(colBeer, y, entry.tyskies_collected != null ? String(entry.tyskies_collected) : '-', smallStatStyle).setOrigin(0.5, 0);
        const pillText = this.add.text(colPill, y, entry.pills_collected != null ? String(entry.pills_collected) : '-', smallStatStyle).setOrigin(0.5, 0);
        const scoreText = this.add.text(colScore, y, String(entry.score), style).setOrigin(1, 0);
        scrollContainer.add([rankText, nameText, lvText, timeText, distText, comboText, appleText, beerText, pillText, scoreText]);

        // Top 3 effects — constrained wobble for rank 1
        if (rank === 1) {
          const elements = [rankText, nameText, lvText, timeText, distText, comboText, appleText, beerText, pillText, scoreText];
          const colors = ['#ff0000', '#ff00ff', '#ffff00', '#00ffff', '#ff6600'];
          let ci = 0;
          timeEvents.push(this.time.addEvent({
            delay: 150,
            loop: true,
            callback: () => {
              ci = (ci + 1) % colors.length;
              elements.forEach(el => el.setColor(colors[ci]));
            },
          }));
          this.tweens.add({
            targets: elements,
            scaleX: { from: 1, to: 1.05 },
            scaleY: { from: 1, to: 1.05 },
            duration: 600,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        } else if (rank === 2) {
          const elements = [rankText, nameText, lvText, timeText, distText, comboText, appleText, beerText, pillText, scoreText];
          this.tweens.add({
            targets: elements,
            alpha: { from: 0.7, to: 1 },
            duration: 600,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        } else if (rank === 3) {
          const elements = [rankText, nameText, lvText, timeText, distText, comboText, appleText, beerText, pillText, scoreText];
          this.tweens.add({
            targets: elements,
            alpha: { from: 0.8, to: 1 },
            duration: 1000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        }
      }

      // Scroll with mouse wheel / touch drag
      const totalHeight = 16 + scores.length * lineHeight;
      const viewHeight = listBottom - listTop;
      let scrollY = 0;
      const maxScroll = Math.max(0, totalHeight - viewHeight);

      // Register cleanups for time events and mask
      this.scoreCleanups.push(
        () => timeEvents.forEach(te => te.destroy()),
        () => maskShape.destroy(),
      );

      if (maxScroll > 0) {
        const wheelHandler = (_pointer: Phaser.Input.Pointer, _gos: unknown[], _dx: number, dy: number): void => {
          scrollY = Phaser.Math.Clamp(scrollY + dy * 0.5, 0, maxScroll);
          scrollContainer.y = -scrollY;
        };
        this.input.on('wheel', wheelHandler);
        this.scoreCleanups.push(() => this.input.off('wheel', wheelHandler));

        // Touch drag scrolling
        let dragStartY = 0;
        let dragScrollStart = 0;
        const hitZone = this.add.rectangle(width / 2, listTop + viewHeight / 2, width, viewHeight, 0x000000, 0)
          .setInteractive();
        container.add(hitZone);

        hitZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
          dragStartY = pointer.y;
          dragScrollStart = scrollY;
        });

        hitZone.on('pointermove', (pointer: Phaser.Input.Pointer) => {
          if (!pointer.isDown) return;
          const delta = dragStartY - pointer.y;
          scrollY = Phaser.Math.Clamp(dragScrollStart + delta, 0, maxScroll);
          scrollContainer.y = -scrollY;
        });
      }
    });
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
      floatUpDown(this, t, 4, 1200);
    };

    // --- PYSZNIUTKIE (green, top-left) ---
    container.add(this.add.rectangle(left, top, zoneW, zoneH, 0x005500, 0.3));
    const pyszTitle = this.add.text(left, top - 30, 'Pyszniutkie', zoneTitleStyle('#00ff44')).setOrigin(0.5);
    container.add(pyszTitle);
    animateTitle(pyszTitle);

    const pickups = ['apple', 'beer-1', 'pill'];
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
    const fujTitle = this.add.text(right, top - 30, 'Fujka', zoneTitleStyle('#ff3333')).setOrigin(0.5);
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
    const iInne = this.add.text(right, top + 60, '...i inne', bodyStyle({
      fontSize: '14px',
      color: '#ff6666',
      strokeThickness: 4,
    })).setOrigin(0.5);
    container.add(iInne);

    // --- STEROWANIE (cyan, bottom-left) ---
    container.add(this.add.rectangle(left, bottom, zoneW, zoneH, 0x003344, 0.3));
    const sterTitle = this.add.text(left, bottom - 30, 'Sterowanie', zoneTitleStyle('#00ccff')).setOrigin(0.5);
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

    const keyStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: '13px',
      fontFamily: FONT_FAMILY,
      color: '#111111',
      backgroundColor: '#e8e8e8',
      padding: { x: 6, y: 5 },
    };

    const descStyle: Phaser.Types.GameObjects.Text.TextStyle = smallStyle({
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
        const kt = this.add.text(0, 0, label, keyStyle);
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

      const descText = this.add.text(left + zoneW / 2 - 8, rowY, desc, descStyle).setOrigin(1, 0.5);
      container.add(descText);
    });

    // --- MOJE STATY (purple, bottom-right) ---
    container.add(this.add.rectangle(right, bottom, zoneW, zoneH, 0x330044, 0.3));
    const statyTitle = this.add.text(right, bottom - 30, 'Moje Staty', zoneTitleStyle('#cc66ff')).setOrigin(0.5);
    container.add(statyTitle);
    animateTitle(statyTitle);

    const highScore = String(getHighScore());
    const gamesPlayed = getGamesPlayed();

    const statStyle = bodyStyle({
      fontSize: '14px',
      color: '#ddaaff',
      strokeThickness: 4,
    });

    const stat1 = this.add.text(right, bottom, `Najlepszy: ${highScore}`, statStyle).setOrigin(0.5);
    const stat2 = this.add.text(right, bottom + 28, `Giereczki: ${gamesPlayed}`, statStyle).setOrigin(0.5);
    container.add([stat1, stat2]);
  }

  private buildSettingsPage(
    container: Phaser.GameObjects.Container,
    width: number,
    height: number,
  ): void {
    const title = this.add.text(width / 2, 40, 'USTAWIENIA', headingStyle({ fontSize: '20px' })).setOrigin(0.5);
    container.add(title);
    floatUpDown(this, title, 4, 1200);

    const sliderW = 260;
    const sliderH = 8;
    const sliderX = width / 2 - sliderW / 2;
    const labelStyle = bodyStyle({ fontSize: '10px', color: '#cccccc', strokeThickness: 3 });
    const valStyle = smallStyle({ fontSize: '8px', color: '#ffff00', strokeThickness: 2 });

    const createSlider = (
      y: number,
      label: string,
      getValue: () => number,
      setValue: (v: number) => void,
      onPreview?: (v: number) => void,
    ): void => {
      const labelText = this.add.text(width / 2, y, label, labelStyle).setOrigin(0.5);
      container.add(labelText);

      const barY = y + 25;
      const bar = this.add.graphics();
      bar.fillStyle(0x333333, 1);
      bar.fillRoundedRect(sliderX, barY, sliderW, sliderH, 4);
      container.add(bar);

      const fillBar = this.add.graphics();
      container.add(fillBar);

      const pct = Math.round(getValue() * 100);
      const valText = this.add.text(width / 2 + sliderW / 2 + 25, barY + sliderH / 2, `${pct}%`, valStyle).setOrigin(0, 0.5);
      container.add(valText);

      const knobR = 10;
      const knobX = sliderX + getValue() * sliderW;
      const knob = this.add.circle(knobX, barY + sliderH / 2, knobR, 0xffffff, 1);
      container.add(knob);

      const drawFill = (val: number): void => {
        fillBar.clear();
        fillBar.fillStyle(0x888800, 1);
        fillBar.fillRoundedRect(sliderX, barY, val * sliderW, sliderH, 4);
      };
      drawFill(getValue());

      // Hit zone — covers bar + knob area for click and drag
      const hitZone = this.add.rectangle(sliderX + sliderW / 2, barY + sliderH / 2, sliderW + knobR * 4, sliderH + knobR * 4, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      container.add(hitZone);

      let dragging = false;

      const updateFromX = (px: number): void => {
        const val = Phaser.Math.Clamp((px - sliderX) / sliderW, 0, 1);
        knob.x = sliderX + val * sliderW;
        drawFill(val);
        valText.setText(`${Math.round(val * 100)}%`);
        setValue(val);
        onPreview?.(val);
      };

      hitZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        dragging = true;
        updateFromX(pointer.x);
      });

      const moveHandler = (pointer: Phaser.Input.Pointer): void => {
        if (dragging && pointer.isDown) updateFromX(pointer.x);
      };
      const upHandler = (): void => { dragging = false; };

      this.input.on('pointermove', moveHandler);
      this.input.on('pointerup', upHandler);
      this.sliderMoveHandlers.push(moveHandler);
      this.sliderUpHandlers.push(upHandler);
    };

    const startY = height / 2 - 60;

    createSlider(startY, 'Muzyka', getMusicVolume, setMusicVolume, (v) => {
      // Live preview: adjust currently playing BGM
      const bgm = this.sound.getAll('menu-bgm').find(s => s.isPlaying);
      if (bgm) (bgm as Phaser.Sound.WebAudioSound).setVolume(0.3 * v);
    });

    createSlider(startY + 80, 'Efekty', getSfxVolume, setSfxVolume);
  }
}
