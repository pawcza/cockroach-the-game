import Phaser from 'phaser';
import { mpClient, type MPLobbyData, type MPPlayer, type MPRanking, type MPStart } from '../multiplayer/MultiplayerClient';
import { MP_START_LEAD_MS } from '../../server/lobby';
import { PLAYER_COLORS } from '../../server/lobby';
import { DEPTH } from '../config/constants';
import { bodyStyle, buttonStyle, capCentreShift, getScale, smallStyle, titleStyle, UI_TEXT } from '../utils/TextStyles';
import { createSceneBackground } from '../ui/SceneBackground';
import { addObstacleArt, createButton, createPanel, deathLabel, showAchievement, UIButton } from '../ui/shared';
import { recordMatch } from '../systems/Profile';
import { MenuNav } from '../ui/MenuNav';
import { sceneManager } from '../systems/SceneManager';
import { fetchScores } from '../ui/Scoreboard';
import { updateHighScoreIfBetter } from '../utils/Storage';
import { account, signIn, signInAvailable } from '../ui/Account';
import { ReplayData } from '../systems/DeathReplay';
import { DEATH_REPLAY_OFFERED, DeathReplayPlayer } from '../systems/DeathReplayPlayer';
import { rankRun, type RunResult } from '../systems/RunTickets';
import { CrumbReceipt } from './CrumbReceipt';
import { spaced } from '../../server/achievements';
import { EDGE, GAP, TAB_ON } from '../ui/kit';

interface MPGameOverData {
  rankings: MPRanking[];
  myId: string;
  isHost: boolean;
  replayData?: ReplayData | null;
  /** The server's answer to this player's run report (RunTickets.ts): the receipt's every number. */
  result?: Promise<RunResult>;
  /** Set by relayoutData(): this is the same screen built again for a new width. */
  relayout?: Relayout;
}

/** The server's answer for this player's run, and whether it may go on the board: asked once, kept. */
interface Settled {
  run: RunResult;
  inTop100: boolean;
  /** The board save, once pressed: null not yet, then pending, then how it went. */
  saved: null | 'saving' | 'yes' | 'no';
}

/** What a rebuild of the screen carries over: the match is counted once, the answer is asked once, the focus stays. */
interface Relayout {
  task: Promise<Settled> | null;
  painted: boolean;
  focus: string | null;
}

const REMATCH_FOCUS = 'rematch';

/** Touch targets on this screen are at least this tall. */
const BUTTON_H = 48;
/** The table is never wider than this: the name and the score would be too far apart to read across. */
const TABLE_MAX_W = 720;
/** Where a death's picture sits, before the words about it. */
const ICON_SLOT = 24;
const AGAIN_H = 56;

export class MultiplayerGameOverScene extends Phaser.Scene {
  private lobbyUpdatedHandler: ((lobbyData: MPLobbyData) => void) | null = null;
  private gameStartHandler: ((data: MPStart) => void) | null = null;
  private replayData: ReplayData | null = null;
  private runData!: MPGameOverData;
  private task: Promise<Settled> | null = null;
  private painted = false;
  private focusKey: () => string | null = () => null;
  private generation = 0;

  constructor() {
    super({ key: 'MultiplayerGameOverScene' });
  }

  /** viewport-fit: a new screen width builds this screen again; the match was counted and the run answered already. */
  relayoutData(): MPGameOverData {
    return { ...this.runData, result: undefined, relayout: { task: this.task, painted: this.painted, focus: this.focusKey() } };
  }

