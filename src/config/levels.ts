export type WeatherType = 'clear' | 'rain' | 'fog' | 'wind';

export interface LevelConfig {
  level: number;
  name: string;
  skyKey: string;
  bgKey: string;
  fgKey: string;
  floorKey: string;
  bgmKey: string;
  distanceThreshold: number; // distance in meters to reach this level
  color: number; // theme color for UI elements
  weatherChances?: { type: WeatherType; weight: number }[];
}

export const LEVELS: LevelConfig[] = [
  { level: 1, name: 'Zwykła Kuchnia', skyKey: 'lv1-sky', bgKey: 'lv1-bg', fgKey: 'lv1-fg', floorKey: 'lv1-floor', bgmKey: 'bgm-lv1', distanceThreshold: 0, color: 0x8b6914 },
  { level: 2, name: 'Klatka Schodowa', skyKey: 'lv2-sky', bgKey: 'lv2-bg', fgKey: 'lv2-fg', floorKey: 'lv2-floor', bgmKey: 'bgm-lv2', distanceThreshold: 100, color: 0x607060 },
  { level: 3, name: 'Hala Targowa', skyKey: 'lv3-sky', bgKey: 'lv3-bg', fgKey: 'lv3-fg', floorKey: 'lv3-floor', bgmKey: 'bgm-lv3', distanceThreshold: 250, color: 0xcc6633, weatherChances: [{ type: 'rain', weight: 4 }, { type: 'clear', weight: 6 }] },
  { level: 4, name: 'Las Grochodrzew', skyKey: 'lv4-sky', bgKey: 'lv4-bg', fgKey: 'lv4-fg', floorKey: 'lv4-floor', bgmKey: 'bgm-lv4', distanceThreshold: 450, color: 0x2d6b2d },
  { level: 5, name: 'Wigilia u Babci', skyKey: 'lv5-sky', bgKey: 'lv5-bg', fgKey: 'lv5-fg', floorKey: 'lv5-floor', bgmKey: 'bgm-lv5', distanceThreshold: 700, color: 0xaa2222, weatherChances: [{ type: 'fog', weight: 5 }, { type: 'clear', weight: 5 }] },
  { level: 6, name: 'Dyskoteka w Remizie', skyKey: 'lv6-sky', bgKey: 'lv6-bg', fgKey: 'lv6-fg', floorKey: 'lv6-floor', bgmKey: 'bgm-lv6', distanceThreshold: 950, color: 0xff00ff },
  { level: 7, name: 'Morze Bałtyckie', skyKey: 'lv7-sky', bgKey: 'lv7-bg', fgKey: 'lv7-fg', floorKey: 'lv7-floor', bgmKey: 'bgm-lv7', distanceThreshold: 1200, color: 0x2266aa, weatherChances: [{ type: 'wind', weight: 4 }, { type: 'clear', weight: 6 }] },
  { level: 8, name: 'Papież na Księżycu', skyKey: 'lv8-sky', bgKey: 'lv8-bg', fgKey: 'lv8-fg', floorKey: 'lv8-floor', bgmKey: 'bgm-lv8', distanceThreshold: 1500, color: 0xddcc44 },
  { level: 9, name: 'Wymiar Żubrówki', skyKey: 'lv9-sky', bgKey: 'lv9-bg', fgKey: 'lv9-fg', floorKey: 'lv9-floor', bgmKey: 'bgm-lv9', distanceThreshold: 1800, color: 0x44bb44, weatherChances: [{ type: 'rain', weight: 3 }, { type: 'fog', weight: 3 }, { type: 'clear', weight: 4 }] },
  { level: 10, name: 'KARALUCH WIDZI WSZYSTKO', skyKey: 'lv10-sky', bgKey: 'lv10-bg', fgKey: 'lv10-fg', floorKey: 'lv10-floor', bgmKey: 'bgm-lv10', distanceThreshold: 2200, color: 0xff4400 },
];

export function getLevelForDistance(distance: number): LevelConfig {
  let config = LEVELS[0];
  for (const lvl of LEVELS) {
    if (distance >= lvl.distanceThreshold) {
      config = lvl;
    } else {
      break;
    }
  }
  return config;
}

/** Returns progress (0-1) within the current level toward the next */
export function getLevelProgress(distance: number): number {
  const config = getLevelForDistance(distance);
  const nextIndex = LEVELS.findIndex((l) => l.level === config.level) + 1;
  if (nextIndex >= LEVELS.length) return 1; // max level
  const nextThreshold = LEVELS[nextIndex].distanceThreshold;
  const currentThreshold = config.distanceThreshold;
  return Math.min((distance - currentThreshold) / (nextThreshold - currentThreshold), 1);
}

/** Returns distance within current level and the level's total span. */
export function getLevelDistances(distance: number): { inLevel: number; levelSpan: number } {
  const config = getLevelForDistance(distance);
  const idx = LEVELS.findIndex((l) => l.level === config.level);
  const nextThreshold = idx + 1 < LEVELS.length ? LEVELS[idx + 1].distanceThreshold : config.distanceThreshold;
  const currentThreshold = config.distanceThreshold;
  return {
    inLevel: Math.floor(distance - currentThreshold),
    levelSpan: nextThreshold - currentThreshold,
  };
}
