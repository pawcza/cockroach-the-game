import Phaser from 'phaser';
import { mpClient, MPLobbyData, MPPlayer, type MPStart } from '../multiplayer/MultiplayerClient';
import { MP_START_LEAD_MS, PLAYER_COLORS } from '../../server/lobby';
import { bodyStyle, buttonStyle, capCentreShift, UI_TEXT } from '../utils/TextStyles';
import { createSceneBackground } from '../ui/SceneBackground';
import { createButton, createPanel, UIButton } from '../ui/shared';
import { MenuNav } from '../ui/MenuNav';
import { addPageHeader, BACK_W, contentArea, EDGE, GAP, TOUCH_MIN } from '../ui/kit';
import { createScrollList, type ScrollList } from '../ui/ScrollList';
import { sceneManager } from '../systems/SceneManager';
import { packs } from './DeferredLoadScene';
import { matchRequires } from '../config/packs';
import { PACK_LOADED_EVENT } from '../systems/PackLoader';

/** Where a player is, shown beside their name; nothing for the lobby itself. */
const PLACE_LABEL: Record<string, string> = { game: 'w grze', watching: 'widz', results: 'na wynikach' };

const PRIMARY_H = 56;
const PRIMARY_W = 400;
const COLOR_W = 180;
const HEAD_H = 40;
const ROW_H = 56;
const READY = 0x2f8a3a;
const NOT_READY = 0xe8c15a;
const SWATCH = 24;

export class LobbyScene extends Phaser.Scene {
  private lobbyData!: MPLobbyData;
  private page!: Phaser.GameObjects.Container;
  private list!: ScrollList;
  private listRect = { x: 0, y: 0, w: 0, h: 0 };
  private startBtn!: UIButton;
  private readyBtn!: UIButton;
  private colorBtn!: UIButton;
  private leaveBtn!: UIButton;
  private nav!: MenuNav;
  private playerCountText!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private lobbyUpdatedHandler!: (data: MPLobbyData) => void;
  private gameStartHandler!: (data: MPStart) => void;
  private starting = false;
  /** Built again for a new width: nothing is told to the server or the other players again. */
  private rebuilt = false;

  constructor() {
    super({ key: 'LobbyScene' });
  }

  /** viewport-fit: a new screen width builds this screen again: same lobby, no leaving, no joining, no start pressed twice. */
  relayoutData(): { lobbyData: MPLobbyData; relayout: true; starting: boolean } {
    return { lobbyData: this.lobbyData, relayout: true, starting: this.starting };
  }

  init(data: { lobbyData: MPLobbyData; relayout?: boolean; starting?: boolean }): void {
    this.lobbyData = mpClient.freshestLobby(data.lobbyData);
    this.starting = data.starting ?? false;
    this.rebuilt = data.relayout === true;
  }

