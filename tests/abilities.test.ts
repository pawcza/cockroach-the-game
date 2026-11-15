import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ABILITIES, ABILITY_TEXT, Abilities, MOULT_CHARGES, dashFromStart } from '../src/systems/abilities';
import { runStart } from '../src/systems/checkpoints';
import { BOSSES, bossById } from '../src/systems/boss/bosses';

test('the reward table: Lodzia gives the dash, Bigos the gun, Zlewiatan the moult, Eksterminator nothing', () => {
  assert.equal(bossById('lodzia').reward, 'dash');
  assert.equal(bossById('bigos').reward, 'gun');
  assert.equal(bossById('zlewiatan').reward, 'moult');
  assert.equal(bossById('eksterminator').reward, null);
});

test('every reward is a power the run knows, with its own text', () => {
  for (const boss of BOSSES) {
    if (boss.reward === null) continue;
    assert.ok(ABILITIES.includes(boss.reward), boss.id);
    assert.ok(ABILITY_TEXT[boss.reward].name.length > 0 && ABILITY_TEXT[boss.reward].how.keyboard.length > 0, boss.id);
    assert.ok(ABILITY_TEXT[boss.reward].how.touch.length > 0, boss.id);
  }
});

test('a solo run starts with lane hops only', () => {
  const a = new Abilities(false);
  assert.equal(a.canDash, false);
  assert.equal(a.canShoot, false);
  assert.equal(a.has('moult'), false);
  assert.equal(a.moultCharges, 0);
});

test('beating the bosses hands over the powers one at a time', () => {
  const a = new Abilities(false);
  assert.equal(a.grantReward(bossById('lodzia')), 'dash');
  assert.equal(a.canDash, true);
  assert.equal(a.canShoot, false);
  assert.equal(a.grantReward(bossById('bigos')), 'gun');
  assert.equal(a.canShoot, true);
  assert.equal(a.grantReward(bossById('zlewiatan')), 'moult');
  assert.equal(a.moultCharges, MOULT_CHARGES);
  assert.equal(a.grantReward(bossById('eksterminator')), null);
});

test('a power already owned is not handed over twice', () => {
  const a = new Abilities(false);
  a.grant('gun');
  assert.equal(a.grantReward(bossById('bigos')), null);
  assert.equal(a.grant('gun'), false);
});

test('the moult takes one hit, then is spent but still owned', () => {
  const a = new Abilities(false);
  assert.equal(a.consumeMoult(), false);
  a.grant('moult');
  assert.equal(a.consumeMoult(), true);
  assert.equal(a.consumeMoult(), false);
  assert.equal(a.has('moult'), true);
  assert.equal(a.moultCharges, 0);
});

test('a match starts with the dash, never earns the moult, and still takes the gun as a gift', () => {
  const a = new Abilities(true);
  assert.equal(a.canDash, true);
  assert.equal(a.canShoot, false);
  assert.equal(a.grantReward(bossById('zlewiatan')), null);
  assert.equal(a.grant('moult'), false);
  assert.equal(a.consumeMoult(), false);
  assert.equal(a.grant('gun'), true);
  assert.equal(a.canShoot, true);
});

test('a new run forgets what the last one earned', () => {
  const a = new Abilities(false);
  a.grant('dash');
  a.grant('moult');
  a.reset(false);
  assert.equal(a.canDash, false);
  assert.equal(a.has('moult'), false);
  assert.equal(a.moultCharges, 0);
  a.reset(true);
  assert.equal(a.canDash, true);
});

test('the dash is kept once Lodzia has ever been beaten: the checkpoints stat, and nothing less', () => {
  assert.equal(dashFromStart(0), false);
  assert.equal(dashFromStart(1), true);
  assert.equal(dashFromStart(3), true);
});

/** What a run owns at its first frame, as GameScene builds it: the kit, then a checkpoint's bosses counted as beaten. */
function atStart(kind: 'solo' | 'daily' | 'multiplayer' | 'checkpoint', unlocked: number): string[] {
  const a = new Abilities();
  const multiplayer = kind === 'multiplayer';
  a.reset(multiplayer, !multiplayer && dashFromStart(unlocked));
  if (kind === 'checkpoint') for (const boss of runStart(Math.max(1, unlocked)).beaten) a.grantReward(boss);
  return ABILITIES.filter(id => a.has(id));
}

test('abilities at the start of a run: with the Lodzia unlock or without, solo, daily, match, checkpoint', () => {
  assert.deepEqual(atStart('solo', 0), []);
  assert.deepEqual(atStart('daily', 0), []);
  assert.deepEqual(atStart('solo', 1), ['dash']);
  assert.deepEqual(atStart('daily', 1), ['dash']);
  assert.deepEqual(atStart('solo', 3), ['dash'], 'a later boss gives no more than the dash up front');
  // A match gives everyone what it always has, whatever they earned
  assert.deepEqual(atStart('multiplayer', 0), ['dash']);
  assert.deepEqual(atStart('multiplayer', 3), ['dash']);
  // A checkpoint start needs the unlock, and hands over the powers up to its boss
  assert.deepEqual(atStart('checkpoint', 1), ['dash']);
  assert.deepEqual(atStart('checkpoint', 2), ['dash', 'gun']);
  assert.deepEqual(atStart('checkpoint', 3), ['dash', 'gun', 'moult']);
});

test('a run with the dash already owned: Lodzia hands nothing over, and resets still forget it', () => {
  const a = new Abilities(false);
  a.reset(false, true);
  assert.equal(a.canDash, true);
  assert.equal(a.canEarn('dash'), false);
  assert.equal(a.grantReward(bossById('lodzia')), null, 'no reward screen, no lesson: the run just resumes');
  assert.equal(a.canDash, true);
  a.reset(false, false);
  assert.equal(a.canDash, false, 'the next run starts as its player has earned');
  assert.equal(a.grantReward(bossById('lodzia')), 'dash');
});
