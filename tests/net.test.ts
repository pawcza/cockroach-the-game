import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clientIp, originAllowed, TokenBucket } from '../server/net';

const NPM = '::ffff:172.18.0.5';
const CLOUDFLARE_EDGE = '162.158.1.1';

test('behind Cloudflare and our proxy the visitor is CF-Connecting-IP', () => {
  const headers = { 'x-forwarded-for': `203.0.113.7, ${CLOUDFLARE_EDGE}`, 'cf-connecting-ip': '203.0.113.7' };
  assert.equal(clientIp(NPM, headers), '203.0.113.7');
});

test('a forged forwarded chain through Cloudflare changes nothing', () => {
  const headers = { 'x-forwarded-for': `1.2.3.4, 203.0.113.7, ${CLOUDFLARE_EDGE}`, 'cf-connecting-ip': '203.0.113.7' };
  assert.equal(clientIp(NPM, headers), '203.0.113.7');
});

test('skipping Cloudflare, the headers a client sends are ignored', () => {
  const headers = { 'x-forwarded-for': '1.2.3.4, 198.51.100.9', 'cf-connecting-ip': '1.2.3.4' };
  assert.equal(clientIp(NPM, headers), '198.51.100.9');
});

test('a client reaching the container directly is its own address, whatever it claims', () => {
  const headers = { 'x-forwarded-for': CLOUDFLARE_EDGE, 'cf-connecting-ip': '1.2.3.4' };
  assert.equal(clientIp('198.51.100.9', headers), '198.51.100.9');
});

test('garbage headers fall back to the peer', () => {
  assert.equal(clientIp('127.0.0.1', { 'x-forwarded-for': 'not-an-ip' }), '127.0.0.1');
  assert.equal(clientIp('127.0.0.1', {}), '127.0.0.1');
});

test('only the same host may open a socket from a browser', () => {
  assert.equal(originAllowed('https://cockroach.wszystko.app', 'cockroach.wszystko.app'), true);
  assert.equal(originAllowed('https://evil.example', 'cockroach.wszystko.app'), false);
  assert.equal(originAllowed('not a url', 'cockroach.wszystko.app'), false);
  assert.equal(originAllowed(undefined, 'cockroach.wszystko.app'), true);
});

test('a token bucket allows a burst, then refills over time', () => {
  let now = 0;
  const bucket = new TokenBucket(2, 3, () => now);
  assert.deepEqual([bucket.take(), bucket.take(), bucket.take(), bucket.take()], [true, true, true, false]);
  now = 500;
  assert.deepEqual([bucket.take(), bucket.take()], [true, false]);
});
