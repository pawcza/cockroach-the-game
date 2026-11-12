import Phaser from 'phaser';
import { ATLAS, ROACH_FEET_OFFSET, SPRITE_SCALE, frameOf } from '../config/sprites';
import { DEPTH } from '../config/constants';
import { titleStyle, bodyStyle, smallStyle, buttonStyle, UI_TEXT } from '../utils/TextStyles';
import { createSceneBackground } from '../ui/SceneBackground';
import { createButton, UIButton } from '../ui/shared';
import { MenuNav } from '../ui/MenuNav';
import { addContactShadow } from '../effects/ContactShadow';
import { sceneManager } from '../systems/SceneManager';
import { getPlayerNameOrDefault, isPlayerNameCustom, getDailyBest, setTutorialDone } from '../utils/Storage';
import { showNameInput } from '../ui/NameInputOverlay';
import { mpClient } from '../multiplayer/MultiplayerClient';
import { account, loadAccount, renameAccount, signIn, signInAvailable, signOut, submitScore, takePendingScore, takeSignInResult } from '../ui/Account';
import { buildInfoPage } from './menu/infoPage';
import { buildScorePage } from './menu/scorePage';
import { buildSettingsPage, type SettingsPage } from './menu/settingsPage';
import { dailyStanding, fetchDaily, fetchScores, type DailyRun } from '../ui/Scoreboard';
import { buildPrivacyPage } from './menu/privacyPage';
import { syncProfile } from '../systems/Profile';
import { buildProfilePage } from './menu/profilePage';
import { dress, roachAnim, type Look, type Worn } from '../config/skins';
import { loadShop, myLook } from '../ui/Shop';
import { buildWardrobePage, type WardrobePage } from './menu/wardrobePage';
import { buildMissionsPanel } from './menu/missionsPanel';

const PAGE_MS = 400;
const DRIFT = 0.4;
const DRIFT_RUSH = 14;

const MENU_W = 470;
const MENU_GAP = 8;
const PLAY_Y = 286;
const MODES_Y = 352;
const MORE_Y = 414;
const TAB_W = 170;
const MISSIONS_TOP = 200;
/** Narrower than this (a 4:3 screen), the menu has no room for the missions panel: they stay in Szafa. */
const MISSIONS_MIN_W = 180;
const HELP_W = 40;
const TAB_STEP = 180;
const BACK_W = 220;
const BACK_H = 36;
/** Clear of the longest name (20 characters). */
const NAME_BTN_OFFSET = 160;
const GOOGLE_BTN_OFFSET = 186;

export class MenuScene extends Phaser.Scene {
  private bgScroll = { speed: DRIFT };
  private scoreCleanups: (() => void)[] = [];
  private privacyCleanup: (() => void) | null = null;

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
    // Your roach, in what it wears
    let roachWorn: Worn[] = [];
    const dressRoach = (look: Look): void => {
      roach.play(roachAnim('run', look), true);
      roachWorn.forEach(item => item.destroy());
      roachWorn = dress(this, roach, look);
    };

    // --- Name: shows who you are, and changes it ---
    const nameText = this.add.text(cx, 216, getPlayerNameOrDefault(), bodyStyle({
      fontSize: '10px',
      color: isPlayerNameCustom() ? UI_TEXT.named : UI_TEXT.bone,
    })).setOrigin(0.5);
    mainPage.add(nameText);

