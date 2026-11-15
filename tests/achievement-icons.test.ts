/** Every achievement has an icon in the core atlas (tools/art/icons.py), and a future one without a mapping gets the fallback star. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ACHIEVEMENTS, type Achievement } from '../server/achievements';
import { achievementIcon, ICON_FALLBACK, ICON_HIDDEN, tierOf } from '../src/systems/achievementView';

const frames = Object.keys((JSON.parse(readFileSync('public/assets/sprites.json', 'utf8')) as { frames: Record<string, unknown> }).frames);

test('every achievement resolves to a frame in the core atlas, none to the fallback', () => {
  for (const achievement of ACHIEVEMENTS) {
    const icon = achievementIcon(achievement);
    assert.ok(frames.includes(`${icon}_0`), `${achievement.id}: no frame ${icon}_0`);
    assert.notEqual(icon, ICON_FALLBACK, `${achievement.id} has no icon of its own`);
  }
  for (const icon of [ICON_FALLBACK, ICON_HIDDEN]) assert.ok(frames.includes(`${icon}_0`), icon);
});

test('an achievement nobody has drawn an icon for shows the fallback', () => {
  const unknown = { id: 'future-one', name: 'Przyszłość', description: '', reward: 1, test: () => false } satisfies Achievement;
  assert.equal(achievementIcon(unknown), ICON_FALLBACK);
  assert.equal(achievementIcon({ id: 'future-1', group: 'future' }), ICON_FALLBACK);
});

test('a card\'s frame steps from none through bronze, silver and gold to its own look when complete', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(done => tierOf(done, 4)), ['none', 'bronze', 'silver', 'gold', 'max']);
  assert.deepEqual([0, 1, 2, 3].map(done => tierOf(done, 3)), ['none', 'bronze', 'silver', 'max']);
});
