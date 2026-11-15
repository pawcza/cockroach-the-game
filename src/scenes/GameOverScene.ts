import Phaser from 'phaser';
import { fetchScores, type DailyRun } from '../ui/Scoreboard';
import { type Achievement } from '../systems/Profile';
import { getFx } from '../effects/Fx';
import { titleStyle, bodyStyle, smallStyle, buttonStyle, UI_TEXT } from '../utils/TextStyles';
import { addObstacleArt, createButton, createPanel, showAchievement, UIButton } from '../ui/shared';
import { MenuNav } from '../ui/MenuNav';
import { TAB_ON } from '../ui/kit';
import { addContactShadow } from '../effects/ContactShadow';
import { createSceneBackground } from '../ui/SceneBackground';
import { sceneManager } from '../systems/SceneManager';
import { getHighScore } from '../utils/Storage';
import { account, loadAccount, parkReturnNotice, signIn, signInAvailable } from '../ui/Account';
import { ReplayData } from '../systems/DeathReplay';
import { DEATH_REPLAY_OFFERED, DeathReplayPlayer } from '../systems/DeathReplayPlayer';
import { LEVELS, getLevelForDistance, levelEnd } from '../config/levels';
import { ENDLESS_NAME, type Board } from '../systems/checkpoints';
import { BIGOS_CAUSE_KEY, bigosDeathLines } from '../systems/boss/bigosConfig';
import { showDeathTaunt } from '../systems/boss/deathTaunt';
import { skinOfCause } from '../objects/obstacles/cast';
import { claimRun, rankRun, type RunResult } from '../systems/RunTickets';
import { CrumbReceipt } from './CrumbReceipt';
import { PACK_LOADED_EVENT } from '../systems/PackLoader';
import { packs } from './DeferredLoadScene';
import { addAchievementIcon } from '../ui/achievementIcon';
import { SPRITE_SCALE } from '../config/sprites';

/** A level skin's own headline (cast.ts): killed by the moon rock, the game over says so. */
const skinHeadline = (cause: string): string[] | null => {
  const skin = skinOfCause(cause);
  return skin ? [skin.headline] : null;
};

/** The confetti's colours, each its own frames in the effects atlas. */
const CONFETTI = ['pink', 'cyan', 'gold', 'leaf'];

/** Touch targets: every button on this screen is at least this tall. */
const BUTTON_H = 48;
const MARGIN = 16;
/** The receipt's column is never wider than this; the death's own column takes the rest. */
const RECEIPT_MAX_W = 420;
/** The two columns together are never wider than this (1108 is the widest screen the layouts were made for). */
const SPAN_MAX_W = 1108;
const STAT_ROW = 22;
/** The bottom row: Menu and the rest are this wide at most, "Jeszcze raz!" is the big one. */
const SIDE_W = 150;
const AGAIN_W = 260;
const AGAIN_H = 56;

interface GameOverData {
  score: number;
  timeSurvived?: number;
  topSpeed?: number;
  distance?: number;
  obstacleType?: string | null;
  level?: number;
  maxCombo?: number;
  pickupCounts?: { apples: number; beers: number; pills: number };
  replayData?: ReplayData | null;
  /** The record and best distance from before this run; the run itself is already saved over them. */
  previousBest?: number;
  previousBestDistance?: number;
  /** Karaluch Dnia: saved to that day's board, measured against the day's best. */
  daily?: DailyRun | null;
  /** The checkpoint the run started from (0: the start): "Jeszcze raz" starts there again. */
  from?: number;
  /** Earned as the run ended, as this browser counts them: toasts for a guest, or when the server could not be asked. */
  achievements?: Achievement[];
  /** Whether the run may make a board (false under a dev shortcut, and from a practice checkpoint); absent: it may. */
  ranked?: boolean;
  /** Which board: the main one (from 0 m), Bez końca (from the Eksterminator's start), or none; absent: the main one. */
  board?: Board | null;
  /** The story level whose look the run died in (an endless level wears one): the background shows it. */
  look?: number;
  /** The server's answer to the run's report (RunTickets.ts): every okruszek on this screen is from it. */
  result?: Promise<RunResult>;
  /** The headline drawn for this death: kept, so the screen after the sign-in says the same. */
  message?: string;
  /**
   * Back from the sign-in a guest left for from this screen (BootScene): the run's ticket to claim for the account, and
   * whether it goes on the board. The rest of the data is what the screen showed before.
   */
  returned?: { ticket: string; board: boolean; signIn: 'ok' | 'failed'; guest: RunResult };
  /** Set by relayoutData(): this is the same game over built again for a new width. */
  relayout?: Relayout;
}

