import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanName, MAX_SCORE, parseBossProjectile, parseRunStats, parseScoreSubmission } from '../server/validate';

test('names lose control characters and surrounding space', () => {
  assert.equal(cleanName('  Kar\u0000aluch\n '), 'Karaluch');
  assert.equal(cleanName('   '), null);
  assert.equal(cleanName(123), null);
});

test('a score submission needs a sane name and score', () => {
  for (const body of [null, [], {}, { name: 'a', score: 1e308 }, { name: 'a', score: -1 }, { name: 'a', score: 1.5 },
    { name: 'a', score: MAX_SCORE + 1 }, { name: 'a'.repeat(21), score: 1 }, { name: {}, score: 1 }]) {
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

test('boss projectiles are rebuilt from known fields', () => {
  const good = { lane: 'top', speed: 300, faceIdx: -1, indestructible: true, volley: false };
  assert.deepEqual(parseBossProjectile({ ...good, extra: 1 }), good);
  assert.equal(parseBossProjectile({ ...good, lane: 'middle' }), null);
  assert.equal(parseBossProjectile({ ...good, faceIdx: 7 }), null);
  assert.equal(parseBossProjectile({ ...good, speed: Infinity }), null);
});
