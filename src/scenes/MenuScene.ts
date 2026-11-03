import Phaser from 'phaser';
import { ATLAS, ROACH_FEET_OFFSET, SPRITE_SCALE, frameOf } from '../config/sprites';
import { DEPTH } from '../config/constants';
import { titleStyle, bodyStyle, smallStyle, buttonStyle, UI_TEXT } from '../utils/TextStyles';
import { createSceneBackground } from '../ui/SceneBackground';
import { createButton, UIButton } from '../ui/shared';
import { MenuNav } from '../ui/MenuNav';
import { addContactShadow } from '../effects/ContactShadow';
import { sceneManager } from '../systems/SceneManager';
import { getPlayerNameOrDefault, isPlayerNameCustom } from '../utils/Storage';
import { showNameInput } from '../ui/NameInputOverlay';
import { mpClient } from '../multiplayer/MultiplayerClient';
import { account, loadAccount, renameAccount, signIn, signInAvailable, signOut, submitScore, takePendingScore, takeSignInResult } from '../ui/Account';
import { buildInfoPage } from './menu/infoPage';
import { buildScorePage } from './menu/scorePage';
import { buildSettingsPage, type SettingsPage } from './menu/settingsPage';

const PAGE_MS = 400;
const DRIFT = 0.4;
const DRIFT_RUSH = 14;

const BTN_W = 300;
const BTN_H = 40;
const BTN_GAP = 48;
const BACK_W = 220;
const BACK_H = 36;
/** Clear of the longest name (20 characters). */
const NAME_BTN_OFFSET = 160;

export class MenuScene extends Phaser.Scene {
  private bgScroll = { speed: DRIFT };
  private scoreCleanups: (() => void)[] = [];

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const { width, height } = this.cameras.main;
    const cx = Math.round(width / 2);

    const { setScrollSpeed } = createSceneBackground(this, { level: 1, scrollSpeed: DRIFT });
    this.bgScroll.speed = DRIFT;
    const syncScroll = (): void => setScrollSpeed(this.bgScroll.speed);
    this.events.on('update', syncScroll);

    const isMobile = !this.sys.game.device.os.desktop;
    const nav = new MenuNav(this);

    const mainPage = this.add.container(0, 0).setDepth(DEPTH.MENU_PAGE);

    // --- Title, and the roach running on the spot under it ---
    const title = this.add.text(cx, 62, 'KARALUCH', titleStyle({
      fontSize: '40px',
      color: UI_TEXT.bone,
      strokeThickness: 8,
      shadow: { offsetX: 0, offsetY: 5, color: '#5a0d0d', blur: 0, fill: true, stroke: true },
    })).setOrigin(0.5);
    const subtitle = this.add.text(cx, 104, 'Gra przegrańców', bodyStyle({
      fontSize: '11px',
      color: UI_TEXT.amber,
    })).setOrigin(0.5);
    mainPage.add([title, subtitle]);

    const roachFeetY = 192;
    const shadow = addContactShadow(this, cx, roachFeetY, 104).setDepth(0);
    const roach = this.add.sprite(cx, roachFeetY - ROACH_FEET_OFFSET, ATLAS, frameOf('roach-run')).setScale(SPRITE_SCALE);
    roach.play('roach-run');
    mainPage.add([shadow, roach]);

    // --- Name: shows who you are, and changes it ---
    const nameText = this.add.text(cx, 216, getPlayerNameOrDefault(), bodyStyle({
      fontSize: '10px',
      color: isPlayerNameCustom() ? UI_TEXT.named : UI_TEXT.bone,
    })).setOrigin(0.5);
    mainPage.add(nameText);

    // --- Buttons ---
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

    const btnS = buttonStyle({ fontSize: '11px', strokeThickness: 3 });
    const firstY = 262;
    const mainButtons: UIButton[] = [];
    const addBtn = (label: string, color: number, action: () => void): UIButton => {
      const button = createButton(this, cx, firstY + mainButtons.length * BTN_GAP, BTN_W, BTN_H, label, color, btnS, action);
      mainPage.add(button.all);
      mainButtons.push(button);
      return button;
    };

