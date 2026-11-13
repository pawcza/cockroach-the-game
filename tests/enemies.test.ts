import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DASH_COOLDOWN, DASH_DURATION, DASH_SPEED_BOOST } from '../src/config/constants';
import { LEVELS } from '../src/config/levels';
import { SeededRNG } from '../src/multiplayer/SeededRNG';
import {
  CAT_FRAMES, EnemyPlan, Lane, ROACH_BACK, ROACH_FRONT, Vacuum, laneY, newVacuum, otherLane, stepVacuum,
} from '../src/objects/obstacles/behaviours';
import {
  CAST, CourseClock, ENEMIES, EnemyId, OWN_PATTERN, TIMINGS, CENTIPEDE_LEAD, VACUUM, bodyOf, castFor, chaseFor, enemyState,
  nominalCourse,
} from '../src/objects/obstacles/cast';
import { BOSS_RESUME_PX, BOSS_RUNWAY_PX, CourseLayout, SlotItem, bossX, courseEnd } from '../src/systems/CourseLayout';
import { beatSpacing } from '../src/systems/RunPatterns';
import { Laid, simulate } from './support/enemySim';

// ── The course every client lays ─────────────────────────────────────────

const SLOT_X0 = 1000;

function layCourse(seed: number, level: number, slots: number, clock?: CourseClock): Laid[] {
  const layout = new CourseLayout(new SeededRNG(seed), clock);
  return Array.from({ length: slots }, (_, i) => {
    const x = SLOT_X0 + i * beatSpacing(level);
    return { x, items: layout.next(x, level) };
  });
}

test('every enemy\'s art size matches its frame in the atlas', () => {
  const atlas = JSON.parse(readFileSync('public/assets/sprites.json', 'utf8')) as {
    frames: Record<string, { frame: { w: number; h: number }; anchor?: { y: number }; pivot?: { y: number } }>;
  };
  for (const def of Object.values(ENEMIES)) {
    const frame = atlas.frames[`${def.art}_0`];
    assert.ok(frame, `${def.art} is in the atlas`);
    assert.equal(def.frame.w, frame.frame.w, `${def.id} width`);
    assert.equal(def.frame.h, frame.frame.h, `${def.id} height`);
    assert.ok(Math.abs(def.frame.pivotY - (frame.anchor ?? frame.pivot)!.y) < 1e-3, `${def.id} baseline`);
  }
});

test('one seed lays one course, whatever each client\'s roach is doing', () => {
  const seed = 0xc0ffee;
  const slots = 1200;
  const levelAt = (i: number): number => 1 + Math.floor(i / 120);
  const xAt = (i: number): number => SLOT_X0 + i * 260;

  // Client A lays slot by slot
  const a = new CourseLayout(new SeededRNG(seed));
  const laidA = Array.from({ length: slots }, (_, i) => a.next(xAt(i), levelAt(i)));

  // Client B: a faster roach that dashes, so its slots come in bursts at other moments, with no dash yet (it skips the
  // walls), and not one unseeded draw allowed while it lays
  const b = new CourseLayout(new SeededRNG(seed));
  const random = Math.random;
  Math.random = () => { throw new Error('the seeded course drew from Math.random'); };
  const laidB: SlotItem[][] = [];
  try {
    let i = 0;
    for (const burst of [1, 7, 3, 30, 2, 50, 5, 100, 202, 400, 400]) {
      for (let k = 0; k < burst && i < slots; k++, i++) laidB.push(b.next(xAt(i), levelAt(i)));
    }
  } finally {
    Math.random = random;
  }
  const withoutWalls = (items: SlotItem[]): SlotItem[] => items.filter(item => item.kind !== 'wall');
  assert.deepEqual(laidB.map(withoutWalls), laidA.map(withoutWalls));

  // Where every enemy stands and what it is doing depends only on the run clock: both clients agree at every moment,
  // although each sees it at its own (A's roach runs 200 px/s, B's 680 with dashes)
  const plans = laidA.flat().flatMap(item => (item.kind === 'enemy' ? [item.plan] : []));
  const plansB = laidB.flat().flatMap(item => (item.kind === 'enemy' ? [item.plan] : []));
  assert.ok(plans.length > 150);
  for (let p = 0; p < plans.length; p++) {
    for (const t of [0, 1234, 60_000, 123_456, 400_000]) {
      assert.deepEqual(enemyState(plansB[p], t), enemyState(plans[p], t));
    }
  }
  const kinds = new Set(plans.map(plan => plan.id));
  assert.ok(kinds.size >= 10, `only ${[...kinds].join(', ')}`);
});

