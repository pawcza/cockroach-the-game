import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanName, MAX_SCORE, parseBossProjectile, parseRunStats, parseScoreSubmission } from '../server/validate';

test('names lose control characters and surrounding space', () => {
  assert.equal(cleanName('  Kar\u0000aluch\n '), 'Karaluch');
  assert.equal(cleanName('   '), null);
  assert.equal(cleanName(123), null);
});

test('a score submission needs a sane score', () => {
  for (const body of [null, [], {}, { score: 1e308 }, { score: -1 }, { score: 1.5 }, { score: MAX_SCORE + 1 }, { score: '5' }]) {
    assert.ok('error' in parseScoreSubmission(body), JSON.stringify(body));
  }
});

test('optional score fields that make no sense are dropped, not stored', () => {
  const entry = parseScoreSubmission({
    name: 'a', score: 1, deathCause: { nested: true }, distance: 'far', maxLevel: 1e300, maxCombo: 12.4,
  });
  assert.ok(!('error' in entry));
  assert.deepEqual(
    [entry.deathCause, entry.distance, entry.maxLevel, entry.maxCombo],
    [null, null, null, 12],
  );
});

test('run stats keep known fields only', () => {
  assert.deepEqual(
    parseRunStats({ distance: 40, maxSpeed: 1.25, obstacleType: 'onion', evil: 'x'.repeat(1000), maxLevel: NaN }),
    { distance: 40, maxSpeed: 1.25, obstacleType: 'onion' },
  );
  assert.deepEqual(parseRunStats('nope'), {});
});

test('every boss that can kill is a known death cause, made-up ones are not', () => {
  for (const cause of ['boss', 'lodzia', 'bigos', 'eksterminator']) {
    assert.equal(parseRunStats({ obstacleType: cause }).obstacleType, cause);
    const entry = parseScoreSubmission({ name: 'a', score: 1, deathCause: cause });
    assert.ok(!('error' in entry) && entry.deathCause === cause);
  }
  assert.equal(parseRunStats({ obstacleType: 'lodzia2' }).obstacleType, undefined);
});

test('the hop and dash acts\' enemies are known death causes', () => {
  for (const cause of ['glue', 'bleach', 'lamp', 'mop', 'vacuum', 'hen', 'frog', 'centipede', 'boots', 'hedgehog']) {
    assert.equal(parseRunStats({ obstacleType: cause }).obstacleType, cause);
    const entry = parseScoreSubmission({ name: 'a', score: 1, deathCause: cause });
    assert.ok(!('error' in entry) && entry.deathCause === cause);
  }
});

test('boss projectiles are rebuilt from known fields', () => {
  const good = { lane: 'top', speed: 300, faceIdx: -1, indestructible: true, volley: false };
  assert.deepEqual(parseBossProjectile({ ...good, extra: 1 }), good);
  assert.equal(parseBossProjectile({ ...good, lane: 'middle' }), null);
  assert.equal(parseBossProjectile({ ...good, faceIdx: 7 }), null);
  assert.equal(parseBossProjectile({ ...good, speed: Infinity }), null);
});