    // A short line in the footer for what just happened: signed in, score saved, rename failed
    const toast = this.add.text(cx, height - 14, '', smallStyle({ fontSize: '8px', color: UI_TEXT.amber, strokeThickness: 3 }))
      .setOrigin(0.5).setAlpha(0);
    mainPage.add(toast);
    const say = (message: string, color: string = UI_TEXT.amber): void => {
      this.tweens.killTweensOf(toast);
      toast.setText(message).setColor(color).setAlpha(1);
      this.tweens.add({ targets: toast, alpha: 0, delay: 3500, duration: 500 });
    };

    const changeName = (): void => {
      nav.enabled = false;
      showNameInput(this, (newName) => {
        nameText.setText(newName).setColor(UI_TEXT.named);
        // Signed in, the name is the account's: on the board too
        if (account()) {
          void renameAccount(newName).then((ok) => { if (!ok) say('Nie udało się zmienić nazwy', '#e07a6a'); });
        }
      }, account()?.name, () => { nav.enabled = true; });
    };

    // Pages slide in from the side they're named for; the world rushes the other way
    const rush = (direction: number): void => {
      this.tweens.add({
        targets: this.bgScroll, speed: DRIFT_RUSH * direction, duration: PAGE_MS / 2, ease: 'Power2',
        onComplete: () => { this.tweens.add({ targets: this.bgScroll, speed: DRIFT, duration: PAGE_MS / 2, ease: 'Power2' }); },
      });
    };
    const slide = (page: Phaser.GameObjects.Container, prop: 'x' | 'y', to: number, mainTo: number): void => {
      this.tweens.add({ targets: mainPage, [prop]: mainTo, duration: PAGE_MS, ease: 'Power2' });
      this.tweens.add({ targets: page, [prop]: to, duration: PAGE_MS, ease: 'Power2' });
    };
    const backButton = (page: Phaser.GameObjects.Container, label: string, onBack: () => void): UIButton => {
      const back = createButton(this, cx, height - 40, BACK_W, BACK_H, label, 0x444444, buttonStyle({ fontSize: '10px' }), onBack);
      page.add(back.all);
      return back;
    };
    const backToMain = (from: UIButton): void => nav.set(mainButtons, { initial: from, onBack: undefined });

    // Scores, to the left
    const scorePage = this.add.container(-width, 0).setDepth(DEPTH.MENU_PAGE);
    let scoresBtn: UIButton;
    const showScores = (): void => {
      this.scoreCleanups.forEach(fn => fn());
      scorePage.removeAll(true);
      this.scoreCleanups = buildScorePage(this, scorePage, width, height);
      const back = backButton(scorePage, 'Powrót', hideScores);
      nav.set([back], { onBack: hideScores });
      slide(scorePage, 'x', 0, width);
      rush(-1);
    };
    const hideScores = (): void => {
      slide(scorePage, 'x', -width, 0);
      rush(1);
      backToMain(scoresBtn);
    };

    // Info, to the right
    const infoPage = this.add.container(width, 0).setDepth(DEPTH.MENU_PAGE);
    let infoBack: UIButton | null = null;
    let infoBtn: UIButton;
    const showInfo = (): void => {
      if (!infoBack) {
        buildInfoPage(this, infoPage, width, height, isMobile);
        infoBack = backButton(infoPage, 'Powrót', hideInfo);
      }
      nav.set([infoBack], { onBack: hideInfo });
      slide(infoPage, 'x', 0, -width);
      rush(1);
    };
    const hideInfo = (): void => {
      slide(infoPage, 'x', width, 0);
      rush(-1);
      backToMain(infoBtn);
    };

