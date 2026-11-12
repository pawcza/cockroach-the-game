import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BEAT_MS, buildPhases, DASH_CYCLE_MS, DASH_MS, DROP_BUILD, DROP_BUILD_FIRST, fightRandom, LIGHT_MS, simulate, timeAttack,
} from '../src/systems/boss/bigosPatterns';

const seeds = Array.from({ length: 300 }, (_, i) => i * 7919 + 1);
const phasesFor = (seed: number) => buildPhases(fightRandom(seed, 'bigos'));

test('standing still dies, on either lane, on the very first attack', () => {
  for (const seed of seeds) {
    for (const lane of ['top', 'bottom'] as const) {
      const run = simulate(phasesFor(seed), 'still', lane);
      assert.ok(run.died, `seed ${seed} ${lane}`);
      assert.ok(run.endedAt < 3 * 1000, `seed ${seed}: died only at ${run.endedAt} ms`);
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

test('a player who reads every attack survives, never needing two hops closer than 350 ms', () => {
  for (const seed of seeds) {
    for (const player of ['perfect', 'aggressive'] as const) {
      const run = simulate(phasesFor(seed), player, 'bottom');
      assert.ok(!run.died, `seed ${seed} ${player}`);
      assert.ok(run.minWindow >= 350, `seed ${seed} ${player}: ${run.minWindow} ms`);
      assert.equal(run.openings, 3);
    }
  }
});

test('a dash is never required while the last required one is still cooling down', () => {
  for (const seed of seeds) {
    for (const player of ['perfect', 'aggressive'] as const) {
      assert.ok(!simulate(phasesFor(seed), player, 'top').dashOnCooldown, `seed ${seed} ${player}`);
    }
  }
  // Two drops (the only things only a dash gets through) are always further apart than the dash's cycle
  for (const seed of seeds) {
    let t = 0;
    let lastDrop = -Infinity;
    for (const phase of phasesFor(seed)) {
      for (const attack of phase.attacks) {
        const { hazards, beats } = timeAttack(attack);
        for (const h of hazards) {
          if (h.kind !== 'drop') continue;
          assert.ok(t + h.t - lastDrop > DASH_CYCLE_MS + DASH_MS, `seed ${seed}`);
          lastDrop = t + h.t;
        }
        t += (beats + phase.gap) * BEAT_MS;
      }
    }
  }
});

test('playing aggressively ends it in 40-50 s, only hopping still ends it inside 75 s', () => {
  for (const seed of seeds) {
    const aggressive = simulate(phasesFor(seed), 'aggressive', 'bottom').endedAt;
    const passive = simulate(phasesFor(seed), 'perfect', 'bottom').endedAt;
    assert.ok(aggressive >= 40000 && aggressive <= 50000, `seed ${seed}: ${aggressive} ms`);
    assert.ok(passive <= 75000 && passive > aggressive, `seed ${seed}: ${passive} ms`);
  }
});

// A record marks no lane (its warning is his wind-up, a beat before it leaves his hand: the first t of a record includes
// that beat), a ring's and a drop's lanes are marked, and the drop's build is played by the scene, not by words
test('every attack gives time to read it: a ring 2 s from its call, a record a beat of wind-up plus 600 ms in the air, a light a beat ahead, a drop a bar of build (two the first time)', () => {
  for (const seed of seeds) {
    for (const phase of phasesFor(seed)) {
      for (const attack of phase.attacks) {
        const { hazards } = timeAttack(attack);
        const first = Math.min(...hazards.map(h => h.t));
        if (attack.kind === 'rings') assert.ok(first >= 2000);
        if (attack.kind === 'records') assert.ok(attack.travel >= 600 && first >= BEAT_MS + 600);
        if (attack.kind === 'lights') assert.ok(first >= 2 * BEAT_MS && LIGHT_MS < BEAT_MS);
        if (attack.kind === 'drop') assert.ok(first >= attack.build * BEAT_MS && attack.build >= DROP_BUILD);
      }
    }
  }
  // Two bars only for the first drop of the fight, one bar for every later one
  for (const seed of seeds) {
    const drops = phasesFor(seed).flatMap(p => p.attacks).filter(a => a.kind === 'drop');
    assert.deepEqual(drops.map(d => d.kind === 'drop' ? d.build : 0), drops.map((_, i) => (i === 0 ? DROP_BUILD_FIRST : DROP_BUILD)));
  }
});

test('the first records come one at a time: the first record of the fight is alone, with its wind-up', () => {
  for (const seed of seeds) {
    const first = phasesFor(seed).flatMap(p => p.attacks).find(a => a.kind === 'records');
    assert.ok(first && first.kind === 'records' && first.lanes.length === 1, `seed ${seed}`);
  }
});

test('the first phase opens with a ring at the roach, then the bass drop; a dash through both opens a speaker', () => {
  for (const seed of seeds) {
    const [one] = phasesFor(seed);
    assert.deepEqual(one.attacks[0], { kind: 'rings', lanes: ['same'] });
    assert.equal(one.attacks[1].kind, 'drop');
    // Ring (1) + drop (2) fill a speaker: the first opening comes about 9 s in
    const t = one.attacks.slice(0, 2).reduce((s, a) => s + (timeAttack(a).beats + one.gap) * BEAT_MS, 0);
    assert.ok(t <= 9000, `${t} ms`);
  }
});

test('every attack type is played, and the last phase has no rings (no speakers left)', () => {
  for (const seed of seeds) {
    const [one, two, three] = phasesFor(seed);
    const kinds = (p: typeof one) => [...new Set(p.attacks.map(a => a.kind))].sort();
    assert.deepEqual(kinds(one), ['drop', 'lights', 'records', 'rings']);
    assert.deepEqual(kinds(two), ['drop', 'lights', 'records', 'rings']);
    assert.deepEqual(kinds(three), ['drop', 'lights', 'records']);
  }
});

test('a daily seed gives everyone the same set, and another day another one', () => {
  assert.deepEqual(phasesFor(20261111), phasesFor(20261111));
  assert.notDeepEqual(JSON.stringify(phasesFor(20261111)), JSON.stringify(phasesFor(20261112)));
});
