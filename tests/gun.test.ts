/**
 * The run's pistol (cockroach#100): the rules (gunRules.ts), what a bullet meets (cast.shotSpan), the ammo the course
 * lays, the jewel wasp that hunts the roach, the aerosol's blast, and that none of it reaches a match or the course.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GAME_WIDTH } from '../src/config/constants';
import { LEVELS } from '../src/config/levels';
import { SeededRNG } from '../src/multiplayer/SeededRNG';
import { EnemyPlan, Lane, ROACH_BACK, ROACH_FRONT, newWasp, stepWasp, waspDiveLane } from '../src/objects/obstacles/behaviours';
import { ENEMIES, EnemyId, TIMINGS, WASP, bodyOf, castFor, enemyState, nominalCourse, shotSpan } from '../src/objects/obstacles/cast';
import { Abilities } from '../src/systems/abilities';
import { CourseLayout, SlotItem } from '../src/systems/CourseLayout';
import { AMMO_FROM_LEVEL, AMMO_PER_BOX, Ammo, BULLET_SPEED, MAGAZINE, blastChain, caughtInBlast, firstHit } from '../src/systems/gunRules';
import { beatSpacing } from '../src/systems/RunPatterns';
import { ammoRun } from './support/ammoModel';
import { Laid, simulate } from './support/enemySim';

const speedAtLevel = (level: number): number => nominalCourse.speedAt(LEVELS.find(l => l.level === level)!.distanceThreshold * 50 + 150);
/** The fastest the gun act runs: level 10's nominal top speed, and a little more. */
const TOP_SPEED = 680;

test('the gun shoots in the run solo only: a match keeps it inside the fight', () => {
  const solo = new Abilities(false);
  const match = new Abilities(true);
  for (const kit of [solo, match]) assert.equal(kit.canShootInRun, false);
  solo.grant('gun');
  match.grant('gun');
  assert.equal(solo.canShoot, true);
  assert.equal(solo.canShootInRun, true);
  assert.equal(match.canShoot, true, 'Zlewiatan\'s gift still shoots in his fight');
  assert.equal(match.canShootInRun, false);
});

test('the magazine: a round a shot, a dry click when empty, boxes fill it to the top and no further', () => {
  const ammo = new Ammo();
  assert.equal(ammo.count, MAGAZINE);
  for (let i = 0; i < MAGAZINE; i++) assert.ok(ammo.take());
  assert.equal(ammo.take(), false);
  assert.equal(ammo.add(AMMO_PER_BOX), AMMO_PER_BOX);
  ammo.count = MAGAZINE - 1;
  assert.equal(ammo.add(AMMO_PER_BOX), 1);
  assert.equal(ammo.count, MAGAZINE);
});

test('a bullet meets the first thing in its way, never what it has already passed', () => {
  const targets = [
    { what: 'far', span: { x0: 500, x1: 540 } },
    { what: 'near', span: { x0: 300, x1: 340 } },
    { what: 'behind', span: { x0: 100, x1: 140 } },
    { what: 'away', span: null },
  ];
  assert.equal(firstHit(targets, 200, 600), 'near');
  assert.equal(firstHit(targets, 345, 600), 'far');
  assert.equal(firstHit(targets, 545, 700), null);
});

test('only the robot vacuum is tough: two bullets for it, one for everything else', () => {
  for (const def of Object.values(ENEMIES)) assert.equal(def.hits ?? 1, def.id === 'robotVacuum' ? 2 : 1, def.id);
});

