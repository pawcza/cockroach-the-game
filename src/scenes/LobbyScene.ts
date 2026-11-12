import Phaser from 'phaser';
import { mpClient, MPLobbyData, MPPlayer } from '../multiplayer/MultiplayerClient';
import { MP_START_LEAD_MS, PLAYER_COLORS } from '../../server/lobby';
import { titleStyle, smallStyle, buttonStyle, UI_TEXT } from '../utils/TextStyles';
import { createSceneBackground } from '../ui/SceneBackground';
import { createButton, createPanel, UIButton } from '../ui/shared';
import { MenuNav } from '../ui/MenuNav';
import { sceneManager } from '../systems/SceneManager';

/** Where a player is, shown beside their name; nothing for the lobby itself. */
const PLACE_LABEL: Record<string, string> = { game: 'w grze', watching: 'widz', results: 'na wynikach' };

export class LobbyScene extends Phaser.Scene {
  private lobbyData!: MPLobbyData;
  private playerListContainer!: Phaser.GameObjects.Container;
  private startBtn!: UIButton;
  private readyBtn!: UIButton;
  private colorBtn!: UIButton;
  private leaveBtn!: UIButton;
  private nav!: MenuNav;
  private playerCountText!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private lobbyUpdatedHandler!: (data: MPLobbyData) => void;
  private gameStartHandler!: (data: { seed: number; players: MPPlayer[] }) => void;
  private starting = false;

  constructor() {
    super({ key: 'LobbyScene' });
  }

  init(data: { lobbyData: MPLobbyData }): void {
    this.lobbyData = mpClient.freshestLobby(data.lobbyData);
    this.starting = false;
  }

  create(): void {
    const { width, height } = this.cameras.main;

    createSceneBackground(this, { level: 6, dim: 0.55 });
    this.nav = new MenuNav(this);

    // --- TITLE ---
    this.titleText = this.add.text(Math.round(width / 2), 38, this.titleFor(), titleStyle({
      fontSize: '18px',
      color: UI_TEXT.bone,
      strokeThickness: 6,
      shadow: { offsetX: 0, offsetY: 3, color: '#0d2a3a', blur: 0, fill: true, stroke: true },
    })).setOrigin(0.5);

    // --- PLAYER COUNT ---
    this.playerCountText = this.add.text(Math.round(width / 2), 66, '', smallStyle({
      fontSize: '9px',
      color: '#8fc7d8',
      strokeThickness: 3,
    })).setOrigin(0.5);

    // --- PLAYER LIST ---
    const listTop = 90;
    const listBottom = height - 110;
    const listHeight = listBottom - listTop;

    createPanel(this, 20, listTop, width - 40, listHeight);

    this.playerListContainer = this.add.container(0, 0);

    // Mask for player list
    const maskGraphics = this.make.graphics({});
    maskGraphics.fillRect(20, listTop, width - 40, listHeight);
    this.playerListContainer.setMask(new Phaser.Display.Masks.GeometryMask(this, maskGraphics));

    // --- BUTTONS ---
    const btnS = buttonStyle({ fontSize: '11px' });

    // Main action button position
    const actionBtnY = height - 66;
    const sideW = 170;
    const sideX = 300 / 2 + 12 + sideW / 2;

    // "Gotowy" ready toggle button (non-host only)
    this.readyBtn = createButton(this, width / 2, actionBtnY, 300, 38, 'Gotowy?', 0x886600, btnS, () => {
      const me = this.lobbyData.players.find(p => p.id === mpClient.myId);
      const newReady = !(me?.ready);
      mpClient.setReady(newReady).then((updatedLobby) => {
        this.lobbyData = updatedLobby;
        this.renderPlayerList();
        this.updateStartButton();
        this.updateReadyButton();
      }).catch((err) => { console.error('setReady failed:', err); });
    });

    // "Rozpocznij Gre" button (host only, same position)
    this.startBtn = createButton(this, width / 2, actionBtnY, 300, 38, 'Rozpocznij Grę', 0x008800, btnS, () => {
      if (this.isStartEnabled() && !this.starting) {
        this.starting = true;
        mpClient.startGame().then((res) => {
          const startsAt = Date.now() + MP_START_LEAD_MS;
          sceneManager.goto(this, 'GameScene', {
            multiplayer: true,
            seed: res.seed,
            players: res.players,
            myId: mpClient.myId,
            startsAt,
          });
        }).catch((err) => {
          this.starting = false;
          console.error('startGame failed:', err);
        });
      }
    });

    // Your colour, also from the keyboard: clicking your own swatch does the same
    this.colorBtn = createButton(this, width / 2 + sideX, actionBtnY, sideW, 30, 'Zmień kolor', 0x444444, buttonStyle({ fontSize: '9px' }), () => this.cycleColor());

    this.leaveBtn = createButton(this, width / 2, height - 24, 220, 30, 'Opuść', 0x660000, buttonStyle({ fontSize: '10px' }), () => this.leave(), { sound: 'back' });

    // --- RENDER INITIAL STATE ---
    this.renderPlayerList();
    this.updateStartButton();
    this.updateReadyButton();
    this.refreshNav();

    // --- SOCKET EVENT LISTENERS ---
    this.lobbyUpdatedHandler = (data: MPLobbyData) => {
      this.lobbyData = data;
      this.titleText.setText(this.titleFor());
      this.renderPlayerList();
      this.updateStartButton();
      this.updateReadyButton();
    };

    this.gameStartHandler = (data: { seed: number; players: MPPlayer[] }) => {
      sceneManager.goto(this, 'GameScene', {
        multiplayer: true,
        seed: data.seed,
        players: data.players,
        myId: mpClient.myId,
        startsAt: Date.now() + MP_START_LEAD_MS,
      });
    };

    mpClient.on('lobby:updated', this.lobbyUpdatedHandler);
    mpClient.on('game:start', this.gameStartHandler);

    // Arriving from the results: tell the others you're back in the lobby
    const me = this.lobbyData.players.find(p => p.id === mpClient.myId);
    if (me && me.place !== 'lobby' && this.lobbyData.status === 'waiting') {
      mpClient.setPlace('lobby').then((updated) => {
        if (!this.scene.isActive()) return;
        this.lobbyData = updated;
        this.renderPlayerList();
        this.updateStartButton();
      }).catch(() => {});
    }

    const stopWatchingDrop = mpClient.onDrop(() => {
      sceneManager.goto(this, 'MultiplayerMenuScene', { notice: 'Utracono połączenie z serwerem' });
    });

    // Cleanup on scene shutdown
    this.events.once('shutdown', () => {
      mpClient.off('lobby:updated', this.lobbyUpdatedHandler);
      mpClient.off('game:start', this.gameStartHandler);
      stopWatchingDrop();
      maskGraphics.destroy();
    });
  }

