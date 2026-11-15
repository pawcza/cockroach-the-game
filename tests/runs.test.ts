/**
 * Runs through the real server: a ticket when a run starts, its report checked against it when it ends, what it pays
 * (server/runs.ts), the board it may go on, a guest's run claimed after the sign-in, and a match's.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { COURSE_VERSION } from '../server/daily';
import { ack, cookiesOf, next, startServer, type Harness } from './support/harness';

let harness: Harness;
let visitor = 0;
before(async () => { harness = await startServer(); });
after(async () => { await harness.stop(); });

interface Receipt {
  paid: boolean;
  score: number;
  crumbs: number;
  missions: { text: string; reward: number }[];
  achievements: { id: string; name: string; reward: number }[];
  total: number;
  balance: number | null;
  board: string | null;
  counted: boolean;
}

const call = (path: string, body: unknown, cookie = '', ip = `203.0.113.${++visitor % 250}`) => fetch(`${harness.url}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-Forwarded-For': ip },
  body: JSON.stringify(body),
});

async function ticketFor(cookie: string, start = 0, daily: string | null = null): Promise<string> {
  const res = await call('/api/run/start', { start, daily, course: COURSE_VERSION }, cookie);
  assert.equal(res.status, 200, await res.clone().text());
  return (await res.json() as { ticket: string }).ticket;
}

/** 300 m in a minute of play, Pani Lodzia beaten on the way: an ordinary first run. */
const HONEST = {
  score: 1234, distance: 300, level: 3, combo: 14, apples: 22, beers: 3, pills: 0, nearMisses: 2, dashThroughs: 1,
  wallsBroken: 0, kills: 0, seconds: 60, bosses: ['lodzia'], noHitWins: 0, allBosses: false, moultSaves: 0, pacifist: false,
  deathCause: 'onion',
};

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const finish = (cookie: string, ticket: string, claim: object = HONEST) =>
  call('/api/run/finish', { ...claim, ticket, course: COURSE_VERSION }, cookie);

test('an honest run pays its score / 100 and the achievements its own numbers reach, once', async () => {
  const cookie = await harness.signIn('google-runner', 'Runner');
  const ticket = await ticketFor(cookie);
  harness.advance(90_000);
  const res = await finish(cookie, ticket);
  assert.equal(res.status, 200);
  const { receipt, state } = await res.json() as { receipt: Receipt; state: { crumbs: number } };
  assert.equal(receipt.paid, true);
  assert.equal(receipt.score, 1234);
  assert.equal(receipt.crumbs, 12);
  // Beating Pani Lodzia in a checked run is what pays her achievement, and Las Grochodrzew is not reached at 300 m
  assert.deepEqual(receipt.achievements.map(a => [a.id, a.name, a.reward]), [['boss-lodzia', 'Wypraszam sobie', 60]]);
  assert.equal(receipt.total, 12 + receipt.missions.reduce((s, m) => s + m.reward, 0) + 60);
  assert.equal(receipt.balance, receipt.total);
  assert.equal(state.crumbs, receipt.balance);
  assert.equal(receipt.board, 'main');

  // The same ticket again, in any form: refused
  harness.advance(10_000);
  await pause(1100);
  assert.equal((await finish(cookie, ticket)).status, 409);
  assert.equal((await finish(cookie, ticket, { ...HONEST, score: 5 })).status, 409);

  // A profile claiming everything pays nothing any more: the server pays on its own count
  const put = await fetch(`${harness.url}/api/me/profile`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ stats: { apples: 99_999, bestLevel: 30, eksterminatorWins: 9, checkpoints: 4 }, achievements: {} }),
  });
  assert.equal(put.status, 200);
  const shop = await (await fetch(`${harness.url}/api/me/shop`, { headers: { Cookie: cookie } })).json() as { crumbs: number };
  assert.equal(shop.crumbs, receipt.balance);
});

test('every run pays at least one okruszek', async () => {
  const cookie = await harness.signIn('google-short', 'Short');
  const ticket = await ticketFor(cookie);
  harness.advance(12_000);
  // A roach left alone: dead at the first obstacle, 9 s and 10 m in
  const short = { ...HONEST, score: 9, distance: 10, level: 1, combo: 0, apples: 0, beers: 0, nearMisses: 0, dashThroughs: 0, seconds: 9, bosses: [] };
  const { receipt } = await (await finish(cookie, ticket, short)).json() as { receipt: Receipt };
  assert.deepEqual([receipt.score, receipt.crumbs, receipt.counted], [9, 1, true]);
});

