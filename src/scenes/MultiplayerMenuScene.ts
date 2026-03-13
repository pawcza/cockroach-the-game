import Phaser from 'phaser';
import { mpClient } from '../multiplayer/MultiplayerClient';
import { startFloatingParticles } from '../ui/SceneBackground';
import { FONT_FAMILY } from '../ui/shared';
import { LobbyList } from '../ui/LobbyList';
import { showNicknameOverlay, STORAGE_KEY } from '../ui/NicknameInput';

export class MultiplayerMenuScene extends Phaser.Scene {
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private nicknameText!: Phaser.GameObjects.Text;
  private lobbyList!: LobbyList;

  constructor() {
    super({ key: 'MultiplayerMenuScene' });
  }

  create(): void {
    const { width, height } = this.cameras.main;

    // Dark background
    this.cameras.main.setBackgroundColor('#0a0a2e');
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.4);

    // Floating neon particles
    startFloatingParticles(this, width, height, 10);

    // --- TITLE: ZJAZD KARALUCHOW (wobbly, yellow, trippy) ---
    const title = this.add.text(width / 2, 50, 'ZJAZD\nKARALUCH\u00d3W', {
      fontSize: '22px',
      color: '#ffff00',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6,
      align: 'center',
    }).setOrigin(0.5);

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
    const nickname = localStorage.getItem(STORAGE_KEY) || '';
    this.nicknameText = this.add.text(width / 2, 120, nickname ? `Gracz: ${nickname}` : 'Brak nicku!', {
      fontSize: '10px',
      color: nickname ? '#00ff66' : '#ff4444',
      fontFamily: FONT_FAMILY,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    // "Zmien" button next to nickname
    const changeBtnBg = this.add.rectangle(width / 2 + 140, 120, 80, 24, 0x444444, 0.9)
      .setInteractive({ useHandCursor: true });
    const changeBtnTxt = this.add.text(width / 2 + 140, 120, 'Zmie\u0144', {
      fontSize: '8px',
      color: '#ffffff',
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);
    changeBtnBg.on('pointerover', () => { changeBtnBg.setFillStyle(0x666666, 1); changeBtnTxt.setColor('#ffff00'); });
    changeBtnBg.on('pointerout', () => { changeBtnBg.setFillStyle(0x444444, 0.9); changeBtnTxt.setColor('#ffffff'); });
    changeBtnBg.on('pointerdown', () => this.promptNickname());

    // --- LOBBY LIST ---
    this.lobbyList = new LobbyList(this, {
      listTop: 145,
      listBottom: height - 100,
    });
    this.lobbyList.showSpinner();

    // --- BOTTOM BUTTONS ---
    const btnStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: '11px',
      fontFamily: FONT_FAMILY,
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
    };

    // "Stworz Lobby" button
    const createBg = this.add.rectangle(width / 2, height - 72, 260, 36, 0x006688, 0.9)
      .setInteractive({ useHandCursor: true });
    const createTxt = this.add.text(width / 2, height - 72, 'Stw\u00f3rz Lobby', btnStyle).setOrigin(0.5);
    createBg.on('pointerover', () => { createBg.setFillStyle(0x008899, 1); createTxt.setColor('#ffff00'); });
    createBg.on('pointerout', () => { createBg.setFillStyle(0x006688, 0.9); createTxt.setColor('#ffffff'); });
    createBg.on('pointerdown', () => this.handleCreateLobby());

    this.tweens.add({
      targets: createBg,
      alpha: { from: 0.85, to: 1 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // "Powrot" back button
    const backBg = this.add.rectangle(width / 2, height - 30, 200, 30, 0x444444, 0.9)
      .setInteractive({ useHandCursor: true });
    const backTxt = this.add.text(width / 2, height - 30, '\u2190 Powr\u00f3t', {
      fontSize: '10px',
      fontFamily: FONT_FAMILY,
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);
    backBg.on('pointerover', () => { backBg.setFillStyle(0x666666, 1); backTxt.setColor('#ffff00'); });
    backBg.on('pointerout', () => { backBg.setFillStyle(0x444444, 0.9); backTxt.setColor('#ffffff'); });
    backBg.on('pointerdown', () => {
      mpClient.disconnect();
      this.scene.start('MenuScene');
    });

    // --- CONNECT AND START REFRESH ---
    mpClient.connect();
    const name = localStorage.getItem(STORAGE_KEY);
    if (name) {
      mpClient.setName(name);
    } else {
      this.promptNickname();
    }

    this.refreshLobbies();
    this.refreshInterval = setInterval(() => this.refreshLobbies(), 3000);

    // Cleanup on scene shutdown
    this.events.on('shutdown', () => {
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
        this.refreshInterval = null;
      }
      this.lobbyList.destroy();
    });
  }

  private promptNickname(): void {
    showNicknameOverlay((name) => {
      this.nicknameText.setText(`Gracz: ${name}`);
      this.nicknameText.setColor('#00ff66');
    });
  }

  private async refreshLobbies(): Promise<void> {
    this.lobbyList.showSpinner();
    try {
      const lobbies = await mpClient.listLobbies();
      this.lobbyList.render(lobbies, (lobbyId) => this.handleJoinLobby(lobbyId));
    } catch {
      // Silently fail
    }
    this.lobbyList.hideSpinner();
  }

  private async handleJoinLobby(lobbyId: string): Promise<void> {
    const name = localStorage.getItem(STORAGE_KEY);
    if (!name) {
      this.promptNickname();
      return;
    }
    try {
      const lobbyData = await mpClient.joinLobby(lobbyId);
      this.scene.start('LobbyScene', { lobbyData });
    } catch {
      // Could show error -- for now silently fail
    }
  }

  private async handleCreateLobby(): Promise<void> {
    const name = localStorage.getItem(STORAGE_KEY);
    if (!name) {
      this.promptNickname();
      return;
    }
    try {
      const lobbyData = await mpClient.createLobby();
      this.scene.start('LobbyScene', { lobbyData });
    } catch {
      // Could show error -- for now silently fail
    }
  }
}
