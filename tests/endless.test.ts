/**
 * The endless levels past the Eksterminator (src/config/levels.ts, cast.ts cruiseSpeed) and the scoring that goes with
 * them (src/systems/RunState.ts): level numbers by distance, the borrowed looks, the speed past level 10, a miss halving
 * the combo, the distance's points and the endless bonus.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ENDLESS_FROM_M, ENDLESS_ZONE_M, LEVELS, endlessLook, getLevelForDistance, levelBefore, levelConfig, levelEnd, levelNumberAt,
  lookLevel,
} from '../src/config/levels';
import { COCKROACH_BASE_SPEED, COCKROACH_SPEED_MAX_BOOST, COCKROACH_SPEED_TAU, SPEED_BOOST_PER_LEVEL } from '../src/config/constants';
import { cruiseSpeed } from '../src/objects/obstacles/cast';
import { readFileSync } from 'node:fs';
import { ComboDrops, DistancePoints, comboAfterMiss, comboAfterMisses, comboMultiplier, endlessBonus, pickupMultiplier } from '../src/systems/RunState';

test('the endless levels: 11 from the Eksterminator\'s 2600 m, one more every 500 m, for good', () => {
  assert.equal(ENDLESS_FROM_M, 2600);
  assert.equal(ENDLESS_ZONE_M, 500);
  const at: [number, number][] = [[0, 1], [99, 1], [100, 2], [2199, 9], [2200, 10], [2599, 10], [2600, 11], [3099, 11], [3100, 12],
    [7099, 19], [7100, 20], [9600, 25], [12_100, 30], [1e6, 11 + Math.floor((1e6 - 2600) / 500)]];
  for (const [metres, level] of at) assert.equal(levelNumberAt(metres), level, `${metres} m`);
  // The story keeps its thresholds
  for (const l of LEVELS) assert.equal(levelNumberAt(l.distanceThreshold), l.level);
  // Where the next level begins, and back
  assert.equal(levelEnd(9), 2200);
  assert.equal(levelEnd(10), 2600);
  assert.equal(levelEnd(11), 3100);
  for (let level = 1; level < 40; level++) {
    assert.equal(levelNumberAt(levelEnd(level)), level + 1);
    assert.equal(levelNumberAt(levelEnd(level) - 1), level);
  }
  // A run from 0 waits in level 10 until the Eksterminator falls; a match has no Eksterminator and goes straight on
  assert.equal(levelBefore(2650, 2600).level, 10);
  assert.equal(levelBefore(2650, Infinity).level, 11);
});

test('an endless level wears a story level\'s look, a pure function of the look seed and its number, never the one before\'s', () => {
  for (const seed of [0, 1, 7, 4242, 20261114, -5, 0x7fffffff]) {
    let previous = 10;
    for (let level = 11; level <= 80; level++) {
      const look = endlessLook(seed, level);
      assert.ok(Number.isInteger(look) && look >= 1 && look <= 10, `${seed}/${level}: ${look}`);
      assert.notEqual(look, previous, `seed ${seed}: level ${level} looks like level ${level - 1}`);
      assert.equal(endlessLook(seed, level), look, 'the same answer every time');
      previous = look;
    }
  }
  // Every story level is worn, and the seed matters
  const worn = new Set<number>();
  for (let seed = 0; seed < 50; seed++) for (let level = 11; level < 30; level++) worn.add(endlessLook(seed, level));
  assert.deepEqual([...worn].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const run = (seed: number): number[] => Array.from({ length: 10 }, (_, i) => endlessLook(seed, 11 + i));
  assert.notDeepEqual(run(1), run(2));
  // Its config: its own number and stretch, the borrowed level's name, images and music
  const config = levelConfig(12, 99);
  const borrowed = LEVELS[endlessLook(99, 12) - 1];
  assert.equal(config.level, 12);
  assert.equal(config.distanceThreshold, 3100);
  assert.equal(lookLevel(config), borrowed.level);
  assert.deepEqual([config.name, config.skyKey, config.floorKey, config.bgmKey], [borrowed.name, borrowed.skyKey, borrowed.floorKey, borrowed.bgmKey]);
  assert.equal(getLevelForDistance(3200, 99), config);
  // The story levels are themselves whatever the seed
  for (const l of LEVELS) assert.equal(levelConfig(l.level, 99), l);
  assert.equal(lookLevel(LEVELS[3]), 4);
});

test('the speed formula is unchanged up to level 10, then 3 px/s a level to level 25, and nothing more after', () => {
  const before = (ms: number, level: number): number =>
    COCKROACH_BASE_SPEED + COCKROACH_SPEED_MAX_BOOST * (1 - Math.exp(-ms / 1000 / COCKROACH_SPEED_TAU)) + (level - 1) * SPEED_BOOST_PER_LEVEL;
  for (let level = 1; level <= 10; level++) for (const ms of [0, 1234.5, 60_000, 297_000]) assert.equal(cruiseSpeed(ms, level), before(ms, level));
  assert.equal(cruiseSpeed(300_000, 11) - cruiseSpeed(300_000, 10), 3);
  assert.equal(cruiseSpeed(300_000, 25) - cruiseSpeed(300_000, 10), 45);
  assert.equal(cruiseSpeed(300_000, 40), cruiseSpeed(300_000, 25));
});

test('a miss halves the combo, rounded down', () => {
  assert.deepEqual([0, 1, 2, 3, 59, 60, 120, 201].map(comboAfterMiss), [0, 0, 1, 1, 29, 30, 60, 100]);
});

test('every pickup let go by halves the combo once, in turn: the same result however the frames split them', () => {
  assert.equal(comboAfterMisses(40, 0), 40);
  assert.equal(comboAfterMisses(40, 3), 5);
  // Five misses of a trail, left in one long frame, in two, or one a frame
  for (const frames of [[5], [2, 3], [1, 1, 1, 1, 1], [4, 1]]) {
    assert.equal(frames.reduce((combo, missed) => comboAfterMisses(combo, missed), 200), comboAfterMisses(200, 5), frames.join('+'));
  }
  // SpawnManager reports every pickup that left in the frame, and GameScene halves once for each
  const spawn = readFileSync('src/systems/SpawnManager.ts', 'utf8');
  assert.ok(spawn.includes('missed++') && spawn.includes('onPickupsMissed(missed)') && !spawn.includes('comboWasLost'));
  const scene = readFileSync('src/scenes/GameScene.ts', 'utf8');
  assert.ok(/for \(let i = 0; i < count && this\.run\.pickupCombo > 0; i\+\+\) this\.taunts\.comboLost\(this\.score\.dropCombo\(\)/.test(scene));
});

test('a combo drop is one beat: a slab for a real drop, its number growing while it is up, nothing for a small one', () => {
  const drops = new ComboDrops();
  // A trail missed at combo 40: 40 -> 20 -> 10 -> 5 within a second is one slab that ends up saying 35
  assert.deepEqual(drops.drop(20, 1000), { kind: 'slab', lost: 20 });
  assert.deepEqual(drops.drop(10, 1300), { kind: 'update', lost: 30 });
  assert.deepEqual(drops.drop(5, 1600), { kind: 'update', lost: 35 });
  // Small ones add to a slab that is up, and show nothing on their own
  assert.deepEqual(drops.drop(2, 1900), { kind: 'update', lost: 37 });
  assert.deepEqual(drops.drop(4, 1000 + ComboDrops.HOLD_MS), { kind: 'none' });
  assert.deepEqual(drops.drop(1, 5000), { kind: 'none' });
  // Once its hold is over, the next real drop is a slab of its own
  assert.deepEqual(drops.drop(12, 5100), { kind: 'slab', lost: 12 });
  assert.deepEqual(drops.drop(0, 5200), { kind: 'none' });
});

test('in endless level 10 + z, pickups and close calls pay (1 + 0.1z) times as much, on top of the combo, without a cap', () => {
  for (let level = 1; level <= 10; level++) assert.equal(endlessBonus(level), 1);
  assert.equal(endlessBonus(11), 1.1);
  assert.equal(endlessBonus(15), 1.5);
  assert.equal(endlessBonus(20), 2);
  assert.equal(endlessBonus(60), 6);
  assert.equal(pickupMultiplier(40, 9), comboMultiplier(40));
  assert.equal(Math.round(10 * pickupMultiplier(40, 20)), 40, 'an apple at x2 combo in level 20');
  assert.equal(Math.round(15 * pickupMultiplier(0, 12)), 18, 'NA STYK with no combo in level 12');
});

/** Quarter points per metre, summed the plain way. */
const quarters = (from: number, to: number): number => {
  let q = 0;
  for (let m = from; m < to; m++) q += levelNumberAt(m);
  return q;
};

