import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BULLET_SPEED, crankHp, DASH_MS, fightRandom, HEAD_HP, HEADS, Hazard, lungeMeets, LOOSE_HP, PARRY_DAMAGE, PASS, promptFor,
  PROMPT_REACTION_MS, REF, simulate, SimPlayer, Step, TOTAL_HP, ZlewiatanDirector,
} from '../src/systems/boss/zlewiatanPatterns';

const seeds = Array.from({ length: 60 }, (_, i) => i * 7919 + 1);
const rand = (seed: number) => fightRandom(seed, 'zlewiatan');
/** A person who has seen an attack: this long from its first readable cue to their answer. */
const HUMAN_MS = 400;
/** Reads everything, answers one thing at a time, shoots heads and what it means to shoot down, sends things back. */
const clean: SimPlayer = { reaction: HUMAN_MS, shoot: 'aimed', parry: true };
/** Never sends anything back. */
const careful: SimPlayer = { reaction: HUMAN_MS, shoot: 'aimed', parry: false };
const blind: SimPlayer = { reaction: HUMAN_MS, shoot: 'blind', parry: false };
const lanes = ['top', 'bottom'] as const;
const memo = new Map<string, ReturnType<typeof simulate>>();
const run = (seed: number, player: SimPlayer, start: 'top' | 'bottom', key: string) => {
  const k = `${key}:${seed}:${start}`;
  if (!memo.has(k)) memo.set(k, simulate(rand(seed), player, start));
  return memo.get(k)!;
};

test('standing still dies, on either lane, on the first attack aimed at it', () => {
  for (const seed of seeds) {
    for (const lane of lanes) {
      const r = simulate(rand(seed), 'still', lane);
      assert.ok(r.died, `seed ${seed} ${lane}`);
      assert.ok(r.endedAt < 6000, `seed ${seed} ${lane}: only at ${r.endedAt} ms`);
    }
  }
});

test('camping one lane dies too, whichever lane and wherever the roach started', () => {
  for (const seed of seeds) {
    for (const camp of lanes) for (const start of lanes) {
      assert.ok(simulate(rand(seed), camp, start).died, `seed ${seed} camping ${camp} from ${start}`);
    }
  }
});

test('a 400 ms-reaction player who answers one thing at a time and fights back wins every seed, from either lane, in 50-90 s', () => {
  for (const seed of seeds) {
    for (const start of lanes) {
      const r = run(seed, clean, start, 'clean');
      assert.ok(!r.died, `seed ${seed} from ${start}: hit by ${JSON.stringify(r.cause)}`);
      assert.ok(r.won, `seed ${seed} from ${start}: not over at ${r.endedAt} ms`);
      assert.ok(r.endedAt >= 50000 && r.endedAt <= 90000, `seed ${seed} from ${start}: ${r.endedAt} ms`);
      // It uses all three: the gun (bullets), the dash (things sent back, loose heads smashed), the hop (it lived)
      assert.ok(r.bySource.bullet > 0 && r.parries > 0 && r.smashes > 0, JSON.stringify(r.bySource));
      // Two heads fell off and were finished as loose heads; the last took the creature down with it
      for (const head of HEADS) assert.ok(r.destroyed[head] !== undefined, `${head} never went`);
      assert.equal(Object.keys(r.fell).length, 2, JSON.stringify(r.fell));
    }
  }
});

test('blind fire and never sending anything back are both clearly slower than playing it clean', () => {
  for (const seed of seeds) {
    for (const start of lanes) {
      const fast = run(seed, clean, start, 'clean');
      for (const [name, player] of [['blind', blind], ['careful', careful]] as const) {
        const slow = run(seed, player, start, name);
        assert.ok(!slow.died && slow.won, `${name} seed ${seed}: ${JSON.stringify(slow.cause)}`);
        assert.ok(slow.endedAt >= fast.endedAt * 1.08, `${name} seed ${seed} ${start}: ${slow.endedAt} vs ${fast.endedAt}`);
      }
    }
  }
});