test('the cast: each level fields what it introduces, and levels 1-2 only what hops alone can beat', () => {
  for (let level = 1; level <= 10; level++) {
    const ids = castFor(level).map(e => e.def.id);
    if (level > 1) {
      const before = new Set(castFor(level - 1).map(e => e.def.id));
      const newcomers = ids.filter(id => !before.has(id));
      const top = Math.max(...castFor(level).map(e => e.weight));
      // Those laid only by their own patterns (the light, the mop, the chaser...) don't go by weight
      for (const id of newcomers.filter(n => !OWN_PATTERN.has(ENEMIES[n].role))) {
        assert.equal(CAST[level][id], top, `level ${level} favours its newcomer ${id}`);
      }
    }
    if (level <= 2) {
      const hopAct = ['onion', 'glue', 'flipper', 'bleach', 'spray', 'lamp', 'mop'];
      assert.ok(ids.every(id => hopAct.includes(id)), `level ${level}: ${ids}`);
    }
  }
  // The static enemies are no longer most of a level
  for (let level = 2; level <= 10; level++) {
    const cast = castFor(level);
    const total = cast.reduce((sum, e) => sum + e.weight, 0);
    const blockers = cast.filter(e => e.def.role === 'blocker').reduce((sum, e) => sum + e.weight, 0);
    assert.ok(blockers / total < 0.35, `level ${level} is ${Math.round((blockers / total) * 100)}% blockers`);
  }
});

/** The roach's speed range on a level: from a dasher arriving early (less time boost) to the nominal runner leaving it. */
function speeds(level: number): number[] {
  const from = LEVELS.find(l => l.level === level)!.distanceThreshold * 50 + 150;
  const to = (LEVELS.find(l => l.level === level + 1)?.distanceThreshold ?? 2600) * 50 + 150;
  return [Math.max(200, nominalCourse.speedAt(from) - 60), nominalCourse.speedAt(from), nominalCourse.speedAt(to)];
}

const REACTION_MS = 250;

/** A clock for the simulated runner, so a chaser meets it on time at its slot as it meets the nominal runner. */
const steadyClock = (startX: number, speed: number): CourseClock => ({
  timeAt: x => ((x - startX) / speed) * 1000,
  speedAt: () => speed,
});

for (let level = 1; level <= 10; level++) {
  test(`level ${level}: a player with ${level <= 2 ? 'hops only' : 'hops (and the dash for walls)'} who reads the telegraphs survives`, () => {
    const failures: string[] = [];
    for (const speed of speeds(level)) {
      for (let seed = 1; seed <= 12; seed++) {
        const startX = SLOT_X0 - 900;
        const course = layCourse(seed * 7919 + level, level, 90, steadyClock(startX, speed));
        const result = simulate(course, { level, speed, reaction: REACTION_MS, dash: level >= 3 }, startX);
        if (result.died) failures.push(`seed ${seed} at ${Math.round(speed)} px/s: ${result.by} at x=${Math.round(result.x)}`);
      }
    }
    assert.deepEqual(failures, []);
  });
}

/**
 * The dash act without the dash: everything but the walls (a wall and the spray's cloud wall are the only things that
 * need it) must still be beaten by hops alone. The vacuum hunts the roach itself and is the dash's own: its tests are
 * below (── The vacuum).
 */
for (let level = 3; level <= 6; level++) {
  test(`level ${level}: hops alone beat everything but the walls`, () => {
    const failures: string[] = [];
    for (const speed of speeds(level)) {
      for (let seed = 1; seed <= 12; seed++) {
        const startX = SLOT_X0 - 900;
        const course = layCourse(seed * 7919 + level, level, 90, steadyClock(startX, speed))
          .map(slot => ({ x: slot.x, items: slot.items.filter(i => i.kind !== 'wall' && i.kind !== 'cloud') }));
        const result = simulate(course, { level, speed, reaction: REACTION_MS, dash: false }, startX);
        if (result.died) failures.push(`seed ${seed} at ${Math.round(speed)} px/s: ${result.by} at x=${Math.round(result.x)}`);
      }
    }
    assert.deepEqual(failures, []);
  });
}

test('the dash is needed only for walls: every cloud wall and wall is laid with the dash owned', () => {
  // A course laid with no dash yet keeps its cloud walls out like its walls (SpawnManager skips both): here, that both
  // are the only items whose zones close both lanes at once
  for (let seed = 1; seed <= 6; seed++) {
    for (const slot of layCourse(seed, 5, 300)) {
      for (const item of slot.items) {
        if (item.kind !== 'enemy') continue;
        for (let t = 0; t < 6000; t += 50) {
          const lanes = new Set(enemyState(item.plan, t).zones.filter(z => z.x1 > slot.x - 40 && z.x0 < slot.x + 40).map(z => z.lane));
          assert.ok(lanes.size < 2, `${item.plan.id} shuts both lanes at once`);
        }
      }
    }
  }
});

/**
 * The slowest reaction each telegraphing enemy allows when it is alone in the course, at every phase of its rhythm, in
 * either lane, from the slowest roach to the fastest: what a player must manage, from its first readable cue.
 */
const MIN_REACTION_MS: Partial<Record<EnemyId, number>> = {
  flipper: 750, spray: 525, newspaper: 750, bird: 675, cat: 400, catChase: 625, bison: 600,
  bleach: 750, lamp: 350, mop: 500,
  hen: 500, frog: 525, centipede: 1050, boots: 600, hedgehog: 575,
  gull: 550, zapper: 450, robotVacuum: 650, repeller: 500, bait: 625,
};