test('distance pays a quarter point a metre times its level: exact totals from 0, from a checkpoint and across 2600 m', () => {
  const total = (from: number, to: number): number => new DistancePoints(from).advance(to, levelNumberAt);
  // From 0 to the Eksterminator: 100·1 + 150·2 + 200·3 + 250·(4+5+6) + 300·(7+8) + 400·(9+10) quarters
  assert.equal(quarters(0, 2600), 16_850);
  assert.equal(total(0, 2600), 4212);
  // From the endless start, five zones of 500 m (levels 11-20): 500 · (11 + ... + 20) quarters
  assert.equal(total(2600, 7600), 19_375);
  // Across the boundary: 100 m of level 10 and 100 of level 11
  assert.equal(total(2500, 2700), 525);
  // A practice checkpoint pays only what is run from it
  assert.equal(total(1200, 1500), 525);
  assert.equal(total(1200, 1200), 0);
});

test('distance points come from whole metres crossed: the same total whatever the frames, nothing lost to rounding', () => {
  for (const [from, to] of [[0, 2600], [2600, 9000], [1800, 3333.7]] as const) {
    const exact = Math.floor(quarters(from, Math.floor(to)) / 4);
    for (const seed of [1, 2, 3]) {
      const points = new DistancePoints(from);
      let paid = 0;
      let at: number = from;
      let r = seed;
      while (at < to) {
        // Frames of a few hundredths of a metre to several metres (a hitch), never landing on whole metres on purpose
        r = (r * 16807) % 2147483647;
        at = Math.min(to, at + 0.013 + (r % 1000) / 250);
        paid += points.advance(at, levelNumberAt);
      }
      assert.equal(paid, exact, `${from}-${to}, seed ${seed}`);
      // Standing still pays nothing more
      assert.equal(points.advance(at, levelNumberAt), 0);
    }
  }
  // The level of each metre is the one asked for it: a run held in level 10 by the Eksterminator's gate pays 10s
  const held = new DistancePoints(2590);
  assert.equal(held.advance(2610, m => Math.min(levelNumberAt(m), 10)), 50);
});
