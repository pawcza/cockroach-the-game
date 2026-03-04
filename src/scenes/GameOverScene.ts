import Phaser from 'phaser';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' });
  }

  create(data: { score: number }): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Dark background
    this.cameras.main.setBackgroundColor('#0a0a0a');

    // "SQUISHED!" title
    this.add
      .text(width / 2, height / 3 - 20, 'ZGNIOTŁEŚ SIĘ!', {
        fontSize: '56px',
        color: '#8b0000',
        fontFamily: 'Georgia, serif',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    // Final score
    const finalScore = data?.score ?? 0;

    this.add
      .text(width / 2, height / 2, `Punktówy: ${finalScore}`, {
        fontSize: '32px',
        color: '#ffffff',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5);

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

    // Restart on SPACE
    this.input.keyboard!.once('keydown-SPACE', () => {
      this.scene.start('GameScene');
    });
  }
}
