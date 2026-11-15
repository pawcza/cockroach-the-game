import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
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

  // A run that reaches everything finishes every mission one run can finish, and pays exactly their rewards. Which
  // three are drawn is random, and "Zagraj 5 biegów" takes five runs whatever the run did. (The numbers are a checked
  // run's: tests/runs.test.ts is how a run gets here)
  const economy = await import('../server/economy');
  const completed = economy.reportRun(me.user.id, MAXED);
  const oneRun = (id: string): boolean => id !== 'biegi';
  assert.equal(completed.length, state.missions.filter(m => oneRun(m.id)).length);
  const paid = completed.reduce((sum, m) => sum + m.reward, 0);
  const after = await (await call(cookie, '/api/me/shop')).json() as State;
  assert.equal(after.crumbs, paid);
  assert.ok(after.missions.every(m => m.done === oneRun(m.id)));

  // Finished missions wait for tomorrow: the same day pays nothing more
  assert.deepEqual(economy.reportRun(me.user.id, MAXED), []);

  // Tomorrow, three new ones, and they pay again
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

/** Sets an account's counted stats (playerStats.ts) as checked runs would have, and pays what they reach. */
async function counted(userId: number, stats: Record<string, number>): Promise<{ id: string; reward: number }[]> {
  const { saveStats, statsOf } = await import('../server/playerStats');
  const { payAchievements } = await import('../server/economy');
  saveStats(userId, { ...statsOf(userId), ...stats });
  return payAchievements(userId);
}

