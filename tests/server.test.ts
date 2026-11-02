import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { Socket } from 'socket.io-client';
import { ack, flush, inGame, inLobby, next, startServer, type Harness } from './support/harness';

let harness: Harness;
let visitor = 0;

before(async () => { harness = await startServer(); });
after(() => harness.stop());

function post(body: string, ip = `203.0.113.${++visitor}`): Promise<Response> {
  return fetch(`${harness.url}/api/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body,
  });
}

async function collect(socket: Socket, event: string): Promise<unknown[]> {
  const seen: unknown[] = [];
  socket.on(event, (data: unknown) => seen.push(data));
  return seen;
}

test('malformed packets cannot take the server down', async () => {
  const socket = await harness.connect();
  socket.emit('set-name', 123);
  socket.emit('set-name');
  socket.emit('lobby:create');
  socket.emit('set-name', 'Evil');
  socket.emit('lobby:join');
  socket.emit('lobby:join', { a: 1 });
  socket.emit('lobby:create');
  socket.emit('lobby:color');
  socket.emit('lobby:color', 'red');
  socket.emit('lobby:ready', 'yes');
  socket.emit('lobby:start');
  socket.emit('lobby:restart');
  for (const event of ['swap', 'dash-start', 'position', 'pickup', 'boss-start', 'boss-projectile', 'death']) {
    socket.emit(`game:${event}`);
    socket.emit(`game:${event}`, 'junk');
    socket.emit(`game:${event}`, null);
  }
  await flush(socket);
  assert.equal((await fetch(`${harness.url}/api/scores`)).status, 200);
});

test('a socket holds one lobby, so create spam leaves none behind', async () => {
  const [socket] = await inLobby(harness, 1);
  assert.deepEqual(await ack(socket, 'lobby:create'), { error: 'Cannot create lobby' });
  const list = next<Array<{ id: string }>>(socket, 'lobbies:updated');
  socket.emit('lobby:browse');
  const before = (await list).length;
  await ack(socket, 'lobby:color', 1);
  socket.disconnect();

  const watcher = await harness.connect();
  const after = next<Array<{ id: string }>>(watcher, 'lobbies:updated');
  watcher.emit('lobby:browse');
  assert.equal((await after).length, before - 1);
});

test('a socket from another site is refused', async () => {
  await assert.rejects(harness.connect({ origin: 'https://evil.example' }));
});

test('one address is limited to 20 connections', async () => {
  const headers = { 'x-forwarded-for': '192.0.2.77' };
  const sockets = await Promise.all(Array.from({ length: 20 }, () => harness.connect(headers)));
  await assert.rejects(harness.connect(headers), /Too many connections/);
  sockets[0].disconnect();
  await new Promise((resolve) => setTimeout(resolve, 50));
  await harness.connect(headers);
  for (const socket of sockets) socket.disconnect();
});

test('a flood of game events is dropped, not relayed', async () => {
  const [a, b] = await inGame(harness, 2);
  const seen = await collect(b, 'game:swap');
  for (let i = 0; i < 500; i++) a.emit('game:swap', { lane: 'top', x: i });
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.ok(seen.length > 0 && seen.length < 200, `relayed ${seen.length}`);
});

test('relayed events carry only known fields', async () => {
  const [a, b] = await inGame(harness, 2);
  const swap = next(b, 'game:swap');
  a.emit('game:swap', { lane: 'top', x: 12, evil: 'x' });
  assert.deepEqual(await swap, { id: a.id, lane: 'top', x: 12 });

  const seen = await collect(b, 'game:position');
  a.emit('game:position', { x: 'NaN', lane: 'top' });
  a.emit('game:position', { x: 1, lane: 'sideways' });
  a.emit('game:position', { x: 5, lane: 'bottom', t: 10 });
  await next(b, 'game:position').catch(() => {});
  assert.deepEqual(seen, [{ id: a.id, x: 5, lane: 'bottom', t: 10 }]);
});

test('events from outside a game are ignored', async () => {
  const [a, b] = await inLobby(harness, 2);
  const seen = await collect(b, 'game:boss-start');
  a.emit('game:boss-start', { triggerX: 1, hp: 1 });
  a.emit('game:swap', { lane: 'top' });
  await flush(a);
  await flush(b);
  assert.deepEqual(seen, []);
});

test('the game ends when everyone is dead, with cleaned stats', async () => {
  const [a, b] = await inGame(harness, 2);
  const death = next(b, 'game:death');
  a.emit('game:death', { score: 50, stats: { distance: 10, evil: 'x' } });
  assert.deepEqual(await death, { id: a.id, score: 50, stats: { distance: 10 } });

  const over = next<{ rankings: Array<{ id: string; score: number }> }>(a, 'game:over');
  b.emit('game:death', { score: 70, stats: {} });
  assert.deepEqual((await over).rankings.map((r) => [r.id, r.score]), [[b.id, 70], [a.id, 50]]);
  assert.deepEqual(await ack(a, 'lobby:restart'), { ok: true });
});

test('a second death from the same player changes nothing', async () => {
  const [a, b] = await inGame(harness, 2);
  a.emit('game:death', { score: 50, stats: {} });
  a.emit('game:death', { score: 99999, stats: {} });
  const over = next<{ rankings: Array<{ id: string; score: number }> }>(a, 'game:over');
  b.emit('game:death', { score: 1, stats: {} });
  assert.equal((await over).rankings.find((r) => r.id === a.id)?.score, 50);
});

for (const [how, exit] of [
  ['leaving', (socket: Socket) => socket.emit('lobby:leave')],
  ['disconnecting', (socket: Socket) => socket.disconnect()],
] as const) {
  test(`the last living player ${how} ends the game for the rest`, async () => {
    const [a, b, c] = await inGame(harness, 3);
    a.emit('game:death', { score: 5, stats: {} });
    b.emit('game:death', { score: 6, stats: {} });
    await flush(b);
    const left = next(a, 'game:player-left');
    const over = next<{ rankings: Array<{ id: string }> }>(a, 'game:over');
    const leaverId = c.id;
    exit(c);
    assert.deepEqual(await left, { id: leaverId });
    assert.equal((await over).rankings.length, 2);
  });
}

test('starting twice does not reseed a running game', async () => {
  const sockets = await inLobby(harness, 2);
  assert.equal((await ack(sockets[0], 'lobby:start')).ok, true);
  assert.deepEqual(await ack(sockets[0], 'lobby:start'), { error: 'Cannot start game' });
  assert.deepEqual(await ack(sockets[0], 'lobby:restart'), { error: 'Cannot restart lobby' });
});

test('the server sets boss health, whatever a client claims', async () => {
  const [a, b] = await inGame(harness, 2);
  const start = next<{ hp: number; hostId: string }>(b, 'game:boss-start');
  a.emit('game:boss-start', { triggerX: 100, hp: NaN });
  assert.deepEqual(await start, { triggerX: 100, hp: 100, hostId: a.id });
});

test('boss hits are limited per player', async () => {
  const [a, b] = await inGame(harness, 2);
  const start = next(b, 'game:boss-start');
  a.emit('game:boss-start', { triggerX: 100 });
  await start;
  const hits = await collect(b, 'game:boss-hit');
  for (let i = 0; i < 500; i++) a.emit('game:boss-hit');
  await flush(a);
  assert.ok(hits.length <= 9, `${hits.length} hits landed`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(hits.length <= 9, `${hits.length} hits landed`);
});

test('the dead cannot hit the boss, and hosting passes to someone alive', async () => {
  const [a, b, c] = await inGame(harness, 3);
  const start = next(b, 'game:boss-start');
  a.emit('game:boss-start', { triggerX: 100 });
  await start;

  const transfer = next(b, 'game:boss-host-transfer');
  a.emit('game:death', { score: 1, stats: {} });
  assert.deepEqual(await transfer, { newHostId: b.id });

  const hits = await collect(c, 'game:boss-hit');
  a.emit('game:boss-hit');
  await flush(a);
  await flush(c);
  assert.deepEqual(hits, []);
});

test('only the boss host can send projectiles', async () => {
  const [a, b] = await inGame(harness, 2);
  const start = next(b, 'game:boss-start');
  a.emit('game:boss-start', { triggerX: 100 });
  await start;
  const seen = await collect(a, 'game:boss-projectile');
  b.emit('game:boss-projectile', { lane: 'top', speed: 1, faceIdx: 0, indestructible: false, volley: false });
  await flush(b);
  await flush(a);
  assert.deepEqual(seen, []);
});

test('scores are validated before they are stored', async () => {
  assert.equal((await post(JSON.stringify({ name: 'x', score: 1e308 }))).status, 400);

  const res = await post(JSON.stringify({ name: 'Real', score: 42, deathCause: { evil: true }, distance: 'far' }));
  assert.equal(res.status, 201);
  const entry = await res.json();
  assert.deepEqual([entry.name, entry.score, entry.death_cause, entry.distance], ['Real', 42, null, null]);
});

test('bad requests get a short JSON error, no stack trace', async () => {
  const broken = await post('{not json');
  assert.equal(broken.status, 400);
  assert.deepEqual(await broken.json(), { error: 'Bad request' });
  assert.equal((await post(JSON.stringify({ name: 'x', score: 1, pad: 'x'.repeat(5000) }))).status, 413);
  assert.equal((await fetch(`${harness.url}/api/nope`)).status, 404);
});

test('the score limit applies per visitor', async () => {
  const body = JSON.stringify({ name: 'Rate', score: 1 });
  assert.equal((await post(body, '203.0.113.200')).status, 201);
  assert.equal((await post(body, '203.0.113.200')).status, 429);
  assert.equal((await post(body, '203.0.113.201')).status, 201);
});
