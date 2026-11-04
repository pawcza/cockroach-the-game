import Phaser from 'phaser';
import { mpClient, type MPLobbyData, type MPPlayer, type MPRanking } from '../multiplayer/MultiplayerClient';
import { MP_START_LEAD_MS } from '../../server/lobby';
import { PLAYER_COLORS } from '../../server/lobby';
import { DEPTH } from '../config/constants';
import { titleStyle, smallStyle, buttonStyle, getScale, UI_TEXT } from '../utils/TextStyles';
import { createSceneBackground } from '../ui/SceneBackground';
import { addObstacleArt, createButton, createPanel, OBSTACLE_LABEL, showAchievement, UIButton } from '../ui/shared';
import { recordMatch } from '../systems/Profile';
import { MenuNav } from '../ui/MenuNav';
import { sceneManager } from '../systems/SceneManager';
import { fetchScores } from '../ui/Scoreboard';
import { updateHighScoreIfBetter } from '../utils/Storage';
import { account, signIn, signInAvailable, submitScore, type ScoreSubmission } from '../ui/Account';
import { ReplayData } from '../systems/DeathReplay';
import { DeathReplayPlayer } from '../systems/DeathReplayPlayer';

interface MPGameOverData {
  rankings: MPRanking[];
  myId: string;
  isHost: boolean;
  replayData?: ReplayData | null;
}

export class MultiplayerGameOverScene extends Phaser.Scene {
  private lobbyUpdatedHandler: ((lobbyData: MPLobbyData) => void) | null = null;
  private gameStartHandler: ((data: { seed: number; players: MPPlayer[] }) => void) | null = null;
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

    createSceneBackground(this, { level: 6, dim: 0.6, scrollSpeed: 0.15 });
    const nav = new MenuNav(this);

    this.add.text(Math.round(width / 2), Math.round(30 * s), 'WYNIKI ZJAZDU', titleStyle({
      fontSize: `${Math.round(20 * s)}px`,
      color: UI_TEXT.bone,
      strokeThickness: Math.round(6 * s),
      shadow: { offsetX: 0, offsetY: 3, color: '#0d2a3a', blur: 0, fill: true, stroke: true },
    })).setOrigin(0.5);

    // --- Update local highscore ---
    const myRanking = rankings.find(r => r.id === myId);
    // A match you played (not one you only watched) counts, and a win when you top it
    if (myRanking && rankings.length > 1) {
      for (const achievement of recordMatch(rankings[0].id === myId)) showAchievement(this, achievement);
    }
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

