import Phaser from 'phaser';
import { ATLAS, createSpriteAnimations } from '../config/sprites';
import { sceneManager } from '../systems/SceneManager';
import { DEFERRED_LOAD_SCENE } from './DeferredLoadScene';
import { GOOGLE_G } from '../ui/shared';
import { ANCHORS_KEY, createItemAnimations } from '../config/skins';
import { VFX_ATLAS } from '../effects/Fx';

/** Bump when anything in public/assets changes. Those files were once served `immutable` for a year, so browsers
 * and Cloudflare that kept the old copies only fetch new ones under a new URL. */
const ASSET_REV = '?v=13';

/** What index.html's loading screen offers the game. */
interface LoadingScreen {
  progress(value: number): void;
  /** The roach runs the rest of the way and the bosses flash; resolves when that is over. */
  finish(): Promise<void>;
  /** Fades the screen out and removes it. */
  reveal(): void;
}
const loadingScreen = (): LoadingScreen | undefined => (window as unknown as { __loading?: LoadingScreen }).__loading;

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Black background
    this.cameras.main.setBackgroundColor('#000000');

    // The loading screen is plain HTML in index.html (it shows before this game exists); the loader's progress drives it
    const loading = loadingScreen();
    this.load.on('progress', (value: number) => loading?.progress(value));
    this.load.on('complete', () => { void loading?.finish(); });

    // --- Sprites ---
    const images: [string, string][] = [
      ['bird-overlook', 'assets/bird-overlook.webp'],
      [GOOGLE_G, 'assets/google-g.png'],
    ];
    for (const [key, path] of images) this.load.image(key, path + ASSET_REV);
    this.load.atlas(ATLAS, 'assets/sprites.webp' + ASSET_REV, 'assets/sprites.json' + ASSET_REV);
    // The effects, drawn by tools/art/vfx.py: their own small atlas, played by src/effects/Fx.ts
    this.load.atlas(VFX_ATLAS, 'assets/vfx.webp' + ASSET_REV, 'assets/vfx.json' + ASSET_REV);
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
      ['combo-break', 'audio/combo-break.ogg'],
      ['hop-land', 'audio/hop-land.ogg'],
      ['heartbeat', 'audio/heartbeat.ogg'],
      ['onion-sfx', 'audio/onion.ogg'],
      ['beer-sfx', 'audio/beer.ogg'],
      ['pill-end', 'audio/pill-end.ogg'],
      ['mult-up', 'audio/mult-up.ogg'],
      ['na-styk', 'audio/na-styk.ogg'],
      ['przebicie', 'audio/przebicie.ogg'],
      ['moult-pop', 'audio/moult-pop.ogg'],
      ['ability-reward', 'audio/ability-reward.ogg'],
      ...Array.from({ length: 8 }, (_, i): [string, string] => [`combo-tick-${i + 1}`, `audio/combo-tick-${i + 1}.ogg`]),
      ['ui-press', 'audio/ui/press.ogg'],
      ['ui-hover', 'audio/ui/hover.ogg'],
      ['ui-back', 'audio/ui/back.ogg'],
      ['ui-slider', 'audio/ui/slider.ogg'],
      ['ui-purchase', 'audio/ui/purchase.ogg'],
      ['ui-error', 'audio/ui/error.ogg'],
    ];
    for (const [key, path] of audio) this.load.audio(key, path);

    // Score milestone sounds
    const milestoneTiers = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14'];
    for (const m of milestoneTiers) {
      this.load.audio(`milestone-${m}`, `audio/milestones/${m}.ogg`);
    }
    this.load.audio('milestone-2137', 'audio/2137.ogg');
  }

  create(): void {
    createSpriteAnimations(this);
    createItemAnimations(this);
    this.scene.launch(DEFERRED_LOAD_SCENE);
    // No fade of its own: the loading screen stays up until the menu has drawn its first frame, then fades away over it
    sceneManager.enter(this, 'MenuScene');
    const loading = loadingScreen();
    if (!loading) return;
    void Promise.all([loading.finish(), this.menuDrawn()]).then(() => loading.reveal());
  }

  /** Resolves once MenuScene has been drawn twice, and the browser has had a frame to show it. */
  private menuDrawn(): Promise<void> {
    return new Promise((resolve) => {
      let frames = 0;
      const onRender = (): void => {
        if (!this.scene.isActive('MenuScene') || ++frames < 2) return;
        this.game.events.off(Phaser.Core.Events.POST_RENDER, onRender);
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      };
      this.game.events.on(Phaser.Core.Events.POST_RENDER, onRender);
      // A menu that never draws must not leave the loading screen up for good
      setTimeout(resolve, 6000);
    });
  }
}
