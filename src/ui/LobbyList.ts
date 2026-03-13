import Phaser from 'phaser';
import { MPLobbyListEntry } from '../multiplayer/MultiplayerClient';
import { FONT_FAMILY } from './shared';

export interface LobbyListConfig {
  listTop: number;
  listBottom: number;
}

/**
 * Manages a scrollable, masked list of multiplayer lobbies inside a Phaser scene.
 */
export class LobbyList {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private maskGraphics: Phaser.GameObjects.Graphics;
  private mask: Phaser.Display.Masks.GeometryMask;
  private spinner: Phaser.GameObjects.Text;
  private spinnerTimer: Phaser.Time.TimerEvent | null = null;
  private spinnerFrames = ['/', '-', '\\', '|'];
  private spinnerIdx = 0;

  private scrollY = 0;
  private maxScroll = 0;
  private listTop: number;
  private listBottom: number;
  private listHeight: number;

  constructor(scene: Phaser.Scene, config: LobbyListConfig) {
    this.scene = scene;
    this.listTop = config.listTop;
    this.listBottom = config.listBottom;
    this.listHeight = config.listBottom - config.listTop;

    const { width } = scene.cameras.main;

    // List background
    scene.add.rectangle(width / 2, this.listTop + this.listHeight / 2, width - 40, this.listHeight, 0x111122, 0.6);

    // Loading spinner
    this.spinner = scene.add.text(28, this.listTop + 8, '/', {
      fontSize: '12px',
      color: '#00ccff',
      fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0).setDepth(100);

    // Scrollable container
    this.container = scene.add.container(0, 0);
    this.maskGraphics = scene.make.graphics({});
    this.maskGraphics.fillRect(20, this.listTop, width - 40, this.listHeight);
    this.mask = new Phaser.Display.Masks.GeometryMask(scene, this.maskGraphics);
    this.container.setMask(this.mask);

    // Mouse wheel scrolling
    scene.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gos: unknown[], _dx: number, dy: number) => {
      this.scrollY = Phaser.Math.Clamp(this.scrollY + dy * 0.5, 0, this.maxScroll);
      this.container.y = -this.scrollY;
    });

    // Touch drag scrolling
    let dragStartY = 0;
    let dragScrollStart = 0;
    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.y >= this.listTop && pointer.y <= this.listBottom) {
        dragStartY = pointer.y;
        dragScrollStart = this.scrollY;
      }
    });
    scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || pointer.y < this.listTop || pointer.y > this.listBottom) return;
      const delta = dragStartY - pointer.y;
      this.scrollY = Phaser.Math.Clamp(dragScrollStart + delta, 0, this.maxScroll);
      this.container.y = -this.scrollY;
    });
  }

  showSpinner(): void {
    this.spinner.setVisible(true);
    if (!this.spinnerTimer) {
      this.spinnerTimer = this.scene.time.addEvent({
        delay: 100,
        loop: true,
        callback: () => {
          this.spinnerIdx = (this.spinnerIdx + 1) % this.spinnerFrames.length;
          this.spinner.setText(this.spinnerFrames[this.spinnerIdx]);
        },
      });
    }
  }

  hideSpinner(): void {
    this.spinner.setVisible(false);
    if (this.spinnerTimer) {
      this.spinnerTimer.destroy();
      this.spinnerTimer = null;
    }
  }

  /**
   * Renders the lobby entries. Calls `onJoin` when a joinable lobby is clicked.
   */
  render(lobbies: MPLobbyListEntry[], onJoin: (lobbyId: string) => void): void {
    const { width } = this.scene.cameras.main;
    const lineHeight = 36;

    this.container.removeAll(true);
    this.scrollY = 0;
    this.container.y = 0;

    if (lobbies.length === 0) {
      const empty = this.scene.add.text(width / 2, this.listTop + this.listHeight / 2, 'Brak lobby...\nStw\u00f3rz w\u0142asne!', {
        fontSize: '10px',
        color: '#666666',
        fontFamily: FONT_FAMILY,
        align: 'center',
      }).setOrigin(0.5);
      this.container.add(empty);
      this.maxScroll = 0;
      return;
    }

    for (let i = 0; i < lobbies.length; i++) {
      const lobby = lobbies[i];
      const y = this.listTop + 10 + i * lineHeight;

      const isWaiting = lobby.status === 'waiting';
      const isPostgame = lobby.status === 'postgame';
      const isIngame = lobby.status === 'ingame';
      const canJoin = isWaiting || isPostgame;

      // Entry background
      const entryBg = this.scene.add.rectangle(width / 2, y + lineHeight / 2 - 4, width - 60, lineHeight - 4,
        canJoin ? 0x112233 : 0x221111, 0.7);

      if (canJoin) {
        entryBg.setInteractive({ useHandCursor: true });
        entryBg.on('pointerover', () => entryBg.setFillStyle(0x223344, 0.9));
        entryBg.on('pointerout', () => entryBg.setFillStyle(0x112233, 0.7));
        entryBg.on('pointerdown', () => onJoin(lobby.id));
      }

      // Lobby text
      const lobbyText = this.scene.add.text(40, y + lineHeight / 2 - 4,
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
      const badge = this.scene.add.rectangle(badgeX, badgeY, 60, 18, badgeColor, 0.9);
      const badgeTxt = this.scene.add.text(badgeX, badgeY, badgeLabel, {
        fontSize: '7px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
      }).setOrigin(0.5);

      this.container.add([entryBg, lobbyText, badge, badgeTxt]);
    }

    const totalHeight = lobbies.length * lineHeight;
    this.maxScroll = Math.max(0, totalHeight - this.listHeight);
  }

  destroy(): void {
    this.hideSpinner();
    this.maskGraphics.destroy();
  }
}
