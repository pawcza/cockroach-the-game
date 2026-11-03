import Phaser from 'phaser';
import { mpClient, MPLobbyData, MPLobbyListEntry } from '../multiplayer/MultiplayerClient';
import { titleStyle, bodyStyle, smallStyle, buttonStyle, UI_TEXT } from '../utils/TextStyles';
import { createSceneBackground } from '../ui/SceneBackground';
import { createButton, createPanel, UIButton } from '../ui/shared';
import { MenuNav } from '../ui/MenuNav';
import { sceneManager } from '../systems/SceneManager';
import { getPlayerName, getPlayerNameOrDefault } from '../utils/Storage';
import { showNameInput } from '../ui/NameInputOverlay';

export class MultiplayerMenuScene extends Phaser.Scene {
  private lobbyContainer!: Phaser.GameObjects.Container;
  private lobbyMask!: Phaser.Display.Masks.GeometryMask;
  private lobbyMaskGraphics!: Phaser.GameObjects.Graphics;
  private nicknameText!: Phaser.GameObjects.Text;
  private scrollY = 0;
  private maxScroll = 0;
  private lobbies: MPLobbyListEntry[] = [];
  private lobbiesHandler!: (lobbies: MPLobbyListEntry[]) => void;
  private entering = false;
  private nav!: MenuNav;
  private onBack: () => void = () => {};
  private fixedButtons: UIButton[] = [];
  private createBtn!: UIButton;

  constructor() {
    super({ key: 'MultiplayerMenuScene' });
  }

