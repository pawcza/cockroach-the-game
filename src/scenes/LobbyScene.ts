import Phaser from 'phaser';
import { mpClient, MPLobbyData, MPPlayer } from '../multiplayer/MultiplayerClient';
import { MP_PLAYER_COLORS } from '../multiplayer/GhostPlayer';
import { COLORS } from '../config/constants';
import { neonStyle, bodyStyle, smallStyle, buttonStyle, FONT_FAMILY } from '../utils/TextStyles';
import { floatUpDown } from '../utils/TweenPatterns';
import { spawnFloatingParticle, setupMenuLighting } from '../ui/SceneBackground';
import { createButton } from '../ui/shared';
import { sceneManager } from '../systems/SceneManager';

export class LobbyScene extends Phaser.Scene {
  private lobbyData!: MPLobbyData;
  private playerListContainer!: Phaser.GameObjects.Container;
  private startBtnAll!: Phaser.GameObjects.GameObject[];
  private startBtnTxt!: Phaser.GameObjects.Text;
  private startBtnHitZone!: Phaser.GameObjects.Rectangle;
  private readyBtnAll!: Phaser.GameObjects.GameObject[];
  private readyBtnTxt!: Phaser.GameObjects.Text;
  private readyBtnSetColor!: (c: number) => void;
  private playerCountText!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private lobbyUpdatedHandler!: (data: MPLobbyData) => void;
  private gameStartHandler!: (data: { seed: number; players: MPPlayer[] }) => void;
  private visibilityHandler!: () => void;

  constructor() {
    super({ key: 'LobbyScene' });
  }

  init(data: { lobbyData: MPLobbyData }): void {
    this.lobbyData = data.lobbyData;
  }

  create(): void {
    const { width, height } = this.cameras.main;

    // Background — scale to cover the canvas
    const mpBg = this.add.image(width / 2, height / 2, 'menu-bg-multiplayer');
    mpBg.setScale(Math.max(width / mpBg.width, height / mpBg.height));
    setupMenuLighting(this, mpBg);
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.4);

    // Floating neon particles
    for (let i = 0; i < 8; i++) {
      spawnFloatingParticle(this, width, height, COLORS.NEON);
    }

    // --- TITLE ---
    this.titleText = this.add.text(width / 2, 40, `${this.getHostName()}'s Lobby`, neonStyle({
      fontSize: '18px',
      color: '#00ccff',
      align: 'center',
    })).setOrigin(0.5);

    floatUpDown(this, this.titleText, 4, 1200);

    // --- PLAYER COUNT ---
    this.playerCountText = this.add.text(width / 2, 70, '', smallStyle({
      fontSize: '10px',
      strokeThickness: 3,
    })).setOrigin(0.5);

    // --- PLAYER LIST ---
    const listTop = 90;
    const listBottom = height - 110;
    const listHeight = listBottom - listTop;

    this.add.rectangle(width / 2, listTop + listHeight / 2, width - 40, listHeight, 0x111122, 0.5);

    this.playerListContainer = this.add.container(0, 0);

    // Mask for player list
    const maskGraphics = this.make.graphics({});
    maskGraphics.fillRect(20, listTop, width - 40, listHeight);
    this.playerListContainer.setMask(new Phaser.Display.Masks.GeometryMask(this, maskGraphics));

    // --- BUTTONS ---
    const btnS = buttonStyle({ fontSize: '11px' });

    // Main action button position
    const actionBtnY = height - 63;

    // "Gotowy" ready toggle button (non-host only)
    const readyBtn = createButton(this, width / 2, actionBtnY, 260, 36, 'Gotowy?', 0x886600, btnS, () => {
      const me = this.lobbyData.players.find(p => p.id === mpClient.myId);
      const newReady = !(me?.ready);
      mpClient.setReady(newReady).then((updatedLobby) => {
        this.lobbyData = updatedLobby;
        this.renderPlayerList();
        this.updateStartButton();
        this.updateReadyButton();
      }).catch((err) => { console.error('setReady failed:', err); });
    });
    this.readyBtnAll = readyBtn.all;
    this.readyBtnTxt = readyBtn.txt;
    this.readyBtnSetColor = readyBtn.setColor;

    // "Rozpocznij Gre" button (host only, same position)
    const startBtn = createButton(this, width / 2, actionBtnY, 260, 36, 'Rozpocznij Gr\u0119', 0x008800, btnS, () => {
      if (this.isStartEnabled()) {
        mpClient.startGame().then((res) => {
          sceneManager.goto(this, 'GameScene', {
            multiplayer: true,
            seed: res.seed,
            players: res.players,
            myId: mpClient.myId,
          });
        }).catch((err) => { console.error('startGame failed:', err); });
      }
    });
    this.startBtnAll = startBtn.all;
    this.startBtnTxt = startBtn.txt;
    this.startBtnHitZone = startBtn.hitZone;