test('each telegraphing enemy, alone, can be read within its stated reaction time at any phase and speed', () => {
  const failures: string[] = [];
  for (const [id, reaction] of Object.entries(MIN_REACTION_MS) as [EnemyId, number][]) {
    // The light is only on levels 2-6: up to 400 px/s
    for (const speed of id === 'lamp' ? [200, 300, 400] : [200, 400, 680]) {
      for (let phase = 0; phase < 6000; phase += 263) {
        for (const lane of ['top', 'bottom'] as Lane[]) {
          const startX = SLOT_X0 - 900;
          const x = SLOT_X0 + 400;
          const plan: EnemyPlan = { id, x, lane, phase };
          if (id === 'catChase') plan.chase = chaseFor(x, steadyClock(startX, speed));
          if (id === 'centipede') {
            const meetAt = ((x - startX) / speed) * 1000;
            plan.chase = { meetAt, speed, startAt: meetAt - CENTIPEDE_LEAD };
          }
          const course: Laid[] = [{ x, items: [{ kind: 'enemy', plan }] }, { x: x + 900, items: [] }];
          const result = simulate(course, { level: 10, speed, reaction, dash: false }, startX);
          if (result.died) failures.push(`${id} ${lane} phase ${phase} at ${speed} px/s`);
        }
      }
    }
  }
  assert.deepEqual(failures.slice(0, 20), []);
});

test('enemies hurt only low over their lane', () => {
  // Every zone's lane is the lane the enemy stands in or over, and nothing up high or far back has a zone
  for (const id of ['flipper', 'newspaper', 'bird'] as EnemyId[]) {
    for (let t = 0; t < 8000; t += 10) {
      const s = enemyState({ id, x: 0, lane: 'top', phase: 0 }, t);
      for (const z of s.zones) {
        assert.equal(z.lane, s.lane);
        assert.ok(laneY(z.lane) - s.y < 40, `${id} hurts from ${laneY(z.lane) - s.y} px up`);
      }
    }
  }
});

test('the course stops in an empty runway short of each boss and picks up past it, the same on every client', () => {
  assert.equal(courseEnd([]), Infinity);
  assert.equal(courseEnd([1200, 250]), bossX(250) - BOSS_RUNWAY_PX);
  // SpawnManager's loop: slots every beat up to the course's end; a beaten boss moves it on, and the course resumes a
  // fixed distance past the boss
  const lay = (triggers: number[], seed: number): { x: number; items: SlotItem[] }[] => {
    const layout = new CourseLayout(new SeededRNG(seed));
    let bosses = [...triggers];
    let next = 550;
    const laid: { x: number; items: SlotItem[] }[] = [];
    for (let roach = 0; roach < bossX(2700); roach += 100) {
      // The roach meets a boss and beats it
      const due = bosses.find(m => roach >= bossX(m));
      if (due !== undefined) {
        bosses = bosses.filter(m => m > due);
        next = Math.max(next, bossX(due) + BOSS_RESUME_PX);
      }
      const end = courseEnd(bosses);
      while (next <= roach + 1700 && next < end) {
        const level = Math.min(10, 1 + LEVELS.filter(l => l.distanceThreshold * 50 + 150 <= next).length - 1);
        laid.push({ x: next, items: layout.next(next, level) });
        next += beatSpacing(level);
      }
    }
    return laid;
  };
  const solo = [250, 1200, 1800, 2600];
  const laid = lay(solo, 99);
  for (const m of solo) {
    const inRunway = laid.filter(s => s.x >= bossX(m) - BOSS_RUNWAY_PX && s.x < bossX(m) + BOSS_RESUME_PX);
    assert.deepEqual(inRunway.map(s => s.x), [], `slots round the boss at ${m} m`);
    assert.ok(laid.some(s => s.x >= bossX(m) + BOSS_RESUME_PX), `the course goes on after ${m} m`);
  }
  // Two clients of a match (its one boss at 1800 m) lay the same slots
  assert.deepEqual(lay([1800], 7), lay([1800], 7));
  assert.ok(lay([1800], 7).some(s => s.x > bossX(250) && s.x < bossX(1200)), 'a match has no runway at the solo bosses');
});

// ── The cat: a look before every swap, and a grace after it ──────────────

/** A person's reaction: what the cat's tell must give before it lands in the lane the player just hopped to. */
const PLAYER_REACTION_MS = 400;
/** How long after landing the cat sits before it may look again. */
const CAT_GRACE_MS = 1000;

interface CatLeap {
  from: Lane;
  to: Lane;
  /** When its look began, when it left the ground, when it landed and when its next look began (run ms). */
  lookAt: number;
  leapAt: number;
  landAt: number;
  nextLookAt: number;
  /** The frame it showed at each step of the look. */
  look: (number | undefined)[];
}

