/**
 * The game's assets in packs, and which packs a moment of the game needs. Phaser-free: systems/PackLoader.ts loads them.
 *
 * THE RULE: nothing that decides the game waits on, or changes with, what has loaded (the course, the enemies and
 * pickups that exist, hitboxes, the run's level, timing). Loading only changes what things look and sound like, or holds
 * the START of a run (with a way out). So every enemy's base art is required before any run starts: from then on every
 * slot of the course can always be built. (One older exception stands: a boss's fight waits for its own art,
 * systems/boss/fights.ts fightReady.)
 *
 * Boot loads what the menu needs (BootScene): the core atlas (menus, the plain roach, pickups, buttons), the effects and
 * level 1's images. The rest comes in packs, the menu streaming them in this order of need:
 *   enemies-N       the base art of the enemies that first appear in level N (tools/art/bake.py ENEMY_TIER): ~200 KB
 *                   for all ten, each enemy once, all required before a run, so streamed first
 *   enemies-legacy  art no run reaches any more (old records, the hand-held swatters), with its enemies' sounds:
 *                   streamed last
 *   level-N         level N's images: what a run starting in level N waits for, and what its look switches on
 *   skins-N         level N's baked enemy skins (one or more sheets): until they are in, those enemies look like their base
 *   audio-N         level N's music, the base sounds of the enemies that first appear in it, its baked skins' sounds;
 *                   never waited for: a sound not in yet is silent, a track not in yet leaves the last one playing
 *   boss-common     what every fight shares (the choir, the pistol, the splash's sounds); boss-<id> one boss's own
 *   roach-<skin>    one shop skin of the roach
 */
import { BOSS_TRIGGER_DISTANCE } from '../../server/bossDistances';
import type { SkinId } from '../../server/enemySkins';
import { ENEMIES, ENEMY_SOUNDS, type EnemyId, MAX_CAST_LEVEL, SKINS, firstLevelOf, soundStem } from '../objects/obstacles/cast';

export type BossId = keyof typeof BOSS_TRIGGER_DISTANCE;
export type PackId =
  | `enemies-${number}` | 'enemies-legacy' | `level-${number}` | `skins-${number}` | `audio-${number}`
  | 'boss-common' | `boss-${BossId}` | `roach-${string}`;

/** What tools/art/bake.py wrote (assets/packs.json): atlas paths under assets/, without the extension. */
export interface PackManifest {
  core: string;
  enemies: Record<string, string>;
  /** Per level, its skins' sheets. */
  skins: Record<string, string[]>;
  roach: Record<string, string>;
  /** The skins whose art is baked whole: only theirs have their own sounds asked for. */
  baked: string[];
}

/** public/audio/skins/manifest.json: per skin, the base sound's stem (soundStem) to its own file's name. */
export type SkinSounds = Record<string, Record<string, string>>;

/**
 * An atlas's files are versioned with ASSET_REV by the loader; the rest keep their names. An optional image that fails
 * leaves its pack ready all the same (a skins sheet: those enemies show as themselves; a boss portrait not made yet).
 */
export type Asset =
  | { kind: 'atlas'; key: string; image: string; json: string; optional?: boolean }
  | { kind: 'image'; key: string; url: string; optional?: boolean }
  | { kind: 'audio'; key: string; url: string };

export const LAST_LEVEL = MAX_CAST_LEVEL;

/** The texture an atlas of the manifest loads as. */
export const atlasKey = (path: string): string => `pack-${path.replace(/\//g, '-')}`;

const clampLevel = (level: number): number => Math.min(Math.max(1, Math.floor(level)), LAST_LEVEL);

/** Every enemy's base art: what any run needs before it starts, whatever level it starts in. */
export const RUN_ENEMIES: readonly PackId[] = Array.from({ length: LAST_LEVEL }, (_, i): PackId => `enemies-${i + 1}`);

/** What a level shows of its own: its images, its skins, its sound. */
export function levelLook(level: number): PackId[] {
  const n = clampLevel(level);
  return [`level-${n}`, `skins-${n}`, `audio-${n}`];
}