test('a bullet meets an enemy where it occupies the lane: not a swatter up in its swing, a bird up high or a raised boot', () => {
  const ever = (id: EnemyId, lane: Lane, test: (t: number) => boolean): boolean => {
    for (let t = 0; t < 8000; t += 10) if (test(t)) return true;
    return false;
  };
  for (const id of ['flipper', 'newspaper', 'bird', 'gull'] as EnemyId[]) {
    const plan: EnemyPlan = { id, x: 0, lane: 'top', phase: 0 };
    // Wherever it can be met, it hurts there: up high or far back it is out of a bullet's way
    assert.ok(ever(id, 'top', t => shotSpan(plan, t, 'top') !== null), `${id} can be shot`);
    assert.ok(ever(id, 'top', t => shotSpan(plan, t, 'top') === null), `${id} is sometimes out of reach`);
    for (let t = 0; t < 8000; t += 10) {
      if (shotSpan(plan, t, 'top') || shotSpan(plan, t, 'bottom')) assert.ok(enemyState(plan, t).zones.length > 0, `${id} shot while harmless`);
    }
  }
  // A pair of boots: a bullet meets the boot that is down, not the raised one
  const boots: EnemyPlan = { id: 'boots', x: 0, lane: 'top', phase: 0 };
  for (let t = 0; t < 2000; t += 10) {
    const s = enemyState(boots, t);
    for (const lane of ['top', 'bottom'] as Lane[]) assert.equal(shotSpan(boots, t, lane) !== null, s.zones.some(z => z.lane === lane));
  }
  // A blocker is met wherever it stands in its lane, never in the other
  const onion: EnemyPlan = { id: 'onion', x: 0, lane: 'bottom', phase: 0 };
  assert.ok(shotSpan(onion, 0, 'bottom'));
  assert.equal(shotSpan(onion, 0, 'top'), null);
  // What an enemy sends out is no target: the bullet flies through the repeller's rings and the bait's gel to the thing
  for (const id of ['repeller', 'bait', 'zapper'] as EnemyId[]) {
    const plan: EnemyPlan = { id, x: 1000, lane: 'top', phase: 0 };
    const half = bodyOf(ENEMIES[id]).half;
    for (let t = 0; t < 6000; t += 50) {
      const span = shotSpan(plan, t, 'top')!;
      // The body only (the zapper shivers on its cord as it charges)
      assert.ok(Math.abs(span.x1 - span.x0 - 2 * half) < 1e-6 && Math.abs((span.x0 + span.x1) / 2 - 1000) <= 3, id);
    }
  }
});

test('nothing on levels 7-10 is out of a bullet\'s reach for good', () => {
  for (let level = 7; level <= 10; level++) {
    for (const { def } of castFor(level)) {
      if (def.id === 'wasp') continue;  // it hunts the roach: its span is its own (obstacles/wasp.ts), in its lane while it flies
      const plan: EnemyPlan = { id: def.id, x: 0, lane: def.lanes?.[0] ?? 'top', phase: 0 };
      // The centipede runs at the runner on a clock of its own
      if (def.id === 'centipede') plan.chase = { startAt: 0, meetAt: 3000, speed: 500 };
      let met = false;
      for (let t = 0; t < 8000 && !met; t += 20) met = shotSpan(plan, t, 'top') !== null || shotSpan(plan, t, 'bottom') !== null;
      assert.ok(met, `${def.id} can be shot`);
    }
  }
});

test('ammo boxes take the apples\' place in the same draw: the course is the same course, box for apple', () => {
  for (const seed of [3, 77, 4242]) {
    const plain = new CourseLayout(new SeededRNG(seed));
    const armed = new CourseLayout(new SeededRNG(seed), undefined, true);
    let boxes = 0;
    for (let i = 0; i < 1500; i++) {
      const level = 1 + Math.floor(i / 150);
      const x = 1000 + i * 300;
      const a = plain.next(x, level);
      const b = armed.next(x, level);
      const asApples = b.map((item): SlotItem => (item.kind === 'pickup' && item.group === 'ammo' ? { ...item, group: 'apples', art: 'apple' } : item));
      assert.deepEqual(asApples, a);
      for (const item of b) {
        if (item.kind !== 'pickup' || item.group !== 'ammo') continue;
        boxes++;
        assert.ok(level >= AMMO_FROM_LEVEL, `a box on level ${level}`);
      }
    }
    assert.ok(boxes > 30, `${boxes} boxes`);
  }
});