/** Every leap a cat makes between 3 s and `until`, read off its states every 5 ms. */
function catLeaps(plan: EnemyPlan, until: number): CatLeap[] {
  const step = 5;
  const states: ReturnType<typeof enemyState>[] = [];
  for (let t = 0; t <= until; t += step) states.push(enemyState(plan, t));
  const leaps: CatLeap[] = [];
  for (let i = 3000 / step; i < states.length; i++) {
    if (states[i].pose !== 'air' || states[i - 1].pose === 'air') continue;
    let look = i;
    while (states[look - 1].pose === 'windup') look--;
    let land = i;
    while (land < states.length && states[land].pose === 'air') land++;
    let next = land;
    while (next < states.length && states[next].pose !== 'windup') next++;
    if (next >= states.length) break;
    leaps.push({
      from: states[i - 1].lane!, to: states[land].lane!, lookAt: look * step, leapAt: i * step, landAt: land * step,
      nextLookAt: next * step, look: states.slice(look, i).map(s => s.frame),
    });
  }
  return leaps;
}

const catPlans = (): EnemyPlan[] => (['top', 'bottom'] as Lane[]).flatMap(lane =>
  Array.from({ length: 16 }, (_, i) => ({ id: 'cat', x: 0, lane, phase: i * 370 })));

test('the cat looks up or down at the lane it will leap to for 400 ms or more before every leap, whichever way', () => {
  let seen = 0;
  for (const plan of catPlans()) {
    for (const leap of catLeaps(plan, 30_000)) {
      seen++;
      const label = `${plan.lane} phase ${plan.phase}`;
      assert.equal(leap.to, otherLane(leap.from), label);
      assert.ok(leap.leapAt - leap.lookAt >= PLAYER_REACTION_MS, `${label}: looks for ${leap.leapAt - leap.lookAt} ms`);
      const frames = CAT_FRAMES.look[leap.to === 'top' ? 'up' : 'down'] as readonly number[];
      assert.ok(leap.look.every(f => f !== undefined && frames.includes(f)), `${label}: looks the wrong way`);
      assert.equal(leap.look[leap.look.length - 1], frames[1], `${label}: ends looking straight at it`);
    }
  }
  assert.ok(seen > 200, `${seen} leaps`);
});

test('the cat hurts the lane it lands in from its look on: 400 ms of warning before it lands', () => {
  for (const plan of catPlans()) {
    for (const leap of catLeaps(plan, 30_000)) {
      const zone = enemyState(plan, leap.landAt).zones.find(z => z.lane === leap.to);
      assert.ok(zone, 'it hurts where it lands');
      assert.ok(leap.landAt - zone.since >= PLAYER_REACTION_MS, `${leap.landAt - zone.since} ms of warning`);
      assert.ok(zone.since <= leap.lookAt, 'readable from the first frame of its look');
    }
  }
});

test('after landing the cat sits for a second before its next look: nobody it just missed is caught by its return', () => {
  for (const plan of catPlans()) {
    for (const leap of catLeaps(plan, 30_000)) {
      assert.ok(leap.nextLookAt - leap.landAt >= CAT_GRACE_MS, `${plan.lane} ${plan.phase}: ${leap.nextLookAt - leap.landAt} ms`);    }
  }
});

test('a player with a 400 ms reaction survives a cat alone at every speed it appears at', () => {
  const failures: string[] = [];
  for (let level = 5; level <= 10; level++) {
    for (const speed of speeds(level)) {
      for (let phase = 0; phase < 6000; phase += 97) {
        for (const lane of ['top', 'bottom'] as Lane[]) {
          const startX = SLOT_X0 - 900;
          const x = SLOT_X0 + 400;
          const course: Laid[] = [{ x, items: [{ kind: 'enemy', plan: { id: 'cat', x, lane, phase } }] }, { x: x + 900, items: [] }];
          const result = simulate(course, { level, speed, reaction: PLAYER_REACTION_MS, dash: false }, startX);
          if (result.died) failures.push(`level ${level} ${lane} phase ${phase} at ${Math.round(speed)} px/s`);
        }
      }
    }
  }
  assert.deepEqual(failures.slice(0, 20), []);
});

// ── The dance line: pairs of boots on one shared beat ────────────────────

test('a 400 ms player without the dash gets through every dance line the course lays, at any point of the beat', () => {
  const failures: string[] = [];
  for (const level of [6, 7]) {
    // The boots the course lays, in lines: pairs no more than a few slots apart
    const lines: EnemyPlan[][] = [];
    for (let seed = 1; seed <= 3; seed++) {
      let line: EnemyPlan[] = [];
      for (const slot of layCourse(seed * 104_729 + level, level, 400)) {
        for (const item of slot.items) {
          if (item.kind !== 'enemy' || item.plan.id !== 'boots') continue;
          if (line.length > 0 && item.plan.x - line[line.length - 1].x > 4 * beatSpacing(level)) { lines.push(line); line = []; }
          line.push(item.plan);
        }
      }
      if (line.length > 0) lines.push(line);
    }
    assert.ok(lines.some(line => line.length >= 3), `level ${level} lays no dance line`);
    for (const line of lines) {
      for (const speed of speeds(level)) {
        // The pairs stomp on the run's clock: starting the roach a little further back meets them at another point of it
        for (let beat = 0; beat < TIMINGS.boots.beat * 2; beat += 100) {
          const startX = line[0].x - 1900 - (beat * speed) / 1000;
          const course: Laid[] = line.map(plan => ({ x: plan.x, items: [{ kind: 'enemy' as const, plan }] }));
          course.push({ x: line[line.length - 1].x + 400, items: [] });
          const result = simulate(course, { level, speed, reaction: PLAYER_REACTION_MS, dash: false }, startX);
          if (result.died) failures.push(`level ${level}, ${line.length} pairs, ${Math.round(speed)} px/s, beat +${beat}: pair ${line.findIndex(p => p.x + 60 > result.x) + 1}`);
        }
      }
    }
  }
  assert.deepEqual(failures.slice(0, 20), []);
});

