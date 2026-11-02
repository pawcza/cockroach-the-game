import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SeededRNG } from '../src/multiplayer/SeededRNG';
import { rollLevelWeather } from '../src/systems/rollLevelWeather';

const chances = [
  { type: 'clear' as const, weight: 1 },
  { type: 'rain' as const, weight: 1 },
  { type: 'fog' as const, weight: 1 },
];

test('every player in a run gets the same weather for a level', () => {
  for (let level = 1; level <= 10; level++) {
    assert.equal(rollLevelWeather(chances, 424242, level), rollLevelWeather(chances, 424242, level));
  }
});

test('levels and runs differ', () => {
  const weather = Array.from({ length: 200 }, (_, seed) => rollLevelWeather(chances, seed, 1));
  assert.deepEqual([...new Set(weather)].sort(), ['clear', 'fog', 'rain']);
});

test('rolling weather any number of times leaves the shared sequence alone', () => {
  const untouched = new SeededRNG(424242);
  const shared = new SeededRNG(424242);
  for (let i = 0; i < 500; i++) rollLevelWeather(chances, 424242, 4);
  assert.equal(shared.next(), untouched.next());
});

test('a level with no weather table is clear', () => {
  assert.equal(rollLevelWeather(undefined, 1, 1), 'clear');
  assert.equal(rollLevelWeather([], null, 1), 'clear');
});
