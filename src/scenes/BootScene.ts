import Phaser from 'phaser';
import { sceneManager } from '../systems/SceneManager';

/** Bump when anything in public/assets changes. Those files were once served `immutable` for a year, so browsers
 * and Cloudflare that kept the old copies only fetch new ones under a new URL. */
const ASSET_REV = '?v=2';

export class BootScene extends Phaser.Scene {
  private deferredLoaded = false;

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
      loadOverlay.style.transition = 'opacity 0.5s';
      loadOverlay.style.opacity = '0';
      loadOverlay.addEventListener('transitionend', () => {
        loadOverlay.remove();
        style.remove();
      });
    });

    // --- Sprites ---
    const images: [string, string][] = [
      ['cockroach-idle', 'assets/cockroach-idle.webp'],
      ['cockroach-running', 'assets/cockroach-running.webp'],
      ['cockroach-dashing', 'assets/cockroach-dashing.webp'],
      ['cockroach-standing', 'assets/cockroach-standing.webp'],
      ['apple', 'assets/apple.webp'],
      ['pest-spray', 'assets/spray.webp'],
      ['newspaper', 'assets/newspaper.webp'],
      ['onion', 'assets/onion.webp'],
      ['flipper', 'assets/flipper.webp'],
      ['bird', 'assets/bird.webp'],
      ['cat-paw', 'assets/cat.webp'],
      ['bird-overlook', 'assets/bird-overlook.webp'],
      ['beer-1', 'assets/beer-1.webp'],
      ['beer-2', 'assets/beer-2.webp'],
      ['beer-3', 'assets/beer-3.webp'],
      ['beer-4', 'assets/beer-4.webp'],
      ['beer-5', 'assets/beer-5.webp'],
      ['beer-6', 'assets/beer-6.webp'],
      ['pill', 'assets/pill.webp'],
      ['disco-ball', 'assets/disco.webp'],
      ['jellyfish', 'assets/jellyfish.webp'],
      ['pope', 'assets/pope.webp'],
      ['bison', 'assets/bison.webp'],
      ['black-hole', 'assets/blackhole.webp'],
      ['btn-bg', 'assets/btn.webp'],
    ];
    for (const [key, path] of images) this.load.image(key, path + ASSET_REV);

    // Menu backgrounds with normal maps for lighting
    this.load.image('menu-bg', ['assets/bg.webp' + ASSET_REV, 'assets/bg-n.webp' + ASSET_REV]);
    this.load.image('menu-bg-multiplayer', ['assets/bg-multiplayer.webp' + ASSET_REV, 'assets/bg-multiplayer-n.webp' + ASSET_REV]);

    // --- Level backgrounds, floors, and BGM ---
    for (let i = 1; i <= 3; i++) {
      for (const [prefix, dir] of [['sky', 'sky'], ['bg', 'mid'], ['fg', 'fg'], ['floor', 'floor']] as const) {
        const normalMap = `levels/${dir}/lv${i}-n.webp`;
        const hasNormal = i === 1; // lv1 has normal maps for lighting
        if (hasNormal) {
          this.load.image(`lv${i}-${prefix}`, [`levels/${dir}/lv${i}.webp`, normalMap]);
        } else {
          this.load.image(`lv${i}-${prefix}`, `levels/${dir}/lv${i}.webp`);
        }
      }
      this.load.audio(`bgm-lv${i}`, `levels/soundtracks/lv${i}.ogg`);
    }

    // --- Audio ---
    const audio: [string, string][] = [
      ['jump', 'audio/jump.ogg'],
      ['apple', 'audio/apple.ogg'],
      ['death', 'audio/death.ogg'],
      ['floor-switch', 'audio/floor-switch.ogg'],
      ['dash', 'audio/dash.ogg'],
      ['dash-ready', 'audio/dash-ready.ogg'],
      ['menu-bgm', 'audio/menu-bgm.ogg'],
      ['gameover-bgm', 'audio/gameover-bgm.ogg'],
      ['spray-sfx', 'audio/spray.ogg'],
      ['newspaper-sfx', 'audio/newspaper.ogg'],
      ['bird-sfx', 'audio/bird.ogg'],
      ['cat-sfx', 'audio/cat.ogg'],
      ['flipper-sfx', 'audio/flipper.ogg'],
      ['huh', 'audio/huh.ogg'],
      ['cockroach-hiss', 'audio/cockroach-hiss.ogg'],
      ['cockroach-noise', 'audio/cockroach-noise.ogg'],
      ['burp', 'audio/burp.ogg'],
      ['pill-sfx', 'audio/pill.ogg'],
      ['disco-sfx', 'audio/disco.ogg'],
      ['jellyfish-sfx', 'audio/jellyfish.ogg'],
      ['pope-sfx', 'audio/pope.ogg'],
      ['bison-sfx', 'audio/bison.ogg'],
      ['blackhole-sfx', 'audio/blackhole.ogg'],
      ['cricket', 'audio/cricket.ogg'],
      ['combo-lost', 'audio/combo-lost.ogg'],
    ];
    for (const [key, path] of audio) this.load.audio(key, path);

    // Score milestone sounds
    const milestones = [100, 250, 420, 500, 1000, 1500, 2000, 2137, 3000, 4000, 4200, 5000, 10000];
    for (const m of milestones) {
      this.load.audio(`milestone-${m}`, `audio/${m}.ogg`);
    }

    // Boss fight assets (boss triggers at distance 450, during lv3 — must be ready at boot)
    const bossImages: [string, string][] = [
      ['boss-gun', 'boss/gun.webp'],
      ['boss-shell', 'boss/shell.webp'],
      ['boss-bomb', 'boss/bomb.webp'],
      ['boss-creamcake', 'boss/creamcake.webp'],
      ['boss-explosion1', 'boss/explosion1.webp'],
      ['boss-explosion2', 'boss/explosion2.webp'],
      ['boss-explosion3', 'boss/explosion3.webp'],
      ['boss-face1', 'boss/face1.webp'],
      ['boss-face2', 'boss/face2.webp'],
      ['boss-face3', 'boss/face3.webp'],
    ];
    for (const [key, path] of bossImages) this.load.image(key, path);

    const bossAudio: [string, string][] = [
      ['boss-choir', 'boss/choir.ogg'],
      ['boss-pistol', 'boss/pistol.ogg'],
      ['boss-bomb-shot', 'boss/bomb-shot.ogg'],
      ['boss-creamcake-shot', 'boss/creamcake-shot.ogg'],
      ['boss-explosion', 'boss/explosion.ogg'],
      ['boss-victory', 'boss/victory.ogg'],
      ['boss-bgm', 'boss/boss-bgm.ogg'],
      ['boss-beast-ambient', 'boss/beast-ambient.ogg'],
    ];
    for (const [key, path] of bossAudio) this.load.audio(key, path);
    for (let i = 1; i <= 6; i++) this.load.audio(`boss-hurt-${i}`, `boss/hurt-${i}.ogg`);
    for (let i = 1; i <= 7; i++) this.load.audio(`boss-cue-${i}`, `boss/boss-cue-${i}.ogg`);
  }

  /** Load deferred assets using the calling scene's loader (BootScene is shut down by then). */
  loadDeferred(callerScene: Phaser.Scene): void {
    if (this.deferredLoaded) return;
    this.deferredLoaded = true;

    for (let i = 4; i <= 10; i++) {
      for (const [prefix, dir] of [['sky', 'sky'], ['bg', 'mid'], ['fg', 'fg'], ['floor', 'floor']] as const) {
        callerScene.load.image(`lv${i}-${prefix}`, `levels/${dir}/lv${i}.webp`);
      }
      callerScene.load.audio(`bgm-lv${i}`, `levels/soundtracks/lv${i}.ogg`);
    }

    callerScene.load.once('complete', () => {
      this.game.events.emit('deferred-loaded');
    });
    callerScene.load.start();
  }

  create(): void {
    sceneManager.goto(this, 'MenuScene');
  }
}