test('an invented run is held to what the course allows; one too fast for its distance is refused', async () => {
  const cookie = await harness.signIn('google-cheat', 'Cheat');
  let ticket = await ticketFor(cookie);
  harness.advance(90_000);
  const inflated = { ...HONEST, score: 900_000, apples: 5000, pills: 300, nearMisses: 900, combo: 9000, kills: 400, bosses: ['lodzia', 'bigos', 'eksterminator'] };
  const { receipt } = await (await finish(cookie, ticket, inflated)).json() as { receipt: Receipt };
  assert.ok(receipt.score < 20_000, `held to ${receipt.score}`);
  assert.equal(receipt.crumbs, Math.max(1, Math.round(receipt.score / 100)));
  assert.ok(!receipt.achievements.some(a => a.id === 'boss-bigos' || a.id === 'boss-eksterminator'), 'no boss it never reached');

  // 1 150 m in 40 s: no roach runs that fast
  ticket = await ticketFor(cookie);
  harness.advance(60_000);
  const fast = await finish(cookie, ticket, { ...HONEST, distance: 1150, seconds: 40, bosses: [] });
  assert.equal(fast.status, 422);
  assert.match((await fast.json() as { error: string }).error, /too fast/);
  // And the ticket is spent: no second try with smaller numbers
  await pause(1100);
  assert.equal((await finish(cookie, ticket)).status, 409);

  // More play than the wall clock had since the ticket
  ticket = await ticketFor(cookie);
  harness.advance(20_000);
  await pause(1100);
  assert.equal((await finish(cookie, ticket)).status, 422);
});

test('a newer run closes the older one, and nobody reports another player\'s run', async () => {
  const cookie = await harness.signIn('google-two-tabs', 'Tabs');
  const other = await harness.signIn('google-thief', 'Thief');
  const first = await ticketFor(cookie);
  const second = await ticketFor(cookie);
  harness.advance(90_000);
  assert.equal((await finish(other, second)).status, 404, 'not the thief\'s');
  assert.equal((await finish(cookie, first)).status, 409, 'superseded');
  await pause(1100);
  assert.equal((await finish(cookie, second)).status, 200);
});

test('an old client is told to reload: no ticket, no pay, no board without one', async () => {
  const cookie = await harness.signIn('google-old', 'Old');
  for (const body of [{ start: 0 }, { start: 0, course: COURSE_VERSION - 1 }]) {
    const res = await call('/api/run/start', body, cookie);
    assert.equal(res.status, 409);
    assert.equal((await res.json() as { reload: boolean }).reload, true);
  }
  const oldReport = await call('/api/me/run', { score: 99_999, distance: 99_999, level: 10, combo: 99, apples: 999, beers: 99, pills: 9, nearMisses: 99, dashThroughs: 99, wallsBroken: 9 }, cookie);
  assert.equal(oldReport.status, 409);
  const oldScore = await call('/api/scores', { score: 5000, distance: 300, course: 2 }, cookie);
  assert.equal(oldScore.status, 409);
  assert.equal((await oldScore.json() as { reload: boolean }).reload, true);
  const board = await (await fetch(`${harness.url}/api/scores`)).json() as { score: number }[];
  assert.ok(!board.some(e => e.score === 5000));
});