// ── Landing shadows: where a hit will come down, and for how long it has been shown ──────────────────────────────

/** Each enemy that comes down onto a lane, and its tell in ms: its landing shadow is shown at least that long. */
const LANDERS: Partial<Record<EnemyId, { tell: number; exact: boolean }>> = {
  flipper: { tell: TIMINGS.flipper.windup, exact: true },
  newspaper: { tell: TIMINGS.newspaper.windup, exact: true },
  bird: { tell: TIMINGS.bird.windup, exact: false },
  gull: { tell: TIMINGS.gull.windup, exact: false },
  hen: { tell: TIMINGS.hen.windup, exact: true },
  boots: { tell: TIMINGS.boots.beat, exact: true },
  cat: { tell: TIMINGS.cat.look, exact: true },
  centipede: { tell: TIMINGS.centipede.warn, exact: true },
};

function landerPlan(id: EnemyId, lane: Lane, phase: number): EnemyPlan {
  const plan: EnemyPlan = { id, x: 2000, lane, phase };
  if (id === 'centipede') plan.chase = { meetAt: 5000, speed: 300, startAt: 5000 - CENTIPEDE_LEAD };
  return plan;
}

test('a landing shadow sits where the hurt zone appears, is shown for at least the enemy\'s tell, and goes when it lands', () => {
  const STEP = 5;
  for (const [id, { tell, exact }] of Object.entries(LANDERS) as [EnemyId, { tell: number; exact: boolean }][]) {
    let episodes = 0;
    for (const lane of ['top', 'bottom'] as Lane[]) {
      for (let phase = 0; phase < 6000; phase += 400) {
        const plan = landerPlan(id, lane, phase);
        const until = id === 'centipede' ? 8000 : 14_000;
        for (const shadowLane of ['top', 'bottom'] as Lane[]) {
          let from: number | null = null;
          let last: { x0: number; x1: number; progress: number } | null = null;
          for (let t = 0; t <= until + STEP; t += STEP) {
            const now = enemyState(plan, t);
            const l = now.landings?.find(x => x.lane === shadowLane);
            if (l) {
              if (from === null) from = t;
              assert.ok(l.progress >= 0 && l.progress <= 1, `${id}: progress ${l.progress}`);
              if (last) assert.ok(l.progress >= last.progress - 1e-9, `${id}: progress went back at ${t}`);
              last = l;
              continue;
            }
            if (from === null || !last) continue;
            // One already showing at run time 0 began before the clock did: nothing to measure
            if (from === 0) { from = null; last = null; continue; }
            // It is gone: from here the hit must hurt that spot within a moment, no later
            episodes++;
            const centre = (last.x0 + last.x1) / 2;
            let hitAt: number | null = null;
            let zone: { x0: number; x1: number } | undefined;
            for (let u = t; u <= t + 300; u += STEP) {
              zone = enemyState(plan, u).zones.find(z => z.lane === shadowLane && z.x0 <= centre && z.x1 >= centre);
              if (zone) { hitAt = u; break; }
            }
            const label = `${id} ${lane} phase ${phase}, shadow in ${shadowLane}`;
            assert.ok(hitAt !== null, `${label}: nothing hurts under the shadow once it is gone`);
            assert.ok(last.progress > 0.85, `${label}: it goes at ${last.progress} of the way`);
            assert.ok(hitAt! - from >= tell, `${label}: shown ${hitAt! - from} ms before it hurts, its tell is ${tell}`);
            if (exact) {
              assert.ok(Math.abs(zone!.x0 - last.x0) < 1e-6 && Math.abs(zone!.x1 - last.x1) < 1e-6, `${label}: its spot is not the zone`);
            }
            from = null;
            last = null;
          }
        }
      }
    }
    assert.ok(episodes >= 10, `${id}: only ${episodes} landings seen`);
  }
});

test('nothing else shows a landing shadow, and none when the enemy hurts where it stands', () => {
  for (const id of Object.keys(ENEMIES) as EnemyId[]) {
    if (id in LANDERS || id === 'wasp') continue;
    for (const lane of ['top', 'bottom'] as Lane[]) {
      const plan = landerPlan(id, lane, 0);
      if (id === 'catChase') plan.chase = chaseFor(plan.x, steadyClock(1100, 300));
      for (let t = 0; t < 12_000; t += 20) assert.equal(enemyState(plan, t).landings, undefined, `${id} at ${t}`);
    }
  }
});

