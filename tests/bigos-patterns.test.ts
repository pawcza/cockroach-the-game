import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BEAT_MS, BigosDirector, buildPhases, CRANK_HP, DASH_CYCLE_MS, DROP_BUILD, DROP_BUILD_FIRST, DROP_TIGHT_BONUS,
  DROP_TIGHT_MS, DROP_TRAVEL, DROP_TRAVEL_1, fightRandom, DROP_GRACE_MS, FIRST_DROP_TRAVEL, frontMeets, HIT_DAMAGE,
  LUNGE_OUT_MS, lungeMeets,
  OPEN_MULTIPLIER, PARRY_DAMAGE, promptFor, PROMPT_REACTION_MS, RETALIATE_AT, SEGMENT_HP, simulate, SimPlayer,
  timeAttack, TOTAL_HP,
} from '../src/systems/boss/bigosPatterns';

const seeds = Array.from({ length: 120 }, (_, i) => i * 7919 + 1);
const phasesFor = (seed: number) => buildPhases(fightRandom(seed, 'bigos'));
/** A person who has seen an attack: this long from its first readable cue to their answer. */
const HUMAN_MS = 400;
/** Reads everything, hops what it does not send back, lunges at the speakers between his attacks. */
const clean: SimPlayer = { reaction: HUMAN_MS, parry: true, lunge: 'safe' };
/** Never sends anything back: hops every ring and record, lunges only between attacks. */
const careful: SimPlayer = { reaction: HUMAN_MS, parry: false, lunge: 'safe' };
/** A person: reacts in 400-600 ms, misreads a lane now and then (late by 350 ms), times a drop's dash by eye. */
const person = (seed: number, miss: number): SimPlayer => ({
  reaction: HUMAN_MS, parry: true, lunge: 'safe', noise: { seed, reaction: [400, 600], miss, missDelay: 350, drift: 150 },
});
/** Presses the dash the moment it is back, whatever is coming. */
const spam = (offset: number): SimPlayer => ({ reaction: HUMAN_MS, parry: false, lunge: 'blind', offset });

