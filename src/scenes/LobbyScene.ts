import Phaser from 'phaser';
import { mpClient, MPLobbyData, MPPlayer } from '../multiplayer/MultiplayerClient';
import { MP_PLAYER_COLORS } from '../multiplayer/GhostPlayer';

const FONT_FAMILY = '"Press Start 2P", monospace';

export class LobbyScene extends Phaser.Scene {
  private lobbyData!: MPLobbyData;
  private playerListContainer!: Phaser.GameObjects.Container;
  private startBtnBg!: Phaser.GameObjects.Rectangle;
  private startBtnTxt!: Phaser.GameObjects.Text;
  private readyBtnBg!: Phaser.GameObjects.Rectangle;
  private readyBtnTxt!: Phaser.GameObjects.Text;
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

    // Dark background
    this.cameras.main.setBackgroundColor('#0a0a2e');
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.4);

    // Floating neon particles
    const neonColors = [0xff00ff, 0x00ffff, 0xff6600, 0x00ff66, 0xffff00];
    for (let i = 0; i < 8; i++) {
      this.spawnFloatingParticle(width, height, neonColors);
    }

    // --- TITLE ---
    this.titleText = this.add.text(width / 2, 40, `${this.getHostName()}'s Lobby`, {
      fontSize: '18px',
      color: '#00ccff',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 5,
      align: 'center',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: this.titleText,
      y: this.titleText.y - 4,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // --- PLAYER COUNT ---
    this.playerCountText = this.add.text(width / 2, 70, '', {
      fontSize: '10px',
      color: '#aaaaaa',
      fontFamily: FONT_FAMILY,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);

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
    const btnStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: '11px',
      fontFamily: FONT_FAMILY,
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
    };

    // Main action button position — shared between ready (non-host) and start (host)
    const actionBtnY = height - 63;

    // "Gotowy" ready toggle button (non-host only)
    this.readyBtnBg = this.add.rectangle(width / 2, actionBtnY, 260, 36, 0x886600, 0.9);
    this.readyBtnTxt = this.add.text(width / 2, actionBtnY, 'Gotowy?', btnStyle).setOrigin(0.5);
    this.readyBtnBg.setInteractive({ useHandCursor: true });
    this.readyBtnBg.on('pointerover', () => {
      this.readyBtnBg.setAlpha(1);
      this.readyBtnTxt.setColor('#ffff00');
    });
    this.readyBtnBg.on('pointerout', () => {
      this.updateReadyButton();
    });
    this.readyBtnBg.on('pointerdown', () => {
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
    this.startBtnBg = this.add.rectangle(width / 2, actionBtnY, 260, 36, 0x008800, 0.9);
    this.startBtnTxt = this.add.text(width / 2, actionBtnY, 'Rozpocznij Gr\u0119', btnStyle).setOrigin(0.5);
    this.startBtnBg.setInteractive({ useHandCursor: true });
    this.startBtnBg.on('pointerover', () => {
      if (this.isStartEnabled()) {
        this.startBtnBg.setFillStyle(0x00aa00, 1);
        this.startBtnTxt.setColor('#ffff00');
      }
    });
    this.startBtnBg.on('pointerout', () => {
      this.updateStartButton();
    });
    this.startBtnBg.on('pointerdown', () => {
      if (this.isStartEnabled()) {
        mpClient.startGame().then((res) => {
          this.scene.start('GameScene', {
            multiplayer: true,
            seed: res.seed,
            players: res.players,
            myId: mpClient.myId,
          });
        }).catch((err) => { console.error('startGame failed:', err); });
      }
    });

    // "Opusc" leave button
    const leaveBg = this.add.rectangle(width / 2, height - 25, 200, 30, 0x660000, 0.9)
      .setInteractive({ useHandCursor: true });
    const leaveTxt = this.add.text(width / 2, height - 25, 'Opu\u015b\u0107', {
      fontSize: '10px',
      fontFamily: FONT_FAMILY,
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);
    leaveBg.on('pointerover', () => { leaveBg.setFillStyle(0x880000, 1); leaveTxt.setColor('#ffff00'); });
    leaveBg.on('pointerout', () => { leaveBg.setFillStyle(0x660000, 0.9); leaveTxt.setColor('#ffffff'); });
    leaveBg.on('pointerdown', () => {
      mpClient.leaveLobby();
      this.scene.start('MultiplayerMenuScene');
    });

    // --- VISIBILITY CHANGE — unready when tab loses focus ---
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
      this.scene.start('GameScene', {
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

    this.startBtnBg.setVisible(isHostPlayer);
    this.startBtnTxt.setVisible(isHostPlayer);

    if (isHostPlayer) {
      if (enabled) {
        this.startBtnBg.setFillStyle(0x008800, 0.9);
        this.startBtnTxt.setColor('#ffffff');
        this.startBtnBg.setAlpha(0.9);
      } else {
        this.startBtnBg.setFillStyle(0x333333, 0.5);
        this.startBtnTxt.setColor('#666666');
        this.startBtnBg.setAlpha(0.5);
      }
    }
  }

  private updateReadyButton(): void {
    if (this.isHost()) {
      this.readyBtnBg.setVisible(false);
      this.readyBtnTxt.setVisible(false);
      return;
    }
    this.readyBtnBg.setVisible(true);
    this.readyBtnTxt.setVisible(true);
    const me = this.lobbyData.players.find(p => p.id === mpClient.myId);
    const isReady = me?.ready ?? false;
    if (isReady) {
      this.readyBtnBg.setFillStyle(0x008800, 0.9);
      this.readyBtnTxt.setText('Gotowy!');
      this.readyBtnTxt.setColor('#00ff00');
    } else {
      this.readyBtnBg.setFillStyle(0x886600, 0.9);
      this.readyBtnTxt.setText('Gotowy?');
      this.readyBtnTxt.setColor('#ffffff');
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
        // Own color swatch is clickable — cycles to next available color
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
            if (next === start) return; // all taken
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
      const nameText = this.add.text(80, y + lineHeight / 2 - 4, player.name + suffix, {
        fontSize: '10px',
        color: nameColor,
        fontFamily: FONT_FAMILY,
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0, 0.5);

      // Ready indicator on the right (skip for host)
      let readyText: Phaser.GameObjects.Text | null = null;
      if (!player.isHost) {
        readyText = this.add.text(width - 30, y + lineHeight / 2 - 4, player.ready ? '\u2714' : '\u2022', {
          fontSize: player.ready ? '14px' : '10px',
          color: player.ready ? '#00ff00' : '#666666',
          fontFamily: FONT_FAMILY,
          stroke: '#000000',
          strokeThickness: 2,
        }).setOrigin(0.5, 0.5);
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

  private spawnFloatingParticle(sceneWidth: number, sceneHeight: number, colors: number[]): void {
    const color = Phaser.Utils.Array.GetRandom(colors);
    const size = Phaser.Math.Between(2, 8);
    const x = Phaser.Math.Between(0, sceneWidth);
    const y = Phaser.Math.Between(0, sceneHeight);

    const particle = this.add.circle(x, y, size, color, 0.6);
    particle.setBlendMode(Phaser.BlendModes.ADD);

    const duration = Phaser.Math.Between(3000, 7000);
    const targetX = x + Phaser.Math.Between(-100, 100);
    const targetY = y + Phaser.Math.Between(-150, -50);

    this.tweens.add({
      targets: particle,
      x: targetX,
      y: targetY,
      alpha: 0,
      duration,
      ease: 'Sine.easeIn',
      onComplete: () => {
        particle.destroy();
        this.spawnFloatingParticle(sceneWidth, sceneHeight, colors);
      },
    });
  }
}
