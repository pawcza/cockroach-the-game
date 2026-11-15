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
  /** Runs from the Eksterminator's checkpoint (the endless levels, ranked on Bez końca's board). */
  endlessRuns: number;
  /** The highest level one of those runs got to, and the furthest (metres from the course's start, as the board shows). */
  endlessBestLevel: number;
  endlessBestDistance: number;
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
 * The cards. Ids never change: the server pays each once (economy.ts), and whoever earned one keeps it. Rebalanced
 * 2026-11-15 against the scoring and the board of then (a median run ~700 m and 2 200 points, the best ~2 800 m and
 * 21 000): a first level takes a few sessions, the last one months, and pays like it. A threshold raised since an account
 * earned the level leaves it earned there; a reward raised since it was paid pays the difference once (economy.ts).
 */
export const CARDS: Card[] = [
  card({
    id: 'jablka', name: 'Sadownik', stat: 'apples', describe: n => `Zjedz ${spaced(n)} jabłek`,
    levels: [[1000, 60, 'jablka-1'], [5000, 250, 'sadownik'], [15000, 700, 'jablka-3'], [40000, 2000, 'jablka-4']],
  }),
  card({
    id: 'dystans', name: 'Maratończyk', stat: 'distance', describe: n => `Przebiegnij łącznie ${km(n)}`, format: km,
    levels: [[15000, 60, 'dystans-1'], [42000, 300, 'maraton'], [150000, 800, 'dystans-3'], [500000, 2500, 'dystans-4']],
  }),
  card({
    id: 'piwa', name: 'Piwosz', stat: 'beers', describe: n => `Wypij ${n} piw`,
    levels: [[100, 50, 'piwa-1'], [400, 200, 'piwosz'], [1500, 800, 'piwa-3']],
  }),
  card({
    id: 'pigulki', name: 'Pigularz', stat: 'pills', describe: n => `Zjedz ${n} pigułek`,
    levels: [[10, 50, 'pigulki-1'], [40, 200, 'pigularz'], [150, 800, 'pigulki-3']],
  }),
  card({
    id: 'biegi', name: 'Wytrwały', stat: 'runs', describe: n => `Zagraj ${n} biegów`,
    levels: [[30, 50, 'biegi-1'], [100, 200, 'wytrwaly'], [300, 600, 'biegi-3'], [1000, 2000, 'biegi-4']],
  }),
  card({
    id: 'styk', name: 'Na styk', stat: 'nearMisses', describe: n => `${n} razy na styk`,
    levels: [[50, 50, 'styk-1'], [250, 250, 'na-styk'], [1500, 900, 'styk-3']],
  }),
  card({
    id: 'dash', name: 'Przebijak', stat: 'dashThroughs', describe: n => `Przebij dashem ${n} przeszkód`,
    levels: [[50, 50, 'dash-1'], [250, 250, 'przebijak'], [1500, 900, 'dash-3']],
  }),
  card({
    id: 'strzaly', name: 'Rewolwerowiec', stat: 'kills', describe: n => `Zestrzel ${n} wrogów`,
    levels: [[25, 60, 'strzaly-1'], [150, 250, 'strzaly-2'], [750, 900, 'strzaly-3']],
  }),
  card({
    id: 'sciany', name: 'Ściana płaczu', stat: 'wallsBroken', describe: n => `Przebij ${n} ścian`,
    levels: [[20, 60, 'sciany-1'], [75, 250, 'sciana'], [250, 800, 'sciany-3']],
  }),
  card({
    id: 'codziennie', name: 'Karaluch co dzień', stat: 'dailyRuns', describe: n => `Zagraj ${n} razy w Karalucha Dnia`,
    levels: [[10, 60, 'codziennie-1'], [30, 250, 'dnia'], [100, 800, 'codziennie-3']],
  }),
  card({
    id: 'misje', name: 'Na posyłki', stat: 'missionsDone', describe: n => `Wykonaj ${n} misji`,
    levels: [[10, 80, 'misje-1'], [50, 300, 'misje-2'], [150, 1000, 'misje-3'], [400, 2500, 'misje-4']],
  }),
  // The endless levels past the Eksterminator (11 from 2600 m, one more every 500 m)
  card({
    id: 'bez-konca', name: 'Bez trzymanki', stat: 'bestLevel', describe: n => `Dobiegnij do poziomu ${n}`,
    levels: [[15, 400, 'bez-konca-1'], [20, 1200, 'bez-konca-2'], [25, 3000, 'bez-konca-3']],
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
  oneOff('poziom-8', 'Na Księżycu', 'Dobiegnij do poziomu 8', 300, s => s.bestLevel >= 8),
  oneOff('poziom-10', 'Widzi wszystko', 'Dobiegnij do poziomu 10', 800, s => s.bestLevel >= 10),
  oneOff('piec-tysiecy', 'Pięć tysięcy', '5000 punkciorów w biegu', 150, s => s.bestScore >= 5000),
  oneOff('dziesiec-tysiecy', 'Dycha', '10 000 punkciorów w biegu', 500, s => s.bestScore >= 10000),
  oneOff('bog', 'Karaluch jest bogiem', '20 000 punkciorów w biegu', 1500, s => s.bestScore >= 20000),
  oneOff('piecdziesiat-tysiecy', 'Wyżej się nie da', '50 000 punkciorów w biegu', 3000, s => s.bestScore >= 50000),
  oneOff('kombo-30', 'Szaleństwo', 'Kombo x30', 100, s => s.bestCombo >= 30),
  oneOff('kombo-60', 'Turbokompot', 'Kombo x60', 400, s => s.bestCombo >= 60),
  oneOff('kombo-100', 'Perpetuum mobile', 'Kombo x100', 1000, s => s.bestCombo >= 100),
  oneOff('boss-lodzia', 'Wypraszam sobie', 'Pokonaj Panią Lodzię spod Trójki', 60, s => s.lodziaWins >= 1, 'lodzia'),
  oneOff('boss-bigos', 'Cisza w remizie', 'Pokonaj DJ Bigosa', 200, s => s.bigosWins >= 1, 'bigos'),
  oneOff('boss-zlewiatan', 'Drożny odpływ', 'Pokonaj Zlewiatana', 400, s => s.zlewiatanWins >= 1, 'zlewiatan'),
  oneOff('boss-eksterminator', 'Bez faktury', 'Pokonaj Eksterminatora', 800, s => s.eksterminatorWins >= 1, 'eksterminator'),
  oneOff('nietykalny', 'Nietykalny', 'Pokonaj bossa bez trafienia, wylinka też', 250, s => s.noHitBossWins >= 1),
  oneOff('cztery-bossy', 'Wszystkie cztery', 'Pokonaj 4 bossów w jednym biegu od 0 m', 1500, s => s.allBossRuns >= 1),
  oneOff('skroty', 'Mapa skrótów', 'Odblokuj wszystkie 4 starty od bossów', 200, s => s.checkpoints >= 4),
  oneOff('wylinka-10', 'Pancerz na zmianę', 'Wylinka ratuje cię 10 razy', 400, s => s.moultSaves >= 10),
  oneOff('kanonada', 'Kanonada', 'Zestrzel 15 wrogów w jednym biegu', 250, s => s.bestKills >= 15),
  oneOff('pacyfista', 'Pokojowe zamiary', 'Poziom 7 do 9 bez strzału w biegu', 400, s => s.pacifistRuns >= 1),
  oneOff('trzy-tysiace', 'Poza mapą', 'Dobiegnij do 3000 m w jednym biegu', 200, s => s.bestDistance >= 3000),
  oneOff('szafa-gra', 'Szafa gra', 'Miej 10 rzeczy ze sklepu', 500, s => s.itemsOwned >= 10),
  oneOff('towarzyski', 'Towarzyski', 'Zagraj 10 zjazdów z innymi', 200, s => s.matches >= 10),
  oneOff('krol-zjazdu', 'Król zjazdu', 'Wygraj 5 zjazdów', 400, s => s.matchWins >= 5),
];

/** Every achievement, the cards' levels first. */
export const ACHIEVEMENTS: Achievement[] = [...CARDS.flatMap(c => c.levels), ...ONE_OFFS];
