/**
 * The frame guard (UpdateGuard): a throw costs only the piece that threw, is reported, and a piece that keeps
 * throwing is switched off instead of spamming, unless it is essential.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DISABLE_STREAK, DISABLE_TOTAL, GuardReport, UpdateGuard } from '../src/systems/UpdateGuard';

const boom = (): never => { throw new Error('boom'); };

test('a throw is reported and the rest of the frame still runs', () => {
  const reports: GuardReport[] = [];
  const guard = new UpdateGuard(r => reports.push(r));
  guard.beginFrame();
  let after = false;
  assert.equal(guard.run('enemy', boom), false);
  assert.equal(guard.run('hud', () => { after = true; }), true);
  assert.equal(after, true);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].name, 'enemy');
  assert.equal((reports[0].error as Error).message, 'boom');
  assert.equal(reports[0].disabled, false);
});

test(`${DISABLE_STREAK} frames in a row switch a piece off, and then it is no longer run or reported`, () => {
  const reports: GuardReport[] = [];
  const guard = new UpdateGuard(r => reports.push(r));
  let calls = 0;
  const thrower = (): void => { calls++; boom(); };
  for (let f = 0; f < DISABLE_STREAK + 5; f++) { guard.beginFrame(); guard.run('frog', thrower); }
  assert.equal(calls, DISABLE_STREAK);
  assert.equal(reports.length, DISABLE_STREAK);
  assert.equal(reports[reports.length - 1].disabled, true);
  assert.equal(guard.isDisabled('frog'), true);
  assert.deepEqual(guard.disabled, ['frog']);
});

test('a frame without a throw breaks the streak; many throws in one run still switch it off', () => {
  const guard = new UpdateGuard(() => {});
  let frame = 0;
  const everyOther = (): void => { if (frame % 2 === 0) boom(); };
  for (; frame < 2 * DISABLE_TOTAL - 2; frame++) { guard.beginFrame(); guard.run('flaky', everyOther); }
  assert.equal(guard.isDisabled('flaky'), false, 'never two frames in a row, fewer than the total');
  for (; frame < 2 * DISABLE_TOTAL + 2; frame++) { guard.beginFrame(); guard.run('flaky', everyOther); }
  assert.equal(guard.isDisabled('flaky'), true);
});

test('two throws in one frame count as one frame of the streak', () => {
  const guard = new UpdateGuard(() => {});
  for (let f = 0; f < DISABLE_STREAK - 1; f++) {
    guard.beginFrame();
    guard.run('twice', boom);
    guard.run('twice', boom);
  }
  assert.equal(guard.isDisabled('twice'), false);
});

test('an essential piece is never switched off, and its reports are kept a second apart', () => {
  const reports: GuardReport[] = [];
  let now = 0;
  const guard = new UpdateGuard(r => reports.push(r), () => now);
  let calls = 0;
  for (let f = 0; f < 120; f++) {
    guard.beginFrame();
    now += 16;
    guard.run('floors', () => { calls++; boom(); }, true);
  }
  assert.equal(calls, 120, 'still run every frame');
  assert.equal(guard.isDisabled('floors'), false);
  assert.ok(reports.length >= 1 && reports.length <= 2, `reported ${reports.length} times over ~2 s`);
});

test('pieces are counted apart', () => {
  const guard = new UpdateGuard(() => {});
  for (let f = 0; f < DISABLE_STREAK; f++) { guard.beginFrame(); guard.run('a', boom); guard.run('b', () => {}); }
  assert.equal(guard.isDisabled('a'), true);
  assert.equal(guard.isDisabled('b'), false);
});
