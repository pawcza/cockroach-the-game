import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { cookiesOf, startServer, type Harness } from './support/harness';

let harness: Harness;

before(async () => { harness = await startServer(); });
after(() => harness.stop());

function post(path: string, body: unknown, cookie = ''): Promise<Response> {
  return fetch(`${harness.url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

async function me(cookie: string): Promise<{ user: { id: number; name: string } | null; signInAvailable: boolean }> {
  return (await fetch(`${harness.url}/api/me`, { headers: { cookie } })).json();
}

test('only signed-in players can save a score, under their account name', async () => {
  assert.equal((await post('/api/scores', { score: 10 })).status, 401);

  const cookie = await harness.signIn('google-ola', 'Ola');
  const res = await post('/api/scores', { name: 'Someone Else', score: 10 }, cookie);
  assert.equal(res.status, 201);
  assert.equal((await res.json()).name, 'Ola');
});

test('a session cookie that was tampered with is ignored', async () => {
  const cookie = await harness.signIn('google-tamper', 'Real');
  const [name, value] = cookie.split('=');
  const [body, mac] = value.split('.');
  const otherUser = body.replace(/^\d+/, '1');
  assert.equal((await me(`${name}=${otherUser}.${mac}`)).user, null);
  assert.equal((await me(`${name}=${body}.${mac.slice(1)}x`)).user, null);
  assert.notEqual((await me(cookie)).user, null);
});

test('a callback without the matching state signs nobody in', async () => {
  const start = await fetch(`${harness.url}/api/auth/google`, { redirect: 'manual' });
  const res = await fetch(`${harness.url}/api/auth/google/callback?code=google-evil&state=guessed`, {
    redirect: 'manual',
    headers: { cookie: cookiesOf(start) },
  });
  assert.equal(res.headers.get('location'), '/?signin=failed');
  assert.ok(!cookiesOf(res).includes('kc_session='));
});

test('signing in again finds the same player, and a rename follows their scores onto the board', async () => {
  const cookie = await harness.signIn('google-kornel', 'Kornel');
  const first = (await me(cookie)).user!;
  assert.equal((await post('/api/scores', { score: 77 }, cookie)).status, 201);

  const again = await harness.signIn('google-kornel', 'Different Google Name');
  assert.deepEqual((await me(again)).user, first);

  assert.equal((await post('/api/me', { name: 'x'.repeat(21) }, again)).status, 400);
  assert.equal((await post('/api/me', { name: '  Kornel II ' }, again)).status, 200);
  const board = await (await fetch(`${harness.url}/api/scores`)).json() as { name: string; score: number }[];
  assert.ok(board.some(entry => entry.name === 'Kornel II' && entry.score === 77));
  assert.ok(!board.some(entry => entry.name === 'Kornel'));
});

test('deleting an account takes it and its scores away for good', async () => {
  const cookie = await harness.signIn('google-leaver', 'Leaver');
  assert.equal((await post('/api/scores', { score: 55 }, cookie)).status, 201);
  const res = await fetch(`${harness.url}/api/me`, { method: 'DELETE', headers: { cookie } });
  assert.equal(res.status, 200);
  assert.equal((await me(cookie)).user, null);
  const board = await (await fetch(`${harness.url}/api/scores`)).json() as { name: string }[];
  assert.ok(!board.some(entry => entry.name === 'Leaver'));
  assert.equal((await fetch(`${harness.url}/api/me`, { method: 'DELETE' })).status, 401);
});

test('signing out drops the session cookie', async () => {
  const res = await post('/api/auth/logout', {});
  assert.ok(res.headers.getSetCookie().some(c => c.startsWith('kc_session=;')));
});

test('without Google configured, sign-in says so and nothing can be saved', async () => {
  const bare = await startServer({ auth: null });
  try {
    assert.equal((await fetch(`${bare.url}/api/auth/google`, { redirect: 'manual' })).status, 503);
    const status = await (await fetch(`${bare.url}/api/me`)).json();
    assert.deepEqual(status, { user: null, signInAvailable: false });
  } finally {
    await bare.stop();
  }
});
