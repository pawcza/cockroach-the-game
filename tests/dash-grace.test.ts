import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DASH_BUFFER_MS, Hold, SWAP_DASH_GRACE_MS, SWAP_DASH_WINDOW_MS, dashStillWanted, holdOn, settleHold, shiftHold,
} from '../src/systems/dashGrace';

test('a lethal touch right after a swap is held, for a short moment only', () => {
  const hold = holdOn(1050, null, 1000, null, true);
  assert.deepEqual(hold, { since: 1050, until: 1050 + SWAP_DASH_GRACE_MS });
});

test('no dash to give, no swap just made, or a swap long ago: the touch kills at once', () => {
  assert.equal(holdOn(1050, null, 1000, null, false), null);
  assert.equal(holdOn(1050, null, null, null, true), null);
  assert.equal(holdOn(1000 + SWAP_DASH_WINDOW_MS + 1, null, 1000, null, true), null);
  assert.equal(holdOn(900, null, 1000, null, true), null);
});

test('hold, no dash: it kills when its time is up, whether or not the overlap lasted', () => {
  const hold = holdOn(1050, null, 1000, null, true)!;
  for (let t = 1050; t < hold.until; t += 16) assert.equal(settleHold(t, hold, null), 'wait');
  assert.equal(settleHold(hold.until, hold, null), 'kill');
  assert.equal(settleHold(hold.until + 500, hold, null), 'kill');
});

test('hold, then a dash started inside the window: it punts, at once and when the time is up', () => {
  const hold = holdOn(1050, null, 1000, null, true)!;
  assert.equal(settleHold(1100, hold, 1100), 'punt');
  assert.equal(settleHold(hold.until, hold, hold.until), 'punt');
  // A dash that started before the hold, or after it ran out, is none
  assert.equal(settleHold(1100, hold, 1049), 'wait');
  assert.equal(settleHold(hold.until + 16, hold, hold.until + 1), 'kill');
});

test('one hold at a time: a second touch shares it, a new swap does not extend it', () => {
  const hold = holdOn(1050, null, 1000, null, true)!;
  // A second obstacle, and a fresh swap, while it is on: the same hold, the same end
  assert.equal(holdOn(1100, hold, 1000, null, true), hold);
  assert.equal(holdOn(1150, hold, 1140, null, true), hold);
  // Up, the touch kills (the verdict is the kill), no new hold on the spot
  assert.equal(holdOn(hold.until, hold, 1140, null, true), null);
});

test('a swap that had its hold earns no second one: alternating swaps cannot re-arm it', () => {
  const hold = holdOn(1005, null, 1000, null, true)!;
  // Settled, and 25 ms later (still inside the swap's 250 ms) another touch: no new hold for the same swap
  assert.equal(holdOn(hold.until + 25, null, 1000, 1000, true), null);
  // A fresh swap does earn one
  assert.ok(holdOn(hold.until + 25, null, hold.until + 20, 1000, true));
});

test('a pause moves the hold with it', () => {
  const hold: Hold = { since: 1050, until: 1270 };
  assert.deepEqual(shiftHold(hold, 5000), { since: 6050, until: 6270 });
  assert.equal(settleHold(6200, shiftHold(hold, 5000), null), 'wait');
});

test('a dash pressed a few frames early is kept for those frames', () => {
  assert.equal(dashStillWanted(1000, null), false);
  assert.equal(dashStillWanted(1000, 1000), true);
  assert.equal(dashStillWanted(1000 + DASH_BUFFER_MS, 1000), true);
  assert.equal(dashStillWanted(1000 + DASH_BUFFER_MS + 1, 1000), false);
});