/** What of a game over survives the sign-in round trip (sessionStorage): plain data, no replay, no promises. */
type GameOverView = Omit<GameOverData, 'replayData' | 'result' | 'achievements' | 'returned' | 'relayout'>;

/** What the receipt's words under it say for a guest: the line is a function of the crumbs the run would have paid. */
type GuestLine = 'signin' | 'account' | 'retry';
const GUEST_LINES: Record<GuestLine, (crumbs: number) => string> = {
  signin: (crumbs) => `Zaloguj się, żeby dostać ${crumbs} okr. i zapisać wynik`,
  account: (crumbs) => `Z kontem dostał(a)byś za ten bieg ${crumbs} okr.`,
  retry: (crumbs) => `Nie udało się zalogować. Spróbuj jeszcze raz, żeby dostać ${crumbs} okr.`,
};

/**
 * Everything the screen ends up saying once the server has answered (or the guest's run has been claimed): what the
 * receipt shows and which button goes with it. Made once per game over, so a rebuild of the screen (a new screen width)
 * paints it again without asking the server anything.
 */
interface Settled {
  run: RunResult;
  guestLine: GuestLine;
  note?: string;
  why?: string;
  button: { kind: 'signin'; run: RunResult; board: boolean } | { kind: 'save'; ticket: string; name: string } | null;
  /** The board save, once pressed: null not yet, then pending, then how it went. */
  saved: null | 'saving' | 'yes' | 'no';
  /** Achievements to toast (a run the server paid lists them on the receipt instead). */
  toasts: Achievement[];
}

/** What a rebuild of the screen carries over, so it shows the same screen at once and asks nothing again. */
interface Relayout {
  task: Promise<Settled>;
  painted: boolean;
  focus: string | null;
}

export class GameOverScene extends Phaser.Scene {
  private replayData: ReplayData | null = null;
  private replay: DeathReplayPlayer | null = null;
  private daily: DailyRun | null = null;
  private from = 0;
  /** A Bez końca run: its own board and its own record. */
  private endless = false;
  private nav!: MenuNav;
  private receipt: CrumbReceipt | null = null;
  /** The buttons along the bottom, and the one under the receipt (the board's or the sign-in's), if any. */
  private row: UIButton[] = [];
  private extra: UIButton | null = null;
  private extraNote: Phaser.GameObjects.Text | null = null;
  private message = '';
  private runData!: GameOverData;
  /** The record from before this run, kept so a rebuild draws the same "Nowy rekord!". */
  private previousBest = 0;
  /** A rebuild starts a new generation: what an earlier one was waiting for no longer paints. */
  private generation = 0;
  private task: Promise<Settled> | null = null;
  private settled: Settled | null = null;
  private painted = false;
  private focusLabel: string | null = null;

