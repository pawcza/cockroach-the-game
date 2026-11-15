/**
 * What an enemy looks and sounds like in its slot, and what it kills as: its level skin (cast.ts skinFor) when that
 * skin's art is loaded, otherwise itself, exactly as it would be with no skins at all. The spawn files ask here for the
 * art of each part and the sound of each event instead of naming them, so a skin is data.
 */
import Phaser from 'phaser';
import { framesOf, hasFrame } from '../../config/sprites';
import { COCKROACH_START_X } from '../../config/constants';
import { levelNumberAt } from '../../config/levels';
import type { EnemyPlan } from './behaviours';
import {
  CODE_COLORS, ENEMIES, ENEMY_SOUNDS, type CodeColor, type EnemyId, type SkinDef, placeOf, skinArt, skinBaked, skinFor, soundStem,
} from './cast';

/** Where the skins' own sounds are listed (DeferredLoadScene loads it into the json cache under this key). */
export const SKIN_SOUNDS_KEY = 'skin-sounds';

export interface EnemyLook {
  /** The skin showing, or null for the enemy itself. */
  skin: SkinDef | null;
  /** The view that draws it: its own spawn file's, or the one of the enemy whose look it borrows (cast.ts BORROWED). */
  view: EnemyId;
  /** Its death cause: the skin's id, the borrowed enemy's, or its own. */
  cause: string;
  /** The animation to show for one of its base animations ('hen-head' is 'lv5-goose/hen-head' for the goose). */
  anim(base: string): string;
  /** The sound to play for one of its base sounds, by the game's audio keys. */
  sound(base: string): string;
  /** Where its picture sits: its base's (cast.ts placeOf). */
  place: { dx: number; dy: number; size: number };
  /** The colour of something its base draws in code (cast.ts CODE_COLORS): the skin's own, or the base's. */
  color(part: CodeColor): number;
  /** Whether it draws that part at all (a skin may leave one out: SkinColors null). */
  draws(part: CodeColor): boolean;
}

/** The level of the slot a plan stands in (11, 12, ... past the Eksterminator). */
export const levelOfPlan = (plan: Pick<EnemyPlan, 'x'>): number =>
  levelNumberAt(Math.floor((plan.x - COCKROACH_START_X) / 50));

const own = (id: EnemyId, view: EnemyId, cause: string): EnemyLook => ({
  skin: null, view, cause, anim: base => base, sound: base => base, place: placeOf(id), color: part => CODE_COLORS[part], draws: () => true,
});

/** Dev only, `?noskins`: every enemy as itself, to hold a skin up against its base. Looks only: the run is the same. */
const NO_SKINS = import.meta.env.DEV && new URLSearchParams(window.location.search).has('noskins');

/** The look of an enemy planned at this slot, given what is loaded now. */
export function lookOf(scene: Phaser.Scene, plan: EnemyPlan): EnemyLook {
  const id = plan.id as EnemyId;
  // In an endless level the skin comes from the run's look seed (GameScene keeps it in the scene's data) and the slot
  const seed = scene.data?.get('lookSeed') as number | undefined;
  const { skin, as } = NO_SKINS ? { skin: null, as: null } : skinFor(id, levelOfPlan(plan), { seed: seed ?? 0, x: plan.x });
  if (as) {
    const art = ENEMIES[as].art;
    return hasFrame(`${art}_0`) ? own(id, as, ENEMIES[as].type) : own(id, id, ENEMIES[id].type);
  }
  if (!skin || !skinBaked(skin, framesOf, hasFrame)) return own(id, id, ENEMIES[id].type);
  // Its sounds are decided now, once: its own where the skin has one and it is loaded, the base's otherwise
  const listed = (scene.cache.json.get(SKIN_SOUNDS_KEY) as Record<string, Record<string, string>> | undefined)?.[skin.id];
  const sounds = new Map<string, string>();
  for (const base of ENEMY_SOUNDS[id] ?? []) {
    const mine = listed?.[soundStem(base)];
    if (mine && scene.cache.audio.exists(mine)) sounds.set(base, mine);
  }
  return {
    skin,
    view: id,
    cause: skin.id,
    anim: base => (hasFrame(`${skinArt(skin.id, base)}_0`) ? skinArt(skin.id, base) : base),
    sound: base => sounds.get(base) ?? base,
    place: placeOf(id),
    color: part => skin.colors?.[part] ?? CODE_COLORS[part],
    draws: part => skin.colors?.[part] !== null,
  };
}
