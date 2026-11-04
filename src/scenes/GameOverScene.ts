import Phaser from 'phaser';
import { fetchScores, type DailyRun } from '../ui/Scoreboard';
import type { Achievement } from '../systems/Profile';
import { COLORS } from '../config/constants';
import { titleStyle, bodyStyle, smallStyle, buttonStyle, UI_TEXT } from '../utils/TextStyles';
import { addObstacleArt, createButton, createPanel, showAchievement, showMission, UIButton } from '../ui/shared';
import { MenuNav } from '../ui/MenuNav';
import { addContactShadow } from '../effects/ContactShadow';
import { createSceneBackground } from '../ui/SceneBackground';
import { sceneManager } from '../systems/SceneManager';
import { getHighScore } from '../utils/Storage';
import { account, signIn, signInAvailable, submitScore, type ScoreSubmission } from '../ui/Account';
import { ReplayData } from '../systems/DeathReplay';
import { DeathReplayPlayer } from '../systems/DeathReplayPlayer';
import { LEVELS, getLevelForDistance } from '../config/levels';

interface GameOverData {
  score: number;
  timeSurvived?: number;
  topSpeed?: number;
  distance?: number;
  obstacleType?: string | null;
  level?: number;
  maxCombo?: number;
  pickupCounts?: { apples: number; beers: number; pills: number };
  replayData?: ReplayData | null;
  /** The record and best distance from before this run; the run itself is already saved over them. */
  previousBest?: number;
  previousBestDistance?: number;
  /** Karaluch Dnia: saved to that day's board, measured against the day's best. */
  daily?: DailyRun | null;
  /** Earned as the run ended. */
  achievements?: Achievement[];
  /** The missions the run finished, once the server has counted it. */
  missions?: Promise<{ text: string; reward: number }[]>;
}

export class GameOverScene extends Phaser.Scene {
  private restartBound = false;
  private replayData: ReplayData | null = null;
  private replay: DeathReplayPlayer | null = null;
  private daily: DailyRun | null = null;
  private nav!: MenuNav;

  private static readonly DEATH_TEXT: Record<string, string[]> = {
    bird: ['Srak cię optakał', 'Gołąb zemsty!', 'Bombardowanie z góry!'],
    cat: ['Rozkotowany', 'Łapa losu!', 'Kici kici... pac!'],
    flipper: ['Kubota ci w ryj!', 'Klapek sprawiedliwości!', 'Ciapnięty na amen!'],
    newspaper: ['Złe wybory kolego', 'Gazeta prawdy!', 'Przywalony faktem!'],
    onion: ['Smrót cię zmiótł', 'Cebulowy nokaut!', 'Zapłakałeś na wieki!'],
    spray: ['Muga!', 'Psik i po tobie!', 'Toksyczny koniec!'],
    disco: ['Dyskoteka zamknięta!', 'Ostatni taniec!', 'Kto nie tańczy ten ginie!'],
    jellyfish: ['Użądlony na Bałtyku!', 'Meduza ci w twarz!', 'Morska zemsta!'],
    pope: ['Okadzony przez papieża!', 'Kremówka ostatnia!', 'Santo subito... ale nie ty!'],
    bison: ['Żubr cię stratował!', 'Żubrówka na kopyta!', 'Byka złapałeś!'],
    blackhole: ['Wciągnięty w nicość!', 'Ssanie kosmiczne!', 'Karaluch w próżni!'],
    wall: ['Prosto w ścianę!', 'Trzeba było dashować!', 'Ściana płaczu!'],
    boss: ['Bestia cię dopadła!', 'Zlew zwyciężył!', 'Kremówkowy armagedon!'],
  };

  private static readonly DEFAULT_DEATH = 'Zgniotłeś się!';

  constructor() {
    super({ key: 'GameOverScene' });
  }