  create(data?: { notice?: string }): void {
    const { width, height } = this.cameras.main;
    this.entering = false;
    this.scrollY = 0;

    createSceneBackground(this, { level: 6, dim: 0.55 });
    this.nav = new MenuNav(this);

    this.add.text(Math.round(width / 2), 48, 'ZJAZD KARALUCHÓW', titleStyle({
      fontSize: '26px',
      color: UI_TEXT.bone,
      strokeThickness: 7,
      shadow: { offsetX: 0, offsetY: 4, color: '#0d2a3a', blur: 0, fill: true, stroke: true },
    })).setOrigin(0.5);
    this.add.text(Math.round(width / 2), 80, 'Do 16 karaluchów na jednym torze', bodyStyle({
      fontSize: '9px',
      color: '#8fc7d8',
    })).setOrigin(0.5);

    // --- NICKNAME DISPLAY ---
    const nickname = getPlayerName();
    this.nicknameText = this.add.text(Math.round(width / 2) - 40, 116, `Gracz: ${nickname || getPlayerNameOrDefault()}`, smallStyle({
      fontSize: '9px',
      color: nickname ? UI_TEXT.named : UI_TEXT.bone,
      strokeThickness: 3,
    })).setOrigin(0.5);

    const nameBtn = createButton(this, width / 2 + 150, 116, 72, 22, 'Zmień', 0x444444, smallStyle({ fontSize: '7px' }), () => {
      this.nav.enabled = false;
      showNameInput(this, (newName) => {
        mpClient.setName(newName);
        this.nicknameText.setText(`Gracz: ${newName}`);
        this.nicknameText.setColor(UI_TEXT.named);
      }, undefined, () => { this.nav.enabled = true; });
    });

    // --- LOBBY LIST AREA ---
    const listTop = 145;
    const listBottom = height - 100;
    const listHeight = listBottom - listTop;

    createPanel(this, 20, listTop, width - 40, listHeight);

    // Scrollable container for lobby entries
    this.lobbyContainer = this.add.container(0, 0);
    this.lobbyMaskGraphics = this.make.graphics({});
    this.lobbyMaskGraphics.fillRect(20, listTop, width - 40, listHeight);
    this.lobbyMask = new Phaser.Display.Masks.GeometryMask(this, this.lobbyMaskGraphics);
    this.lobbyContainer.setMask(this.lobbyMask);

    // Scroll with mouse wheel
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gos: unknown[], _dx: number, dy: number) => {
      this.scrollY = Phaser.Math.Clamp(this.scrollY + dy * 0.5, 0, this.maxScroll);
      this.lobbyContainer.y = -this.scrollY;
    });

    // Touch drag scrolling
    let dragStartY = 0;
    let dragScrollStart = 0;
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.y >= listTop && pointer.y <= listBottom) {
        dragStartY = pointer.y;
        dragScrollStart = this.scrollY;
      }
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || pointer.y < listTop || pointer.y > listBottom) return;
      const delta = dragStartY - pointer.y;
      this.scrollY = Phaser.Math.Clamp(dragScrollStart + delta, 0, this.maxScroll);
      this.lobbyContainer.y = -this.scrollY;
    });

    // --- BOTTOM BUTTONS ---
    const btnS = buttonStyle({ fontSize: '11px' });

    this.createBtn = createButton(this, width / 2, height - 72, 300, 38, 'Stwórz Lobby', 0x006688, btnS, () => this.handleCreateLobby());
    const back = (): void => {
      sceneManager.goto(this, 'MenuScene', undefined, () => {
        mpClient.disconnect();
      });
    };
    const backBtn = createButton(this, width / 2, height - 28, 220, 30, 'Powrót', 0x444444, buttonStyle({ fontSize: '10px' }), back);
    this.fixedButtons = [nameBtn, this.createBtn, backBtn];
    this.onBack = back;

    // --- CONNECT AND LISTEN FOR LOBBY UPDATES ---
    mpClient.connect();
    mpClient.setName(getPlayerNameOrDefault());

    // Render initial empty state
    this.renderLobbies();

    // Listen for real-time lobby list pushes from server
    this.lobbiesHandler = (lobbies: MPLobbyListEntry[]) => {
      this.lobbies = lobbies;
      this.renderLobbies();
    };
    mpClient.on('lobbies:updated', this.lobbiesHandler);

    // Join the lobby-browser room on every (re)connect
    const browseHandler = (): void => { mpClient.startBrowsing(); };
    mpClient.onConnect(browseHandler);

    // Cleanup on scene shutdown
    this.events.once('shutdown', () => {
      mpClient.off('lobbies:updated', this.lobbiesHandler);
      mpClient.offConnect(browseHandler);
      mpClient.stopBrowsing();
      this.lobbyMaskGraphics.destroy();
    });

    if (data?.notice) this.showNotice(data.notice);
  }

  private showNotice(message: string): void {
    const { width, height } = this.cameras.main;
    const notice = this.add.text(width / 2, height - 115, message, smallStyle({
      fontSize: '9px',
      color: '#e07a6a',
      strokeThickness: 3,
    })).setOrigin(0.5);
    this.tweens.add({
      targets: notice,
      alpha: 0,
      delay: 3000,
      duration: 500,
      onComplete: () => notice.destroy(),
    });
  }

  private renderLobbies(): void {
    const { width } = this.cameras.main;
    const listTop = 145;
    const listBottom = this.cameras.main.height - 100;
    const listHeight = listBottom - listTop;
    const lineHeight = 36;

    this.lobbyContainer.removeAll(true);

    if (this.lobbies.length === 0) {
      const emptyTop = this.add.text(width / 2, listTop + listHeight / 2 - 14, 'Pusto tu...', titleStyle({
        fontSize: '14px',
        color: UI_TEXT.bone,
        align: 'center',
      })).setOrigin(0.5);
      const emptyBottom = this.add.text(width / 2, listTop + listHeight / 2 + 14, 'Stwórz lobby i zaczynaj imprezę!', bodyStyle({
        fontSize: '9px',
        color: UI_TEXT.muted,
        align: 'center',
        strokeThickness: 0,
      })).setOrigin(0.5);
      this.lobbyContainer.add([emptyTop, emptyBottom]);
      this.nav.set(this.fixedButtons, { initial: this.createBtn, onBack: this.onBack });
      this.maxScroll = 0;
      this.scrollY = 0;
      this.lobbyContainer.y = 0;
      return;
    }

    const rows: UIButton[] = [];
    const rowStyle = smallStyle({ fontSize: '9px', strokeThickness: 0 });
    for (let i = 0; i < this.lobbies.length; i++) {
      const lobby = this.lobbies[i];
      const y = listTop + 12 + i * lineHeight + lineHeight / 2;
      const canJoin = lobby.status === 'waiting' || lobby.status === 'postgame';
      const status = lobby.status === 'waiting' ? 'czeka' : lobby.status === 'ingame' ? 'w grze' : 'po grze';
      const color = lobby.status === 'waiting' ? 0x2f8a3a : lobby.status === 'ingame' ? 0x8a2f2f : 0x8a6a2f;
      const row = createButton(this, width / 2, y, width - 72, lineHeight - 8,
        `${lobby.host} — ${lobby.playerCount}/16 — ${status}`, color, rowStyle, () => this.handleJoinLobby(lobby.id));
      row.setEnabled(canJoin);
      this.lobbyContainer.add(row.all);
      rows.push(row);
    }
    this.nav.set([...this.fixedButtons, ...rows], { initial: rows.find(r => r.enabled) ?? this.createBtn, onBack: this.onBack });

    const totalHeight = this.lobbies.length * lineHeight;
    this.maxScroll = Math.max(0, totalHeight - listHeight);
    this.scrollY = Math.min(this.scrollY, this.maxScroll);
    this.lobbyContainer.y = -this.scrollY;
  }

  private async enterLobby(request: () => Promise<MPLobbyData>, failure: string): Promise<void> {
    if (this.entering) return;
    this.entering = true;
    mpClient.setName(getPlayerNameOrDefault());
    try {
      const lobbyData = await request();
      sceneManager.goto(this, 'LobbyScene', { lobbyData });
    } catch {
      this.entering = false;
      this.showNotice(failure);
    }
  }

  private handleJoinLobby(lobbyId: string): void {
    void this.enterLobby(() => mpClient.joinLobby(lobbyId), 'Nie udało się dołączyć do lobby');
  }

  private handleCreateLobby(): void {
    void this.enterLobby(() => mpClient.createLobby(), 'Nie udało się stworzyć lobby');
  }
}
