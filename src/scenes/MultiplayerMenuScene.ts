import Phaser from 'phaser';
import { mpClient, MPLobbyListEntry } from '../multiplayer/MultiplayerClient';

const FONT_FAMILY = '"Press Start 2P", monospace';
const STORAGE_KEY = 'cockroach-mp-name';

export class MultiplayerMenuScene extends Phaser.Scene {
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private lobbyContainer!: Phaser.GameObjects.Container;
  private lobbyMask!: Phaser.Display.Masks.GeometryMask;
  private lobbyMaskGraphics!: Phaser.GameObjects.Graphics;
  private nicknameText!: Phaser.GameObjects.Text;
  private scrollY = 0;
  private maxScroll = 0;
  private lobbies: MPLobbyListEntry[] = [];
  private loadingSpinner: Phaser.GameObjects.Text | null = null;
  private isLoading = false;

  constructor() {
    super({ key: 'MultiplayerMenuScene' });
  }

  create(): void {
    const { width, height } = this.cameras.main;

    // Dark background
    this.cameras.main.setBackgroundColor('#0a0a2e');
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.4);

    // Floating neon particles
    const neonColors = [0xff00ff, 0x00ffff, 0xff6600, 0x00ff66, 0xffff00, 0xff0088, 0x8800ff];
    for (let i = 0; i < 10; i++) {
      this.spawnFloatingParticle(width, height, neonColors);
    }

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
    changeBtnBg.on('pointerdown', () => this.showNicknameOverlay());

    // --- LOBBY LIST AREA ---
    const listTop = 145;
    const listBottom = height - 100;
    const listHeight = listBottom - listTop;

    // List background
    this.add.rectangle(width / 2, listTop + listHeight / 2, width - 40, listHeight, 0x111122, 0.6);

    // Loading spinner (top-left of list)
    this.loadingSpinner = this.add.text(28, listTop + 8, '/', {
      fontSize: '12px',
      color: '#00ccff',
      fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0).setDepth(100);
    this.showSpinner();

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

    // Touch drag scrolling (scene-level so it doesn't steal clicks from lobby entries)
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
    const btnStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: '11px',
      fontFamily: FONT_FAMILY,
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
    };

    const btnW = 260;
    const btnH = 36;

    // "Stworz Lobby" button
    const createBg = this.add.rectangle(width / 2, height - 72, btnW, btnH, 0x006688, 0.9)
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
      // No nickname — prompt immediately
      this.showNicknameOverlay();
    }

    this.refreshLobbies();
    this.refreshInterval = setInterval(() => this.refreshLobbies(), 3000);

    // Cleanup on scene shutdown
    this.events.on('shutdown', () => {
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
        this.refreshInterval = null;
      }
      this.lobbyMaskGraphics.destroy();
    });
  }

  private spinnerFrames = ['/', '-', '\\', '|'];
  private spinnerIdx = 0;
  private spinnerTimer: Phaser.Time.TimerEvent | null = null;

  private showSpinner(): void {
    if (this.loadingSpinner) {
      this.loadingSpinner.setVisible(true);
      if (!this.spinnerTimer) {
        this.spinnerTimer = this.time.addEvent({
          delay: 100,
          loop: true,
          callback: () => {
            this.spinnerIdx = (this.spinnerIdx + 1) % this.spinnerFrames.length;
            this.loadingSpinner?.setText(this.spinnerFrames[this.spinnerIdx]);
          },
        });
      }
    }
  }

  private hideSpinner(): void {
    if (this.loadingSpinner) {
      this.loadingSpinner.setVisible(false);
    }
    if (this.spinnerTimer) {
      this.spinnerTimer.destroy();
      this.spinnerTimer = null;
    }
  }

  private async refreshLobbies(): Promise<void> {
    this.showSpinner();
    try {
      this.lobbies = await mpClient.listLobbies();
      this.renderLobbies();
    } catch {
      // Silently fail
    }
    this.hideSpinner();
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
      const empty = this.add.text(width / 2, listTop + listHeight / 2, 'Brak lobby...\nStw\u00f3rz w\u0142asne!', {
        fontSize: '10px',
        color: '#666666',
        fontFamily: FONT_FAMILY,
        align: 'center',
      }).setOrigin(0.5);
      this.lobbyContainer.add(empty);
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
        `${lobby.host}'s Lobby \u2014 ${lobby.playerCount}/16`, {
          fontSize: '9px',
          color: canJoin ? '#ffffff' : '#888888',
          fontFamily: FONT_FAMILY,
          stroke: '#000000',
          strokeThickness: 2,
        }).setOrigin(0, 0.5);

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
      const badgeTxt = this.add.text(badgeX, badgeY, badgeLabel, {
        fontSize: '7px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
      }).setOrigin(0.5);

      this.lobbyContainer.add([entryBg, lobbyText, badge, badgeTxt]);
    }

    const totalHeight = this.lobbies.length * lineHeight;
    this.maxScroll = Math.max(0, totalHeight - listHeight);
  }

  private async handleJoinLobby(lobbyId: string): Promise<void> {
    const name = localStorage.getItem(STORAGE_KEY);
    if (!name) {
      this.showNicknameOverlay();
      return;
    }
    try {
      const lobbyData = await mpClient.joinLobby(lobbyId);
      this.scene.start('LobbyScene', { lobbyData });
    } catch {
      // Could show error — for now silently fail
    }
  }

  private async handleCreateLobby(): Promise<void> {
    const name = localStorage.getItem(STORAGE_KEY);
    if (!name) {
      this.showNicknameOverlay();
      return;
    }
    try {
      const lobbyData = await mpClient.createLobby();
      this.scene.start('LobbyScene', { lobbyData });
    } catch {
      // Could show error — for now silently fail
    }
  }

  private showNicknameOverlay(): void {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;font-family:"Press Start 2P",monospace;';

    const label = document.createElement('div');
    label.textContent = 'Tw\u00f3j nick:';
    label.style.cssText = 'color:#ffff00;font-size:14px;';
    overlay.appendChild(label);

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 20;
    input.value = localStorage.getItem(STORAGE_KEY) || '';
    input.style.cssText = 'font-family:"Press Start 2P",monospace;font-size:18px;padding:8px 12px;background:#111;color:#fff;border:2px solid #006688;outline:none;text-align:center;width:240px;';
    overlay.appendChild(input);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:12px;';

    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'OK';
    submitBtn.style.cssText = 'font-family:"Press Start 2P",monospace;font-size:12px;padding:8px 16px;background:#006688;color:#fff;border:none;cursor:pointer;';
    btnRow.appendChild(submitBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Anuluj';
    cancelBtn.style.cssText = 'font-family:"Press Start 2P",monospace;font-size:12px;padding:8px 16px;background:#666;color:#fff;border:none;cursor:pointer;';
    btnRow.appendChild(cancelBtn);

    overlay.appendChild(btnRow);
    document.body.appendChild(overlay);

    input.focus();

    const cleanup = (): void => {
      overlay.remove();
    };

    const submit = (): void => {
      const name = input.value.trim().slice(0, 20);
      if (name.length > 0) {
        localStorage.setItem(STORAGE_KEY, name);
        mpClient.setName(name);
        this.nicknameText.setText(`Gracz: ${name}`);
        this.nicknameText.setColor('#00ff66');
        cleanup();
      }
    };

    submitBtn.addEventListener('click', submit);
    cancelBtn.addEventListener('click', cleanup);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape') cleanup();
    });
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