  create(data: GameOverData): void {
    const { width, height } = this.cameras.main;
    this.restartBound = false;
    this.replayData = data?.replayData ?? null;
    this.replay = null;
    this.daily = data?.daily ?? null;

    this.cameras.main.setBackgroundColor('#0a0a0a');
    // You see the level you died in, darker
    createSceneBackground(this, { level: data?.level ?? 1, dim: 0.62, scrollSpeed: 0.15 });
    this.nav = new MenuNav(this);

    const texts = data?.obstacleType ? GameOverScene.DEATH_TEXT[data.obstacleType] : null;
    const deathMessage = texts
      ? texts[Math.floor(Math.random() * texts.length)]
      : GameOverScene.DEFAULT_DEATH;

    const titleY = this.setupDeathTitle(width, height, deathMessage);
    if (this.daily) {
      const [year, month, day] = this.daily.date.split('-').map(Number);
      this.add.text(16, 16, `KARALUCH DNIA · ${day}.${month}.${year}`, smallStyle({ fontSize: '8px', color: '#e8c15a', strokeThickness: 3 }));
    }
    this.setupObstacleImage(width, titleY, data);

    const { isNewRecord, highScore } = this.getHighScoreInfo(data?.score ?? 0, data?.previousBest);
    this.setupScoreDisplay(width, height, data?.score ?? 0, highScore, isNewRecord);
    this.setupStats(width, height, data);

    if (isNewRecord) {
      this.spawnConfetti(width, height);
    }
    for (const achievement of data?.achievements ?? []) showAchievement(this, achievement);
    void data?.missions?.then((done) => {
      if (this.scene.isActive()) for (const mission of done) showMission(this, mission);
    });

    // Check if score qualifies for top 100 leaderboard
    const finalScore = data?.score ?? 0;
    // A daily run is up against that day's board, not the all-time one
    fetchScores(this.daily?.date).then((scores) => {
      const inTop100 = scores.length < 100 || (finalScore > 0 && finalScore > scores[scores.length - 1].score);
      const canSave = isNewRecord && inTop100;
      this.showDeathButtons(width, height, canSave, data);
    }).catch(() => {
      this.showDeathButtons(width, height, false, data);
    });
  }

  // -- Background & atmosphere -----------------------------------------------

  private setupDeathTitle(width: number, height: number, message: string): number {
    const titleText = this.add
      .text(Math.round(width / 2), Math.round(height * 0.1), message, titleStyle({
        fontSize: `${Math.max(16, Math.min(26, Math.floor(width / 30)))}px`,
        color: UI_TEXT.bone,
        strokeThickness: 7,
        shadow: { offsetX: 0, offsetY: 4, color: '#5a0d0d', blur: 0, fill: true, stroke: true },
      }))
      .setOrigin(0.5);

    return titleText.y;
  }