  create(): void {
    const { width, height } = this.cameras.main;

    createSceneBackground(this, { level: 6, dim: 0.55 });
    this.nav = new MenuNav(this);

    this.page = this.add.container(0, 0);
    this.leaveBtn = addPageHeader(this, this.page, width, this.titleFor(), () => this.leave());
    // The lobby's name is its host's: the header's title, kept up to date when the host changes
    this.titleText = this.page.list.find((o): o is Phaser.GameObjects.Text => o instanceof Phaser.GameObjects.Text)!;
    this.showTitle();

    const area = contentArea(width, height);
    const actionY = area.y + area.h - PRIMARY_H;

    // --- PLAYER LIST ---
    this.listRect = { x: area.x, y: area.y, w: area.w, h: actionY - GAP - area.y };
    const { x: lx, y: ly, w: lw, h: lh } = this.listRect;
    this.page.add(createPanel(this, lx, ly, lw, lh));
    this.playerCountText = this.add.text(lx + 16, ly + HEAD_H / 2, '', bodyStyle({ fontSize: '12px', color: UI_TEXT.muted, strokeThickness: 0 })).setOrigin(0, 0.5);
    this.page.add(this.playerCountText);
    this.page.add(this.add.graphics().fillStyle(0x3d2e25, 1).fillRect(lx, ly + HEAD_H - 2, lw, 2));
    this.list = createScrollList(this, this.page, { x: lx, y: ly + HEAD_H, w: lw, h: lh - HEAD_H - 2 }, { step: ROW_H });

    // --- BUTTONS ---
    const btnS = buttonStyle({ fontSize: '16px' });
    const primaryW = Math.min(PRIMARY_W, area.w - COLOR_W - GAP);
    const rowW = primaryW + GAP + COLOR_W;
    const primaryX = Math.round(width / 2 - rowW / 2 + primaryW / 2);
    const colorX = Math.round(width / 2 + rowW / 2 - COLOR_W / 2);
    const actionCy = actionY + PRIMARY_H / 2;

    // "Gotowy" ready toggle button (non-host only)
    this.readyBtn = createButton(this, primaryX, actionCy, primaryW, PRIMARY_H, 'Gotowy?', NOT_READY, btnS, () => {
      if (!this.packsReady()) return;
      const me = this.lobbyData.players.find(p => p.id === mpClient.myId);
      const newReady = !(me?.ready);
      mpClient.setReady(newReady).then((updatedLobby) => {
        // Answers land on whichever build is up (this scene's fields are the live build's), none once it has been left
        if (!this.scene.isActive()) return;
        this.lobbyData = updatedLobby;
        this.renderPlayerList();
        this.updateStartButton();
        this.updateReadyButton();
      }).catch((err) => { console.error('setReady failed:', err); });
    });

    // "Rozpocznij Gre" button (host only, same position)
    this.startBtn = createButton(this, primaryX, actionCy, primaryW, PRIMARY_H, 'Rozpocznij Grę', READY, btnS, () => {
      if (this.isStartEnabled() && !this.starting) {
        this.starting = true;
        mpClient.startGame().then((res) => {
          if (!this.scene.isActive()) return;
          const startsAt = Date.now() + MP_START_LEAD_MS;
          sceneManager.goto(this, 'GameScene', {
            multiplayer: true,
            seed: res.seed,
            players: res.players,
            myId: mpClient.myId,
            startsAt,
            ticket: res.ticket ?? null,
          });
        }).catch((err) => {
          this.starting = false;
          console.error('startGame failed:', err);
        });
      }
    });

    // Your colour, also from the keyboard: tapping your own swatch does the same
    this.colorBtn = createButton(this, colorX, actionCy, COLOR_W, PRIMARY_H, 'Zmień kolor', 0x444444, buttonStyle({ fontSize: '10px' }), () => this.cycleColor());
    this.page.add([...this.readyBtn.all, ...this.startBtn.all, ...this.colorBtn.all]);

    // --- RENDER INITIAL STATE ---
    this.renderPlayerList();
    this.updateStartButton();
    this.updateReadyButton();
    this.refreshNav();

    // --- SOCKET EVENT LISTENERS ---
    this.lobbyUpdatedHandler = (data: MPLobbyData) => {
      this.lobbyData = data;
      this.showTitle();
      this.renderPlayerList();
      this.updateStartButton();
      this.updateReadyButton();
    };

    this.gameStartHandler = (data: MPStart) => {
      sceneManager.goto(this, 'GameScene', {
        multiplayer: true,
        seed: data.seed,
        players: data.players,
        myId: mpClient.myId,
        startsAt: Date.now() + MP_START_LEAD_MS,
        ticket: data.ticket ?? null,
      });
    };

    mpClient.on('lobby:updated', this.lobbyUpdatedHandler);
    mpClient.on('game:start', this.gameStartHandler);

    // Arriving from the results: tell the others you're back in the lobby
    const me = this.lobbyData.players.find(p => p.id === mpClient.myId);
    if (me && me.place !== 'lobby' && this.lobbyData.status === 'waiting' && !this.rebuilt) {
      mpClient.setPlace('lobby').then((updated) => {
        if (!this.scene.isActive()) return;
        this.lobbyData = updated;
        this.renderPlayerList();
        this.updateStartButton();
      }).catch(() => {});
    }

    // A match never waits once it starts: you can be ready (or, hosting, start it) only with what it requires loaded
    const onPack = (): void => { this.updateStartButton(); this.updateReadyButton(); };
    this.game.events.on(PACK_LOADED_EVENT, onPack);
    // Failing (a dead connection), it asks again every few seconds while the lobby is open; the button says so meanwhile
    const load = (): void => {
      void packs(this.game).ensure(matchRequires()).then((failed) => {
        if (!this.scene.isActive()) return;
        onPack();
        if (failed.length > 0) this.time.delayedCall(3000, load);
      });
    };
    load();

    const stopWatchingDrop = mpClient.onDrop(() => {
      sceneManager.goto(this, 'MultiplayerMenuScene', { notice: 'Utracono połączenie z serwerem' });
    });

    // Phaser keeps a scene's data when it is next started without any: a later visit starts from what the caller says
    this.sys.settings.data = {};

    // Cleanup on scene shutdown
    this.events.once('shutdown', () => {
      mpClient.off('lobby:updated', this.lobbyUpdatedHandler);
      mpClient.off('game:start', this.gameStartHandler);
      this.game.events.off(PACK_LOADED_EVENT, onPack);
      stopWatchingDrop();
    });
  }

