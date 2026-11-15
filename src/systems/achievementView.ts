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
