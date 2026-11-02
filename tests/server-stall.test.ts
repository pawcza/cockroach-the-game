import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inGame, next, startServer } from './support/harness';

test('a player who goes silent is counted dead, so the lobby does not hang', async () => {
  const harness = await startServer({ stallMs: 300, sweepMs: 50 });
  try {
    const [a, b] = await inGame(harness, 2);
    b.emit('game:pickup', { x: 1, score: 77 });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const over = next<{ rankings: Array<{ id: string; score: number }> }>(a, 'game:over');
    a.emit('game:death', { score: 5, stats: {} });
    const { rankings } = await over;
    assert.deepEqual(rankings.map((r) => [r.id, r.score]), [[b.id, 77], [a.id, 5]]);
  } finally {
    await harness.stop();
  }
});