test('the spray\'s cloud kills over exactly the stretch it covers, and that stretch warns while the can shakes', () => {
  const half = bodyOf(ENEMIES.spray).half;
  const x = 500;
  const stretch = { x0: x - half - TIMINGS.spray.reach, x1: x - half };
  assert.ok(Number.isFinite(stretch.x0), 'a stretch, not a lane');
  const seen = { windup: 0, strike: 0, idle: 0 };
  for (const lane of ['top', 'bottom'] as Lane[]) {
    for (let t = 0; t < 8000; t += 5) {
      const s = enemyState({ id: 'spray', x, lane, phase: 0 }, t);
      const cloud = s.zones.filter(z => z.x0 === stretch.x0 && z.x1 === stretch.x1);
      const warns = s.warn && { x0: s.warn.x0, x1: s.warn.x1, lane: s.warn.lane };
      if (s.pose === 'strike') {
        assert.equal(cloud.length, 1, `the cloud kills at ${t}`);
        assert.equal(cloud[0].lane, lane);
        assert.deepEqual(warns, { ...stretch, lane }, 'the kill zone is drawn over it');
      } else {
        assert.equal(cloud.length, 0, `no cloud kills at ${t} (${s.pose})`);
        if (s.pose === 'windup') assert.deepEqual(warns, { ...stretch, lane }, 'the warning is over it');
        else assert.equal(s.warn, undefined, 'nothing warns while it rests');
      }
      seen[s.pose as 'windup' | 'strike' | 'idle']++;
    }
  }
  assert.ok(seen.windup > 0 && seen.strike > 0 && seen.idle > 0);
  // The baked cloud's core is the stretch: its frame is that many texels plus the 3 it billows past either side (vfx.py)
  const vfx = JSON.parse(readFileSync('public/assets/vfx.json', 'utf8')) as { frames: Record<string, { frame: { w: number } }> };
  assert.equal((vfx.frames['spray-cloud_0'].frame.w - 3 * 2) * 2, TIMINGS.spray.reach);
});

test('a hand-tuned shift moves the frog\'s body zone with its picture but not its tongue, and not the bleach\'s wet spot', () => {
  const half = bodyOf(ENEMIES.frog).half;
  const dx = ENEMIES.frog.place!.dx!;
  const frog: EnemyPlan = { id: 'frog', x: 500, lane: 'bottom', phase: 0 };
  const idle = enemyState(frog, 0);
  assert.equal(idle.zones[0].x0, 500 + dx - half);
  assert.equal(idle.zones[0].x1, 500 + dx + half);
  const out = enemyState(frog, TIMINGS.frog.idle + TIMINGS.frog.windup + TIMINGS.frog.shoot + 10);
  assert.equal(out.zones.length, 2);
  assert.equal(out.zones[1].x1, 500 - TIMINGS.frog.mouth);
  const spot = enemyState({ id: 'bleach', x: 500, lane: 'bottom', phase: 0 }, 0).zones[0];
  assert.equal(spot.x0, 500 - TIMINGS.bleach.spot / 2);
  assert.equal(spot.x1, 500 + TIMINGS.bleach.spot / 2);
});

// ── The skim: what the gull and the pigeon sweep along their lane once they have landed ──────────────────────────

test('a swooper warns the stretch it will skim from its screech on, and the zone is deadly only inside it', () => {
  const STEP = 5;
  for (const id of ['bird', 'gull'] as const) {
    const tell = TIMINGS[id].windup;
    let episodes = 0;
    for (const lane of ['top', 'bottom'] as Lane[]) {
      for (let phase = 0; phase < 6000; phase += 400) {
        const plan: EnemyPlan = { id, x: 2000, lane, phase };
        let from: number | null = null;
        let stretch: { lane: Lane; x0: number; x1: number } | null = null;
        let firstHurt: number | null = null;
        let lastHurt = 0;
        const glide = { x0: Infinity, x1: -Infinity };
        const close = (t: number): void => {
          if (from === null || !stretch) return;
          const label = `${id} ${lane} phase ${phase} at ${t}`;
          // One already showing at run time 0 began before the clock did: nothing to measure
          if (from > 0) {
            episodes++;
            assert.ok(firstHurt !== null, `${label}: warned and never hurt`);
            assert.ok(firstHurt! - from >= tell, `${label}: warned ${firstHurt! - from} ms before it hurts, its tell is ${tell}`);
            assert.ok(t - lastHurt <= STEP * 2, `${label}: still warned ${t - lastHurt} ms after it stopped hurting`);
            // What the glide covers is the stretch: the end of the glide to where it touched down, body width included
            assert.ok(glide.x0 < Infinity, `${label}: no glide`);
            assert.ok(Math.abs(glide.x0 - stretch.x0) < 1e-6, `${label}: the stretch ends at ${stretch.x0}, the glide at ${glide.x0}`);
            const over = stretch.x1 - glide.x1;
            assert.ok(over >= -1e-6 && over < 8, `${label}: the stretch starts ${over} px past where the glide does`);
          }
          from = null;
          stretch = null;
          firstHurt = null;
          glide.x0 = Infinity;
          glide.x1 = -Infinity;
        };
        for (let t = 0; t <= 14_000; t += STEP) {
          const now = enemyState(plan, t);
          if (now.zones.length > 0 && !now.warn) assert.fail(`${id} ${lane} phase ${phase} at ${t}: it hurts and nothing is warned`);
          if (!now.warn) { close(t); continue; }
          if (from === null) { from = t; stretch = { ...now.warn }; }
          assert.deepEqual({ ...now.warn, level: 0 }, { ...stretch!, level: 0 }, `${id} at ${t}: the stretch moved`);
          const l = now.landings?.[0];
          if (l) assert.ok(l.x0 >= stretch!.x0 - 1e-6 && l.x1 <= stretch!.x1 + 1e-6, `${id} at ${t}: its landing is outside the stretch`);
          for (const z of now.zones) {
            assert.ok(z.lane === stretch!.lane && z.x0 >= stretch!.x0 - 1e-6 && z.x1 <= stretch!.x1 + 1e-6, `${id} at ${t}: hurts outside the warned stretch`);
            if (firstHurt === null) firstHurt = t;
            lastHurt = t;
            // On the ground: the glide, and the touchdown that starts it
            if (now.y >= laneY(z.lane) - 1e-6) { glide.x0 = Math.min(glide.x0, z.x0); glide.x1 = Math.max(glide.x1, z.x1); }
          }
        }
      }
    }
    assert.ok(episodes >= 10, `${id}: only ${episodes} skims seen`);
  }
});

