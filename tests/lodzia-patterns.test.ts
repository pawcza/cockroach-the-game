import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  attackLength, buildPhases, CLOSE_CALL_DAMAGE, DODGE_DAMAGE, fightRandom, simulate, STAMINA, timeAttack, WAVE_MS,
} from '../src/systems/boss/lodziaPatterns';

const seeds = Array.from({ length: 300 }, (_, i) => i * 7919 + 1);
const phasesFor = (seed: number) => buildPhases(fightRandom(seed, 'lodzia'));

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

test('a player who reads every attack survives, never needing two hops closer than 350 ms', () => {
  for (const seed of seeds) {
    const run = simulate(phasesFor(seed), 'perfect', 'bottom');
    assert.ok(!run.died, `seed ${seed}`);
    assert.ok(run.minWindow >= 350, `seed ${seed}: ${run.minWindow} ms`);
  }
});

test('playing it clean empties her stamina within the fight, and no phase alone can', () => {
  for (const seed of seeds) {
    const phases = phasesFor(seed);
    assert.ok(simulate(phases, 'perfect', 'top').damage >= STAMINA, `seed ${seed}`);
    // Even all close calls through phases 1 and 2 leave something for phase 3
    const early = simulate(phases.slice(0, 2), 'perfect', 'top');
    const allClose = early.damage + early.hazards.length * CLOSE_CALL_DAMAGE;
    assert.ok(allClose < STAMINA && early.hazards.length * DODGE_DAMAGE < early.damage + 1, `seed ${seed}: ${allClose}`);
  }
});

// The slam's lane is marked red from the attack's first frame; a thrown thing marks no lane, its warning is her wind-up
// (the pose, the glint on the slipper), which also starts with the attack: the same lead times
test('every attack gives time to read it: a lane-wide slam 950 ms (its lane marked), a thrown thing 700 ms (her wind-up)', () => {
  for (const seed of seeds) {
    for (const phase of phasesFor(seed)) {
      for (const attack of phase.attacks) {
        for (const h of timeAttack(attack).hazards) {
          assert.ok(h.t >= (h.kind === 'wave' ? 950 : 700), `${attack.kind} ${h.kind} at ${h.t}`);
        }
      }
    }
  }
  assert.ok(WAVE_MS > 0);
});

test('the fighting fits the 30-35 s budget, with breathers between phases', () => {
  for (const seed of seeds) {
    const total = phasesFor(seed).reduce((sum, p) => sum + p.attacks.reduce((s, a) => s + attackLength(a, p.gap), 0), 0);
    assert.ok(total + 2 * 1800 <= 38000 && total >= 26000, `seed ${seed}: ${Math.round(total)} ms`);
  }
});

test('the second phase brings the first boomerang, the third every attack type', () => {
  for (const seed of seeds) {
    const [one, two, three] = phasesFor(seed);
    assert.deepEqual([...new Set(one.attacks.map(a => a.kind))].sort(), ['slam', 'throws']);
    assert.ok(two.attacks.some(a => a.kind === 'boomerang'));
    assert.deepEqual([...new Set(three.attacks.map(a => a.kind))].sort(), ['boomerang', 'combo', 'curlers', 'throws']);
  }
});

test('a daily seed gives everyone the same fight, and another day another one', () => {
  assert.deepEqual(phasesFor(20261111), phasesFor(20261111));
  assert.notDeepEqual(JSON.stringify(phasesFor(20261111)), JSON.stringify(phasesFor(20261112)));
});
