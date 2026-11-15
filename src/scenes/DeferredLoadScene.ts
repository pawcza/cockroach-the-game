import Phaser from 'phaser';
import { ASSET_REV, PACKS_KEY } from './BootScene';
import type { PackManifest, SkinSounds } from '../config/packs';
import { PackLoader } from '../systems/PackLoader';
import { SKIN_SOUNDS_KEY } from '../objects/obstacles/look';

export const DEFERRED_LOAD_SCENE = 'DeferredLoadScene';
const LOADER_KEY = 'pack-loader';

/** The enemy skins' own sounds (public/audio/skins/manifest.json); none while that file isn't there. */
async function skinSounds(): Promise<SkinSounds> {
  try {
    const response = await fetch('audio/skins/manifest.json');
    if (!response.ok || !(response.headers.get('content-type') ?? '').includes('json')) return {};
    const sounds: unknown = await response.json();
    return typeof sounds === 'object' && sounds !== null && !Array.isArray(sounds) ? sounds as SkinSounds : {};
  } catch {
    return {};
  }
}

/** The game's one pack loader (systems/PackLoader.ts), made when boot is done. */
export function packs(game: Phaser.Game): PackLoader {
  return game.registry.get(LOADER_KEY) as PackLoader;
}

/**
 * Hosts the pack loader: everything past what boot loads comes through it. A scene of its own, running beside the
 * visible ones, because a scene's loader drops its queue when that scene shuts down, and players leave scenes long
 * before a phone has finished downloading.
 */
export class DeferredLoadScene extends Phaser.Scene {
  constructor() {
    super({ key: DEFERRED_LOAD_SCENE, visible: false });
  }

  create(): void {
    // Scene.start() makes a scene visible again, whatever its config said. Left visible, its opaque camera
    // (PixelCameras fills every main camera with the game's background) is drawn over the menu: a purple screen
    this.sys.setVisible(false);
    const read = this.cache.json.get(PACKS_KEY) as Partial<PackManifest> & { skins?: Record<string, string | string[]> };
    // A skins entry as one sheet or several; no list of baked skins: none
    const manifest: PackManifest = {
      core: read.core ?? 'sprites', enemies: read.enemies ?? {}, roach: read.roach ?? {}, baked: read.baked ?? [],
      skins: Object.fromEntries(Object.entries(read.skins ?? {}).map(([level, paths]) => [level, ([] as string[]).concat(paths)])),
    };
    const sounds = skinSounds().then((list) => {
      this.cache.json.add(SKIN_SOUNDS_KEY, list);
      return list;
    });
    this.game.registry.set(LOADER_KEY, new PackLoader(this, ASSET_REV, manifest, sounds));
  }
}