    // "Opusc" leave button
    const { bg: leaveBg, txt: leaveTxt } = createButton(this, width / 2, height - 25, 200, 30, 'Opu\u015b\u0107', 0x660000, buttonStyle({ fontSize: '10px' }), () => {
      sceneManager.goto(this, 'MultiplayerMenuScene', undefined, () => {
        mpClient.leaveLobby();
      });
    });

    // --- VISIBILITY CHANGE ---
    this.visibilityHandler = () => {
      if (document.hidden && !this.isHost()) {
        const me = this.lobbyData.players.find(p => p.id === mpClient.myId);
        if (me?.ready) {
          mpClient.setReady(false).then((updatedLobby) => {
            this.lobbyData = updatedLobby;
            this.renderPlayerList();
            this.updateStartButton();
            this.updateReadyButton();
          }).catch((err) => { console.error('unready failed:', err); });
        }
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);

    // --- RENDER INITIAL STATE ---
    this.renderPlayerList();
    this.updateStartButton();
    this.updateReadyButton();

    // --- SOCKET EVENT LISTENERS ---
    this.lobbyUpdatedHandler = (data: MPLobbyData) => {
      this.lobbyData = data;
      this.titleText.setText(`${this.getHostName()}'s Lobby`);
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
      });
    };

    mpClient.on('lobby:updated', this.lobbyUpdatedHandler);
    mpClient.on('game:start', this.gameStartHandler);

    // Cleanup on scene shutdown
    this.events.on('shutdown', () => {
      mpClient.off('lobby:updated', this.lobbyUpdatedHandler);
      mpClient.off('game:start', this.gameStartHandler);
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      maskGraphics.destroy();
    });
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
    const enabled = this.isStartEnabled();

    for (const obj of this.startBtnAll) (obj as unknown as Phaser.GameObjects.Components.Visible).setVisible(isHostPlayer);

    if (isHostPlayer) {
      if (enabled) {
        this.startBtnTxt.setColor('#dddddd');
        for (const obj of this.startBtnAll) (obj as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(1);
        this.startBtnHitZone.setInteractive({ useHandCursor: true });
      } else {
        this.startBtnTxt.setColor('#666666');
        for (const obj of this.startBtnAll) (obj as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(0.4);
        this.startBtnHitZone.disableInteractive();
      }
    }
  }

  private updateReadyButton(): void {
    const isHost = this.isHost();
    for (const obj of this.readyBtnAll) (obj as unknown as Phaser.GameObjects.Components.Visible).setVisible(!isHost);
    if (isHost) return;

    const me = this.lobbyData.players.find(p => p.id === mpClient.myId);
    const isReady = me?.ready ?? false;
    if (isReady) {
      this.readyBtnSetColor(0x008800);
      this.readyBtnTxt.setText('Gotowy!');
      this.readyBtnTxt.setColor('#00ff00');
    } else {
      this.readyBtnSetColor(0x886600);
      this.readyBtnTxt.setText('Gotowy?');
      this.readyBtnTxt.setColor('#dddddd');
    }
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
      const swatchColor = MP_PLAYER_COLORS[player.color] ?? 0xffffff;
      const swatch = this.add.rectangle(50, y + lineHeight / 2 - 4, 24, 24, swatchColor, 1);

      if (isMe) {
        swatch.setInteractive({ useHandCursor: true });
        swatch.setStrokeStyle(2, 0xffffff);
        swatch.on('pointerdown', () => {
          const usedColors = new Set(
            this.lobbyData.players.filter(p => p.id !== player.id).map(p => p.color),
          );
          let next = (player.color + 1) % MP_PLAYER_COLORS.length;
          const start = next;
          while (usedColors.has(next)) {
            next = (next + 1) % MP_PLAYER_COLORS.length;
            if (next === start) return;
          }
          mpClient.changeColor(next).then((updatedLobby) => {
            this.lobbyData = updatedLobby;
            this.renderPlayerList();
            this.updateStartButton();
          }).catch(() => {});
        });
      }

      // Player name
      const nameColor = isMe ? '#00ff66' : '#ffffff';
      const suffix = player.isHost ? ' (host)' : '';
      const nameText = this.add.text(80, y + lineHeight / 2 - 4, player.name + suffix, smallStyle({
        fontSize: '10px',
        color: nameColor,
      })).setOrigin(0, 0.5);

      // Ready indicator on the right (skip for host)
      let readyText: Phaser.GameObjects.Text | null = null;
      if (!player.isHost) {
        readyText = this.add.text(width - 30, y + lineHeight / 2 - 4, player.ready ? '\u2714' : '\u2022', smallStyle({
          fontSize: player.ready ? '14px' : '10px',
          color: player.ready ? '#00ff00' : '#666666',
        })).setOrigin(0.5, 0.5);
      }

      // Row background highlight for self
      if (isMe) {
        const rowBg = this.add.rectangle(width / 2, y + lineHeight / 2 - 4, width - 60, lineHeight - 4, 0x003322, 0.3);
        this.playerListContainer.add(rowBg);
      }

      const items: Phaser.GameObjects.GameObject[] = [swatch, nameText];
      if (readyText) items.push(readyText);
      this.playerListContainer.add(items);
    }
  }
}