test('shots never change the course: two clients, one firing at everything, lay the same slots', () => {
  // The course is drawn from the seed and the slots alone. One client shoots everything as it passes (RunGun takes
  // enemies away on that client only); the other never shoots; their layouts agree slot for slot
  const seed = 0xbeef;
  const a = new CourseLayout(new SeededRNG(seed), undefined, true);
  const b = new CourseLayout(new SeededRNG(seed), undefined, true);
  const ammo = new Ammo();
  const random = Math.random;
  Math.random = () => { throw new Error('the course drew from Math.random'); };
  try {
    for (let i = 0; i < 600; i++) {
      const level = 7 + Math.floor(i / 150);
      const x = 60_000 + i * 320;
      const laidA = a.next(x, level);
      // Client A fires at whatever it was given, and picks up its boxes
      for (const item of laidA) {
        if (item.kind === 'enemy') ammo.take();
        if (item.kind === 'pickup' && item.group === 'ammo') ammo.add(AMMO_PER_BOX);
      }
      assert.deepEqual(b.next(x, level), laidA);
    }
  } finally {
    Math.random = random;
  }
});

test('"half way" ammo: a player who shoots everything keeps running dry, one who picks targets usually holds 2-4', () => {
  const median = (values: number[]): number => [...values].sort((p, q) => p - q)[Math.floor(values.length / 2)];
  const report: string[] = [];
  for (let level = 7; level <= 10; level++) {
    const speed = speedAtLevel(level);
    const startX = 100;
    const clock = { timeAt: (x: number) => ((x - startX) / speed) * 1000, speedAt: () => speed };
    const all = { enemies: 0, shots: 0, dry: 0 };
    const careful = { enemies: 0, shots: 0, dry: 0, held: [] as number[] };
    for (let seed = 1; seed <= 16; seed++) {
      const layout = new CourseLayout(new SeededRNG(seed * 7919 + level), clock, true);
      const course: Laid[] = Array.from({ length: 150 }, (_, i) => {
        const x = 1000 + i * beatSpacing(level);
        return { x, items: layout.next(x, level) };
      });
      const path = simulate(course, { level, speed, reaction: 250, dash: true }, startX);
      assert.ok(!path.died, `level ${level} seed ${seed}`);
      if (path.died) continue;
      const a = ammoRun(course, path, 'all', AMMO_PER_BOX);
      const c = ammoRun(course, path, 'careful', AMMO_PER_BOX);
      all.enemies += a.enemies; all.shots += a.shots; all.dry += a.dry;
      careful.enemies += c.enemies; careful.shots += c.shots; careful.dry += c.dry;
      // Past the first magazine
      careful.held.push(...c.held.slice(10));
    }
    const perEnemy = all.shots / all.enemies;
    report.push(`level ${level}: shoot-everything ${perEnemy.toFixed(2)} shots/enemy, dry at ${(all.dry / all.enemies).toFixed(2)}; `
      + `careful holds ${median(careful.held)} (median), dry at ${(careful.dry / careful.enemies).toFixed(2)}`);
    assert.ok(perEnemy > 0.4 && perEnemy < 0.75, report[report.length - 1]);
    assert.ok(all.dry / all.enemies > 0.3, report[report.length - 1]);
    assert.ok(median(careful.held) >= 2 && median(careful.held) <= 4, report[report.length - 1]);
    assert.ok(careful.dry / careful.enemies < 0.2, report[report.length - 1]);
  }
  if (process.env.GUN_REPORT) console.log(report.join('\n'));
});

// ── The jewel wasp ───────────────────────────────────────────────────────

