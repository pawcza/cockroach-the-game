import assert from 'node:assert/strict';
import { COURSE_VERSION } from '../../server/daily';
import type { Harness } from './harness';

let visitor = 0;

export interface RunShape { start?: number; distance?: number; level?: number; daily?: string }

/** Opens the checkpoints up to this many on the account, as checked runs beating the bosses would (playerStats.ts). */
export async function unlock(harness: Harness, cookie: string, checkpoints: number): Promise<void> {
  const me = (await (await fetch(`${harness.url}/api/me`, { headers: { cookie } })).json() as { user: { id: number } }).user.id;
  const { saveStats, statsOf } = await import('../../server/playerStats');
  saveStats(me, { ...statsOf(me), checkpoints });
}

/**
 * A run of 300 m in a minute (or what `run` says), reported and checked by the server (server/runs.ts): its ticket, or
 * the refusal of the ticket (a start the account hasn't unlocked).
 */
export async function ticketed(harness: Harness, cookie: string, score: number, run: RunShape = {}): Promise<string> {
  const result = await tryTicketed(harness, cookie, score, run);
  if (typeof result !== 'string') throw new Error(`no ticket: ${result.status}`);
  return result;
}

async function tryTicketed(harness: Harness, cookie: string, score: number, run: RunShape): Promise<string | Response> {
  const ip = `198.18.0.${++visitor % 250}`;
  const call = (path: string, body: unknown) => fetch(`${harness.url}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip, cookie }, body: JSON.stringify(body),
  });
  const started = await call('/api/run/start', { start: run.start ?? 0, daily: run.daily ?? null, course: COURSE_VERSION });
  if (!started.ok) return started;
  const { ticket } = await started.json() as { ticket: string };
  harness.advance(90_000);
  const finished = await call('/api/run/finish', {
    ticket, course: COURSE_VERSION, score, distance: run.distance ?? 300, level: run.level ?? 3, combo: 10, apples: 20, beers: 2,
    pills: 0, nearMisses: 2, dashThroughs: 0, wallsBroken: 0, kills: 0, seconds: 60, bosses: [], noHitWins: 0, allBosses: false,
    moultSaves: 0, pacifist: false, deathCause: 'onion',
  });
  assert.equal(finished.status, 200, await finished.clone().text());
  return ticket;
}

/** A checked run, then on its board: the board's answer (or the ticket's refusal). */
export async function ranked(harness: Harness, cookie: string, score: number, run: RunShape = {}): Promise<Response> {
  const ticket = await tryTicketed(harness, cookie, score, run);
  if (typeof ticket !== 'string') return ticket;
  return fetch(`${harness.url}/api/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `198.18.1.${++visitor % 250}`, cookie },
    body: JSON.stringify({ ticket, course: COURSE_VERSION }),
  });
}
