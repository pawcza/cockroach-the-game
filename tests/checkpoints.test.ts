/**
 * Checkpoints (src/systems/checkpoints.ts): which boss unlocks which start, what a run from one starts with, its
 * course clock, the speed ramp and the calm course laid while it lasts.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { COCKROACH_START_X } from '../src/config/constants';
import { getLevelForDistance, levelBefore } from '../src/config/levels';
import { SeededRNG } from '../src/multiplayer/SeededRNG';
import { cruiseSpeed, ENEMIES, EnemyId, nominalCourse } from '../src/objects/obstacles/cast';
import { Abilities } from '../src/systems/abilities';
import { BOSSES, bossById, dueBoss } from '../src/systems/boss/bosses';
import { CHECKPOINT_STARTS, ENDLESS_START } from '../server/bossDistances';
import {
  allowedStart, boardOf, CHECKPOINTS, ENDLESS_CHECKPOINT, isRanked, levelReached, rampFactor, runStart, unlockedAfter,
  unlockedCheckpoints,
} from '../src/systems/checkpoints';
import { BOSS_RESUME_PX, bossX, CourseLayout, courseEnd } from '../src/systems/CourseLayout';
import { beatSpacing, RunPatterns } from '../src/systems/RunPatterns';

const solo = { multiplayer: false, devSkip: false };

test('every boss gives a checkpoint at his distance; the Eksterminator\'s starts the endless levels, not as practice', () => {
  assert.deepEqual(CHECKPOINTS.map(c => c.boss.id), ['lodzia', 'bigos', 'zlewiatan', 'eksterminator']);
  for (const c of CHECKPOINTS) assert.equal(c.distance, bossById(c.boss.id).triggerDistance);
  assert.deepEqual(CHECKPOINTS.map(c => c.place), ['Hala Targowa', 'Morze Bałtyckie', 'Wymiar Żubrówki', 'Bez końca']);
  assert.deepEqual(CHECKPOINTS.map(c => c.level.level), [3, 7, 9, 11]);
  assert.equal(CHECKPOINTS[1].label, 'Morze Bałtyckie — po DJ Bigosie · trening');
  assert.equal(CHECKPOINTS[0].label, 'Hala Targowa — po Pani Lodzi · trening');
  assert.equal(ENDLESS_CHECKPOINT.label, 'Bez końca — po Eksterminatorze');
  assert.ok(!/trening/.test(ENDLESS_CHECKPOINT.label));
  assert.deepEqual(CHECKPOINTS.map(c => c.endless), [false, false, false, true]);
});

test('a boss beaten solo unlocks his checkpoint (the Eksterminator the fourth); a match and the dev shortcut nothing', () => {
  assert.equal(unlockedAfter(0, 'lodzia', solo), 1);
  assert.equal(unlockedAfter(1, 'bigos', solo), 2);
  assert.equal(unlockedAfter(2, 'zlewiatan', solo), 3);
  assert.equal(unlockedAfter(3, 'eksterminator', solo), 4);
  assert.equal(unlockedAfter(3, 'eksterminator', { multiplayer: false, devSkip: true }), 3);
  assert.equal(unlockedAfter(3, 'lodzia', solo), 3, 'never takes one away');
  assert.equal(unlockedAfter(1, 'zlewiatan', { multiplayer: true, devSkip: false }), 1);
  assert.equal(unlockedAfter(0, 'bigos', { multiplayer: false, devSkip: true }), 0);
});

test('only an unlocked checkpoint can be started from', () => {
  assert.equal(allowedStart(2, 2), 2);
  assert.equal(allowedStart(3, 2), 0);
  assert.equal(allowedStart(undefined, 3), 0);
  assert.equal(allowedStart(-1, 3), 0);
  assert.equal(allowedStart(9, 99), 0);
  assert.equal(allowedStart(4, 3), 0);
  assert.equal(allowedStart(4, 4), 4);
  assert.equal(unlockedCheckpoints(99).length, CHECKPOINTS.length);
  assert.equal(unlockedCheckpoints(0).length, 0);
});

test('from the start: nothing beaten, nothing owned, no offset, no ramp', () => {
  const start = runStart(0);
  assert.equal(start.distance, 0);
  assert.equal(start.level.level, 1);
  assert.deepEqual(start.beaten, []);
  assert.equal(start.courseOffsetMs, 0);
  assert.equal(start.rampMs, 0);
});

test('a checkpoint run starts in the level after its boss, every boss up to him beaten and their powers owned', () => {
  const expected = [['dash'], ['dash', 'gun'], ['dash', 'gun', 'moult'], ['dash', 'gun', 'moult']];
  for (const c of CHECKPOINTS) {
    const start = runStart(c.index);
    assert.equal(start.distance, c.distance);
    assert.equal(start.x, bossX(c.distance));
    // BossEncounter.startAfter grants each beaten boss's reward, as beating him did
    const abilities = new Abilities();
    for (const boss of start.beaten) abilities.grantReward(boss);
    assert.deepEqual(['dash', 'gun', 'moult'].filter(id => abilities.has(id as 'dash')), expected[c.index - 1]);
    const beaten = new Set(start.beaten.map(b => b.id));
    assert.ok(beaten.has(c.boss.id));
    // Nothing behind triggers again; the next boss still waits at his distance
    assert.equal(dueBoss(BOSSES, start.distance, beaten), null, c.boss.id);
    const next = BOSSES.filter(b => !beaten.has(b.id)).sort((a, b) => a.triggerDistance - b.triggerDistance)[0];
    if (c.endless) {
      // Past the last boss: none ever again, however far it runs, and the run is in level 11 from the start
      assert.equal(next, undefined);
      for (const d of [2600, 3100, 10_000, 1e6]) assert.equal(dueBoss(BOSSES, d, beaten), null);
      assert.equal(levelBefore(start.distance, Infinity).level, 11);
      continue;
    }
    assert.equal(dueBoss(BOSSES, next.triggerDistance - 1, beaten), null);
    assert.equal(dueBoss(BOSSES, next.triggerDistance, beaten)?.id, next.id);
    // The level LevelProgression would show there with the next boss still ahead
    assert.equal(levelBefore(start.distance, next.triggerDistance).level, start.level.level);
  }
});

test('the course clock starts where the nominal runner reaches the checkpoint, at the speed it has there', () => {
  for (const c of CHECKPOINTS) {
    const start = runStart(c.index);
    assert.equal(start.courseOffsetMs, nominalCourse.timeAt(start.x));
    const speed = cruiseSpeed(start.courseOffsetMs, start.level.level);
    // A step past the threshold the nominal runner is on the new level too
    assert.ok(Math.abs(nominalCourse.speedAt(start.x + 200) - speed) < 3, `${c.boss.id}: ${speed} vs ${nominalCourse.speedAt(start.x + 200)}`);
  }
  assert.ok(runStart(1).courseOffsetMs < runStart(2).courseOffsetMs && runStart(2).courseOffsetMs < runStart(3).courseOffsetMs);
});

test('the ramp lasts about 6 s after Lodzia, 15 s after Bigos, 20 s after Zlewiatan and 23 s after the Eksterminator', () => {
  const seconds = CHECKPOINTS.map(c => runStart(c.index).rampMs / 1000);
  const around = [6, 15, 20, 23];
  seconds.forEach((s, i) => assert.ok(Math.abs(s - around[i]) <= 1.5, `${CHECKPOINTS[i].boss.id}: ${s.toFixed(1)} s`));
});

test('the ramp eases the speed from 0.6 up to 1, and leaves it alone after', () => {
  const ramp = 10_000;
  assert.equal(rampFactor(0, ramp), 0.6);
  assert.ok(Math.abs(rampFactor(ramp / 2, ramp) - 0.8) < 1e-9);
  assert.equal(rampFactor(ramp, ramp), 1);
  assert.equal(rampFactor(ramp * 3, ramp), 1);
  assert.equal(rampFactor(0, 0), 1, 'no ramp from the start');
  let last = 0;
  for (let t = 0; t <= ramp; t += 100) {
    const f = rampFactor(t, ramp);
    assert.ok(f >= last && f >= 0.6 && f <= 1);
    last = f;
  }
});

test('the calm stretch covers all the ground a never-dashing runner covers during the ramp', () => {
  for (const c of CHECKPOINTS) {
    const start = runStart(c.index);
    // Frame by frame at 60 fps, as Player.updateSpeed moves the roach
    let x = start.x;
    const frame = 1000 / 60;
    for (let t = 0; t < start.rampMs; t += frame) {
      const level = getLevelForDistance(Math.floor((x - COCKROACH_START_X) / 50)).level;
      x += cruiseSpeed(start.courseOffsetMs + t, level) * rampFactor(t, start.rampMs) * frame / 1000;
    }
    const ran = x - start.x;
    const calm = start.calmUntilX - start.x;
    // All of it, and not much more (the stretch is worked out in 50 ms steps)
    assert.ok(calm >= ran && calm <= ran * 1.02, `${c.boss.id}: calm ${calm.toFixed(0)} px, ran ${ran.toFixed(0)} px`);
  }
});

test('the calm course lays only pickups and plain standing blockers, on every level', () => {
  for (let level = 1; level <= 10; level++) {
    const layout = new CourseLayout(new SeededRNG(level * 31), undefined, true);
    let blockers = 0;
    for (let i = 0; i < 400; i++) {
      for (const item of layout.calm(10_000 + i * 200, level)) {
        assert.ok(item.kind === 'pickup' || item.kind === 'enemy', `level ${level}: ${item.kind}`);
        if (item.kind !== 'enemy') continue;
        assert.equal(ENEMIES[item.plan.id as EnemyId].role, 'blocker', `level ${level}: ${item.plan.id}`);
        blockers++;
      }
    }
    assert.ok(blockers > 0, `level ${level} lays blockers`);
  }
});

test('the course after the calm stretch starts fresh: the level\'s newcomers are introduced first', () => {
  const patterns = new RunPatterns(new SeededRNG(5));
  for (let i = 0; i < 40; i++) {
    const beat = patterns.calm();
    assert.ok(beat.kind === 'pickup' || beat.kind === 'blocker' || beat.kind === 'empty', beat.kind);
  }
  const first = Array.from({ length: 6 }, () => patterns.next(7));
  assert.ok(first.some(b => b.kind === 'obstacle' && b.enemy === 'jellyfish'), JSON.stringify(first));
});

test('missions and achievements count only levels a run ran into: not a checkpoint\'s start level', () => {
  const fromStart = runStart(0);
  assert.equal(levelReached(1, fromStart), 1);
  assert.equal(levelReached(4, fromStart), 4);
  const afterBigos = runStart(2);
  assert.equal(levelReached(7, afterBigos), 0, 'started and died in level 7: nothing reached');
  assert.equal(levelReached(8, afterBigos), 8);
  // The endless start's level 11 was handed over too; level 12 on is reached, and counts past 10 (the 15/20/25 card)
  const endless = runStart(ENDLESS_CHECKPOINT.index);
  assert.equal(levelReached(11, endless), 0);
  assert.equal(levelReached(12, endless), 12);
  assert.equal(levelReached(25, endless), 25);
  assert.equal(levelReached(11, fromStart), 11, 'a run from 0 that carries on past the Eksterminator reaches 11');
});

/**
 * SpawnManager's slot loop over a whole run, each boss beaten as the course reaches him, from where `runStart(0)`
 * says the run starts and with its calm stretch (none from the start).
 */
