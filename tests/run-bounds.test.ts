/**
 * The server's run bounds (server/runBounds.ts, server/runCheck.ts) held to the client's own formulas and to the real
 * planner's courses: the server cannot import from src, so it keeps copies, and these tests are what keep the copies
 * true. An honest run, however lucky its course and however perfect its play, must always pass unclamped.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  APPLE_SCORE, BEER_CHANCE, BEER_SCORE, COCKROACH_BASE_SPEED, COCKROACH_SPEED_MAX_BOOST, COCKROACH_START_X, DASH_COOLDOWN,
  DASH_DURATION, DASH_SPEED_BOOST, PILL_CHANCE, PILL_DURATION, PILL_SCORE, PILL_SPEED_MULTIPLIER,
} from '../src/config/constants';
import { getLevelForDistance, LEVELS, levelNumberAt } from '../src/config/levels';
import { SeededRNG } from '../src/multiplayer/SeededRNG';
import { cruiseSpeed, nominalCourse, TIMINGS } from '../src/objects/obstacles/cast';
import { MOULT_CHARGES } from '../src/systems/abilities';
import { BOSS_RESUME_PX, bossRunway, bossX, CourseLayout } from '../src/systems/CourseLayout';
import { runStart } from '../src/systems/checkpoints';
import { KILL_SCORE } from '../src/systems/gunRules';
import { beatSpacing } from '../src/systems/RunPatterns';
import { DistancePoints, pickupMultiplier } from '../src/systems/RunState';
import * as bounds from '../server/runBounds';
import { checkRun, type RunClaim } from '../server/runCheck';

const BOSSES = [250, 1200, 1800, 2600];

test('the server\'s copies of the speed formula, the levels, the spacing and the points are the client\'s', () => {
  for (let m = 0; m < 20000; m += 7) assert.equal(bounds.levelAt(m), levelNumberAt(m), `metre ${m}`);
  assert.deepEqual([...bounds.STORY_THRESHOLDS], LEVELS.map(l => l.distanceThreshold));
  for (let level = 1; level <= 40; level++) {
    assert.equal(bounds.beatSpacing(level), beatSpacing(level), `spacing ${level}`);
    for (const t of [0, 1000, 33_333, 200_000, 900_000]) assert.equal(bounds.cruiseSpeed(t, level), cruiseSpeed(t, level));
  }
  for (let x = 150; x < 150 + 8000 * 50; x += 4999) {
    assert.ok(Math.abs(bounds.nominalTimeAt(x) - nominalCourse.timeAt(x)) < 1e-6, `nominal time at ${x}`);
  }
  for (let i = 1; i <= 4; i++) assert.ok(Math.abs(bounds.nominalTimeAt(runStart(i).x) - runStart(i).courseOffsetMs) < 1e-6);
  assert.equal(bounds.START_X, COCKROACH_START_X);
  assert.deepEqual(bounds.bossesOf(false), BOSSES);
  for (const m of BOSSES) assert.equal(bounds.BOSS_RUNWAY_PX[m], bossRunway(m), `runway at ${m} m`);
  assert.equal(BOSS_RESUME_PX, 1000);
  assert.deepEqual(
    [bounds.POINTS.apple, bounds.POINTS.beer, bounds.POINTS.pill, bounds.POINTS.kill, bounds.POINTS.blast],
    [APPLE_SCORE, BEER_SCORE, PILL_SCORE, KILL_SCORE, TIMINGS.aerosol.bonus],
  );
  // RiskBonus.ts loads Phaser, so its two numbers are read from the source
  const risk = fs.readFileSync(path.join(__dirname, '../src/systems/RiskBonus.ts'), 'utf8');
  assert.match(risk, new RegExp(`NEAR_MISS_SCORE = ${bounds.POINTS.near};`));
  assert.match(risk, new RegExp(`DASH_THROUGH_SCORE = ${bounds.POINTS.dash};`));
  assert.equal(bounds.PILL_CHANCE, PILL_CHANCE);
  assert.equal(bounds.BEER_CHANCE, BEER_CHANCE);
  assert.equal(bounds.MOULT_SAVES_PER_RUN, MOULT_CHARGES);
  assert.deepEqual([COCKROACH_BASE_SPEED, COCKROACH_SPEED_MAX_BOOST, DASH_SPEED_BOOST, DASH_DURATION, DASH_COOLDOWN, PILL_SPEED_MULTIPLIER, PILL_DURATION],
    [200, 300, 300, 375, 1200, 1.5, 5000]);
  for (const level of [1, 5, 10, 11, 17, 30]) assert.equal(bounds.endlessBonus(level), pickupMultiplier(0, level));
  for (const [start, end] of [[0, 1234], [250, 999], [2600, 7777]]) {
    const points = new DistancePoints(start);
    assert.equal(bounds.distancePoints(start, end), points.advance(end, levelNumberAt));
  }
});

interface Walked {
  slots: number;
  apples: number;
  beers: number;
  pills: number;
  enemies: number;
  walls: number;
  /** Every pickup and enemy in course order with its level, for the perfect bot. */
  events: { kind: 'apples' | 'beers' | 'pills' | 'enemy' | 'wall'; level: number }[];
}

