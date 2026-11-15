/**
 * The achievements, shared: the client earns them from your stats as you play, the server pays their okruszki once
 * per account when the stats it's sent reach them. Also imported by the client, so no Node imports here.
 *
 * A counting achievement comes as a card: one name, several levels, each level an ordinary achievement of its own (own
 * id, own reward, paid once) that shares the card's `group`. So the server's pay-once-per-id needs nothing more.
 */

export interface Stats {
  runs: number;
  /** Metres, all runs together. */
  distance: number;
  apples: number;
  beers: number;
  pills: number;
  nearMisses: number;
  dashThroughs: number;
  wallsBroken: number;
  /** Enemies shot down, all runs together (the pistol, from level 7). */
  kills: number;
  dailyRuns: number;
  matches: number;
  matchWins: number;
  seconds: number;
  bestScore: number;
  bestDistance: number;
  bestLevel: number;
  bestCombo: number;
  /**
   * How many boss checkpoints are unlocked (src/systems/checkpoints.ts): bosses fall in order, so it is always the first
   * few. Kept as a stat so it merges like the bests (the larger) and follows the account.
   */
  checkpoints: number;
  /** Times each boss has been beaten, in solo and daily runs that count (BossEncounter): see BOSS_WINS. */
  lodziaWins: number;
  bigosWins: number;
  zlewiatanWins: number;
  eksterminatorWins: number;
  /** Boss fights won without being hit (the moult's absorbed hit is one). */
  noHitBossWins: number;
  /** Runs that beat all four bosses, started from 0 m. */
  allBossRuns: number;
  /** Hits the moult has taken instead of the roach, all runs together. */
  moultSaves: number;
  /** The most enemies shot in one run. */
  bestKills: number;
  /** Runs that went from level 7 to level 9 with the pistol in hand and not one shot fired. */
  pacifistRuns: number;
  /** Missions finished. The server keeps the record: it pays from its own count (economy.ts payAchievements), never this. */
  missionsDone: number;
  /** Shop items owned. Same: the server's own count is the one paid on. */
  itemsOwned: number;
}

export interface Achievement {
  id: string;
  /** The card's name for a level of one (the level is added: achievementTitle). */
  name: string;
  description: string;
  /** Okruszki, paid once. */
  reward: number;
  test: (stats: Stats) => boolean;
  /** A level of a card: the card's id, the level (1 for the first) and the stat and number it takes. */
  group?: string;
  level?: number;
  stat?: keyof Stats;
  at?: number;
  /** Beating this boss (a BossId): not to be named on the page before the player has met him. */
  boss?: string;
}

export interface Card {
  id: string;
  name: string;
  stat: keyof Stats;
  /** A number of this card's stat as the page shows it. */
  format: (n: number) => string;
  /** In rising order: level 1 first. */
  levels: Achievement[];
}

/** A profile as the browser and the account both keep it: stat → number, achievement id → when it was earned (ms). */
export interface ProfileCopy {
  stats: Record<string, number>;
  achievements: Record<string, number>;
}

/**
 * Two copies of one profile, merged without losing anything either has: the larger of every number, and every
 * achievement with the earlier time. Stats only ever grow. Used by the browser to fold in the account's copy and by the
 * server to fold a save into the stored one, so a client that doesn't know a newer stat can't erase it.
 */
export function mergeProfileCopies(a: ProfileCopy, b: Partial<ProfileCopy> | null | undefined): ProfileCopy {
  const stats = { ...a.stats };
  for (const [key, value] of Object.entries(b?.stats ?? {})) {
    if (typeof value === 'number') stats[key] = Math.max(stats[key] ?? 0, value);
  }
  const achievements = { ...a.achievements };
  for (const [id, at] of Object.entries(b?.achievements ?? {})) {
    if (typeof at === 'number') achievements[id] = achievements[id] ? Math.min(achievements[id], at) : at;
  }
  return { stats, achievements };
}

