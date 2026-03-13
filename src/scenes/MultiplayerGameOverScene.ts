import Phaser from 'phaser';
import { mpClient } from '../multiplayer/MultiplayerClient';
import { MP_PLAYER_COLORS } from '../multiplayer/GhostPlayer';
import { COLORS } from '../config/constants';
import { titleStyle, bodyStyle, smallStyle, buttonStyle, getScale, FONT_FAMILY } from '../utils/TextStyles';
import { createPulsingOverlay } from '../utils/TweenPatterns';
import { spawnFloatingParticle } from '../ui/SceneBackground';
import { createButton } from '../ui/shared';

interface MPGameOverRanking {
  id: string;
  name: string;
  color: number;
  score: number;
  stats: Record<string, unknown>;
}

interface MPGameOverData {
  rankings: MPGameOverRanking[];
  myId: string;
  isHost: boolean;
}

// Map obstacle type names to texture keys for the death icon
const OBSTACLE_TEXTURE: Record<string, string> = {
  onion: 'onion',
  spray: 'pest-spray',
  flipper: 'flipper',
  newspaper: 'newspaper',
  bird: 'bird',
  cat: 'cat-paw',
  disco: 'disco-ball',
  jellyfish: 'jellyfish',
  pope: 'pope',
  bison: 'bison',
  blackhole: 'black-hole',
};

// Polish death cause labels
const OBSTACLE_LABEL: Record<string, string> = {
  onion: 'Cebula',
  spray: 'Spray',
  flipper: 'Klapek',
  newspaper: 'Gazeta',
  bird: 'Ptak',
  cat: 'Łapa kota',
  disco: 'Dyskoteka',
  jellyfish: 'Meduza',
  pope: 'Papież',
  bison: 'Żubr',
  blackhole: 'Czarna dziura',
  fall: 'Spadł',
};

export class MultiplayerGameOverScene extends Phaser.Scene {
  private lobbyUpdatedHandler: ((...args: any[]) => void) | null = null;

  constructor() {
    super({ key: 'MultiplayerGameOverScene' });
  }

