import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  Attack, attackLength, bodyX, BOUNCE_LANDINGS, bulletMeets, buildPhases, cloudPrompt, CLOUD_HIT_PX, CLOUD_ROLL, DASH_CYCLE_MS,
  EksDirector, FAR, FINALE_HP, FINALE_TEMPO, fightRandom, inLine, KNOCK_DAMAGE, LUNGE_OUT_MS, LUNGE_REACH, NEAR,
  PARRY_DAMAGE, Phase, PHASE_AT, Pos, PRESSURE_MULT, promptFor, PROMPT_REACTION_MS, SHOVE_DAMAGE, SimHazard, simulate,
  SimPlayer, SMOKE_AT, SMOKE_EVERY, SPRAY_HOLD, Step, TANK_HP, tempoFor, timeAttack, VENT_AT,
} from '../src/systems/boss/eksterminatorPatterns';

const seeds = Array.from({ length: 60 }, (_, i) => i * 7919 + 1);
const phasesFor = (seed: number) => buildPhases(fightRandom(seed, 'eksterminator'));
const run = (seed: number, player: Parameters<typeof simulate>[1], start: 'top' | 'bottom' = 'bottom') =>
  simulate(phasesFor(seed), player, start, 300000, seed);
const HUMAN_MS = 400;
/** Reads everything, answers one thing at a time, times its shots and turns every attack it can back on him. */
const reader: SimPlayer = { reaction: HUMAN_MS, shoot: 'aimed', dash: 'smart' };
/** The same, but never dashes. */
const careful: SimPlayer = { reaction: HUMAN_MS, shoot: 'aimed', dash: 'never' };
/** Holds the trigger down and hops only at the last moment, never reading anything early, never dashing. */
const lateSpam: SimPlayer = { reaction: HUMAN_MS, shoot: 'spam', dash: 'never', late: 150 };
const unarmed: SimPlayer = { reaction: HUMAN_MS, shoot: 'never', dash: 'smart' };
const blind = (offset: number): SimPlayer => ({ reaction: HUMAN_MS, shoot: 'spam', dash: 'blind', offset });
const LANES = ['top', 'bottom'] as const;
const TEMPOS = [1, 0.9, 0.8, 0.75, FINALE_TEMPO];

function allAttacks(): Attack[] {
  return [
    { kind: 'spray', hold: SPRAY_HOLD }, { kind: 'lob' }, { kind: 'cloudSpray' }, { kind: 'pump' }, { kind: 'pump', walkIn: true },
    { kind: 'mine' }, { kind: 'vent' }, { kind: 'smoke' }, { kind: 'jets', lanes: ['same', 'other', 'same', 'other', 'other'] },
    { kind: 'jets', lanes: ['same', 'other', 'other', 'same', 'other', 'same'], finale: true },
    { kind: 'bounce' }, { kind: 'chain' }, { kind: 'charge' },
  ];
}

test('standing still, holding the trigger, dies on the first spray, on either lane', () => {
  for (const seed of seeds) for (const lane of LANES) {
    const r = run(seed, 'still', lane);
    assert.ok(r.died && r.cause?.kind === 'stream' && r.endedAt < 3000, `seed ${seed} ${lane}`);
  }
});

test('camping one lane dies too', () => {
  for (const seed of seeds) for (const camp of LANES) for (const start of LANES) assert.ok(run(seed, camp, start).died);
});

test('a 400 ms reader who answers one thing at a time and turns his attacks back wins every seed, from either lane, in 60-110 s', () => {
  for (const seed of seeds) for (const start of LANES) {
    const r = run(seed, reader, start);
    assert.ok(!r.died, `seed ${seed} from ${start}: ${JSON.stringify({ ...r.cause, can: undefined })}`);
    assert.ok(r.won && r.endedAt >= 60000 && r.endedAt <= 110000, `seed ${seed} from ${start}: ${r.endedAt} ms`);
    assert.ok(r.dealt.every(d => d > 0), `${r.dealt}`);
    assert.ok(r.count.parry > 0 && r.count.knock > 0 && r.count.crash > 0 && r.count.shove > 0 && r.count.blowback > 0, JSON.stringify(r.count));
    // The bullets are a trickle: turning his attacks back carries most of the damage
    const total = Object.values(r.by).reduce((a, b) => a + b, 0);
    assert.ok(r.by.bullet < total / 2, JSON.stringify(r.by));
  }
});

test('holding the trigger and hopping late dies in a good share of fights, and is at least 1.5x slower when it lives', () => {
  let deaths = 0;
  for (const seed of seeds) {
    const fast = run(seed, reader);
    const r = run(seed, lateSpam);
    if (r.died) deaths++;
    else assert.ok(r.endedAt >= fast.endedAt * 1.5, `seed ${seed}: ${r.endedAt} vs ${fast.endedAt}`);
  }
  assert.ok(deaths >= seeds.length / 3, `${deaths} of ${seeds.length} died`);
});

