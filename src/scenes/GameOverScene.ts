import Phaser from 'phaser';
import { fetchScores } from '../ui/Scoreboard';
import { COLORS } from '../config/constants';
import { adaptiveTitleStyle, bodyStyle, smallStyle, buttonStyle } from '../utils/TextStyles';
import { createButton, OBSTACLE_TEXTURE } from '../ui/shared';
import { createSceneBackground } from '../ui/SceneBackground';
import { sceneManager } from '../systems/SceneManager';
import { getHighScore, getPlayerNameOrDefault, isPlayerNameCustom } from '../utils/Storage';
import { showNameInput } from '../ui/NameInputOverlay';
import { ReplayData } from '../systems/DeathReplay';
import { DeathReplayPlayer } from '../systems/DeathReplayPlayer';

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
}

export class GameOverScene extends Phaser.Scene {
  private restartBound = false;
  private replayData: ReplayData | null = null;
  private replay: DeathReplayPlayer | null = null;

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

    this.cameras.main.setBackgroundColor('#0a0a0a');
    this.setupBackground(width, height);

    const texts = data?.obstacleType ? GameOverScene.DEATH_TEXT[data.obstacleType] : null;
    const deathMessage = texts
      ? texts[Math.floor(Math.random() * texts.length)]
      : GameOverScene.DEFAULT_DEATH;

    const titleY = this.setupDeathTitle(width, height, deathMessage);
    this.setupObstacleImage(width, titleY, data);

    const { isNewRecord, highScore } = this.getHighScoreInfo(data?.score ?? 0);
    this.setupScoreDisplay(width, height, data?.score ?? 0, highScore, isNewRecord);
    this.setupStats(width, height, data);

    if (isNewRecord) {
      this.spawnConfetti(width, height);
    }