/**
 * What the endless levels past the Eksterminator can show: each wears a story level's look and music, and any enemy may
 * wear any level's skin, so every level's images, skins and sound. Asked for ahead (aheadNeeds, startPlan), never waited
 * for in a run: a look not in yet leaves the last one showing, a skin not in yet shows its enemy as itself.
 */
export const ENDLESS_LOOKS: readonly PackId[] = Array.from({ length: LAST_LEVEL }, (_, i) => levelLook(i + 1)).flat();

/** Which story level's look a level wears: itself, or for an endless level the one it borrows (levels.ts endlessLook). */
type LookOf = (level: number) => number;
const ownLook: LookOf = level => level;

export function bossNeeds(boss: BossId | null): PackId[] {
  return boss ? ['boss-common', `boss-${boss}`] : [];
}

/** The first boss of the ladder still ahead of this distance (metres), or null. */
export function nextBossAfter(distance: number, ladder: readonly { id: BossId; triggerDistance: number }[]): BossId | null {
  let next: { id: BossId; triggerDistance: number } | null = null;
  for (const boss of ladder) {
    if (boss.triggerDistance > distance && (!next || boss.triggerDistance < next.triggerDistance)) next = boss;
  }
  return next?.id ?? null;
}

const unique = (ids: PackId[]): PackId[] => [...new Set(ids)];

/** How long a run start waits for the worn shop skin once the rest is in, ms; past it the plain roach runs until it lands. */
export const SKIN_GRACE_MS = 1500;

export interface StartPlan {
  /** Waited for: the run cannot start without them. */
  required: PackId[];
  /** Waited for at most SKIN_GRACE_MS once `required` is in. */
  grace: PackId[];
  /** Asked for at the same moment, never waited for. */
  soon: PackId[];
}

/**
 * What a run start needs. Solo, daily and from a checkpoint: every enemy's base art and the start level's images, the
 * worn shop skin within a grace period; its music, skins, the next level and the next boss come as they come. A match
 * never waits once it has started: what it requires is in before a player can be ready in the lobby (matchRequires).
 */
export function startPlan(start: { level: number; nextBoss: BossId | null; wornSkin: string | null; otherSkins?: readonly string[];
  match?: boolean; look?: LookOf }): StartPlan {
  const look = start.look ?? ownLook;
  const level = clampLevel(look(start.level));
  const required = start.match ? [...matchRequires()] : unique([...RUN_ENEMIES, `level-${level}`]);
  return {
    required,
    grace: start.match || !start.wornSkin ? [] : [`roach-${start.wornSkin}`],
    soon: unique([
      ...(start.match && start.wornSkin ? [`roach-${start.wornSkin}` as PackId] : []),
      ...levelLook(level), ...levelLook(look(start.level + 1)), ...bossNeeds(start.nextBoss),
      ...(start.otherSkins ?? []).map((skin): PackId => `roach-${skin}`),
      // A start in the endless levels (after the Eksterminator) has all of them ahead
      ...(start.level > LAST_LEVEL ? ENDLESS_LOOKS : []),
    ]).filter(id => !required.includes(id)),
  };
}

/** What a player needs loaded before they can be ready for a match: every enemy's base art, and level 1 (in boot). */
export function matchRequires(): PackId[] {
  return [...RUN_ENEMIES, 'level-1'];
}

/**
 * What a run keeps loading ahead of where it is: its own level's look, the next two levels' and the next boss. From level
 * 10 on (its stretch, the Eksterminator's, the endless levels) everything the endless levels can show, after those.
 */
export function aheadNeeds(level: number, nextBoss: BossId | null, look: LookOf = ownLook): PackId[] {
  return unique([...levelLook(look(level)), ...levelLook(look(level + 1)), ...levelLook(look(level + 2)), ...bossNeeds(nextBoss),
    ...(level >= LAST_LEVEL ? ENDLESS_LOOKS : [])]);
}

/**
 * The order the menu streams packs in, while the player is not in a run: by need, so a typical player never waits. Every
 * enemy's base art first (a run needs it all), level 1's sound, then each level in turn with the boss that waits at its
 * door, the bosses past the last level, the art no run reaches, and the shop skins (the wardrobe asks for them itself).
 */
