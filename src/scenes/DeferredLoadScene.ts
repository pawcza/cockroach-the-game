import Phaser from 'phaser';
import { ASSET_REV } from './BootScene';
import { BIGOS_ATLAS, BIGOS_TEXTURE } from '../systems/boss/bigosConfig';
import { LODZIA_ATLAS, LODZIA_TEXTURE } from '../systems/boss/lodziaConfig';
import { EKS_ATLAS, EKS_TEXTURE } from '../systems/boss/eksterminatorConfig';
import { portraitKey } from '../systems/boss/portraits';
import { ZLEWIATAN_ATLAS, ZLEWIATAN_TEXTURE } from '../systems/boss/zlewiatanConfig';

export const DEFERRED_LOAD_SCENE = 'DeferredLoadScene';
const LOADED_FLAG = 'deferred-assets-loaded';
export const DEFERRED_LOADED_EVENT = 'deferred-loaded';

const PORTRAIT_MANIFEST = 'portrait-manifest';
const BOSS_IMAGES = ['shell', 'explosion1', 'explosion2', 'explosion3', 'face1', 'face2', 'face3'];
const BOSS_AUDIO: [string, string][] = [
  ['boss-choir', 'choir'],
  ['lodzia-bgm', 'lodzia-bgm'],
  ['bigos-bgm', 'bigos-bgm'],
  ['zlewiatan-bgm', 'zlewiatan-bgm'],
  ['eksterminator-bgm', 'eksterminator-bgm'],
  ['boss-prelude', 'boss-prelude'],
  ['boss-aftermath', 'boss-aftermath'],
  ['boss-beast-ambient', 'beast-ambient'],
];
/** The boss and gun sounds (tools/audio/install.py): key, then the file under boss/sfx. */
const BOSS_SFX: [string, string][] = [
  ['boss-pistol', 'gun'], ['shell-casing', 'shell-casing'], ['bullet-hit', 'bullet-hit'], ['bullet-ricochet', 'bullet-ricochet'],
  ['shot-down', 'shot-down'], ['boss-defeat', 'boss-defeat'], ['boss-victory', 'victory'],
  ['boss-parry', 'boss-parry'],
  ['vs-whoosh', 'vs-whoosh'], ['vs-slam-1', 'vs-slam-1'], ['vs-slam-2', 'vs-slam-2'], ['vs-burst', 'vs-burst'], ['vs-name', 'vs-name'],
  ...['lodzia-whoosh', 'lodzia-slap', 'lodzia-shockwave', 'lodzia-pocket', 'lodzia-spin', 'lodzia-boomerang', 'lodzia-smack',
    'lodzia-stomp', 'lodzia-curler',
    'bigos-thump', 'bigos-charge', 'bigos-blast', 'bigos-beam', 'bigos-wreck', 'bigos-scratch',
    'bigos-bonk', 'bigos-overload', 'bigos-shriek', 'bigos-defeat',
    'zl-gurgle', 'zl-creak', 'zl-slab-launch', 'zl-slab-impact', 'zl-radiator', 'zl-spit', 'zl-splat', 'zl-fishbone',
    'zl-bubble-blow', 'zl-bubble-pop', 'zl-roar', 'zl-drain-away',
    'ex-pump', 'ex-pressure', 'ex-stream', 'ex-lob', 'ex-canister-pop', 'ex-gas', 'ex-tank-ping', 'ex-tank-vent', 'ex-tank-burst',
    'ex-mask', 'ex-knock', 'ex-shove', 'ex-struck', 'ex-mine-arm', 'ex-leak', 'ex-charge', 'ex-rush', 'ex-grenade-bounce', 'ex-whiff',
    'zl-head-fall', 'zl-head-bounce', 'zl-head-smash'].map((k): [string, string] => [k, k]),
];

export function areDeferredAssetsLoaded(game: Phaser.Game): boolean {
  return game.registry.get(LOADED_FLAG) === true;
}

/**
 * Loads everything past level 1 after boot. Levels wait for their textures if the player gets there first.
 * Runs beside the visible scenes because a scene's loader drops its queue when that scene shuts down, and players
 * leave scenes long before a phone has finished downloading.
 */
export class DeferredLoadScene extends Phaser.Scene {
  constructor() {
    super({ key: DEFERRED_LOAD_SCENE, visible: false });
  }

  create(): void {
    // Scene.start() makes a scene visible again, whatever its config said. Left visible, its opaque camera
    // (PixelCameras fills every main camera with the game's background) is drawn over the menu: a purple screen
    this.sys.setVisible(false);
    for (let i = 2; i <= 10; i++) {
      for (const [prefix, dir] of [['sky', 'sky'], ['bg', 'mid'], ['fg', 'fg'], ['floor', 'floor']] as const) {
        this.load.image(`lv${i}-${prefix}`, `levels/${dir}/lv${i}.webp`);
      }
      this.load.audio(`bgm-lv${i}`, `levels/soundtracks/lv${i}.ogg`);
    }

    for (const name of BOSS_IMAGES) this.load.image(`boss-${name}`, `boss/${name}.webp`);
    this.load.atlas(LODZIA_TEXTURE, LODZIA_ATLAS.image + ASSET_REV, LODZIA_ATLAS.json + ASSET_REV);
    this.load.atlas(BIGOS_TEXTURE, BIGOS_ATLAS.image + ASSET_REV, BIGOS_ATLAS.json + ASSET_REV);
    this.load.atlas(EKS_TEXTURE, EKS_ATLAS.image + ASSET_REV, EKS_ATLAS.json + ASSET_REV);
    this.load.atlas(ZLEWIATAN_TEXTURE, ZLEWIATAN_ATLAS.image + ASSET_REV, ZLEWIATAN_ATLAS.json + ASSET_REV);
    for (const [key, file] of BOSS_AUDIO) this.load.audio(key, `boss/${file}.ogg`);
    for (const [key, file] of BOSS_SFX) this.load.audio(key, `boss/sfx/${file}.ogg`);
    for (let i = 1; i <= 6; i++) this.load.audio(`boss-hurt-${i}`, `boss/hurt-${i}.ogg`);
    for (let i = 1; i <= 7; i++) this.load.audio(`boss-cue-${i}`, `boss/boss-cue-${i}.ogg`);

    // The portraits the art script made are listed in a manifest, so a boss still waiting for its portrait asks for nothing
    this.load.json(PORTRAIT_MANIFEST, 'boss/portraits/manifest.json');
    this.load.once(`filecomplete-json-${PORTRAIT_MANIFEST}`, () => {
      const ids: unknown = this.cache.json.get(PORTRAIT_MANIFEST);
      if (!Array.isArray(ids)) return;
      for (const id of ids) if (typeof id === 'string') this.load.image(portraitKey(id), `boss/portraits/${id}.webp`);
    });

    this.load.once('complete', () => {
      this.game.registry.set(LOADED_FLAG, true);
      this.game.events.emit(DEFERRED_LOADED_EVENT);
      this.scene.stop();
    });
    this.load.start();
  }
}