  private titleFor(): string {
    return `Lobby: ${this.getHostName()}`;
  }

  private leave(): void {
    sceneManager.goto(this, 'MultiplayerMenuScene', undefined, () => {
      mpClient.leaveLobby();
    });
  }

  /** The action button is Start for the host and Ready for everyone else; the arrows only reach what's shown. */
  private refreshNav(): void {
    const action = this.isHost() ? this.startBtn : this.readyBtn;
    this.nav.set([action, this.colorBtn, this.leaveBtn], { initial: action.enabled ? action : this.colorBtn, onBack: () => this.leave() });
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

  private isStartEnabled(): boolean {
    return this.isHost()
      && this.lobbyData.players.length >= 2
      && this.lobbyData.players.every(p => p.isHost || p.ready);
  }

  private updateStartButton(): void {
    const isHostPlayer = this.isHost();
    for (const obj of this.startBtn.all) (obj as unknown as Phaser.GameObjects.Components.Visible).setVisible(isHostPlayer);
    const wasEnabled = this.startBtn.enabled;
    this.startBtn.setEnabled(isHostPlayer && this.isStartEnabled());
    this.startBtn.setLabel(this.startBtn.enabled ? 'Rozpocznij Grę' : 'Czekam na gotowych');
    if (wasEnabled !== this.startBtn.enabled) this.refreshNav();
  }

  private updateReadyButton(): void {
    const isHost = this.isHost();
    for (const obj of this.readyBtn.all) (obj as unknown as Phaser.GameObjects.Components.Visible).setVisible(!isHost);
    if (isHost) return;

    const me = this.lobbyData.players.find(p => p.id === mpClient.myId);
    const isReady = me?.ready ?? false;
    this.readyBtn.setColor(isReady ? 0x008800 : 0x886600);
    this.readyBtn.setLabel(isReady ? 'Gotowy!  (odznacz)' : 'Gotowy?');
  }

  private renderPlayerList(): void {
    const { width } = this.cameras.main;
    const listTop = 90;
    const lineHeight = 36;

    this.playerListContainer.removeAll(true);

    // Update player count
    this.playerCountText.setText(`${this.lobbyData.players.length}/16 karaluch\u00f3w`);

    for (let i = 0; i < this.lobbyData.players.length; i++) {
      const player = this.lobbyData.players[i];
      const y = listTop + 10 + i * lineHeight;
      const isMe = player.id === mpClient.myId;

      // Color swatch (24x24)
      const rowY = Math.round(y + lineHeight / 2 - 4);

      // Your own row is lit, like a focused button
      if (isMe) {
        const rowBg = this.add.rectangle(width / 2, rowY, width - 64, lineHeight - 6, 0x2a1f18, 0.9);
        this.playerListContainer.add(rowBg);
      }

      const swatchColor = PLAYER_COLORS[player.color] ?? 0xffffff;
      const swatch = this.add.rectangle(52, rowY, 20, 20, swatchColor, 1);
      if (isMe) {
        swatch.setStrokeStyle(2, 0xfff1c2);
        swatch.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.cycleColor());
      }

      const suffix = player.isHost ? '  · host' : '';
      const nameText = this.add.text(78, rowY, player.name + suffix, smallStyle({
        fontSize: '10px',
        color: isMe ? '#fff1c2' : UI_TEXT.bone,
        strokeThickness: 0,
      })).setOrigin(0, 0.5);

      const items: Phaser.GameObjects.GameObject[] = [swatch, nameText];
      // Where they are, so nobody waits on someone still looking at the results or still running
      const where = PLACE_LABEL[player.place];
      if (where) {
        items.push(this.add.text(width / 2 + 60, rowY, where, smallStyle({
          fontSize: '8px',
          color: player.place === 'game' ? '#e0a040' : '#8fc7d8',
          strokeThickness: 0,
        })).setOrigin(0, 0.5));
      }
      if (!player.isHost) {
        items.push(this.add.text(width - 36, rowY, player.ready ? 'gotowy' : 'czeka', smallStyle({
          fontSize: '8px',
          color: player.ready ? '#9fe08a' : UI_TEXT.muted,
          strokeThickness: 0,
        })).setOrigin(1, 0.5));
      }
      this.playerListContainer.add(items);
    }
  }
}