// ── The vacuum: it hunts the roach from behind ───────────────────────────

/** The roach stands this far in from the screen's left edge (the camera's follow offset, on the narrowest screen). */
const SCREEN_BEHIND = 200;
/** ...and on a wide one (1280 px of world across, as a 16:9 window shows it). */
const WIDE_BEHIND = 440;
/** Steps of the vacuum's simulation, ms. */
const VACUUM_STEP = 10;

interface VacuumRun {
  caught: boolean;
  /** ms from its nozzle first showing on screen to the bite. */
  shownFor: number;
  /** It let go and went. */
  gone: boolean;
  dashes: number;
  /** ms from the roach reaching its slot to the vacuum being gone. */
  lasted: number;
  /** Its lane at each step, null while it swings between the lanes. */
  lanes: (Lane | null)[];
}

interface VacuumSeen { v: Vacuum; shownFor: number; lane: Lane }

/**
 * A roach running at `speed` into a vacuum laid in its lane; `act` says each step whether it dashes or hops. The roach
 * moves as Player.updateSpeed moves it: its cruise less the vacuum's pull, or its cruise plus the dash's boost (and no
 * pull) while it dashes. `cooldown`: ms after the nozzle first shows before the dash is ready (it was just spent).
 */
function vacuumRun(speed: number, lane: Lane, act: (seen: VacuumSeen) => 'dash' | 'hop' | null, cooldown = 0, behind = SCREEN_BEHIND): VacuumRun {
  const plan: EnemyPlan = { id: 'vacuum', x: 3000, lane, phase: 0 };
  const v = newVacuum(lane);
  let x = 2000;
  let roachLane: Lane = lane;
  let dashUntil = -Infinity;
  let readyAt = 0;
  let shownAt = Infinity;
  let startAt = Infinity;
  let dashes = 0;
  let pull = 0;
  const lanes: (Lane | null)[] = [];
  const end = (caught: boolean, ms: number): VacuumRun =>
    ({ caught, shownFor: ms - shownAt, gone: v.phase === 'gone', dashes, lasted: ms - startAt, lanes });
  for (let ms = 0; ms < 20_000; ms += VACUUM_STEP) {
    // This step's speed: the pull asked for last step, or none while it dashes
    const now = ms < dashUntil ? speed + DASH_SPEED_BOOST : speed * (1 - pull);
    const step = stepVacuum(v, VACUUM, plan, VACUUM_STEP, { x, lane: roachLane, speed: now, cruise: speed, edge: behind - ROACH_BACK });
    pull = step.pull;
    if (v.phase === 'waiting') { x += (now * VACUUM_STEP) / 1000; continue; }
    startAt = Math.min(startAt, ms);
    if (v.phase === 'gone') return end(false, ms);
    lanes.push(v.from === null ? v.lane : null);
    // Seen once the front of its nozzle is in from the screen's left edge
    if (shownAt === Infinity && v.phase !== 'cue' && v.nozzle > x - behind) {
      shownAt = ms;
      readyAt = ms + cooldown;
    }
    const dashing = ms < dashUntil;
    if (!dashing && step.zones.some(z => z.lane === roachLane && z.x1 >= x - ROACH_BACK && z.x0 <= x + ROACH_FRONT)) return end(true, ms);
    const what = act({ v, shownFor: ms - shownAt, lane: roachLane });
    if (what === 'dash' && !dashing && ms >= readyAt) {
      dashUntil = ms + DASH_DURATION;
      readyAt = ms + DASH_DURATION + DASH_COOLDOWN;
      dashes++;
    }
    if (what === 'hop') roachLane = otherLane(roachLane);
    x += (now * VACUUM_STEP) / 1000;
  }
  return end(false, 20_000);
}

