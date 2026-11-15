/** What the achievements page shows for a card or a boss, from the stats and what is earned. Pure, so it can be tested. */
import type { Achievement, Card, Stats } from '../../server/achievements';
import { BOSSES } from './boss/bosses';

export interface Progress {
  /** Levels earned, 0 to `of`. */
  done: number;
  of: number;
  /** The level after the ones earned; undefined once the card is complete. */
  next?: Achievement;
  /** The stat's value now. */
  value: number;
}

/** Where a card stands for these stats and earned achievements. */
export function cardProgress(card: Card, stats: Stats, earned: Record<string, number>): Progress {
  // A level the stats reach is done even before it has been marked earned (the next sync does)
  const done = card.levels.filter(level => earned[level.id] || level.test(stats)).length;
  return { done, of: card.levels.length, next: card.levels[done], value: stats[card.stat] };
}

/** A boss achievement before the player has met the boss shows no name: reaching his distance, or beating him, is meeting him. */
export function bossUnmet(achievement: Achievement, stats: Stats, earned: Record<string, number>): boolean {
  if (!achievement.boss || earned[achievement.id]) return false;
  const boss = BOSSES.find(b => b.id === achievement.boss);
  return boss ? stats.bestDistance < boss.triggerDistance : false;
}

/**
 * A level achievement ("Las Grochodrzew", "Remiza", "Na Księżycu") before the player has been to a level that high shows no
 * name: its title would name a level they haven't seen. Its description ("Dobiegnij do poziomu N") says only the number.
 */
export function levelUnmet(achievement: Achievement, stats: Stats, earned: Record<string, number>): boolean {
  const level = /^poziom-(\d+)$/.exec(achievement.id)?.[1];
  return level !== undefined && !earned[achievement.id] && Number(level) > stats.bestLevel;
}

/** The atlas animation of the icon an achievement shows (tools/art/icons.py ach-*); a frame of it is `<name>_0`. */
export const ICON_FALLBACK = 'ach-star';
/** The picture for what is not shown yet (a boss not met), and for the silhouette's "?" . */
export const ICON_HIDDEN = 'ach-unknown';

const CARD_ICONS: Record<string, string> = {
  jablka: 'apple', dystans: 'shoe', piwa: 'beer', pigulki: 'pill', biegi: 'roach', styk: 'warning', dash: 'bolt',
  strzaly: 'gun', sciany: 'wall', codziennie: 'calendar', misje: 'clipboard', 'bez-konca': 'infinity',
};

const ONE_OFF_ICONS: Record<string, string> = {
  'poziom-4': 'tree', 'poziom-6': 'hydrant', 'poziom-8': 'moon', 'poziom-10': 'eye',
  'piec-tysiecy': 'coin-5k', 'dziesiec-tysiecy': 'coin-10k', bog: 'halo', 'piecdziesiat-tysiecy': 'peak',
  'kombo-30': 'flame', 'kombo-60': 'jar', 'kombo-100': 'cycle',
  'boss-lodzia': 'boss-lodzia', 'boss-bigos': 'boss-bigos', 'boss-zlewiatan': 'boss-zlewiatan', 'boss-eksterminator': 'boss-eksterminator',
  nietykalny: 'shield', 'cztery-bossy': 'medal-4', skroty: 'map', 'wylinka-10': 'shell', kanonada: 'burst', pacyfista: 'peace',
  'trzy-tysiace': 'pin', 'szafa-gra': 'wardrobe', towarzyski: 'chat', 'krol-zjazdu': 'crown',
};

/** The icon (atlas animation name) for an achievement: its card's, or its own; a star for one nobody has drawn yet. */
export function achievementIcon(achievement: Pick<Achievement, 'id' | 'group'>): string {
  const name = achievement.group ? CARD_ICONS[achievement.group] : ONE_OFF_ICONS[achievement.id];
  return name ? `ach-${name}` : ICON_FALLBACK;
}

/** How a card's frame is coloured: nothing earned, then bronze, silver and gold, and its own look once every level is. */
export type Tier = 'none' | 'bronze' | 'silver' | 'gold' | 'max';

export function tierOf(done: number, of: number): Tier {
  if (done <= 0) return 'none';
  if (done >= of) return 'max';
  return done === 1 ? 'bronze' : done === 2 ? 'silver' : 'gold';
}