  private titleFor(): string {
    return `Lobby: ${this.getHostName()}`;
  }

  /** The header's title, cut short of the back button's side if the host's name is long. */
  private showTitle(): void {
    // Clear of the back button on the left and the same on the right, so it stays centred
    const room = this.cameras.main.width - 2 * (EDGE + BACK_W + GAP);
    let host = this.getHostName();
    this.titleText.setText(this.titleFor());
    while (this.titleText.width > room && host.length > 1) {
      host = host.slice(0, -1);
      this.titleText.setText(`Lobby: ${host.trimEnd()}…`);
    }
  }

  private leave(): void {
    sceneManager.goto(this, 'MultiplayerMenuScene', undefined, () => {
      mpClient.leaveLobby();
    });
  }

  /** The action button is Start for the host and Ready for everyone else; the arrows only reach what's shown. */
  private refreshNav(): void {
    const action = this.isHost() ? this.startBtn : this.readyBtn;
    this.nav.set([this.leaveBtn, action, this.colorBtn], { initial: action.enabled ? action : this.colorBtn, onBack: () => this.leave() });
  }

  private cycleColor(): void {
    const me = this.lobbyData.players.find(p => p.id === mpClient.myId);
    if (!me) return;
    const usedColors = new Set(this.lobbyData.players.filter(p => p.id !== me.id).map(p => p.color));
    let next = (me.color + 1) % PLAYER_COLORS.length;
    const start = next;
    while (usedColors.has(next)) {
      next = (next + 1) % PLAYER_COLORS.length;
      if (next === start) return;
    }
    mpClient.changeColor(next).then((updatedLobby) => {
      if (!this.scene.isActive()) return;
      this.lobbyData = updatedLobby;
      this.renderPlayerList();
      this.updateStartButton();
    }).catch(() => {});
  }

  private getHostName(): string {
    const host = this.lobbyData.players.find(p => p.isHost);
    return host ? host.name : 'Unknown';
  }

  private isHost(): boolean {
    return this.lobbyData.players.some(p => p.id === mpClient.myId && p.isHost);
  }

  /** What a match requires is loaded on this client (src/config/packs.ts matchRequires). */
  private packsReady(): boolean {
    return packs(this.game).allReady(matchRequires());
  }

  private isStartEnabled(): boolean {
    return this.isHost()
      && this.packsReady()
      && this.lobbyData.players.length >= 2
      && this.lobbyData.players.every(p => p.isHost || p.ready);
  }

  private updateStartButton(): void {
    const isHostPlayer = this.isHost();
    for (const obj of this.startBtn.all) (obj as unknown as Phaser.GameObjects.Components.Visible).setVisible(isHostPlayer);
    const wasEnabled = this.startBtn.enabled;
    this.startBtn.setEnabled(isHostPlayer && this.isStartEnabled());
    this.startBtn.setLabel(this.startBtn.enabled ? 'Rozpocznij Grę' : this.packsReady() ? 'Czekam na gotowych' : 'Wczytywanie...');
    if (wasEnabled !== this.startBtn.enabled) this.refreshNav();
  }