test('the board takes a checked run once, under the account\'s name; a practice run goes on none', async () => {
  const cookie = await harness.signIn('google-ranked', 'Ranked');
  const ticket = await ticketFor(cookie);
  harness.advance(90_000);
  await finish(cookie, ticket, { ...HONEST, score: 1222 });
  const saved = await call('/api/scores', { ticket, course: COURSE_VERSION, score: 999_999 }, cookie);
  assert.equal(saved.status, 201);
  const entry = await saved.json() as { name: string; score: number; distance: number };
  assert.deepEqual([entry.name, entry.score, entry.distance], ['Ranked', 1222, 300]);
  await new Promise((resolve) => setTimeout(resolve, 5100));
  assert.equal((await call('/api/scores', { ticket, course: COURSE_VERSION }, cookie)).status, 409, 'once');

  // From a practice checkpoint: no ticket before the account has it unlocked, as the server counts it
  assert.equal((await call('/api/run/start', { start: 1200, course: COURSE_VERSION }, cookie)).status, 403);
  const me = (await (await fetch(`${harness.url}/api/me`, { headers: { Cookie: cookie } })).json() as { user: { id: number } }).user.id;
  const playerStats = await import('../server/playerStats');
  playerStats.saveStats(me, { ...playerStats.statsOf(me), checkpoints: 2 });
  // Then: paid, never ranked
  const practice = await ticketFor(cookie, 1200);
  harness.advance(90_000);
  const run = await (await finish(cookie, practice, { ...HONEST, distance: 1300, level: 7, bosses: [] })).json() as { receipt: Receipt };
  assert.equal(run.receipt.board, null);
  assert.ok(run.receipt.crumbs >= 1);
  await new Promise((resolve) => setTimeout(resolve, 5100));
  assert.equal((await call('/api/scores', { ticket: practice, course: COURSE_VERSION }, cookie)).status, 400);

  // Bez końca's start once all four are unlocked: on its board
  playerStats.saveStats(me, { ...playerStats.statsOf(me), checkpoints: 4 });
  const endless = await ticketFor(cookie, 2600);
  harness.advance(90_000);
  await finish(cookie, endless, { ...HONEST, distance: 2700, level: 11, bosses: [] });
  await new Promise((resolve) => setTimeout(resolve, 5100));
  assert.equal((await call('/api/scores', { ticket: endless, course: COURSE_VERSION }, cookie)).status, 201);
  // Bez końca's own records, counted by the server from that run
  const stats = playerStats.statsOf(me);
  assert.deepEqual([stats.endlessRuns, stats.endlessBestLevel, stats.endlessBestDistance, stats.runs], [1, 11, 2700, 3]);
});

test('a guest\'s run is checked and shown, then claimed once by the account that signs in from that browser', async () => {
  // A guest gets their id with the first ticket
  const started = await call('/api/run/start', { start: 0, course: COURSE_VERSION });
  const guest = cookiesOf(started);
  assert.match(guest, /kc_guest=/);
  const { ticket } = await started.json() as { ticket: string };
  harness.advance(90_000);
  const { receipt } = await (await finish(guest, ticket)).json() as { receipt: Receipt };
  assert.deepEqual([receipt.paid, receipt.crumbs, receipt.balance], [false, 12, null]);

  // Another browser that signs in cannot take it
  const stranger = await harness.signIn('google-stranger', 'Stranger');
  assert.equal((await call('/api/run/claim', { ticket, course: COURSE_VERSION }, stranger)).status, 404);
  // Unsigned, it cannot be claimed at all
  assert.equal((await call('/api/run/claim', { ticket, course: COURSE_VERSION }, guest)).status, 401);

  // Signed in from the guest's browser: paid once, on the board if asked
  const session = await harness.signIn('google-was-guest', 'WasGuest');
  const both = `${guest}; ${session}`;
  const claimed = await call('/api/run/claim', { ticket, course: COURSE_VERSION, board: true }, both);
  assert.equal(claimed.status, 200);
  const body = await claimed.json() as { receipt: Receipt; saved: boolean; name: string };
  assert.deepEqual([body.receipt.paid, body.receipt.crumbs, body.saved, body.name], [true, 12, true, 'WasGuest']);
  assert.equal(body.receipt.balance, body.receipt.total);
  const board = await (await fetch(`${harness.url}/api/scores`)).json() as { name: string; score: number }[];
  assert.ok(board.some(e => e.name === 'WasGuest' && e.score === 1234));
  await new Promise((resolve) => setTimeout(resolve, 1100));
  assert.equal((await call('/api/run/claim', { ticket, course: COURSE_VERSION }, both)).status, 409, 'exactly once');

  // A guest run left too long before the sign-in has expired
  const late = await call('/api/run/start', { start: 0, course: COURSE_VERSION }, guest);
  const lateTicket = (await late.json() as { ticket: string }).ticket;
  harness.advance(90_000);
  await finish(guest, lateTicket);
  harness.advance(2 * 3_600_000);
  assert.equal((await call('/api/run/claim', { ticket: lateTicket, course: COURSE_VERSION }, both)).status, 410);
});

test('Karaluch Dnia is ticketed for today only', async () => {
  const cookie = await harness.signIn('google-daily-runner', 'Daily');
  const { date } = await (await fetch(`${harness.url}/api/daily`)).json() as { date: string };
  // The test clock has moved on hours by now: today is the server clock's day
  const res = await call('/api/run/start', { start: 0, daily: '2001-01-01', course: COURSE_VERSION }, cookie);
  assert.equal(res.status, 400);
  assert.equal((await call('/api/run/start', { start: 2600, daily: date, course: COURSE_VERSION }, cookie)).status, 400);
});

