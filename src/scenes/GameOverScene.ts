import Phaser from 'phaser';

export class GameOverScene extends Phaser.Scene {
  private gameoverBgm: Phaser.Sound.BaseSound | null = null;

  constructor() {
    super({ key: 'GameOverScene' });
  }

  create(data: { score: number }): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

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

    // --- "ZGNIOTLES SIE!" with shake jitter ---
    const titleText = this.add
      .text(width / 2, height / 3 - 20, 'ZGNIOTŁEŚ SIĘ!', {
        fontSize: '56px',
        color: '#8b0000',
        fontFamily: 'Georgia, serif',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5);

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

    // --- SCORE COUNT-UP ---
    const finalScore = data?.score ?? 0;
    const scoreCounter = { value: 0 };

    const scoreText = this.add
      .text(width / 2, height / 2, 'Punktówy: 0', {
        fontSize: '32px',
        color: '#ffffff',
        fontFamily: 'monospace',
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
          fontSize: '20px',
          color: isNewRecord ? '#ffff00' : '#999999',
          fontFamily: 'monospace',
        },
      )
      .setOrigin(0.5);

    // Blinking restart prompt
    const restartText = this.add
      .text(width / 2, height - 60, 'Walnij SPACJĘ żeby Jeszcze Raz', {
        fontSize: '20px',
        color: '#ffffff',
        fontFamily: 'monospace',
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

    // --- GAME OVER MUSIC ---
    this.gameoverBgm = this.sound.add('gameover-bgm', { volume: 0.3, loop: true });
    this.gameoverBgm.play();

    // Restart on SPACE
    this.input.keyboard!.once('keydown-SPACE', () => {
      if (this.gameoverBgm) {
        this.gameoverBgm.stop();
        this.gameoverBgm.destroy();
        this.gameoverBgm = null;
      }
      this.scene.start('GameScene');
    });
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
