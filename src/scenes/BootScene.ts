import Phaser from 'phaser';
import { ATLAS, createSpriteAnimations } from '../config/sprites';
import { sceneManager } from '../systems/SceneManager';
import { DEFERRED_LOAD_SCENE } from './DeferredLoadScene';
import { GOOGLE_G } from '../ui/shared';
import { ANCHORS_KEY, createItemAnimations } from '../config/skins';

/** Bump when anything in public/assets changes. Those files were once served `immutable` for a year, so browsers
 * and Cloudflare that kept the old copies only fetch new ones under a new URL. */
const ASSET_REV = '?v=6';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Black background
    this.cameras.main.setBackgroundColor('#000000');

    // --- HTML cockroach running across screen during load ---
    const loadOverlay = document.createElement('div');
    loadOverlay.id = 'load-overlay';
    loadOverlay.innerHTML = `
      <div class="load-roach"></div>
      <div class="load-text">ładowanko...</div>
      <div class="load-bar-box"><div class="load-bar-fill"></div></div>
    `;
    loadOverlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;font-family:"Tiny5",monospace;';

    const style = document.createElement('style');
    style.textContent = `
      #load-overlay .load-roach {
        width: 176px; height: 110px; image-rendering: pixelated;
        background: url('/assets/roach-run.png') 0 0 / 800% 100%;
        position: absolute; top: 25%;
        animation: load-roach-run 3s linear infinite, load-roach-legs .5s steps(8) infinite;
      }
      @keyframes load-roach-run { 0% { left: -176px; } 100% { left: 100%; } }
      @keyframes load-roach-legs { to { background-position-x: 800%; } }
      #load-overlay .load-text { font-size: 32px; color: #8b0000; text-shadow: 0 0 12px #8b0000; }
      #load-overlay .load-bar-box { width: 320px; height: 24px; background: #111; border-radius: 4px; overflow: hidden; }
      #load-overlay .load-bar-fill { width: 0%; height: 100%; background: #8b0000; transition: width 0.1s; }
    `;
    document.head.appendChild(style);
    document.body.appendChild(loadOverlay);


    const barFill = loadOverlay.querySelector('.load-bar-fill') as HTMLElement;

    this.load.on('progress', (value: number) => {
      barFill.style.width = `${Math.round(value * 100)}%`;
    });

    this.load.on('complete', () => {
      loadOverlay.style.transition = 'opacity 0.5s';
      loadOverlay.style.opacity = '0';
      loadOverlay.addEventListener('transitionend', () => {
        loadOverlay.remove();
        style.remove();
      });
    });

    // --- Sprites ---
    const images: [string, string][] = [
      ['bird-overlook', 'assets/bird-overlook.webp'],
      [GOOGLE_G, 'assets/google-g.png'],
    ];
    for (const [key, path] of images) this.load.image(key, path + ASSET_REV);
    this.load.atlas(ATLAS, 'assets/sprites.webp' + ASSET_REV, 'assets/sprites.json' + ASSET_REV);
    // Where worn items sit on the roach in every frame, and how each is worn: baked with the atlas
    this.load.json(ANCHORS_KEY, 'assets/anchors.json' + ASSET_REV);


    // --- Level 1: the rest of the levels and the boss load in DeferredLoadScene ---
    for (const [prefix, dir] of [['sky', 'sky'], ['bg', 'mid'], ['fg', 'fg'], ['floor', 'floor']] as const) {
      this.load.image(`lv1-${prefix}`, `levels/${dir}/lv1.webp`);
    }
    this.load.audio('bgm-lv1', 'levels/soundtracks/lv1.ogg');

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
  }

  create(): void {
    createSpriteAnimations(this);
    createItemAnimations(this);
    this.scene.launch(DEFERRED_LOAD_SCENE);
    sceneManager.goto(this, 'MenuScene');
  }
}
