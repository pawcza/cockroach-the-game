/**
 * Boss taunts mid-run are an occasional treat (tauntPacing): approach taunts at 60% and 90% of the way (only the last
 * for a boss already met), and reactions only by chance, 45 s apart, three a run, never near a fight, an announcement,
 * a milestone or a reward.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { APPROACH_MARKS, approachMarks, markMet, metBefore, ReactivePacer, TAUNT_TIMING } from '../src/systems/boss/tauntPacing';

const always = (): number => 0;
const never = (): number => 0.999;

test('the rules: a long gap, a small cap, a chance, a quiet window', () => {
  assert.ok(TAUNT_TIMING.reactiveGapMs >= 45000);
  assert.ok(TAUNT_TIMING.reactivePerRun <= 3);
  assert.ok(TAUNT_TIMING.reactChance < 0.5);
  assert.ok(TAUNT_TIMING.quietMs >= 10000);
});

test('a reaction needs the chance, and then the gap since the last one', () => {
  assert.equal(new ReactivePacer(never).roll(), false);
  const pacer = new ReactivePacer(always);
  assert.equal(pacer.roll(), true);
  assert.equal(pacer.mayFire(60000), true);
  pacer.fired(60000);
  assert.equal(pacer.mayFire(60000 + TAUNT_TIMING.reactiveGapMs - 1), false);
  assert.equal(pacer.mayFire(60000 + TAUNT_TIMING.reactiveGapMs), true);
});

test('no more than the cap in a run, however long', () => {
  const pacer = new ReactivePacer(always);
  let said = 0;
  for (let t = 0; t < 30 * 60000; t += 1000) {
    if (pacer.roll() && pacer.mayFire(t)) { pacer.fired(t); said++; }
  }
  assert.equal(said, TAUNT_TIMING.reactivePerRun);
  assert.equal(pacer.roll(), false, 'past the cap an event is not even taken up');
});

test('quiet around a milestone, an announcement, a reward or a fight, and before a fight that is near', () => {
  const pacer = new ReactivePacer(always);
  pacer.hush(100000, 2000);
  assert.equal(pacer.mayFire(100000 + 2000 + TAUNT_TIMING.quietMs - 1), false);
  assert.equal(pacer.mayFire(100000 + 2000 + TAUNT_TIMING.quietMs), true);
  assert.equal(pacer.mayFire(200000, TAUNT_TIMING.quietMs), false, 'the next boss is due within the quiet window');
  assert.equal(pacer.mayFire(200000, TAUNT_TIMING.quietMs + 1), true);
});

test('both approach taunts for a boss not met yet, only the last for one already fought this session', () => {
  assert.deepEqual([...approachMarks(false)], [...APPROACH_MARKS]);
  assert.deepEqual([...approachMarks(true)], [APPROACH_MARKS[APPROACH_MARKS.length - 1]]);
  assert.equal(metBefore('test-boss'), false);
  markMet('test-boss');
  assert.equal(metBefore('test-boss'), true);
});

test('expected count in a 3-minute run: events every few seconds still give at most a handful', () => {
  // A busy run: a close call every 4 s and a dropped combo every 20 s, from 5 s in, no quiet windows
  let total = 0;
  const runs = 2000;
  for (let r = 0; r < runs; r++) {
    const pacer = new ReactivePacer();
    let pending: number | null = null;
    for (let t = TAUNT_TIMING.quietStartMs; t < 180000; t += 100) {
      if ((t % 4000 === 0 || t % 20000 === 0) && pending === null && pacer.roll()) pending = t;
      if (pending !== null && t - pending > TAUNT_TIMING.reactionTtlMs) pending = null;
      if (pending !== null && pacer.mayFire(t)) { pacer.fired(t); pending = null; total++; }
    }
  }
  const mean = total / runs;
  assert.ok(mean <= TAUNT_TIMING.reactivePerRun && mean >= 2, `mean ${mean.toFixed(2)} reactive taunts in 3 minutes`);
});
