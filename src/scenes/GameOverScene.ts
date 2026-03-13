import Phaser from 'phaser';
import { fetchScores } from '../ui/Scoreboard';
import { FONT_FAMILY, getScale, createButton } from '../ui/shared';
import { getDeathMessage, showDeathTitle, showObstacleImage } from '../ui/DeathDisplay';
import { spawnConfetti, spawnDeathParticle } from '../ui/ConfettiEffect';
import { showNameInput } from '../ui/NameInput';

interface GameOverData {
  score: number;
  timeSurvived?: number;
  topSpeed?: number;
  distance?: number;
  obstacleType?: string | null;
}

export class GameOverScene extends Phaser.Scene {
  private gameoverBgm: Phaser.Sound.BaseSound | null = null;
  private restartBound = false;

  constructor() {
    super({ key: 'GameOverScene' });
  }

  create(data: GameOverData): void {
    const { width, height } = this.cameras.main;
    this.restartBound = false;

    this.cameras.main.setBackgroundColor('#0a0a0a');
    this.setupBackground(width, height);

    const deathMessage = getDeathMessage(data?.obstacleType);
    const titleY = showDeathTitle(this, width, height, deathMessage);
    showObstacleImage(this, width, titleY, data?.obstacleType);

    const { isNewRecord, highScore } = this.getHighScoreInfo(data?.score ?? 0);
    this.setupScoreDisplay(width, height, data?.score ?? 0, highScore, isNewRecord);
    this.setupStats(width, height, data);

    if (isNewRecord) {
      spawnConfetti(this, width, height);
    }

    // Game over music
    this.gameoverBgm = this.sound.add('gameover-bgm', { volume: 0.3, loop: true });
    this.gameoverBgm.play();

    // Check if score qualifies for top 100 leaderboard
    const finalScore = data?.score ?? 0;
    fetchScores().then((scores) => {
      const inTop100 = scores.length < 100 || (finalScore > 0 && finalScore > scores[scores.length - 1].score);
      const canSave = isNewRecord && inTop100;
      this.showDeathButtons(width, height, isNewRecord, canSave, data);
    }).catch(() => {
      this.showDeathButtons(width, height, isNewRecord, false, data);
    });
  }

  // ── Background & atmosphere ────────────────────────────────────────