/** A wasp coming in at x against a roach running steadily; `hopAt` decides, step by step, whether to hop now. */
function waspRun(speed: number, lane: Lane, hopAt: (w: ReturnType<typeof newWasp>, ms: number) => boolean): { hit: boolean; hops: number } {
  const plan: EnemyPlan = { id: 'wasp', x: 2000, lane, phase: 0 };
  const body = bodyOf(ENEMIES.wasp);
  const w = newWasp(lane);
  let roach = 600;
  let roachLane: Lane = lane;
  let hops = 0;
  for (let ms = 0; ms < 8000; ms += 10) {
    if (hopAt(w, ms)) { roachLane = roachLane === 'top' ? 'bottom' : 'top'; hops++; }
    const zones = stepWasp(w, WASP, plan, 10, roach, roachLane, body);
    if (zones.some(z => z.lane === roachLane && z.x1 >= roach - ROACH_BACK && z.x0 <= roach + ROACH_FRONT)) return { hit: true, hops };
    if (w.phase === 'gone') break;
    roach += (speed * 10) / 1000;
  }
  return { hit: false, hops };
}

/** A person's reaction, and the hop's own time to carry the roach out of its lane (HOP_MS in config/sprites.ts, which
 * needs Phaser). */
const REACTION_MS = 400;
const HOP_MS = 90;

test('the wasp: a roach that never hops is stung; one that hops 400 ms after the wasp locks on is not', () => {
  for (const speed of [450, 550, TOP_SPEED]) {
    for (const lane of ['top', 'bottom'] as Lane[]) {
      assert.ok(waspRun(speed, lane, () => false).hit, `stays put at ${speed}`);
      let lockedAt = -1;
      const late = waspRun(speed, lane, (w, ms) => {
        if (w.phase === 'windup' && lockedAt < 0) lockedAt = ms;
        // The roach is out of its lane half way through the hop
        return lockedAt >= 0 && ms === lockedAt + Math.ceil((REACTION_MS + HOP_MS / 2) / 10) * 10;
      });
      assert.ok(!late.hit && late.hops === 1, `hops after the lock at ${speed}`);
    }
  }
});

test('the wasp\'s tell can be seen: it draws back well clear, and its dive\'s stretch of lane is warned from the lock', () => {
  // Its tell used to be an 18 px drift and a flicker between two frames, with nothing on the lane: it read as a wasp
  // doing nothing, then a sting out of nowhere
  assert.ok(WASP.drawBack >= 40, `draws back ${WASP.drawBack} px`);
  const body = bodyOf(ENEMIES.wasp);
  for (const speed of [450, TOP_SPEED]) {
    for (const lane of ['top', 'bottom'] as Lane[]) {
      const plan: EnemyPlan = { id: 'wasp', x: 2000, lane, phase: 0 };
      const w = newWasp(lane);
      let roach = 600;
      let warnedFrom = -1;
      let warned: ReturnType<typeof waspDiveLane> = null;
      let stungAt = -1;
      for (let ms = 0; ms < 8000 && stungAt < 0; ms += 10) {
        const zones = stepWasp(w, WASP, plan, 10, roach, lane, body);
        const warn = waspDiveLane(w, WASP, roach, body);
        if (warn) {
          if (warnedFrom < 0) warnedFrom = ms;
          warned = warn;
          // The warning is on its lane and covers the roach, where the sting will land
          assert.equal(warn.lane, lane);
          assert.ok(warn.x0 <= roach - ROACH_BACK && warn.x1 >= roach + ROACH_FRONT, `the warning misses the roach at ${speed}`);
        }
        if (zones.some(z => z.lane === lane && z.x1 >= roach - ROACH_BACK && z.x0 <= roach + ROACH_FRONT)) stungAt = ms;
        roach += (speed * 10) / 1000;
      }
      assert.ok(warned && warnedFrom >= 0 && stungAt > 0, `never warned or stung at ${speed}`);
      assert.ok(stungAt - warnedFrom >= REACTION_MS + HOP_MS + 100, `warned ${stungAt - warnedFrom} ms before the sting at ${speed}`);
    }
  }
});