test('a match pays from what the server saw: its start, each death\'s score, and who won', async () => {
  const sessions = [await harness.signIn('google-match-a', 'MatchA'), await harness.signIn('google-match-b', 'MatchB')];
  const a = await harness.connect({ cookie: sessions[0], 'x-forwarded-for': '198.51.100.201' });
  const b = await harness.connect({ cookie: sessions[1], 'x-forwarded-for': '198.51.100.202' });
  a.emit('set-name', 'A');
  b.emit('set-name', 'B');
  const { lobby } = await ack<{ lobby: { id: string } }>(a, 'lobby:create');
  await ack(b, 'lobby:join', lobby.id);
  await ack(b, 'lobby:ready', true);
  const started = next<{ ticket: string | null }>(b, 'game:start');
  const host = await ack<{ ticket: string | null }>(a, 'lobby:start');
  const joined = await started;
  assert.ok(host.ticket && joined.ticket && host.ticket !== joined.ticket, 'each player their own ticket');

  harness.advance(90_000);
  b.emit('game:death', { score: 600, stats: {} });
  const over = next(a, 'game:over');
  a.emit('game:death', { score: 640, stats: {} });
  await over;
  // B claims more than the server saw at B's death: held to it
  const paidB = await (await finish(sessions[1], joined.ticket!, { ...HONEST, score: 650, bosses: [] })).json() as { receipt: Receipt };
  assert.deepEqual([paidB.receipt.score, paidB.receipt.crumbs, paidB.receipt.board], [600, 6, 'main']);
  const paidA = await (await finish(sessions[0], host.ticket!, { ...HONEST, score: 640, bosses: ['lodzia'] })).json() as { receipt: Receipt };
  assert.equal(paidA.receipt.crumbs, 6);
  assert.ok(!paidA.receipt.achievements.some(x => x.id === 'boss-lodzia'), 'a match beats no boss of the solo ladder');

  const stats = await import('../server/playerStats');
  const me = async (cookie: string) => (await (await fetch(`${harness.url}/api/me`, { headers: { Cookie: cookie } })).json() as { user: { id: number } }).user.id;
  const sa = stats.statsOf(await me(sessions[0]));
  const sb = stats.statsOf(await me(sessions[1]));
  assert.deepEqual([sa.matches, sa.matchWins, sb.matches, sb.matchWins], [1, 1, 1, 0]);
  a.disconnect();
  b.disconnect();
});

// ── What the review of the first version found (scratchpad review1: farm, farm2, zero, idle, ckpt) ──────────

const JUNK = {
  score: 1e6, distance: 0, level: 99, combo: 1e6, apples: 1e6, beers: 1e6, pills: 1e6, nearMisses: 1e6, dashThroughs: 1e6,
  wallsBroken: 1e6, kills: 1e6, seconds: 0, bosses: [], noHitWins: 0, allBosses: false, moultSaves: 1e6, pacifist: false, deathCause: null,
};

test('a start the server has not seen the account unlock takes no ticket; a guest\'s, only from 0 m', async () => {
  const fresh = await harness.signIn('google-fresh-farmer', 'Fresh');
  for (const start of [250, 1200, 1800, 2600]) {
    const res = await call('/api/run/start', { start, course: COURSE_VERSION }, fresh);
    assert.equal(res.status, 403, `start ${start}`);
    assert.equal((await res.json() as { locked: boolean }).locked, true);
  }
  // A guest's unlocks are its own browser's word: from a checkpoint it plays, but takes no ticket and is paid nothing
  const guest = await call('/api/run/start', { start: 0, course: COURSE_VERSION });
  const cookie = cookiesOf(guest);
  assert.equal((await call('/api/run/start', { start: 2600, course: COURSE_VERSION }, cookie)).status, 403);
  // The account that has beaten Pani Lodzia in a checked run has her start, and only hers
  const runner = await harness.signIn('google-lodzia-beaten', 'Beaten');
  const ticket = await ticketFor(runner);
  harness.advance(90_000);
  await finish(runner, ticket);
  assert.equal((await call('/api/run/start', { start: 250, course: COURSE_VERSION }, runner)).status, 200);
  assert.equal((await call('/api/run/start', { start: 1200, course: COURSE_VERSION }, runner)).status, 403);
});

