import Phaser from 'phaser';
import { ATLAS, ROACH_FEET_OFFSET, SPRITE_SCALE, frameOf } from '../config/sprites';
import { DEPTH } from '../config/constants';
import { titleStyle, bodyStyle, smallStyle, buttonStyle, UI_TEXT } from '../utils/TextStyles';
import { createSceneBackground } from '../ui/SceneBackground';
import { createButton, showAchievement, UIButton } from '../ui/shared';
import { MenuNav } from '../ui/MenuNav';
import { addPageHeader, addTabs, contentArea, EDGE, GAP, TAB_H, TOUCH_MIN, type Tabs } from '../ui/kit';
import type { ScrollList } from '../ui/ScrollList';
import { addContactShadow } from '../effects/ContactShadow';
import { sceneManager } from '../systems/SceneManager';
import { getPlayerNameOrDefault, isPlayerNameCustom, getDailyBest, setTutorialDone, isTutorialDone, getStartCheckpoint, setStartCheckpoint } from '../utils/Storage';
import { showNameInput } from '../ui/NameInputOverlay';
import { mpClient } from '../multiplayer/MultiplayerClient';
import { account, loadAccount, renameAccount, signIn, signInAvailable, signOut, takeReturnNotice, takeSignInResult } from '../ui/Account';
import { buildInfoPage, type InfoPage } from './menu/infoPage';
import { buildScorePage } from './menu/scorePage';
import { buildSettingsPage, VERSION_LINE, type SettingsPage } from './menu/settingsPage';
import { dailyStanding, fetchDaily, fetchScores, type DailyRun } from '../ui/Scoreboard';
import { buildPrivacyPage } from './menu/privacyPage';
import { achievementsUnseen, checkpointsUnlocked, markAchievementsSeen, syncProfile, takeNotices } from '../systems/Profile';
import { allowedStart, ENDLESS_NAME, FROM_START_LABEL, unlockedCheckpoints } from '../systems/checkpoints';
import { buildAchievementsPage } from './menu/achievementsPage';
import { buildStatsPage } from './menu/statsPage';
import { dress, roachAnim, type Look, type Worn } from '../config/skins';
import { loadShop, myLook } from '../ui/Shop';
import { buildWardrobePage, type WardrobePage } from './menu/wardrobePage';
import { buildMissionsCard, missionsAvailable, missionsSummary } from './menu/missionsCard';
import { packs } from './DeferredLoadScene';
import { withShopSkin } from '../systems/PackLoader';

const PAGE_MS = 400;
const DRIFT = 0.4;
const DRIFT_RUSH = 14;

/** The column of ways to play: Jeden Karaluch, the two modes under it, then the missions. */
const COL_W = 470;
const PLAY_H = 64;
const PLAY_H_NARROW = 56;
const MODES_H = 56;
const CARD_GAP = 16;
/** With a checkpoint unlocked, the play row makes room for the button that picks where the run starts. */
const START_W = 112;
/** From this wide the title and roach stand left of the column; narrower, everything is one column. */
const WIDE_FROM = 860;
const HERO_W = 300;
const HERO_GAP = 40;
/** The dock: six square tiles across the bottom, each named under its face. Its middle is this far above the bottom. */
const TILE = 56;
const DOCK_STEP = 96;
const DOCK_FROM_BOTTOM = 76;
/** The column ends this far above the dock's tiles. */
const DOCK_CLEAR = 16;
const FOOTER_FROM_BOTTOM = 12;
/** In the narrow layout, the missions are one row that opens them in a card over the menu, or, for a guest, signs in. */
const MISSIONS_ROW_H = TOUCH_MIN;
/**
 * The title's parts, down from its middle: the subtitle, the roach's feet (the roach standing in ROACH_ROOM for each
 * time the game's size it is drawn at) and the name under it. Wide, the roach is twice the game's size: on the grid.
 */
const SUBTITLE_DROP = { wide: 46, narrow: 40 };
const ROACH_ROOM = 84;
const NAME_UNDER_FEET = 24;
/** From the title's top to its middle, and from the name's middle to its bottom, for centring the lot. */
const HERO_ABOVE = 33;
const HERO_BELOW = 8;

/**
 * What the sign-in redirect said and the way back to a run left for the menu, each read once per page load and kept
 * until a menu has actually said it: a width re-layout builds the menu again while the first build's answers are
 * still on their way, and that build is gone by the time they arrive.
 */
