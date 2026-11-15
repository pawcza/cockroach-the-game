import assert from 'node:assert/strict';
import { test } from 'node:test';
import { levelEnd } from '../src/config/levels';
import { SeededRNG } from '../src/multiplayer/SeededRNG';
import { cruiseSpeed, nominalCourse } from '../src/objects/obstacles/cast';
import { bossX, courseEnd, CourseLayout, BOSS_RESUME_PX } from '../src/systems/CourseLayout';
import {
  BOSS_NO_BREATHER_SLOTS, Beat, RunPatterns, beatSpacing, breatherBeats, endlessProgress, isThreat, quietSlots, waveHeat,
} from '../src/systems/RunPatterns';
import { getLevelForDistance } from '../src/config/levels';

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

test('every wave ends in a breather of pickups, as long as the level\'s quiet cap', () => {
  const beats = lay(11, 4, 3000);
  // A breather on level 4 is an empty beat then three pickups; count them
  assert.equal(breatherBeats(4), 4);
  let breathers = 0;
  for (let i = 0; i + 3 < beats.length; i++) {
    if (beats[i].kind === 'empty' && beats.slice(i + 1, i + 4).every(b => b.kind === 'pickup')) breathers++;
  }
  assert.ok(breathers > 3000 / 40, `only ${breathers} breathers`);
  assert.deepEqual(Array.from({ length: 10 }, (_, i) => breatherBeats(i + 1)), [3, 3, 3, 4, 4, 4, 5, 5, 5, 5]);
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
  assert.deepEqual([11, 15, 16, 20, 21, 25, 40].map(breatherBeats), [5, 5, 4, 4, 3, 3, 3]);
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


// ── The quiet-time guarantee ─────────────────────────────────────────────

test('the quiet cap is 3 s at the nominal runner\'s speed where each level starts, in whole slots never over it', () => {
  for (let level = 1; level <= 25; level++) {
    const slots = 3 / tempo(level);
    assert.equal(quietSlots(level), Math.floor(slots + 1e-9), `level ${level}: ${slots.toFixed(3)} slots in 3 s`);
  }
  for (const level of [26, 40, 200]) assert.equal(quietSlots(level), quietSlots(25));
});

/** Each beat laid, tagged with the chunk it came from (one tag per chunk laid; untagged: the guarantee's filler). */
const chunkOf = new WeakMap<Beat, { name: string }>();
const watched = RunPatterns.prototype as unknown as { lay(chunk: { name: string }): Beat[] };
const layChunk = watched.lay;
watched.lay = function (this: unknown, chunk: { name: string }): Beat[] {
  const beats = layChunk.call(this, chunk);
  const tag = { name: chunk.name };
  for (const beat of beats) chunkOf.set(beat, tag);
  return beats;
};

interface Slot { beat: Beat; level: number; afterBoss?: boolean }

/**
 * Where the guarantee is broken: two threats further apart than the level's cap (the higher where the gap crosses into
 * the next level), one slot more if a breather lies between, or than one chunk's own room plus one (a filler goes only
 * between chunks: a pickup trail, a light's quiet, the vacuum's and the wasp's hunts stay whole). Inside a level's
 * opening, from one newcomer to the next, and across a boss fight there is nothing to keep.
 */
function quietBreaks(slots: Slot[]): string[] {
  const breaks: string[] = [];
  let last = -1;
  for (let j = 0; j < slots.length; j++) {
    if (slots[j].afterBoss) last = -1;
    if (!isThreat(slots[j].beat)) continue;
    const i = last;
    last = j;
    if (i < 0) continue;
    const from = chunkOf.get(slots[i].beat)?.name ?? 'filler';
    const to = chunkOf.get(slots[j].beat)?.name ?? 'filler';
    if (from.startsWith('intro-') && to.startsWith('intro-')) continue;
    const between = slots.slice(i + 1, j);
    let room = 0;
    for (let k = 0, run = 0; k < between.length; k++) {
      run = k > 0 && chunkOf.get(between[k].beat) === chunkOf.get(between[k - 1].beat) ? run + 1 : 1;
      room = Math.max(room, run);
    }
    const rest = between.some(s => chunkOf.get(s.beat)?.name === 'breather') ? 1 : 0;
    const cap = Math.max(quietSlots(slots[i].level), quietSlots(slots[j].level)) + rest;
    if (j - i > Math.max(cap, room + 1)) breaks.push(`slot ${i} (${from}) to ${j} (${to}): ${j - i} > ${cap}, level ${slots[j].level}`);
  }
  return breaks;
}

test('the quiet-time guarantee: no level goes longer than its cap without a threat, outside its rests', () => {
  for (let level = 1; level <= 25; level++) {
    for (let seed = 1; seed <= 4; seed++) {
      const patterns = new RunPatterns(new SeededRNG(seed * 131 + level));
      const slots = Array.from({ length: 1500 }, (): Slot => ({ beat: patterns.next(level), level }));
      assert.deepEqual(quietBreaks(slots).slice(0, 3), [], `level ${level}, seed ${seed}`);
      assert.ok(slots.some(s => s.beat.kind === 'filler'), `level ${level} never needs a filler`);
    }
  }
});

/** A solo run from the start as SpawnManager lays it, every boss beaten as the course reaches him; each slot's beat. */
function soloRun(seed: number, untilM: number): { slots: Slot[]; items: ReturnType<CourseLayout['next']>[]; ends: number[]; draws: number[] } {
  const rng = new SeededRNG(seed);
  let drawn = 0;
  const layout = new CourseLayout({ next: () => (drawn++, rng.next()) }, undefined, true);
  const watchedNext = layout as unknown as { patterns: RunPatterns };
  const next = watchedNext.patterns.next.bind(watchedNext.patterns);
  let beat: Beat | undefined;
  let planned = 0;
  watchedNext.patterns.next = (level: number, slotsLeft?: number) => {
    beat = next(level, slotsLeft);
    planned = drawn;
    return beat;
  };
  let unbeaten = [250, 1200, 1800, 2600];
  let x = 550;
  let afterBoss = false;
  const slots: Slot[] = [];
  const items: ReturnType<CourseLayout['next']>[] = [];
  const ends: number[] = [];
  const draws: number[] = [];
  while (x < bossX(untilM)) {
    const end = courseEnd(unbeaten);
    if (x >= end) {
      ends.push(slots.length);
      const boss = Math.min(...unbeaten);
      unbeaten = unbeaten.filter(d => d > boss);
      x = Math.max(x, bossX(boss) + BOSS_RESUME_PX);
      afterBoss = true;
      continue;
    }
    const level = getLevelForDistance(Math.floor((x - 150) / 50)).level;
    items.push(layout.next(x, level, end));
    // What filling the slot drew, once its beat was planned
    draws.push(drawn - planned);
    slots.push({ beat: beat!, level, afterBoss });
    afterBoss = false;
    x += beatSpacing(level);
  }
  return { slots, items, ends, draws };
}

test('a whole run keeps the guarantee, takes no breather in the last slots before a boss and picks up with a threat after him', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { slots, items, ends } = soloRun(seed * 7919 + 13, 3800);
    assert.deepEqual(quietBreaks(slots).slice(0, 3), [], `seed ${seed}`);
    assert.equal(ends.length, 4);
    for (const end of ends) {
      const last = slots.slice(end - BOSS_NO_BREATHER_SLOTS, end);
      assert.ok(!last.some(s => chunkOf.get(s.beat)?.name === 'breather'), `seed ${seed}: a breather just before the boss at slot ${end}`);
      assert.ok(isThreat(slots[end].beat), `seed ${seed}: slot ${end}, the first after a boss, is ${slots[end].beat.kind}`);
      assert.ok(items[end].some(item => item.kind !== 'pickup'), `seed ${seed}: nothing to read after the boss`);
    }
  }
});

test('a filler draws nothing from the run\'s source: the course around it is the same, a slot later, on every client', () => {
  // Two clients of one seed agree on every filler, and each filler is a plain enemy of the level's cast
  const a = soloRun(4242, 3000);
  const b = soloRun(4242, 3000);
  assert.deepEqual(a.items, b.items);
  const fillers = a.slots.flatMap((s, i) => (s.beat.kind === 'filler' ? [i] : []));
  assert.ok(a.draws.filter(d => d >= 2).length > 100, 'an enemy\'s slot draws its pick and phase');
  assert.ok(fillers.length > 20, `${fillers.length} fillers`);
  for (const i of fillers) {
    assert.equal(a.draws[i], 0, `the filler at slot ${i} drew from the source`);
    assert.ok(a.items[i].length === 1 && a.items[i][0].kind === 'enemy', JSON.stringify(a.items[i]));
  }
});