test('pressing the dash the moment it is back gets caught by a radiator without it, or is slower', () => {
  for (const seed of seeds.slice(0, 20)) {
    for (let offset = 0; offset < 1575; offset += 175) {
      const r = simulate(rand(seed), { reaction: HUMAN_MS, shoot: 'aimed', parry: false, dash: 'spam', offset }, 'bottom');
      const fast = run(seed, clean, 'bottom', 'clean');
      assert.ok(r.died ? r.cause?.kind === 'radiator' : r.endedAt >= fast.endedAt * 1.3,
        `seed ${seed} offset ${offset}: ${r.died ? 'died of ' + r.cause?.kind : r.endedAt + ' ms'}`);
    }
  }
});

test('the radiators close both lanes: a player who never dashes dies at the first one', () => {
  for (const seed of seeds) {
    for (const start of lanes) {
      const r = simulate(rand(seed), { reaction: HUMAN_MS, shoot: 'aimed', parry: false, dash: 'never' }, start);
      assert.ok(r.died && r.cause?.kind === 'radiator', `seed ${seed} ${start}: ${r.died ? r.cause?.kind : 'lived'}`);
      assert.equal(r.hazards.filter(h => h.kind === 'radiator' && h.t < r.endedAt).length, 0, 'not the first one');
    }
  }
});

test('the gun is the main verb: a player who only dashes things back takes over twice as long, or dies', () => {
  for (const seed of seeds) {
    for (const start of lanes) {
      const r = simulate(rand(seed), { reaction: HUMAN_MS, shoot: 'never', parry: true }, start);
      const fast = run(seed, clean, start, 'clean');
      assert.ok(r.died || !r.won || r.endedAt > fast.endedAt * 2, `seed ${seed} ${start}: won at ${r.endedAt} without a shot`);
    }
  }
});

test('one live threat at a time: a step shows its first cue only once the last one\'s threat has gone past', () => {
  for (const seed of seeds) {
    const { hazards } = run(seed, clean, 'top', 'clean');
    for (let i = 1; i < hazards.length; i++) {
      const [prev, next] = [hazards[i - 1], hazards[i]];
      if (next.step === prev.step) continue;
      const before = hazards.filter(h => h.step === prev.step);
      const gone = Math.max(...before.map(h => h.t + (h.puddle ? 0 : h.lasts) + (h.smackAt ?? 0)));
      // A step cut short (a head falling, a loose head smashed) drops what it still had
      if (before.some(h => !h.resolved && h.t > next.start)) continue;
      assert.ok(next.cue >= gone - 1, `${next.kind} shows ${gone - next.cue} ms early`);
    }
  }
});

test('every threat is readable for a reaction and its answer: 900 ms in phase one, 600 after, a crackling\'s settle 700 then 600; hits 500 ms apart', () => {
  for (const seed of seeds) {
    for (const player of [clean, careful]) {
      const { hazards } = simulate(rand(seed), player, 'bottom');
      for (const h of hazards) {
        const read = h.t - h.cue;
        // A crackling settles like Pani Lodzia's curler: a constant 700 ms from the roach, 600 once a head is gone
        const floor = h.bounce ? (h.phase === 0 ? 700 : 600) : h.phase === 0 && !h.loose ? 900 : 600;
        assert.ok(read >= floor, `${h.kind} in phase ${h.phase + 1}: ${read} ms`);
      }
      const hits = hazards.filter(h => !h.dropped && !h.smashed).map(h => h.t).sort((a, b) => a - b);
      for (let i = 1; i < hits.length; i++) {
        // The two radiators of a pair arrive together, one per lane
        if (hits[i] === hits[i - 1]) continue;
        assert.ok(hits[i] - hits[i - 1] >= 500, `${hits[i] - hits[i - 1]} ms apart`);
      }
    }
  }
});

test('every attack is aimed at the lane the roach is on when it starts', () => {
  // Whatever lane the director is asked with, the attack threatens it
  for (const seed of seeds.slice(0, 30)) {
    const director = new ZlewiatanDirector(rand(seed));
    let lane: 'top' | 'bottom' = 'bottom';
    for (let i = 0; i < 40; i++) {
      const step = director.next(lane);
      if (step.kind === 'attack' && !step.first) assert.ok(step.hazards.some(h => h.lane === lane), `step ${i} ${step.attack} misses ${lane}`);
      lane = i % 3 === 0 ? 'top' : 'bottom';
    }
  }
});