    // Check if score qualifies for top 100 leaderboard
    const finalScore = data?.score ?? 0;
    fetchScores().then((scores) => {
      const inTop100 = scores.length < 100 || (finalScore > 0 && finalScore > scores[scores.length - 1].score);
      const canSave = isNewRecord && inTop100;
      this.showDeathButtons(width, height, canSave, data);
    }).catch(() => {
      this.showDeathButtons(width, height, false, data);
    });
  }

  // -- Background & atmosphere -----------------------------------------------

  private setupBackground(width: number, height: number): void {
    createSceneBackground(this, {
      textureKey: 'menu-bg',
      cycleColorFrom: 0x440000,
      cycleColorTo: 0x880022,
      lighting: { colors: [0xff2222, 0xcc0000, 0xff4444, 0x880000, 0xff6644] },
    });

    this.tweens.add({
      targets: this.cameras.main,
      zoom: 1.02,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    for (let i = 0; i < 12; i++) {
      this.spawnDeathParticle(width, height);
    }
  }

  private setupDeathTitle(width: number, height: number, message: string): number {
    const titleText = this.add
      .text(width / 2, height * 0.12, message, adaptiveTitleStyle(width))
      .setOrigin(0.5);

    const baseX = titleText.x;
    const baseY = titleText.y;
    this.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => {
        titleText.x = baseX + Phaser.Math.Between(-2, 2);
        titleText.y = baseY + Phaser.Math.Between(-2, 2);
      },
    });

    return titleText.y;
  }

  private setupObstacleImage(width: number, titleY: number, data: GameOverData): void {
    if (!data?.obstacleType || !OBSTACLE_TEXTURE[data.obstacleType]) return;

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

    const textureKey = OBSTACLE_TEXTURE[data.obstacleType];
    const img = this.add.image(width / 2, titleY + 30, textureKey);
    img.setScale(0.25).setOrigin(0.5, 0);

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

  private getHighScoreInfo(finalScore: number): { isNewRecord: boolean; highScore: number } {
    const highScore = getHighScore();
    return {
      isNewRecord: finalScore > 0 && finalScore > highScore,
      highScore,
    };
  }

  private setupScoreDisplay(
    width: number, height: number,
    finalScore: number, highScore: number, isNewRecord: boolean,
  ): void {
    const scoreY = height * 0.42;

    // Animated count-up
    const counter = { value: 0 };
    const scoreText = this.add
      .text(width / 2, scoreY, 'Punkciory: 0', bodyStyle({
        fontSize: '16px',
        strokeThickness: 4,
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
      .text(width / 2, hsY, `Najlepsiejszy wynik: ${highScore}`, smallStyle({
        fontSize: '11px',
        color: isNewRecord ? '#ffff00' : '#ff8800',
        strokeThickness: 3,
      }))
      .setOrigin(0.5);

    if (isNewRecord) {
      hsText.setFontSize(16);
      hsText.setColor('#ffff00');
      this.tweens.add({
        targets: hsText,
        scaleX: { from: 1, to: 1.1 },
        scaleY: { from: 1, to: 1.1 },
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  private setupStats(width: number, height: number, data: GameOverData): void {
    const fontSize = '10px';
    const lineHeight = 20;
    const startY = height * 0.58;

    const stats: { label: string; value: string; color: string }[] = [];
    if (data?.timeSurvived !== undefined) stats.push({ label: 'Czas Przeżywalności', value: `${data.timeSurvived}s`, color: '#00ccff' });
    if (data?.distance !== undefined) stats.push({ label: 'Dystansik', value: `${Math.floor(data.distance)}m`, color: '#ff6600' });
    if (data?.level !== undefined) stats.push({ label: 'Poziom', value: `${data.level}`, color: '#ffff00' });
    if (data?.topSpeed !== undefined) stats.push({ label: 'Maks Szybkóść', value: `${data.topSpeed.toFixed(1)}x`, color: '#cc66ff' });
    if (data?.maxCombo !== undefined && data.maxCombo > 0) stats.push({ label: 'Maks Kombo', value: `x${data.maxCombo}`, color: '#ff00ff' });
    if (data?.pickupCounts) {
      const p = data.pickupCounts;
      stats.push({ label: 'Jabłka / Piwa / Pigułki', value: `${p.apples} / ${p.beers} / ${p.pills}`, color: '#44ff44' });
    }

    stats.forEach((stat, i) => {
      const y = startY + i * lineHeight;
      this.add.text(width / 2 - 8, y, stat.label, smallStyle({ fontSize, color: '#aaaaaa' })).setOrigin(1, 0.5);
      this.add.text(width / 2 + 8, y, stat.value, smallStyle({ fontSize, color: stat.color, strokeThickness: 2 })).setOrigin(0, 0.5);
    });
  }

  // -- Confetti ---------------------------------------------------------------

  private spawnConfetti(width: number, height: number): void {
    for (let i = 0; i < 40; i++) {
      const color = COLORS.CONFETTI[i % COLORS.CONFETTI.length];
      const size = Phaser.Math.Between(3, 8);
      const confetti = this.add.rectangle(
        Phaser.Math.Between(0, width), -20,
        size, size * 2, color, 0.9,
      );
      confetti.setAngle(Phaser.Math.Between(0, 360));

      this.tweens.add({
        targets: confetti,
        y: height + 20,
        x: confetti.x + Phaser.Math.Between(-100, 100),
        angle: confetti.angle + Phaser.Math.Between(-360, 360),
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

    if (hasReplay) {
      const totalW = btnW * 3 + gap * 2;
      const startX = width / 2 - totalW / 2 + btnW / 2;
      createButton(this, startX, btnY, btnW, btnH, 'Menu', 0x666666, btnS, () => this.goToMenu());
      createButton(this, startX + btnW + gap, btnY, btnW, btnH, 'Powtórka', 0x333366, btnS, () => this.playReplay());
      createButton(this, startX + (btnW + gap) * 2, btnY, btnW, btnH, 'Jeszcze raz!', 0x880000, btnS, () => this.restartGame());
    } else {
      createButton(this, width / 2 - btnW / 2 - gap / 2, btnY, btnW, btnH, 'Menu', 0x666666, btnS, () => this.goToMenu());
      createButton(this, width / 2 + btnW / 2 + gap / 2, btnY, btnW, btnH, 'Jeszcze raz!', 0x880000, btnS, () => this.restartGame());
    }

    // "Zapisz" button below the highscore text when score qualifies for top 100
    if (canSave) {
      const saveY = height * 0.42 + 56;

      const save = (name: string): void => {
        this.submitScore(name, data).then((saved) => {
          if (saved || !this.scene.isActive()) return;
          this.add.text(width / 2, saveY, 'Nie udało się zapisać', smallStyle({ color: '#ff4444' })).setOrigin(0.5);
        });
      };

      const saveBtn = createButton(this, width / 2, saveY, 120, 32, 'Zapisz', 0x008800, buttonStyle({
        fontSize: '12px',
        strokeThickness: 2,
      }), () => {
        for (const obj of saveBtn.all) obj.destroy();
        if (!isPlayerNameCustom()) {
          showNameInput(this, save);
        } else {
          save(getPlayerNameOrDefault());
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

    // Keyboard shortcuts
    this.input.keyboard!.once('keydown-SPACE', () => this.restartGame());
    this.input.keyboard!.once('keydown-R', () => this.restartGame());
    this.input.keyboard!.once('keydown-ESC', () => this.goToMenu());
  }

  private restartGame(): void {
    sceneManager.goto(this, 'GameScene', { multiplayer: false });
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

  // -- Network ----------------------------------------------------------------

  private async submitScore(name: string, data: GameOverData): Promise<boolean> {
    try {
      const res = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          score: data.score,
          deathCause: data.obstacleType || null,
          distance: data.distance || null,
          timeSurvived: data.timeSurvived || null,
          applesCollected: data.pickupCounts?.apples ?? null,
          tyskiesCollected: data.pickupCounts?.beers ?? null,
          pillsCollected: data.pickupCounts?.pills ?? null,
          maxLevel: data.level ?? null,
          maxCombo: data.maxCombo ?? null,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // -- Particles --------------------------------------------------------------

  private spawnDeathParticle(sceneWidth: number, sceneHeight: number): void {
    const size = Phaser.Math.Between(2, 6);
    const x = Phaser.Math.Between(0, sceneWidth);
    const y = Phaser.Math.Between(sceneHeight * 0.5, sceneHeight);

    const particle = this.add.circle(x, y, size, COLORS.DEATH_PARTICLE, 0.5);
    particle.setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({
      targets: particle,
      y: y - Phaser.Math.Between(100, 300),
      alpha: 0,
      duration: Phaser.Math.Between(2000, 5000),
      ease: 'Sine.easeIn',
      onComplete: () => {
        particle.destroy();
        this.spawnDeathParticle(sceneWidth, sceneHeight);
      },
    });
  }
}
