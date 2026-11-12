/**
 * The bosses a solo run meets, by distance. Plain data with no Phaser, so the versus splash can read it and the
 * schedule can be tested. A boss is only scheduled once it has a fight in fights.ts.
 */
import type { AbilityId } from '../abilities';

export type BossId = 'lodzia' | 'bigos' | 'zlewiatan' | 'eksterminator';

export interface BossDef {
  id: BossId;
  /** On the HP bar. */
  name: string;
  /** Under the name, on the versus splash. */
  epithet: string;
  /** Metres into the run. */
  triggerDistance: number;
  /** The boss's colour on the versus splash: its half of the screen, stripes and streaks, as 0xRRGGBB. */
  accent: number;
  /** The power beating this boss earns in a solo run, or null for none. See systems/abilities.ts. */
  reward: AbilityId | null;
}

export const BOSSES: readonly BossDef[] = [
  { id: 'lodzia', name: 'Pani Lodzia spod Trójki', epithet: 'Raz, a dobrze', triggerDistance: 250, accent: 0xd9578f, reward: 'dash' },
  { id: 'bigos', name: 'DJ Bigos', epithet: 'Król remizy', triggerDistance: 1200, accent: 0x9b5cff, reward: 'gun' },
  { id: 'zlewiatan', name: 'Zlewiatan', epithet: 'Bestia spod Zlewu', triggerDistance: 1800, accent: 0x2fb9a0, reward: 'moult' },
  { id: 'eksterminator', name: 'Eksterminator', epithet: 'Bez faktury taniej', triggerDistance: 2600, accent: 0xd8d03a, reward: null },
];

export function bossById(id: BossId): BossDef {
  return BOSSES.find(b => b.id === id)!;
}

/**
 * The boss to fight now: the nearest one not beaten yet, once the run has reached its distance. One at a time and
 * in order, so a run already past several distances meets them one after another and none is skipped.
 */
export function dueBoss(ladder: readonly BossDef[], distance: number, beaten: ReadonlySet<BossId>): BossDef | null {
  let next: BossDef | null = null;
  for (const boss of ladder) {
    if (!beaten.has(boss.id) && (!next || boss.triggerDistance < next.triggerDistance)) next = boss;
  }
  return next && distance >= next.triggerDistance ? next : null;
}