/** The real course from a start to a distance, laid as SpawnManager lays it (no lessons, no fights' pushes). */
function walk(seed: number, startIndex: number, endMetre: number, multiplayer = false): Walked {
  const start = runStart(startIndex);
  const layout = new CourseLayout(new SeededRNG(seed), undefined, !multiplayer);
  let x = startIndex ? start.x + 400 : COCKROACH_START_X + 400;
  let ahead = (multiplayer ? [1800] : BOSSES).filter(b => bossX(b) > start.x);
  const out: Walked = { slots: 0, apples: 0, beers: 0, pills: 0, enemies: 0, walls: 0, events: [] };
  const endX = COCKROACH_START_X + endMetre * 50;
  while (x <= endX) {
    const gate = ahead.length ? bossX(ahead[0]) - bossRunway(ahead[0]) : Infinity;
    if (x >= gate) { x = Math.max(x, bossX(ahead[0]) + BOSS_RESUME_PX); ahead = ahead.slice(1); continue; }
    const level = getLevelForDistance(Math.floor((x - COCKROACH_START_X) / 50)).level;
    out.slots++;
    for (const item of x < start.calmUntilX ? layout.calm(x, level) : layout.next(x, level, gate)) {
      if (item.kind === 'pickup') {
        if (item.group === 'ammo') continue;
        out[item.group]++;
        out.events.push({ kind: item.group, level });
      } else if (item.kind === 'enemy') {
        out.enemies++;
        out.events.push({ kind: 'enemy', level });
      } else {
        out.walls++;
        out.events.push({ kind: 'wall', level });
      }
    }
    x += beatSpacing(level);
  }
  return out;
}

const RUNS: [number, number[]][] = [[0, [60, 100, 250, 500, 1000, 1500, 2000, 2600, 3500, 5000]], [1, [400, 1300]], [3, [2000, 2700]], [4, [2650, 3000, 4000, 6000, 10000]]];

test('the slots the server counts are the real course\'s, and its pickup, enemy and wall bounds hold on every course walked', () => {
  let worstPickups = 0;
  for (const [startIndex, ends] of RUNS) {
    const start = runStart(startIndex).distance;
    for (const end of ends) {
      const { slots, wallSlots } = bounds.slotsUpTo(start, end, BOSSES);
      for (let seed = 1; seed <= 600; seed++) {
        const run = walk(seed * 7919 + startIndex, startIndex, end);
        // The server counts a few px past the distance (a pickup is taken a little ahead of the roach)
        assert.ok(run.slots <= slots && slots <= run.slots + 1, `slots ${start}->${end}: ${run.slots} vs ${slots}`);
        const pickups = run.apples + run.beers + run.pills;
        const rich = bounds.richSlots(slots);
        assert.ok(pickups <= rich, `pickups ${pickups} > ${rich} (${start}->${end}, seed ${seed})`);
        assert.ok(run.enemies <= rich, `enemies ${run.enemies} > ${rich}`);
        assert.ok(run.walls <= bounds.wallsIn(wallSlots), `walls ${run.walls}`);
        assert.ok(pickups + run.enemies + run.walls <= bounds.busySlots(slots), `together ${pickups + run.enemies + run.walls} (${start}->${end})`);
        assert.ok(run.pills <= bounds.luckyShare(rich, PILL_CHANCE), `pills ${run.pills}`);
        assert.ok(run.beers <= bounds.luckyShare(rich, BEER_CHANCE), `beers ${run.beers}`);
        worstPickups = Math.max(worstPickups, pickups / rich);
      }
    }
  }
  // How loose: the luckiest course's pickups against the bound (reported, and kept from growing much looser)
  assert.ok(worstPickups > 0.6 && worstPickups <= 1, `the richest course fills ${worstPickups.toFixed(2)} of the bound`);
});

/**
 * A flawless run on the real course: every pickup taken, a close call off every enemy and a dash through every wall,
 * never a miss, scored with the client's own formulas; the time is the nominal runner's (no dash), so it is a run the
 * server sees as long as it really takes.
 */
