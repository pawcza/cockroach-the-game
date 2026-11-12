/** The versus splash's portraits: one texture per fighter, made by tools/art/portraits.py and loaded with the boss assets. */

/** The roach's own portrait, the left side of every splash. */
export const HERO_PORTRAIT = 'karaluch';

export function portraitKey(id: string): string {
  return `portrait-${id}`;
}