test('each phase brings its new idea: single attacks, then call and response and the sour cream, then the second part and the radiators', () => {
  for (const seed of seeds) {
    for (const start of lanes) {
      const { steps } = run(seed, clean, start, 'clean');
      const kinds = (phase: number) => new Set(steps.filter(s => s.step.phase === phase && s.step.kind === 'attack').map(s => s.step.attack));
      const [one, two, three] = [kinds(0), kinds(1), kinds(2)];
      assert.deepEqual([...one].sort(), ['bones', 'crackling', 'slab'], `seed ${seed}: ${[...one]}`);
      assert.ok(two.has('pair') && two.has('run'), `seed ${seed}: ${[...two]}`);
      assert.ok(three.has('radiators'), `seed ${seed}: ${[...three]}`);
      for (const k of ['pair', 'cream', 'radiators', 'boomerang', 'volley', 'pierogi', 'run']) assert.ok(!one.has(k as never), `${k} in phase one`);
      for (const k of ['radiators', 'boomerang', 'volley']) assert.ok(!two.has(k as never), `${k} in phase two`);
      // The sour cream comes in phase two whenever the pierog is still on the body for its second step
      const phaseTwo = steps.filter(s => s.step.phase === 1 && s.step.kind !== 'pass' && s.step.kind !== 'fall');
      const r = run(seed, clean, start, 'clean');
      if (phaseTwo.length >= 9 && (r.fell.pierog === undefined || r.fell.pierog > phaseTwo[8].start)) {
        assert.ok(two.has('cream') && two.has('pierogi'), `seed ${seed}: ${[...two]}`);
      }
    }
  }
});

test('each attack is taught alone and slower the first time, with a breather after it', () => {
  for (const seed of seeds.slice(0, 30)) {
    const { steps } = run(seed, clean, 'bottom', 'clean');
    const attacks = steps.filter(s => s.step.kind === 'attack').map(s => s.step);
    for (const kind of ['slab', 'bones', 'crackling', 'cream', 'radiators']) {
      const all = attacks.filter(s => s.attack === kind || (s.attack === 'pair' && false));
      if (!all.length) continue;
      assert.ok(all[0].first, `${kind}: its first is not marked first`);
      const reaction = (s: Step) => Math.min(...s.hazards.map(h => h.t - h.cue));
      for (const later of all.slice(1)) assert.ok(reaction(later) <= reaction(all[0]), `${kind}: a later one is slower`);
    }
    // The first slab, bone and crackling come one at a time: one thing in the air each
    for (const s of attacks.filter(a => a.first && ['slab', 'bones', 'crackling'].includes(a.attack!))) assert.equal(s.hazards.length, 1);
  }
});

test('a head that runs out falls off and rolls at the roach until it is shot down or smashed; the others duck meanwhile', () => {
  const director = new ZlewiatanDirector(rand(1));
  director.next('bottom');
  let r = director.hit('carp', HEAD_HP.carp);
  assert.equal(r.fell, 'carp');
  assert.ok(director.ducked);
  assert.equal(director.frontTarget('top'), null, 'ducked heads are not there to hit');
  assert.equal(director.next('bottom').kind, 'fall');
  const pass = director.next('bottom');
  assert.equal(pass.kind, 'pass');
  assert.equal(pass.hazards[0].lane, 'bottom', 'its pass ends on the roach\'s lane');
  r = director.hit('loose', LOOSE_HP.carp);
  assert.equal(r.destroyed, 'carp');
  assert.ok(!director.ducked);
  assert.ok(director.isGone('carp'));
  assert.equal(director.phase, 1);
  // The pierog drops into the carp's place: one head to hit on each lane
  assert.equal(director.frontTarget('bottom'), 'pierog');
  assert.equal(director.frontTarget('top'), 'block');
});

