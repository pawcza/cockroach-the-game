/**
 * Loads the packs of src/config/packs.ts: one pack at a time, the most needed first. A run asks for what it needs before
 * its countdown (ensure) and for what lies ahead at quiet moments (prefetch); between runs the menu streams the rest in
 * the order of need (streamOrder), so a typical player never waits.
 *
 * Frame hitches: an image is fetched and decoded off the main thread (createImageBitmap; Phaser 3.90's loader decodes
 * on the main thread as the texture is uploaded), and the textures go to the GPU one per frame. Sounds go through a
 * Phaser loader (decodeAudioData is off the main thread already). A file that fails is tried again a few times; a pack
 * whose files still fail is settled as failed and asked for again the next time anything needs it.
 */
import Phaser from 'phaser';
import {
  type Asset, BOOT_PACKS, type BossId, type PackId, type PackManifest, type SkinSounds, packAssets, streamOrder,
} from '../config/packs';
import { createSpriteAnimations, registerAtlas } from '../config/sprites';
import { LEVELS } from '../config/levels';
import { ITEMS } from '../config/skins';
import { BIGOS_ATLAS, BIGOS_TEXTURE } from './boss/bigosConfig';
import { BOSSES } from './boss/bosses';
import { EKS_ATLAS, EKS_TEXTURE } from './boss/eksterminatorConfig';
import { LODZIA_ATLAS, LODZIA_TEXTURE } from './boss/lodziaConfig';
import { portraitKey } from './boss/portraits';
import { ZLEWIATAN_ATLAS, ZLEWIATAN_TEXTURE } from './boss/zlewiatanConfig';

/** Emitted on game.events with the pack's id once everything of it that loaded is in (textures, animations, sounds). */
export const PACK_LOADED_EVENT = 'pack-loaded';

const RETRIES = [1000, 4000];

type BossAssets = { atlas?: { key: string; image: string; json: string }; images?: [string, string][]; audio: [string, string][] };

/** The shared fight assets, and each boss's own (key, then the file under public/). */
const BOSS_PACKS: Record<'common' | BossId, BossAssets> = {
  common: {
    // The shell is the run's pistol's bullet too, between the fights
    images: [['boss-shell', 'boss/shell.webp'], ...[1, 2, 3].map((i): [string, string] => [`boss-explosion${i}`, `boss/explosion${i}.webp`]),
      [portraitKey('karaluch'), 'boss/portraits/karaluch.webp']],
    audio: [
      ['boss-choir', 'boss/choir.ogg'], ['boss-prelude', 'boss/boss-prelude.ogg'], ['boss-aftermath', 'boss/boss-aftermath.ogg'],
      ...(['boss-pistol:gun', 'shell-casing', 'bullet-hit', 'bullet-ricochet', 'shot-down', 'boss-defeat', 'boss-victory:victory',
        'boss-parry', 'vs-whoosh', 'vs-slam-1', 'vs-slam-2', 'vs-burst', 'vs-name'].map((k): [string, string] => {
        const [key, file = key] = k.split(':');
        return [key, `boss/sfx/${file}.ogg`];
      })),
    ],
  },
  lodzia: {
    atlas: { key: LODZIA_TEXTURE, ...LODZIA_ATLAS }, images: [[portraitKey('lodzia'), 'boss/portraits/lodzia.webp']],
    audio: [['lodzia-bgm', 'boss/lodzia-bgm.ogg'], ...sfx(['lodzia-whoosh', 'lodzia-slap', 'lodzia-shockwave', 'lodzia-pocket',
      'lodzia-spin', 'lodzia-boomerang', 'lodzia-smack', 'lodzia-stomp', 'lodzia-curler'])],
  },
  bigos: {
    atlas: { key: BIGOS_TEXTURE, ...BIGOS_ATLAS }, images: [[portraitKey('bigos'), 'boss/portraits/bigos.webp']],
    audio: [['bigos-bgm', 'boss/bigos-bgm.ogg'], ...sfx(['bigos-thump', 'bigos-charge', 'bigos-blast', 'bigos-beam', 'bigos-wreck',
      'bigos-scratch', 'bigos-bonk', 'bigos-overload', 'bigos-shriek', 'bigos-defeat'])],
  },
  zlewiatan: {
    atlas: { key: ZLEWIATAN_TEXTURE, ...ZLEWIATAN_ATLAS },
    // His faces are the 'boss' death's picture (the match's fight)
    images: [[portraitKey('zlewiatan'), 'boss/portraits/zlewiatan.webp'],
      ...[1, 2, 3].map((i): [string, string] => [`boss-face${i}`, `boss/face${i}.webp`])],
    audio: [['zlewiatan-bgm', 'boss/zlewiatan-bgm.ogg'], ['boss-beast-ambient', 'boss/beast-ambient.ogg'],
      ...Array.from({ length: 6 }, (_, i): [string, string] => [`boss-hurt-${i + 1}`, `boss/hurt-${i + 1}.ogg`]),
      ...Array.from({ length: 7 }, (_, i): [string, string] => [`boss-cue-${i + 1}`, `boss/boss-cue-${i + 1}.ogg`]),
      ...sfx(['zl-gurgle', 'zl-creak', 'zl-slab-launch', 'zl-slab-impact', 'zl-radiator', 'zl-spit', 'zl-splat', 'zl-fishbone',
        'zl-bubble-blow', 'zl-bubble-pop', 'zl-roar', 'zl-drain-away', 'zl-head-fall', 'zl-head-bounce', 'zl-head-smash'])],
  },
  eksterminator: {
    atlas: { key: EKS_TEXTURE, ...EKS_ATLAS }, images: [[portraitKey('eksterminator'), 'boss/portraits/eksterminator.webp']],
    audio: [['eksterminator-bgm', 'boss/eksterminator-bgm.ogg'], ...sfx(['ex-pump', 'ex-pressure', 'ex-stream', 'ex-lob',
      'ex-canister-pop', 'ex-gas', 'ex-tank-ping', 'ex-tank-vent', 'ex-tank-burst', 'ex-mask', 'ex-knock', 'ex-shove', 'ex-struck',
      'ex-mine-arm', 'ex-leak', 'ex-charge', 'ex-rush', 'ex-grenade-bounce', 'ex-whiff'])],
  },
};