test('a reader who never dashes still wins, but at least 1.4x slower', () => {
  for (const seed of seeds) {
    const fast = run(seed, reader);
    const r = run(seed, careful);
    assert.ok(!r.died && r.won && r.endedAt >= fast.endedAt * 1.4, `seed ${seed}: ${r.died ? 'died' : r.endedAt} vs ${fast.endedAt}`);
  }
});

test('a player who never shoots cannot win: only a bullet bursts the tank', () => {
  for (const seed of seeds.slice(0, 20)) assert.ok(!run(seed, unarmed).won, `seed ${seed}`);
});

test('pressing the dash blindly whenever it is back, trigger held, is far slower or dies', () => {
  for (const seed of seeds.slice(0, 20)) {
    const fast = run(seed, reader);
    for (let offset = 0; offset < DASH_CYCLE_MS; offset += 350) {
      const r = run(seed, blind(offset));
      assert.ok(r.died || r.endedAt >= fast.endedAt * 1.15, `seed ${seed} offset ${offset}: ${r.endedAt} vs ${fast.endedAt}`);
    }
  }
});

const passedAt = (h: SimHazard) => (h.kind === 'mine' ? h.at : h.at + h.lasts);

test('one live threat at a time: an attack shows only once the last threat has gone past the roach', () => {
  for (const seed of seeds) for (const player of [reader, careful]) {
    const groups = new Map<number, SimHazard[]>();
    for (const h of run(seed, player, 'top').hazards) groups.set(h.step, [...(groups.get(h.step) ?? []), h]);
    const list = [...groups.values()];
    for (let i = 1; i < list.length; i++) {
      if (list[i - 1].some(h => h.gone)) continue;
      const end = Math.max(...list[i - 1].map(passedAt));
      const cue = Math.min(...list[i].map(h => h.cue));
      assert.ok(cue >= end, `seed ${seed}: ${list[i][0].kind} shows ${end - cue} ms early`);
    }
  }
});

test('human floors at every tempo and position: a stream or a pass 700 ms from its cue, the grenade 600 after it settles, a cloud 2 s, a mine 1.2 s', () => {
  const floor: Record<SimHazard['kind'], number> = { stream: 700, him: 700, chain: 700, roller: 600, cloud: 2000, mine: 1200 };
  for (const attack of allAttacks()) for (const pos of [0, 1, 2] as Pos[]) for (const tempo of TEMPOS) {
    const timed = timeAttack(attack, pos, tempo);
    for (const h of timed.hazards) assert.ok(h.t - h.cue >= floor[h.kind], `${attack.kind} ${h.kind} at ${tempo}: ${Math.round(h.t - h.cue)} ms`);
    if (timed.knock) assert.ok(timed.knock.to - timed.knock.from >= HUMAN_MS + LUNGE_OUT_MS + 200, `${attack.kind} knock`);
    // Two passes of one attack never closer than a hop apart (the combination's two are on both lanes at once, by design:
    // its answer is the gun or the dash)
    if (attack.kind === 'cloudSpray') continue;
    const hs = timed.hazards.slice().sort((a, b) => a.t - b.t);
    for (let i = 1; i < hs.length; i++) assert.ok(hs[i].t - (hs[i - 1].t + hs[i - 1].lasts) >= 300, `${attack.kind} at ${tempo}`);
  }
});

test('every attack he picks is aimed at the roach: its first threat is read on the roach\'s lane', () => {
  for (const attack of allAttacks()) {
    const [first] = timeAttack(attack, FAR).hazards.slice().sort((a, b) => a.cue - b.cue || a.t - b.t);
    assert.equal(first.lane, 'same', attack.kind);
  }
});

test('the charge and the chain: out along the roach\'s lane, back along the other; the grenade settles on the roach\'s lane on a steady beat', () => {
  for (const kind of ['charge', 'chain'] as const) {
    const hs = timeAttack({ kind }, FAR).hazards;
    assert.deepEqual(hs.map(h => h.lane), ['same', 'other']);
    // The way back is read once the way out has gone past
    assert.ok(hs[1].cue >= hs[0].t + hs[0].lasts);
  }
  const b = timeAttack({ kind: 'bounce' }, FAR);
  assert.equal(b.bounces!.length, BOUNCE_LANDINGS);
  assert.deepEqual(b.bounces!.map(x => x.lane), ['same', 'other', 'same']);
  const beats = b.bounces!.slice(1).map((x, i) => x.at - b.bounces![i].at);
  assert.ok(beats.every(d => d === beats[0]));
  assert.equal(b.hazards[0].cue, b.bounces![BOUNCE_LANDINGS - 1].at, 'the settle is the cue');
  // His charge leaves him exposed on the way back
  assert.ok(timeAttack({ kind: 'charge' }, FAR).pressure.length === 1);
});

