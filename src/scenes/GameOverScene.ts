import Phaser from 'phaser';
import { showScoreboard, toggleScoreboard } from '../ui/Scoreboard';

interface GameOverData {
  score: number;
  timeSurvived?: number;
  topSpeed?: number;
  distance?: number;
  obstacleType?: string | null;
}

/** Shared font family used for all text in the scene. */
const FONT_FAMILY = '"Press Start 2P", monospace';

/** Reusable text style presets. */
const TEXT_STYLES = {
  title: (message: string): Phaser.Types.GameObjects.Text.TextStyle => ({
    fontSize: message.length > 15 ? '18px' : '28px',
    color: '#8b0000',
    fontFamily: FONT_FAMILY,
    fontStyle: 'bold',
    stroke: '#000000',
    strokeThickness: 6,
  }),
  score: {
    fontSize: '16px',
    color: '#ffffff',
    fontFamily: FONT_FAMILY,
  } as Phaser.Types.GameObjects.Text.TextStyle,
  small: (color: string): Phaser.Types.GameObjects.Text.TextStyle => ({
    fontSize: '9px',
    color,
    fontFamily: FONT_FAMILY,
  }),
  nameInput: {
    fontSize: '12px',
    color: '#ffffff',
    fontFamily: FONT_FAMILY,
    stroke: '#000000',
    strokeThickness: 3,
  } as Phaser.Types.GameObjects.Text.TextStyle,
  nameConfirmed: {
    fontSize: '12px',
    color: '#00ff00',
    fontFamily: FONT_FAMILY,
    stroke: '#000000',
    strokeThickness: 3,
  } as Phaser.Types.GameObjects.Text.TextStyle,
  highScore: (isRecord: boolean): Phaser.Types.GameObjects.Text.TextStyle => ({
    fontSize: '11px',
    color: isRecord ? '#ffff00' : '#999999',
    fontFamily: FONT_FAMILY,
  }),
} as const;

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
  private static readonly CONFETTI_COLORS = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xff6600];

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

    const isMobile = !this.sys.game.device.os.desktop;

    // Name input or restart
    if (isNewRecord && !isMobile) {
      this.showNameInput(width, height, data);
    } else {
      this.showMobileDeathButtons(width, height, isNewRecord, data);
    }
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
      this.spawnDeathParticle(width, height);
    }
  }

  private setupDeathTitle(width: number, height: number, message: string): number {
    const titleText = this.add
      .text(width / 2, height / 3 - 20, message, TEXT_STYLES.title(message))
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
    const img = this.add.image(width / 2, titleY + 40, textureKey);
    img.setScale(0.3).setOrigin(0.5, 0);

    this.tweens.add({
      targets: img,
      y: img.y - 5,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
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
    // Animated count-up
    const counter = { value: 0 };
    const scoreText = this.add
      .text(width / 2, height / 2, 'Punkciory: 0', TEXT_STYLES.score)
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
    const suffix = isNewRecord ? '  NÓWKA SZTUKA!' : '';
    this.add
      .text(width / 2, height / 2 + 50, `Najlepsiejszy wynik: ${highScore}${suffix}`, TEXT_STYLES.highScore(isNewRecord))
      .setOrigin(0.5);
  }

  private setupStats(width: number, height: number, data: GameOverData): void {
    const parts: string[] = [];
    if (data?.timeSurvived !== undefined) parts.push(`Czas Przeżywalności: ${data.timeSurvived}s`);
    if (data?.distance !== undefined) parts.push(`Dystansik: ${data.distance}m`);
    if (data?.topSpeed !== undefined) parts.push(`Maks Szybkóść: ${data.topSpeed.toFixed(1)}x`);

    if (parts.length > 0) {
      this.add
        .text(width / 2, height / 2 + 90, parts.join('  |  '), TEXT_STYLES.small('#888888'))
        .setOrigin(0.5);
    }
  }

  // ── Confetti ───────────────────────────────────────────────────────

  private spawnConfetti(width: number, height: number): void {
    for (let i = 0; i < 40; i++) {
      const color = GameOverScene.CONFETTI_COLORS[i % GameOverScene.CONFETTI_COLORS.length];
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

  // ── Name input ─────────────────────────────────────────────────────

  private showNameInput(width: number, height: number, data: GameOverData): void {
    // Desktop: custom keyboard handler
    const promptText = this.add
      .text(width / 2, height - 100, 'Wpisz swoje imię (ENTER zatwierdza, ESC pomija):', TEXT_STYLES.small('#ffff00'))
      .setOrigin(0.5);

    let playerName = '';
    const nameText = this.add
      .text(width / 2, height - 75, '_', TEXT_STYLES.nameInput)
      .setOrigin(0.5);

    this.tweens.add({
      targets: nameText,
      alpha: { from: 1, to: 0.5 },
      duration: 500,
      yoyo: true,
      repeat: -1,
    });

    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Enter' && playerName.length > 0) {
        this.input.keyboard!.off('keydown', handleKey);
        promptText.destroy();
        nameText.setText(playerName);
        nameText.setColor('#00ff00');
        this.tweens.killTweensOf(nameText);
        nameText.setAlpha(1);

        this.submitScore(playerName, data).then(() => {
          showScoreboard(this, playerName);
        });
        this.showMobileDeathButtons(width, height, false, data);
      } else if (event.key === 'Backspace') {
        playerName = playerName.slice(0, -1);
        nameText.setText(playerName.length > 0 ? playerName : '_');
      } else if (event.key === 'Escape') {
        this.input.keyboard!.off('keydown', handleKey);
        promptText.destroy();
        nameText.destroy();
        this.showMobileDeathButtons(width, height, false, data);
      } else if (event.key.length === 1 && playerName.length < 20) {
        playerName += event.key;
        nameText.setText(playerName);
      }
    };

    this.input.keyboard!.on('keydown', handleKey);
  }

  // ── Restart / navigation ───────────────────────────────────────────

  /** Universal death screen with action buttons + keyboard shortcuts. */
  private showMobileDeathButtons(width: number, height: number, isNewRecord: boolean, data: GameOverData): void {
    if (this.restartBound) return;
    this.restartBound = true;

    const btnStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: '10px',
      fontFamily: FONT_FAMILY,
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
    };

    const btnY = height - 80;
    const spacing = 28;
    const buttons: { label: string; action: () => void; color: number }[] = [
      { label: 'Ekran G\u0142\u00f3wny', action: () => this.goToMenu(), color: 0x666666 },
      { label: 'Bycze Karaluchy', action: () => toggleScoreboard(this, null), color: 0x886600 },
    ];

    if (isNewRecord) {
      buttons.push({
        label: 'Zapisz Wynik',
        action: () => {
          const playerName = window.prompt('Wpisz swoje imi\u0119:') || '';
          if (playerName.length > 0) {
            this.submitScore(playerName.slice(0, 20), data).then(() => {
              showScoreboard(this, playerName.slice(0, 20));
            });
          }
        },
        color: 0x008800,
      });
    }

    buttons.push({ label: 'Powt\u00f3rka', action: () => this.restartGame(), color: 0x880000 });

    const totalBtns = buttons.length;
    const btnW = Math.min(140, (width - 32) / totalBtns - 8);
    const totalW = totalBtns * btnW + (totalBtns - 1) * 8;
    const startX = (width - totalW) / 2 + btnW / 2;

    buttons.forEach((btn, i) => {
      const bx = startX + i * (btnW + 8);

      const bg = this.add.rectangle(bx, btnY, btnW, 40, btn.color, 0.6)
        .setInteractive();

      const label = this.add.text(bx, btnY, btn.label, btnStyle)
        .setOrigin(0.5);

      bg.on('pointerover', () => { bg.setAlpha(1); label.setColor('#ffff00'); });
      bg.on('pointerout', () => { bg.setAlpha(0.6); label.setColor('#ffffff'); });
      bg.on('pointerdown', btn.action);
    });

    // Desktop keyboard shortcuts still work
    this.input.keyboard!.once('keydown-SPACE', () => this.restartGame());
    this.input.keyboard!.once('keydown-R', () => this.restartGame());
    this.input.keyboard!.once('keydown-ESC', () => this.goToMenu());
    this.input.keyboard!.on('keydown-T', () => toggleScoreboard(this, null));
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

  // ── Particles ──────────────────────────────────────────────────────

  private spawnDeathParticle(sceneWidth: number, sceneHeight: number): void {
    const size = Phaser.Math.Between(2, 6);
    const x = Phaser.Math.Between(0, sceneWidth);
    const y = Phaser.Math.Between(sceneHeight * 0.5, sceneHeight);

    const particle = this.add.circle(x, y, size, 0xaa0000, 0.5);
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