  private static readonly DEATH_TEXT: Record<string, string[]> = {
    bird: ['Srak cię optakał', 'Gołąb zemsty!', 'Bombardowanie z góry!'],
    cat: ['Rozkotowany', 'Łapa losu!', 'Kici kici... pac!'],
    flipper: ['Kubota ci w ryj!', 'Klapek sprawiedliwości!', 'Ciapnięty na amen!'],
    newspaper: ['Złe wybory kolego', 'Gazeta prawdy!', 'Przywalony faktem!'],
    onion: ['Smrót cię zmiótł', 'Cebulowy nokaut!', 'Zapłakałeś na wieki!'],
    spray: ['Muga!', 'Psik i po tobie!', 'Toksyczny koniec!'],
    disco: ['Dyskoteka zamknięta!', 'Ostatni taniec!', 'Kto nie tańczy ten ginie!'],
    jellyfish: ['Użądlony na Bałtyku!', 'Meduza ci w twarz!', 'Morska zemsta!'],
    pope: ['Okadzony przez papieża!', 'Kremówka ostatnia!', 'Santo subito... ale nie ty!'],
    bison: ['Żubr cię stratował!', 'Żubrówka na kopyta!', 'Byka złapałeś!'],
    blackhole: ['Wciągnięty w nicość!', 'Ssanie kosmiczne!', 'Karaluch w próżni!'],
    glue: ['Przyklejony na amen!', 'Lep nie wybacza!', 'Utknąłeś, kolego!'],
    bleach: ['Wybielony!', 'Kropla za dużo!', 'Czysto, aż strach!'],
    lamp: ['Ktoś zapalił światło!', 'Złapany na gorącym uczynku!', 'Widzą cię!'],
    mop: ['Zmyty z podłogi!', 'Mokra robota!', 'Na mydle i po tobie!'],
    vacuum: ['Wciągnięty do worka!', 'Odkurzony na amen!', 'Ssanie wygrało!'],
    hen: ['Kura cię dziobnęła!', 'Ko-ko-koniec!', 'Dziób sprawiedliwości!'],
    frog: ['Zjedzony na raz!', 'Język za długi!', 'Mucha? Nie, ty!'],
    centipede: ['Stonoga szybsza!', 'Sto nóg, zero litości!', 'Dogoniony!'],
    boots: ['Rozdeptany w remizie!', 'Zatańczyli cię!', 'Oberek na plecach!'],
    hedgehog: ['Nadziany na kolce!', 'Jeż się nie cofa!', 'Kłujący koniec!'],
    gull: ['Bałtycki nalot!', 'Mewa wzięła frytkę i ciebie!', 'Skrzek i po wszystkim!'],
    wasp: ['Użądlony na amen!', 'Osa nie odpuszcza!', 'Żądło prosto w pancerz!'],
    zapper: ['Bzzzt i po tobie!', 'Usmażony na fioletowo!', 'Kopnął cię prąd!'],
    robotVacuum: ['Posprzątany przez robota!', 'Sprzątanie zaplanowane!', 'Wciągnięty po trasie!'],
    repeller: ['Pisk nie do zniesienia!', 'Odstraszony na zawsze!', 'Ultradźwięki wygrały!'],
    aerosol: ['Za blisko puszki!', 'Wybuch z bliska!', 'Strzał w stopę!'],
    bait: ['Skusiła cię trutka!', 'Ostatnia przekąska!', 'Zielony żel, zimny koniec!'],
    wall: ['Prosto w ścianę!', 'Trzeba było dashować!', 'Ściana płaczu!'],
    boss: ['Bestia cię dopadła!', 'Zlew zwyciężył!', 'Kremówkowy armagedon!'],
    lodzia: ['Raz, a dobrze!', 'Kapciem w ryj!', 'Pani Lodzia nie pudłuje!'],
    eksterminator: ['Zdezynsekowany!', 'Bez faktury, bez litości!', 'Psik i po robalu!'],
  };

  private static readonly DEFAULT_DEATH = 'Zgniotłeś się!';

  constructor() {
    super({ key: 'GameOverScene' });
  }

  /** viewport-fit: a new screen width builds this screen again; it carries the run's answer, so nothing is asked twice. */
  relayoutData(): GameOverData | undefined {
    if (!this.task) return undefined;
    return {
      ...this.runData,
      message: this.message,
      previousBest: this.previousBest,
      returned: undefined,
      relayout: { task: this.task, painted: this.painted, focus: this.nav?.current?.txt.text ?? this.focusLabel },
    };
  }

  create(data: GameOverData): void {
    // Back from a sign-in: anything that breaks in building the screen sends the player to the menu, said why
    if (data?.returned && !data.relayout) {
      try {
        this.build(data);
      } catch (error) {
        console.error('game over after sign-in failed', error);
        parkReturnNotice('Nie udało się wrócić do wyniku biegu');
        sceneManager.goto(this, 'MenuScene');
      }
      return;
    }
    this.build(data);
  }