    if (rankings.length > 0) {
      createPanel(this, 6, tableStartY - Math.round(22 * s), width - 12, rankings.length * lineHeight + Math.round(8 * s));
    }

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
        color = UI_TEXT.bone;
        fontSize = Math.round(9 * s);
        strokeThickness = Math.round(2 * s);
      }

      const rowStyle = smallStyle({
        fontSize: `${fontSize}px`,
        color,
        strokeThickness,
      });

      // Row background for self
      if (isMe) {
        this.add.rectangle(width / 2, y + Math.round(6 * s), width - Math.round(20 * s), lineHeight - Math.round(10 * s), 0x2a1f18, 0.9);
      }

      // Rank number (stable -- never animated)
      this.add.text(colRank, y, `${rank}.`, rowStyle).setOrigin(0, 0.5);

      // Player color square
      const playerColor = PLAYER_COLORS[entry.color] ?? 0xffffff;
      const sq = Math.round(16 * s);
      this.add.rectangle(colColor, y, sq, sq, playerColor, 1);

      // Player name (highlight if self)
      const nameStyle = { ...rowStyle };
      if (isMe) nameStyle.color = '#fff1c2';
      this.add.text(colName, y, entry.name, nameStyle).setOrigin(0, 0.5);

      // Score (right-aligned)
      this.add.text(colScore, y, String(entry.score), rowStyle).setOrigin(1, 0.5);

      // Death cause icon + label below name
      const stats = entry.stats || {};
      const obstacleType = (stats.obstacleType as string) || 'fall';
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
      } else {
        const icon = addObstacleArt(this, colName, statLineY, obstacleType);
        if (icon) {
          icon.setScale(Math.round(16 * s) / Math.max(icon.width, icon.height));
          icon.setOrigin(0, 0.5);
          icon.setDepth(DEPTH.PICKUPS);
          statTextX = colName + Math.round(18 * s);
        }
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
        color: UI_TEXT.muted,
        strokeThickness: 0,
      })).setOrigin(0, 0.5);
    }


    // --- "Zapisz" button next to player's score ---
    if (myRanking && myRanking.score > 0) {
      const myIndex = rankings.findIndex(r => r.id === myId);
      const myRowY = tableStartY + myIndex * lineHeight;

      fetchScores().then((scores) => {
        const inTop100 = scores.length < 100 || myRanking.score > scores[scores.length - 1].score;
        // The board is for signed-in players. A guest goes to Google, which leaves the lobby; the score is saved back at the menu
        const user = account();
        if (inTop100 && (user || signInAvailable())) {
          const saveBtnX = colScore - Math.round(60 * s);
          const saveBtnY = myRowY - Math.round(12 * s);
          const stats = myRanking.stats || {};
          const num = (value: unknown): number | null => (typeof value === 'number' ? value : null);
          const submission: ScoreSubmission = {
            score: myRanking.score,
            deathCause: typeof stats.obstacleType === 'string' ? stats.obstacleType : null,
            distance: num(stats.distance),
            timeSurvived: num(stats.timeSurvived),
            applesCollected: num(stats.applesCollected),
            tyskiesCollected: num(stats.tyskiesCollected),
            pillsCollected: num(stats.pillsCollected),
            maxLevel: num(stats.maxLevel),
            maxCombo: num(stats.maxCombo),
          };

          // A guest gets Google's own button (its branding rules), on the score's line just left of it
          const signInW = 180;
          const scoreGap = Math.round(110 * s);
          const saveBtn = user
            ? createButton(this, saveBtnX, saveBtnY, Math.round(76 * s), Math.round(22 * s), 'Zapisz', 0x008800, buttonStyle({
              fontSize: `${Math.round(8 * s)}px`,
              strokeThickness: 2,
            }), () => save())
            : createButton(this, colScore - scoreGap - signInW / 2, myRowY, signInW, 26, 'Zaloguj przez Google', 0, buttonStyle({
              fontSize: '7px',
              strokeThickness: 2,
            }), () => {
              this.cleanupListeners();
              mpClient.leaveLobby();
              signIn(submission);
            }, { google: true });
          const save = (): void => {
            for (const obj of saveBtn.all) obj.destroy();
            setNav(bottomButtons);
            void submitScore(submission).then((saved) => {
              if (!this.scene.isActive()) return;
              this.add.text(saveBtnX, saveBtnY, saved ? 'Zapisano' : 'Nie zapisano', smallStyle({
                fontSize: `${Math.round(8 * s)}px`,
                color: saved ? UI_TEXT.named : '#e07a6a',
              })).setOrigin(0.5);
            });
          };
          setNav([saveBtn, ...bottomButtons]);
        }
      }).catch(() => { /* offline is fine */ });
    }

    // --- Buttons ---
    const btnS = buttonStyle({
      fontSize: `${Math.round(11 * s)}px`,
      strokeThickness: Math.round(3 * s),
    });

    const btnGap = Math.round(12 * s);
    const btnH = Math.round(38 * s);
    const btnY = height - Math.round(36 * s);

    const leave = (): void => {
      sceneManager.goto(this, 'MultiplayerMenuScene', undefined, () => {
        this.cleanupListeners();
        mpClient.leaveLobby();
      });
    };

    // Back to the lobby screen, for anyone; the others see you moved
    const toLobby = (): void => {
      void mpClient.setPlace('lobby').catch(() => null).then(() => {
        const lobbyData = mpClient.lobby;
        if (!lobbyData || !this.scene.isActive()) return;
        sceneManager.goto(this, 'LobbyScene', { lobbyData }, () => this.cleanupListeners());
      });
    };

    const startRun = (data: { seed: number; players: MPPlayer[] }): void => {
      sceneManager.goto(this, 'GameScene', {
        multiplayer: true,
        seed: data.seed,
        players: data.players,
        myId: mpClient.myId,
        startsAt: Date.now() + MP_START_LEAD_MS,
      }, () => this.cleanupListeners());
    };

    // The rematch happens right here: guests ready up with it, the host starts once they all are
    let lobby = mpClient.lobby;
    const me = (): MPPlayer | undefined => lobby?.players.find(p => p.id === myId);
    const amHost = (): boolean => me()?.isHost ?? isHost;
    const guests = (): MPPlayer[] => lobby?.players.filter(p => !p.isHost) ?? [];
    const canStart = (): boolean => lobby?.status === 'waiting' && guests().length > 0 && guests().every(p => p.ready);
    let starting = false;
    const rematchAction = (): void => {
      if (amHost()) {
        if (!canStart() || starting) return;
        starting = true;
        mpClient.startGame().then(startRun).catch(() => { starting = false; });
        return;
      }
      mpClient.setReady(!(me()?.ready ?? false)).then((updated) => { lobby = updated; refresh(); }).catch(() => {});
    };

    // Left to right: leave, watch, the lobby screen, play again
    const row: [string, number, () => void][] = [['Opuść', 0x666666, leave]];
    if (this.replayData && this.replayData.frames.length > 0) row.push(['Odtwórz śmierć', 0x333366, () => this.playReplay()]);
    row.push(['Lobby', 0x335555, toLobby]);
    row.push(['Rewanżyk', 0x880000, rematchAction]);
    const btnW = Math.min(Math.round(170 * s), Math.floor((width - 40 - btnGap * (row.length - 1)) / row.length));
    const totalW = btnW * row.length + btnGap * (row.length - 1);
    const bottomButtons: UIButton[] = row.map(([label, color, action], i) =>
      createButton(this, width / 2 - totalW / 2 + btnW / 2 + i * (btnW + btnGap), btnY, btnW, btnH, label, color, btnS, action));
    const rematch = bottomButtons[bottomButtons.length - 1];
    const setNav = (buttons: UIButton[]): void => {
      nav.set(buttons, { initial: rematch, onBack: leave });
    };

    const hint = this.add.text(width / 2, btnY - btnH, '', smallStyle({
      fontSize: `${Math.round(8 * s)}px`,
      color: UI_TEXT.muted,
      strokeThickness: Math.round(2 * s),
      align: 'center',
    })).setOrigin(0.5);

    const refresh = (): void => {
      const ready = guests().filter(p => p.ready).length;
      const total = guests().length;
      if (amHost()) {
        rematch.setLabel(`Rewanżyk (${ready}/${total})`);
        rematch.setColor(0x880000);
        rematch.setEnabled(canStart());
        hint.setText(total === 0 ? 'Nie ma z kim grać: wszyscy wyszli' : canStart() ? 'Wszyscy gotowi!' : 'Czekamy, aż wszyscy dadzą Rewanżyk');
      } else {
        const isReady = me()?.ready ?? false;
        rematch.setLabel(isReady ? 'Gotowy!' : 'Rewanżyk');
        rematch.setColor(isReady ? 0x008800 : 0x880000);
        rematch.setEnabled(lobby?.status === 'waiting');
        hint.setText(isReady ? 'Czekamy, aż gospodarz zacznie...' : 'Rewanżyk = gotowy na kolejny zjazd');
      }
    };
    refresh();
    setNav(bottomButtons);

    // --- Socket listeners ---
    this.lobbyUpdatedHandler = (lobbyData) => {
      lobby = lobbyData;
      refresh();
    };
    mpClient.on('lobby:updated', this.lobbyUpdatedHandler);
    this.gameStartHandler = startRun;
    mpClient.on('game:start', this.gameStartHandler);

    const stopWatchingDrop = mpClient.onDrop(() => {
      sceneManager.goto(this, 'MultiplayerMenuScene', { notice: 'Utracono połączenie z serwerem' });
    });

    this.events.once('shutdown', () => {
      stopWatchingDrop();
      this.cleanupListeners();
    });
  }

  private playReplay(): void {
    if (!this.replayData || this.replayData.frames.length < 2) return;
    new DeathReplayPlayer(this, this.replayData).play();
  }

  private cleanupListeners(): void {
    if (this.lobbyUpdatedHandler) {
      mpClient.off('lobby:updated', this.lobbyUpdatedHandler);
      this.lobbyUpdatedHandler = null;
    }
    if (this.gameStartHandler) {
      mpClient.off('game:start', this.gameStartHandler);
      this.gameStartHandler = null;
    }
  }
}
