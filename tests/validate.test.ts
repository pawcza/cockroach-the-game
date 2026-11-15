import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHECKPOINT_STARTS, ENDLESS_START, PRACTICE_STARTS } from '../server/bossDistances';
import { COURSE_VERSION } from '../server/daily';
import { cleanName, MAX_SCORE, parseBossProjectile, parseProfile, parseRunStats, parseScoreSubmission } from '../server/validate';

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

test('a run from 0 m is ranked on the main board, one from the Eksterminator on Bez końca; practice starts are refused', () => {
  // An old cached client has no start to send, and cannot start anywhere but 0
  for (const start of [undefined, 0, null]) {
    const entry = parseScoreSubmission({ score: 10, start });
    assert.ok(!('error' in entry) && entry.board === null, JSON.stringify(start));
  }
  assert.deepEqual(CHECKPOINT_STARTS, [...PRACTICE_STARTS, ENDLESS_START]);
  assert.equal(PRACTICE_STARTS.length, 3);
  for (const start of PRACTICE_STARTS) {
    const refused = parseScoreSubmission({ score: 10, start });
    assert.ok('error' in refused && /practice/.test(refused.error), `start ${start}`);
    // The same on a daily run: the board for that day is for runs from 0, too
    assert.ok('error' in parseScoreSubmission({ score: 10, start, daily: '2026-11-14', course: COURSE_VERSION }));
  }
  const endless = parseScoreSubmission({ score: 10, start: ENDLESS_START });
  assert.ok(!('error' in endless) && endless.board === 'endless' && endless.daily === null);
  // Karaluch Dnia always starts from 0 m
  assert.ok('error' in parseScoreSubmission({ score: 10, start: ENDLESS_START, daily: '2026-11-14', course: COURSE_VERSION }));
  for (const start of [-1, 1, 251, 2601, 1e9, '250', '2600', true, {}, NaN]) {
    const refused = parseScoreSubmission({ score: 10, start });
    assert.ok('error' in refused && refused.error === 'Invalid start', JSON.stringify(start));
  }
});

test('a Karaluch Dnia score comes only from a client that lays today\'s course; the other boards take any', () => {
  assert.ok(!('error' in parseScoreSubmission({ score: 10, daily: '2026-11-14', course: COURSE_VERSION })));
  for (const course of [undefined, COURSE_VERSION - 1, String(COURSE_VERSION), COURSE_VERSION + 1]) {
    const refused = parseScoreSubmission({ score: 10, daily: '2026-11-14', course });
    assert.ok('error' in refused && /out of date/.test(refused.error), JSON.stringify(course));
  }
  // An old client's all-time score is taken as before
  assert.ok(!('error' in parseScoreSubmission({ score: 10 })));
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

test('the hop, dash and gun acts\' enemies are known death causes', () => {
  for (const cause of ['glue', 'bleach', 'lamp', 'mop', 'vacuum', 'hen', 'frog', 'centipede', 'boots', 'hedgehog',
    'gull', 'wasp', 'zapper', 'robotVacuum', 'repeller', 'aerosol', 'bait']) {
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

test('a profile keeps the new stats, held to what a player could have, and refuses junk', () => {
  const profile = parseProfile({
    stats: { runs: 5, lodziaWins: 3, bestKills: 99_999, itemsOwned: 5000, missionsDone: 12, checkpoints: 3, moultSaves: 2.9 },
    achievements: { 'boss-lodzia': 1700000000000 },
  });
  assert.ok(profile);
  assert.equal(profile.stats.lodziaWins, 3);
  assert.equal(profile.stats.bestKills, 1000, 'more kills in a run than any run holds');
  assert.equal(profile.stats.itemsOwned, 100, 'more items than the shop sells');
  assert.equal(profile.stats.missionsDone, 12);
  assert.equal(profile.stats.checkpoints, 3);
  assert.equal(profile.stats.moultSaves, 2, 'whole numbers');
  assert.equal(profile.stats.runs, 5, 'the others are as sent');
  // Every stat of the set fits, with room, and so does every achievement
  const stats = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`stat${i}`, i]));
  assert.ok(parseProfile({ stats, achievements: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`a${i}`, 1])) }));
  assert.equal(parseProfile({ stats: Object.fromEntries(Array.from({ length: 49 }, (_, i) => [`stat${i}`, i])), achievements: {} }), null);
  for (const junk of [{ stats: { lodziaWins: -1 }, achievements: {} }, { stats: { lodziaWins: NaN }, achievements: {} }, { stats: { lodziaWins: '1' }, achievements: {} }]) {
    assert.equal(parseProfile(junk), null, JSON.stringify(junk));
  }
});
