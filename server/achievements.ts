/**
 * The achievements, shared: the client earns them from your stats as you play, the server pays their okruszki once
 * per account when the stats it's sent reach them. Also imported by the client, so no Node imports here.
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
  /** Enemies shot down in the run (the pistol, from level 7). */
  kills: number;
  dailyRuns: number;
  matches: number;
  matchWins: number;
  seconds: number;
  bestScore: number;
  bestDistance: number;
  bestLevel: number;
  bestCombo: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  /** Okruszki, paid once. */
  reward: number;
  test: (stats: Stats) => boolean;
}

/** None for showing up: every one takes a good run or a long while. */
export const ACHIEVEMENTS: Achievement[] = [
  { id: 'poziom-4', name: 'Las Grochodrzew', description: 'Dobiegnij do poziomu 4', reward: 60, test: s => s.bestLevel >= 4 },
  { id: 'poziom-6', name: 'Remiza', description: 'Dobiegnij do poziomu 6', reward: 120, test: s => s.bestLevel >= 6 },
  { id: 'poziom-8', name: 'Na Księżycu', description: 'Dobiegnij do poziomu 8', reward: 200, test: s => s.bestLevel >= 8 },
  { id: 'poziom-10', name: 'Widzi wszystko', description: 'Dobiegnij do poziomu 10', reward: 400, test: s => s.bestLevel >= 10 },
  { id: 'piec-tysiecy', name: 'Pięć tysięcy', description: '5000 punkciorów w biegu', reward: 100, test: s => s.bestScore >= 5000 },
  { id: 'dziesiec-tysiecy', name: 'Dycha', description: '10 000 punkciorów w biegu', reward: 200, test: s => s.bestScore >= 10000 },
  { id: 'bog', name: 'Karaluch jest bogiem', description: '20 000 punkciorów w biegu', reward: 400, test: s => s.bestScore >= 20000 },
  { id: 'kombo-30', name: 'Szaleństwo', description: 'Kombo x30', reward: 100, test: s => s.bestCombo >= 30 },
  { id: 'kombo-60', name: 'Turbokompot', description: 'Kombo x60', reward: 250, test: s => s.bestCombo >= 60 },
  { id: 'na-styk', name: 'Na styk', description: '100 razy na styk', reward: 100, test: s => s.nearMisses >= 100 },
  { id: 'przebijak', name: 'Przebijak', description: 'Przebij dashem 100 przeszkód', reward: 100, test: s => s.dashThroughs >= 100 },
  { id: 'sciana', name: 'Ściana płaczu', description: 'Przebij 25 ścian', reward: 120, test: s => s.wallsBroken >= 25 },
  { id: 'pigularz', name: 'Pigularz', description: 'Zjedz 30 pigułek', reward: 100, test: s => s.pills >= 30 },
  { id: 'piwosz', name: 'Piwosz', description: 'Wypij 200 piw', reward: 100, test: s => s.beers >= 200 },
  { id: 'sadownik', name: 'Sadownik', description: 'Zjedz 3000 jabłek', reward: 150, test: s => s.apples >= 3000 },
  { id: 'maraton', name: 'Maratończyk', description: 'Przebiegnij łącznie 42 km', reward: 300, test: s => s.distance >= 42000 },
  { id: 'wytrwaly', name: 'Wytrwały', description: 'Zagraj 100 biegów', reward: 150, test: s => s.runs >= 100 },
  { id: 'dnia', name: 'Tydzień Karalucha', description: 'Zagraj 7 razy w Karalucha Dnia', reward: 100, test: s => s.dailyRuns >= 7 },
  { id: 'towarzyski', name: 'Towarzyski', description: 'Zagraj 10 zjazdów z innymi', reward: 100, test: s => s.matches >= 10 },
  { id: 'krol-zjazdu', name: 'Król zjazdu', description: 'Wygraj 5 zjazdów', reward: 200, test: s => s.matchWins >= 5 },
];
