import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  atSliver, attackLength, AttackKind, buildPhases, CLOSE_CALL_DAMAGE, CURLER_LANDINGS, curlerLanding, DODGE_DAMAGE,
  dodgeWear, finisherFor, fightRandom, nextStep, simulate, SLIVER, smackWear, SMACK_DAMAGE, STAMINA, timeAttack,
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

test('human floors: time from the first readable cue, 600 ms in phase 1 and 500 after; forced hops 600 ms apart, 450 inside a volley', () => {
  for (const seed of seeds) {
    const { hazards } = simulate(phasesFor(seed), HUMAN_MS, 'bottom');
    for (const h of hazards) assert.ok(h.at - h.cue >= (h.phase === 0 ? 600 : 500), `${h.kind} in phase ${h.phase + 1}: ${h.at - h.cue} ms`);
    for (let i = 1; i < hazards.length; i++) {
      const inVolley = hazards[i].attack === hazards[i - 1].attack && hazards[i].phase === hazards[i - 1].phase && hazards[i].kind === 'slipper';
      assert.ok(hazards[i].at - hazards[i - 1].at >= (inVolley ? 449 : 600), `${hazards[i].at - hazards[i - 1].at} ms apart`);
    }
  }
});

test('a volley is three slippers, the first at the roach, never three on one lane, each readable from its own wind-up', () => {
  for (const seed of seeds) {
    const phases = phasesFor(seed);
    assert.ok(!phases[0].attacks.some(a => a.kind === 'volley'), 'phase 1 teaches single throws');
    for (const phase of phases.slice(1)) assert.ok(phase.attacks.some(a => a.kind === 'volley'), `seed ${seed}`);
    for (const a of phases.flatMap(p => p.attacks)) {
      if (a.kind !== 'volley') continue;
      assert.equal(a.lanes.length, 3);
      assert.equal(a.lanes[0], 'same');
      assert.ok(!a.lanes.every(l => l === a.lanes[0]), `${a.lanes}`);
      const { hazards } = timeAttack(a);
      for (let i = 1; i < hazards.length; i++) {
        // Her next wind-up shows only after the last slipper has left her hand, and each hit follows its own cue
        assert.ok(hazards[i].cue - hazards[i - 1].cue >= 449, `${hazards[i].cue - hazards[i - 1].cue} ms between wind-ups`);
        assert.ok(hazards[i].t - hazards[i].cue >= 600, `${hazards[i].t - hazards[i].cue} ms to read it`);
      }
    }
  }
});

