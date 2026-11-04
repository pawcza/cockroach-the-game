import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acceptsDaily, dailyDate, dailySeed, DAILY_GRACE_MS } from '../server/daily';

test("the day is Warsaw's: past midnight there, it is already tomorrow", () => {
  // 23:30 UTC on 4 Nov is 00:30 on 5 Nov in Warsaw (CET, UTC+1)
  assert.equal(dailyDate(Date.UTC(2026, 10, 4, 23, 30)), '2026-11-05');
  assert.equal(dailyDate(Date.UTC(2026, 10, 4, 22, 30)), '2026-11-04');
});

test('every player gets the same seed for a day, and a new one the next', () => {
  assert.equal(dailySeed('2026-11-04'), dailySeed('2026-11-04'));
  assert.notEqual(dailySeed('2026-11-04'), dailySeed('2026-11-05'));
  assert.ok(Number.isInteger(dailySeed('2026-11-04')));
});

test("yesterday's run can still be saved just after midnight, not later", () => {
  const midnight = Date.UTC(2026, 10, 4, 23, 0); // 00:00 on 5 Nov in Warsaw
  assert.ok(acceptsDaily('2026-11-04', midnight + DAILY_GRACE_MS - 1000));
  assert.ok(!acceptsDaily('2026-11-04', midnight + DAILY_GRACE_MS + 1000));
  assert.ok(acceptsDaily('2026-11-05', midnight + 1000));
  assert.ok(!acceptsDaily('2026-11-06', midnight + 1000), 'nor a day that has not come');
});
