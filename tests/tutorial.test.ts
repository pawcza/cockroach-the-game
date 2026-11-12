import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  APPLES_PER_LANE, FINISH_MS, MAX_RETRIES, NUDGE_AFTER_MS, PASS_PX, SHOW_WITHIN_PX,
  TutorialFlow, applePlan, dodgeDue, hopKey, isNudging,
} from '../src/systems/tutorialFlow';

describe('tutorial flow', () => {
  it('waits on the hop steps for as long as the player does nothing', () => {
    const flow = new TutorialFlow(0);
    for (const now of [0, 1000, 20000, 600000]) assert.equal(flow.update(now, 'bottom', now / 5), null);
    assert.equal(flow.step, 'hopUp');
  });

  it('shows the first prompt after a second of empty run, the second after half of one', () => {
    const flow = new TutorialFlow(0);
    assert.equal(flow.promptDue(999), false);
    assert.equal(flow.promptDue(1000), true);
    assert.equal(flow.update(1500, 'top', 300), 'dropDown');
    assert.equal(flow.promptDue(1900), false);
    assert.equal(flow.promptDue(2000), true);
  });

  it('moves on only for the right lane change', () => {
    const flow = new TutorialFlow(0);
    // Down from the bottom lane is the wrong key: it does nothing, so the lane stays
    assert.equal(flow.update(100, 'bottom', 0), null);
    assert.equal(flow.update(200, 'top', 0), 'dropDown');
    assert.equal(flow.update(300, 'top', 0), null);
    assert.equal(flow.update(400, 'bottom', 0), 'obstacle');
  });

  it('runs the whole lesson: obstacle passed, apples passed, the send-off, done', () => {
    const flow = new TutorialFlow(0);
    flow.update(0, 'top', 0);
    flow.update(0, 'bottom', 0);
    // Nothing to pass until the obstacle is laid
    assert.equal(flow.update(10, 'bottom', 5000), null);
    flow.laid(1000, 'bottom', 2000);
    assert.equal(flow.update(20, 'top', 1000 + PASS_PX), null);
    assert.equal(flow.update(30, 'top', 1000 + PASS_PX + 1), 'apples');
    assert.equal(flow.update(40, 'top', 2000 + PASS_PX), null);
    assert.equal(flow.update(50, 'bottom', 2000 + PASS_PX + 1), 'finish');
    assert.equal(flow.update(50 + FINISH_MS - 1, 'bottom', 9000), null);
    assert.equal(flow.update(50 + FINISH_MS, 'bottom', 9000), 'done');
    assert.equal(flow.update(99999, 'bottom', 9000), null);
  });

  it('protects the roach until the send-off, and repeats the obstacle a couple of times', () => {
    const flow = new TutorialFlow(0);
    flow.update(0, 'top', 0);
    flow.update(0, 'bottom', 0);
    flow.laid(1000, 'bottom', 2000);
    assert.equal(flow.protects, true);
    for (let i = 0; i < MAX_RETRIES; i++) {
      assert.equal(flow.hit(), 'retry');
      assert.equal(flow.step, 'obstacle');
      assert.equal(flow.obstacleX, null);
      flow.laid(1000, 'bottom', 2000);
    }
    assert.equal(flow.hit(), 'giveUp');
    assert.equal(flow.step, 'apples');
  });

  it('ignores hits outside the obstacle step, but still protects until the send-off', () => {
    const flow = new TutorialFlow(0);
    assert.equal(flow.hit(), 'ignore');
    assert.equal(flow.protects, true);
    flow.finish();
    assert.equal(flow.protects, false);
    assert.equal(flow.step, 'done');
  });

  it('lays the apples across both lanes, the dodged-into lane first', () => {
    const plan = applePlan('bottom', 1000);
    assert.equal(plan.length, APPLES_PER_LANE * 2);
    assert.deepEqual(plan.map(a => a.lane), ['top', 'top', 'top', 'bottom', 'bottom', 'bottom']);
    assert.ok(plan.every((a, i) => a.x > 1000 && (i === 0 || a.x > plan[i - 1].x)));
    assert.deepEqual(applePlan('top', 0).map(a => a.lane).slice(0, 1), ['bottom']);
  });

  it('names the key for the lane the roach is in, and shows the dodge prompt only in the obstacle lane and early enough', () => {
    assert.equal(hopKey('bottom'), '↑');
    assert.equal(hopKey('top'), '↓');
    assert.equal(dodgeDue(1000, 'bottom', 1000 - SHOW_WITHIN_PX, 'bottom'), false);
    assert.equal(dodgeDue(1000, 'bottom', 1000 - SHOW_WITHIN_PX + 1, 'bottom'), true);
    assert.equal(dodgeDue(1000, 'bottom', 900, 'top'), false);
  });

  it('pulses a prompt nobody has answered for a while', () => {
    assert.equal(isNudging(NUDGE_AFTER_MS - 1), false);
    assert.equal(isNudging(NUDGE_AFTER_MS), true);
  });
});
