import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    const { width, height } = this.cameras.main;

    // Black background
    this.cameras.main.setBackgroundColor('#000000');

    // --- HTML cockroach running across screen during load ---
    const loadOverlay = document.createElement('div');
    loadOverlay.id = 'load-overlay';
    loadOverlay.innerHTML = `
      <img class="load-roach" src="/assets/cockroach-idle.png" alt="">
      <div class="load-text">ładowanko...</div>
      <div class="load-bar-box"><div class="load-bar-fill"></div></div>
    `;
    loadOverlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;font-family:"Press Start 2P",monospace;';

    const style = document.createElement('style');
    style.textContent = `
      #load-overlay .load-roach {
        width: 160px; height: 80px; image-rendering: pixelated;
        position: absolute; top: 25%;
        animation: load-roach-run 3s linear infinite;
      }
      @keyframes load-roach-run { 0% { left: -160px; } 100% { left: 100%; } }
      #load-overlay .load-text { font-size: 28px; color: #8b0000; text-shadow: 0 0 12px #8b0000; }
      #load-overlay .load-bar-box { width: 320px; height: 24px; background: #111; border-radius: 4px; overflow: hidden; }
      #load-overlay .load-bar-fill { width: 0%; height: 100%; background: #8b0000; transition: width 0.1s; }
    `;
    document.head.appendChild(style);
    document.body.appendChild(loadOverlay);

    // Cockroach frame swap
    const roachImg = loadOverlay.querySelector('.load-roach') as HTMLImageElement;
    const roachFrames = ['/assets/cockroach-idle.png', '/assets/cockroach-running.png'];
    let rf = 0;
    const roachInterval = setInterval(() => { rf = 1 - rf; roachImg.src = roachFrames[rf]; }, 200);

    const barFill = loadOverlay.querySelector('.load-bar-fill') as HTMLElement;

    this.load.on('progress', (value: number) => {
      barFill.style.width = `${Math.round(value * 100)}%`;
    });

    this.load.on('complete', () => {
      clearInterval(roachInterval);
      loadOverlay.remove();
      style.remove();
    });

    // --- Sprites (new pixel art assets) ---
    this.load.image('cockroach', 'assets/cockroach.png');
    this.load.image('cockroach-idle', 'assets/cockroach-idle.png');
    this.load.image('cockroach-running', 'assets/cockroach-running.png');
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
    this.load.image('cupboard', 'assets/cupboard.png');

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
    this.load.audio('cricket', 'audio/cricket.mp3');

    // Score milestone sounds
    this.load.audio('milestone-100', 'audio/100.ogg');
    this.load.audio('milestone-250', 'audio/250.ogg');
    this.load.audio('milestone-420', 'audio/420.mp3');
    this.load.audio('milestone-500', 'audio/500.ogg');
    this.load.audio('milestone-1000', 'audio/1000.ogg');
    this.load.audio('milestone-1500', 'audio/1500.ogg');
    this.load.audio('milestone-2000', 'audio/2000.ogg');
    this.load.audio('milestone-2137', 'audio/2137.wav');
    this.load.audio('milestone-3000', 'audio/3000.ogg');
    this.load.audio('milestone-4000', 'audio/4000.ogg');
    this.load.audio('milestone-4200', 'audio/4200.mp3');
    this.load.audio('milestone-5000', 'audio/5000.ogg');
    this.load.audio('milestone-10000', 'audio/10000.mp3');
  }

  create(): void {
    this.scene.start('MenuScene');
  }
}