function flawless(seed: number, startIndex: number, end: number): RunClaim & { elapsedMs: number } {
  const start = runStart(startIndex);
  const run = walk(seed, startIndex, end);
  let combo = 0;
  let score = new DistancePoints(start.distance).advance(end, levelNumberAt);
  const base = { apples: APPLE_SCORE, beers: BEER_SCORE, pills: PILL_SCORE, enemy: 15, wall: 25 };
  for (const event of run.events) {
    combo++;
    score += Math.round(base[event.kind] * pickupMultiplier(combo, event.level));
  }
  const activeMs = nominalCourse.timeAt(COCKROACH_START_X + end * 50) - start.courseOffsetMs;
  const bosses = (['lodzia', 'bigos', 'zlewiatan', 'eksterminator'] as const).filter((_, i) => BOSSES[i] > start.distance && BOSSES[i] <= end);
  // Every fight a solid one, at its slowest honest length, its points within the measured honest range
  const fightMs = bosses.length * 80_000;
  const fightPoints = { lodzia: 560, bigos: 3000, zlewiatan: 9100, eksterminator: 4600 };
  score += bosses.reduce((sum, id) => sum + fightPoints[id], 0) + Math.floor((activeMs + fightMs) / 1000);
  return {
    score, distance: end, level: levelNumberAt(end), combo, apples: run.apples, beers: run.beers, pills: run.pills,
    nearMisses: run.enemies, dashThroughs: run.walls, wallsBroken: run.walls, kills: 0, seconds: Math.floor(activeMs / 1000),
    bosses: [...bosses], noHitWins: bosses.length, allBosses: startIndex === 0 && bosses.length === 4, moultSaves: 0, pacifist: false,
    deathCause: 'onion', elapsedMs: activeMs + fightMs + 3000,
  };
}

test('a flawless run on the luckiest course passes whole, solo and from every start', () => {
  for (const [startIndex, ends] of RUNS) {
    for (const end of ends) {
      for (let seed = 1; seed <= 40; seed++) {
        const claim = flawless(seed * 104729 + end, startIndex, end);
        const checked = checkRun({ mode: 'solo', start: runStart(startIndex).distance, daily: null, issued_at: 0, died_at: null, death_score: null },
          claim, claim.elapsedMs);
        assert.ok(checked.ok, `refused ${startIndex}->${end}: ${!checked.ok && checked.reason}`);
        assert.deepEqual(checked.run.clamped, [], `${startIndex}->${end} seed ${seed}`);
        assert.equal(checked.run.score, claim.score);
      }
    }
  }
});

test('the distance bound: never short of the fastest honest roach, always short of one twice as fast', () => {
  for (const startIndex of [0, 1, 2, 3, 4]) {
    const start = runStart(startIndex);
    for (const seconds of [5, 30, 120, 400, 1200]) {
      // The nominal runner, dashing whenever it can (a quarter of the time at +300 px/s), with a pill at the end
      let x = start.x;
      for (let t = 0; t < seconds * 1000; t += 10) {
        const level = levelNumberAt(Math.floor((x - COCKROACH_START_X) / 50));
        const dashing = t % (DASH_DURATION + DASH_COOLDOWN) < DASH_DURATION;
        const pill = t >= seconds * 1000 - PILL_DURATION;
        x += ((cruiseSpeed(start.courseOffsetMs + t, level) + (dashing ? DASH_SPEED_BOOST : 0)) * (pill ? PILL_SPEED_MULTIPLIER : 1) * 10) / 1000;
      }
      const reached = (x - COCKROACH_START_X) / 50;
      const bound = bounds.maxDistance(start.distance, seconds, 1);
      assert.ok(reached <= bound, `start ${start.distance}, ${seconds} s: ${reached} > ${bound}`);
      assert.ok(bound - start.distance < 1.1 * (reached - start.distance) + 25, `start ${start.distance}, ${seconds} s: ${bound} is loose against ${reached}`);
    }
  }
});