function course(seed: number, solo: boolean, ladder: number[], untilM: number): string[] {
  const start = runStart(0);
  const layout = new CourseLayout(new SeededRNG(seed), undefined, solo);
  let unbeaten = [...ladder];
  let next = start.x + 400;
  const out: string[] = [];
  while (next < bossX(untilM)) {
    if (next >= courseEnd(unbeaten)) {
      const boss = Math.min(...unbeaten);
      unbeaten = unbeaten.filter(d => d > boss);
      next = Math.max(next, bossX(boss) + BOSS_RESUME_PX);
      continue;
    }
    const x = next;
    const level = getLevelForDistance(Math.floor((x - COCKROACH_START_X) / 50)).level;
    next += beatSpacing(level);
    out.push(`${x}:` + JSON.stringify(x < start.calmUntilX ? layout.calm(x, level) : layout.next(x, level)));
  }
  return out;
}
const sha = (lines: string[]): string => createHash('sha256').update(lines.join('\n')).digest('hex');

/** The slots short of DJ Bigos (levels 1-6): the course's lines up to his runway. */
const toLevel6 = (lines: string[]): string[] => lines.filter(line => Number(line.slice(0, line.indexOf(':'))) < bossX(1200));

// Levels 1-6: made with the code from before checkpoints (git HEAD at the time), the same driver, CourseLayout.next only;
// they have never moved. The rest regenerated on purpose with the course version 2 (server/daily.ts COURSE_VERSION):
// levels 7-10 tighter (RunPatterns beatSpacing) and the endless levels from 2600 m (a match, without the Eksterminator,
// is in level 11 from there; Karaluch Dnia lays it 1000 px past him). Before version 2 the whole course hashed
// 735ba36c... (daily, 452 slots) and fb0a405d... (match, 471 slots).
test('a run from the start lays levels 1-6 exactly as before checkpoints, and the version 2 course after: Karaluch Dnia and a match', () => {
  const daily = course(20261114, true, BOSSES.map(b => b.triggerDistance), 2700);
  assert.equal(daily[1], '750:[{"kind":"enemy","plan":{"id":"glue","x":750,"lane":"top","phase":2541}}]');
  assert.equal(toLevel6(daily).length, 233);
  assert.equal(sha(toLevel6(daily)), 'd292dd6035f0800136581b8773e3903d26476f1ef17a35c9a6430a60efbc0b9b');
  assert.equal(daily.length, 470);
  assert.equal(sha(daily), 'd41558a75d1e354f90e61ba0124f12eb54c1944c466ddf30b69d59ef34362eaa');
  const match = course(4242, false, [bossById('zlewiatan').triggerDistance], 2700);
  assert.equal(toLevel6(match).length, 244);
  assert.equal(sha(toLevel6(match)), 'ccba6ff308e8af039879d3a1535a542179e60d5ff74ac7ce49dddebf1c2fa013');
  assert.equal(match.length, 489);
  assert.equal(sha(match), '250eead62263578ea1143dab4aef83f8d8fecb062203b4aef63fc3605171db03');
});

