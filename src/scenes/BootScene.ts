import Phaser from 'phaser';
import { ATLAS, createSpriteAnimations, registerAtlas } from '../config/sprites';
import { BOOT_PACKS, packAssets, type PackManifest } from '../config/packs';
import { sceneManager } from '../systems/SceneManager';
import { DEFERRED_LOAD_SCENE } from './DeferredLoadScene';
import { GOOGLE_G } from '../ui/shared';
import { ANCHORS_KEY, createItemAnimations } from '../config/skins';
import { VFX_ATLAS } from '../effects/Fx';
import { parkReturnNotice, takeReturnToRun } from '../ui/Account';

/** Bump when anything in public/assets changes. Those files were once served `immutable` for a year, so browsers
 * and Cloudflare that kept the old copies only fetch new ones under a new URL. */
export const ASSET_REV = '?v=29';

/** assets/packs.json, the bake's list of atlases (src/config/packs.ts). */
export const PACKS_KEY = 'packs';

/** Boot's packs are level 1's images: no atlas of the manifest. */
const BOOT_MANIFEST: PackManifest = { core: 'sprites', enemies: {}, skins: {}, roach: {}, baked: [] };

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
    this.load.json(PACKS_KEY, 'assets/packs.json' + ASSET_REV);

    // --- Level 1's images: every other pack (the enemies, every level's sound) comes through the pack loader ---
    for (const asset of BOOT_PACKS.flatMap(id => packAssets(id, BOOT_MANIFEST, {}) ?? [])) {
      if (asset.kind === 'atlas') this.load.atlas(asset.key, asset.image + ASSET_REV, asset.json + ASSET_REV);
      else if (asset.kind === 'image') this.load.image(asset.key, asset.url);
      else this.load.audio(asset.key, asset.url);
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
      ['huh', 'audio/huh.ogg'],
      ['cockroach-hiss', 'audio/cockroach-hiss.ogg'],
      ['cockroach-noise', 'audio/cockroach-noise.ogg'],
      ['burp', 'audio/burp.ogg'],
      ['pill-sfx', 'audio/pill.ogg'],
      ['cricket', 'audio/cricket.ogg'],
      ['combo-lost', 'audio/combo-lost.ogg'],
      ['combo-break', 'audio/combo-break.ogg'],
      ['hop-land', 'audio/hop-land.ogg'],
      ['heartbeat', 'audio/heartbeat.ogg'],
      ['beer-sfx', 'audio/beer.ogg'],
      ['pill-end', 'audio/pill-end.ogg'],
      ['mult-up', 'audio/mult-up.ogg'],
      ['na-styk', 'audio/na-styk.ogg'],
      ['przebicie', 'audio/przebicie.ogg'],
      ['moult-pop', 'audio/moult-pop.ogg'],
      ['ability-reward', 'audio/ability-reward.ogg'],
      ...Array.from({ length: 8 }, (_, i): [string, string] => [`combo-tick-${i + 1}`, `audio/combo-tick-${i + 1}.ogg`]),
      // The enemies' sounds load with their art: level 1's come above, the rest with their packs
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
    registerAtlas(this.textures, ATLAS);
    createSpriteAnimations(this);
    createItemAnimations(this);
    this.scene.launch(DEFERRED_LOAD_SCENE);
    // Back from a sign-in that a guest left for from a game over: straight onto that game over, the run claimed for the
    // account there, never by way of the menu. A run that can't be shown (its data lost) goes to the menu, said why
    const back = takeReturnToRun();
    const view = back?.run.view as { score?: unknown; guest?: unknown } | undefined;
    const target = back && typeof view?.score === 'number' && view.guest ? 'GameOverScene' : 'MenuScene';
    if (back && target === 'MenuScene') parkReturnNotice('Nie udało się wrócić do wyniku biegu');
    // No fade of its own: the loading screen stays up until that scene has drawn its first frame, then fades away over it
    sceneManager.enter(this, target, back && target === 'GameOverScene'
      ? { ...back.run.view, returned: { ticket: back.run.ticket, board: back.run.board, signIn: back.signIn, guest: view!.guest } }
      : undefined);
    const loading = loadingScreen();
    if (!loading) return;
    void Promise.all([loading.finish(), this.drawn(target)]).then(() => loading.reveal());
  }

  /** Resolves once the first scene has been drawn twice, and the browser has had a frame to show it. */
  private drawn(key: string): Promise<void> {
    return new Promise((resolve) => {
      let frames = 0;
      const onRender = (): void => {
        if (!this.scene.isActive(key) || ++frames < 2) return;
        this.game.events.off(Phaser.Core.Events.POST_RENDER, onRender);
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      };
      this.game.events.on(Phaser.Core.Events.POST_RENDER, onRender);
      // A scene that never draws must not leave the loading screen up for good
      setTimeout(resolve, 6000);
    });
  }
}