    // --- Buttons ---
    let startingGame = false;
    const startGame = (daily?: DailyRun): void => {
      if (startingGame) return;
      startingGame = true;
      if (isMobile && !document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
      sceneManager.goto(this, 'GameScene', { multiplayer: false, daily }, () => {
        mpClient.disconnect();
      });
    };

    // The day's run comes from the server, so everyone's day and seed agree whatever their clocks say
    const startDaily = (): void => {
      if (startingGame) return;
      void fetchDaily().then((daily) => {
        if (!this.scene.isActive()) return;
        if (daily) startGame(daily);
        else say('Karaluch Dnia potrzebuje internetu', '#e07a6a');
      });
    };

    // Three rows, most important first: play, the other ways to play, then the rest. The arrows move across the grid
    const mainButtons: UIButton[] = [];
    const addBtn = (
      label: string, color: number, action: () => void,
      x: number, y: number, w: number, h: number, fontSize: string, sub?: string,
    ): UIButton => {
      const button = createButton(this, x, y, w, h, label, color, buttonStyle({ fontSize, strokeThickness: 3 }), action, { sub });
      mainPage.add(button.all);
      mainButtons.push(button);
      return button;
    };
    /** x of the button `i` of `n` across the column, with `w` its width. */
    const across = (i: number, n: number): { x: number; w: number } => {
      const w = (MENU_W - MENU_GAP * (n - 1)) / n;
      return { x: cx - MENU_W / 2 + w / 2 + i * (w + MENU_GAP), w };
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
      const back = createButton(this, cx, height - 40, BACK_W, BACK_H, label, 0x444444, buttonStyle({ fontSize: '10px' }), onBack, { sound: 'back' });
      page.add(back.all);
      return back;
    };
    const backToMain = (from: UIButton): void => nav.set(mainButtons, { initial: from, onBack: undefined });

    // Scores, to the left
    const scorePage = this.add.container(-width, 0).setDepth(DEPTH.MENU_PAGE);
    let scoresBtn: UIButton;
    // Three tabs, which are the page's title too: the all-time board, today's Karaluch Dnia, and your own profile
    type Board = 'all' | 'daily' | 'me';
    let board: Board = 'all';
    const showScores = (next: Board = board): void => {
      const opening = scorePage.x !== 0;
      board = next;
      this.scoreCleanups.forEach(fn => fn());
      scorePage.removeAll(true);
      if (next === 'me') {
        buildProfilePage(this, scorePage, width, height);
        this.scoreCleanups = [];
      } else {
        this.scoreCleanups = buildScorePage(this, scorePage, width, height, next === 'daily');
      }
      const tabs: [string, Board][] = [['Wszech czasów', 'all'], ['Dzisiaj', 'daily'], ['Moje', 'me']];
      const tabButtons = tabs.map(([label, which], i) => {
        const button = createButton(this, cx + (i - 1) * TAB_STEP, 26, TAB_W, 28, label, which === next ? 0xe8c15a : 0x444444,
          smallStyle({ fontSize: '7px' }), () => { if (which !== board) showScores(which); });
        scorePage.add(button.all);
        return button;
      });
      const back = backButton(scorePage, 'Powrót', hideScores);
      nav.set([...tabButtons, back], { initial: opening ? back : tabButtons[tabs.findIndex(t => t[1] === next)], onBack: hideScores });
      if (opening) {
        slide(scorePage, 'x', 0, width);
        rush(-1);
      }
    };
    const hideScores = (): void => {
      slide(scorePage, 'x', -width, 0);
      rush(1);
      backToMain(scoresBtn);
    };

    // Info, to the right
    const infoPage = this.add.container(width, 0).setDepth(DEPTH.MENU_PAGE);
    let infoBack: UIButton | null = null;
    let infoTutorial: UIButton | null = null;
    let infoBtn: UIButton;
    const showInfo = (): void => {
      if (!infoBack) {
        // "Samouczek" clears the flag, so the run it starts opens with the lesson (and quitting it halfway keeps it due)
        infoTutorial = buildInfoPage(this, infoPage, width, height, isMobile, () => { setTutorialDone(false); startGame(); });
        infoBack = backButton(infoPage, 'Powrót', hideInfo);
      }
      nav.set([infoBack, infoTutorial!], { initial: infoBack, onBack: hideInfo });
      slide(infoPage, 'x', 0, -width);
      rush(1);
    };
    const hideInfo = (): void => {
      slide(infoPage, 'x', width, 0);
      rush(-1);
      backToMain(infoBtn);
    };

    // Szafa, from the right like the help
    const wardrobePage = this.add.container(width, 0).setDepth(DEPTH.MENU_PAGE);
    let wardrobe: WardrobePage | null = null;
    let wardrobeButtons: UIButton[] = [];
    let wardrobeBtn: UIButton;
    let wardrobeBack: UIButton | null = null;
    const showWardrobe = (): void => {
      if (!wardrobe) {
        wardrobeBack = backButton(wardrobePage, 'Powrót', hideWardrobe);
        wardrobe = buildWardrobePage(this, wardrobePage, width, height, dressRoach, (buttons, initial) => {
          wardrobeButtons = [...buttons, wardrobeBack!];
          nav.set(wardrobeButtons, { initial, onBack: hideWardrobe });
        });
      }
      wardrobe.refresh();
      nav.set(wardrobeButtons, { onBack: hideWardrobe });
      slide(wardrobePage, 'x', 0, -width);
      rush(1);
    };
    const hideWardrobe = (): void => {
      slide(wardrobePage, 'x', width, 0);
      rush(-1);
      backToMain(wardrobeBtn);
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
        }, showPrivacy);
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

