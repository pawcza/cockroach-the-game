import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ack, startServer, type Harness } from './support/harness';

let harness: Harness;
before(async () => { harness = await startServer(); });
after(async () => { await harness.stop(); });

const DAY = 86_400_000;
const MAXED = {
  score: 99999, distance: 99999, level: 10, combo: 99, apples: 999, beers: 99, pills: 9,
  nearMisses: 99, dashThroughs: 99, wallsBroken: 9, daily: true, multiplayer: true,
};

interface State {
  crumbs: number;
  owned: string[];
  look: { skin: string | null; head: string | null; back: string | null };
  missions: { id: string; done: boolean; reward: number }[];
}

const call = (cookie: string, path: string, body?: unknown, ip = '203.0.113.90') => fetch(`${harness.url}${path}`, {
  method: body === undefined ? 'GET' : 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-Forwarded-For': ip },
  body: body === undefined ? undefined : JSON.stringify(body),
});

test('okruszki: missions pay, the shop takes, you wear only what you own, and it all goes with the account', async () => {
  assert.equal((await fetch(`${harness.url}/api/me/shop`)).status, 401, 'guests have no wallet');

  const cookie = await harness.signIn('google-shopper', 'Shopper');
  const me = await (await call(cookie, '/api/me')).json() as { user: { id: number } };
  let state = await (await call(cookie, '/api/me/shop')).json() as State;
  assert.equal(state.crumbs, 0);
  assert.equal(state.missions.length, 3);
  assert.equal(new Set(state.missions.map(m => m.id)).size, 3, 'three different missions');

  assert.equal((await call(cookie, '/api/me/buy', { item: 'korona' })).status, 400, 'not enough okruszki');

  // A run that reaches everything finishes all three, and pays exactly their rewards
  const report = await (await call(cookie, '/api/me/run', MAXED)).json() as { completed: { reward: number }[]; state: State };
  assert.equal(report.completed.length, 3);
  const paid = report.completed.reduce((sum, m) => sum + m.reward, 0);
  assert.equal(report.state.crumbs, paid);
  assert.ok(report.state.missions.every(m => m.done));

  // Finished missions wait for tomorrow: the same day pays nothing more
  await new Promise((resolve) => setTimeout(resolve, 2100));
  const again = await (await call(cookie, '/api/me/run', MAXED)).json() as { completed: unknown[] };
  assert.deepEqual(again.completed, []);
  await new Promise((resolve) => setTimeout(resolve, 2100));
  assert.equal((await call(cookie, '/api/me/run', { ...MAXED, score: -1 })).status, 400, 'a junk report');

  // Tomorrow, three new ones, and they pay again
  const economy = await import('../server/economy');
  const tomorrow = Date.now() + DAY;
  state = economy.shopState(me.user.id, tomorrow) as State;
  assert.ok(state.missions.every(m => !m.done));
  economy.reportRun(me.user.id, MAXED, tomorrow);
  economy.reportRun(me.user.id, MAXED, tomorrow + DAY);
  state = economy.shopState(me.user.id) as State;
  assert.ok(state.crumbs >= 300, `enough for a cap (${state.crumbs})`);

  const bought = await (await call(cookie, '/api/me/buy', { item: 'czapka' })).json() as State;
  assert.deepEqual(bought.owned, ['czapka']);
  assert.equal(bought.crumbs, state.crumbs - 300);
  assert.equal((await call(cookie, '/api/me/buy', { item: 'czapka' })).status, 400, 'not twice');
  assert.equal((await call(cookie, '/api/me/look', { skin: null, head: 'korona', back: null })).status, 400, 'not owned');
  assert.equal((await call(cookie, '/api/me/look', { skin: 'czapka', head: null, back: null })).status, 400, 'wrong slot');
  const worn = await (await call(cookie, '/api/me/look', { skin: null, head: 'czapka', back: null })).json() as State;
  assert.deepEqual(worn.look, { skin: null, head: 'czapka', back: null });

  // In a lobby, others see what you wear
  const socket = await harness.connect({ cookie, 'x-forwarded-for': '198.51.100.77' });
  socket.emit('set-name', 'Shopper');
  const { lobby } = await ack<{ lobby: { players: { look: unknown }[] } }>(socket, 'lobby:create');
  assert.deepEqual(lobby.players[0].look, { skin: null, head: 'czapka', back: null });
  socket.disconnect();

  assert.equal((await fetch(`${harness.url}/api/me`, { method: 'DELETE', headers: { Cookie: cookie } })).status, 200);
  const gone = economy.shopState(me.user.id) as State;
  assert.equal(gone.crumbs, 0);
  assert.deepEqual(gone.owned, []);
});

test('achievements pay their okruszki once, and only for what the stats reach', async () => {
  const cookie = await harness.signIn('google-achiever', 'Achiever');
  const put = (stats: Record<string, number>, achievements: Record<string, number> = {}) => fetch(`${harness.url}/api/me/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-Forwarded-For': '203.0.113.91' },
    body: JSON.stringify({ stats, achievements }),
  });
  const shop = async () => (await (await fetch(`${harness.url}/api/me/shop`, { headers: { Cookie: cookie } })).json() as State).crumbs;

  // Claiming an achievement the stats don't reach pays nothing
  let res = await (await put({ runs: 3, bestLevel: 3 }, { 'poziom-10': 1 })).json() as { paid: { id: string; reward: number }[] };
  assert.deepEqual(res.paid, []);
  assert.equal(await shop(), 0);

  // Reaching level 6 pays the level 4 and level 6 ones
  res = await (await put({ runs: 9, bestLevel: 6 })).json() as typeof res;
  assert.deepEqual(res.paid.map(p => p.id).sort(), ['poziom-4', 'poziom-6']);
  assert.equal(await shop(), 60 + 120);

  // The same stats again, from another device: already paid
  res = await (await put({ runs: 9, bestLevel: 6 })).json() as typeof res;
  assert.deepEqual(res.paid, []);
  assert.equal(await shop(), 180);
});
