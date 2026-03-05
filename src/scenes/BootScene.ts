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

    // --- Sprites (new pixel art assets) ---
    this.load.image('cockroach', 'assets/cockroach.png');
    this.load.spritesheet('apple-spin', 'assets/apple.png', {
      frameWidth: 128,
      frameHeight: 128,
    });
    this.load.image('pest-spray', 'assets/spray.png');
    this.load.image('newspaper', 'assets/newspaper.png');
    this.load.image('onion', 'assets/onion.png');
    this.load.image('flipper', 'assets/flipper.png');
    this.load.image('bird', 'assets/bird.png');
    this.load.image('cat-paw', 'assets/cat.png');
    this.load.image('bird-overlook', 'assets/bird-overlook.png');
    this.load.image('tyskie', 'assets/tyskie.png');

    // --- Backgrounds ---
    this.load.image('sky', 'backgrounds/sky.png');
    this.load.image('midground', 'backgrounds/midground.png');
    this.load.image('floor-top', 'backgrounds/floor-top.png');
    this.load.image('floor-bottom', 'backgrounds/floor-bottom.png');
    this.load.image('foreground', 'backgrounds/foreground.png');

    // --- Audio ---
    this.load.audio('bgm', 'audio/bgm.mp3');
    this.load.audio('jump', 'audio/jump.wav');
    this.load.audio('apple', 'audio/apple.mp3');
    this.load.audio('death', 'audio/death.wav');
    this.load.audio('floor-switch', 'audio/floor-switch.wav');
    this.load.audio('dash', 'audio/dash.wav');
    this.load.audio('menu-bgm', 'audio/menu-bgm.wav');
    this.load.audio('gameover-bgm', 'audio/gameover-bgm.wav');
    this.load.audio('spray-sfx', 'audio/spray.mp3');
    this.load.audio('newspaper-sfx', 'audio/newspaper.mp3');
    this.load.audio('bird-sfx', 'audio/bird.mp3');
    this.load.audio('cat-sfx', 'audio/cat.mp3');
    this.load.audio('flipper-sfx', 'audio/flipper.mp3');
    this.load.audio('huh', 'audio/huh.mp3');
    this.load.audio('cockroach-hiss', 'audio/cockroach-hiss.mp3');
    this.load.audio('cockroach-noise', 'audio/cockroach-noise.mp3');
    this.load.audio('burp', 'audio/burp.mp3');
  }

  create(): void {
    // Create the apple spin animation
    this.anims.create({
      key: 'apple-spin',
      frames: this.anims.generateFrameNumbers('apple-spin', { start: 0, end: 35 }),
      frameRate: 12,
      repeat: -1,
    });

    this.scene.start('MenuScene');
  }
}
