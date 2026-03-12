export interface LevelConfig {
  level: number;
  name: string;
  skyKey: string;
  bgKey: string;
  fgKey: string;
  floorKey: string;
  bgmKey: string;
  distanceThreshold: number; // distance in meters to reach this level
}

export const LEVELS: LevelConfig[] = [
  { level: 1, name: 'Zwykła Kuchnia', skyKey: 'lv1-sky', bgKey: 'lv1-bg', fgKey: 'lv1-fg', floorKey: 'lv1-floor', bgmKey: 'bgm-lv1', distanceThreshold: 0 },
  { level: 2, name: 'Klatka Schodowa', skyKey: 'lv2-sky', bgKey: 'lv2-bg', fgKey: 'lv2-fg', floorKey: 'lv2-floor', bgmKey: 'bgm-lv2', distanceThreshold: 100 },
  { level: 3, name: 'Hala Targowa', skyKey: 'lv3-sky', bgKey: 'lv3-bg', fgKey: 'lv3-fg', floorKey: 'lv3-floor', bgmKey: 'bgm-lv3', distanceThreshold: 250 },
  { level: 4, name: 'Las Grochodrzew', skyKey: 'lv4-sky', bgKey: 'lv4-bg', fgKey: 'lv4-fg', floorKey: 'lv4-floor', bgmKey: 'bgm-lv4', distanceThreshold: 450 },
  { level: 5, name: 'Wigilia u Babci', skyKey: 'lv5-sky', bgKey: 'lv5-bg', fgKey: 'lv5-fg', floorKey: 'lv5-floor', bgmKey: 'bgm-lv5', distanceThreshold: 700 },
  { level: 6, name: 'Dyskoteka w Remizie', skyKey: 'lv6-sky', bgKey: 'lv6-bg', fgKey: 'lv6-fg', floorKey: 'lv6-floor', bgmKey: 'bgm-lv6', distanceThreshold: 950 },
  { level: 7, name: 'Morze Bałtyckie', skyKey: 'lv7-sky', bgKey: 'lv7-bg', fgKey: 'lv7-fg', floorKey: 'lv7-floor', bgmKey: 'bgm-lv7', distanceThreshold: 1200 },
  { level: 8, name: 'Papież na Księżycu', skyKey: 'lv8-sky', bgKey: 'lv8-bg', fgKey: 'lv8-fg', floorKey: 'lv8-floor', bgmKey: 'bgm-lv8', distanceThreshold: 1500 },
  { level: 9, name: 'Wymiar Żubrówki', skyKey: 'lv9-sky', bgKey: 'lv9-bg', fgKey: 'lv9-fg', floorKey: 'lv9-floor', bgmKey: 'bgm-lv9', distanceThreshold: 1800 },
  { level: 10, name: 'KARALUCH WIDZI WSZYSTKO', skyKey: 'lv10-sky', bgKey: 'lv10-bg', fgKey: 'lv10-fg', floorKey: 'lv10-floor', bgmKey: 'bgm-lv10', distanceThreshold: 2200 },
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