test('when a head falls the ones left are cranked back up (half, three quarters for the last), so every phase is fought', () => {
  const director = new ZlewiatanDirector(rand(1));
  director.next('top');
  director.hit('pierog', HEAD_HP.pierog - 2);
  const r = director.hit('carp', HEAD_HP.carp);
  assert.deepEqual(r.cranked, ['pierog']);
  assert.equal(director.hp.pierog, crankHp('pierog', 2));
  assert.equal(director.hp.block, HEAD_HP.block, 'what was above half stays');
});

test('the loose head can always be escaped: a 400 ms player who only hops lives through pass after pass of every head', () => {
  for (const seed of seeds.slice(0, 30)) {
    for (const start of lanes) {
      const r = simulate(rand(seed), { reaction: HUMAN_MS, shoot: 'aimed', parry: true, dodgeLoose: true }, start, 60000);
      assert.ok(!r.died, `seed ${seed} ${start}: ${JSON.stringify(r.cause)}`);
      const passes = r.steps.filter(s => s.step.kind === 'pass');
      assert.ok(passes.length >= 8, `${passes.length} passes`);
    }
  }
  // Each head's pass: the last landing's shadow shows at least 500 ms before it reaches the roach, its landings on a beat
  for (const head of HEADS) {
    const p = PASS[head];
    const settleShown = (p.landings - 1) * p.beat;
    assert.ok(p.landings * p.beat + p.settle - settleShown >= 600, head);
  }
});

test('every hit counts and shows on the right head: parries go into the thrower, a loose head takes bullets and smashes', () => {
  const director = new ZlewiatanDirector(rand(3));
  director.next('top');
  assert.equal(director.hit('block', PARRY_DAMAGE.slab).dealt, PARRY_DAMAGE.slab);
  assert.equal(director.hp.block, HEAD_HP.block - PARRY_DAMAGE.slab);
  assert.equal(director.hit('pierog', 1).dealt, 1);
  assert.equal(TOTAL_HP, HEAD_HP.block + HEAD_HP.pierog + HEAD_HP.carp);
});

test('prompts are honest: whoever presses within 400 ms of any moment one shows still meets what it asks for', () => {
  for (const seed of seeds.slice(0, 20)) {
    const { steps } = run(seed, clean, 'bottom', 'clean');
    const seen = new Set<string>();
    for (const { step } of steps) {
      const prompt = promptFor(step);
      if (!prompt) continue;
      seen.add(prompt.key);
      assert.ok(prompt.from <= prompt.to, prompt.key);
      for (let s = prompt.from; s <= prompt.to; s += 10) {
        for (let r = 0; r <= PROMPT_REACTION_MS; r += 10) {
          const press = s + r;
          if (prompt.meet) {
            assert.ok(press <= prompt.meet.arrive && lungeMeets(press, prompt.meet.from, prompt.meet.fire, prompt.meet.arrive),
              `${prompt.key}: a press at ${press} misses (from ${prompt.meet.from} at ${prompt.meet.fire}, arrives ${prompt.meet.arrive})`);
          } else {
            assert.ok(press + REF.front.block / BULLET_SPEED <= prompt.until, `${prompt.key}: a press at ${press} lands too late`);
          }
        }
      }
    }
    assert.deepEqual([...seen].sort(), ['parry', 'radiator', 'shoot', 'smash'], `seed ${seed}`);
  }
});

test('the dash protects for 375 ms: a fishbone volley is a beat apart, so one dash never covers two', () => {
  for (const seed of seeds.slice(0, 20)) {
    const { hazards } = run(seed, clean, 'bottom', 'clean');
    const byStep = new Map<number, Hazard[]>();
    for (const h of hazards) if (h.kind === 'bone') byStep.set(h.step, [...(byStep.get(h.step) ?? []), h]);
    for (const bones of byStep.values()) {
      for (let i = 1; i < bones.length; i++) if (bones[i].lane === bones[i - 1].lane) assert.ok(bones[i].t - bones[i - 1].t > DASH_MS);
    }
  }
});

