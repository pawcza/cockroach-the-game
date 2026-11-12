import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DASH_COOLDOWN, DASH_DURATION } from '../src/config/constants';
import { attackHazards, buildPhases, Hazard, Lane, LOOP_LENGTH, Phase } from '../src/systems/boss/eksterminatorPatterns';
import { fightRandom } from '../src/systems/boss/lodziaPatterns';

const seeds = Array.from({ length: 200 }, (_, i) => i * 7919 + 1);

test('the first phase teaches one thing at a time: a spray on each lane, then a canister on each', () => {
  for (const lane of ['top', 'bottom'] as const) {
    for (const seed of seeds) {
      const [first] = buildPhases(fightRandom(seed, 'eksterminator'), lane);
      assert.deepEqual(first.opening.map(a => a.kind), ['spray', 'spray', 'lob', 'lob']);
      const [a, b, c, d] = first.opening as { lane: string }[];
      assert.equal(a.lane, lane);
      assert.notEqual(a.lane, b.lane);
      assert.notEqual(c.lane, d.lane);
      assert.ok(first.loop.every(x => x.kind === 'spray' || x.kind === 'lob'));
    }
  }
});

test('three phases, each faster, combinations only later and the sweep only last', () => {
  for (const seed of seeds) {
    const phases = buildPhases(fightRandom(seed, 'eksterminator'), 'bottom');
    assert.equal(phases.length, 3);
    for (let i = 1; i < 3; i++) {
      assert.ok(phases[i].hold < phases[i - 1].hold && phases[i].gap < phases[i - 1].gap);
      assert.ok(phases[i].flight < phases[i - 1].flight);
    }
    const kinds = phases.map(p => new Set([...p.opening, ...p.loop].map(a => a.kind)));
    assert.ok(!kinds[0].has('cloudSpray') && !kinds[0].has('doubleLob') && !kinds[0].has('sweep'));
    assert.ok(!kinds[1].has('sweep'));
    assert.equal(phases[2].opening[0].kind, 'sweep');
    for (const p of phases) {
      assert.equal(p.loop.length, LOOP_LENGTH);
      for (let i = 1; i < p.loop.length; i++) assert.notEqual(p.loop[i].kind, p.loop[i - 1].kind);
    }
  }
});

test('a daily seed gives everyone the same fight, and another day another one', () => {
  const one = buildPhases(fightRandom(20261111, 'eksterminator'), 'bottom');
  assert.deepEqual(buildPhases(fightRandom(20261111, 'eksterminator'), 'bottom'), one);
  assert.notDeepEqual(buildPhases(fightRandom(20261112, 'eksterminator'), 'bottom'), one);
});

// ── Playing it out: the attacks' timing as the fight schedules it ────────────────────────────────

/** A lane change has to be readable: from when it is safe and marked to when it must be done. */
const MIN_HOP_WINDOW_MS = 500;
/** Every hazard is announced at least this long before it reaches the roach: a stream by its lane marked red (it holds
 * the whole lane), a canister's cloud by his lob (the wind-up and the glowing canister in his fist, on him; the landing
 * spot is marked, the lane is not). warnAt is that moment either way. */
const MIN_WARNING_MS = 550;
const STEP = 5;

/** The whole fight's hazards in order, each phase's opening and its loop twice, phases a breather apart. */
function fight(phases: Phase[]): Hazard[] {
  const out: Hazard[] = [];
  let t = 0;
  for (const phase of phases) {
    for (const attack of [...phase.opening, ...phase.loop, ...phase.loop]) {
      const { hazards, done } = attackHazards(attack, phase);
      for (const h of hazards) out.push({ ...h, from: h.from + t, to: h.to + t, warnAt: h.warnAt + t });
      t += done + phase.gap;
    }
    t += 1500;
  }
  return out;
}

type Plan = 'idle' | Lane | 'perfect';
interface Run { died: boolean; hops: { at: number; window: number }[]; dashes: number[] }

/**
 * A roach playing the hazards: standing still, camping a lane, or reading everything (hops the moment its lane is
 * about to be hit and the other is free, else dashes into a cloud if the dash is ready). It never shoots.
 */
