import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    const { width, height } = this.cameras.main;

    // --- Loading progress bar (dark crimson on dark background) ---
    const progressBox = this.add.graphics();
    progressBox.fillStyle(0x111111, 0.9);
    progressBox.fillRect(width / 2 - 165, height / 2 - 17, 330, 34);

    const progressBar = this.add.graphics();

    const loadingText = this.add.text(width / 2, height / 2 - 50, 'Loading...', {
      fontSize: '20px',
      color: '#8b0000',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    const percentText = this.add.text(width / 2, height / 2, '0%', {
      fontSize: '16px',
      color: '#cccccc',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.load.on('progress', (value: number) => {
      progressBar.clear();
      progressBar.fillStyle(0x8b0000, 1);
      progressBar.fillRect(width / 2 - 160, height / 2 - 12, 320 * value, 24);
      percentText.setText(`${Math.round(value * 100)}%`);
    });

    this.load.on('complete', () => {
      progressBar.destroy();
      progressBox.destroy();
      loadingText.destroy();
      percentText.destroy();
    });

    // --- Sprites ---
    this.load.spritesheet('cockroach-run', 'sprites/cockroach-run.png', {
      frameWidth: 96,
      frameHeight: 96,
    });
    this.load.image('cockroach-jump', 'sprites/cockroach-jump.png');
    this.load.image('cockroach-dead', 'sprites/cockroach-dead.png');
    this.load.image('apple', 'sprites/apple.png');
    this.load.image('pest-spray', 'sprites/pest-spray.png');
    this.load.image('newspaper', 'sprites/newspaper.png');
    this.load.image('onion', 'sprites/onion.png');
    this.load.image('flipper', 'sprites/flipper.png');
    this.load.image('bird', 'sprites/bird.png');
    this.load.image('cat-paw', 'sprites/cat-paw.png');

    // --- Backgrounds ---
    this.load.image('sky', 'backgrounds/sky.png');
    this.load.image('midground', 'backgrounds/midground.png');
    this.load.image('floor-top', 'backgrounds/floor-top.png');
    this.load.image('floor-bottom', 'backgrounds/floor-bottom.png');

    // --- Audio ---
    this.load.audio('bgm', 'audio/bgm.wav');
    this.load.audio('jump', 'audio/jump.wav');
    this.load.audio('apple', 'audio/apple.wav');
    this.load.audio('death', 'audio/death.wav');
    this.load.audio('floor-switch', 'audio/floor-switch.wav');
    this.load.audio('dash', 'audio/dash.wav');
    this.load.audio('menu-bgm', 'audio/menu-bgm.wav');
    this.load.audio('gameover-bgm', 'audio/gameover-bgm.wav');
  }

  create(): void {
    // Create the cockroach run animation (6 frames, 12 fps, infinite loop)
    this.anims.create({
      key: 'cockroach-run',
      frames: this.anims.generateFrameNumbers('cockroach-run', { start: 0, end: 5 }),
      frameRate: 12,
      repeat: -1,
    });

    this.scene.start('MenuScene');
  }
}
