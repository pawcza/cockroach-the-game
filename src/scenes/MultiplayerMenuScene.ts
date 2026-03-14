import Phaser from 'phaser';
import { mpClient, MPLobbyListEntry } from '../multiplayer/MultiplayerClient';
import { COLORS } from '../config/constants';
import { titleStyle, bodyStyle, smallStyle, buttonStyle } from '../utils/TextStyles';
import { spawnFloatingParticle } from '../ui/SceneBackground';
import { createButton } from '../ui/shared';
import { crossfadeTransition } from '../utils/SceneTransition';
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

  constructor() {
    super({ key: 'MultiplayerMenuScene' });
  }

  create(): void {
    const { width, height } = this.cameras.main;

    // Background — scale to cover the canvas
    const mpBg = this.add.image(width / 2, height / 2, 'menu-bg-multiplayer');
    mpBg.setScale(Math.max(width / mpBg.width, height / mpBg.height));
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.4);

    // Floating neon particles
    for (let i = 0; i < 10; i++) {
      spawnFloatingParticle(this, width, height, COLORS.NEON);
    }

    // --- TITLE: ZJAZD KARALUCHOW ---
    const title = this.add.text(width / 2, 50, 'ZJAZD\nKARALUCH\u00d3W', titleStyle({
      fontSize: '22px',
      align: 'center',
    })).setOrigin(0.5);

    this.tweens.add({
      targets: title,
      y: title.y - 6,
      angle: { from: -2, to: 2 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Color cycle on title
    const titleColors = ['#ffff00', '#ff6600', '#ff00ff', '#00ffff', '#ffff00'];
    let colorIdx = 0;
    this.time.addEvent({
      delay: 400,
      loop: true,
      callback: () => {
        colorIdx = (colorIdx + 1) % titleColors.length;
        title.setColor(titleColors[colorIdx]);
      },
    });

    // --- NICKNAME DISPLAY ---
    const nickname = getPlayerName();
    this.nicknameText = this.add.text(width / 2, 120, nickname ? `Gracz: ${nickname}` : `Gracz: ${getPlayerNameOrDefault()}`, smallStyle({
      fontSize: '10px',
      color: nickname ? '#00ff66' : '#ffffff',
      strokeThickness: 3,
    })).setOrigin(0.5);

    // "Zmien" button next to nickname
    createButton(this, width / 2 + 140, 120, 80, 24, 'Zmień', 0x444444, smallStyle({ fontSize: '8px' }), () => {
      showNameInput(this, (newName) => {
        mpClient.setName(newName);
        this.nicknameText.setText(`Gracz: ${newName}`);
        this.nicknameText.setColor('#00ff66');
      });
    });

    // --- LOBBY LIST AREA ---
    const listTop = 145;
    const listBottom = height - 100;
    const listHeight = listBottom - listTop;

    // List background
    this.add.rectangle(width / 2, listTop + listHeight / 2, width - 40, listHeight, 0x111122, 0.6);

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

    // "Stworz Lobby" button
    const { bg: createBg } = createButton(this, width / 2, height - 72, 260, 36, 'Stw\u00f3rz Lobby', 0x006688, btnS, () => this.handleCreateLobby());

    this.tweens.add({
      targets: createBg,
      alpha: { from: 0.85, to: 1 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // "Powrot" back button
    createButton(this, width / 2, height - 30, 200, 30, '\u2190 Powr\u00f3t', 0x444444, buttonStyle({ fontSize: '10px' }), () => {
      mpClient.disconnect();
      crossfadeTransition(500, () => this.scene.start('MenuScene'));
    });

    // --- CONNECT AND LISTEN FOR LOBBY UPDATES ---
    mpClient.connect();
    const name = getPlayerName();
    if (name) {
      mpClient.setName(name);
    } else {
      mpClient.setName(getPlayerNameOrDefault());
    }

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
    this.events.on('shutdown', () => {
      mpClient.off('lobbies:updated', this.lobbiesHandler);
      mpClient.offConnect(browseHandler);
      mpClient.stopBrowsing();
      this.lobbyMaskGraphics.destroy();
    });
  }

  private renderLobbies(): void {
    const { width } = this.cameras.main;
    const listTop = 145;
    const listBottom = this.cameras.main.height - 100;
    const listHeight = listBottom - listTop;
    const lineHeight = 36;

    this.lobbyContainer.removeAll(true);
    this.scrollY = 0;
    this.lobbyContainer.y = 0;

    if (this.lobbies.length === 0) {
      const emptyTop = this.add.text(width / 2, listTop + listHeight / 2 - 16, 'Pusto tu...', titleStyle({
        fontSize: '16px',
        align: 'center',
      })).setOrigin(0.5);
      const emptyBottom = this.add.text(width / 2, listTop + listHeight / 2 + 16, 'Stw\u00f3rz lobby i zaczynaj imprez\u0119!', bodyStyle({
        fontSize: '10px',
        color: '#00ccff',
        align: 'center',
        strokeThickness: 3,
      })).setOrigin(0.5);
      this.tweens.add({
        targets: emptyTop,
        y: emptyTop.y - 4,
        duration: 1200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.lobbyContainer.add([emptyTop, emptyBottom]);
      this.maxScroll = 0;
      return;
    }

    for (let i = 0; i < this.lobbies.length; i++) {
      const lobby = this.lobbies[i];
      const y = listTop + 10 + i * lineHeight;

      const isWaiting = lobby.status === 'waiting';
      const isPostgame = lobby.status === 'postgame';
      const isIngame = lobby.status === 'ingame';
      const canJoin = isWaiting || isPostgame;

      // Entry background
      const entryBg = this.add.rectangle(width / 2, y + lineHeight / 2 - 4, width - 60, lineHeight - 4,
        canJoin ? 0x112233 : 0x221111, 0.7);

      if (canJoin) {
        entryBg.setInteractive({ useHandCursor: true });
        entryBg.on('pointerover', () => entryBg.setFillStyle(0x223344, 0.9));
        entryBg.on('pointerout', () => entryBg.setFillStyle(0x112233, 0.7));
        entryBg.on('pointerdown', () => this.handleJoinLobby(lobby.id));
      }

      // Lobby text
      const lobbyText = this.add.text(40, y + lineHeight / 2 - 4,
        `${lobby.host}'s Lobby \u2014 ${lobby.playerCount}/16`, smallStyle({
          fontSize: '9px',
          color: canJoin ? '#ffffff' : '#888888',
        })).setOrigin(0, 0.5);

      // Status badge
      let badgeColor: number;
      let badgeLabel: string;
      if (isWaiting) {
        badgeColor = 0x00aa00;
        badgeLabel = 'czeka';
      } else if (isIngame) {
        badgeColor = 0xaa0000;
        badgeLabel = 'w grze';
      } else {
        badgeColor = 0xaa6600;
        badgeLabel = 'po grze';
      }

      const badgeX = width - 60;
      const badgeY = y + lineHeight / 2 - 4;
      const badge = this.add.rectangle(badgeX, badgeY, 60, 18, badgeColor, 0.9);
      const badgeTxt = this.add.text(badgeX, badgeY, badgeLabel, smallStyle({
        fontSize: '7px',
        color: '#ffffff',
        stroke: undefined,
        strokeThickness: 0,
      })).setOrigin(0.5);

      this.lobbyContainer.add([entryBg, lobbyText, badge, badgeTxt]);
    }

    const totalHeight = this.lobbies.length * lineHeight;
    this.maxScroll = Math.max(0, totalHeight - listHeight);
  }

  private async handleJoinLobby(lobbyId: string): Promise<void> {
    const name = getPlayerName() || getPlayerNameOrDefault();
    mpClient.setName(name);
    try {
      const lobbyData = await mpClient.joinLobby(lobbyId);
      this.scene.start('LobbyScene', { lobbyData });
    } catch {
      // Could show error
    }
  }

  private async handleCreateLobby(): Promise<void> {
    const name = getPlayerName() || getPlayerNameOrDefault();
    mpClient.setName(name);
    try {
      const lobbyData = await mpClient.createLobby();
      this.scene.start('LobbyScene', { lobbyData });
    } catch {
      // Could show error
    }
  }

}