test('achievements pay their okruszki once, only for what the server\'s own count reaches, never for a saved profile', async () => {
  const cookie = await harness.signIn('google-achiever', 'Achiever');
  const me = await (await call(cookie, '/api/me')).json() as { user: { id: number } };
  const put = (stats: Record<string, number>, achievements: Record<string, number> = {}) => fetch(`${harness.url}/api/me/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-Forwarded-For': '203.0.113.91' },
    body: JSON.stringify({ stats, achievements }),
  });
  const shop = async () => (await (await fetch(`${harness.url}/api/me/shop`, { headers: { Cookie: cookie } })).json() as State).crumbs;

  // A profile claiming an achievement, and the stats for it, pays nothing (cockroach#215)
  assert.equal((await put({ runs: 3, bestLevel: 10 }, { 'poziom-10': 1 })).status, 200);
  assert.equal(await shop(), 0);

  // The server's count reaching level 6 pays the level 4 and level 6 ones
  assert.deepEqual((await counted(me.user.id, { runs: 9, bestLevel: 6 })).map(p => p.id).sort(), ['poziom-4', 'poziom-6']);
  assert.equal(await shop(), 60 + 120);

  // Again: already paid
  assert.deepEqual(await counted(me.user.id, { runs: 9, bestLevel: 6 }), []);
  assert.equal(await shop(), 180);
});

test('every level pays once, and the whole set is a lifetime\'s worth, not a shop\'s', async () => {
  const economy = await import('../server/economy');
  const { ACHIEVEMENTS } = await import('../server/achievements');
  // The shop is to grow several-fold (premium skins); the set, taking months to finish, pays under a 60 000 shop
  const total = ACHIEVEMENTS.reduce((sum, a) => sum + a.reward, 0);
  assert.ok(total > 12_520 && total < 60_000, `the set pays ${total}`);

  const cookie = await harness.signIn('google-leveller', 'Leveller');
  const me = await (await call(cookie, '/api/me')).json() as { user: { id: number } };
  const put = (stats: Record<string, number>) => counted(me.user.id, stats);
  const crumbs = async () => (await (await call(cookie, '/api/me/shop', undefined, '203.0.113.92')).json() as State).crumbs;

  // 5500 apples reach the first two levels of the card together; the same stats again pay nothing more
  assert.deepEqual((await put({ apples: 5500 })).map(p => p.id).sort(), ['jablka-1', 'sadownik']);
  assert.equal(await crumbs(), 60 + 250);
  assert.deepEqual(await put({ apples: 5500 }), []);
  // The next level pays on its own, and only it
  assert.deepEqual((await put({ apples: 15000 })).map(p => p.id), ['jablka-3']);
  assert.equal(await crumbs(), 60 + 250 + 700);
  assert.deepEqual(await put({ apples: 15000 }), []);

  // A one-off pays when its stat gets there
  assert.deepEqual(await put({ apples: 15000, lodziaWins: 1 }).then(paid => paid.map(p => p.id)), ['boss-lodzia']);

  // Missions done and items owned are counted from their own records, whatever the stats say
  assert.deepEqual(await put({ missionsDone: 500, itemsOwned: 20 }), []);

  // Finishing missions moves the record, and the level pays at that moment
  const db = (await import('../server/db')).default;
  db.prepare('INSERT INTO missions_done (user_id, done) VALUES (?, 9) ON CONFLICT(user_id) DO UPDATE SET done = 9').run(me.user.id);
  const before = await crumbs();
  economy.reportRun(me.user.id, MAXED);
  const finished = (db.prepare('SELECT done FROM missions_done WHERE user_id = ?').get(me.user.id) as { done: number }).done;
  assert.ok(finished >= 10, `missions counted (${finished})`);
  const paid = economy.payAchievements(me.user.id);
  assert.deepEqual(paid.map(p => p.id), ['misje-1']);
  assert.ok((await crumbs()) > before);
  assert.deepEqual(economy.payAchievements(me.user.id), [], 'once');

  // Ten items owned pay the shop level
  for (const item of ['zombie', 'lodowy', 'robot', 'lawa', 'metal', 'kosmiczny', 'czapka', 'imprezowa', 'kowbojski']) {
    db.prepare('INSERT INTO owned (user_id, item) VALUES (?, ?)').run(me.user.id, item);
  }
  assert.deepEqual(economy.payAchievements(me.user.id), [], 'nine are not ten');
  db.prepare('INSERT INTO owned (user_id, item) VALUES (?, ?)').run(me.user.id, 'sluchawki');
  assert.deepEqual(economy.payAchievements(me.user.id).map(p => p.id), ['szafa-gra']);
  assert.deepEqual(economy.payAchievements(me.user.id), []);
});

test('missions that need the dash are only handed to a player who has beaten Lodzia (the server\'s checkpoints stat)', async () => {
  const NEEDS_DASH = ['przebicia', 'sciana'];
  const missionsOf = async (cookie: string): Promise<string[]> =>
    ((await (await call(cookie, '/api/me/shop')).json()) as State).missions.map(m => m.id);

  const without: string[] = [];
  const withDash: string[] = [];
  for (let i = 0; i < 40; i++) {
    without.push(...await missionsOf(await harness.signIn(`google-nodash-${i}`, `NoDash${i}`)));
    const cookie = await harness.signIn(`google-dash-${i}`, `Dash${i}`);
    const me = await (await call(cookie, '/api/me')).json() as { user: { id: number } };
    await counted(me.user.id, { checkpoints: 1 });
    withDash.push(...await missionsOf(cookie));
  }
  assert.ok(!without.some(id => NEEDS_DASH.includes(id)), 'nobody without the dash is asked to use it');
  assert.ok(withDash.some(id => NEEDS_DASH.includes(id)), 'with it, the pool is the whole set again');
});

test('the first start counts each account from its saved profile made consistent: a veteran keeps theirs, a forged one gains little', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cockroach-migrate-'));
  const file = path.join(dir, 'scores.db');
  // A database as the release before this one left it (review1 mig.mts): profiles saved by clients and paid from
  const before = new Database(file);
  before.exec(`
    CREATE TABLE scores (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, score INTEGER NOT NULL, death_cause TEXT,
      distance INTEGER, time_survived INTEGER, apples_collected INTEGER, tyskies_collected INTEGER, pills_collected INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, max_level INTEGER, max_combo INTEGER, user_id INTEGER, daily TEXT, board TEXT);
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, google_sub TEXT NOT NULL UNIQUE, name TEXT NOT NULL, created_at DATETIME);
    CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, data TEXT NOT NULL, updated_at DATETIME);
    CREATE TABLE wallets (user_id INTEGER PRIMARY KEY, crumbs INTEGER NOT NULL DEFAULT 0, skin TEXT, head TEXT, back TEXT);
    CREATE TABLE achievements_paid (user_id INTEGER NOT NULL, achievement TEXT NOT NULL, PRIMARY KEY (user_id, achievement));
  `);
  // Like the largest real account then: 31 runs, past every boss's distance on an older course, Lodzia beaten three times
  const veteran = { runs: 31, distance: 13752, apples: 1182, beers: 186, pills: 25, nearMisses: 87, dashThroughs: 118, wallsBroken: 23,
    kills: 7, dailyRuns: 4, matches: 2, matchWins: 2, seconds: 2115, bestScore: 12000, bestDistance: 2700, bestLevel: 11, bestCombo: 65,
    checkpoints: 4, lodziaWins: 3, bigosWins: 3, zlewiatanWins: 2, eksterminatorWins: 1, noHitBossWins: 3, moultSaves: 3, bestKills: 16 };
  const forged = Object.fromEntries([...Object.keys(veteran), 'allBossRuns', 'pacifistRuns', 'missionsDone', 'itemsOwned'].map(k => [k, 999_999_999]));
  const saved = (stats: object) => JSON.stringify({ stats, achievements: {} });
  before.prepare('INSERT INTO profiles (user_id, data) VALUES (1, ?), (2, ?), (3, ?)').run(saved(veteran), saved({ ...forged, checkpoints: 10 }), '{"stats":"x"}');
  // What the old release paid each: the veteran what their profile reached, the forger everything
  const veteranPaid = ['poziom-4', 'poziom-6', 'poziom-8', 'poziom-10', 'piec-tysiecy', 'dziesiec-tysiecy', 'kombo-30', 'kombo-60',
    'boss-lodzia', 'boss-bigos', 'boss-zlewiatan', 'boss-eksterminator', 'skroty', 'nietykalny', 'kanonada', 'jablka-1', 'sadownik',
    'dystans-1', 'maraton', 'piwa-1', 'piwosz', 'pigulki-1', 'pigularz', 'biegi-1', 'wytrwaly', 'styk-1', 'na-styk', 'dash-1',
    'przebijak', 'strzaly-1', 'sciany-1', 'sciana', 'codziennie-1', 'dnia'];
  const pay = before.prepare('INSERT INTO achievements_paid (user_id, achievement) VALUES (?, ?)');
  for (const id of veteranPaid) pay.run(1, id);
  for (const id of ['bog', 'piecdziesiat-tysiecy', 'kombo-100', 'cztery-bossy', 'jablka-4', 'dystans-4', 'bez-konca-3', 'krol-zjazdu', ...veteranPaid]) pay.run(2, id);
  before.prepare('INSERT INTO wallets (user_id, crumbs) VALUES (1, 4000), (2, 11000), (3, 0)').run();
  // Neither has a row on the board: only one account in eight had one, so the seed needs none
  before.close();

  const run = (code: string): string => execFileSync(process.execPath, ['--import', 'tsx', '-e', code], {
    env: { ...process.env, DB_PATH: file }, cwd: path.join(__dirname, '..'), encoding: 'utf8',
  });
  const sync = `const s = require('./server/playerStats'); const e = require('./server/economy');
    const out = {}; for (const id of [1, 2, 3]) { const paid = e.payAchievements(id);
      out[id] = { stats: s.statsOf(id), paid: paid.map(p => p.id).sort(), topUp: paid.reduce((n, p) => n + p.reward, 0), crumbs: e.balanceOf(id) }; }
    console.log(JSON.stringify(out));`;
  const first = JSON.parse(run(sync)) as Record<number, { stats: Record<string, number>; paid: string[]; topUp: number; crumbs: number }>;
  console.log(`seed: veteran +${first[1].topUp} (${first[1].paid.join(' ')}); forged +${first[2].topUp} (${first[2].paid.join(' ')})`);
  // The veteran keeps their progress: every stat as their profile had it, but what nobody past DJ Bigos could have yet
  const vet = first[1];
  for (const key of ['runs', 'distance', 'apples', 'beers', 'pills', 'nearMisses', 'dashThroughs', 'wallsBroken', 'kills', 'seconds',
    'bestScore', 'bestDistance', 'bestLevel', 'bestCombo', 'lodziaWins', 'noHitBossWins', 'matches', 'matchWins', 'dailyRuns']) {
    assert.equal(vet.stats[key], (veteran as Record<string, number>)[key], key);
  }
  // Beyond the seed's ceilings (about twice the largest real account, nobody past Bigos yet): held there
  assert.deepEqual([vet.stats.checkpoints, vet.stats.bigosWins, vet.stats.eksterminatorWins, vet.stats.bestKills], [2, 0, 0, 0]);
  assert.ok(vet.paid.includes('dziesiec-tysiecy') && vet.paid.includes('kombo-60') && vet.paid.includes('poziom-10'), vet.paid.join(' '));
  assert.equal(vet.crumbs, 4000 + vet.topUp);
  // The forged profile: held to the ceilings, so it gets at most what the largest real account could, and no more
  const forgedStats = first[2].stats;
  assert.deepEqual([forgedStats.runs, forgedStats.bestDistance, forgedStats.checkpoints, forgedStats.eksterminatorWins], [62, 3500, 2, 0]);
  assert.ok(first[2].topUp <= 3500, `the forged profile was topped up ${first[2].topUp}`);
  assert.equal(first[2].crumbs, 11000 + first[2].topUp);
  // Junk: nothing
  assert.deepEqual([first[3].topUp, first[3].stats.runs], [0, 0]);
  // Once: a second start and sync pay nothing more and seed nothing again
  const second = JSON.parse(run(sync)) as typeof first;
  assert.deepEqual([second[1].topUp, second[2].topUp, second[3].topUp], [0, 0, 0]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a reward raised since it was paid is topped up by the difference, once; one made harder stays paid', async () => {
  const cookie = await harness.signIn('google-topped', 'Topped');
  const me = await (await call(cookie, '/api/me')).json() as { user: { id: number } };
  const db = (await import('../server/db')).default;
  const economy = await import('../server/economy');
  // Paid before the rebalance: Na Księżycu (level 8) at its old 200, Bez faktury at its old 300 with the stats for it,
  // and Sadownik II (then 3000 apples, now 5000) on 3200 apples
  for (const [id, reward] of [['poziom-8', 200], ['boss-eksterminator', 300], ['sadownik', 150]] as const) {
    db.prepare('INSERT INTO achievements_paid (user_id, achievement, reward) VALUES (?, ?, ?)').run(me.user.id, id, reward);
  }
  const paid = await counted(me.user.id, { bestLevel: 8, eksterminatorWins: 1, apples: 3200, lodziaWins: 1, bigosWins: 1, zlewiatanWins: 1 });
  const by = Object.fromEntries(paid.map(p => [p.id, p.reward]));
  assert.equal(by['poziom-8'], 300 - 200, 'the difference');
  assert.equal(by['boss-eksterminator'], 800 - 300);
  assert.equal(by.sadownik, undefined, 'made harder: kept, nothing more until the stats reach it');
  assert.equal(by['jablka-1'], 60, 'never paid before: in full');
  assert.deepEqual(economy.payAchievements(me.user.id), [], 'once');
  // A sync (the profile's save) is when it happens for someone who just comes back
  db.prepare("UPDATE achievements_paid SET reward = 60 WHERE user_id = ? AND achievement = 'boss-bigos'").run(me.user.id);
  const sync = await fetch(`${harness.url}/api/me/profile`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ stats: {}, achievements: {} }),
  });
  assert.deepEqual(((await sync.json()) as { paid: { id: string; reward: number }[] }).paid, [{ id: 'boss-bigos', name: 'Cisza w remizie', reward: 140 }]);
});

test('the shop\'s prices are public: the same for a guest, no account read, nothing set', async () => {
  const res = await fetch(`${harness.url}/api/shop/prices`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.getSetCookie().length, 0);
  const { SHOP } = await import('../server/economy');
  assert.deepEqual(await res.json(), Object.fromEntries(Object.entries(SHOP).map(([id, item]) => [id, item.price])));
});
