export const BOSS_MAX_HP = 50;
export const OBSTACLE_OFFSET = 25;

export interface FaceConfig {
  key: string;
  projectileKey: string;
  shotSound: string;
  offsetX: number;
  offsetY: number;
  scale: number;
  lane: 'top' | 'bottom' | 'both';
}

export const FACES: FaceConfig[] = [
  { key: 'boss-face1', projectileKey: 'boss-bomb', shotSound: 'boss-bomb-shot', offsetX: -40, offsetY: -75, scale: 0.35, lane: 'top' },
  { key: 'boss-face2', projectileKey: 'boss-creamcake', shotSound: 'boss-creamcake-shot', offsetX: 30, offsetY: 0, scale: 0.30, lane: 'both' },
  { key: 'boss-face3', projectileKey: 'boss-bomb', shotSound: 'boss-bomb-shot', offsetX: -20, offsetY: 70, scale: 0.32, lane: 'bottom' },
];
