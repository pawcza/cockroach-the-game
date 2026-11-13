import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { LEVELS } from '../src/config/levels';
import { SeededRNG } from '../src/multiplayer/SeededRNG';
import { EnemyPlan, Lane, laneY } from '../src/objects/obstacles/behaviours';
import { CAST, CourseClock, ENEMIES, EnemyId, OWN_PATTERN, VACUUM_LEAD, castFor, chaseFor, enemyState, nominalCourse } from '../src/objects/obstacles/cast';
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
 * need it) must still be beaten by hops alone, the vacuum above all.
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
  flipper: 750, spray: 525, newspaper: 750, bird: 675, cat: 600, catChase: 625, bison: 600,
  bleach: 750, lamp: 350, mop: 500,
  vacuum: 700, hen: 500, frog: 525, centipede: 1050, boots: 600, hedgehog: 575,
  gull: 550, zapper: 450, robotVacuum: 650, repeller: 500, bait: 625,
};

test('each telegraphing enemy, alone, can be read within its stated reaction time at any phase and speed', () => {
  const failures: string[] = [];
  for (const [id, reaction] of Object.entries(MIN_REACTION_MS) as [EnemyId, number][]) {
    // The light is only on levels 2-6: up to 400 px/s
    // The light is on levels 2-6 only, the vacuum on 3-6: up to 400 and 450 px/s
    for (const speed of id === 'lamp' ? [200, 300, 400] : id === 'vacuum' ? [200, 300, 450] : [200, 400, 680]) {
      for (let phase = 0; phase < 6000; phase += 263) {
        for (const lane of ['top', 'bottom'] as Lane[]) {
          const startX = SLOT_X0 - 900;
          const x = SLOT_X0 + 400;
          const plan: EnemyPlan = { id, x, lane, phase };
          if (id === 'catChase') plan.chase = chaseFor(x, steadyClock(startX, speed));
          if (id === 'vacuum' || id === 'centipede') {
            const meetAt = ((x - startX) / speed) * 1000;
            plan.chase = { meetAt, speed, startAt: meetAt - VACUUM_LEAD };
          }
          const course: Laid[] = [{ x, items: [{ kind: 'enemy', plan }] }, { x: x + (id === 'vacuum' ? 3000 : 900), items: [] }];
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
