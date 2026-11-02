/**
 * Picks a level's weather. Players in a run see the same weather, but each level rolls
 * from its own generator: this can run a different number of times per client (spectating,
 * art still loading), so it must never draw from the run's shared sequence.
 */
import { SeededRNG } from '../multiplayer/SeededRNG';
import type { WeatherType } from '../config/levels';

const LEVEL_SALT = 7919;

export function rollLevelWeather(
  chances: { type: WeatherType; weight: number }[] | undefined,
  seed: number | null,
  level: number,
): WeatherType {
  if (!chances || chances.length === 0) return 'clear';
  const total = chances.reduce((sum, chance) => sum + chance.weight, 0);
  const random = seed === null ? Math.random() : new SeededRNG(seed + level * LEVEL_SALT).next();
  const roll = random * total;
  let reached = 0;
  for (const chance of chances) {
    reached += chance.weight;
    if (roll < reached) return chance.type;
  }
  return 'clear';
}
