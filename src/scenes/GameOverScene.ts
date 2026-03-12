import Phaser from 'phaser';
import { showScoreboard, toggleScoreboard } from '../ui/Scoreboard';

interface GameOverData {
  score: number;
  timeSurvived?: number;
  applesCollected?: number;
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
    newspaper: 'Naleszało Ci siem',
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

  constructor() {
    super({ key: 'GameOverScene' });
  }

  create(data: GameOverData): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    this.restartBound = false;

    // Dark background
    this.cameras.main.setBackgroundColor('#0a0a0a');

    // --- DARK RED/BLACK PULSING OVERLAY ---
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

    // --- SUBTLE CAMERA ZOOM PULSE ---
    this.tweens.add({
      targets: this.cameras.main,
      zoom: 1.02,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // --- FLOATING RED CIRCLES DRIFTING UPWARD ---
    for (let i = 0; i < 12; i++) {
      this.spawnDeathParticle(width, height);
    }

    // --- DEATH TEXT (custom per obstacle) ---
    const deathMessage = data?.obstacleType
      ? GameOverScene.DEATH_TEXT[data.obstacleType] || 'ZGNIOTŁEŚ SIĘ!'
      : 'ZGNIOTŁEŚ SIĘ!';

    const titleText = this.add
      .text(width / 2, height / 3 - 20, deathMessage, {
        fontSize: deathMessage.length > 15 ? '18px' : '28px',
        color: '#8b0000',
        fontFamily: '"Press Start 2P", monospace',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    // Title shake jitter
    const titleBaseX = titleText.x;
    const titleBaseY = titleText.y;
    this.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => {
        titleText.x = titleBaseX + Phaser.Math.Between(-2, 2);
        titleText.y = titleBaseY + Phaser.Math.Between(-2, 2);
      },
    });

    // --- OBSTACLE IMAGE below death text ---
    if (data?.obstacleType && GameOverScene.OBSTACLE_TEXTURE[data.obstacleType]) {
      const textureKey = GameOverScene.OBSTACLE_TEXTURE[data.obstacleType];
      const obstacleImg = this.add.image(width / 2, titleText.y + 40, textureKey);
      obstacleImg.setScale(0.3);
      obstacleImg.setOrigin(0.5, 0);

      this.tweens.add({
        targets: obstacleImg,
        y: obstacleImg.y - 5,
        duration: 1000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // --- SCORE COUNT-UP ---
    const finalScore = data?.score ?? 0;
    const scoreCounter = { value: 0 };

    const scoreText = this.add
      .text(width / 2, height / 2, 'Punktówy: 0', {
        fontSize: '16px',
        color: '#ffffff',
        fontFamily: '"Press Start 2P", monospace',
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: scoreCounter,
      value: finalScore,
      duration: Math.min(2000, finalScore * 50 + 500),
      ease: 'Power2',
      onUpdate: () => {
        scoreText.setText(`Punktówy: ${Math.floor(scoreCounter.value)}`);
      },
    });

    // High score comparison
    const highScore = parseInt(localStorage.getItem('cockroach-highscore') || '0', 10);
    const isNewRecord = finalScore > 0 && finalScore >= highScore;

    this.add
      .text(
        width / 2,
        height / 2 + 50,
        `Najlepszy Wyńczyk: ${highScore}${isNewRecord ? '  NÓWKA SZTUKA!' : ''}`,
        {
          fontSize: '11px',
          color: isNewRecord ? '#ffff00' : '#999999',
          fontFamily: '"Press Start 2P", monospace',
        },
      )
      .setOrigin(0.5);

    // Confetti for new record
    if (isNewRecord) {
      for (let i = 0; i < 40; i++) {
        const confettiColors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xff6600];
        const color = confettiColors[i % confettiColors.length];
        const size = Phaser.Math.Between(3, 8);
        const confetti = this.add.rectangle(
          Phaser.Math.Between(0, width),
          -20,
          size,
          size * 2,
          color,
          0.9,
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

    // Stats
    const stats: string[] = [];
    if (data?.timeSurvived !== undefined) stats.push(`Czas Przeżywalności: ${data.timeSurvived}s`);
    if (data?.applesCollected !== undefined && data.applesCollected > 0) stats.push(`Jabłuszka: ${data.applesCollected}`);
    if (data?.distance !== undefined) stats.push(`Dystansik: ${data.distance}m`);
    if (data?.topSpeed !== undefined) stats.push(`Maks Szybkóść: ${data.topSpeed.toFixed(1)}x`);

    if (stats.length > 0) {
      this.add
        .text(width / 2, height / 2 + 90, stats.join('  |  '), {
          fontSize: '9px',
          color: '#888888',
          fontFamily: '"Press Start 2P", monospace',
        })
        .setOrigin(0.5);
    }

    // --- GAME OVER MUSIC ---
    this.gameoverBgm = this.sound.add('gameover-bgm', { volume: 0.3, loop: true });
    this.gameoverBgm.play();

    // --- NAME INPUT or RESTART ---
    if (isNewRecord) {
      this.showNameInput(width, height, data);
    } else {
      this.showRestartPrompt(width, height);
      this.showScoreboardButton(width, height);
    }
  }

  private showNameInput(width: number, height: number, data: GameOverData): void {
    const isMobile = !this.sys.game.device.os.desktop;

    if (isMobile) {
      // On mobile, use native prompt for soft keyboard support
      this.time.delayedCall(300, () => {
        const playerName = window.prompt('Wpisz swoje imię:') || '';
        if (playerName.length > 0) {
          const nameText = this.add
            .text(width / 2, height - 80, playerName, {
              fontSize: '12px',
              color: '#00ff00',
              fontFamily: '"Press Start 2P", monospace',
              stroke: '#000000',
              strokeThickness: 3,
            })
            .setOrigin(0.5);
          nameText.setAlpha(1);

          this.submitScore(playerName.slice(0, 20), data).then(() => {
            showScoreboard(this, playerName.slice(0, 20));
          });
        } else {
          this.showScoreboardButton(width, height);
        }
        this.showRestartPrompt(width, height);
      });
      return;
    }

    // Desktop: custom keyboard handler
    const promptText = this.add
      .text(width / 2, height - 100, 'Wpisz swoje imię (ENTER zatwierdza, ESC pomija):', {
        fontSize: '9px',
        color: '#ffff00',
        fontFamily: '"Press Start 2P", monospace',
      })
      .setOrigin(0.5);

    let playerName = '';
    const nameText = this.add
      .text(width / 2, height - 75, '_', {
        fontSize: '12px',
        color: '#ffffff',
        fontFamily: '"Press Start 2P", monospace',
        stroke: '#000000',
        strokeThickness: 3,
      })
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
        this.showRestartPrompt(width, height);
      } else if (event.key === 'Backspace') {
        playerName = playerName.slice(0, -1);
        nameText.setText(playerName.length > 0 ? playerName : '_');
      } else if (event.key === 'Escape') {
        this.input.keyboard!.off('keydown', handleKey);
        promptText.destroy();
        nameText.destroy();
        this.showRestartPrompt(width, height);
        this.showScoreboardButton(width, height);
      } else if (event.key.length === 1 && playerName.length < 20) {
        playerName += event.key;
        nameText.setText(playerName);
      }
    };

    this.input.keyboard!.on('keydown', handleKey);
  }

  private showRestartPrompt(width: number, height: number): void {
    if (this.restartBound) return;
    this.restartBound = true;

    const isMobile = !this.sys.game.device.os.desktop;
    const restartLabel = isMobile
      ? 'Dotknij żeby zagrać jeszcze raz!'
      : 'SPACJA / R — Jeszcze Raz!  |  ESC — Do Chałupy';

    const restartText = this.add
      .text(width / 2, height - 30, restartLabel, {
        fontSize: '9px',
        color: '#ffffff',
        fontFamily: '"Press Start 2P", monospace',
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: restartText,
      alpha: 0,
      duration: 500,
      ease: 'Power2',
      yoyo: true,
      repeat: -1,
    });

    this.input.keyboard!.once('keydown-SPACE', () => this.restartGame());
    this.input.keyboard!.once('keydown-R', () => this.restartGame());
    this.input.keyboard!.once('keydown-ESC', () => this.goToMenu());

    // Touch: tap to restart (with delay to prevent accidental tap)
    this.time.delayedCall(500, () => {
      this.input.once('pointerdown', () => this.restartGame());
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

  private showScoreboardButton(width: number, height: number): void {
    const btnText = this.add
      .text(width / 2, height - 55, '[ T — Tablica Wyników ]', {
        fontSize: '9px',
        color: '#888888',
        fontFamily: '"Press Start 2P", monospace',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    btnText.on('pointerover', () => btnText.setColor('#ffffff'));
    btnText.on('pointerout', () => btnText.setColor('#888888'));
    btnText.on('pointerdown', () => toggleScoreboard(this, null));

    this.input.keyboard!.on('keydown-T', () => toggleScoreboard(this, null));
  }

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

  private spawnDeathParticle(sceneWidth: number, sceneHeight: number): void {
    const size = Phaser.Math.Between(2, 6);
    const x = Phaser.Math.Between(0, sceneWidth);
    const y = Phaser.Math.Between(sceneHeight * 0.5, sceneHeight);

    const particle = this.add.circle(x, y, size, 0xaa0000, 0.5);
    particle.setBlendMode(Phaser.BlendModes.ADD);

    const duration = Phaser.Math.Between(2000, 5000);

    this.tweens.add({
      targets: particle,
      y: y - Phaser.Math.Between(100, 300),
      alpha: 0,
      duration,
      ease: 'Sine.easeIn',
      onComplete: () => {
        particle.destroy();
        this.spawnDeathParticle(sceneWidth, sceneHeight);
      },
    });
  }
}
