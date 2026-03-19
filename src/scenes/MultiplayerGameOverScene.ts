import Phaser from 'phaser';
import { mpClient } from '../multiplayer/MultiplayerClient';
import { MP_PLAYER_COLORS } from '../multiplayer/GhostPlayer';
import { COLORS, DEPTH } from '../config/constants';
import { titleStyle, bodyStyle, smallStyle, buttonStyle, popupStyle, getScale, FONT_FAMILY } from '../utils/TextStyles';
import { createSceneBackground } from '../ui/SceneBackground';
import { createButton } from '../ui/shared';
import { sceneManager } from '../systems/SceneManager';
import { fetchScores } from '../ui/Scoreboard';
import { updateHighScoreIfBetter, getPlayerNameOrDefault, isPlayerNameCustom } from '../utils/Storage';
import { showNameInput } from '../ui/NameInputOverlay';
import { ReplayData } from '../systems/DeathReplay';

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
  replayData?: ReplayData | null;
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
  boss: 'boss-face2',
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
  boss: 'Bestia z Wadowic',
  fall: 'Spadł',
};

export class MultiplayerGameOverScene extends Phaser.Scene {
  private lobbyUpdatedHandler: ((...args: any[]) => void) | null = null;
  private replayData: ReplayData | null = null;

  constructor() {
    super({ key: 'MultiplayerGameOverScene' });
  }