  private build(data: GameOverData): void {
    const { width, height } = this.cameras.main;
    const again = data?.relayout;
    // A rebuild has the run's whole story already: it never claims, reports or counts again, and plays nothing over
    const returned = again ? undefined : data?.returned;
    const generation = ++this.generation;
    this.runData = data;
    this.replayData = data?.replayData ?? null;
    this.replay = null;
    this.daily = data?.daily ?? null;
    this.from = data?.from ?? 0;
    this.endless = data?.board === 'endless';
    this.receipt = null;
    this.extra = null;
    this.extraNote = null;
    this.row = [];
    this.settled = null;
    this.painted = again?.painted ?? false;
    this.focusLabel = again?.focus ?? null;

    // A tap, or Enter, while the receipt is still coming in puts it all up at once. Hooked before the menu's keys: the
    // Enter that skips is not also the one that restarts; once the receipt is in, Enter is "Jeszcze raz!" again
    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      if ((event.code !== 'Enter' && event.code !== 'NumpadEnter' && event.code !== 'Space') || !this.receipt?.animating) return;
      this.receipt.skip();
      this.nav.enabled = false;
      queueMicrotask(() => { this.nav.enabled = true; });
    });
    this.input.on('pointerdown', () => this.receipt?.skip());

    this.cameras.main.setBackgroundColor('#0a0a0a');
    // You see the level you died in, darker
    createSceneBackground(this, { level: data?.look ?? data?.level ?? 1, dim: 0.62, scrollSpeed: 0.15 });
    this.nav = new MenuNav(this);

    // DJ Bigos's line names what got you (the server only hears 'bigos')
    const texts = data?.obstacleType === 'bigos'
      ? bigosDeathLines(this.registry.get(BIGOS_CAUSE_KEY))
      : data?.obstacleType ? GameOverScene.DEATH_TEXT[data.obstacleType] ?? skinHeadline(data.obstacleType) : null;
    const deathMessage = data?.message ?? (texts
      ? texts[Math.floor(Math.random() * texts.length)]
      : GameOverScene.DEFAULT_DEATH);
    this.message = deathMessage;

    // Two columns under the title: the death on the left, the okruszki on the right
    // (on a screen wider than the layouts were made for, the pair stays together in the middle)
    const span = Math.min(width, SPAN_MAX_W);
    const edge = Math.round((width - span) / 2) + MARGIN;
    const receiptW = Math.min(RECEIPT_MAX_W, Math.floor((span - MARGIN * 3) / 2));
    const leftW = span - MARGIN * 3 - receiptW;
    const left = { x: edge, w: leftW, centre: edge + leftW / 2 };
    const receiptX = edge + MARGIN + leftW;

    const titleY = this.setupDeathTitle(width, deathMessage);
    if (this.daily) {
      const [year, month, day] = this.daily.date.split('-').map(Number);
      this.add.text(16, 12, `KARALUCH DNIA · ${day}.${month}.${year}`, smallStyle({ fontSize: '8px', color: '#e8c15a', strokeThickness: 3 }));
    }
    this.setupObstacleImage(left.centre, titleY, data);

    // From a practice checkpoint the run is practice: no record, no confetti, no board, and the line says so. A dev run is
    // no record either. From the Eksterminator's start it is up against its own record and board (Bez końca)
    const practice = this.from > 0 && !this.endless;
    const info = this.getHighScoreInfo(data?.score ?? 0, data?.previousBest);
    this.previousBest = info.highScore;
    const isNewRecord = info.isNewRecord && !practice && data?.ranked !== false;
    const scoreBottom = this.setupScoreDisplay(left.centre, data?.score ?? 0, info.highScore, isNewRecord, practice, again !== undefined);
    // On a wide screen the numbers stay near their labels
    const statsW = Math.min(left.w, 460);
    const statsTop = scoreBottom + 10;
    this.setupStats(Math.round(left.centre - statsW / 2), statsW, statsTop, data);
    // The boss's word and the confetti are for the moment of the death, with their sounds: not again
    if (!again) showDeathTaunt(this, data?.distance, data?.obstacleType);

    if (isNewRecord && !returned && !again) {
      this.spawnConfetti(width);
    }

    // The buttons first and at once: "Jeszcze raz!" never waits for the server
    this.showDeathButtons();

    // The receipt, from the server's answer: the run's report, or the claim of a guest's run on the way back. Its top is
    // the stats panel's: the two columns hang from one line (the boss's word slides in above it, at the top right)
    const area = { x: receiptX, y: statsTop, w: receiptW, bottom: height - 16 - AGAIN_H - 12 };
    this.receipt = new CrumbReceipt(this, area);
    this.receipt.showPending();
    // The answer is asked for once, here, and kept: a rebuild of the screen paints the same one
    this.task = again?.task ?? (returned ? this.settleReturn(returned, this.checkBoard(data, isNewRecord)) : this.settleRun(data, this.checkBoard(data, isNewRecord)));
    void this.task.then((settled) => {
      if (generation !== this.generation || !this.scene.isActive()) return;
      this.paint(settled, data, this.painted);
    });
  }

  /** Whether this run may go on the board: a record that makes the top 100. */
  private checkBoard(data: GameOverData, isNewRecord: boolean): Promise<boolean> {
    const finalScore = data?.score ?? 0;
    return fetchScores(this.daily?.date, this.endless ? 'endless' : undefined).then((scores) => {
      const inTop100 = scores.length < 100 || (finalScore > 0 && finalScore > scores[scores.length - 1].score);
      return data?.ranked !== false && isNewRecord && inTop100;
    }).catch(() => false);
  }

  // -- The receipt -------------------------------------------------------------

  /** The run's answer, as the receipt and the button under it will show it: the board's for an account, the sign-in for a guest. */
  private async settleRun(data: GameOverData, boardCheck: Promise<boolean>): Promise<Settled> {
    const [run, canSave] = await Promise.all([data?.result ?? Promise.resolve<RunResult>({ kind: 'none' }), boardCheck]);
    const user = account();
    const guest = run.kind === 'checked' && !run.receipt.paid && run.receipt.counted;
    // What this browser counted as earned: the receipt lists what the server paid, so toasts only when it couldn't
    const toasts = run.kind !== 'checked' || !run.receipt.paid ? data?.achievements ?? [] : [];
    if (guest && signInAvailable()) {
      return { run, guestLine: 'signin', button: { kind: 'signin', run, board: canSave }, saved: null, toasts };
    }
    return {
      run, guestLine: 'account', saved: null, toasts,
      button: user && canSave && run.kind === 'checked' && run.receipt.board ? { kind: 'save', ticket: run.ticket, name: user.name } : null,
    };
  }

  /** Back from Google: the guest's run claimed for the account now signed in, paid and (if it made it) on the board. */
  private async settleReturn(back: NonNullable<GameOverData['returned']>, boardCheck: Promise<boolean>): Promise<Settled> {
    const user = back.signIn === 'ok' ? await loadAccount() : null;
    if (!user) {
      // The sign-in didn't happen: the guest's receipt again, and the way to try once more
      return { run: back.guest, guestLine: 'retry', button: { kind: 'signin', run: back.guest, board: back.board }, saved: null, toasts: [] };
    }
    const { result, saved } = await claimRun(back.ticket, back.board);
    if (result.kind === 'refused') {
      const why = /claimed/.test(result.reason) ? 'Ten bieg jest już odebrany' : /expired/.test(result.reason) ? 'Za późno: ten bieg już wygasł' : 'Nie udało się odebrać tego biegu';
      return { run: result, guestLine: 'account', why: `${why}. Zalogowano jako ${user.name}.`, button: null, saved: null, toasts: [] };
    }
    // A run that made the board but couldn't be put there now (it wasn't by then): the button stays
    const again = !saved && back.board && result.kind === 'checked' && await boardCheck;
    return {
      run: result, guestLine: 'account', note: saved ? `Zapisano wynik jako ${user.name}` : undefined, saved: null, toasts: [],
      button: again && result.kind === 'checked' ? { kind: 'save', ticket: result.ticket, name: user.name } : null,
    };
  }

  /** The settled answer on the receipt and its button; `instant` (a rebuild) has it all in at once, with no toasts. */
  private paint(settled: Settled, data: GameOverData, instant: boolean): void {
    this.settled = settled;
    this.painted = true;
    const receipt = this.receipt!;
    receipt.show(settled.run, { guestLine: GUEST_LINES[settled.guestLine], note: settled.note, why: settled.why });
    if (instant) receipt.skip();
    const { button } = settled;
    if (button?.kind === 'signin') this.addSignIn(button.run, button.board, data);
    else if (button?.kind === 'save') {
      if (settled.saved === null) this.addSave(settled, button.ticket, button.name);
      else if (settled.saved === 'saving') this.notice('Zapisuję…', UI_TEXT.muted);
      else this.notice(settled.saved === 'yes' ? `Zapisano jako ${button.name}` : 'Nie udało się zapisać', settled.saved === 'yes' ? UI_TEXT.named : '#e07a6a');
    }
    if (!instant) for (const achievement of settled.toasts) showAchievement(this, achievement);
  }

  /** One line under the receipt, in place of a button. */
  private notice(text: string, color: string): void {
    this.extraNote?.destroy();
    this.extraNote = this.add.text(this.receipt!.area.x + 12, this.receipt!.bottom + 10, text, smallStyle({
      color, strokeThickness: 3, wordWrap: { width: this.receipt!.area.w - 24 },
    }));
  }

  /** "Zapisz wynik", in the row along the bottom (the receipt over it may be tall): the checked run on its board. */
  private addSave(settled: Settled, ticket: string, name: string): void {
    this.layoutRow(() => {
      settled.saved = 'saving';
      this.layoutRow(null);
      void rankRun(ticket).then((saved) => {
        settled.saved = saved ? 'yes' : 'no';
        // The screen may have been built again while it was asked: the line goes on whichever one is up
        if (!this.scene.isActive() || !this.receipt) return;
        this.notice(saved ? `Zapisano jako ${name}` : 'Nie udało się zapisać', saved ? UI_TEXT.named : '#e07a6a');
      });
    });
  }

  /** Google's own button (its branding rules) for a guest: the run is parked, claimed and shown again on the way back. */
  private addSignIn(run: RunResult, board: boolean, data: GameOverData): void {
    if (run.kind !== 'checked') return;
    const { area } = this.receipt!;
    const y = this.receipt!.bottom + 10 + BUTTON_H / 2;
    const button = createButton(this, area.x + area.w / 2, y, Math.min(240, area.w - 24), BUTTON_H, 'Zaloguj przez Google', 0,
      buttonStyle({ fontSize: '8px', strokeThickness: 2 }),
      () => signIn({ ticket: run.ticket, board, view: { ...viewOf(data), message: this.message, guest: run } }), { google: true });
    this.setExtra(button);
  }

  private setExtra(button: UIButton | null): void {
    this.extra = button;
    const buttons = button ? [button, ...this.row] : this.row;
    // The focus stays where it was, across the row being built again and a screen rebuilt for a new width
    const keep = this.nav.current?.txt.text ?? this.focusLabel;
    const initial = buttons.find(b => b.txt.text === keep) ?? this.row[this.row.length - 1];
    this.nav.set(buttons, { initial, onBack: () => this.goToMenu() });
  }

  // -- Background & atmosphere -----------------------------------------------

  private setupDeathTitle(width: number, message: string): number {
    const titleText = this.add
      .text(Math.round(width / 2), 38, message, titleStyle({
        fontSize: `${Math.max(16, Math.min(26, Math.floor(width / 30)))}px`,
        color: UI_TEXT.bone,
        strokeThickness: 7,
        shadow: { offsetX: 0, offsetY: 4, color: '#5a0d0d', blur: 0, fill: true, stroke: true },
      }))
      .setOrigin(0.5);

    return titleText.y;
  }

  private setupObstacleImage(centre: number, titleY: number, data: GameOverData): void {
    if (!data?.obstacleType) return;

    if (data.obstacleType === 'boss') {
      const faces = ['boss-face1', 'boss-face2', 'boss-face3'];
      const spacing = 60;
      const startX = centre - (faces.length - 1) * spacing / 2;
      if (!faces.every(key => this.textures.exists(key))) {
        // Straight after a boot (back from the sign-in) his pack isn't in: his head from the icons stands in, and the
        // three faces take its place when the pack arrives
        const head = addAchievementIcon(this, centre, titleY + 30 + 24, 'ach-boss-zlewiatan').setScale(SPRITE_SCALE * 2);
        const onPack = (): void => {
          if (!head.active || !faces.every(key => this.textures.exists(key))) return;
          this.game.events.off(PACK_LOADED_EVENT, onPack);
          head.destroy();
          this.setupObstacleImage(centre, titleY, data);
        };
        this.game.events.on(PACK_LOADED_EVENT, onPack);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(PACK_LOADED_EVENT, onPack));
        void packs(this.game)?.ensure(['boss-zlewiatan']);
        return;
      }
      const imgs: Phaser.GameObjects.Image[] = [];
      faces.forEach((key, i) => {
        const img = this.add.image(startX + i * spacing, titleY + 30, key);
        img.setScale(0.2).setOrigin(0.5, 0);
        imgs.push(img);
      });
      this.tweens.add({
        targets: imgs,
        y: '-=5',
        duration: 1000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      return;
    }

    // The culprit stands on its own shadow, like in the game. Straight after a boot (back from the sign-in) its art may
    // still be loading: it steps in when its pack arrives
    const feetY = titleY + 118;
    const type = data.obstacleType;
    const img = addObstacleArt(this, centre, feetY, type);
    if (!img) {
      const onPack = (): void => {
        if (!this.scene.isActive()) return;
        const art = addObstacleArt(this, centre, feetY, type);
        if (!art) return;
        art.destroy();
        this.game.events.off(PACK_LOADED_EVENT, onPack);
        this.setupObstacleImage(centre, titleY, data);
      };
      this.game.events.on(PACK_LOADED_EVENT, onPack);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(PACK_LOADED_EVENT, onPack));
      return;
    }
    addContactShadow(this, centre, feetY, 90);

    this.tweens.add({
      targets: img,
      y: img.y - 5,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // -- Score display ---------------------------------------------------------

  private getHighScoreInfo(finalScore: number, previousBest?: number): { isNewRecord: boolean; highScore: number } {
    const highScore = previousBest ?? getHighScore();
    return {
      isNewRecord: finalScore > 0 && finalScore > highScore,
      highScore,
    };
  }

  /** The score counting up and the record line under it; returns the y under them. */
  private setupScoreDisplay(centre: number, finalScore: number, highScore: number, isNewRecord: boolean, practice: boolean, instant: boolean): number {
    const scoreY = 196;

    // Animated count-up
    const counter = { value: 0 };
    const scoreText = this.add
      .text(centre, scoreY, `Punkciory: ${instant ? finalScore : 0}`, bodyStyle({
        fontSize: '18px',
        color: UI_TEXT.bone,
        strokeThickness: 5,
      }))
      .setOrigin(0.5);

    if (!instant) this.tweens.add({
      targets: counter,
      value: finalScore,
      duration: Math.min(2000, finalScore * 50 + 500),
      ease: 'Power2',
      onUpdate: () => {
        scoreText.setText(`Punkciory: ${Math.floor(counter.value)}`);
      },
    });

    // High score line
    const hsY = scoreY + 28;
    const hsText = this.add
      .text(centre, hsY, this.daily ? `Twój najlepszy dziś: ${highScore}` : `Najlepsiejszy wynik: ${highScore}`, smallStyle({
        fontSize: '11px',
        color: isNewRecord ? '#ffe066' : UI_TEXT.amber,
        strokeThickness: 3,
      }))
      .setOrigin(0.5);

    if (practice) {
      hsText.setText('Trening — bez rankingu');
    } else if (isNewRecord) {
      hsText.setText(this.daily ? `Najlepiej dziś!  Było ${highScore}` : this.endless ? `Rekord ${ENDLESS_NAME}!  Było ${highScore}` : `Nowy rekord!  Było ${highScore}`);
    } else if (highScore > 0 && finalScore > 0) {
      // How close it came: the number that makes you go again
      hsText.setText(`${this.daily ? 'Dziś' : this.endless ? ENDLESS_NAME : 'Rekord'}: ${highScore}  ·  brakło ${highScore - finalScore}`);
    } else if (this.endless) {
      hsText.setText(`${ENDLESS_NAME}: ${highScore}`);
    }
    return hsY + hsText.height / 2;
  }

  /** The run's numbers, label on the left and value on the right, in the death's column. */
  private setupStats(x: number, w: number, top: number, data: GameOverData): void {
    const fontSize = '9px';
    const startY = top + 12 + STAT_ROW / 2;

    const stats: { label: string; value: string; color: string; pips?: boolean }[] = [];
    if (data?.timeSurvived !== undefined) stats.push({ label: 'Czas Przeżywalności', value: `${data.timeSurvived}s`, color: '#8fc7d8' });
    const bestDistance = data?.previousBestDistance ?? 0;
    if (data?.distance !== undefined) {
      const distanceRecord = bestDistance > 0 && data.distance > bestDistance;
      stats.push({ label: 'Dystansik', value: `${Math.floor(data.distance)}m${distanceRecord ? '  rekord!' : ''}`, color: '#e0a040' });
    }
    if (data?.level !== undefined) {
      stats.push({ label: `Poziom ${data.level}`, value: '', color: '#f1e3c6', pips: true });
      // How far the next level was: close enough, and you go again (past level 10 they keep coming, every 500 m)
      if (data.distance !== undefined) {
        const short = Math.max(1, Math.ceil(levelEnd(data.level) - data.distance));
        stats.push({ label: `Do poziomu ${data.level + 1}`, value: `${short}m`, color: '#ffe066' });
      }
    }
    if (data?.topSpeed !== undefined) stats.push({ label: 'Maks Szybkóść', value: `${data.topSpeed.toFixed(1)}x`, color: '#c9a0dc' });
    if (data?.maxCombo !== undefined && data.maxCombo > 0) stats.push({ label: 'Maks Kombo', value: `x${data.maxCombo}`, color: '#e08aa8' });
    if (data?.pickupCounts) {
      const p = data.pickupCounts;
      stats.push({ label: 'Jabłka / Piwa / Pigułki', value: `${p.apples} / ${p.beers} / ${p.pills}`, color: '#9fe08a' });
    }

    if (stats.length === 0) return;
    createPanel(this, x, top, w, stats.length * STAT_ROW + 24);
    stats.forEach((stat, i) => {
      const y = startY + i * STAT_ROW;
      this.add.text(x + 12, y, stat.label, smallStyle({ fontSize, color: UI_TEXT.muted, strokeThickness: 0 })).setOrigin(0, 0.5);
      if (stat.pips) this.drawLevelPips(x + w - 12, y, data.level!, getLevelForDistance(bestDistance).level);
      else this.add.text(x + w - 12, y, stat.value, smallStyle({ fontSize, color: stat.color, strokeThickness: 0 })).setOrigin(1, 0.5);
    });
  }

  /**
   * One pip per level, ending at `right`: lit up to the one reached, outlined up to the best ever, so every run shows
   * where it got to.
   */
  private drawLevelPips(right: number, y: number, reached: number, best: number): void {
    const x = right - LEVELS.length * 12 + 4;
    const size = 8;
    const gap = 4;
    const g = this.add.graphics();
    LEVELS.forEach((level, i) => {
      const left = Math.round(x + i * (size + gap));
      const top = Math.round(y - size / 2);
      if (level.level <= reached) {
        g.fillStyle(level.color, 1).fillRect(left, top, size, size);
      } else {
        g.fillStyle(0x000000, 0.4).fillRect(left, top, size, size);
        g.lineStyle(2, level.level <= best ? 0xb9a78d : 0x3d2e25, 1).strokeRect(left + 1, top + 1, size - 2, size - 2);
      }
    });
  }

  // -- Confetti ---------------------------------------------------------------

  /** Pixel confetti from the effects atlas, fluttering down from above the screen. */
  private spawnConfetti(width: number): void {
    const fx = getFx(this);
    for (let i = 0; i < 40; i++) {
      fx.play(`confetti-${CONFETTI[i % CONFETTI.length]}`, Phaser.Math.Between(0, width), -12, {
        vx: Phaser.Math.Between(-40, 40), vy: Phaser.Math.Between(140, 220), gravity: 80, drag: 0.1,
        delay: Phaser.Math.Between(0, 1000), life: 3000, loop: true,
      });
    }
  }

  // -- Restart / navigation ---------------------------------------------------

  private showDeathButtons(): void {
    this.layoutRow(null);
    this.input.keyboard!.once('keydown-R', () => this.restartGame());
  }

  /** The row along the bottom: Menu, the replay if offered, "Zapisz wynik" when `save` is given, and "Jeszcze raz!". */
  private layoutRow(save: (() => void) | null): void {
    const { width, height } = this.cameras.main;
    for (const button of this.row) for (const obj of button.all) obj.destroy();
    const btnS = buttonStyle({ fontSize: '12px', strokeThickness: 3 });
    const btnY = height - 16 - AGAIN_H / 2;
    const gap = 10;
    const hasReplay = DEATH_REPLAY_OFFERED && this.replayData && this.replayData.frames.length > 0;

    // The others in a row of their own, "Jeszcze raz!" bigger and last, under the right thumb
    const side: [string, number, () => void][] = [['Menu', 0x666666, () => this.goToMenu()]];
    if (hasReplay) side.push(['Odtwórz śmierć', 0x333366, () => this.playReplay()]);
    if (save) side.push(['Zapisz wynik', 0x008800, save]);
    const room = width - MARGIN * 2 - gap * side.length;
    const againW = Math.min(AGAIN_W, Math.floor(room * 0.4));
    const sideW = Math.min(SIDE_W, Math.floor((room - againW) / side.length));
    const totalW = sideW * side.length + againW + gap * side.length;
    let x = width / 2 - totalW / 2;
    this.row = side.map(([label, color, action]) => {
      const button = createButton(this, x + sideW / 2, btnY, sideW, BUTTON_H, label, color, btnS, action);
      x += sideW + gap;
      return button;
    });
    this.row.push(createButton(this, x + againW / 2, btnY, againW, AGAIN_H, 'Jeszcze raz!', TAB_ON, buttonStyle({ fontSize: '16px', strokeThickness: 3 }), () => this.restartGame()));
    this.setExtra(this.extra);
  }

  private restartGame(): void {
    sceneManager.goto(this, 'GameScene', { multiplayer: false, retry: true, daily: this.daily ?? undefined, from: this.from });
  }

  private goToMenu(): void {
    sceneManager.goto(this, 'MenuScene');
  }

  private playReplay(): void {
    if (!this.replayData || this.replayData.frames.length < 2) return;
    this.replay?.destroy();
    this.replay = new DeathReplayPlayer(this, this.replayData);
    this.replay.play();
  }
}

/** The game over's data as the sign-in round trip keeps it. */
function viewOf(data: GameOverData): GameOverView {
  const { replayData: _replay, result: _result, achievements: _achievements, returned: _returned, relayout: _relayout, ...view } = data;
  return view;
}
