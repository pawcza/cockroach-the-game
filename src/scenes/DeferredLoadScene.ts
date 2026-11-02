import Phaser from 'phaser';

export const DEFERRED_LOAD_SCENE = 'DeferredLoadScene';
const LOADED_FLAG = 'deferred-assets-loaded';
export const DEFERRED_LOADED_EVENT = 'deferred-loaded';

const BOSS_IMAGES = ['gun', 'shell', 'bomb', 'creamcake', 'explosion1', 'explosion2', 'explosion3', 'face1', 'face2', 'face3'];
const BOSS_AUDIO: [string, string][] = [
  ['boss-choir', 'choir'],
  ['boss-pistol', 'pistol'],
  ['boss-bomb-shot', 'bomb-shot'],
  ['boss-creamcake-shot', 'creamcake-shot'],
  ['boss-explosion', 'explosion'],
  ['boss-victory', 'victory'],
  ['boss-bgm', 'boss-bgm'],
  ['boss-beast-ambient', 'beast-ambient'],
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
    for (let i = 2; i <= 10; i++) {
      for (const [prefix, dir] of [['sky', 'sky'], ['bg', 'mid'], ['fg', 'fg'], ['floor', 'floor']] as const) {
        this.load.image(`lv${i}-${prefix}`, `levels/${dir}/lv${i}.webp`);
      }
      this.load.audio(`bgm-lv${i}`, `levels/soundtracks/lv${i}.ogg`);
    }

    for (const name of BOSS_IMAGES) this.load.image(`boss-${name}`, `boss/${name}.webp`);
    for (const [key, file] of BOSS_AUDIO) this.load.audio(key, `boss/${file}.ogg`);
    for (let i = 1; i <= 6; i++) this.load.audio(`boss-hurt-${i}`, `boss/hurt-${i}.ogg`);
    for (let i = 1; i <= 7; i++) this.load.audio(`boss-cue-${i}`, `boss/boss-cue-${i}.ogg`);

    this.load.once('complete', () => {
      this.game.registry.set(LOADED_FLAG, true);
      this.game.events.emit(DEFERRED_LOADED_EVENT);
      this.scene.stop();
    });
    this.load.start();
  }
}