  create(data: MPGameOverData): void {
    const { width, height } = this.cameras.main;
    const again = data.relayout;
    const generation = ++this.generation;
    this.runData = data;
    this.painted = again?.painted ?? false;
    const s = getScale();
    const rankings = data.rankings || [];
    const myId = data.myId;
    const isHost = data.isHost;
    this.replayData = data?.replayData ?? null;

    createSceneBackground(this, { level: 6, dim: 0.6, scrollSpeed: 0.15 });
    const nav = new MenuNav(this);

    this.add.text(Math.round(width / 2), Math.round(30 * s), 'WYNIKI ZJAZDU', titleStyle({
      fontSize: `${Math.round(20 * s)}px`,
      color: UI_TEXT.bone,
      strokeThickness: Math.round(6 * s),
      shadow: { offsetX: 0, offsetY: 3, color: '#0d2a3a', blur: 0, fill: true, stroke: true },
    })).setOrigin(0.5);

    // --- Update local highscore ---
    const myRanking = rankings.find(r => r.id === myId);
    // A match you played (not one you only watched) counts, and a win when you top it
    if (myRanking && rankings.length > 1 && !again) {
      for (const achievement of recordMatch(rankings[0].id === myId)) showAchievement(this, achievement);
    }
    if (myRanking) {
      updateHighScoreIfBetter(myRanking.score);
    }

    // --- Rankings table: one panel, no wider than reads well, centred; the okruszki receipt goes under it ---
    const tableW = Math.min(width - EDGE * 2, TABLE_MAX_W);
    const tableX = Math.round((width - tableW) / 2);
    const tableTop = 56;
    // Closer rows for a full lobby
    const rowH = rankings.length > 2 ? 44 : 58;
    const colRank = tableX + 16;
    const colColor = tableX + 56;
    const colName = tableX + 84;
    const colScore = tableX + tableW - 16;
    const tableBottom = tableTop + rankings.length * rowH + 8;

    if (rankings.length > 0) createPanel(this, tableX, tableTop, tableW, tableBottom - tableTop);

    const label = (x: number, y: number, text: string, size: string, color: string, originX = 0): Phaser.GameObjects.Text => {
      const t = this.add.text(x, y, text, bodyStyle({ fontSize: size, color, strokeThickness: 0 })).setOrigin(originX, 0.5);
      t.setY(Math.round(y + capCentreShift(t)));
      return t;
    };

    for (let i = 0; i < rankings.length; i++) {
      const entry = rankings[i];
      const rank = i + 1;
      const top = tableTop + 4 + i * rowH;
      const y = top + 14;
      const isMe = entry.id === myId;
      const color = rank === 1 ? '#ffd700' : rank === 2 ? '#d6d6d6' : rank === 3 ? '#d9996a' : UI_TEXT.bone;

      // Your own row is lit like a focused button
      if (isMe) {
        this.add.graphics().fillStyle(0x2a1f18, 1).fillRect(tableX + 4, top, tableW - 8, rowH - 4).fillStyle(0xe8c15a, 1).fillRect(tableX + 4, top, 4, rowH - 4);
      }

      label(colRank, y, `${rank}.`, '16px', color);
      this.add.rectangle(colColor, y, 20, 20, PLAYER_COLORS[entry.color] ?? 0xffffff, 1).setStrokeStyle(2, isMe ? 0xfff1c2 : 0x000000);

      // The score, then the name in what room is left
      const score = label(colScore, y, spaced(entry.score), '24px', color, 1);
      const name = label(colName, y, entry.name, '16px', isMe ? '#fff1c2' : color);
      let shown = entry.name;
      while (name.x + name.width > score.x - score.width - 16 && shown.length > 1) {
        shown = shown.slice(0, -1);
        name.setText(`${shown.trimEnd()}…`);
      }

      // Under the name: what killed them (its picture in a slot of its own, so the words line up whether it has one or not),
      // and how the run went
      const stats = entry.stats || {};
      const obstacleType = (stats.obstacleType as string) || 'fall';
      const statLineY = top + 33;
      // (the boss's faces arrive with their pack: until then, none)
      const icon = obstacleType === 'boss' && !this.textures.exists('boss-face2') ? null : addObstacleArt(this, colName + ICON_SLOT / 2, statLineY + 3, obstacleType);
      if (icon) {
        icon.setScale(18 / Math.max(icon.width, icon.height));
        icon.setDepth(DEPTH.PICKUPS);
      }

      const statParts: string[] = [deathLabel(obstacleType)];
      if (stats.timeSurvived !== undefined) statParts.push(`${stats.timeSurvived}s`);
      if (stats.distance !== undefined) statParts.push(`${stats.distance}m`);
      if (typeof stats.maxLevel === 'number') statParts.push(`lv${stats.maxLevel}`);
      if (stats.maxSpeed !== undefined) statParts.push(`${Number(stats.maxSpeed).toFixed(1)}x`);
      if (typeof stats.maxCombo === 'number' && stats.maxCombo > 0) statParts.push(`x${stats.maxCombo}kmb`);
      const pickupParts: string[] = [];
      if (typeof stats.applesCollected === 'number') pickupParts.push(`${stats.applesCollected}`);
      if (typeof stats.tyskiesCollected === 'number') pickupParts.push(`${stats.tyskiesCollected}`);
      if (typeof stats.pillsCollected === 'number') pickupParts.push(`${stats.pillsCollected}`);
      if (pickupParts.length > 0) statParts.push(pickupParts.join('/'));

      const line = label(colName + ICON_SLOT + 8, statLineY, statParts.join('  '), '12px', UI_TEXT.muted);
      // At the narrowest the line is a little long: the pickups and speed give way before it spills out of the panel
      while (line.x + line.width > colScore && statParts.length > 3) {
        statParts.splice(statParts.length - (statParts.length > 5 ? 2 : 1), 1);
        line.setText(statParts.join('  '));
      }
    }


    // --- Buttons ---
    const btnS = buttonStyle({
      fontSize: `${Math.round(11 * s)}px`,
      strokeThickness: Math.round(3 * s),
    });

    const btnGap = GAP + 2;
    const btnH = BUTTON_H;
    const btnY = height - 16 - AGAIN_H / 2;

    const leave = (): void => {
      sceneManager.goto(this, 'MultiplayerMenuScene', undefined, () => {
        this.cleanupListeners();
        mpClient.leaveLobby();
      });
    };

    // Back to the lobby screen, for anyone; the others see you moved
    const toLobby = (): void => {
      void mpClient.setPlace('lobby').catch(() => null).then(() => {
        const lobbyData = mpClient.lobby;
        if (!lobbyData || !this.scene.isActive()) return;
        sceneManager.goto(this, 'LobbyScene', { lobbyData }, () => this.cleanupListeners());
      });
    };

    const startRun = (data: MPStart): void => {
      sceneManager.goto(this, 'GameScene', {
        multiplayer: true,
        seed: data.seed,
        players: data.players,
        myId: mpClient.myId,
        startsAt: Date.now() + MP_START_LEAD_MS,
        ticket: data.ticket ?? null,
      }, () => this.cleanupListeners());
    };

    // The rematch happens right here: guests ready up with it, the host starts once they all are
    let lobby = mpClient.lobby;
    const me = (): MPPlayer | undefined => lobby?.players.find(p => p.id === myId);
    const amHost = (): boolean => me()?.isHost ?? isHost;
    const guests = (): MPPlayer[] => lobby?.players.filter(p => !p.isHost) ?? [];
    const canStart = (): boolean => lobby?.status === 'waiting' && guests().length > 0 && guests().every(p => p.ready);
    let starting = false;
    const rematchAction = (): void => {
      if (amHost()) {
        if (!canStart() || starting) return;
        starting = true;
        mpClient.startGame().then(startRun).catch(() => { starting = false; });
        return;
      }
      mpClient.setReady(!(me()?.ready ?? false)).then((updated) => { lobby = updated; refresh(); }).catch(() => {});
    };

    // Left to right: leave, watch, the lobby screen, then play again, the big one
    const row: [string, number, () => void][] = [['Opuść', 0x666666, leave]];
    if (DEATH_REPLAY_OFFERED && this.replayData && this.replayData.frames.length > 0) row.push(['Odtwórz śmierć', 0x333366, () => this.playReplay()]);
    row.push(['Lobby', 0x335555, toLobby]);
    const room = width - EDGE * 2 - btnGap * row.length;
    const againW = Math.min(280, Math.floor(room * 0.4));
    const sideW = Math.min(150, Math.floor((room - againW) / row.length));
    const totalW = sideW * row.length + againW + btnGap * row.length;
    let bx = width / 2 - totalW / 2;
    const bottomButtons: UIButton[] = row.map(([label, color, action]) => {
      const button = createButton(this, bx + sideW / 2, btnY, sideW, btnH, label, color, btnS, action);
      bx += sideW + btnGap;
      return button;
    });
    bottomButtons.push(createButton(this, bx + againW / 2, btnY, againW, AGAIN_H, 'Rewanżyk', TAB_ON, buttonStyle({ fontSize: '16px', strokeThickness: 3 }), rematchAction));
    const rematch = bottomButtons[bottomButtons.length - 1];
    // The focus stays where it was, across the buttons changing and a screen rebuilt for a new width
    const keyOf = (button: UIButton | null): string | null => (button === rematch ? REMATCH_FOCUS : button?.txt.text ?? null);
    let focusWas = again?.focus ?? null;
    this.focusKey = () => keyOf(nav.current) ?? focusWas;
    const setNav = (buttons: UIButton[]): void => {
      const keep = keyOf(nav.current) ?? focusWas;
      focusWas = null;
      nav.set(buttons, { initial: buttons.find(b => keyOf(b) === keep) ?? rematch, onBack: leave });
    };

    const hint = this.add.text(width / 2, btnY - AGAIN_H / 2 - 14, '', smallStyle({
      fontSize: '8px',
      color: UI_TEXT.muted,
      strokeThickness: 2,
      align: 'center',
    })).setOrigin(0.5);

    const refresh = (): void => {
      const ready = guests().filter(p => p.ready).length;
      const total = guests().length;
      if (amHost()) {
        rematch.setLabel(`Rewanżyk (${ready}/${total})`);
        rematch.setColor(TAB_ON);
        rematch.setEnabled(canStart());
        hint.setText(total === 0 ? 'Nie ma z kim grać: wszyscy wyszli' : canStart() ? 'Wszyscy gotowi!' : 'Czekamy, aż wszyscy dadzą Rewanżyk');
      } else {
        const isReady = me()?.ready ?? false;
        rematch.setLabel(isReady ? 'Gotowy!' : 'Rewanżyk');
        rematch.setColor(isReady ? 0x2f8a3a : TAB_ON);
        rematch.setEnabled(lobby?.status === 'waiting');
        hint.setText(isReady ? 'Czekamy, aż gospodarz zacznie...' : 'Rewanżyk = gotowy na kolejny zjazd');
      }
    };
    refresh();
    setNav(bottomButtons);

    // --- The okruszki receipt, under the table: the server's answer to this player's run ---
    if (myRanking) {
      const receiptW = Math.min(420, width - 32);
      // Down to the hint over the row of buttons, less the room for its own button when it has one (below)
      const receipt = new CrumbReceipt(this, { x: Math.round(width / 2 - receiptW / 2), y: tableBottom + 12, w: receiptW, bottom: hint.y - 16 });
      receipt.showPending();
      this.input.on('pointerdown', () => receipt.skip());
      // Asked once, here, and kept: a rebuild of the screen paints the same answer
      this.task = again?.task ?? Promise.all([
        data.result ?? Promise.resolve<RunResult>({ kind: 'none' }),
        fetchScores().then((scores) => myRanking.score > 0 && (scores.length < 100 || myRanking.score > scores[scores.length - 1].score)).catch(() => false),
      ]).then(([run, inTop100]): Settled => ({ run, inTop100, saved: null }));
      void this.task.then((settled) => {
        if (generation !== this.generation || !this.scene.isActive()) return;
        const instant = this.painted;
        this.painted = true;
        const { run, inTop100 } = settled;
        const user = account();
        const guest = run.kind === 'checked' && !run.receipt.paid && run.receipt.counted;
        const ranked = run.kind === 'checked' && run.receipt.board !== null;
        if (run.kind === 'checked' && ((guest && signInAvailable()) || (user && inTop100 && ranked))) receipt.area.bottom -= BUTTON_H + 8;
        receipt.show(run, {
          guestLine: (crumbs) => signInAvailable() ? `Zaloguj się, żeby dostać ${crumbs} okr. i zapisać wynik` : `Z kontem dostał(a)byś ${crumbs} okr.`,
        });
        if (instant) receipt.skip();
        if (run.kind !== 'checked') return;
        const buttonY = receipt.bottom + 8 + BUTTON_H / 2;
        const said = (saved: boolean): void => {
          this.add.text(width / 2, buttonY, saved ? `Zapisano jako ${user?.name}` : 'Nie udało się zapisać', smallStyle({
            color: saved ? UI_TEXT.named : '#e07a6a',
          })).setOrigin(0.5);
        };
        if (guest && signInAvailable()) {
          // Google's own button (its branding rules); the sign-in leaves the lobby, and comes back to this run's game over
          const stats = myRanking.stats || {};
          const num = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined);
          const view = {
            score: myRanking.score, distance: num(stats.distance), timeSurvived: num(stats.timeSurvived), level: num(stats.maxLevel),
            obstacleType: typeof stats.obstacleType === 'string' ? stats.obstacleType : null, maxCombo: num(stats.maxCombo),
            pickupCounts: { apples: num(stats.applesCollected) ?? 0, beers: num(stats.tyskiesCollected) ?? 0, pills: num(stats.pillsCollected) ?? 0 },
            guest: run,
          };
          const button = createButton(this, width / 2, buttonY, 240, BUTTON_H, 'Zaloguj przez Google', 0, buttonStyle({ fontSize: '8px', strokeThickness: 2 }), () => {
            this.cleanupListeners();
            mpClient.leaveLobby();
            signIn({ ticket: run.ticket, board: inTop100, view });
          }, { google: true });
          setNav([button, ...bottomButtons]);
        } else if (user && inTop100 && ranked) {
          if (settled.saved === 'yes' || settled.saved === 'no') { said(settled.saved === 'yes'); return; }
          if (settled.saved === 'saving') return;
          const button = createButton(this, width / 2, buttonY, 240, BUTTON_H, 'Zapisz wynik', 0x008800, buttonStyle({ fontSize: '10px', strokeThickness: 2 }), () => {
            settled.saved = 'saving';
            for (const obj of button.all) obj.destroy();
            setNav(bottomButtons);
            void rankRun(run.ticket).then((saved) => {
              settled.saved = saved ? 'yes' : 'no';
              // The screen may have been built again while it was asked: the line goes on whichever one is up
              if (this.scene.isActive()) said(saved);
            });
          });
          setNav([button, ...bottomButtons]);
        }
      });
    }

    // --- Socket listeners ---
    this.lobbyUpdatedHandler = (lobbyData) => {
      lobby = lobbyData;
      refresh();
    };
    mpClient.on('lobby:updated', this.lobbyUpdatedHandler);
    this.gameStartHandler = startRun;
    mpClient.on('game:start', this.gameStartHandler);

    const stopWatchingDrop = mpClient.onDrop(() => {
      sceneManager.goto(this, 'MultiplayerMenuScene', { notice: 'Utracono połączenie z serwerem' });
    });

    this.events.once('shutdown', () => {
      stopWatchingDrop();
      this.cleanupListeners();
    });
  }

  private playReplay(): void {
    if (!this.replayData || this.replayData.frames.length < 2) return;
    new DeathReplayPlayer(this, this.replayData).play();
  }

  private cleanupListeners(): void {
    if (this.lobbyUpdatedHandler) {
      mpClient.off('lobby:updated', this.lobbyUpdatedHandler);
      this.lobbyUpdatedHandler = null;
    }
    if (this.gameStartHandler) {
      mpClient.off('game:start', this.gameStartHandler);
      this.gameStartHandler = null;
    }
  }
}
