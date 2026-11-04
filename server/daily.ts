/**
 * Karaluch Dnia: one run a day that everyone plays on the same seed. The day is Warsaw's calendar day. No Node imports,
 * so the client can share these if it ever needs to.
 */

/** A run started just before midnight may finish after it: yesterday still counts this long into today. */
export const DAILY_GRACE_MS = 30 * 60_000;

const WARSAW_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' });

/** The day's name, YYYY-MM-DD. */
export function dailyDate(now: number = Date.now()): string {
  return WARSAW_DAY.format(new Date(now));
}

/** The day's seed: the same for every player, different every day. FNV-1a over the date. */
export function dailySeed(date: string): number {
  let hash = 0x811c9dc5;
  for (const char of `karaluch-dnia:${date}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}

/** Whether a run of this day may still be saved now. */
export function acceptsDaily(date: string, now: number = Date.now()): boolean {
  return date === dailyDate(now) || date === dailyDate(now - DAILY_GRACE_MS);
}