  private updateReadyButton(): void {
    const isHost = this.isHost();
    for (const obj of this.readyBtn.all) (obj as unknown as Phaser.GameObjects.Components.Visible).setVisible(!isHost);
    if (isHost) return;

    const me = this.lobbyData.players.find(p => p.id === mpClient.myId);
    const isReady = me?.ready ?? false;
    const loaded = this.packsReady();
    this.readyBtn.setEnabled(loaded);
    this.readyBtn.setColor(isReady ? READY : NOT_READY);
    this.readyBtn.setLabel(!loaded ? 'Wczytywanie...' : isReady ? 'Gotowy!  (odznacz)' : 'Gotowy?');
  }

  private renderPlayerList(): void {
    const { x, y, w } = this.listRect;
    const content = this.list.content;
    const top = y + HEAD_H;
    content.removeAll(true);

    this.playerCountText.setText(`${this.lobbyData.players.length}/16 karaluchów`);
    this.playerCountText.setY(Math.round(y + HEAD_H / 2 + capCentreShift(this.playerCountText)));

    const rowW = w - 28;
    const left = x + 8;
    const right = left + rowW - 16;
    this.lobbyData.players.forEach((player, i) => {
      const cy = top + 8 + i * (ROW_H + GAP / 2) + ROW_H / 2;
      const isMe = player.id === mpClient.myId;

      // The rows sit as slabs; yours is lit like a focused button
      const slab = this.add.graphics()
        .fillStyle(isMe ? 0x2a1f18 : 0x1d1713, 1).fillRect(left, cy - ROW_H / 2, rowW, ROW_H)
        .fillStyle(0x000000, 0.3).fillRect(left, cy + ROW_H / 2 - 2, rowW, 2);
      if (isMe) slab.fillStyle(0xe8c15a, 1).fillRect(left, cy - ROW_H / 2, 4, ROW_H);
      content.add(slab);

      const swatch = this.add.rectangle(left + 16 + SWATCH / 2, cy, SWATCH, SWATCH, PLAYER_COLORS[player.color] ?? 0xffffff, 1)
        .setStrokeStyle(2, isMe ? 0xfff1c2 : 0x000000);
      content.add(swatch);
      if (isMe) {
        // A swatch is too small to hit: the tap area around it is a button's size
        const hit = this.add.rectangle(swatch.x, cy, TOUCH_MIN, TOUCH_MIN, 0x000000, 0).setInteractive({ useHandCursor: true });
        hit.on('pointerup', () => this.cycleColor());
        content.add(hit);
      }

      const text = (tx: number, content_: string, color: string, size: string, originX: number): Phaser.GameObjects.Text => {
        const t = this.add.text(tx, cy, content_, bodyStyle({ fontSize: size, color, strokeThickness: 0 })).setOrigin(originX, 0.5);
        t.setY(Math.round(cy + capCentreShift(t)));
        content.add(t);
        return t;
      };
      // Right: whether they are ready (the host has nothing to be ready for); left of it, where they are, so nobody waits
      // on someone still looking at the results or still running
      const state = player.isHost ? text(right, 'host', UI_TEXT.amber, '16px', 1)
        : text(right, player.ready ? 'gotowy' : 'czeka', player.ready ? '#9fe08a' : UI_TEXT.muted, '16px', 1);
      let edge = state.x - state.width - 16;
      const where = PLACE_LABEL[player.place];
      if (where) {
        const place = text(edge, where, player.place === 'game' ? '#e0a040' : '#8fc7d8', '12px', 1);
        edge = place.x - place.width - 16;
      }
      const name = text(left + 16 + SWATCH + 12, player.name, isMe ? '#fff1c2' : UI_TEXT.bone, '16px', 0);
      let shown = player.name;
      while (name.x + name.width > edge && shown.length > 1) {
        shown = shown.slice(0, -1);
        name.setText(`${shown.trimEnd()}…`);
      }
    });
    this.list.setContentHeight(8 + this.lobbyData.players.length * (ROW_H + GAP / 2));
  }
}