function sfx(keys: string[]): [string, string][] {
  return keys.map(key => [key, `boss/sfx/${key}.ogg`]);
}

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

type Lane = 'art' | 'sound';
const laneOf = (id: PackId): Lane => (id.startsWith('audio-') ? 'sound' : 'art');

/** An image element holding the picture, decoded (or at least loaded) before it is handed on. */
async function decodeAsElement(blob: Blob): Promise<HTMLImageElement> {
  const image = new Image();
  const url = URL.createObjectURL(blob);
  try {
    image.src = url;
    if (typeof image.decode === 'function') await image.decode();
    else await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('decode')); });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export class PackLoader {
  private readonly scene: Phaser.Scene;
  private readonly rev: string;
  private manifest: PackManifest;
  private sounds: Promise<SkinSounds>;
  private ready = new Set<PackId>();
  private failed = new Set<PackId>();
  /** Asked for by a run, most urgent first: before the countdown (ensure), then what lies ahead (prefetch). */
  private urgent: PackId[] = [];
  private ahead: PackId[] = [];
  private stream: PackId[];
  private streaming = true;
  /** One pack at a time per lane: sounds load beside art, so a slow track never holds up the images behind it. */
  private loading: Record<Lane, PackId | null> = { art: null, sound: null };
  private waiters: { ids: PackId[]; resolve: (failed: PackId[]) => void }[] = [];
  /** Textures waiting for the GPU: one goes up per frame. */
  private uploads: (() => void)[] = [];

  constructor(scene: Phaser.Scene, rev: string, manifest: PackManifest, sounds: Promise<SkinSounds>) {
    this.scene = scene;
    this.rev = rev;
    this.manifest = manifest;
    this.sounds = sounds;
    for (const id of BOOT_PACKS) this.ready.add(id);
    this.stream = streamOrder(BOSSES, LEVELS.map(l => l.distanceThreshold), ITEMS.skin.map(s => s.id));
    scene.game.events.on(Phaser.Core.Events.POST_STEP, this.drainUpload, this);
    this.pump();
  }

  isReady(id: PackId): boolean {
    return this.ready.has(id);
  }

  allReady(ids: readonly PackId[]): boolean {
    return ids.every(id => this.ready.has(id));
  }

  /**
   * Loads these before anything else, in this order; resolves once each is in or has failed (after its retries), with
   * the ones that failed. A failed one is tried afresh by the next call that asks for it.
   */
  ensure(ids: readonly PackId[]): Promise<PackId[]> {
    const missing = ids.filter(id => !this.ready.has(id));
    if (missing.length === 0) return Promise.resolve([]);
    for (const id of missing) this.failed.delete(id);
    this.urgent = [...new Set([...missing, ...this.urgent])];
    const promise = new Promise<PackId[]>(resolve => this.waiters.push({ ids: missing, resolve }));
    this.pump();
    return promise;
  }

  /** Loads these after whatever is urgent: what a run will need soon. */
  prefetch(ids: readonly PackId[]): void {
    const missing = ids.filter(id => !this.ready.has(id) && !this.urgent.includes(id));
    for (const id of missing) this.failed.delete(id);
    this.ahead = [...new Set([...this.ahead, ...missing])];
    this.pump();
  }

  /**
   * Between runs the menu streams every pack in the order of need. A run turns it off: then only what the run asks for
   * loads, at its quiet moments, and nothing else starts a download or a decode mid-play.
   */
  setStreaming(on: boolean): void {
    this.streaming = on;
    if (on) this.pump();
  }

  private next(lane: Lane): PackId | null {
    const busy = new Set(Object.values(this.loading));
    const open = (id: PackId): boolean => !this.ready.has(id) && !this.failed.has(id);
    const mine = (id: PackId): boolean => laneOf(id) === lane && !busy.has(id);
    this.urgent = this.urgent.filter(open);
    this.ahead = this.ahead.filter(open);
    return this.urgent.find(mine) ?? this.ahead.find(mine) ?? (this.streaming ? this.stream.find(id => open(id) && mine(id)) ?? null : null);
  }

  private pump(): void {
    for (const lane of ['art', 'sound'] as const) {
      if (this.loading[lane]) continue;
      const id = this.next(lane);
      if (id) this.start(lane, id);
    }
  }

  private start(lane: Lane, id: PackId): void {
    this.loading[lane] = id;
    void this.load(id).then((ok) => {
      this.loading[lane] = null;
      if (ok) this.ready.add(id);
      else this.failed.add(id);
      if (ok) this.scene.game.events.emit(PACK_LOADED_EVENT, id);
      this.settle();
      this.pump();
    });
  }

  private settle(): void {
    this.waiters = this.waiters.filter((waiter) => {
      if (!waiter.ids.every(id => this.ready.has(id) || this.failed.has(id))) return true;
      waiter.resolve(waiter.ids.filter(id => this.failed.has(id)));
      return false;
    });
  }

  private async assetsOf(id: PackId): Promise<Asset[]> {
    const boss = /^boss-(.+)$/.exec(id)?.[1] as keyof typeof BOSS_PACKS | undefined;
    if (boss && BOSS_PACKS[boss]) {
      const pack = BOSS_PACKS[boss];
      return [
        ...(pack.atlas ? [{ kind: 'atlas', ...pack.atlas } as Asset] : []),
        // A portrait not made yet leaves the versus splash its silhouette
        ...(pack.images ?? []).map(([key, url]): Asset => ({ kind: 'image', key, url, optional: key.startsWith('portrait-') })),
        ...pack.audio.map(([key, url]): Asset => ({ kind: 'audio', key, url })),
      ];
    }
    return packAssets(id, this.manifest, await this.sounds) ?? [];
  }

  /** True when every image the pack needs is in (a sound or an optional image that failed is only left out). */
  private async load(id: PackId): Promise<boolean> {
    const assets = await this.assetsOf(id);
    const images = assets.filter(a => a.kind !== 'audio' && !this.scene.textures.exists(a.key));
    const audio = assets.filter((a): a is Extract<Asset, { kind: 'audio' }> => a.kind === 'audio' && !this.scene.cache.audio.exists(a.key));
    const [done] = await Promise.all([
      Promise.all(images.map(a => this.loadImage(a as Exclude<Asset, { kind: 'audio' }>))),
      this.loadAudio(audio),
    ]);
    return done.every((ok, i) => ok || (images[i] as Exclude<Asset, { kind: 'audio' }>).optional === true);
  }

  private async loadImage(asset: Exclude<Asset, { kind: 'audio' }>): Promise<boolean> {
    for (let attempt = 0; ; attempt++) {
      try {
        if (asset.kind === 'atlas') {
          const [bitmap, json] = await Promise.all([
            this.decode(asset.image + this.rev),
            fetch(asset.json + this.rev).then(r => (r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${asset.json}`)))),
          ]);
          await this.upload(() => {
            if (!this.scene.textures.exists(asset.key)) this.scene.textures.addAtlas(asset.key, bitmap as unknown as HTMLImageElement, json);
            registerAtlas(this.scene.textures, asset.key);
            // Its animations at once, not when the rest of the pack is in: an enemy built from these frames must move
            createSpriteAnimations(this.scene);
          });
        } else {
          const bitmap = await this.decode(asset.url);
          await this.upload(() => {
            if (!this.scene.textures.exists(asset.key)) this.scene.textures.addImage(asset.key, bitmap as unknown as HTMLImageElement);
          });
        }
        return true;
      } catch {
        // An optional one that isn't there is not there (a portrait not made yet): no point asking again
        if (attempt >= RETRIES.length || asset.optional) return false;
        await wait(RETRIES[attempt]);
      }
    }
  }

  /**
   * Downloads and decodes an image off the main thread. Premultiplied, as Phaser's WebGL textures are (it asks the GPU
   * to premultiply an image element on upload, which an ImageBitmap ignores). Where createImageBitmap is missing or
   * fails (iOS before 15), an image element decodes it instead, as Phaser's own loader would.
   */
  private async decode(url: string): Promise<ImageBitmap | HTMLImageElement> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new Error(`not an image: ${url}`);
    if (typeof createImageBitmap === 'function') {
      try {
        return await createImageBitmap(blob, { premultiplyAlpha: 'premultiply' });
      } catch {
        // Fall through to the image element
      }
    }
    return decodeAsElement(blob);
  }

  /** Runs `add` on a later frame, one upload per frame, and resolves after it. */
  private upload(add: () => void): Promise<void> {
    return new Promise((resolve, reject) => {
      this.uploads.push(() => {
        try {
          add();
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  private drainUpload(): void {
    this.uploads.shift()?.();
  }

  private loadAudio(assets: Extract<Asset, { kind: 'audio' }>[]): Promise<void> {
    if (assets.length === 0) return Promise.resolve();
    // File by file: the scene's one loader may be busy with the other lane's sounds too, and a pack must not wait for those
    const load = this.scene.load;
    return new Promise((resolve) => {
      const pending = new Set(assets.map(a => a.key));
      const done = (key: string): void => {
        pending.delete(key);
        if (pending.size === 0) finish();
      };
      const onFile = (key: string, type: string): void => { if (type === 'audio') done(key); };
      const onError = (file: Phaser.Loader.File): void => done(file.key);
      // A file that fails to decode settles with the loader's queue
      const finish = (): void => {
        load.off(Phaser.Loader.Events.FILE_COMPLETE, onFile);
        load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
        load.off(Phaser.Loader.Events.COMPLETE, finish);
        resolve();
      };
      load.on(Phaser.Loader.Events.FILE_COMPLETE, onFile);
      load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
      load.on(Phaser.Loader.Events.COMPLETE, finish);
      for (const { key, url } of assets) load.audio(key, url);
      if (!load.isLoading()) load.start();
    });
  }
}

/** A shop skin whose atlas is still to come: loads it first and calls `then` once it is in. Otherwise nothing to do. */
export function withShopSkin(loader: PackLoader | undefined, skin: string | null | undefined, then: () => void): void {
  if (!skin || !loader || loader.isReady(`roach-${skin}`)) return;
  void loader.ensure([`roach-${skin}`]).then(then);
}