  create(data: MPGameOverData): void {
    const { width, height } = this.cameras.main;
    const s = getScale();
    const rankings = data.rankings || [];
    const myId = data.myId;
    const isHost = data.isHost;
    this.replayData = data?.replayData ?? null;

    // --- Background with all effects ---
    createSceneBackground(this, {
      textureKey: 'menu-bg-multiplayer',
      overlayAlpha: 0.4,
      cycleColorFrom: 0x220044,
      cycleColorTo: 0x440088,
      lighting: { colors: [0xaa66ff, 0xffcc00, 0xff66aa, 0x8844ff, 0xffaa44] },
    });

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

    // --- Update local highscore ---
    const myRanking = rankings.find(r => r.id === myId);
    if (myRanking) {
      updateHighScoreIfBetter(myRanking.score);
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
      if (obstacleType === 'boss') {
        const faces = ['boss-face1', 'boss-face2', 'boss-face3'];
        const faceSpacing = Math.round(14 * s);
        faces.forEach((key, fi) => {
          if (this.textures.exists(key)) {
            const faceIcon = this.add.image(colName + fi * faceSpacing, statLineY, key);
            faceIcon.setScale(Math.round(12 * s) / Math.max(faceIcon.width, faceIcon.height));
            faceIcon.setOrigin(0, 0.5);
            faceIcon.setDepth(DEPTH.PICKUPS);
          }
        });
        statTextX = colName + faces.length * faceSpacing + Math.round(4 * s);
      } else if (deathTexture && this.textures.exists(deathTexture)) {
        const icon = this.add.image(colName, statLineY, deathTexture);
        icon.setScale(Math.round(12 * s) / Math.max(icon.width, icon.height));
        icon.setOrigin(0, 0.5);
        icon.setDepth(DEPTH.PICKUPS);
        statTextX = colName + Math.round(18 * s);
      }

      // Death cause + stats line
      const statParts: string[] = [deathLabel];
      if (stats.timeSurvived !== undefined) statParts.push(`${stats.timeSurvived}s`);
      if (stats.distance !== undefined) statParts.push(`${stats.distance}m`);
      if (typeof stats.maxLevel === 'number') statParts.push(`lv${stats.maxLevel}`);
      if (stats.maxSpeed !== undefined) statParts.push(`${Number(stats.maxSpeed).toFixed(1)}x`);
      if (typeof stats.maxCombo === 'number' && stats.maxCombo > 0) statParts.push(`x${stats.maxCombo}kmb`);
      const pickupParts: string[] = [];
      if (typeof stats.applesCollected === 'number') pickupParts.push(`${stats.applesCollected}`);
      if (typeof stats.tyskiesCollected === 'number') pickupParts.push(`${stats.tyskiesCollected}`);
      if (typeof stats.pillsCollected === 'number') pickupParts.push(`${stats.pillsCollected}`);
      if (pickupParts.length > 0) statParts.push(pickupParts.join('/'));

      this.add.text(statTextX, statLineY, statParts.join('  '), smallStyle({
        fontSize: statFontSize,
        color: '#888888',
        strokeThickness: 1,
      })).setOrigin(0, 0.5);

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

    // --- "Zapisz" button next to player's score ---
    if (myRanking && myRanking.score > 0) {
      const myIndex = rankings.findIndex(r => r.id === myId);
      const myRowY = tableStartY + myIndex * lineHeight;

      fetchScores().then((scores) => {
        const inTop100 = scores.length < 100 || myRanking.score > scores[scores.length - 1].score;
        if (inTop100) {
          const saveBtnX = colScore - Math.round(60 * s);
          const saveBtnY = myRowY - Math.round(12 * s);

          const doSave = (name: string): void => {
            const stats = myRanking.stats || {};
            fetch('/api/scores', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name,
                score: myRanking.score,
                deathCause: stats.obstacleType || null,
                distance: typeof stats.distance === 'number' ? stats.distance : null,
                timeSurvived: typeof stats.timeSurvived === 'number' ? stats.timeSurvived : null,
                applesCollected: typeof stats.applesCollected === 'number' ? stats.applesCollected : null,
                tyskiesCollected: typeof stats.tyskiesCollected === 'number' ? stats.tyskiesCollected : null,
                pillsCollected: typeof stats.pillsCollected === 'number' ? stats.pillsCollected : null,
                maxLevel: typeof stats.maxLevel === 'number' ? stats.maxLevel : null,
                maxCombo: typeof stats.maxCombo === 'number' ? stats.maxCombo : null,
              }),
            }).catch(() => { /* offline is fine */ });

            this.add.text(saveBtnX, saveBtnY, 'OK!', smallStyle({
              fontSize: `${Math.round(8 * s)}px`,
              color: '#00ff00',
            })).setOrigin(0.5);
          };

          const saveBtn = createButton(this, saveBtnX, saveBtnY, Math.round(70 * s), Math.round(22 * s), 'Zapisz', 0x008800, buttonStyle({
            fontSize: `${Math.round(8 * s)}px`,
            strokeThickness: 2,
          }), () => {
            for (const obj of saveBtn.all) obj.destroy();
            if (!isPlayerNameCustom()) {
              showNameInput(this, doSave, myRanking.name);
            } else {
              doSave(getPlayerNameOrDefault());
            }
          });

          this.tweens.add({
            targets: saveBtn.all,
            alpha: { from: 0.7, to: 1 },
            duration: 600,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        }
      }).catch(() => { /* offline is fine */ });
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

    if (this.replayData && this.replayData.frames.length > 0) {
      createButton(this, width / 2, topBtnY - btnH - btnGap, btnW, btnH, 'Powtórka', 0x333366, btnS, () => this.playReplay());
    }

    // Leave button (everyone)
    createButton(this, width / 2, bottomBtnY, btnW, btnH, 'Opusc', 0x666666, btnS, () => {
      sceneManager.goto(this, 'MultiplayerMenuScene', undefined, () => {
        this.cleanupListeners();
        mpClient.leaveLobby();
      });
    });

    // Host: Rematch with countdown; Non-host: waiting text
    if (isHost) {
      const rematch = createButton(this, width / 2, topBtnY, btnW, btnH, 'Rewanżyk (5)', 0x880000, btnS, () => {
        mpClient.restartLobby();
      });
      // Disabled during countdown
      rematch.hitZone.disableInteractive();
      for (const obj of rematch.all) (obj as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(0.4);
      rematch.txt.setColor('#888888');

      let countdown = 5;
      this.time.addEvent({
        delay: 1000,
        repeat: 4,
        callback: () => {
          countdown--;
          if (countdown > 0) {
            rematch.txt.setText(`Rewanżyk (${countdown})`);
          } else {
            rematch.txt.setText('Rewanżyk');
            rematch.txt.setColor('#dddddd');
            for (const obj of rematch.all) (obj as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(1);
            rematch.hitZone.setInteractive({ useHandCursor: true });
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
        sceneManager.goto(this, 'LobbyScene', { lobbyData }, () => {
          this.cleanupListeners();
        });
      }
    };
    mpClient.on('lobby:updated', this.lobbyUpdatedHandler);

    this.events.on('shutdown', () => {
      this.cleanupListeners();
    });
  }

  private playReplay(): void {
    if (!this.replayData || this.replayData.frames.length < 2) return;
    const data = this.replayData;
    const { width, height } = this.cameras.main;
    const cleanup: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.85)
      .setScrollFactor(0).setDepth(1000);
    cleanup.push(overlay);

    const floorGfx = this.add.graphics().setScrollFactor(0).setDepth(1000);
    floorGfx.lineStyle(1, 0x444444, 0.5);
    floorGfx.lineBetween(0, 296, width, 296);
    floorGfx.lineBetween(0, 396, width, 396);
    cleanup.push(floorGfx);

    const COCKROACH_SCREEN_X = 200;
    const lastFrame = data.frames[data.frames.length - 1];
    const killerTexture = data.obstacleType ? OBSTACLE_TEXTURE[data.obstacleType] : null;

    const worldSprites: { img: Phaser.GameObjects.Image; worldX: number; baseY: number }[] = [];

    for (const obs of data.obstacles) {
      if (!this.textures.exists(obs.textureKey)) continue;
      const img = this.add.image(0, obs.y, obs.textureKey)
        .setScale(0.22).setScrollFactor(0).setDepth(1001).setAlpha(0.7).setTint(0x4488ff);
      cleanup.push(img);
      worldSprites.push({ img, worldX: obs.worldX, baseY: obs.y });
    }

    for (const pk of data.pickups) {
      if (!this.textures.exists(pk.textureKey)) continue;
      const img = this.add.image(0, pk.y, pk.textureKey)
        .setScale(0.15).setScrollFactor(0).setDepth(1001).setAlpha(0.7).setTint(0x44ff44);
      cleanup.push(img);
      worldSprites.push({ img, worldX: pk.worldX, baseY: pk.y });
    }

    let killerSprite: Phaser.GameObjects.Image | null = null;
    if (killerTexture && this.textures.exists(killerTexture)) {
      killerSprite = this.add.image(0, lastFrame.y, killerTexture)
        .setScale(0.25).setScrollFactor(0).setDepth(1002).setAlpha(0.9);
      cleanup.push(killerSprite);
    }
    const killerWorldX = lastFrame.x + 50;

    const ghost = this.add.sprite(COCKROACH_SCREEN_X, data.frames[0].y, 'cockroach-idle')
      .setScale(0.30).setAlpha(0.7).setTint(0x8888ff).setScrollFactor(0).setDepth(1003);
    cleanup.push(ghost);

    const label = this.add.text(width / 2, 30, '', popupStyle({ fontSize: '10px', color: '#ff4444' }))
      .setOrigin(0.5).setScrollFactor(0).setDepth(1004);
    cleanup.push(label);

    let frameIndex = 0;
    let deathAnimPlayed = false;
    const playbackStart = this.time.now;
    const replayDuration = data.frames[data.frames.length - 1].time - data.frames[0].time;
    const baseTime = data.frames[0].time;

    const replayUpdate = (): void => {
      const elapsed = this.time.now - playbackStart;
      const replayTime = baseTime + elapsed;

      while (frameIndex < data.frames.length - 1 && data.frames[frameIndex + 1].time <= replayTime) {
        frameIndex++;
      }

      const frame = data.frames[frameIndex];
      ghost.setPosition(COCKROACH_SCREEN_X, frame.y);
      ghost.setTexture(frame.texture);
      if (frame.isDashing) ghost.setTint(0xffffff);
      else if (frame.isPillActive) ghost.setTint(0xff00ff);
      else ghost.setTint(0x8888ff);

      const cameraWorldX = frame.x - COCKROACH_SCREEN_X;
      for (const ws of worldSprites) {
        const screenX = ws.worldX - cameraWorldX;
        ws.img.setX(screenX);
        ws.img.setY(ws.baseY + Math.sin(elapsed * 0.004 + ws.worldX * 0.01) * 6);
        ws.img.setVisible(screenX > -50 && screenX < width + 50);
      }

      if (killerSprite) {
        const killerScreenX = killerWorldX - cameraWorldX;
        killerSprite.setX(killerScreenX);
        killerSprite.setVisible(killerScreenX > -50 && killerScreenX < width + 50);
        const pulse = Math.sin(elapsed * 0.01) * 0.5 + 0.5;
        killerSprite.setTint(Phaser.Display.Color.GetColor(255, Math.floor(pulse * 100), Math.floor(pulse * 100)));
      }

      const remaining = Math.ceil((replayDuration - elapsed) / 1000);
      if (remaining > 0) label.setText(`${remaining}...`);
      else label.setText('');

      if (frameIndex >= data.frames.length - 1 && !deathAnimPlayed) {
        deathAnimPlayed = true;
        ghost.setTint(0x444444);
        this.tweens.add({
          targets: ghost,
          y: ghost.y - 80,
          x: ghost.x - 20,
          angle: 720,
          alpha: 0,
          duration: 1000,
          ease: 'Linear',
        });
        this.cameras.main.shake(200, 0.005);
      }

      if (elapsed >= replayDuration + 1500 && !cleanup.find(o => (o as any)._fading)) {
        this.events.off('update', replayUpdate);
        (overlay as any)._fading = true;
        this.tweens.add({
          targets: cleanup.filter(o => o.active),
          alpha: 0,
          duration: 500,
          ease: 'Power2',
          onComplete: () => {
            for (const obj of cleanup) if (obj.active) obj.destroy();
          },
        });
      }
    };

    this.events.on('update', replayUpdate);
  }

  private cleanupListeners(): void {
    if (this.lobbyUpdatedHandler) {
      mpClient.off('lobby:updated', this.lobbyUpdatedHandler);
      this.lobbyUpdatedHandler = null;
    }
  }
}
