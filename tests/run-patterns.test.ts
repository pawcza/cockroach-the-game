import assert from 'node:assert/strict';
import { test } from 'node:test';
import { levelEnd } from '../src/config/levels';
import { SeededRNG } from '../src/multiplayer/SeededRNG';
import { cruiseSpeed, nominalCourse } from '../src/objects/obstacles/cast';
import { Beat, RunPatterns, beatSpacing, endlessProgress, waveHeat } from '../src/systems/RunPatterns';

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

/** The nominal runner's speed as a level starts (the first step in it), and the seconds between its slots there. */
const startSpeed = (level: number): number => {
  const x = 150 + (level === 1 ? 0 : levelEnd(level - 1)) * 50;
  return cruiseSpeed(nominalCourse.timeAt(x), level);
};
const tempo = (level: number): number => beatSpacing(level) / startSpeed(level);

test('levels 1-6 keep their spacing; from level 7 the time between slots keeps falling: 0.58, 0.55, 0.54, 0.51 s', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(beatSpacing), [200, 216, 232, 248, 264, 280]);
  assert.equal(tempo(1), 1);
  assert.ok(Math.abs(tempo(6) - 0.616) < 0.005, `level 6: ${tempo(6)}`);
  // 0.52 and 0.50 s at levels 9 and 10 were asked for; 306 px is as close as their chargers allow (RunPatterns)
  const wanted: Record<number, number> = { 7: 0.58, 8: 0.55, 9: 0.542, 10: 0.510 };
  for (const [level, seconds] of Object.entries(wanted)) {
    assert.ok(Math.abs(tempo(Number(level)) - seconds) < 0.002, `level ${level}: ${tempo(Number(level)).toFixed(4)} s, wanted ${seconds}`);
  }
  for (let level = 2; level <= 10; level++) assert.ok(tempo(level) < tempo(level - 1), `level ${level} is no tighter`);
});

test('the endless levels tighten from 0.50 s towards 0.45 s at level 25 and hold there, as speed reaches about 720 px/s', () => {
  for (let level = 12; level <= 25; level++) {
    const wanted = 0.5 - 0.05 * (level - 10) / 15;
    assert.ok(Math.abs(tempo(level) - wanted) < 0.002, `level ${level}: ${tempo(level).toFixed(4)} s, wanted ${wanted.toFixed(4)}`);
  }
  assert.ok(tempo(11) < tempo(10) && Math.abs(tempo(11) - 0.4967) < 0.002, `level 11: ${tempo(11)}`);
  assert.ok(Math.abs(startSpeed(25) - 720) < 2, `level 25 starts at ${startSpeed(25)} px/s`);
  for (const level of [26, 30, 50, 200]) {
    assert.equal(beatSpacing(level), beatSpacing(25));
    assert.equal(waveHeat(level), waveHeat(25));
    assert.equal(endlessProgress(level), 1);
    // Only the time boost creeps on, by less than 5 px/s however long the run
    assert.ok(cruiseSpeed(1e9, level) - startSpeed(25) < 5.2, `level ${level}`);
  }
  assert.equal(endlessProgress(10), 0);
  assert.ok(waveHeat(25) > waveHeat(11) && waveHeat(11) > waveHeat(10));
});

test('the endless levels lay no newcomers, no chunk whose enemies are out of the endless cast, and lean to the hotter chunks', () => {
  const beats = (level: number): Beat[] => lay(21, level, 6000);
  const at11 = beats(11);
  assert.ok(!at11.some(b => b.kind === 'obstacle' && b.enemy), 'no introductions past level 10');
  for (const level of [11, 18, 25]) {
    const asked = roles(beats(level));
    for (const out of ['light', 'chaser', 'scuttler', 'dancer']) assert.ok(!asked.has(out), `level ${level} asks for a ${out}`);
    for (const kept of ['swatter', 'sweeper', 'switcher', 'mop', 'pecker', 'licker', 'tracker', 'zapper', 'emitter', 'lure']) {
      assert.ok(asked.has(kept), `level ${level} never asks for a ${kept}`);
    }
  }
  const density = (level: number): number => {
    const laid = beats(level);
    return laid.reduce((sum, b) => sum + blocks(b), 0) / laid.length;
  };
  assert.ok(density(25) > density(11), `level 25 (${density(25)}) is no denser than level 11 (${density(11)})`);
  assert.ok(density(25) < 0.95, `level 25 density ${density(25)}`);
  // The breathers shorten: five beats to level 15, four to 20, three after
  const breather = (level: number): number => {
    const laid = beats(level);
    const lengths: number[] = [];
    for (let i = 1; i < laid.length; i++) {
      if (laid[i].kind !== 'empty' || laid[i - 1].kind === 'empty') continue;
      let n = 1;
      while (i + n < laid.length && laid[i + n].kind === 'pickup') n++;
      lengths.push(n);
    }
    return Math.max(...lengths);
  };
  assert.ok(breather(15) >= 5 && breather(25) < breather(15), `${breather(15)} then ${breather(25)}`);
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

