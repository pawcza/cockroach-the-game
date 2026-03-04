import Phaser from 'phaser';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const { width, height } = this.cameras.main;

    // Sky background as a tileSprite
    this.add.tileSprite(0, 0, width, height, 'sky').setOrigin(0, 0);

    // Title: "COCKROACH"
    this.add.text(width / 2, height / 3, 'COCKROACH', {
      fontSize: '64px',
      color: '#8b0000',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    // Subtitle: "THE GAME"
    this.add.text(width / 2, height / 3 + 60, 'THE GAME', {
      fontSize: '32px',
      color: '#ff6600',
      fontFamily: 'Georgia, serif',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    // High score from localStorage
    const highScore = localStorage.getItem('cockroach-highscore') || '0';
    this.add.text(width / 2, height / 2 + 40, `High Score: ${highScore}`, {
      fontSize: '20px',
      color: '#cccccc',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Blinking "Press SPACE to Start" prompt
    const startText = this.add.text(width / 2, height - 80, 'Press SPACE to Start', {
      fontSize: '24px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: startText,
      alpha: 0,
      duration: 500,
      ease: 'Power2',
      yoyo: true,
      repeat: -1,
    });

    // Start the game on SPACE
    this.input.keyboard!.once('keydown-SPACE', () => {
      this.scene.start('GameScene');
    });
  }
}