test('a report of nothing pays nothing: no pickup, wall, moult, combo, run, mission or okruszek out of thin air', async () => {
  const cookie = await harness.signIn('google-junk-farmer', 'Junk');
  const me = (await (await fetch(`${harness.url}/api/me`, { headers: { Cookie: cookie } })).json() as { user: { id: number } }).user.id;
  const before = (await import('../server/playerStats')).statsOf(me);
  for (let i = 0; i < 3; i++) {
    const ticket = await ticketFor(cookie);
    harness.advance(1100);
    const res = await finish(cookie, ticket, JUNK);
    assert.equal(res.status, 200);
    const { receipt } = await res.json() as { receipt: Receipt };
    assert.deepEqual([receipt.crumbs, receipt.total, receipt.counted, receipt.board, receipt.missions, receipt.achievements], [0, 0, false, null, [], []]);
    assert.ok(receipt.score <= 2, `scored ${receipt.score}`);
    await pause(1100);
  }
  const after = (await import('../server/playerStats')).statsOf(me);
  assert.deepEqual(after, before, 'nothing counted');
  const shop = await (await fetch(`${harness.url}/api/me/shop`, { headers: { Cookie: cookie } })).json() as { crumbs: number };
  assert.equal(shop.crumbs, 0);
});

test('Karaluch Dnia: yesterday\'s run still takes a ticket in the first minutes of today, never later', async () => {
  const cookie = await harness.signIn('google-midnight', 'Midnight');
  const { dailyDate } = await import('../server/daily');
  // To ten past midnight, Warsaw time, of the server clock's next day
  let t = harness.now();
  const today = dailyDate(t);
  while (dailyDate(t) === today) t += 60_000;
  harness.advance(t - harness.now() + 10 * 60_000);
  const yesterday = today;
  assert.equal((await call('/api/run/start', { start: 0, daily: yesterday, course: COURSE_VERSION }, cookie)).status, 200);
  harness.advance(30 * 60_000);
  assert.equal((await call('/api/run/start', { start: 0, daily: yesterday, course: COURSE_VERSION }, cookie)).status, 400);
});

test('a match\'s report waits for the server to see the death, and is held to that score', async () => {
  const sessions = [await harness.signIn('google-race-a', 'RaceA'), await harness.signIn('google-race-b', 'RaceB')];
  const a = await harness.connect({ cookie: sessions[0], 'x-forwarded-for': '198.51.100.211' });
  const b = await harness.connect({ cookie: sessions[1], 'x-forwarded-for': '198.51.100.212' });
  a.emit('set-name', 'A');
  b.emit('set-name', 'B');
  const { lobby } = await ack<{ lobby: { id: string } }>(a, 'lobby:create');
  await ack(b, 'lobby:join', lobby.id);
  await ack(b, 'lobby:ready', true);
  const started = next<{ ticket: string | null }>(b, 'game:start');
  const host = await ack<{ ticket: string | null }>(a, 'lobby:start');
  const joined = await started;
  harness.advance(90_000);
  // B's report arrives before its socket's death: it waits for it, and gets that score
  const report = finish(sessions[1], joined.ticket!, { ...HONEST, score: 1200, bosses: [] });
  await pause(300);
  b.emit('game:death', { score: 500, stats: {} });
  const paid = await (await report).json() as { receipt: Receipt };
  assert.equal(paid.receipt.score, 500);
  // A report with no death the server saw is refused
  await pause(1100);
  assert.equal((await finish(sessions[0], host.ticket!, { ...HONEST, score: 700, bosses: [] })).status, 409);
  a.disconnect();
  b.disconnect();
});

test('one account in one match on two tabs plays one match', async () => {
  const session = await harness.signIn('google-two-tab-match', 'TwoTabs');
  const a = await harness.connect({ cookie: session, 'x-forwarded-for': '198.51.100.221' });
  const b = await harness.connect({ cookie: session, 'x-forwarded-for': '198.51.100.222' });
  a.emit('set-name', 'A');
  b.emit('set-name', 'B');
  const { lobby } = await ack<{ lobby: { id: string } }>(a, 'lobby:create');
  await ack(b, 'lobby:join', lobby.id);
  await ack(b, 'lobby:ready', true);
  await ack(a, 'lobby:start');
  const over = next(a, 'game:over');
  a.emit('game:death', { score: 10, stats: {} });
  b.emit('game:death', { score: 20, stats: {} });
  await over;
  const me = (await (await fetch(`${harness.url}/api/me`, { headers: { Cookie: session } })).json() as { user: { id: number } }).user.id;
  const stats = (await import('../server/playerStats')).statsOf(me);
  assert.deepEqual([stats.matches, stats.matchWins], [1, 1]);
  a.disconnect();
  b.disconnect();
});