    // Privacy, from below again, over the settings it was opened from
    const privacyPage = this.add.container(0, height).setDepth(DEPTH.MENU_PAGE);
    let privacyBack: UIButton | null = null;
    const swapPages = (privacyTo: number, settingsTo: number): void => {
      this.tweens.add({ targets: privacyPage, y: privacyTo, duration: PAGE_MS, ease: 'Power2' });
      this.tweens.add({ targets: settingsPage, y: settingsTo, duration: PAGE_MS, ease: 'Power2' });
    };
    const showPrivacy = (): void => {
      if (!privacyBack) {
        this.privacyCleanup = buildPrivacyPage(this, privacyPage, width, height);
        privacyBack = backButton(privacyPage, 'Powrót', hidePrivacy);
      }
      nav.set([privacyBack], { onBack: hidePrivacy });
      swapPages(0, -height);
    };
    const hidePrivacy = (): void => {
      swapPages(height, 0);
      nav.set(settingsButtons, { initial: settings?.buttons[2], onBack: hideSettings });
    };

    const soloBtn = addBtn('Jeden Karaluch', 0x880000, () => startGame(), cx, PLAY_Y, MENU_W, 46, '16px');

    // Today's missions to the left of the buttons, where the screen is wide enough (most are: it widens, never heightens)
    const missionsRight = cx - MENU_W / 2 - 16;
    const refreshMissions = missionsRight - 12 >= MISSIONS_MIN_W
      ? buildMissionsPanel(this, mainPage, 12, MISSIONS_TOP, missionsRight - 12)
      : () => {};
    refreshMissions();
    // Each mode says a word about itself: today's standing for Karaluch Dnia
    const modes: [string, number, () => void, string][] = [
      ['Karaluch Dnia', 0xb8860b, startDaily, 'Ten sam bieg dla wszystkich'],
      ['Zjazd Karaluchów', 0x006688, () => sceneManager.goto(this, 'MultiplayerMenuScene'), 'Gra ze znajomymi'],
    ];
    const [dailyBtn] = modes.map(([label, color, action, sub], i) => {
      const { x, w } = across(i, modes.length);
      return addBtn(label, color, action, x, MODES_Y, w, 56, '11px', sub);
    });
    const refreshDaily = (): void => {
      void fetchDaily().then(async (day) => {
        if (!day) return;
        const board = await fetchScores(day.date);
        if (this.scene.isActive()) dailyBtn.setSub?.(dailyStanding(board, account(), getDailyBest(day.date)));
      });
    };
    // The rest, and a small "?" for how to play at the end of the row
    const more: [string, number, () => void][] = [
      ['Bycze Karaluchy', 0x664400, () => showScores('all')],
      ['Szafa', 0x8a5a9a, showWardrobe],
      ['Ustawienia', 0x444444, showSettings],
    ];
    const moreW = (MENU_W - HELP_W - MENU_GAP * more.length) / more.length;
    [scoresBtn, wardrobeBtn, settingsBtn] = more.map(([label, color, action], i) =>
      addBtn(label, color, action, cx - MENU_W / 2 + moreW / 2 + i * (moreW + MENU_GAP), MORE_Y, moreW, 36, '8px'));
    infoBtn = addBtn('?', 0x335555, showInfo, cx + MENU_W / 2 - HELP_W / 2, MORE_Y, HELP_W, 36, '8px');

