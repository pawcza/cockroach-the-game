import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOSSES, BossDef, BossId, bossById, dueBoss } from '../src/systems/boss/bosses';

const ladder: BossDef[] = [
  bossById('zlewiatan'),
  bossById('lodzia'),
  bossById('eksterminator'),
];
const beaten = (...ids: BossId[]): Set<BossId> => new Set(ids);

test('no boss before the first distance', () => {
  assert.equal(dueBoss(ladder, 249, beaten()), null);
});

test('the nearest boss comes first, whatever order the ladder lists them in', () => {
  assert.equal(dueBoss(ladder, 250, beaten())?.id, 'lodzia');
});

test('a run past several distances meets them one at a time, in order', () => {
  assert.equal(dueBoss(ladder, 3000, beaten())?.id, 'lodzia');
  assert.equal(dueBoss(ladder, 3000, beaten('lodzia'))?.id, 'zlewiatan');
  assert.equal(dueBoss(ladder, 3000, beaten('lodzia', 'zlewiatan'))?.id, 'eksterminator');
});

test('a beaten boss never comes back', () => {
  assert.equal(dueBoss(ladder, 1000, beaten('lodzia')), null);
  assert.equal(dueBoss(ladder, 5000, beaten('lodzia', 'zlewiatan', 'eksterminator')), null);
});

test('the next boss waits for its own distance', () => {
  assert.equal(dueBoss(ladder, 1799, beaten('lodzia')), null);
  assert.equal(dueBoss(ladder, 1800, beaten('lodzia'))?.id, 'zlewiatan');
});

test('a boss left off the ladder is never scheduled', () => {
  assert.equal(dueBoss([bossById('zlewiatan')], 300, beaten()), null);
  assert.equal(dueBoss([bossById('zlewiatan')], 1800, beaten())?.id, 'zlewiatan');
});

test('the ladder has Zlewiatan at 1800 m and every boss once', () => {
  assert.equal(bossById('zlewiatan').triggerDistance, 1800);
  assert.equal(new Set(BOSSES.map(b => b.id)).size, BOSSES.length);
});

test('every boss has what its versus splash shows: a name, an epithet and an accent colour', () => {
  for (const boss of BOSSES) {
    assert.ok(boss.name.length > 0 && boss.epithet.length > 0, boss.id);
    assert.ok(Number.isInteger(boss.accent) && boss.accent >= 0 && boss.accent <= 0xffffff, boss.id);
  }
});
