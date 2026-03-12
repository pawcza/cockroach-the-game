import Phaser from 'phaser';
import { mpClient } from '../multiplayer/MultiplayerClient';

interface MPGameOverRanking {
  id: string;
  name: string;
  score: number;
  stats: Record<string, unknown>;
}

interface MPGameOverData {
  rankings: MPGameOverRanking[];
  myId: string;
  isHost: boolean;
}

const FONT_FAMILY = '"Press Start 2P", monospace';

function getScale(): number {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 1.5 : 1;
}

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

    const pulseOverlay = this.add.rectangle(width / 2, height / 2, width, height, 0x220044, 0.3);
    pulseOverlay.setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: pulseOverlay,
      alpha: 0.05,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Floating neon particles
    const neonColors = [0xff00ff, 0x00ffff, 0xff6600, 0x00ff66, 0xffff00, 0xff0088, 0x8800ff];
    for (let i = 0; i < 10; i++) {
      this.spawnFloatingParticle(width, height, neonColors);
    }

    // --- Title: "WYNIKI ZJAZDU" ---
    const title = this.add.text(width / 2, Math.round(30 * s), 'WYNIKI ZJAZDU', {
      fontSize: `${Math.round(20 * s)}px`,
      color: '#ffff00',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: Math.round(6 * s),
    }).setOrigin(0.5);

    // Wobbly angle oscillation
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
    const tableStartY = Math.round(70 * s);
    const lineHeight = Math.round(28 * s);
    const rankColors = ['#ffd700', '#c0c0c0', '#cd7f32']; // gold, silver, bronze

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
        fontSize = Math.round(14 * s);
        strokeThickness = Math.round(5 * s);
      } else if (rank === 2) {
        color = '#c0c0c0';
        fontSize = Math.round(12 * s);
        strokeThickness = Math.round(4 * s);
      } else if (rank === 3) {
        color = '#cd7f32';
        fontSize = Math.round(11 * s);
        strokeThickness = Math.round(3 * s);
      } else {
        color = '#ffffff';
        fontSize = Math.round(10 * s);
        strokeThickness = Math.round(2 * s);
      }

      const rowStyle: Phaser.Types.GameObjects.Text.TextStyle = {
        fontSize: `${fontSize}px`,
        color,
        fontFamily: FONT_FAMILY,
        stroke: '#000000',
        strokeThickness,
      };

      // Rank number
      const rankText = this.add.text(Math.round(20 * s), y, `${rank}.`, rowStyle).setOrigin(0, 0.5);

      // Color dot (rank-based)
      const dotColor = rank <= 3
        ? Phaser.Display.Color.HexStringToColor(rankColors[rank - 1]).color
        : 0xffffff;
      const dot = this.add.circle(Math.round(55 * s), y, Math.round(5 * s), dotColor);

      // Player name (highlight if self)
      const nameStyle = { ...rowStyle };
      if (isMe) {
        nameStyle.color = '#00ffff';
      }
      const nameText = this.add.text(Math.round(70 * s), y, entry.name, nameStyle).setOrigin(0, 0.5);

      // Score (right-aligned)
      const scoreText = this.add.text(width - Math.round(20 * s), y, String(entry.score), rowStyle).setOrigin(1, 0.5);

      // "NOWY REKORD!" badge
      if (isMe && isNewRecord) {
        const badge = this.add.text(width - Math.round(20 * s), y - Math.round(12 * s), 'NOWY REKORD!', {
          fontSize: `${Math.round(7 * s)}px`,
          color: '#ffff00',
          fontFamily: FONT_FAMILY,
          stroke: '#000000',
          strokeThickness: Math.round(2 * s),
        }).setOrigin(1, 0.5);

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

      // Top 3 trippy effects
      const elements = [rankText, nameText, scoreText];

      if (rank === 1) {
        // #1: color cycling + scale pulse + shake
        const colors = ['#ffd700', '#ff00ff', '#ffff00', '#00ffff', '#ff6600'];
        let ci = 0;
        this.time.addEvent({
          delay: 150,
          loop: true,
          callback: () => {
            ci = (ci + 1) % colors.length;
            elements.forEach(el => el.setColor(colors[ci]));
          },
        });
        this.tweens.add({
          targets: elements,
          scaleX: { from: 1, to: 1.08 },
          scaleY: { from: 1, to: 1.08 },
          duration: 400,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        this.time.addEvent({
          delay: 80,
          loop: true,
          callback: () => {
            elements.forEach(el => {
              el.x += Phaser.Math.Between(-1, 1);
            });
          },
        });
      } else if (rank === 2) {
        // #2: glow pulse + slight wobble
        this.tweens.add({
          targets: elements,
          alpha: { from: 0.7, to: 1 },
          duration: 600,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        this.tweens.add({
          targets: elements,
          angle: { from: -1, to: 1 },
          duration: 800,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      } else if (rank === 3) {
        // #3: subtle alpha pulse
        this.tweens.add({
          targets: elements,
          alpha: { from: 0.8, to: 1 },
          duration: 1000,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }

    // --- Stats for my player ---
    const statsStartY = tableStartY + rankings.length * lineHeight + Math.round(10 * s);
    if (myRanking && myRanking.stats) {
      const stats = myRanking.stats;
      const statFontSize = `${Math.round(8 * s)}px`;
      const statLineHeight = Math.round(18 * s);
      let statIdx = 0;

      const statEntries: { label: string; value: string; color: string }[] = [];
      if (stats.timeSurvived !== undefined) {
        statEntries.push({ label: 'Czas', value: `${stats.timeSurvived}s`, color: '#00ccff' });
      }
      if (stats.distance !== undefined) {
        statEntries.push({ label: 'Dystans', value: `${stats.distance}m`, color: '#ff6600' });
      }
      if (stats.maxSpeed !== undefined) {
        statEntries.push({ label: 'Maks Szybkosc', value: `${Number(stats.maxSpeed).toFixed(1)}x`, color: '#cc66ff' });
      }

      statEntries.forEach((stat) => {
        const y = statsStartY + statIdx * statLineHeight;
        this.add.text(width / 2 - Math.round(8 * s), y, stat.label, {
          fontSize: statFontSize,
          color: '#aaaaaa',
          fontFamily: FONT_FAMILY,
        }).setOrigin(1, 0.5);
        this.add.text(width / 2 + Math.round(8 * s), y, stat.value, {
          fontSize: statFontSize,
          color: stat.color,
          fontFamily: FONT_FAMILY,
          stroke: '#000000',
          strokeThickness: 2,
        }).setOrigin(0, 0.5);
        statIdx++;
      });
    }

    // --- Buttons ---
    const btnStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: `${Math.round(11 * s)}px`,
      fontFamily: FONT_FAMILY,
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: Math.round(3 * s),
      align: 'center',
    };

    const btnW = Math.round(200 * s);
    const btnH = Math.round(38 * s);
    const btnGap = Math.round(14 * s);
    const bottomBtnY = height - Math.round(40 * s);
    const topBtnY = bottomBtnY - btnH - btnGap;

    // Leave button (everyone)
    this.createButton(
      width / 2, bottomBtnY, btnW, btnH, 'Opusc', 0x666666, btnStyle,
      () => {
        this.cleanupListeners();
        mpClient.leaveLobby();
        this.scene.start('MultiplayerMenuScene');
      },
    );

    // Host: Rematch with countdown; Non-host: waiting text
    if (isHost) {
      const rematchBg = this.add.rectangle(width / 2, topBtnY, btnW, btnH, 0x880000, 0.4);
      const countdownText = this.add.text(width / 2, topBtnY, 'Rewanzyk (10)', {
        ...btnStyle,
        color: '#888888',
      }).setOrigin(0.5);

      let countdown = 10;
      const countdownEvent = this.time.addEvent({
        delay: 1000,
        repeat: 9,
        callback: () => {
          countdown--;
          if (countdown > 0) {
            countdownText.setText(`Rewanzyk (${countdown})`);
          } else {
            // Unlock button
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
      this.add.text(width / 2, topBtnY, 'Oczekiwanie na\nkaralucha gospodarza...', {
        fontSize: `${Math.round(8 * s)}px`,
        fontFamily: FONT_FAMILY,
        color: '#888888',
        stroke: '#000000',
        strokeThickness: Math.round(2 * s),
        align: 'center',
      }).setOrigin(0.5);
    }

    // --- Socket listeners ---
    this.lobbyUpdatedHandler = (lobby: { status: string }) => {
      if (lobby.status === 'waiting') {
        this.cleanupListeners();
        this.scene.start('LobbyScene');
      }
    };
    mpClient.on('lobby:updated', this.lobbyUpdatedHandler);

    // Clean up on scene shutdown
    this.events.on('shutdown', () => {
      this.cleanupListeners();
    });
  }

  private createButton(
    x: number, y: number, w: number, h: number,
    label: string, color: number,
    style: Phaser.Types.GameObjects.Text.TextStyle,
    action: () => void,
  ): void {
    const bg = this.add.rectangle(x, y, w, h, color, 0.9)
      .setInteractive({ useHandCursor: true });
    const txt = this.add.text(x, y, label, style).setOrigin(0.5);
    bg.on('pointerover', () => { bg.setAlpha(1); txt.setColor('#ffff00'); });
    bg.on('pointerout', () => { bg.setAlpha(0.9); txt.setColor('#ffffff'); });
    bg.on('pointerdown', action);
  }

  private cleanupListeners(): void {
    if (this.lobbyUpdatedHandler) {
      mpClient.off('lobby:updated', this.lobbyUpdatedHandler);
      this.lobbyUpdatedHandler = null;
    }
  }

  private spawnFloatingParticle(
    sceneWidth: number,
    sceneHeight: number,
    colors: number[],
  ): void {
    const color = Phaser.Utils.Array.GetRandom(colors);
    const size = Phaser.Math.Between(2, 8);
    const x = Phaser.Math.Between(0, sceneWidth);
    const y = Phaser.Math.Between(0, sceneHeight);

    const particle = this.add.circle(x, y, size, color, 0.6);
    particle.setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({
      targets: particle,
      x: x + Phaser.Math.Between(-100, 100),
      y: y + Phaser.Math.Between(-150, -50),
      alpha: 0,
      duration: Phaser.Math.Between(3000, 7000),
      ease: 'Sine.easeIn',
      onComplete: () => {
        particle.destroy();
        this.spawnFloatingParticle(sceneWidth, sceneHeight, colors);
      },
    });
  }
}