let heldSignIn: 'ok' | 'failed' | null = null;
let heldNotice: string | null = null;
/** The profile sync and shop read of this visit to the menu, shared by a build that replaces one mid-flight. */
let profileLoad: Promise<void> | null = null;

/** Between two lines the footer says one after the other. */
const SAY_GAP_MS = 3200;

type Side = 'left' | 'right' | 'below';
type MenuPage = 'ranking' | 'achievements' | 'stats' | 'info' | 'wardrobe' | 'settings' | 'privacy';

export class MenuScene extends Phaser.Scene {
  private bgScroll = { speed: DRIFT };
  // viewport-fit: the page open now, so a re-layout for a new screen width (src/viewportFit.ts) reopens it
  private openPage: () => MenuPage | null = () => null;

  constructor() {
    super({ key: 'MenuScene' });
  }

  relayoutData(): { page?: MenuPage; relayout: true } {
    return { page: this.openPage() ?? undefined, relayout: true };
  }

  create(data?: { page?: MenuPage; relayout?: boolean }): void {
    // Everything that answers later checks this: a build replaced by a re-layout, or left for a run, is not to be touched
    let closed = false;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { closed = true; });
    const { width, height } = this.cameras.main;
    const cx = Math.round(width / 2);
    const wide = width >= WIDE_FROM;

    const { setScrollSpeed } = createSceneBackground(this, { level: 1, scrollSpeed: DRIFT });
    this.bgScroll.speed = DRIFT;
    const syncScroll = (): void => setScrollSpeed(this.bgScroll.speed);
    this.events.on('update', syncScroll);

    const isMobile = !this.sys.game.device.os.desktop;
    const nav = new MenuNav(this);

    const mainPage = this.add.container(0, 0).setDepth(DEPTH.MENU_PAGE);
    // The title, roach and name; and the column of ways to play. Each is moved as one to stay centred when the
    // missions change size (a narrow screen keeps them all in one stack)
    const hero = this.add.container(0, 0);
    const column = wide ? this.add.container(0, 0) : hero;
    mainPage.add(wide ? [hero, column] : hero);

    // Wide: the title and roach centred left of the column, the pair centred on the screen. Narrow: one column
    const heroX = wide ? Math.round((width - (HERO_W + HERO_GAP + COL_W)) / 2 + HERO_W / 2) : cx;
    const colX = wide ? heroX + HERO_W / 2 + HERO_GAP + COL_W / 2 : cx;
    const colLeft = colX - COL_W / 2;
    const dockY = height - DOCK_FROM_BOTTOM;
    const bandTop = EDGE;
    const bandBottom = dockY - TILE / 2 - DOCK_CLEAR;

    // --- Title, and the roach running on the spot under it ---
    const roachSize = wide ? 2 : 1;
    const feetDrop = (wide ? SUBTITLE_DROP.wide : SUBTITLE_DROP.narrow) + ROACH_ROOM * roachSize;
    const nameDrop = feetDrop + NAME_UNDER_FEET;
    const titleY = wide ? Math.round((bandTop + bandBottom - (HERO_ABOVE + nameDrop + HERO_BELOW)) / 2 + HERO_ABOVE) : 44;
    const title = this.add.text(heroX, titleY, 'KARALUCH', titleStyle({
      fontSize: wide ? '40px' : '32px',
      color: UI_TEXT.bone,
      strokeThickness: 8,
      shadow: { offsetX: 0, offsetY: 5, color: '#5a0d0d', blur: 0, fill: true, stroke: true },
    })).setOrigin(0.5);
    const subtitle = this.add.text(heroX, titleY + (wide ? SUBTITLE_DROP.wide : SUBTITLE_DROP.narrow), 'Gra przegrańców', bodyStyle({
      fontSize: '11px',
      color: UI_TEXT.amber,
    })).setOrigin(0.5);
    hero.add([title, subtitle]);

    const roachFeetY = titleY + feetDrop;
    const shadow = addContactShadow(this, heroX, roachFeetY, 104 * roachSize).setDepth(0);
    const roach = this.add.sprite(heroX, roachFeetY - ROACH_FEET_OFFSET * roachSize, ATLAS, frameOf('roach-run')).setScale(SPRITE_SCALE * roachSize);
    roach.play('roach-run');
    hero.add([shadow, roach]);
    // Your roach, in what it wears
    let roachWorn: Worn[] = [];
    let dressedIn: Look | null = null;
    const dressRoach = (look: Look): void => {
      dressedIn = look;
      roach.play(roachAnim('run', look), true);
      roachWorn.forEach(item => item.destroy());
      roachWorn = dress(this, roach, look);
      // A shop skin's atlas loads when it is first worn: the plain roach until then
      withShopSkin(packs(this.game), look.skin, () => { if (roach.active && dressedIn === look) roach.play(roachAnim('run', look), true); });
    };