const DASH_ACT = [3, 4, 5, 6];
const dashActSpeeds = (): number[] => [...new Set(DASH_ACT.flatMap(speeds))];

test('the vacuum: a roach that does nothing is caught, but only after its nozzle has been on screen for 2 s', () => {
  // It used to follow the course's nominal runner: a roach a dash ahead of that never saw it, one behind was run down
  // It bites well before it would give up, even settling in 20 px further back (a late frame as it slides in)
  assert.ok(((VACUUM.start + 20) / VACUUM.creep) * 1000 < VACUUM.hold, 'it gives up before it can bite');
  for (const speed of dashActSpeeds()) {
    for (const lane of ['top', 'bottom'] as Lane[]) {
      const run = vacuumRun(speed, lane, () => null);
      assert.ok(run.caught, `not caught at ${Math.round(speed)} px/s`);
      assert.ok(run.shownFor >= 2000, `on screen ${run.shownFor} ms before it bites at ${Math.round(speed)} px/s`);
    }
  }
});

test('the vacuum: one dash, 400 ms after it shows, breaks its grip; with the dash just spent, the next one does', () => {
  for (const speed of dashActSpeeds()) {
    for (const cooldown of [0, DASH_DURATION + DASH_COOLDOWN]) {
      // The player sees it, and presses the dash 400 ms later, or as soon as it is back
      const run = vacuumRun(speed, 'bottom', ({ v, shownFor }) =>
        (shownFor >= PLAYER_REACTION_MS && v.phase !== 'leave' ? 'dash' : null), cooldown);
      const label = `at ${Math.round(speed)} px/s, the dash ready ${cooldown} ms after it shows`;
      assert.ok(!run.caught, `caught ${label}`);
      assert.ok(run.gone && run.dashes === 1, `${label}: gone ${run.gone} after ${run.dashes} dashes`);
    }
  }
});

test('the vacuum: a hop buys time; it follows to the new lane after a shiver, harmless while it swings', () => {
  for (const speed of dashActSpeeds()) {
    const stays = vacuumRun(speed, 'top', () => null);
    // Steps are counted from its first after the cue began: the one the roach hops on
    let step = -1;
    let hopAt = -1;
    const hops = vacuumRun(speed, 'top', ({ shownFor }) => {
      step++;
      if (shownFor < 1000 || hopAt >= 0) return null;
      hopAt = step;
      return 'hop';
    });
    const label = `at ${Math.round(speed)} px/s`;
    assert.ok(hops.gone || (hops.caught && hops.shownFor > stays.shownFor), `${label}: caught ${hops.caught} after ${hops.shownFor} ms, ${stays.shownFor} without the hop`);
    // In the old lane until `follow` after the hop, in neither while it swings, then in the new one
    const swingAt = hops.lanes.indexOf(null);
    const thereAt = hops.lanes.indexOf('bottom');
    assert.ok(swingAt > 0 && thereAt > swingAt, `${label}: never swung over`);
    assert.ok((swingAt - hopAt) * VACUUM_STEP >= VACUUM.follow - 2 * VACUUM_STEP, `${label}: swung ${(swingAt - hopAt) * VACUUM_STEP} ms after the hop`);
    assert.ok((thereAt - swingAt) * VACUUM_STEP >= VACUUM.switch - VACUUM_STEP, `${label}: swung in ${(thereAt - swingAt) * VACUUM_STEP} ms`);
  }
});

test('the vacuum lets go before its quiet stretch of the course runs out, whatever the roach does', () => {
  const chunk = 7;
  for (const level of DASH_ACT) {
    const stretch = chunk * beatSpacing(level);
    for (const [speed, behind] of speeds(level).flatMap(s => [[s, SCREEN_BEHIND], [s, WIDE_BEHIND]])) {
      // A dasher, and a hopper that hops each time it comes close in its lane: it gives up on that one
      const dasher = vacuumRun(speed, 'bottom', ({ shownFor }) => (shownFor >= PLAYER_REACTION_MS ? 'dash' : null), 0, behind);
      const hopper = vacuumRun(speed, 'bottom', ({ v, lane }) => (v.phase === 'suck' && v.lane === lane && v.from === null && v.gap < 15 ? 'hop' : null), 0, behind);
      for (const [who, run] of [['dasher', dasher], ['hopper', hopper]] as const) {
        assert.ok(run.gone, `the ${who} at ${Math.round(speed)} px/s on level ${level}, ${behind} px behind: caught ${run.caught}`);
        const ran = (run.lasted * speed) / 1000;
        assert.ok(ran < stretch, `the ${who} at ${Math.round(speed)} px/s on level ${level}, ${behind} px behind: it lasted ${Math.round(ran)} px of ${stretch}`);
      }
    }
  }
});