    // The name button sits beside the name, not in the column, so the column stays about playing
    const nameBtn = createButton(this, cx + NAME_BTN_OFFSET, 216, 72, 26, 'Zmień', 0x444444, smallStyle({ fontSize: '7px' }), changeName);
    mainPage.add(nameBtn.all);
    mainButtons.unshift(nameBtn);

    // Signing in, on the other side of the name. Guests play everything; the board needs an account. Signing in
    // uses Google's button colours and G, which its branding rules ask for; signing out is an ordinary button
    const signInBtn = createButton(this, cx - GOOGLE_BTN_OFFSET, 216, 200, 26, 'Zaloguj przez Google', 0, smallStyle({ fontSize: '7px' }), signIn, { google: true });
    const signOutBtn = createButton(this, cx - NAME_BTN_OFFSET, 216, 96, 26, 'Wyloguj', 0x444444, smallStyle({ fontSize: '7px' }), () => {
      void signOut().then(() => {
        refreshAccount();
        nav.focus(signInBtn.enabled ? signInBtn : soloBtn);
        say('Wylogowano');
      });
    });
    mainPage.add([...signInBtn.all, ...signOutBtn.all]);
    // Both stay in the arrow order; the hidden one is disabled, so the arrows skip it
    mainButtons.unshift(signInBtn, signOutBtn);

    const refreshAccount = (): void => {
      const user = account();
      nameText.setText(user?.name ?? getPlayerNameOrDefault()).setColor(user || isPlayerNameCustom() ? UI_TEXT.named : UI_TEXT.bone);
      const shown = user ? signOutBtn : signInAvailable() ? signInBtn : null;
      for (const button of [signInBtn, signOutBtn]) {
        button.setEnabled(button === shown);
        button.all.forEach(o => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(button === shown));
      }
    };
    refreshAccount();

    nav.set(mainButtons, { initial: soloBtn });

    // Back from Google: say how it went, and save the score that sent the player there
    const signInResult = takeSignInResult();
    const pending = takePendingScore();
    void loadAccount().then(async (user) => {
      if (!this.scene.isActive()) return;
      refreshAccount();
      // Signed in: your stats and achievements follow you from your account, and your roach wears what you bought
      if (user) {
        // The sync pays achievements earned as a guest, so the shop is read after it
        await syncProfile();
        await loadShop();
        if (!this.scene.isActive()) return;
        dressRoach(myLook());
        wardrobe?.refresh();
        refreshMissions();
      }
      if (signInResult === 'failed') say('Nie udało się zalogować', '#e07a6a');
      else if (user && pending) {
        const saved = await submitScore(pending);
        if (this.scene.isActive()) say(saved ? `Zapisano wynik: ${pending.score}` : 'Nie udało się zapisać wyniku', saved ? UI_TEXT.named : '#e07a6a');
      } else if (user && signInResult === 'ok') {
        say(`Zalogowano jako ${user.name}`, UI_TEXT.named);
      }
      // Once it's known who you are, and anything parked is saved
      refreshDaily();
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
      this.privacyCleanup?.();
      this.privacyCleanup = null;
      this.events.off('update', syncScroll);
      this.scoreCleanups = [];
    });
  }
}