/** A whole number with a space between the thousands: 10 000. */
export function spaced(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Kilometres to a tenth, rounded down: progress never reads as the goal before it is reached. */
const km = (metres: number): string => `${Math.floor(metres / 100) / 10} km`;

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

/** "Sadownik II" for a level, the plain name for anything else. */
export function achievementTitle(achievement: Pick<Achievement, 'name' | 'level'>): string {
  return achievement.level ? `${achievement.name} ${ROMAN[achievement.level - 1]}` : achievement.name;
}

interface CardSpec {
  id: string;
  name: string;
  stat: keyof Stats;
  describe: (n: number) => string;
  format?: (n: number) => string;
  /** [number to reach, okruszki, id]: an id kept from before where the level was already an achievement. */
  levels: [number, number, string][];
}

function card(spec: CardSpec): Card {
  const format = spec.format ?? spaced;
  return {
    id: spec.id,
    name: spec.name,
    stat: spec.stat,
    format,
    levels: spec.levels.map(([at, reward, id], i) => ({
      id, name: spec.name, description: spec.describe(at), reward,
      group: spec.id, level: i + 1, stat: spec.stat, at,
      test: (s: Stats) => s[spec.stat] >= at,
    })),
  };
}

/**
 * The cards. Ids that were achievements before keep their threshold, reward and id, so whoever earned one still has it
 * and is never paid twice: sadownik, piwosz, pigularz, na-styk, przebijak, sciana, maraton, wytrwaly and dnia.
 */
export const CARDS: Card[] = [
  card({
    id: 'jablka', name: 'Sadownik', stat: 'apples', describe: n => `Zjedz ${spaced(n)} jabłek`,
    levels: [[500, 50, 'jablka-1'], [3000, 150, 'sadownik'], [10000, 350, 'jablka-3'], [30000, 800, 'jablka-4']],
  }),
  card({
    id: 'dystans', name: 'Maratończyk', stat: 'distance', describe: n => `Przebiegnij łącznie ${km(n)}`, format: km,
    levels: [[10000, 50, 'dystans-1'], [42000, 300, 'maraton'], [100000, 500, 'dystans-3'], [250000, 800, 'dystans-4']],
  }),
  card({
    id: 'piwa', name: 'Piwosz', stat: 'beers', describe: n => `Wypij ${n} piw`,
    levels: [[50, 40, 'piwa-1'], [200, 100, 'piwosz'], [750, 200, 'piwa-3']],
  }),
  card({
    id: 'pigulki', name: 'Pigularz', stat: 'pills', describe: n => `Zjedz ${n} pigułek`,
    levels: [[10, 40, 'pigulki-1'], [30, 100, 'pigularz'], [100, 200, 'pigulki-3']],
  }),
  card({
    id: 'biegi', name: 'Wytrwały', stat: 'runs', describe: n => `Zagraj ${n} biegów`,
    levels: [[25, 40, 'biegi-1'], [100, 150, 'wytrwaly'], [300, 300, 'biegi-3']],
  }),
  card({
    id: 'styk', name: 'Na styk', stat: 'nearMisses', describe: n => `${n} razy na styk`,
    levels: [[25, 40, 'styk-1'], [100, 100, 'na-styk'], [500, 200, 'styk-3']],
  }),
  card({
    id: 'dash', name: 'Przebijak', stat: 'dashThroughs', describe: n => `Przebij dashem ${n} przeszkód`,
    levels: [[25, 40, 'dash-1'], [100, 100, 'przebijak'], [500, 200, 'dash-3']],
  }),
  card({
    id: 'strzaly', name: 'Rewolwerowiec', stat: 'kills', describe: n => `Zestrzel ${n} wrogów`,
    levels: [[25, 40, 'strzaly-1'], [100, 120, 'strzaly-2'], [500, 300, 'strzaly-3']],
  }),
  card({
    id: 'sciany', name: 'Ściana płaczu', stat: 'wallsBroken', describe: n => `Przebij ${n} ścian`,
    levels: [[10, 40, 'sciany-1'], [25, 120, 'sciana'], [100, 250, 'sciany-3']],
  }),
  card({
    id: 'codziennie', name: 'Karaluch co dzień', stat: 'dailyRuns', describe: n => `Zagraj ${n} razy w Karalucha Dnia`,
    levels: [[3, 40, 'codziennie-1'], [7, 100, 'dnia'], [30, 200, 'codziennie-3']],
  }),
  card({
    id: 'misje', name: 'Na posyłki', stat: 'missionsDone', describe: n => `Wykonaj ${n} misji`,
    levels: [[10, 50, 'misje-1'], [50, 150, 'misje-2'], [150, 350, 'misje-3']],
  }),
  // The endless levels past the Eksterminator (11 from 2600 m, one more every 500 m)
  card({
    id: 'bez-konca', name: 'Bez trzymanki', stat: 'bestLevel', describe: n => `Dobiegnij do poziomu ${n}`,
    levels: [[15, 100, 'bez-konca-1'], [20, 250, 'bez-konca-2'], [25, 400, 'bez-konca-3']],
  }),
];

/** The stat each boss's win is counted in, for the profile and the page. */
export const BOSS_WINS: Record<string, keyof Stats> = {
  lodzia: 'lodziaWins',
  bigos: 'bigosWins',
  zlewiatan: 'zlewiatanWins',
  eksterminator: 'eksterminatorWins',
};

function oneOff(id: string, name: string, description: string, reward: number, test: Achievement['test'], boss?: string): Achievement {
  return { id, name, description, reward, test, ...(boss ? { boss } : {}) };
}

/**
 * None for showing up: every one takes a good run or a long while. Descriptions stay within about 40 characters: that is
 * what the in-run toast (ui/shared.ts) holds on one line.
 */
export const ONE_OFFS: Achievement[] = [
  oneOff('poziom-4', 'Las Grochodrzew', 'Dobiegnij do poziomu 4', 60, s => s.bestLevel >= 4),
  oneOff('poziom-6', 'Remiza', 'Dobiegnij do poziomu 6', 120, s => s.bestLevel >= 6),
  oneOff('poziom-8', 'Na Księżycu', 'Dobiegnij do poziomu 8', 200, s => s.bestLevel >= 8),
  oneOff('poziom-10', 'Widzi wszystko', 'Dobiegnij do poziomu 10', 400, s => s.bestLevel >= 10),
  oneOff('piec-tysiecy', 'Pięć tysięcy', '5000 punkciorów w biegu', 100, s => s.bestScore >= 5000),
  oneOff('dziesiec-tysiecy', 'Dycha', '10 000 punkciorów w biegu', 200, s => s.bestScore >= 10000),
  oneOff('bog', 'Karaluch jest bogiem', '20 000 punkciorów w biegu', 400, s => s.bestScore >= 20000),
  oneOff('piecdziesiat-tysiecy', 'Wyżej się nie da', '50 000 punkciorów w biegu', 400, s => s.bestScore >= 50000),
  oneOff('kombo-30', 'Szaleństwo', 'Kombo x30', 100, s => s.bestCombo >= 30),
  oneOff('kombo-60', 'Turbokompot', 'Kombo x60', 250, s => s.bestCombo >= 60),
  oneOff('kombo-100', 'Perpetuum mobile', 'Kombo x100', 400, s => s.bestCombo >= 100),
  oneOff('boss-lodzia', 'Wypraszam sobie', 'Pokonaj Panią Lodzię spod Trójki', 60, s => s.lodziaWins >= 1, 'lodzia'),
  oneOff('boss-bigos', 'Cisza w remizie', 'Pokonaj DJ Bigosa', 120, s => s.bigosWins >= 1, 'bigos'),
  oneOff('boss-zlewiatan', 'Drożny odpływ', 'Pokonaj Zlewiatana', 200, s => s.zlewiatanWins >= 1, 'zlewiatan'),
  oneOff('boss-eksterminator', 'Bez faktury', 'Pokonaj Eksterminatora', 300, s => s.eksterminatorWins >= 1, 'eksterminator'),
  oneOff('nietykalny', 'Nietykalny', 'Pokonaj bossa bez trafienia, wylinka też', 250, s => s.noHitBossWins >= 1),
  oneOff('cztery-bossy', 'Wszystkie cztery', 'Pokonaj 4 bossów w jednym biegu od 0 m', 400, s => s.allBossRuns >= 1),
  oneOff('skroty', 'Mapa skrótów', 'Odblokuj wszystkie 4 starty od bossów', 100, s => s.checkpoints >= 4),
  oneOff('wylinka-10', 'Pancerz na zmianę', 'Wylinka ratuje cię 10 razy', 100, s => s.moultSaves >= 10),
  oneOff('kanonada', 'Kanonada', 'Zestrzel 15 wrogów w jednym biegu', 100, s => s.bestKills >= 15),
  oneOff('pacyfista', 'Pokojowe zamiary', 'Poziom 7 do 9 bez strzału w biegu', 250, s => s.pacifistRuns >= 1),
  oneOff('trzy-tysiace', 'Poza mapą', 'Dobiegnij do 3000 m w jednym biegu', 200, s => s.bestDistance >= 3000),
  oneOff('szafa-gra', 'Szafa gra', 'Miej 10 rzeczy ze sklepu', 150, s => s.itemsOwned >= 10),
  oneOff('towarzyski', 'Towarzyski', 'Zagraj 10 zjazdów z innymi', 100, s => s.matches >= 10),
  oneOff('krol-zjazdu', 'Król zjazdu', 'Wygraj 5 zjazdów', 200, s => s.matchWins >= 5),
];

/** Every achievement, the cards' levels first. */
export const ACHIEVEMENTS: Achievement[] = [...CARDS.flatMap(c => c.levels), ...ONE_OFFS];
