import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  attackLength, AttackKind, buildPhases, CLOSE_CALL_DAMAGE, fightRandom, simulate, STAMINA, timeAttack,
} from '../src/systems/boss/lodziaPatterns';

const seeds = Array.from({ length: 300 }, (_, i) => i * 7919 + 1);
const phasesFor = (seed: number) => buildPhases(fightRandom(seed, 'lodzia'));
/** A person who has seen an attack: this long from its first readable cue to their hop. */
const HUMAN_MS = 400;

test('standing still dies, on either lane, on the very first attack', () => {
  for (const seed of seeds) {
    for (const lane of ['top', 'bottom'] as const) {
      const run = simulate(phasesFor(seed), 'still', lane);
      assert.ok(run.died, `seed ${seed} ${lane}`);
      assert.equal(run.hazards.length, 1);
    }
  }
});

test('camping one lane dies too, whichever lane and wherever the roach started', () => {
  for (const seed of seeds) {
    for (const camp of ['top', 'bottom'] as const) {
      for (const start of ['top', 'bottom'] as const) {
        assert.ok(simulate(phasesFor(seed), camp, start).died, `seed ${seed} camping ${camp} from ${start}`);
      }
    }
  }
});

test('a 400 ms-reaction player who answers one threat at a time survives every phase', () => {
  for (const seed of seeds) {
    for (const start of ['top', 'bottom'] as const) {
      const run = simulate(phasesFor(seed), HUMAN_MS, start);
      assert.ok(!run.died, `seed ${seed} from ${start}: hit by ${JSON.stringify(run.hazards[run.hazards.length - 1])}`);
    }
  }
});

test('human floors: time from the first readable cue, 600 ms in phase 1 and 500 after; forced hops 600 ms apart', () => {
  for (const seed of seeds) {
    const { hazards } = simulate(phasesFor(seed), HUMAN_MS, 'bottom');
    for (const h of hazards) assert.ok(h.at - h.cue >= (h.phase === 0 ? 600 : 500), `${h.kind} in phase ${h.phase + 1}: ${h.at - h.cue} ms`);
    for (let i = 1; i < hazards.length; i++) assert.ok(hazards[i].at - hazards[i - 1].at >= 600, `${hazards[i].at - hazards[i - 1].at} ms apart`);
  }
});

test('one live threat at a time: a wind-up starts only once the last threat has gone past the roach', () => {
  for (const seed of seeds) {
    const { hazards } = simulate(phasesFor(seed), HUMAN_MS, 'top');
    for (let i = 1; i < hazards.length; i++) {
      if (hazards[i].attack !== hazards[i - 1].attack || hazards[i].phase !== hazards[i - 1].phase) {
        assert.ok(hazards[i].start >= hazards[i - 1].at, `a wind-up ${hazards[i - 1].at - hazards[i].start} ms early`);
      }
    }
  }
});

test('nothing is new in phase 3; each attack comes slower the first time, with a breather after it', () => {
  for (const seed of seeds) {
    const phases = phasesFor(seed);
    const earlier = new Set(phases.slice(0, 2).flatMap(p => p.attacks.map(a => a.kind)));
    for (const a of phases[2].attacks) assert.ok(earlier.has(a.kind), `${a.kind} first seen in phase 3`);
    const all = phases.flatMap((p, phase) => p.attacks.map(a => ({ a, phase })));
    const reaction = (a: (typeof all)[number]['a']) => Math.min(...timeAttack(a).hazards.map(h => h.t - h.cue));
    for (const kind of new Set<AttackKind>(all.map(x => x.a.kind))) {
      const [first, ...later] = all.filter(x => x.a.kind === kind);
      // Repeats in the phase that brings it may match it; every later phase is faster
      for (const x of later) {
        assert.ok(x.phase === first.phase ? reaction(x.a) <= reaction(first.a) : reaction(x.a) < reaction(first.a),
          `${kind}: phase ${x.phase + 1} not faster than its first time`);
      }
      assert.ok(first.a.gap >= Math.max(...phases[2].attacks.map(a => a.gap)), `${kind}: no breather after its first time`);
    }
  }
});

test('playing it clean empties her stamina in phase 3 within 35 s; phases 1 and 2 cannot, even playing close', () => {
  for (const seed of seeds) {
    const phases = phasesFor(seed);
    const run = simulate(phases, HUMAN_MS, 'top');
    assert.ok(run.doneAt !== null && run.doneAt <= 35000 && run.doneAt >= 24000, `seed ${seed}: ${run.doneAt}`);
    const early = simulate(phases.slice(0, 2), HUMAN_MS, 'top');
    assert.ok(early.damage + early.hazards.length * CLOSE_CALL_DAMAGE < STAMINA, `seed ${seed}: ${early.damage}`);
  }
});

test('every attack is a single threat, the boomerang one thing passing twice', () => {
  for (const seed of seeds) {
    for (const a of phasesFor(seed).flatMap(p => p.attacks)) {
      assert.equal(timeAttack(a).hazards.length, a.kind === 'boomerang' ? 2 : 1);
      assert.ok(attackLength(a) > Math.max(...timeAttack(a).hazards.map(h => h.t)));
    }
  }
});

test('a daily seed gives everyone the same fight, and another day another one', () => {
  assert.deepEqual(phasesFor(20261111), phasesFor(20261111));
  const days = new Set(Array.from({ length: 20 }, (_, i) => JSON.stringify(phasesFor(20261111 + i))));
  assert.ok(days.size > 5);
});
