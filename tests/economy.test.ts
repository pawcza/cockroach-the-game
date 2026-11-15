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

test('every level pays once, and the set cannot buy out the shop', async () => {
  const economy = await import('../server/economy');
  const { ACHIEVEMENTS } = await import('../server/achievements');
  const total = ACHIEVEMENTS.reduce((sum, a) => sum + a.reward, 0);
  const shop = Object.values(economy.SHOP).reduce((sum, item) => sum + item.price, 0);
  assert.ok(total < shop * 0.75, `the set pays ${total}, the shop sells for ${shop}`);

  const cookie = await harness.signIn('google-leveller', 'Leveller');
  const me = await (await call(cookie, '/api/me')).json() as { user: { id: number } };
  const put = async (stats: Record<string, number>) => (await (await fetch(`${harness.url}/api/me/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-Forwarded-For': '203.0.113.92' },
    body: JSON.stringify({ stats, achievements: {} }),
  })).json() as { paid: { id: string; reward: number }[] }).paid;
  const crumbs = async () => (await (await call(cookie, '/api/me/shop', undefined, '203.0.113.92')).json() as State).crumbs;

  // 3500 apples reach the first two levels of the card together; the same stats again pay nothing more
  assert.deepEqual((await put({ apples: 3500 })).map(p => p.id).sort(), ['jablka-1', 'sadownik']);
  assert.equal(await crumbs(), 50 + 150);
  assert.deepEqual(await put({ apples: 3500 }), []);
  // The next level pays on its own, and only it
  assert.deepEqual((await put({ apples: 10000 })).map(p => p.id), ['jablka-3']);
  assert.equal(await crumbs(), 50 + 150 + 350);
  assert.deepEqual(await put({ apples: 10000 }), []);

  // A one-off that needs a stat the client never sent reaches nothing; one it did send pays
  assert.deepEqual(await put({ apples: 10000, lodziaWins: 1 }).then(paid => paid.map(p => p.id)), ['boss-lodzia']);

  // Missions done and items owned are the server's own record: what a client claims for them pays nothing
  assert.deepEqual(await put({ missionsDone: 500, itemsOwned: 20 }), []);

  // Finishing missions moves the record, and the level pays at that moment
  const db = (await import('../server/db')).default;
  db.prepare('INSERT INTO missions_done (user_id, done) VALUES (?, 9) ON CONFLICT(user_id) DO UPDATE SET done = 9').run(me.user.id);
  const before = await crumbs();
  economy.reportRun(me.user.id, MAXED);
  const finished = (db.prepare('SELECT done FROM missions_done WHERE user_id = ?').get(me.user.id) as { done: number }).done;
  assert.ok(finished >= 10, `missions counted (${finished})`);
  const paid = economy.payStored(me.user.id);
  assert.deepEqual(paid.map(p => p.id), ['misje-1']);
  assert.ok((await crumbs()) > before);
  assert.deepEqual(economy.payStored(me.user.id), [], 'once');

  // Ten items owned pay the shop level
  for (const item of ['zombie', 'lodowy', 'robot', 'lawa', 'metal', 'kosmiczny', 'czapka', 'imprezowa', 'kowbojski']) {
    db.prepare('INSERT INTO owned (user_id, item) VALUES (?, ?)').run(me.user.id, item);
  }
  assert.deepEqual(economy.payStored(me.user.id), [], 'nine are not ten');
  db.prepare('INSERT INTO owned (user_id, item) VALUES (?, ?)').run(me.user.id, 'sluchawki');
  assert.deepEqual(economy.payStored(me.user.id).map(p => p.id), ['szafa-gra']);
  assert.deepEqual(economy.payStored(me.user.id), []);
});

test('missions that need the dash are only handed to a player who has beaten Lodzia (the checkpoints stat)', async () => {
  const NEEDS_DASH = ['przebicia', 'sciana'];
  const missionsOf = async (cookie: string): Promise<string[]> =>
    ((await (await call(cookie, '/api/me/shop')).json()) as State).missions.map(m => m.id);

  const without: string[] = [];
  const withDash: string[] = [];
  for (let i = 0; i < 40; i++) {
    without.push(...await missionsOf(await harness.signIn(`google-nodash-${i}`, `NoDash${i}`)));
    const cookie = await harness.signIn(`google-dash-${i}`, `Dash${i}`);
    const saved = await fetch(`${harness.url}/api/me/profile`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ stats: { checkpoints: 1 }, achievements: {} }),
    });
    assert.equal(saved.status, 200);
    withDash.push(...await missionsOf(cookie));
  }
  assert.ok(!without.some(id => NEEDS_DASH.includes(id)), 'nobody without the dash is asked to use it');
  assert.ok(withDash.some(id => NEEDS_DASH.includes(id)), 'with it, the pool is the whole set again');
});