test('standing still dies, on either lane, on the first ring', () => {
  for (const seed of seeds) {
    for (const lane of ['top', 'bottom'] as const) {
      const run = simulate(phasesFor(seed), 'still', lane);
      assert.ok(run.died, `seed ${seed} ${lane}`);
      assert.equal(run.cause?.kind, 'ring');
      assert.ok(run.endedAt < 5000, `seed ${seed}: died only at ${run.endedAt} ms`);
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

test('a 400 ms-reaction player who answers one thing at a time and fights back wins, from either lane, in 34-55 s', () => {
  for (const seed of seeds) {
    for (const start of ['top', 'bottom'] as const) {
      const run = simulate(phasesFor(seed), clean, start);
      assert.ok(!run.died, `seed ${seed} from ${start}: hit by ${JSON.stringify(run.cause)}`);
      assert.ok(run.won, `seed ${seed} from ${start}: not over at ${run.endedAt} ms`);
      assert.ok(run.endedAt >= 34000 && run.endedAt <= 55000, `seed ${seed} from ${start}: ${run.endedAt} ms`);
      assert.ok(run.parries > 0 && run.hits > 0);
      // Every phase is fought: the speakers each take their share, then the ball
      assert.ok(run.dealt.every(d => d > 0), `${run.dealt}`);
    }
  }
});

// Both bounce the drops (nothing else gets through them); only the clean player also sends rings and records back
test('sending things back is worth it: a player who hops rings and records and lunges between attacks wins too, but later', () => {
  const fast: number[] = [];
  const slow: number[] = [];
  for (const seed of seeds) {
    const run = simulate(phasesFor(seed), careful, 'bottom');
    assert.ok(!run.died && run.won, `seed ${seed}: ${JSON.stringify(run.cause)}`);
    assert.ok(run.endedAt <= 60000, `seed ${seed}: ${run.endedAt} ms`);
    slow.push(run.endedAt);
    fast.push(simulate(phasesFor(seed), clean, 'bottom').endedAt);
  }
  const median = (a: number[]) => a.sort((x, y) => x - y)[a.length >> 1];
  assert.ok(median(slow) >= median(fast) * 1.15, `${median(slow)} vs ${median(fast)} ms`);
});

test('pressing the dash blindly whenever it is back gets caught by a drop without it', () => {
  for (const seed of seeds.slice(0, 40)) {
    for (let offset = 0; offset < DASH_CYCLE_MS; offset += 125) {
      const run = simulate(phasesFor(seed), spam(offset), 'bottom');
      const fast = simulate(phasesFor(seed), clean, 'bottom');
      assert.ok(run.died ? run.cause?.kind === 'drop' : run.endedAt >= fast.endedAt * 1.3,
        `seed ${seed} offset ${offset}: ${run.died ? 'died of ' + run.cause?.kind : run.endedAt + ' ms'}`);
    }
  }
});

test('the dash is the weapon: a player who never presses it dies at the first drop', () => {
  for (const seed of seeds) {
    const run = simulate(phasesFor(seed), { reaction: HUMAN_MS, parry: false, lunge: 'never', noDash: true }, 'top');
    assert.ok(run.died && run.cause?.kind === 'drop', `seed ${seed}`);
  }
});

test('one live threat at a time: an attack shows only once the last threat has gone past the roach', () => {
  for (const seed of seeds) {
    // What a wreck cleared off the stage never reached anyone
    const hazards = simulate(phasesFor(seed), clean, 'top').hazards.filter(h => !h.cleared);
    for (let i = 1; i < hazards.length; i++) {
      const [prev, next] = [hazards[i - 1], hazards[i]];
      if (next.step !== prev.step) assert.ok(next.cue >= prev.at + prev.lasts, `${next.kind} shows ${prev.at - next.cue} ms early`);
    }
  }
});

// No more than they need: Lodzia's floors are 600 ms in her first phase and 500 after
test('human floors: a ring 1 s from its cue, a record 1 s, a light 1 s in phase one and 750 ms after, a drop 1.75 s; two hits never under 500 ms apart', () => {
  for (const seed of seeds) {
    const { hazards } = simulate(phasesFor(seed), clean, 'bottom');
    for (const h of hazards) {
      const read = h.at - h.cue;
      const floor = { ring: 1000, record: 1000, light: h.phase === 0 ? 1000 : 750, drop: 1750 }[h.kind];
      assert.ok(read >= floor, `${h.kind}: ${read} ms to read`);
    }
    for (let i = 1; i < hazards.length; i++) assert.ok(hazards[i].at - hazards[i - 1].at >= 500, `${hazards[i].at - hazards[i - 1].at} ms`);
  }
});

test('every attack he picks is aimed at the roach: its first threat comes down the roach\'s lane', () => {
  for (const seed of seeds) {
    for (const phase of phasesFor(seed)) {
      for (const attack of [...phase.intro, ...phase.loop]) {
        if (attack.kind === 'rest' || attack.kind === 'burst') continue;
        const [first] = timeAttack(attack).hazards.sort((a, b) => a.t - b.t);
        // Rings at the one speaker left are aimed at its lane: the lane the roach must stand on to hit it
        assert.ok(['same', 'both', 'live'].includes(first.lane), `${attack.kind}: first at ${first.lane}`);
      }
    }
  }
});

test('prompts are honest: whoever presses within 400 ms of any moment one shows is still protected, or still lands the lunge', () => {
  // Every step that could carry a prompt, not only the first of each kind a given player meets
  for (const seed of seeds.slice(0, 20)) for (const player of [clean, careful]) {
    const { steps } = simulate(phasesFor(seed), player, 'bottom');
    const seen = new Set<string>();
    for (const [i, { step, start }] of steps.entries()) {
      const prompt = promptFor(step);
      if (!prompt) continue;
      seen.add(prompt.key);
      assert.ok(prompt.countFrom <= prompt.from && prompt.from <= prompt.to, prompt.key);
      for (let s = prompt.from; s <= prompt.to; s += 10) {
        for (let r = 0; r <= PROMPT_REACTION_MS; r += 10) {
          const press = s + r;
          if (prompt.meet) {
            const { fire, arrive, grace } = prompt.meet;
            const meets = grace > 0 ? frontMeets(press, fire, arrive) : press <= arrive && lungeMeets(press, fire, arrive);
            assert.ok(meets,
              `${prompt.key}: a press at ${press} ms misses what it is for (leaves ${prompt.meet.fire}, arrives ${prompt.meet.arrive})`);
          } else {
            assert.ok(press + LUNGE_OUT_MS <= prompt.until, `${prompt.key}: a press at ${press} ms lands after it closed`);
            // And it never leaves the roach without the dash for a drop
            const drop = steps.slice(i + 1).find(x => x.step.kind === 'attack' && x.step.attack.kind === 'drop');
            if (drop && drop.step.kind === 'attack') {
              const fire = drop.start + timeAttack(drop.step.attack).hazards[0].fire;
              assert.ok(start + press + DASH_CYCLE_MS <= fire, `${prompt.key}: a press at ${press} ms leaves no dash for the drop`);
            }
          }
        }
      }
    }
    assert.deepEqual([...seen].sort(), ['drop', 'hit', 'open', 'smash'], `seed ${seed}`);
  }
});

test('his answers: a speaker hit hard enough bursts its own lane; bouncing a drop back overloads him, lunges count double', () => {
  const director = new BigosDirector(phasesFor(1));
  assert.equal(director.remaining, TOTAL_HP);
  director.next();
  for (let i = 0; i < RETALIATE_AT; i++) director.hit('top', HIT_DAMAGE);
  const burst = director.next();
  assert.ok(burst.kind === 'attack' && burst.attack.kind === 'burst' && burst.attack.lane === 'top');
  director.dropBounced();
  const open = director.next();
  assert.equal(open.kind, 'open');
  assert.equal(director.hit('bottom', HIT_DAMAGE).dealt, HIT_DAMAGE * OPEN_MULTIPLIER);
  assert.notEqual(director.next().kind, 'open');
  assert.equal(director.hit('bottom', HIT_DAMAGE).dealt, HIT_DAMAGE);
});

test('two speakers, then the ball over the top lane; what a speaker took stays taken, down to half; a thing sent back always counts', () => {
  const director = new BigosDirector(phasesFor(1));
  director.next();
  assert.deepEqual([director.lungeTarget('top'), director.lungeTarget('bottom')], ['top', 'bottom']);
  director.hit('top', PARRY_DAMAGE);
  while (director.phase === 0) director.hit('bottom', HIT_DAMAGE);
  assert.equal(director.liveLane, 'top');
  assert.equal(director.hp.top, SEGMENT_HP - PARRY_DAMAGE);
  // Beaten nearly down beside it, the one left is cranked back up to half when the first goes
  const spread = new BigosDirector(phasesFor(1));
  spread.next();
  for (let i = 0; i < SEGMENT_HP - 1; i++) spread.hit('top', HIT_DAMAGE);
  while (spread.phase === 0) spread.hit('bottom', HIT_DAMAGE);
  assert.equal(spread.hp.top, CRANK_HP);
  // The wrecked lane's lunge reaches nothing; a thing sent back from it still hits the speaker left
  assert.equal(director.lungeTarget('bottom'), null);
  assert.equal(director.parryTarget('bottom'), 'top');
  while (director.phase === 1) director.hit('top', HIT_DAMAGE);
  assert.deepEqual([director.lungeTarget('top'), director.lungeTarget('bottom')], ['ball', null]);
  assert.equal(director.parryTarget('bottom'), 'ball');
  while (!director.won) director.hit('ball', HIT_DAMAGE);
  assert.equal(director.remaining, 0);
});

test('each phase brings a new idea: rings and the drop, then records to smash and a double drop, then lights that run straight into a drop', () => {
  for (const seed of seeds) {
    const [one, two, three] = phasesFor(seed);
    const kinds = (p: typeof one) => new Set([...p.intro, ...p.loop].map(a => a.kind));
    assert.deepEqual([...kinds(one)].sort(), ['drop', 'lights', 'rest', 'rings']);
    assert.ok(kinds(two).has('records') && !kinds(one).has('records'));
    assert.ok(!kinds(three).has('rings'), 'no speakers left to fire rings');
    // Phase three: a run of lights with no gap into a drop of light (hop, hop, hop, then dash)
    for (const list of [three.intro, three.loop]) {
      const i = list.findIndex(a => a.kind === 'drop');
      assert.ok(i > 0 && list[i - 1].kind === 'lights' && list[i - 1].gap === 0, `seed ${seed}`);
    }
  }
});

test('the drop\'s build is short: the fight\'s first one three beats and slower, whichever phase it comes in; then two beats, quicker by phase, twice from phase two', () => {
  assert.ok(DROP_BUILD * BEAT_MS <= 1000 && DROP_BUILD_FIRST * BEAT_MS <= 1500);
  for (const seed of seeds) {
    for (const player of [clean, careful]) {
      const { steps } = simulate(phasesFor(seed), player, 'top');
      const drops = steps.flatMap(s => (s.step.kind === 'attack' && s.step.attack.kind === 'drop' ? [{ d: s.step.attack, phase: s.step.phase }] : []));
      assert.ok(drops.length > 0);
      drops.forEach(({ d, phase }, i) => assert.deepEqual([d.build, d.travel, d.waves], i === 0
        ? [DROP_BUILD_FIRST, FIRST_DROP_TRAVEL, 1]
        : [DROP_BUILD, phase === 0 ? DROP_TRAVEL_1 : DROP_TRAVEL, phase === 0 ? 1 : 2]));
    }
  }
  // A player who wrecks the first speaker before any drop still meets the long one first
  const director = new BigosDirector(phasesFor(1));
  director.next();
  while (director.phase === 0) director.hit('top', PARRY_DAMAGE);
  let step = director.next();
  while (!(step.kind === 'attack' && step.attack.kind === 'drop')) step = director.next();
  assert.ok(step.kind === 'attack' && step.attack.kind === 'drop' && step.attack.build === DROP_BUILD_FIRST && step.phase === 1);
});

test('the dash is always back for a drop if it was not spent once it showed; a second wave punishes a lunge in between', () => {
  for (const seed of seeds) {
    const { hazards } = simulate(phasesFor(seed), clean, 'top');
    const drops = hazards.filter(h => h.kind === 'drop');
    for (const [i, d] of drops.entries()) {
      // A dash pressed the moment a wave shows (its build, or the speakers recharging) is back before it is too late
      assert.ok(d.cue + DASH_CYCLE_MS <= d.at + DROP_GRACE_MS - 50, `a dash at its cue is not back in time`);
      const prev = drops[i - 1];
      if (!prev || prev.step !== d.step) continue;
      // A second wave: whoever bounced the first, however late, has the dash back for it...
      assert.ok(prev.at + DROP_GRACE_MS + DASH_CYCLE_MS <= d.at + DROP_GRACE_MS, 'the bounce dash is not back for the second wave');
      // ...but a lunge at the speakers once the first has gone by leaves none
      assert.ok(prev.at + 300 + DASH_CYCLE_MS > d.at + DROP_GRACE_MS, 'a lunge between the waves goes unpunished');
    }
  }
});

test('a drop bounced at the last moment is worth more, and a player who times it there gets it', () => {
  for (const seed of seeds.slice(0, 40)) {
    const run = simulate(phasesFor(seed), clean, 'top');
    const drops = run.hazards.filter(h => h.kind === 'drop' && h.resolved).length;
    assert.ok(run.tight > 0 && run.tight <= drops, `seed ${seed}: ${run.tight} of ${drops}`);
  }
  assert.ok(DROP_TIGHT_BONUS > 0 && DROP_TIGHT_MS > 0 && DROP_TIGHT_MS + DROP_GRACE_MS >= 300, 'a last-moment window a person can hit');
});

// The second boss: harder than Pani Lodzia, not a wall. A person who misreads a lane now and then dies some of the time,
// and only once he presses (his phase two and three); phase one never kills them
test('a person with 400-600 ms reactions who misreads 10% of lanes survives most fights, and dies, if at all, after phase one', () => {
  let runs = 0;
  let died = 0;
  for (const seed of seeds.slice(0, 60)) {
    for (const start of ['top', 'bottom'] as const) {
      for (let r = 0; r < 3; r++) {
        runs++;
        const run = simulate(phasesFor(seed), person(seed * 31 + r * 7 + 1, 0.1), start);
        if (!run.died) continue;
        died++;
        assert.ok(run.cause!.phase > 0, `seed ${seed}: died in phase one to a ${run.cause!.kind}`);
      }
    }
  }
  assert.ok(died / runs >= 0.03 && died / runs <= 0.3, `${(100 * died / runs).toFixed(1)}% died`);
});

test('the drop is a front on both lanes: a 400 ms player dashes into it from the moment it moves, and "dash when it reaches me" works', () => {
  for (const travel of [FIRST_DROP_TRAVEL, DROP_TRAVEL_1, DROP_TRAVEL]) {
    const fire = 0;
    const arrive = travel;
    // From the front leaving (it moves from that moment), anyone pressing within 400 ms bounces it
    for (let r = 0; r <= HUMAN_MS; r += 5) assert.ok(frontMeets(fire + r, fire, arrive), `travel ${travel}: a press ${r} ms after it leaves misses`);
    // Pressing as it reaches the roach, or a little after (it is a few tiles wide), still carries the roach into it
    for (let late = 0; late <= DROP_GRACE_MS; late += 5) assert.ok(frontMeets(arrive + late, fire, arrive), `travel ${travel}: ${late} ms late`);
    assert.ok(!frontMeets(arrive + DROP_GRACE_MS + 1, fire, arrive), 'once it is in, it is too late');
    // So the window to press in is long: everything from the front leaving to it being in
    let window = 0;
    for (let p = fire - 1000; p <= arrive + 500; p++) if (frontMeets(p, fire, arrive)) window++;
    assert.ok(window >= 900, `travel ${travel}: a ${window} ms window`);
  }
  // Both lanes at once: hopping never helps, only the dash; and every drop in a fight is a front
  for (const seed of seeds.slice(0, 20)) {
    for (const h of simulate(phasesFor(seed), clean, 'top').hazards.filter(x => x.kind === 'drop')) {
      assert.equal(h.lane, 'both');
      assert.ok(h.parry && h.lasts === DROP_GRACE_MS);
    }
  }
});

test('a daily seed gives everyone the same set, and another day another one', () => {
  assert.deepEqual(phasesFor(20261111), phasesFor(20261111));
  const days = new Set(Array.from({ length: 20 }, (_, i) => JSON.stringify(phasesFor(20261111 + i))));
  assert.ok(days.size > 5);
});