  private setupBackground(width: number, height: number): void {
    const pulseOverlay = this.add.rectangle(width / 2, height / 2, width, height, 0x440000, 0.3);
    pulseOverlay.setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({
      targets: pulseOverlay,
      alpha: 0.05,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
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
      spawnDeathParticle(this, width, height);
    }
  }

  // ── Score display ──────────────────────────────────────────────────

  private getHighScoreInfo(finalScore: number): { isNewRecord: boolean; highScore: number } {
    const highScore = parseInt(localStorage.getItem('cockroach-highscore') || '0', 10);
    return {
      isNewRecord: finalScore > 0 && finalScore >= highScore,
      highScore,
    };
  }

  private setupScoreDisplay(
    width: number, height: number,
    finalScore: number, highScore: number, isNewRecord: boolean,
  ): void {
    const s = getScale();
    const scoreY = height * 0.42;

    // Animated count-up
    const counter = { value: 0 };
    const scoreText = this.add
      .text(width / 2, scoreY, 'Punkciory: 0', {
        fontSize: `${Math.round(16 * s)}px`,
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
        stroke: '#000000',
        strokeThickness: 4 * s,
      })
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
    const hsY = scoreY + Math.round(28 * s);
    const hsText = this.add
      .text(width / 2, hsY, `Najlepsiejszy wynik: ${highScore}`, {
        fontSize: `${Math.round(11 * s)}px`,
        color: isNewRecord ? '#ffff00' : '#ff8800',
        fontFamily: FONT_FAMILY,
        stroke: '#000000',
        strokeThickness: 3 * s,
      })
      .setOrigin(0.5);

    if (isNewRecord) {
      hsText.setFontSize(Math.round(16 * s));
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
    const s = getScale();
    const fontSize = `${Math.round(10 * s)}px`;
    const lineHeight = Math.round(20 * s);
    const startY = height * 0.58;

    const stats: { label: string; value: string; color: string }[] = [];
    if (data?.timeSurvived !== undefined) stats.push({ label: 'Czas Przeżywalności', value: `${data.timeSurvived}s`, color: '#00ccff' });
    if (data?.distance !== undefined) stats.push({ label: 'Dystansik', value: `${data.distance}m`, color: '#ff6600' });
    if (data?.topSpeed !== undefined) stats.push({ label: 'Maks Szybkóść', value: `${data.topSpeed.toFixed(1)}x`, color: '#cc66ff' });

    stats.forEach((stat, i) => {
      const y = startY + i * lineHeight;
      this.add.text(width / 2 - 8, y, stat.label, {
        fontSize,
        color: '#aaaaaa',
        fontFamily: FONT_FAMILY,
      }).setOrigin(1, 0.5);
      this.add.text(width / 2 + 8, y, stat.value, {
        fontSize,
        color: stat.color,
        fontFamily: FONT_FAMILY,
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0, 0.5);
    });
  }

  // ── Restart / navigation ───────────────────────────────────────────

  private showDeathButtons(width: number, height: number, isNewRecord: boolean, canSave: boolean, data: GameOverData): void {
    if (this.restartBound) return;
    this.restartBound = true;

    const s = getScale();
    const btnStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: `${Math.round(12 * s)}px`,
      fontFamily: FONT_FAMILY,
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: Math.round(3 * s),
      align: 'center',
    };

    const btnY = height - Math.round(60 * s);
    const btnW = Math.round(160 * s);
    const btnH = Math.round(44 * s);
    const gap = Math.round(16 * s);

    createButton(this, width / 2 - btnW / 2 - gap / 2, btnY, btnW, btnH, 'Ekran Główny', 0x666666, btnStyle, () => this.goToMenu());
    createButton(this, width / 2 + btnW / 2 + gap / 2, btnY, btnW, btnH, 'Powtórka', 0x880000, btnStyle, () => this.restartGame());

    // "Zapisz" button below the highscore text when score qualifies for top 100
    if (canSave) {
      const saveY = height * 0.42 + Math.round(56 * s);
      const saveBtnW = Math.round(120 * s);
      const saveBtnH = Math.round(32 * s);

      const saveBg = this.add.rectangle(width / 2, saveY, saveBtnW, saveBtnH, 0x008800, 0.9)
        .setInteractive({ useHandCursor: true });
      const saveTxt = this.add.text(width / 2, saveY, 'Zapisz', {
        fontSize: `${Math.round(12 * s)}px`,
        fontFamily: FONT_FAMILY,
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5);

      this.tweens.add({
        targets: [saveBg, saveTxt],
        alpha: { from: 0.7, to: 1 },
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      saveBg.on('pointerover', () => { saveBg.setAlpha(1); saveTxt.setColor('#ffff00'); });
      saveBg.on('pointerout', () => { saveBg.setAlpha(0.9); saveTxt.setColor('#ffffff'); });
      saveBg.on('pointerdown', () => {
        saveBg.destroy();
        saveTxt.destroy();
        showNameInput((name) => this.submitScore(name, data));
      });
    }

    // Keyboard shortcuts
    this.input.keyboard!.once('keydown-SPACE', () => this.restartGame());
    this.input.keyboard!.once('keydown-R', () => this.restartGame());
    this.input.keyboard!.once('keydown-ESC', () => this.goToMenu());
  }

  private restartGame(): void {
    this.stopMusic();
    this.scene.start('GameScene');
  }

  private goToMenu(): void {
    this.stopMusic();
    this.scene.start('MenuScene');
  }

  private stopMusic(): void {
    if (this.gameoverBgm) {
      this.gameoverBgm.stop();
      this.gameoverBgm.destroy();
      this.gameoverBgm = null;
    }
  }

  // ── Network ────────────────────────────────────────────────────────

  private async submitScore(name: string, data: GameOverData): Promise<void> {
    try {
      await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          score: data.score,
          deathCause: data.obstacleType || null,
          distance: data.distance || null,
          timeSurvived: data.timeSurvived || null,
        }),
      });
    } catch {
      // Silently fail — game works offline too
    }
  }
}
