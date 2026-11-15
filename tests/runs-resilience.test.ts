/**
 * A match's payments never hold up or end a match: the database failing under the run tickets (server/runs.ts) leaves
 * the players their results, and the stall sweep's timer can't take the process down (review1: the sweep and game:over).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ack, next, startServer, TEST_AUTH } from './support/harness';

test('with the tickets\' table gone, a match still ends for everyone, by deaths and by the stall sweep', async () => {
  const harness = await startServer({ auth: TEST_AUTH, stallMs: 300, sweepMs: 50 });
  try {
    const sessions = [await harness.signIn('google-broken-a', 'A'), await harness.signIn('google-broken-b', 'B')];
    const a = await harness.connect({ cookie: sessions[0], 'x-forwarded-for': '198.51.100.231' });
    const b = await harness.connect({ cookie: sessions[1], 'x-forwarded-for': '198.51.100.232' });
    a.emit('set-name', 'A');
    b.emit('set-name', 'B');
    const { lobby } = await ack<{ lobby: { id: string } }>(a, 'lobby:create');
    await ack(b, 'lobby:join', lobby.id);
    await ack(b, 'lobby:ready', true);
    const started = await ack<{ ticket: string | null }>(a, 'lobby:start');
    assert.ok(started.ticket, 'tickets were issued');

    // The database fails from here on: every ticket write throws
    const db = (await import('../server/db')).default;
    db.exec('DROP TABLE run_tickets');
    const errors: unknown[] = [];
    const log = console.error;
    console.error = (...args: unknown[]) => { errors.push(args); };
    try {
      // A dies by a socket event; B goes silent and the sweep counts it dead: both write a ticket, both fail
      const over = next<{ rankings: { id: string }[] }>(a, 'game:over');
      a.emit('game:death', { score: 5, stats: {} });
      const { rankings } = await over;
      assert.deepEqual(rankings.map(r => r.id).sort(), [a.id, b.id].sort());
    } finally {
      console.error = log;
    }
    assert.ok(errors.length > 0, 'the failures were logged, not thrown');
    // The server is still up
    assert.equal((await fetch(`${harness.url}/api/scores`)).status, 200);
  } finally {
    await harness.stop();
  }
});