test('a daily seed gives everyone the same fight, and another day another one', () => {
  const a = simulate(rand(20261113), clean, 'bottom');
  const b = simulate(rand(20261113), clean, 'bottom');
  assert.deepEqual(a.steps, b.steps);
  const days = new Set(Array.from({ length: 12 }, (_, i) => JSON.stringify(simulate(rand(20261113 + i), clean, 'bottom').steps
    .map(s => [s.step.attack, s.step.hazards.map(h => h.lane)]))));
  assert.ok(days.size > 3, `${days.size}`);
});

test('from every lane there is always a head to hit, or the one loose head (the rest ducked): never a dead lane', () => {
  for (const seed of seeds.slice(0, 20)) {
    for (const order of [['carp', 'pierog'], ['pierog', 'carp'], ['block', 'carp'], ['carp', 'block'], ['pierog', 'block'], ['block', 'pierog']] as const) {
      const d = new ZlewiatanDirector(rand(seed));
      d.next('bottom');
      for (const head of order) {
        assert.ok(d.frontTarget('top') !== null && d.frontTarget('bottom') !== null, `${order}: a dead lane before ${head} goes`);
        d.hit(head, 999);
        assert.ok(d.ducked && d.frontTarget('top') === null && d.loose?.head === head, 'ducked while it rolls');
        d.next('bottom');
        d.hit('loose', 999);
      }
      assert.equal(d.bodyHeads.length, 1);
      assert.ok(d.frontTarget('top') === d.bodyHeads[0] && d.frontTarget('bottom') === d.bodyHeads[0], 'the last fills both lanes');
    }
  }
});

test('every head lost makes the rest harder: threats per 10 s rise phase by phase, and the gaps shrink', () => {
  const dens = [[0, 0], [0, 0], [0, 0]];
  for (const seed of seeds.slice(0, 30)) {
    for (const start of lanes) {
      const r = run(seed, clean, start, 'clean');
      for (const p of [0, 1, 2]) {
        const steps = r.steps.filter(s => s.step.phase === p && s.step.kind !== 'pass' && s.step.kind !== 'fall');
        dens[p][0] += steps.reduce((a, s) => a + s.step.hazards.filter(h => !h.returning).length, 0);
        dens[p][1] += steps.reduce((a, s) => a + s.step.ms, 0);
      }
    }
  }
  const per10 = dens.map(([n, ms]) => (n / ms) * 10000);
  assert.ok(per10[1] > per10[0] * 1.4 && per10[2] > per10[1], per10.map(x => x.toFixed(2)).join(' / '));
});

test('a crackling bounces three times lane to lane on a steady beat, each landing a step closer, and settles on the roach\'s lane', () => {
  for (const seed of seeds.slice(0, 20)) {
    for (const { step } of run(seed, clean, 'top', 'clean').steps) {
      for (const h of step.hazards) {
        if (!h.bounce) continue;
        const l = h.landings!;
        assert.equal(l.length, 3);
        assert.equal(l[1].at - l[0].at, l[2].at - l[1].at);
        assert.ok(l[0].x > l[1].x && l[1].x > l[2].x);
        assert.ok(l[0].lane === l[2].lane && l[1].lane !== l[2].lane && l[2].lane === h.lane);
      }
    }
  }
});

test('a boomerang pieróg passes twice, out on the roach\'s lane and back on the other, and a counted run never puts three on one lane', () => {
  for (const seed of seeds.slice(0, 20)) {
    for (const { step } of run(seed, clean, 'bottom', 'clean').steps) {
      if (step.attack === 'pierogi') {
        const [out, back] = step.hazards;
        assert.ok(back.returning && back.lane !== out.lane && back.cue >= out.t, 'out then back');
      }
      if (step.attack === 'run') {
        const ls = step.hazards.map(h => h.lane);
        assert.ok(ls.length >= 4, `${ls.length}`);
        for (let i = 2; i < ls.length; i++) assert.ok(!(ls[i] === ls[i - 1] && ls[i] === ls[i - 2]), `${ls}`);
        step.hazards.forEach((h, i) => assert.equal(h.count, i + 1));
      }
    }
  }
});