export function streamOrder(ladder: readonly { id: BossId; triggerDistance: number }[], levelStarts: readonly number[],
  shopSkins: readonly string[]): PackId[] {
  const order: PackId[] = [...RUN_ENEMIES, 'audio-1'];
  for (let level = 2; level <= LAST_LEVEL; level++) {
    const start = levelStarts[level - 1] ?? Infinity;
    const end = levelStarts[level] ?? Infinity;
    order.push(`level-${level}`, `skins-${level}`, `audio-${level}`);
    // The boss met at the end of this level's stretch comes right after it (Lodzia, at level 3's door, after level 2)
    for (const boss of ladder) if (boss.triggerDistance > start && boss.triggerDistance <= end) order.push(...bossNeeds(boss.id));
  }
  for (const boss of ladder) order.push(...bossNeeds(boss.id));
  order.push('skins-1', 'enemies-legacy', ...shopSkins.map((skin): PackId => `roach-${skin}`));
  return unique(order).filter(id => !BOOT_PACKS.includes(id));
}

/** The packs boot loads itself. */
export const BOOT_PACKS: readonly PackId[] = ['level-1'];

const enemySounds = (ids: EnemyId[]): string[] => [...new Set(ids.flatMap(id => ENEMY_SOUNDS[id] ?? []))];

/** Sound key, and its file under public/. */
export const soundAsset = (key: string): Asset => ({ kind: 'audio', key, url: `audio/${soundStem(key)}.ogg` });

/** The enemies whose base sounds load with a level's audio (null: none, the legacy ones). */
export function enemiesOfTier(tier: number | null): EnemyId[] {
  return (Object.keys(ENEMIES) as EnemyId[]).filter(id => firstLevelOf(id) === tier);
}

/** A skin's own sounds, by the audio key each loads as. */
export function skinSoundKeys(skin: SkinId, sounds: SkinSounds): string[] {
  return Object.values(sounds[skin] ?? {}).filter(name => /^[a-z0-9-]+$/.test(name));
}

/** The files of a level, enemy, skins, audio or shop-skin pack (the bosses' are the loader's, with their fights). */
export function packAssets(id: PackId, manifest: PackManifest, sounds: SkinSounds): Asset[] | null {
  const atlas = (path: string | undefined): Asset[] =>
    (path ? [{ kind: 'atlas', key: atlasKey(path), image: `assets/${path}.webp`, json: `assets/${path}.json` }] : []);
  const [, kind, arg] = /^([a-z]+)-(.+)$/.exec(id) ?? [];
  const level = Number(arg);
  switch (kind) {
    case 'enemies':
      // The legacy art brings its enemies' sounds along (they first appear in no level, so no audio-N has them)
      return arg === 'legacy'
        ? [...atlas(manifest.enemies.legacy), ...enemySounds(enemiesOfTier(null)).map(soundAsset)]
        : atlas(manifest.enemies[level]);
    case 'level':
      return (['sky', 'bg', 'fg', 'floor'] as const).map((prefix, i): Asset => ({
        kind: 'image', key: `lv${level}-${prefix}`, url: `levels/${['sky', 'mid', 'fg', 'floor'][i]}/lv${level}.webp`,
      }));
    case 'skins':
      return (manifest.skins[level] ?? []).flatMap(path => atlas(path).map(a => ({ ...a, optional: true })));
    case 'audio': {
      const baked = (Object.keys(SKINS) as SkinId[]).filter(skin => SKINS[skin].level === level && manifest.baked.includes(skin));
      return [
        { kind: 'audio', key: `bgm-lv${level}`, url: `levels/soundtracks/lv${level}.ogg` },
        ...enemySounds(enemiesOfTier(level)).map(soundAsset),
        ...baked.flatMap(skin => skinSoundKeys(skin, sounds)).map((key): Asset => ({ kind: 'audio', key, url: `audio/skins/${key}.ogg` })),
      ];
    }
    case 'roach':
      return atlas(manifest.roach[arg]);
    default:
      return null;
  }
}
