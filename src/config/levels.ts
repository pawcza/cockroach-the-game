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
  painted?: boolean; // baked by tools/art/levels.py: far, mid and near plates plus a ledge strip
  weatherChances?: { type: WeatherType; weight: number }[];
}

export const LEVELS: LevelConfig[] = [
  { level: 1, name: 'Zwykła Kuchnia', skyKey: 'lv1-sky', bgKey: 'lv1-bg', fgKey: 'lv1-fg', floorKey: 'lv1-floor', bgmKey: 'bgm-lv1', distanceThreshold: 0, color: 0x8b6914, painted: true },
  { level: 2, name: 'Klatka Schodowa', skyKey: 'lv2-sky', bgKey: 'lv2-bg', fgKey: 'lv2-fg', floorKey: 'lv2-floor', bgmKey: 'bgm-lv2', distanceThreshold: 100, color: 0x607060, painted: true },
  { level: 3, name: 'Hala Targowa', skyKey: 'lv3-sky', bgKey: 'lv3-bg', fgKey: 'lv3-fg', floorKey: 'lv3-floor', bgmKey: 'bgm-lv3', distanceThreshold: 250, color: 0xcc6633, painted: true, weatherChances: [{ type: 'rain', weight: 4 }, { type: 'clear', weight: 6 }] },
  { level: 4, name: 'Las Grochodrzew', skyKey: 'lv4-sky', bgKey: 'lv4-bg', fgKey: 'lv4-fg', floorKey: 'lv4-floor', bgmKey: 'bgm-lv4', distanceThreshold: 450, color: 0x2d6b2d, painted: true },
  { level: 5, name: 'Wigilia u Babci', skyKey: 'lv5-sky', bgKey: 'lv5-bg', fgKey: 'lv5-fg', floorKey: 'lv5-floor', bgmKey: 'bgm-lv5', distanceThreshold: 700, color: 0xaa2222, painted: true, weatherChances: [{ type: 'fog', weight: 5 }, { type: 'clear', weight: 5 }] },
  { level: 6, name: 'Dyskoteka w Remizie', skyKey: 'lv6-sky', bgKey: 'lv6-bg', fgKey: 'lv6-fg', floorKey: 'lv6-floor', bgmKey: 'bgm-lv6', distanceThreshold: 950, color: 0xff00ff, painted: true },
  { level: 7, name: 'Morze Bałtyckie', skyKey: 'lv7-sky', bgKey: 'lv7-bg', fgKey: 'lv7-fg', floorKey: 'lv7-floor', bgmKey: 'bgm-lv7', distanceThreshold: 1200, color: 0x2266aa, painted: true, weatherChances: [{ type: 'wind', weight: 4 }, { type: 'clear', weight: 6 }] },
  { level: 8, name: 'Papież na Księżycu', skyKey: 'lv8-sky', bgKey: 'lv8-bg', fgKey: 'lv8-fg', floorKey: 'lv8-floor', bgmKey: 'bgm-lv8', distanceThreshold: 1500, color: 0xddcc44, painted: true },
  { level: 9, name: 'Wymiar Żubrówki', skyKey: 'lv9-sky', bgKey: 'lv9-bg', fgKey: 'lv9-fg', floorKey: 'lv9-floor', bgmKey: 'bgm-lv9', distanceThreshold: 1800, color: 0x44bb44, painted: true, weatherChances: [{ type: 'rain', weight: 3 }, { type: 'fog', weight: 3 }, { type: 'clear', weight: 4 }] },
  { level: 10, name: 'KARALUCH WIDZI WSZYSTKO', skyKey: 'lv10-sky', bgKey: 'lv10-bg', fgKey: 'lv10-fg', floorKey: 'lv10-floor', bgmKey: 'bgm-lv10', distanceThreshold: 2200, color: 0xff4400, painted: true },
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

/**
 * The level a run is in at this distance while the boss at `gate` metres is still to be beaten (Infinity: no boss
 * ahead). A level that starts at or past that boss is not reached until it is beaten: the fight is fought in the level
 * before, and the new one arrives after it, as the reward.
 */
export function levelBefore(distance: number, gate: number): LevelConfig {
  return getLevelForDistance(Math.min(distance, gate - 1e-6));
}
