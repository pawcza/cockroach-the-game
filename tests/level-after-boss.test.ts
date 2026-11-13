/**
 * A level that starts where a boss waits arrives only once that boss is beaten (levelBefore, used by
 * LevelProgression and the floor's level cap): the fight is fought in the old level, the new one is the reward.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getLevelForDistance, LEVELS, levelBefore } from '../src/config/levels';
import { BOSSES, BossId, dueBoss } from '../src/systems/boss/bosses';

const nextGate = (beaten: ReadonlySet<BossId>): number =>
  Math.min(...BOSSES.filter(b => !beaten.has(b.id)).map(b => b.triggerDistance), Infinity);

test('Lodzia, DJ Bigos and Zlewiatan stand on a level threshold; the Eksterminator does not', () => {
  const thresholds = new Set(LEVELS.map(l => l.distanceThreshold));
  assert.deepEqual(BOSSES.filter(b => thresholds.has(b.triggerDistance)).map(b => b.id), ['lodzia', 'bigos', 'zlewiatan']);
});

test('at a boss the run stays in the level before it until the boss is beaten', () => {
  for (const boss of BOSSES) {
    const before = levelBefore(boss.triggerDistance + 5, boss.triggerDistance);
    assert.equal(before.level, getLevelForDistance(boss.triggerDistance - 1).level, boss.id);
    assert.equal(levelBefore(boss.triggerDistance + 5, Infinity).level, getLevelForDistance(boss.triggerDistance + 5).level);
  }
  assert.equal(levelBefore(252, 250).name, 'Klatka Schodowa');
  assert.equal(levelBefore(252, 1200).name, 'Hala Targowa');
});

test('a whole run: each level arrives on the first running frame after its boss falls, never before', () => {
  const beaten = new Set<BossId>();
  let level = 1;
  const arrivals: { level: number; at: number; after: BossId | null }[] = [];
  let lastBeaten: BossId | null = null;
  for (let d = 0; d <= 2700; d++) {
    // A running frame: the level follows the gate of the bosses still to beat
    const reached = levelBefore(d, nextGate(beaten)).level;
    if (reached !== level) { arrivals.push({ level: reached, at: d, after: lastBeaten }); level = reached; }
    const boss = dueBoss(BOSSES, d, beaten);
    if (boss) {
      // The fight, then the reward: the next running frame is at the same distance
      assert.equal(level, getLevelForDistance(boss.triggerDistance - 1).level, `${boss.id} is fought in the old level`);
      beaten.add(boss.id);
      lastBeaten = boss.id;
      d--;
    }
  }
  assert.deepEqual(arrivals.map(a => a.level), [2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(arrivals.find(a => a.level === 3)!.after, 'lodzia');
  assert.equal(arrivals.find(a => a.level === 7)!.after, 'bigos');
  assert.equal(arrivals.find(a => a.level === 9)!.after, 'zlewiatan');
});

test('a match, whose one boss is Zlewiatan: level 9 waits on it, the rest arrive by distance', () => {
  const zlewiatan = BOSSES.find(b => b.id === 'zlewiatan')!;
  assert.equal(levelBefore(1200, zlewiatan.triggerDistance).level, 7);
  assert.equal(levelBefore(1850, zlewiatan.triggerDistance).level, 8);
  assert.equal(levelBefore(1850, Infinity).level, 9);
});