test('the nominal runner, on the one speed formula, gives the numbers it gave before up to the endless levels', () => {
  const samples: string[] = [];
  for (let x = 150; x < 150 + 2700 * 50; x += 997) samples.push(`${nominalCourse.timeAt(x)},${nominalCourse.speedAt(x)}`);
  assert.equal(samples[50], '149589.55490297984,457.9708277820655');
  // Up to the Eksterminator, the same as before version 2 (whose whole hash was d6fe7592...); past him level 11 on
  const story = samples.filter((_, i) => 150 + i * 997 < bossX(2600));
  assert.equal(story.length, 131);
  assert.equal(sha(story), '1ad90ff45094d715f57910a8297380ed1b0be5b94266c0c303cf2afd44299a0b');
  assert.equal(sha(samples), '567cd01178c63e50877a35b2a7db0cc4d243c53a6524bea418ea8e1311865e2e');
});

test('a run from 0 m is ranked on the main board, from the Eksterminator on Bez końca, from the others on none; the server knows the same starts', () => {
  assert.equal(isRanked(runStart(0)), true);
  assert.equal(boardOf(runStart(0)), 'main');
  for (const c of CHECKPOINTS) assert.equal(isRanked(runStart(c.index)), false, c.boss.id);
  assert.deepEqual(CHECKPOINTS.map(c => boardOf(runStart(c.index))), [null, null, null, 'endless']);
  assert.deepEqual(CHECKPOINT_STARTS, CHECKPOINTS.map(c => c.distance));
  assert.equal(ENDLESS_START, ENDLESS_CHECKPOINT.distance);
});
