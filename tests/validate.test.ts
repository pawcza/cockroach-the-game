import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHECKPOINT_STARTS, ENDLESS_START, PRACTICE_STARTS } from '../server/bossDistances';
import { parseRunClaim, validStart } from '../server/runCheck';
import { cleanName, MAX_SCORE, parseBossProjectile, parseProfile, parseRunStats } from '../server/validate';

test('names lose control characters and surrounding space', () => {
  assert.equal(cleanName('  Kar\u0000aluch\n '), 'Karaluch');
  assert.equal(cleanName('   '), null);
  assert.equal(cleanName(123), null);
});

const CLAIM = {
  score: 10, distance: 120, level: 2, combo: 3, apples: 4, beers: 1, pills: 0, nearMisses: 1, dashThroughs: 0, wallsBroken: 0,
  kills: 0, seconds: 30, noHitWins: 0, moultSaves: 0,
};

test('a run report needs whole sane numbers and known bosses, once each', () => {
  assert.ok(parseRunClaim(CLAIM));
  for (const body of [null, [], {}, { ...CLAIM, score: 1e308 }, { ...CLAIM, score: -1 }, { ...CLAIM, distance: '5' },
    { ...CLAIM, seconds: NaN }, { ...CLAIM, bosses: ['lodzia', 'nobody'] }, { ...CLAIM, bosses: 'lodzia' },
    { ...CLAIM, bosses: ['lodzia', 'lodzia', 'bigos', 'zlewiatan', 'eksterminator'] }]) {
    assert.equal(parseRunClaim(body), null, JSON.stringify(body));
  }
  assert.deepEqual(parseRunClaim({ ...CLAIM, bosses: ['bigos', 'bigos'] })?.bosses, ['bigos']);
  const odd = parseRunClaim({ ...CLAIM, combo: 12.7, deathCause: { nested: true }, allBosses: 'yes' });
  assert.deepEqual([odd?.combo, odd?.deathCause, odd?.allBosses], [12, null, false]);
});

test('a run starts from 0 m or from a boss\'s checkpoint, nowhere else', () => {
  assert.deepEqual(CHECKPOINT_STARTS, [...PRACTICE_STARTS, ENDLESS_START]);
  assert.equal(PRACTICE_STARTS.length, 3);
  for (const start of [0, ...CHECKPOINT_STARTS]) assert.ok(validStart(start), String(start));
  for (const start of [undefined, null, -1, 1, 251, 2601, 1e9, '250', '2600', true, {}, NaN]) assert.ok(!validStart(start), JSON.stringify(start));
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
    assert.equal(parseRunClaim({ ...CLAIM, deathCause: cause })?.deathCause, cause);
  }
  assert.equal(parseRunStats({ obstacleType: 'lodzia2' }).obstacleType, undefined);
});

test('the hop, dash and gun acts\' enemies are known death causes', () => {
  for (const cause of ['glue', 'bleach', 'lamp', 'mop', 'vacuum', 'hen', 'frog', 'centipede', 'boots', 'hedgehog',
    'gull', 'wasp', 'zapper', 'robotVacuum', 'repeller', 'aerosol', 'bait']) {
    assert.equal(parseRunStats({ obstacleType: cause }).obstacleType, cause);
    assert.equal(parseRunClaim({ ...CLAIM, deathCause: cause })?.deathCause, cause);
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