test('what the check refuses and what it holds to its bounds', () => {
  const ticket = { mode: 'solo' as const, start: 0, daily: null, issued_at: 0, died_at: null, death_score: null };
  const honest = flawless(77, 0, 1000);
  // Too fast: the same distance in a third of the time
  assert.deepEqual(checkRun(ticket, { ...honest, seconds: 5 }, Math.floor(honest.elapsedMs / 3)), { ok: false, reason: 'too fast' });
  // More play time than the wall clock had
  assert.deepEqual(checkRun(ticket, honest, 10_000), { ok: false, reason: 'time' });
  // Inflated counts and score: held to the course's bounds, and the score to what those counts make at most
  const inflated = checkRun(ticket, { ...honest, apples: 5000, pills: 400, nearMisses: 900, combo: 9999, score: 999_999 }, honest.elapsedMs);
  assert.ok(inflated.ok);
  assert.ok(inflated.run.apples < 200 && inflated.run.pills < 15 && inflated.run.nearMisses < 200, JSON.stringify(inflated.run));
  console.log(`1000 m: an invented flawless run is held to ${inflated.run.score}; an honest flawless one on this course scores ${honest.score}`);
  assert.ok(inflated.run.score < 4 * honest.score, `${inflated.run.score} against an honest flawless ${honest.score}`);
  assert.ok(inflated.run.clamped.includes('score') && inflated.run.clamped.includes('apples'));
  // A boss beyond the distance, all four from a checkpoint, a pacifist run that never got to level 9
  const claims = checkRun({ ...ticket, start: 250 }, { ...honest, bosses: ['lodzia', 'bigos', 'eksterminator'], allBosses: true, pacifist: true }, honest.elapsedMs);
  assert.ok(claims.ok);
  assert.deepEqual(claims.run.bosses, []);
  assert.equal(claims.run.allBosses, false);
  assert.equal(claims.run.pacifist, false);
  // A match: no pistol, no moult, and the score the server saw at the death
  const match = checkRun({ ...ticket, mode: 'match', died_at: honest.elapsedMs, death_score: 1234 }, { ...honest, kills: 5, moultSaves: 1 }, honest.elapsedMs + 60_000);
  assert.ok(match.ok);
  assert.deepEqual([match.run.kills, match.run.moultSaves, match.run.score, match.run.multiplayer], [0, 0, 1234, true]);
});

test('nothing laid, nothing taken; idle wall clock pays nothing; a fight is capped, never stretched by waiting', () => {
  const ticket = { mode: 'solo' as const, start: 0, daily: null, issued_at: 0, died_at: null, death_score: null };
  const junk: RunClaim = {
    score: 1e7, distance: 0, level: 99, combo: 1e6, apples: 1e6, beers: 1e6, pills: 1e6, nearMisses: 1e6, dashThroughs: 1e6,
    wallsBroken: 1e6, kills: 1e6, seconds: 0, bosses: ['lodzia', 'bigos', 'zlewiatan', 'eksterminator'], noHitWins: 9, allBosses: true,
    moultSaves: 9, pacifist: true, deathCause: null,
  };
  // At 0 m, right after the ticket: every count 0, and too short to count
  const zero = checkRun(ticket, junk, 100);
  assert.ok(zero.ok);
  const { apples, beers, pills, wallsBroken, moultSaves, combo, nearMisses, kills, bosses, counted, score } = zero.run;
  assert.deepEqual({ apples, beers, pills, wallsBroken, moultSaves, combo, nearMisses, kills, bosses, counted }, {
    apples: 0, beers: 0, pills: 0, wallsBroken: 0, moultSaves: 0, combo: 0, nearMisses: 0, kills: 0, bosses: [], counted: false,
  });
  assert.ok(score <= 2, `scored ${score}`);
  // Six hours of waiting with 0 m and no play: the same nothing (the wall clock is no play time, no fight time)
  const idle = checkRun(ticket, junk, 6 * 3_600_000 - 1000);
  assert.ok(idle.ok && idle.run.score <= 2, JSON.stringify(idle.ok && idle.run.score));
  // Past every boss in four minutes of play and a minute and a half of fights: the fights' least time doesn't fit
  assert.deepEqual(checkRun(ticket, { ...junk, distance: 2650, seconds: 240 }, (240 + 90) * 1000), { ok: false, reason: 'time' });
  // A boss's points are his cap, however long the wall clock says the fight took
  const short = checkRun(ticket, { ...junk, distance: 1900, seconds: 300 }, (300 + 100) * 1000);
  const long = checkRun(ticket, { ...junk, distance: 1900, seconds: 300 }, (300 + 5 * 3600) * 1000);
  assert.ok(short.ok && long.ok);
  assert.equal(long.run.score, short.run.score);
  // Walls only where walls stand (level 3, from 250 m), the moult only once Zlewiatan is beaten, the lessons' apples past them
  const early = checkRun(ticket, { ...junk, distance: 240, seconds: 60, bosses: [] }, 70_000);
  assert.ok(early.ok);
  assert.deepEqual([early.run.wallsBroken, early.run.moultSaves], [0, 0]);
  assert.equal(bounds.wallsIn(0), 0);
  assert.equal(bounds.wallsIn(2), 0);
  assert.equal(bounds.wallsIn(3), 1);
  assert.deepEqual([bounds.lessonApples(0, 260), bounds.lessonApples(0, 280), bounds.lessonApples(0, 1300), bounds.lessonApples(1200, 1300)], [0, 3, 6, 0]);
  assert.deepEqual([bounds.richSlots(0), bounds.busySlots(0), bounds.richSlots(1), bounds.busySlots(1)], [0, 0, 1, 2]);
});
