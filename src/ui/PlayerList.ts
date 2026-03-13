import Phaser from 'phaser';
import { mpClient, MPLobbyData } from '../multiplayer/MultiplayerClient';
import { MP_PLAYER_COLORS } from '../multiplayer/GhostPlayer';
import { FONT_FAMILY } from './shared';

export interface PlayerListConfig {
  listTop: number;
  listBottom: number;
}

/**
 * Renders the player list for a lobby, including color swatches,
 * ready indicators, and the player count label.
 */
export class PlayerList {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private maskGraphics: Phaser.GameObjects.Graphics;
  private playerCountText: Phaser.GameObjects.Text;
  private listTop: number;

  constructor(scene: Phaser.Scene, config: PlayerListConfig, playerCountText: Phaser.GameObjects.Text) {
    this.scene = scene;
    this.listTop = config.listTop;
    this.playerCountText = playerCountText;

    const { width } = scene.cameras.main;
    const listHeight = config.listBottom - config.listTop;

    // List background
    scene.add.rectangle(width / 2, config.listTop + listHeight / 2, width - 40, listHeight, 0x111122, 0.5);

    // Container + mask
    this.container = scene.add.container(0, 0);
    this.maskGraphics = scene.make.graphics({});
    this.maskGraphics.fillRect(20, config.listTop, width - 40, listHeight);
    this.container.setMask(new Phaser.Display.Masks.GeometryMask(scene, this.maskGraphics));
  }

  /**
   * Re-renders the player list from the current lobby data.
   * @param lobbyData Current lobby state.
   * @param onLobbyUpdate Called with updated lobby data after a color change.
   */
  render(lobbyData: MPLobbyData, onLobbyUpdate: (data: MPLobbyData) => void): void {
    const { width } = this.scene.cameras.main;
    const lineHeight = 36;

    this.container.removeAll(true);

    // Update player count
    this.playerCountText.setText(`${lobbyData.players.length}/16 karaluch\u00f3w`);

    for (let i = 0; i < lobbyData.players.length; i++) {
      const player = lobbyData.players[i];
      const y = this.listTop + 10 + i * lineHeight;
      const isMe = player.id === mpClient.myId;

      // Color swatch (24x24)
      const swatchColor = MP_PLAYER_COLORS[player.color] ?? 0xffffff;
      const swatch = this.scene.add.rectangle(50, y + lineHeight / 2 - 4, 24, 24, swatchColor, 1);

      if (isMe) {
        // Own color swatch is clickable -- cycles to next available color
        swatch.setInteractive({ useHandCursor: true });
        swatch.setStrokeStyle(2, 0xffffff);
        swatch.on('pointerdown', () => {
          const usedColors = new Set(
            lobbyData.players.filter(p => p.id !== player.id).map(p => p.color),
          );
          let next = (player.color + 1) % MP_PLAYER_COLORS.length;
          const start = next;
          while (usedColors.has(next)) {
            next = (next + 1) % MP_PLAYER_COLORS.length;
            if (next === start) return; // all taken
          }
          mpClient.changeColor(next).then((updatedLobby) => {
            onLobbyUpdate(updatedLobby);
          }).catch(() => {});
        });
      }

      // Player name
      const nameColor = isMe ? '#00ff66' : '#ffffff';
      const suffix = player.isHost ? ' (host)' : '';
      const nameText = this.scene.add.text(80, y + lineHeight / 2 - 4, player.name + suffix, {
        fontSize: '10px',
        color: nameColor,
        fontFamily: FONT_FAMILY,
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0, 0.5);

      // Ready indicator on the right (skip for host)
      let readyText: Phaser.GameObjects.Text | null = null;
      if (!player.isHost) {
        readyText = this.scene.add.text(width - 30, y + lineHeight / 2 - 4, player.ready ? '\u2714' : '\u2022', {
          fontSize: player.ready ? '14px' : '10px',
          color: player.ready ? '#00ff00' : '#666666',
          fontFamily: FONT_FAMILY,
          stroke: '#000000',
          strokeThickness: 2,
        }).setOrigin(0.5, 0.5);
      }

      // Row background highlight for self
      if (isMe) {
        const rowBg = this.scene.add.rectangle(width / 2, y + lineHeight / 2 - 4, width - 60, lineHeight - 4, 0x003322, 0.3);
        this.container.add(rowBg);
      }

      const items: Phaser.GameObjects.GameObject[] = [swatch, nameText];
      if (readyText) items.push(readyText);
      this.container.add(items);
    }
  }

  destroy(): void {
    this.maskGraphics.destroy();
  }
}
