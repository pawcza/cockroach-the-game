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
      fontSize: '11px',
      color: '#8b0000',
      fontFamily: '"Press Start 2P", monospace',
    }).setOrigin(0.5);

    const percentText = this.add.text(width / 2, height / 2, '0%', {
      fontSize: '10px',
      color: '#cccccc',
      fontFamily: '"Press Start 2P", monospace',
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
    this.load.image('apple', 'apple.png');
    this.load.image('menu-bg', 'bg.png');
    this.load.image('pest-spray', 'assets/spray.png');
    this.load.image('newspaper', 'assets/newspaper.png');
    this.load.image('onion', 'assets/onion.png');
    this.load.image('flipper', 'assets/flipper.png');
    this.load.image('bird', 'assets/bird.png');
    this.load.image('cat-paw', 'assets/cat.png');
    this.load.image('bird-overlook', 'assets/bird-overlook.png');
    this.load.image('tyskie', 'assets/tyskie.png');
    this.load.image('pill', 'assets/pill.png');
    this.load.image('disco-ball', 'assets/disco.png');
    this.load.image('jellyfish', 'assets/jellyfish.png');
    this.load.image('pope', 'assets/pope.png');
    this.load.image('bison', 'assets/bison.png');
    this.load.image('black-hole', 'assets/blackhole.png');

    // --- Level backgrounds, floors, and BGM ---
    for (let i = 1; i <= 10; i++) {
      this.load.image(`lv${i}-sky`, `levels/sky/lv${i}.png`);
      this.load.image(`lv${i}-bg`, `levels/mid/lv${i}.png`);
      this.load.image(`lv${i}-fg`, `levels/fg/lv${i}.png`);
      this.load.image(`lv${i}-floor`, `levels/floor/lv${i}.png`);
      this.load.audio(`bgm-lv${i}`, `levels/soundtracks/lv${i}.mp3`);
    }

    // --- Audio ---
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
    this.load.audio('pill-sfx', 'audio/pill.wav');
    this.load.audio('disco-sfx', 'audio/disco.mp3');
    this.load.audio('jellyfish-sfx', 'audio/jellyfish.mp3');
    this.load.audio('pope-sfx', 'audio/pope.mp3');
    this.load.audio('bison-sfx', 'audio/bison.ogg');
    this.load.audio('blackhole-sfx', 'audio/blackhole.mp3');
  }

  create(): void {
    this.scene.start('MenuScene');
  }
}