  create(data: MPGameOverData): void {
    const { width, height } = this.cameras.main;
    const s = getScale();
    const rankings = data.rankings || [];
    const myId = data.myId;
    const isHost = data.isHost;

    // --- Background ---
    this.cameras.main.setBackgroundColor('#0a0a0a');
    createPulsingOverlay(this, width, height, 0x220044, 0.3, 0.05);

    // Floating neon particles
    for (let i = 0; i < 10; i++) {
      spawnFloatingParticle(this, width, height, COLORS.NEON);
    }

    // --- Title: "WYNIKI ZJAZDU" ---
    const title = this.add.text(width / 2, Math.round(30 * s), 'WYNIKI ZJAZDU', titleStyle({
      fontSize: `${Math.round(20 * s)}px`,
      strokeThickness: Math.round(6 * s),
    })).setOrigin(0.5);

    title.setAngle(-3);
    this.tweens.add({
      targets: title,
      angle: 3,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // --- Auto-save highscore ---
    let isNewRecord = false;
    const myRanking = rankings.find(r => r.id === myId);
    if (myRanking) {
      const currentHigh = parseInt(localStorage.getItem('cockroach-highscore') || '0', 10);
      if (myRanking.score > currentHigh) {
        localStorage.setItem('cockroach-highscore', String(myRanking.score));
        isNewRecord = true;
      }
    }

    // --- Rankings table ---
    const tableStartY = Math.round(65 * s);
    const lineHeight = Math.round(58 * s);
    const statFontSize = `${Math.round(7 * s)}px`;

    // Column positions
    const colRank = Math.round(15 * s);
    const colColor = Math.round(45 * s);
    const colName = Math.round(68 * s);
    const colScore = width - Math.round(15 * s);

    for (let i = 0; i < rankings.length; i++) {
      const entry = rankings[i];
      const rank = i + 1;
      const y = tableStartY + i * lineHeight;
      const isMe = entry.id === myId;

      // Rank-based styling
      let color: string;
      let fontSize: number;
      let strokeThickness: number;

      if (rank === 1) {
        color = '#ffd700';
        fontSize = Math.round(12 * s);
        strokeThickness = Math.round(4 * s);
      } else if (rank === 2) {
        color = '#c0c0c0';
        fontSize = Math.round(11 * s);
        strokeThickness = Math.round(3 * s);
      } else if (rank === 3) {
        color = '#cd7f32';
        fontSize = Math.round(10 * s);
        strokeThickness = Math.round(3 * s);
      } else {
        color = '#ffffff';
        fontSize = Math.round(9 * s);
        strokeThickness = Math.round(2 * s);
      }

      const rowStyle: Phaser.Types.GameObjects.Text.TextStyle = {
        fontSize: `${fontSize}px`,
        color,
        fontFamily: FONT_FAMILY,
        stroke: '#000000',
        strokeThickness,
      };

      // Row background for self
      if (isMe) {
        this.add.rectangle(width / 2, y + Math.round(8 * s), width - Math.round(20 * s), lineHeight - Math.round(6 * s), 0x003322, 0.3);
      }

      // Rank number (stable -- never animated)
      this.add.text(colRank, y, `${rank}.`, rowStyle).setOrigin(0, 0.5);

      // Player color square
      const playerColor = MP_PLAYER_COLORS[entry.color] ?? 0xffffff;
      const sq = Math.round(16 * s);
      this.add.rectangle(colColor, y, sq, sq, playerColor, 1);

      // Player name (highlight if self)
      const nameStyle = { ...rowStyle };
      if (isMe) nameStyle.color = '#00ffff';
      const nameText = this.add.text(colName, y, entry.name, nameStyle).setOrigin(0, 0.5);

      // Score (right-aligned)
      const scoreText = this.add.text(colScore, y, String(entry.score), rowStyle).setOrigin(1, 0.5);

      // Death cause icon + label below name
      const stats = entry.stats || {};
      const obstacleType = (stats.obstacleType as string) || 'fall';
      const deathTexture = OBSTACLE_TEXTURE[obstacleType];
      const deathLabel = OBSTACLE_LABEL[obstacleType] || obstacleType;

      const statLineY = y + Math.round(16 * s);

      // Show obstacle sprite if texture exists
      let statTextX = colName;
      if (deathTexture && this.textures.exists(deathTexture)) {
        const icon = this.add.image(colName, statLineY, deathTexture);
        icon.setScale(Math.round(12 * s) / Math.max(icon.width, icon.height));
        icon.setOrigin(0, 0.5);
        icon.setDepth(10);
        statTextX = colName + Math.round(18 * s);
      }

      // Death cause + stats line
      const statParts: string[] = [deathLabel];
      if (stats.timeSurvived !== undefined) statParts.push(`${stats.timeSurvived}s`);
      if (stats.distance !== undefined) statParts.push(`${stats.distance}m`);
      if (stats.maxSpeed !== undefined) statParts.push(`${Number(stats.maxSpeed).toFixed(1)}x`);

      this.add.text(statTextX, statLineY, statParts.join('  '), smallStyle({
        fontSize: statFontSize,
        color: '#888888',
        strokeThickness: 1,
      })).setOrigin(0, 0.5);

      // "NOWY REKORD!" badge
      if (isMe && isNewRecord) {
        const badge = this.add.text(colScore, y - Math.round(10 * s), 'NOWY REKORD!', smallStyle({
          fontSize: `${Math.round(7 * s)}px`,
          color: '#ffff00',
          strokeThickness: Math.round(2 * s),
        })).setOrigin(1, 0.5);

        this.tweens.add({
          targets: badge,
          scaleX: { from: 1, to: 1.15 },
          scaleY: { from: 1, to: 1.15 },
          duration: 600,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }

      // Top 3 effects -- only name and score animate (rank stays stable)
      const animElements = [nameText, scoreText];

      if (rank === 1) {
        const colors = COLORS.RAINBOW;
        let ci = 0;
        this.time.addEvent({
          delay: 150,
          loop: true,
          callback: () => {
            ci = (ci + 1) % colors.length;
            animElements.forEach(el => el.setColor('#' + colors[ci].toString(16).padStart(6, '0')));
          },
        });
        this.tweens.add({
          targets: animElements,
          scaleX: { from: 1, to: 1.06 },
          scaleY: { from: 1, to: 1.06 },
          duration: 400,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        const originalXs = animElements.map(el => el.x);
        this.time.addEvent({
          delay: 80,
          loop: true,
          callback: () => {
            animElements.forEach((el, idx) => { el.x = originalXs[idx] + Phaser.Math.Between(-1, 1); });
          },
        });
      } else if (rank === 2) {
        this.tweens.add({
          targets: animElements,
          alpha: { from: 0.7, to: 1 },
          duration: 600,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      } else if (rank === 3) {
        this.tweens.add({
          targets: animElements,
          alpha: { from: 0.8, to: 1 },
          duration: 1000,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }

    // --- Buttons ---
    const btnS = buttonStyle({
      fontSize: `${Math.round(11 * s)}px`,
      strokeThickness: Math.round(3 * s),
    });

    const btnW = Math.round(200 * s);
    const btnH = Math.round(38 * s);
    const btnGap = Math.round(14 * s);
    const bottomBtnY = height - Math.round(40 * s);
    const topBtnY = bottomBtnY - btnH - btnGap;

    // Leave button (everyone)
    createButton(this, width / 2, bottomBtnY, btnW, btnH, 'Opusc', 0x666666, btnS, () => {
      this.cleanupListeners();
      mpClient.leaveLobby();
      this.scene.start('MultiplayerMenuScene');
    });

    // Host: Rematch with countdown; Non-host: waiting text
    if (isHost) {
      const rematchBg = this.add.rectangle(width / 2, topBtnY, btnW, btnH, 0x880000, 0.4);
      const countdownText = this.add.text(width / 2, topBtnY, 'Rewanzyk (5)', {
        ...btnS,
        color: '#888888',
      }).setOrigin(0.5);

      let countdown = 5;
      this.time.addEvent({
        delay: 1000,
        repeat: 4,
        callback: () => {
          countdown--;
          if (countdown > 0) {
            countdownText.setText(`Rewanzyk (${countdown})`);
          } else {
            countdownText.setText('Rewanzyk');
            countdownText.setColor('#ffffff');
            rematchBg.setAlpha(0.9);
            rematchBg.setInteractive({ useHandCursor: true });

            rematchBg.on('pointerover', () => {
              rematchBg.setAlpha(1);
              countdownText.setColor('#ffff00');
            });
            rematchBg.on('pointerout', () => {
              rematchBg.setAlpha(0.9);
              countdownText.setColor('#ffffff');
            });
            rematchBg.on('pointerdown', () => {
              mpClient.restartLobby();
            });
          }
        },
      });
    } else {
      this.add.text(width / 2, topBtnY, 'Oczekiwanie na\nkaralucha gospodarza...', smallStyle({
        fontSize: `${Math.round(8 * s)}px`,
        color: '#888888',
        strokeThickness: Math.round(2 * s),
        align: 'center',
      })).setOrigin(0.5);
    }

    // --- Socket listeners ---
    this.lobbyUpdatedHandler = (lobbyData: { id: string; players: any[]; status: string }) => {
      if (lobbyData.status === 'waiting') {
        this.cleanupListeners();
        this.scene.start('LobbyScene', { lobbyData });
      }
    };
    mpClient.on('lobby:updated', this.lobbyUpdatedHandler);

    this.events.on('shutdown', () => {
      this.cleanupListeners();
    });
  }

  private cleanupListeners(): void {
    if (this.lobbyUpdatedHandler) {
      mpClient.off('lobby:updated', this.lobbyUpdatedHandler);
      this.lobbyUpdatedHandler = null;
    }
  }
}
