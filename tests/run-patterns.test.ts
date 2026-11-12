import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SeededRNG } from '../src/multiplayer/SeededRNG';
import { Beat, RunPatterns, beatSpacing } from '../src/systems/RunPatterns';

const lay = (seed: number, level: number, count: number): Beat[] => {
  const patterns = new RunPatterns(new SeededRNG(seed));
  return Array.from({ length: count }, () => patterns.next(level));
};

const blocks = (beat: Beat): number =>
  beat.kind === 'wall' ? 2 : beat.kind === 'obstacle' || beat.kind === 'pair' ? 1 : 0;

test('the same seed lays out the same run on every client', () => {
  assert.deepEqual(lay(42, 5, 500), lay(42, 5, 500));
});

test('the first level has no walls, pairs or gauntlets', () => {
  const kinds = new Set(lay(7, 1, 2000).map(b => b.kind));
  assert.ok(!kinds.has('wall') && !kinds.has('pair'));
});

test('walls leave the dash time to come back', () => {
  const beats = lay(3, 10, 5000);
  let last = -Infinity;
  for (let i = 0; i < beats.length; i++) {
    if (beats[i].kind !== 'wall') continue;
    assert.ok(i - last >= 8, `walls at beats ${last} and ${i}`);
    last = i;
  }
  assert.ok(Number.isFinite(last), 'walls do appear on level 10');
});

test('every wave ends in a breather of pickups', () => {
  const beats = lay(11, 4, 3000);
  // A breather is an empty beat then four pickups; count them
  let breathers = 0;
  for (let i = 0; i + 4 < beats.length; i++) {
    if (beats[i].kind === 'empty' && beats.slice(i + 1, i + 5).every(b => b.kind === 'pickup')) breathers++;
  }
  assert.ok(breathers > 3000 / 40, `only ${breathers} breathers`);
});

test('obstacles thicken with the levels but leave room to breathe', () => {
  const density = (level: number): number => {
    const beats = lay(5, level, 4000);
    return beats.reduce((sum, b) => sum + blocks(b), 0) / beats.length;
  };
  const low = density(1);
  const high = density(10);
  assert.ok(low > 0.3 && low < 0.6, `level 1 density ${low}`);
  assert.ok(high > low, `level 10 (${high}) is no denser than level 1 (${low})`);
  assert.ok(high < 0.95, `level 10 density ${high}`);
});

test('beats spread out as the levels speed up', () => {
  assert.equal(beatSpacing(1), 200);
  assert.ok(beatSpacing(10) > beatSpacing(5));
});

const roles = (beats: Beat[]): Set<string> =>
  new Set(beats.flatMap(b => ((b.kind === 'obstacle' || b.kind === 'pair') && b.role ? [b.role] : [])));

test('chunks built around behaviours come in with the enemies they need', () => {
  assert.deepEqual([...roles(lay(9, 1, 3000))], ['swatter']);
  assert.deepEqual([...roles(lay(9, 2, 3000))].sort(), ['light', 'mop', 'swatter', 'sweeper']);
  assert.ok(!roles(lay(9, 4, 3000)).has('switcher'));
  assert.ok(roles(lay(9, 5, 3000)).has('switcher'));
});

test('the chaser (now the vacuum) comes only in the dash act, from level 3', () => {
  assert.ok(!roles(lay(9, 2, 5000)).has('chaser'), 'a chaser on level 2');
  assert.ok(roles(lay(9, 3, 5000)).has('chaser'), 'no chaser on level 3');
});

test('each level opens by introducing its newcomers, alone, once', () => {
  const patterns = new RunPatterns(new SeededRNG(4));
  const named = (level: number, count: number): string[] =>
    Array.from({ length: count }, () => patterns.next(level)).flatMap(b => (b.kind === 'obstacle' && b.enemy ? [b.enemy] : []));
  assert.deepEqual(named(1, 12), ['glue', 'flipper', 'bleach']);
  assert.deepEqual(named(1, 200), []);
  assert.deepEqual(named(2, 20).slice(0, 3), ['spray', 'lamp', 'mop']);
});