    // --- Name: shows who you are (renaming is in Ustawienia) ---
    const nameText = this.add.text(heroX, titleY + nameDrop, getPlayerNameOrDefault(), bodyStyle({
      fontSize: '10px',
      color: isPlayerNameCustom() ? UI_TEXT.named : UI_TEXT.bone,
    })).setOrigin(0.5);
    hero.add(nameText);

    // --- Buttons ---
    // Where a solo run starts: the start, or a checkpoint unlocked by beating its boss. The last choice is kept
    let from = 0;
    let startingGame = false;
    const startGame = (daily?: DailyRun): void => {
      if (startingGame) return;
      startingGame = true;
      if (isMobile && !document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
      sceneManager.goto(this, 'GameScene', { multiplayer: false, daily, from: daily ? 0 : from }, () => {
        mpClient.disconnect();
      });
    };

    // The day's run comes from the server, so everyone's day and seed agree whatever their clocks say
    const startDaily = (): void => {
      if (startingGame) return;
      void fetchDaily().then((daily) => {
        if (closed) return;
        if (daily) startGame(daily);
        else say('Karaluch Dnia potrzebuje internetu', '#e07a6a');
      });
    };

    // Most important first: play, the other ways to play, the missions, then the rest as icons. The arrows move across
    const mainButtons: UIButton[] = [];
    const addBtn = (
      holder: Phaser.GameObjects.Container, label: string, color: number, action: () => void,
      x: number, y: number, w: number, h: number, fontSize: string, opts: { google?: boolean; sub?: string; icon?: string; caption?: string; badge?: boolean } = {},
    ): UIButton => {
      const button = createButton(this, x, y, w, h, label, color, buttonStyle({ fontSize, strokeThickness: 3 }), action, opts);
      holder.add(button.all);
      mainButtons.push(button);
      return button;
    };
    const setShown = (button: UIButton, shown: boolean): void => {
      button.setEnabled(shown);
      button.all.forEach(o => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(shown));
    };

    // A short line in the footer for what just happened: signed in, score saved, rename failed. The footer's own
    // lines step aside while it shows
    const footerY = height - FOOTER_FROM_BOTTOM;
    const hint = this.add.text(EDGE, footerY, isMobile ? '' : 'Strzałki: wybór   Enter: wejście   Esc: powrót', smallStyle({
      fontSize: '7px', color: UI_TEXT.muted, strokeThickness: 2,
    })).setOrigin(0, 0.5);
    const ver = this.add.text(width - EDGE, footerY, VERSION_LINE, smallStyle({
      fontSize: '7px', color: '#5f554b', strokeThickness: 2,
    })).setOrigin(1, 0.5);
    const toast = this.add.text(cx, footerY, '', smallStyle({ fontSize: '8px', color: UI_TEXT.amber, strokeThickness: 3 }))
      .setOrigin(0.5).setAlpha(0);
    mainPage.add([hint, ver, toast]);
    const say = (message: string, color: string = UI_TEXT.amber): void => {
      this.tweens.killTweensOf([toast, hint, ver]);
      toast.setText(message).setColor(color).setAlpha(1);
      hint.setAlpha(0);
      ver.setAlpha(0);
      this.tweens.add({ targets: toast, alpha: 0, delay: 3500, duration: 500 });
      this.tweens.add({ targets: [hint, ver], alpha: 1, delay: 4000, duration: 300 });
    };

    const changeName = (): void => {
      nav.enabled = false;
      showNameInput(this, (newName) => {
        nameText.setText(newName).setColor(UI_TEXT.named);
        // Signed in, the name is the account's: on the board too
        if (account()) {
          void renameAccount(newName).then((ok) => {
            if (closed) return;
            if (!ok) say('Nie udało się zmienić nazwy', '#e07a6a');
            settings?.refresh();
          });
        }
      }, account()?.name, () => { nav.enabled = true; });
    };

    // --- Pages: each slides in from its side, the home screen out the other way, and the world rushes past ---
    let onPage: Phaser.GameObjects.Container | null = null;
    const offset = (side: Side): { x: number; y: number } =>
      side === 'left' ? { x: -width, y: 0 } : side === 'right' ? { x: width, y: 0 } : { x: 0, y: height };
    const newPage = (side: Side): Phaser.GameObjects.Container => {
      const at = offset(side);
      return this.add.container(at.x, at.y).setDepth(DEPTH.MENU_PAGE);
    };
    // viewport-fit: reopened after a re-layout, the page is just there: no slide, no rush
    let instant = data?.page !== undefined;
    const rush = (direction: number): void => {
      if (instant) return;
      this.tweens.add({
        targets: this.bgScroll, speed: DRIFT_RUSH * direction, duration: PAGE_MS / 2, ease: 'Power2',
        onComplete: () => { this.tweens.add({ targets: this.bgScroll, speed: DRIFT, duration: PAGE_MS / 2, ease: 'Power2' }); },
      });
    };
    const slide = (target: Phaser.GameObjects.Container, to: { x: number; y: number }): void => {
      if (instant) { target.setPosition(to.x, to.y); return; }
      this.tweens.add({ targets: target, x: to.x, y: to.y, duration: PAGE_MS, ease: 'Power2' });
    };
    const showPage = (page: Phaser.GameObjects.Container, side: Side): void => {
      onPage = page;
      const at = offset(side);
      slide(page, { x: 0, y: 0 });
      slide(mainPage, { x: -at.x, y: -at.y });
      if (side !== 'below') rush(side === 'left' ? -1 : 1);
    };
    /** Back home, to the button the page was opened from. */
    const hidePage = (page: Phaser.GameObjects.Container, side: Side, opener: UIButton): void => {
      onPage = null;
      slide(page, offset(side));
      slide(mainPage, { x: 0, y: 0 });
      if (side !== 'below') rush(side === 'left' ? 1 : -1);
      nav.set(mainButtons, { initial: opener });
    };
    const area = contentArea(width, height);

    // Ranking, from the left: three boards as tabs, the all-time one, today's Karaluch Dnia and the endless one
    const rankPage = newPage('left');
    const boards = ['all', 'daily', 'endless'] as const;
    let rankBtn: UIButton;
    let rankBack: UIButton | null = null;
    let rankTabs: Tabs | null = null;
    let rankList: ScrollList | null = null;
    const rankBody = this.add.container(0, 0);
    const rankArea = { ...area, y: area.y + TAB_H + GAP, h: area.h - TAB_H - GAP };
    const showBoard = (i: number, focus: UIButton): void => {
      rankList?.destroy();
      rankBody.removeAll(true);
      rankList = buildScorePage(this, rankBody, rankArea, boards[i], {
        retry: () => showBoard(i, rankTabs!.buttons[i]),
        // A board that failed to load offers a retry button: it joins the focus list and takes the focus
        offerButton: (retry) => {
          if (onPage === rankPage && rankTabs!.active === i) nav.set([rankBack!, ...rankTabs!.buttons, retry], { initial: retry, onBack: hideRanking, scroll: rankList! });
        },
      });
      nav.set([rankBack!, ...rankTabs!.buttons], { initial: focus, onBack: hideRanking, scroll: rankList });
    };
    const showRanking = (): void => {
      if (!rankBack) {
        rankBack = addPageHeader(this, rankPage, width, 'RANKING', hideRanking);
        rankTabs = addTabs(this, rankPage, {
          cx, y: area.y + TAB_H / 2, maxW: area.w, labels: ['Wszech czasów', 'Dzisiaj', ENDLESS_NAME],
          onPick: (i) => showBoard(i, rankTabs!.buttons[i]),
        });
        rankPage.add(rankBody);
      }
      showBoard(rankTabs!.active, rankTabs!.buttons[rankTabs!.active]);
      showPage(rankPage, 'left');
    };
    const hideRanking = (): void => hidePage(rankPage, 'left', rankBtn);

    // Osiągnięcia, from the left too; opening it is seeing what was earned, so the trophy's mark goes
    const achievementsPage = newPage('left');
    let trophyBtn: UIButton;
    let achievementsList: ScrollList | null = null;
    const showAchievements = (): void => {
      markAchievementsSeen();
      trophyBtn.setBadge?.(false);
      achievementsList?.destroy();
      achievementsPage.removeAll(true);
      const back = addPageHeader(this, achievementsPage, width, 'OSIĄGNIĘCIA', hideAchievements);
      // Each tab builds its own list; the tabs sit after Powrót, the arrows scroll the list
      buildAchievementsPage(this, achievementsPage, area, (tabs, list, focus) => {
        achievementsList = list;
        nav.set([back, ...tabs], { initial: focus, onBack: hideAchievements, scroll: list });
      });
      showPage(achievementsPage, 'left');
    };
    const hideAchievements = (): void => hidePage(achievementsPage, 'left', trophyBtn);

    // Statystyki, from the left
    const statsPage = newPage('left');
    let statsBtn: UIButton;
    let statsList: ScrollList | null = null;
    const showStats = (): void => {
      statsList?.destroy();
      statsPage.removeAll(true);
      const back = addPageHeader(this, statsPage, width, 'STATYSTYKI', hideStats);
      statsList = buildStatsPage(this, statsPage, area);
      nav.set([back], { onBack: hideStats, scroll: statsList });
      showPage(statsPage, 'left');
    };
    const hideStats = (): void => hidePage(statsPage, 'left', statsBtn);

    // Jak grać, from the right
    const infoPage = newPage('right');
    let info: InfoPage | null = null;
    let infoButtons: UIButton[] = [];
    let infoFocus: UIButton | undefined;
    let infoBtn: UIButton;
    const showInfo = (): void => {
      if (!info) {
        const back = addPageHeader(this, infoPage, width, 'JAK GRAĆ', hideInfo);
        // A page's own buttons come with its tabs; the lit tab keeps the focus when the page changes
        // "Samouczek" clears the flag, so the run it starts opens with the lesson (and quitting it halfway keeps it due)
        info = buildInfoPage(this, infoPage, area, isMobile, () => { setTutorialDone(false); startGame(); }, (buttons, initial) => {
          infoButtons = [back, ...buttons];
          infoFocus = initial;
          if (onPage === infoPage) nav.set(infoButtons, { initial, onBack: hideInfo });
        });
      } else {
        info.refresh();
      }
      nav.set(infoButtons, { initial: infoFocus, onBack: hideInfo });
      showPage(infoPage, 'right');
    };
    const hideInfo = (): void => hidePage(infoPage, 'right', infoBtn);

    // Szafa, from the right like the help
    const wardrobePage = newPage('right');
    let wardrobe: WardrobePage | null = null;
    let wardrobeButtons: UIButton[] = [];
    let wardrobeBtn: UIButton;
    const showWardrobe = (): void => {
      if (!wardrobe) {
        const back = addPageHeader(this, wardrobePage, width, 'SZAFA', hideWardrobe);
        wardrobe = buildWardrobePage(this, wardrobePage, width, area, dressRoach, (buttons, initial, scroll) => {
          wardrobeButtons = [back, ...buttons];
          nav.set(wardrobeButtons, { initial, onBack: hideWardrobe, scroll });
        });
      } else {
        // Opens on what is worn: the tab it was left on, with that item selected
        wardrobe.showTab();
      }
      showPage(wardrobePage, 'right');
    };
    const hideWardrobe = (): void => hidePage(wardrobePage, 'right', wardrobeBtn);

    // Ustawienia, from below
    const settingsPage = newPage('below');
    let settings: SettingsPage | null = null;
    let settingsButtons: UIButton[] = [];
    let settingsBtn: UIButton;
    const showSettings = (): void => {
      if (!settings) {
        const back = addPageHeader(this, settingsPage, width, 'USTAWIENIA', hideSettings);
        settings = buildSettingsPage(this, settingsPage, width, area, () => {
          afterSignOut();
          say('Konto usunięte razem z wynikami');
        }, showPrivacy, { rename: changeName, signOut: signOutNow }, (buttons) => {
          // Built again (signing in or out changes the rows): the focus goes to the top of the page
          settingsButtons = [back, ...buttons];
          if (onPage === settingsPage) nav.set(settingsButtons, { onBack: hideSettings, scroll: settings?.scroll });
        });
      }
      settings.refresh();
      nav.set(settingsButtons, { initial: settings.buttons[0], onBack: hideSettings, scroll: settings.scroll });
      showPage(settingsPage, 'below');
    };
    const hideSettings = (): void => hidePage(settingsPage, 'below', settingsBtn);

    // Privacy, from below again, over the settings it was opened from
    const privacyPage = newPage('below');
    let privacyBack: UIButton | null = null;
    let privacyList: ScrollList | null = null;
    const showPrivacy = (): void => {
      if (!privacyBack) {
        privacyBack = addPageHeader(this, privacyPage, width, 'PRYWATNOŚĆ', hidePrivacy);
        privacyList = buildPrivacyPage(this, privacyPage, area);
      }
      nav.set([privacyBack], { onBack: hidePrivacy, scroll: privacyList! });
      slide(privacyPage, { x: 0, y: 0 });
      slide(settingsPage, { x: 0, y: -height });
    };
    const hidePrivacy = (): void => {
      slide(privacyPage, { x: 0, y: height });
      slide(settingsPage, { x: 0, y: 0 });
      nav.set(settingsButtons, { initial: settings?.privacy, onBack: hideSettings, scroll: settings?.scroll });
    };

    // --- The column: play, the modes, the missions ---
    // Laid out from y 0 in the wide column (which is then moved to centre it), from under the name when narrow
    const colTop = wide ? 0 : titleY + nameDrop + 16;
    const playH = wide ? PLAY_H : PLAY_H_NARROW;
    const playY = colTop + playH / 2;
    // The play row as it always was, or, with a checkpoint unlocked, narrower beside the start picker; the one not
    // in use is hidden and disabled, so the arrows skip it (an account's sync can unlock checkpoints while it's open)
    const soloWide = addBtn(column, 'Jeden Karaluch', 0x880000, () => startGame(), colX, playY, COL_W, playH, '16px', { icon: 'btn-roach' });
    const soloNarrowW = COL_W - GAP - START_W;
    const soloNarrow = addBtn(column, 'Jeden Karaluch', 0x880000, () => startGame(),
      colLeft + soloNarrowW / 2, playY, soloNarrowW, playH, '16px', { sub: FROM_START_LABEL, icon: 'btn-roach' });
    const startLabel = (): string => (from === 0 ? FROM_START_LABEL : unlockedCheckpoints(checkpointsUnlocked())[from - 1].label);
    const pickStart = (): void => {
      from = (from + 1) % (unlockedCheckpoints(checkpointsUnlocked()).length + 1);
      setStartCheckpoint(from);
      soloNarrow.setSub?.(startLabel());
    };
    const startBtn = addBtn(column, 'Start', 0x6b5a2e, pickStart, colLeft + COL_W - START_W / 2, playY, START_W, playH, '10px', { icon: 'btn-flag' });
    const soloBtn = (): UIButton => (soloWide.enabled ? soloWide : soloNarrow);
    const refreshStart = (): void => {
      // Checkpoints follow the account, the opening lesson is per browser: until it is done here, a run starts at 0
      // (GameScene), so the menu offers nothing else
      const picking = isTutorialDone() && unlockedCheckpoints(checkpointsUnlocked()).length > 0;
      from = picking ? allowedStart(getStartCheckpoint(), checkpointsUnlocked()) : 0;
      setShown(soloWide, !picking);
      setShown(soloNarrow, picking);
      setShown(startBtn, picking);
      soloNarrow.setSub?.(startLabel());
    };
    refreshStart();

    // Each mode says a word about itself: today's standing for Karaluch Dnia
    const modesY = colTop + playH + GAP + MODES_H / 2;
    const modeW = (COL_W - GAP) / 2;
    const dailyBtn = addBtn(column, 'Karaluch Dnia', 0xb8860b, startDaily, colLeft + modeW / 2, modesY, modeW, MODES_H, '11px',
      { sub: 'Ten sam bieg dla wszystkich', icon: 'btn-calendar' });
    addBtn(column, 'Zjazd Karaluchów', 0x006688, () => sceneManager.goto(this, 'MultiplayerMenuScene'), colLeft + COL_W - modeW / 2, modesY, modeW, MODES_H, '11px',
      { sub: 'Gra ze znajomymi', icon: 'btn-roaches' });
    const refreshDaily = (): void => {
      void fetchDaily().then(async (day) => {
        if (!day) return;
        const board = await fetchScores(day.date);
        if (!closed) dailyBtn.setSub?.(dailyStanding(board, account(), getDailyBest(day.date)));
      });
    };

    // The missions: wide, a card at the foot of the column, which for a guest is also where Google sign-in is; narrow,
    // a row that opens the same card over the menu, or, for a guest, is the Google button. Guests play everything; the
    // board and the missions need an account. The button uses Google's colours and G, which its branding rules ask
    // for. Until the server has said who this is, and whether there is signing in at all, they're laid out as if there
    // is, with no Google button for someone who turns out to be signed in
    let accountKnown = false;
    const cardTop = colTop + playH + GAP + MODES_H + (wide ? CARD_GAP : GAP);
    const card = wide ? buildMissionsCard(this, column, colLeft, cardTop, COL_W, () => signIn()) : null;
    if (card?.signIn) mainButtons.push(card.signIn);
    const rowY = cardTop + MISSIONS_ROW_H / 2;
    const missionsBtn = wide ? null : addBtn(column, 'Misje', 0x8a6a2a, () => openMissions(), colX, rowY, COL_W, MISSIONS_ROW_H, '10px',
      { icon: 'btn-crumb' });
    const googleRow = wide ? null : addBtn(column, 'Zaloguj przez Google', 0, () => signIn(), colX, rowY, COL_W, MISSIONS_ROW_H, '10px',
      { google: true, sub: 'Misje i okruszki po zalogowaniu' });
    const refreshMissions = (): void => {
      const here = !accountKnown || missionsAvailable();
      if (card) {
        const cardH = card.redraw(!accountKnown);
        const h = playH + GAP + MODES_H + (cardH > 0 ? CARD_GAP + cardH : 0);
        column.y = Math.max(bandTop, Math.round(bandTop + (bandBottom - bandTop - h) / 2));
      } else if (missionsBtn && googleRow) {
        const offered = accountKnown && !account() && signInAvailable();
        missionsBtn.setLabel(missionsSummary() ?? 'Misje');
        setShown(missionsBtn, here && !offered);
        setShown(googleRow, offered);
        // Without the row the stack moves down to stay centred over the dock
        hero.y = here ? 0 : Math.round((MISSIONS_ROW_H + GAP) / 2);
      }
      // A button that went away takes the focus with it: back to the play row
      if (nav.current && !nav.current.enabled) nav.focus(soloBtn(), false);
    };
    refreshMissions();

    // The narrow screen's missions card, over the menu: a tap outside it, Esc or Zamknij closes it
    let modal: Phaser.GameObjects.Container | null = null;
    const closeMissions = (): void => {
      modal?.destroy();
      modal = null;
      nav.set(mainButtons, { initial: missionsBtn ?? undefined });
    };
    const openMissions = (): void => {
      if (modal) return;
      modal = this.add.container(0, 0).setDepth(DEPTH.MENU_MODAL);
      let pressedOutside = false;
      const backdrop = this.add.rectangle(cx, height / 2, width, height, 0x000000, 0.85).setInteractive();
      backdrop.on('pointerdown', () => { pressedOutside = true; });
      backdrop.on('pointerup', () => { if (pressedOutside) closeMissions(); });
      modal.add(backdrop);
      const w = Math.min(COL_W, width - EDGE * 2);
      const holder = this.add.container(0, 0);
      const cardH = buildMissionsCard(this, holder, cx - w / 2, 0, w).redraw();
      const closeY = cardH + CARD_GAP + TOUCH_MIN / 2;
      const top = Math.round((height - (closeY + TOUCH_MIN / 2)) / 2);
      // Taps on the card itself stay on it
      const blocker = this.add.rectangle(cx, cardH / 2, w, cardH, 0x000000, 0).setInteractive();
      const close = createButton(this, cx, closeY, 160, TOUCH_MIN, 'Zamknij', 0x444444, buttonStyle({ fontSize: '10px' }), closeMissions, { sound: 'back' });
      holder.add([blocker, ...close.all]);
      holder.y = top;
      modal.add(holder);
      nav.set([close], { onBack: closeMissions });
    };

    // --- The dock: everything else, as icon tiles across the bottom ---
    const dock: [string, string, number, () => void][] = [
      ['Osiągnięcia', 'btn-trophy', 0xe8c15a, showAchievements],
      ['Statystyki', 'btn-stats', 0x5a8a6a, showStats],
      ['Ranking', 'btn-podium', 0x664400, showRanking],
      ['Szafa', 'btn-hanger', 0x8a5a9a, showWardrobe],
      ['Ustawienia', 'btn-cog', 0x444444, showSettings],
      ['Jak grać', 'btn-info', 0x335555, showInfo],
    ];
    [trophyBtn, statsBtn, rankBtn, wardrobeBtn, settingsBtn, infoBtn] = dock.map(([caption, icon, color, action], i) =>
      addBtn(mainPage, '', color, action, cx + (i - (dock.length - 1) / 2) * DOCK_STEP, dockY, TILE, TILE, '8px', { icon, caption, badge: i === 0 }));
    const refreshBadge = (): void => trophyBtn.setBadge?.(achievementsUnseen());
    refreshBadge();

    const refreshAccount = (): void => {
      const user = account();
      nameText.setText(user?.name ?? getPlayerNameOrDefault()).setColor(user || isPlayerNameCustom() ? UI_TEXT.named : UI_TEXT.bone);
    };
    refreshAccount();

    // Signing out and deleting the account (both in Ustawienia) leave a guest: no shop, the plain roach
    const afterSignOut = (): void => {
      refreshAccount();
      void loadShop().then(() => {
        if (closed) return;
        refreshMissions();
        dressRoach(myLook());
        settings?.refresh();
      });
    };
    const signOutNow = (): void => {
      void signOut().then(() => {
        if (closed) return;
        afterSignOut();
        settings?.refresh();
        say('Wylogowano');
      });
    };

    nav.set(mainButtons, { initial: soloBtn() });

    // Back from Google: say how it went (a run that sent the player there is shown by its own game over, BootScene)
    heldSignIn ??= takeSignInResult();
    heldNotice ??= takeReturnNotice();
    if (!data?.relayout) profileLoad = null;
    void loadAccount().then(async (user) => {
      if (closed) return;
      accountKnown = true;
      refreshAccount();
      refreshMissions();
      // Signed in: your stats and achievements follow you from your account, and your roach wears what you bought
      if (user) {
        // The sync may pay okruszki for runs the server checked, so the shop is read after it
        profileLoad ??= (async () => { await syncProfile(); await loadShop(); })();
        await profileLoad;
        if (closed) return;
        // What the shop's record earned since last time (items owned, missions done) is announced once
        for (const earned of takeNotices()) showAchievement(this, earned);
        refreshBadge();
        dressRoach(myLook());
        wardrobe?.refresh();
        refreshMissions();
        // The account may have checkpoints this browser didn't: the play row shows them now
        const onSolo = nav.current === soloBtn();
        refreshStart();
        if (onSolo && nav.current !== soloBtn()) nav.focus(soloBtn(), false);
      }
      const signInResult = heldSignIn;
      const notice = heldNotice;
      heldSignIn = null;
      heldNotice = null;
      // How the sign-in went, then (a line of its own, a moment later) what else there is to say, such as a run that
      // couldn't be brought back
      const lines: [string, string][] = [];
      if (signInResult === 'failed') lines.push(['Nie udało się zalogować', '#e07a6a']);
      else if (user && signInResult === 'ok') lines.push([`Zalogowano jako ${user.name}`, UI_TEXT.named]);
      if (notice) lines.push([notice, '#e07a6a']);
      lines.forEach(([message, color], i) => {
        if (i === 0) say(message, color);
        else this.time.delayedCall(i * SAY_GAP_MS, () => { if (!closed) say(message, color); });
      });
      // Once it's known who you are, and anything parked is saved
      refreshDaily();
    });

    // viewport-fit: re-laid out for a new screen width, the menu comes back on the page it was on
    const reopen: Record<MenuPage, () => void> = {
      ranking: showRanking, achievements: showAchievements, stats: showStats, info: showInfo, wardrobe: showWardrobe,
      settings: showSettings, privacy: () => { showSettings(); showPrivacy(); },
    };
    const pages: [Phaser.GameObjects.Container, MenuPage][] = [
      [rankPage, 'ranking'], [achievementsPage, 'achievements'], [statsPage, 'stats'], [infoPage, 'info'], [wardrobePage, 'wardrobe'],
    ];
    this.openPage = () => (onPage === settingsPage ? (privacyPage.y < height / 2 ? 'privacy' : 'settings') : pages.find(([page]) => page === onPage)?.[1] ?? null);
    if (data?.page && reopen[data.page]) reopen[data.page]();
    instant = false;
    // Phaser keeps a scene's data when it is next started without any: coming back from a run must not reopen the page
    this.sys.settings.data = {};

    // T opens the ranking from home, and closes it again
    this.input.keyboard!.on('keydown-T', () => {
      if (!nav.enabled || modal) return;
      if (onPage === rankPage) hideRanking();
      else if (!onPage) showRanking();
    });

    this.events.once('shutdown', () => {
      this.events.off('update', syncScroll);
    });
  }
}