test('the wasp follows a hop made while it hovers: hopping early is no answer, hopping late is', () => {
  for (const speed of [450, TOP_SPEED]) {
    let hopped = false;
    const early = waspRun(speed, 'bottom', (w) => {
      if (w.phase === 'hover' && w.t > 200 && !hopped) { hopped = true; return true; }
      return false;
    });
    assert.ok(early.hit, `an early hop is followed at ${speed}`);
  }
  // The time from its lock to the sting reaching the roach: what a player has to see it and hop
  const back = WASP.ahead + WASP.drawBack;
  const toSting = WASP.windup + WASP.dive * (back - ROACH_FRONT - bodyOf(ENEMIES.wasp).half) / (back - WASP.diveTo);
  assert.ok(toSting >= REACTION_MS + HOP_MS + 100, `${Math.round(toSting)} ms from the lock to the sting`);
});

// ── The aerosol's blast ─────────────────────────────────────────────────

test('a shot can takes down what is near it in both lanes, and sets off the next can in reach, and so on', () => {
  const r = TIMINGS.aerosol.radius;
  const items = [
    { x: 0, can: true },
    { x: r - 10, can: false },
    { x: r + 20, can: false },        // out of the first can's reach...
    { x: r - 30, can: true },         // ...but this can is in it, and reaches it
    { x: 2 * r + 60, can: false },    // out of everything's
    { x: -r + 5, can: false },
  ];
  assert.deepEqual([...blastChain(items, 0, r)].sort((a, b) => a - b), [0, 1, 2, 3, 5]);
  assert.ok(caughtInBlast(0, r, r));
  assert.ok(!caughtInBlast(0, r + 1, r));
});

test('a can shot from far enough is no danger to the roach that shot it, at any speed of the gun act', () => {
  // The bullet leaves from the carried pistol, about 30 px ahead of the roach's centre; the roach keeps running while
  // the bullet flies and the fuse burns, and dies only if it is within the radius when the can goes off
  const MUZZLE_AHEAD = 30;
  const { fuse, radius } = TIMINGS.aerosol;
  const safeFrom = (v: number): number => (radius + (v * fuse) / 1000 - (v * MUZZLE_AHEAD) / BULLET_SPEED) / (1 - v / BULLET_SPEED);
  // What the roach sees ahead of it on screen: the camera keeps it 200 px in from the left
  const onScreen = GAME_WIDTH - 200;
  for (const v of [speedAtLevel(7), speedAtLevel(10), TOP_SPEED]) {
    const d = safeFrom(v);
    assert.ok(d < onScreen - 150, `at ${Math.round(v)} px/s a can must be shot from ${Math.round(d)} px or more`);
  }
});

test('levels 7-10, never firing a shot, are survived with hops and the dash', () => {
  // The fairness sweep in enemies.test.ts runs every level's course for a player who never shoots; here, with the
  // gun's ammo boxes in it as the solo course lays them
  const failures: string[] = [];
  for (let level = 7; level <= 10; level++) {
    for (const speed of [speedAtLevel(level) - 60, speedAtLevel(level), speedAtLevel(level) + 60]) {
      for (let seed = 1; seed <= 8; seed++) {
        const startX = 100;
        const clock = { timeAt: (x: number) => ((x - startX) / speed) * 1000, speedAt: () => speed };
        const layout = new CourseLayout(new SeededRNG(seed * 104729 + level), clock, true);
        const course: Laid[] = Array.from({ length: 90 }, (_, i) => {
          const x = 1000 + i * beatSpacing(level);
          return { x, items: layout.next(x, level) };
        });
        const result = simulate(course, { level, speed, reaction: 250, dash: true }, startX);
        if (result.died) failures.push(`level ${level} seed ${seed} at ${Math.round(speed)}: ${result.by}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});
