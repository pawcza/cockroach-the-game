import Phaser from 'phaser';
import { fetchScores } from '../ui/Scoreboard';
import { COLORS } from '../config/constants';
import { adaptiveTitleStyle, bodyStyle, smallStyle, buttonStyle, getScale } from '../utils/TextStyles';
import { createPulsingOverlay } from '../utils/TweenPatterns';
import { createButton } from '../ui/shared';

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

  private static readonly DEATH_TEXT: Record<string, string> = {
    bird: 'SRAK CIĘ OPTAKAŁ',
    cat: 'Rozkotowany',
    flipper: 'Kubota Ci w ryj!',
    newspaper: 'Złe wybory kolego',
    onion: 'Smrót Cię zmiótł',
    spray: 'MUGA!',
    pill: 'PRZEDAWKOWANIE!',
    disco: 'DYSKOTEKA ZAMKNIĘTA!',
    jellyfish: 'UŻĄDLONY NA BAŁTYKU!',
    pope: 'OKADZONY PRZEZ PAPIEŻA!',
    bison: 'ŻUBR CIĘ STRATOWAŁ!',
    blackhole: 'WCIĄGNIĘTY W NICOŚĆ!',
  };

  private static readonly OBSTACLE_TEXTURE: Record<string, string> = {
    bird: 'bird',
    cat: 'cat-paw',
    flipper: 'flipper',
    newspaper: 'newspaper',
    onion: 'onion',
    spray: 'pest-spray',
    disco: 'disco-ball',
    jellyfish: 'jellyfish',
    pope: 'pope',
    bison: 'bison',
    blackhole: 'black-hole',
  };

  private static readonly DEFAULT_DEATH = 'ZGNIOTŁEŚ SIĘ!';

  constructor() {
    super({ key: 'GameOverScene' });
  }

  create(data: GameOverData): void {
    const { width, height } = this.cameras.main;
    this.restartBound = false;

    this.cameras.main.setBackgroundColor('#0a0a0a');
    this.setupBackground(width, height);

    const deathMessage = data?.obstacleType
      ? GameOverScene.DEATH_TEXT[data.obstacleType] || GameOverScene.DEFAULT_DEATH
      : GameOverScene.DEFAULT_DEATH;

    const titleY = this.setupDeathTitle(width, height, deathMessage);
    this.setupObstacleImage(width, titleY, data);

    const { isNewRecord, highScore } = this.getHighScoreInfo(data?.score ?? 0);
    this.setupScoreDisplay(width, height, data?.score ?? 0, highScore, isNewRecord);
    this.setupStats(width, height, data);

    if (isNewRecord) {
      this.spawnConfetti(width, height);
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

  // -- Background & atmosphere -----------------------------------------------

  private setupBackground(width: number, height: number): void {
    createPulsingOverlay(this, width, height, 0x440000, 0.3, 0.05);

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
    if (!data?.obstacleType || !GameOverScene.OBSTACLE_TEXTURE[data.obstacleType]) return;

    const textureKey = GameOverScene.OBSTACLE_TEXTURE[data.obstacleType];
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
      .text(width / 2, scoreY, 'Punkciory: 0', bodyStyle({
        fontSize: `${Math.round(16 * s)}px`,
        strokeThickness: 4 * s,
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
    const hsY = scoreY + Math.round(28 * s);
    const hsText = this.add
      .text(width / 2, hsY, `Najlepsiejszy wynik: ${highScore}`, smallStyle({
        fontSize: `${Math.round(11 * s)}px`,
        color: isNewRecord ? '#ffff00' : '#ff8800',
        strokeThickness: 3 * s,
      }))
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

  private showDeathButtons(width: number, height: number, isNewRecord: boolean, canSave: boolean, data: GameOverData): void {
    if (this.restartBound) return;
    this.restartBound = true;

    const s = getScale();
    const btnS = buttonStyle({
      fontSize: `${Math.round(12 * s)}px`,
      strokeThickness: Math.round(3 * s),
    });

    const btnY = height - Math.round(60 * s);
    const btnW = Math.round(160 * s);
    const btnH = Math.round(44 * s);
    const gap = Math.round(16 * s);

    createButton(this, width / 2 - btnW / 2 - gap / 2, btnY, btnW, btnH, 'Ekran Główny', 0x666666, btnS, () => this.goToMenu());
    createButton(this, width / 2 + btnW / 2 + gap / 2, btnY, btnW, btnH, 'Powtórka', 0x880000, btnS, () => this.restartGame());

    // "Zapisz" button below the highscore text when score qualifies for top 100
    if (canSave) {
      const saveY = height * 0.42 + Math.round(56 * s);
      const saveBtnW = Math.round(120 * s);
      const saveBtnH = Math.round(32 * s);

      const saveBg = this.add.rectangle(width / 2, saveY, saveBtnW, saveBtnH, 0x008800, 0.9)
        .setInteractive({ useHandCursor: true });
      const saveTxt = this.add.text(width / 2, saveY, 'Zapisz', buttonStyle({
        fontSize: `${Math.round(12 * s)}px`,
        strokeThickness: 2,
      })).setOrigin(0.5);

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
        this.showNameInputOverlay(width, height, data);
      });
    }

    // Keyboard shortcuts
    this.input.keyboard!.once('keydown-SPACE', () => this.restartGame());
    this.input.keyboard!.once('keydown-R', () => this.restartGame());
    this.input.keyboard!.once('keydown-ESC', () => this.goToMenu());
  }

  private showNameInputOverlay(width: number, height: number, data: GameOverData): void {
    // Create an HTML input overlay for name entry
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;font-family:"Press Start 2P",monospace;';

    const label = document.createElement('div');
    label.textContent = 'Wpisz swoje imię:';
    label.style.cssText = 'color:#ffff00;font-size:14px;';
    overlay.appendChild(label);

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 20;
    input.style.cssText = 'font-family:"Press Start 2P",monospace;font-size:18px;padding:8px 12px;background:#111;color:#fff;border:2px solid #8b0000;outline:none;text-align:center;width:240px;';
    overlay.appendChild(input);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:12px;';

    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Zapisz';
    submitBtn.style.cssText = 'font-family:"Press Start 2P",monospace;font-size:12px;padding:8px 16px;background:#008800;color:#fff;border:none;cursor:pointer;';
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
        cleanup();
        this.submitScore(name, data);
      }
    };

    submitBtn.addEventListener('click', submit);
    cancelBtn.addEventListener('click', cleanup);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape') cleanup();
    });
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

  // -- Network ----------------------------------------------------------------

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