    // Settings, from below
    const settingsPage = this.add.container(0, height).setDepth(DEPTH.MENU_PAGE);
    let settings: SettingsPage | null = null;
    let settingsButtons: UIButton[] = [];
    let settingsBtn: UIButton;
    const showSettings = (): void => {
      if (!settings) {
        settings = buildSettingsPage(this, settingsPage, width, height, () => {
          refreshAccount();
          say('Konto usunięte razem z wynikami');
        });
        settingsButtons = [...settings.buttons, backButton(settingsPage, 'Powrót', hideSettings)];
      }
      settings.refresh();
      nav.set(settingsButtons, { onBack: hideSettings });
      slide(settingsPage, 'y', 0, -height);
    };
    const hideSettings = (): void => {
      slide(settingsPage, 'y', height, 0);
      backToMain(settingsBtn);
    };

    const soloBtn = addBtn('Jeden Karaluch', 0x880000, startGame);
    addBtn('Zjazd Karaluchów', 0x006688, () => sceneManager.goto(this, 'MultiplayerMenuScene'));
    scoresBtn = addBtn('Bycze Karaluchy', 0x664400, showScores);
    infoBtn = addBtn('O co chodzi?', 0x335555, showInfo);
    settingsBtn = addBtn('Ustawienia', 0x444444, showSettings);

    // The name button sits beside the name, not in the column, so the column stays about playing
    const nameBtn = createButton(this, cx + NAME_BTN_OFFSET, 216, 72, 22, 'Zmień', 0x444444, smallStyle({ fontSize: '7px' }), changeName);
    mainPage.add(nameBtn.all);
    mainButtons.unshift(nameBtn);

    // Signing in, on the other side of the name. Guests play everything; the board needs an account
    const accountBtn = createButton(this, cx - NAME_BTN_OFFSET, 216, 96, 22, 'Zaloguj', 0x2f8a3a, smallStyle({ fontSize: '7px' }), () => {
      if (!account()) { signIn(); return; }
      void signOut().then(() => { refreshAccount(); say('Wylogowano'); });
    });
    mainPage.add(accountBtn.all);
    mainButtons.unshift(accountBtn);

    const refreshAccount = (): void => {
      const user = account();
      nameText.setText(user?.name ?? getPlayerNameOrDefault()).setColor(user || isPlayerNameCustom() ? UI_TEXT.named : UI_TEXT.bone);
      accountBtn.setLabel(user ? 'Wyloguj' : 'Zaloguj');
      accountBtn.setColor(user ? 0x444444 : 0x2f8a3a);
      const shown = !!user || signInAvailable();
      accountBtn.setEnabled(shown);
      accountBtn.all.forEach(o => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(shown));
    };
    refreshAccount();

    nav.set(mainButtons, { initial: soloBtn });

    // Back from Google: say how it went, and save the score that sent the player there
    const signInResult = takeSignInResult();
    const pending = takePendingScore();
    void loadAccount().then(async (user) => {
      if (!this.scene.isActive()) return;
      refreshAccount();
      if (signInResult === 'failed') { say('Nie udało się zalogować', '#e07a6a'); return; }
      if (!user) return;
      if (pending) {
        const saved = await submitScore(pending);
        if (this.scene.isActive()) say(saved ? `Zapisano wynik: ${pending.score}` : 'Nie udało się zapisać wyniku', saved ? UI_TEXT.named : '#e07a6a');
      } else if (signInResult === 'ok') {
        say(`Zalogowano jako ${user.name}`, UI_TEXT.named);
      }
    });

    // --- Footer ---
    const footerY = height - 14;
    const hint = this.add.text(16, footerY, isMobile ? '' : 'Strzałki: wybór   Enter: wejście   Esc: powrót', smallStyle({
      fontSize: '7px', color: UI_TEXT.muted, strokeThickness: 2,
    })).setOrigin(0, 0.5);
    const ver = this.add.text(width - 16, footerY, 'v0.5 THE KARALUCH PROJECT', smallStyle({
      fontSize: '6px', color: UI_TEXT.muted, strokeThickness: 2,
    })).setOrigin(1, 0.5);
    mainPage.add([hint, ver]);

    this.input.keyboard!.on('keydown-T', () => { scorePage.x === 0 ? hideScores() : showScores(); });

    this.events.once('shutdown', () => {
      this.events.off('update', syncScroll);
      this.scoreCleanups = [];
    });
  }
}