  private setupObstacleImage(width: number, titleY: number, data: GameOverData): void {
    if (!data?.obstacleType) return;

    if (data.obstacleType === 'boss') {
      const faces = ['boss-face1', 'boss-face2', 'boss-face3'];
      const spacing = 60;
      const startX = width / 2 - (faces.length - 1) * spacing / 2;
      const imgs: Phaser.GameObjects.Image[] = [];
      faces.forEach((key, i) => {
        const img = this.add.image(startX + i * spacing, titleY + 30, key);
        img.setScale(0.2).setOrigin(0.5, 0);
        imgs.push(img);
      });
      this.tweens.add({
        targets: imgs,
        y: '-=5',
        duration: 1000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      return;
    }

    // The culprit stands on its own shadow, like in the game
    const feetY = titleY + 118;
    const img = addObstacleArt(this, width / 2, feetY, data.obstacleType);
    if (!img) return;
    addContactShadow(this, width / 2, feetY, 90);

    this.tweens.add({
      targets: img,
      y: img.y - 5,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // -- Score display ---------------------------------------------------------

  private getHighScoreInfo(finalScore: number, previousBest?: number): { isNewRecord: boolean; highScore: number } {
    const highScore = previousBest ?? getHighScore();
    return {
      isNewRecord: finalScore > 0 && finalScore > highScore,
      highScore,
    };
  }

  private setupScoreDisplay(
    width: number, height: number,
    finalScore: number, highScore: number, isNewRecord: boolean,
  ): void {
    const scoreY = Math.round(height * 0.42);

    // Animated count-up
    const counter = { value: 0 };
    const scoreText = this.add
      .text(width / 2, scoreY, 'Punkciory: 0', bodyStyle({
        fontSize: '18px',
        color: UI_TEXT.bone,
        strokeThickness: 5,
      }))
      .setOrigin(0.5);

    this.tweens.add({
      targets: counter,
      value: finalScore,
      duration: Math.min(2000, finalScore * 50 + 500),
      ease: 'Power2',
      onUpdate: () => {
        scoreText.setText(`Punkciory: ${Math.floor(counter.value)}`);
      },
    });

    // High score line
    const hsY = scoreY + 28;
    const hsText = this.add
      .text(width / 2, hsY, this.daily ? `Twój najlepszy dziś: ${highScore}` : `Najlepsiejszy wynik: ${highScore}`, smallStyle({
        fontSize: '11px',
        color: isNewRecord ? '#ffe066' : UI_TEXT.amber,
        strokeThickness: 3,
      }))
      .setOrigin(0.5);

    if (isNewRecord) {
      hsText.setText(this.daily ? `Najlepiej dziś!  Było ${highScore}` : `Nowy rekord!  Było ${highScore}`);
    } else if (highScore > 0 && finalScore > 0) {
      // How close it came: the number that makes you go again
      hsText.setText(`${this.daily ? 'Dziś' : 'Rekord'}: ${highScore}  ·  brakło ${highScore - finalScore}`);
    }
  }

  private setupStats(width: number, height: number, data: GameOverData): void {
    const fontSize = '9px';
    const lineHeight = 18;
    const startY = Math.round(height * 0.6);

    const stats: { label: string; value: string; color: string }[] = [];
    if (data?.timeSurvived !== undefined) stats.push({ label: 'Czas Przeżywalności', value: `${data.timeSurvived}s`, color: '#8fc7d8' });
    const bestDistance = data?.previousBestDistance ?? 0;
    if (data?.distance !== undefined) {
      const distanceRecord = bestDistance > 0 && data.distance > bestDistance;
      stats.push({ label: 'Dystansik', value: `${Math.floor(data.distance)}m${distanceRecord ? '  rekord!' : ''}`, color: '#e0a040' });
    }
    let levelRow = -1;
    if (data?.level !== undefined) {
      levelRow = stats.length;
      stats.push({ label: 'Poziom', value: `${data.level}`, color: '#f1e3c6' });
    }
    if (data?.topSpeed !== undefined) stats.push({ label: 'Maks Szybkóść', value: `${data.topSpeed.toFixed(1)}x`, color: '#c9a0dc' });
    if (data?.maxCombo !== undefined && data.maxCombo > 0) stats.push({ label: 'Maks Kombo', value: `x${data.maxCombo}`, color: '#e08aa8' });
    if (data?.pickupCounts) {
      const p = data.pickupCounts;
      stats.push({ label: 'Jabłka / Piwa / Pigułki', value: `${p.apples} / ${p.beers} / ${p.pills}`, color: '#9fe08a' });
    }

    if (stats.length === 0) return;
    const panelW = 520;
    createPanel(this, width / 2 - panelW / 2, startY - 16, panelW, stats.length * lineHeight + 14);
    stats.forEach((stat, i) => {
      const y = startY + i * lineHeight;
      this.add.text(width / 2 - 8, y, stat.label, smallStyle({ fontSize, color: UI_TEXT.muted, strokeThickness: 0 })).setOrigin(1, 0.5);
      const value = this.add.text(width / 2 + 8, y, stat.value, smallStyle({ fontSize, color: stat.color, strokeThickness: 0 })).setOrigin(0, 0.5);
      if (i !== levelRow) return;
      const pipsEnd = this.drawLevelPips(value.x + value.width + 12, y, data.level!, getLevelForDistance(bestDistance).level);
      // How far the next level was: close enough, and you go again
      const next = LEVELS.find(l => l.level === data.level! + 1);
      if (next && data.distance !== undefined) {
        const short = Math.max(1, Math.ceil(next.distanceThreshold - data.distance));
        this.add.text(pipsEnd + 10, y, `${next.level}. za ${short}m`, smallStyle({ fontSize, color: '#ffe066', strokeThickness: 0 })).setOrigin(0, 0.5);
      }
    });
  }

  /** One pip per level: lit up to the one reached, outlined up to the best ever, so every run shows where it got to. */
  private drawLevelPips(x: number, y: number, reached: number, best: number): number {
    const size = 8;
    const gap = 4;
    const g = this.add.graphics();
    LEVELS.forEach((level, i) => {
      const left = Math.round(x + i * (size + gap));
      const top = Math.round(y - size / 2);
      if (level.level <= reached) {
        g.fillStyle(level.color, 1).fillRect(left, top, size, size);
      } else {
        g.fillStyle(0x000000, 0.4).fillRect(left, top, size, size);
        g.lineStyle(2, level.level <= best ? 0xb9a78d : 0x3d2e25, 1).strokeRect(left + 1, top + 1, size - 2, size - 2);
      }
    });
    return Math.round(x + LEVELS.length * (size + gap) - gap);
  }

  // -- Confetti ---------------------------------------------------------------

  private spawnConfetti(width: number, height: number): void {
    for (let i = 0; i < 40; i++) {
      const color = COLORS.CONFETTI[i % COLORS.CONFETTI.length];
      const size = Phaser.Math.Between(3, 8);
      const confetti = this.add.rectangle(
        Phaser.Math.Between(0, width), -20,
        size, size, color, 0.9,
      );

      this.tweens.add({
        targets: confetti,
        y: height + 20,
        x: confetti.x + Phaser.Math.Between(-100, 100),
        duration: Phaser.Math.Between(1500, 3000),
        delay: Phaser.Math.Between(0, 1000),
        ease: 'Cubic.easeIn',
        onComplete: () => confetti.destroy(),
      });
    }
  }

  // -- Restart / navigation ---------------------------------------------------

  private showDeathButtons(width: number, height: number, canSave: boolean, data: GameOverData): void {
    if (this.restartBound) return;
    this.restartBound = true;

    const btnS = buttonStyle({ fontSize: '12px', strokeThickness: 3 });

    const btnY = height - 60;
    const btnH = 44;
    const gap = 10;
    const hasReplay = this.replayData && this.replayData.frames.length > 0;
    const btnW = 150;

    const row: [string, number, () => void][] = [['Menu', 0x666666, () => this.goToMenu()]];
    if (hasReplay) row.push(['Odtwórz śmierć', 0x333366, () => this.playReplay()]);
    row.push(['Jeszcze raz!', 0x880000, () => this.restartGame()]);
    const totalW = btnW * row.length + gap * (row.length - 1);
    const buttons: UIButton[] = row.map(([label, color, action], i) =>
      createButton(this, width / 2 - totalW / 2 + btnW / 2 + i * (btnW + gap), btnY, btnW, btnH, label, color, btnS, action));
    const again = buttons[buttons.length - 1];
    this.nav.set(buttons, { initial: again, onBack: () => this.goToMenu() });

    // Saving to the board, under the high score, when the run makes the top 100. The board is for signed-in
    // players: a guest is sent to Google and the score is saved when they come back to the menu
    const user = account();
    if (canSave && (user || signInAvailable())) {
      const saveY = height * 0.42 + 56;
      const submission = this.submissionOf(data);

      const saveBtn = user
        ? createButton(this, width / 2, saveY, 200, 30, 'Zapisz wynik', 0x008800, buttonStyle({ fontSize: '10px', strokeThickness: 2 }), () => {
          for (const obj of saveBtn.all) obj.destroy();
          this.nav.set(buttons, { initial: again, onBack: () => this.goToMenu() });
          void submitScore(submission).then((saved) => {
            if (!this.scene.isActive()) return;
            this.add.text(width / 2, saveY, saved ? `Zapisano jako ${user.name}` : 'Nie udało się zapisać', smallStyle({
              color: saved ? UI_TEXT.named : '#e07a6a',
            })).setOrigin(0.5);
          });
        })
        // Google's own button for a guest (its branding rules); the score is kept and saved on the way back
        : createButton(this, width / 2, saveY, 216, 30, 'Zaloguj przez Google', 0, buttonStyle({ fontSize: '8px', strokeThickness: 2 }),
          () => signIn(submission), { google: true });
      this.nav.set([saveBtn, ...buttons], { initial: again, onBack: () => this.goToMenu() });
    }

    this.input.keyboard!.once('keydown-R', () => this.restartGame());
  }

  private restartGame(): void {
    sceneManager.goto(this, 'GameScene', { multiplayer: false, retry: true, daily: this.daily ?? undefined });
  }

  private goToMenu(): void {
    sceneManager.goto(this, 'MenuScene');
  }

  private playReplay(): void {
    if (!this.replayData || this.replayData.frames.length < 2) return;
    this.replay?.destroy();
    this.replay = new DeathReplayPlayer(this, this.replayData);
    this.replay.play();
  }

  /** The run as POST /api/scores takes it. The name comes from the signed-in account, on the server. */
  private submissionOf(data: GameOverData): ScoreSubmission {
    return {
      score: data.score,
      deathCause: data.obstacleType || null,
      distance: data.distance || null,
      timeSurvived: data.timeSurvived || null,
      applesCollected: data.pickupCounts?.apples ?? null,
      tyskiesCollected: data.pickupCounts?.beers ?? null,
      pillsCollected: data.pickupCounts?.pills ?? null,
      maxLevel: data.level ?? null,
      maxCombo: data.maxCombo ?? null,
      daily: this.daily?.date ?? null,
    };
  }
}