test('a curler lands three times on a steady beat, and its last landing is a constant 700 ms (600 in phase 3) from the hit', () => {
  for (const seed of seeds) {
    const phases = phasesFor(seed);
    for (const [p, phase] of phases.entries()) {
      for (const a of phase.attacks) {
        if (a.kind !== 'curler') continue;
        assert.equal(CURLER_LANDINGS, 3);
        const gaps = [1, 2].map(k => curlerLanding(a.beat, k) - curlerLanding(a.beat, k - 1));
        assert.deepEqual(gaps, [a.beat, a.beat]);
        const [h] = timeAttack(a).hazards;
        assert.equal(h.t - h.cue, p === 1 ? 700 : 600, `phase ${p + 1}`);
      }
    }
    assert.equal(new Set(phases.flatMap(ph => ph.attacks).filter(a => a.kind === 'curler').map(a => (a as { beat: number }).beat)).size, 1);
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

test('playing it clean wears her to the sliver in phase 3, and the boomerang ends it within 35 s; phases 1 and 2 cannot, even playing close', () => {
  for (const seed of seeds) {
    const phases = phasesFor(seed);
    const run = simulate(phases, HUMAN_MS, 'top');
    assert.ok(run.sliverAt !== null && run.sliverAt >= 24000, `seed ${seed}: sliver at ${run.sliverAt}`);
    assert.ok(run.doneAt !== null && run.doneAt <= 35000 && run.doneAt >= 24000, `seed ${seed}: ${run.doneAt}`);
    // Every dodge in phases 1 and 2 a close call, every boomerang in her face: still not the sliver
    const early = phases.slice(0, 2).flatMap(p => p.attacks).map(a => timeAttack(a));
    const worst = early.reduce((sum, t) => sum + t.hazards.length * (DODGE_DAMAGE + CLOSE_CALL_DAMAGE) + (t.smackAt === undefined ? 0 : SMACK_DAMAGE), 0);
    assert.ok(worst < STAMINA - SLIVER, `seed ${seed}: ${worst}`);
    assert.equal(simulate(phases.slice(0, 2), HUMAN_MS, 'top').sliverAt, null, `seed ${seed}`);
  }
});

test('dodges stop at the sliver and never empty her; a smack that would leave her in it ends her', () => {
  for (let stamina = STAMINA; stamina > 0; stamina--) {
    for (const hit of [DODGE_DAMAGE, DODGE_DAMAGE + CLOSE_CALL_DAMAGE]) {
      const left = dodgeWear(stamina, hit);
      assert.ok(left >= Math.min(stamina, SLIVER) && left <= stamina, `${stamina} - ${hit} = ${left}`);
    }
    const smacked = smackWear(stamina);
    assert.equal(smacked === 0, stamina - SMACK_DAMAGE <= SLIVER, `smack at ${stamina}: ${smacked}`);
    assert.equal(smacked === 0 ? 0 : stamina - SMACK_DAMAGE, smacked);
  }
  assert.ok(atSliver(dodgeWear(10, 50)));
  assert.equal(dodgeWear(SLIVER, 50), SLIVER);
  assert.equal(smackWear(40, true), 0, 'a lethal smack takes what is left');
});

test('at the sliver the next attack is a boomerang, ahead of the list, of a breather and of the end of the list', () => {
  for (const seed of seeds) {
    const phases = phasesFor(seed);
    phases.forEach((phase, p) => {
      phase.attacks.forEach((listed, i) => {
        const worn = nextStep(phases, p, i, SLIVER);
        assert.ok(worn.kind === 'attack' && worn.attack.kind === 'boomerang' && !worn.lethal, `seed ${seed} phase ${p + 1} #${i}`);
        // Ahead of whatever was next: the list does not move, unless the next one is already a boomerang
        assert.equal(worn.kind === 'attack' && worn.listed, listed.kind === 'boomerang');
        const fresh = nextStep(phases, p, i, STAMINA);
        assert.ok(fresh.kind === 'attack' && fresh.attack === listed && fresh.listed && !fresh.lethal);
      });
      const end = nextStep(phases, p, phase.attacks.length, SLIVER);
      assert.ok(end.kind === 'attack' && end.attack.kind === 'boomerang' && !end.listed, 'no breather first');
      const spare = nextStep(phases, p, phase.attacks.length, STAMINA);
      if (p < phases.length - 1) assert.equal(spare.kind, 'breather');
      else assert.ok(spare.kind === 'attack' && spare.attack.kind === 'boomerang' && spare.lethal, 'her list out, stamina left: a boomerang that ends it');
    });
  }
});

test('the finisher is her phase\'s own boomerang, drawn from nothing random, and the fight never changes the list', () => {
  for (const seed of seeds) {
    const phases = phasesFor(seed);
    const before = JSON.stringify(phases);
    simulate(phases, HUMAN_MS, 'bottom', 1800, 20);
    assert.equal(JSON.stringify(phases), before);
    const boomerangs = phases.map(p => p.attacks.filter(a => a.kind === 'boomerang'));
    assert.deepEqual(finisherFor(1), boomerangs[1][1]);
    const { travel, back } = boomerangs[2][1] as { travel: number; back: number };
    assert.deepEqual(timeAttack(finisherFor(2)).hazards, timeAttack({ kind: 'boomerang', travel, back, gap: 0 }).hazards);
  }
});

test('whenever she reaches the sliver the fight ends on a boomerang smack, never on a dodge', () => {
  for (const seed of seeds) {
    for (const start of ['top', 'bottom'] as const) {
      for (const reaction of [0, 250, HUMAN_MS, 450, 500]) {
        const run = simulate(phasesFor(seed), reaction, start);
        assert.ok(!run.died, `seed ${seed} ${start} ${reaction}`);
        assert.ok(run.doneAt !== null && run.sliverAt !== null && run.doneAt > run.sliverAt);
        const last = run.hazards[run.hazards.length - 1];
        assert.equal(last.kind, 'boomerang');
        // The last thing she threw is the boomerang's return pass, and the smack comes after it, never at it
        assert.ok(run.doneAt > last.at, `ended at a dodge: ${run.doneAt} vs ${last.at}`);
        assert.ok(run.damage <= STAMINA - SLIVER, `dodges alone took ${run.damage}`);
      }
    }
  }
});

test('sliver reached anywhere in the fight: one boomerang later she is down, and the 400 ms player survives it, return pass included', () => {
  const boomerangSmack = Math.max(...[0, 1, 2].map(p => timeAttack(finisherFor(p)).smackAt!));
  for (const seed of seeds) {
    const phases = phasesFor(seed);
    for (const start of ['top', 'bottom'] as const) {
      for (let from = SLIVER; from <= STAMINA; from += 7) {
        const run = simulate(phases, HUMAN_MS, start, 1800, from);
        assert.ok(!run.died, `seed ${seed} ${start} from ${from}: hit by ${JSON.stringify(run.hazards[run.hazards.length - 1])}`);
        assert.equal(run.hazards[run.hazards.length - 1].kind, 'boomerang');
        assert.ok(run.damage <= from - SLIVER);
        // From the sliver: the rest of the attack that wore her down (none if it was a boomerang, which waits for itself),
        // then one boomerang
        if (run.sliverAt !== null) {
          const hit = run.hazards.find(h => h.at === run.sliverAt)!;
          const rest = hit.kind === 'boomerang' ? 0 : attackLength(phases[hit.phase].attacks[hit.attack]) - (hit.at - hit.start);
          assert.ok(run.doneAt! - run.sliverAt <= rest + boomerangSmack, `seed ${seed} from ${from}: ${run.doneAt! - run.sliverAt} ms from the sliver, rest ${rest}`);
        }
        assert.ok(run.doneAt! <= 35000, `${run.doneAt}`);
        // Human floors hold for everything the player answered, the inserted boomerang's two passes among it
        for (const h of run.hazards) assert.ok(h.at - h.cue >= (h.phase === 0 ? 600 : 500), `${h.kind} in phase ${h.phase + 1}: ${h.at - h.cue} ms`);
        for (let i = 1; i < run.hazards.length; i++) {
          const inVolley = run.hazards[i].kind === 'slipper' && run.hazards[i].start === run.hazards[i - 1].start;
          assert.ok(run.hazards[i].at - run.hazards[i - 1].at >= (inVolley ? 449 : 600));
          if (run.hazards[i].start !== run.hazards[i - 1].start) assert.ok(run.hazards[i].start >= run.hazards[i - 1].at, 'a wind-up early');
        }
      }
    }
  }
});

test('a fight already at the sliver starts with the boomerang, in phase 1\'s slow first form', () => {
  const run = simulate(phasesFor(1), HUMAN_MS, 'top', 1800, SLIVER);
  assert.deepEqual(run.hazards.map(h => h.kind), ['boomerang', 'boomerang']);
  assert.ok(!run.died);
  assert.equal(run.doneAt, timeAttack(finisherFor(0)).smackAt);
});

test('every attack is one idea: a slipper, a slam, a curler, a boomerang passing twice, a volley of three', () => {
  const count = { throw: 1, slam: 1, curler: 1, boomerang: 2, volley: 3 };
  for (const seed of seeds) {
    for (const a of phasesFor(seed).flatMap(p => p.attacks)) {
      assert.equal(timeAttack(a).hazards.length, count[a.kind]);
      assert.ok(attackLength(a) > Math.max(...timeAttack(a).hazards.map(h => h.t)));
    }
  }
});

test('a daily seed gives everyone the same fight, and another day another one', () => {
  assert.deepEqual(phasesFor(20261111), phasesFor(20261111));
  const days = new Set(Array.from({ length: 20 }, (_, i) => JSON.stringify(phasesFor(20261111 + i))));
  assert.ok(days.size > 5);
});