function simulate(hazards: Hazard[], plan: Plan, start: Lane): Run {
  const other = (l: Lane): Lane => (l === 'top' ? 'bottom' : 'top');
  let lane: Lane = plan === 'top' || plan === 'bottom' ? plan : start;
  const through = new Set<Hazard>();
  const run: Run = { died: false, hops: [], dashes: [] };
  let dashUntil = -1;
  let readyAt = 0;
  // Each lane's hazards by start; first[l] skips the ones long over, so a step only looks at a few
  const byLane = { top: [] as Hazard[], bottom: [] as Hazard[] };
  for (const h of [...hazards].sort((a, b) => a.from - b.from)) byLane[h.lane].push(h);
  const first = { top: 0, bottom: 0 };
  const near = (l: Lane, t: number, ahead: number): Hazard[] => {
    const list = byLane[l];
    while (first[l] < list.length && list[first[l]].to + 2000 < t) first[l]++;
    const out: Hazard[] = [];
    for (let i = first[l]; i < list.length && list[i].from <= t + ahead; i++) if (list[i].to > t && !through.has(list[i])) out.push(list[i]);
    return out;
  };
  const onLane = (l: Lane, t: number) => near(l, t, 0).filter(h => h.from <= t);
  const end = Math.max(...hazards.map(h => h.to)) + 10;
  for (let t = 0; t < end; t += STEP) {
    if (plan === 'perfect') {
      const soon = near(lane, t, STEP).find(h => h.from > t);
      if (soon && onLane(other(lane), soon.from).length === 0) {
        // The other lane: free since when?
        let freeSince = soon.warnAt;
        for (const h of byLane[other(lane)]) if (h.to <= t && h.to > freeSince) freeSince = h.to;
        run.hops.push({ at: t, window: soon.from - freeSince });
        lane = other(lane);
      } else if (soon && soon.kind === 'cloud' && t >= readyAt) {
        dashUntil = t + DASH_DURATION;
        readyAt = t + DASH_DURATION + DASH_COOLDOWN;
        run.dashes.push(t);
      }
    }
    for (const h of onLane(lane, t)) {
      if (h.kind === 'cloud' && t < dashUntil) { through.add(h); continue; }
      run.died = true;
      return run;
    }
  }
  return run;
}

const phasesFor = (seed: number, lane: Lane = 'bottom') => buildPhases(fightRandom(seed, 'eksterminator'), lane);

test('standing still dies on the very first spray, whichever lane the roach is on', () => {
  for (const start of ['top', 'bottom'] as const) {
    for (const seed of seeds) {
      const hazards = fight(phasesFor(seed, start));
      const run = simulate(hazards, 'idle', start);
      assert.ok(run.died, `seed ${seed}`);
    }
  }
});

test('camping one lane dies too', () => {
  for (const camp of ['top', 'bottom'] as const) {
    for (const start of ['top', 'bottom'] as const) {
      for (const seed of seeds) assert.ok(simulate(fight(phasesFor(seed, start)), camp, start).died, `seed ${seed}`);
    }
  }
});

test(`a roach that reads every attack survives without a shot, its dash never asked for on cooldown, every hop given ${MIN_HOP_WINDOW_MS} ms`, () => {
  for (const start of ['top', 'bottom'] as const) {
    for (const seed of seeds) {
      const run = simulate(fight(phasesFor(seed, start)), 'perfect', start);
      assert.ok(!run.died, `seed ${seed} from ${start}`);
      for (const hop of run.hops) assert.ok(hop.window >= MIN_HOP_WINDOW_MS, `seed ${seed}: a hop with ${hop.window} ms`);
      for (let i = 1; i < run.dashes.length; i++) {
        assert.ok(run.dashes[i] - run.dashes[i - 1] >= DASH_DURATION + DASH_COOLDOWN, `seed ${seed}`);
      }
    }
  }
});

test(`every hazard is announced (a stream's lane marked, a cloud's lob begun) at least ${MIN_WARNING_MS} ms before it reaches the roach`, () => {
  let least = Infinity;
  for (const seed of seeds) for (const h of fight(phasesFor(seed))) least = Math.min(least, h.from - h.warnAt);
  assert.ok(least >= MIN_WARNING_MS, `least warning ${least} ms`);
});

test('the dash is needed: the combination can only be got through by dashing (or shooting the canister)', () => {
  let needed = 0;
  for (const seed of seeds) needed += simulate(fight(phasesFor(seed)), 'perfect', 'bottom').dashes.length;
  assert.ok(needed > 0);
});