test('each phase brings new ideas: spray, canister and counted jets; walk-in, grenade, chain, combination; charge, pump, mines', () => {
  for (const seed of seeds) {
    const [one, two, three] = phasesFor(seed);
    const kinds = (p: Phase) => new Set([...p.intro, ...p.loop].map(a => a.kind));
    assert.deepEqual([...kinds(one)].sort(), ['jets', 'lob', 'spray']);
    for (const k of ['bounce', 'chain', 'cloudSpray'] as const) assert.ok(kinds(two).has(k) && !kinds(one).has(k), k);
    for (const k of ['charge', 'pump', 'mine'] as const) assert.ok(kinds(three).has(k) && !kinds(two).has(k), k);
    // Each new one comes alone first, in the phase's opening
    assert.deepEqual(two.intro.map(a => a.kind), ['bounce', 'chain', 'cloudSpray']);
    assert.equal(three.intro[0].kind, 'charge');
    const { steps } = run(seed, reader);
    const walks = steps.filter(s => s.step.kind === 'walk').map(s => s.step.phase);
    assert.ok(walks.length > 0 && Math.min(...walks) === 1, 'he starts walking in phase two');
    assert.ok(steps.some(s => s.step.kind === 'attack' && s.step.attack.kind === 'jets' && s.step.attack.finale), 'the finale');
  }
});

test('rage: he works faster as the tank empties, in steps, never past the floors, fastest in the finale', () => {
  let last = 1;
  for (let hp = TANK_HP; hp > 0; hp--) {
    const t = tempoFor(hp / TANK_HP, false);
    assert.ok(t <= last && t >= FINALE_TEMPO, `${hp}: ${t}`);
    last = t;
  }
  assert.equal(tempoFor(1, false), 1);
  assert.ok(tempoFor(0.01, true) === FINALE_TEMPO && FINALE_TEMPO <= last);
  // The steps a reader's fight goes through
  const { steps } = run(seeds[0], reader);
  const tempos = steps.map(s => s.step.tempo);
  for (let i = 1; i < tempos.length; i++) assert.ok(tempos[i] <= tempos[i - 1]);
  assert.ok(new Set(tempos).size >= 4);
  // Shorter gaps, quicker sprays, sooner canisters
  assert.ok(attackLength({ kind: 'spray', hold: SPRAY_HOLD }, FAR, 0.75) < attackLength({ kind: 'spray', hold: SPRAY_HOLD }, FAR, 1));
  assert.ok(timeAttack({ kind: 'lob' }, FAR, 0.75).throws[0].flight < timeAttack({ kind: 'lob' }, FAR).throws[0].flight);
});

test('a canister can only be shot in its real moment: gliding in the pistol\'s line, low in front of the roach', () => {
  for (const pos of [0, 1, 2] as Pos[]) for (const tempo of TEMPOS) {
    const [th] = timeAttack({ kind: 'lob' }, pos, tempo).throws;
    let hits = 0;
    let tried = 0;
    for (let press = th.release - 800; press < th.release + th.flight; press += 5) {
      tried++;
      const t = bulletMeets(press, th, pos);
      if (t === null) continue;
      hits++;
      assert.ok(inLine(t - th.release, th), `met at ${t} outside its glide`);
    }
    assert.ok(hits > 0, `pos ${pos}: never hittable`);
    // A small window: well under the pistol's cooldown, so holding the trigger down only sometimes finds it
    assert.ok(hits * 5 <= 200, `pos ${pos} at ${tempo}: a ${hits * 5} ms window`);
    assert.ok(tried > hits);
    // Fired as it leaves his hand, a shot passes under it high in its arc
    assert.equal(bulletMeets(th.release, th, pos), null);
  }
  for (const pos of [0, 1, 2] as Pos[]) {
    for (const kind of ['mine', 'smoke'] as const) {
      const [th] = timeAttack({ kind }, pos).throws;
      for (let press = 0; press < th.release + th.flight; press += 20) assert.equal(bulletMeets(press, th, pos), null, kind);
    }
  }
});

test('every bullet hurts: one on the tank, three times that under pressure; nothing refuses a hit', () => {
  const d = new EksDirector(phasesFor(1));
  d.next();
  assert.equal(d.hit('bullet', false).dealt, 1);
  assert.equal(d.hit('bullet', true).dealt, PRESSURE_MULT);
  assert.equal(d.hit('parry', false).dealt, PARRY_DAMAGE);
  assert.equal(d.hit('shove', false).dealt, SHOVE_DAMAGE);
  assert.equal(d.hit('knock', false).dealt, KNOCK_DAMAGE);
});

test('a phase ends at its mark whatever hit it there, and the finale only ends on a bullet', () => {
  const d = new EksDirector(phasesFor(1));
  d.next();
  while (d.phase === 0) d.hit('knock', false);
  assert.equal(d.hp, PHASE_AT[0]);
  while (d.phase === 1) d.hit('knock', false);
  assert.equal(d.hp, PHASE_AT[1]);
  while (!d.finale) d.hit('knock', false);
  assert.equal(d.hp, FINALE_HP);
  assert.equal(d.pos, FAR);
  for (let i = 0; i < 20; i++) d.hit('crash', false);
  assert.equal(d.hp, 1);
  assert.ok(d.hit('bullet', true).won);
});

test('his answers: a hard pressure window makes him vent, a long stretch of shots between attacks makes him smoke', () => {
  const d = new EksDirector(phasesFor(1));
  for (let i = 0; i < 4; i++) d.next();
  d.pressureOpened();
  let vents = false;
  for (let dealt = 0; dealt < VENT_AT; dealt += PRESSURE_MULT) vents = d.hit('bullet', true).vents || vents;
  assert.ok(vents);
  const vent = d.next();
  assert.ok(vent.kind === 'attack' && vent.attack.kind === 'vent');
  for (let i = 0; i < SMOKE_EVERY; i++) d.next();
  for (let i = 0; i < SMOKE_AT; i++) d.hit('bullet', false);
  const smoke = d.next();
  assert.ok(smoke.kind === 'attack' && smoke.attack.kind === 'smoke', JSON.stringify(smoke));
});

test('a mine left on its lane: the next attack can be answered without that lane', () => {
  const d = new EksDirector(phasesFor(1));
  d.next();
  d.mineStays();
  const next = d.next() as Extract<Step, { kind: 'attack' }>;
  assert.equal(next.attack.kind, 'lob');
});

test('the dash is positional: close he is in reach, at home and a step in he is not; his pump only knockable close', () => {
  assert.ok(bodyX(NEAR) <= LUNGE_REACH && bodyX(1) > LUNGE_REACH && bodyX(FAR) > LUNGE_REACH);
  assert.equal(timeAttack({ kind: 'pump' }, FAR).knock, null);
  assert.ok(timeAttack({ kind: 'pump' }, NEAR).knock && timeAttack({ kind: 'pump', walkIn: true }, FAR).knock);
});

test('prompts are honest: whoever presses within 400 ms of any moment one shows still gets what it promised', () => {
  for (const pos of [0, 1, 2] as Pos[]) for (const tempo of TEMPOS) {
    for (const attack of allAttacks()) {
      const timed = timeAttack(attack, pos, tempo);
      const prompt = promptFor(attack, pos, tempo);
      if (!prompt) continue;
      assert.ok(prompt.from <= prompt.to, `${prompt.key}`);
      for (let s = prompt.from; s <= prompt.to; s += 10) for (let r = 0; r <= PROMPT_REACTION_MS; r += 20) {
        const press = s + r;
        if (prompt.key === 'shoot-pressure') assert.ok(timed.pressure.some(w => press >= w.from && press < w.to));
        if (prompt.key === 'dash-knock') assert.ok(press + LUNGE_OUT_MS >= timed.knock!.from && press + LUNGE_OUT_MS < timed.knock!.to);
      }
    }
    const cloud = cloudPrompt({ kind: 'lob' }, pos, tempo)!;
    const h = timeAttack({ kind: 'lob' }, pos, tempo).hazards[0];
    for (let press = cloud.from; press <= cloud.to + PROMPT_REACTION_MS; press += 10) {
      const sat = h.t - h.fire - ((150 - CLOUD_HIT_PX) / CLOUD_ROLL) * 1000;
      const x = press < h.fire + sat ? 150 : 150 - ((press - h.fire - sat) * CLOUD_ROLL) / 1000;
      assert.ok(press >= h.fire && x <= LUNGE_REACH && x > -CLOUD_HIT_PX, `dash at ${press} misses the cloud`);
    }
  }
});

test('a daily seed gives everyone the same fight, and another day another one', () => {
  assert.deepEqual(phasesFor(20261111), phasesFor(20261111));
  assert.deepEqual(run(20261111, reader).endedAt, run(20261111, reader).endedAt);
  const days = new Set(Array.from({ length: 20 }, (_, i) => JSON.stringify(phasesFor(20261111 + i))));
  assert.ok(days.size > 5);
});
