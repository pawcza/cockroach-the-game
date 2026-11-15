/**
 * A run as the server checks it (server/runs.ts): a ticket asked for when the run starts, the run's report sent
 * against it when it ends, and what the server made of it, the receipt the game over shows. Every okruszek, mission and
 * achievement on that screen comes from the server's answer here, never from the client's own counts.
 */
import { COURSE_VERSION } from '../../server/daily';
import { adoptShop, type ShopState } from '../ui/Shop';
import type { RunSnapshot } from './profileStats';

/** What the server made of a run (server/runs.ts Receipt). */
export interface Receipt {
  /** Paid to the account; false for a guest's run, whose numbers are what it would have paid. */
  paid: boolean;
  score: number;
  crumbs: number;
  missions: { text: string; reward: number }[];
  achievements: { id: string; name: string; reward: number }[];
  total: number;
  balance: number | null;
  board: 'main' | 'daily' | 'endless' | null;
  /** Long enough to count: a run of a few seconds is shown and pays nothing (server/runCheck.ts REAL_RUN). */
  counted: boolean;
}

/**
 * How a run's report went: checked (the receipt), or why there is none: the server could not be reached, this page is
 * older than the server, the server refused the report, or the run had no ticket to report against (a dev run).
 */
export type RunResult =
  | { kind: 'checked'; ticket: string; receipt: Receipt }
  | { kind: 'offline' }
  | { kind: 'outdated' }
  /** The run started where the account has no unlock the server knows of (a guest: anywhere but 0 m). */
  | { kind: 'locked' }
  | { kind: 'refused'; reason: string }
  | { kind: 'none' };

/**
 * A run's ticket: null when there is none to be had (offline), 'outdated' when the page must reload, 'locked' for a
 * start the server doesn't know this account has unlocked.
 */
export type Ticket = Promise<string | null | 'outdated' | 'locked'>;

async function post(path: string, body: Record<string, unknown>): Promise<Response | null> {
  try {
    return await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, course: COURSE_VERSION }),
    });
  } catch {
    return null;
  }
}

const outdated = async (res: Response): Promise<boolean> =>
  res.status === 409 && ((await res.clone().json().catch(() => ({}))) as { reload?: boolean }).reload === true;

/** Asks for a solo run's ticket as it starts: from 0 m or a checkpoint's distance, or the day's run. */
export function startTicket(start: number, daily: string | null): Ticket {
  return post('/api/run/start', { start, daily }).then(async (res) => {
    if (!res) return null;
    if (await outdated(res)) return 'outdated';
    if (res.status === 403) return 'locked';
    if (!res.ok) return null;
    // A body that isn't JSON (a proxy's page during a deploy) is no ticket
    return ((await res.json().catch(() => null)) as { ticket?: string } | null)?.ticket ?? null;
  });
}

/** A match's ticket comes with its start (server/multiplayer.ts lobby:start). */
export const matchTicket = (ticket: string | null | undefined): Ticket => Promise.resolve(ticket ?? null);

/** The run as the server's report takes it: everything the server holds to its bounds. */
function claimOf(run: RunSnapshot, deathCause: string | null): Record<string, unknown> {
  return {
    score: run.score,
    distance: run.distance,
    level: run.level,
    combo: run.combo,
    apples: run.apples,
    beers: run.beers,
    pills: run.pills,
    nearMisses: run.nearMisses,
    dashThroughs: run.dashThroughs,
    wallsBroken: run.wallsBroken,
    kills: run.kills,
    seconds: run.seconds,
    bosses: run.feats.bosses,
    noHitWins: run.feats.noHitWins,
    allBosses: run.feats.allBosses,
    moultSaves: run.feats.moultSaves,
    pacifist: run.feats.pacifist,
    deathCause,
  };
}

/** What a receipt or a refusal says, as a RunResult; the shop state that comes with a paid one is taken in. */
async function resultOf(res: Response | null, ticket: string): Promise<RunResult> {
  if (!res) return { kind: 'offline' };
  if (await outdated(res)) return { kind: 'outdated' };
  if (!res.ok) {
    if (res.status >= 500) return { kind: 'offline' };
    return { kind: 'refused', reason: ((await res.json().catch(() => ({}))) as { error?: string }).error ?? '' };
  }
  const body = await res.json().catch(() => null) as { receipt: Receipt; state: ShopState | null } | null;
  if (!body) return { kind: 'offline' };
  if (body.state) adoptShop(body.state);
  return { kind: 'checked', ticket, receipt: body.receipt };
}

/** The run is over: its report, against its ticket. */
export async function finishRun(ticket: Ticket, run: RunSnapshot, deathCause: string | null): Promise<RunResult> {
  const id = await ticket;
  if (id === 'outdated') return { kind: 'outdated' };
  if (id === 'locked') return { kind: 'locked' };
  if (id === null) return { kind: 'offline' };
  return resultOf(await post('/api/run/finish', { ticket: id, ...claimOf(run, deathCause) }), id);
}

/** A guest's run, claimed by the account just signed in (and put on its board if `board`). */
export async function claimRun(ticket: string, board: boolean): Promise<{ result: RunResult; saved: boolean }> {
  const res = await post('/api/run/claim', { ticket, board });
  const saved = res?.ok ? ((await res.clone().json().catch(() => ({}))) as { saved?: boolean }).saved === true : false;
  return { result: await resultOf(res, ticket), saved };
}

/** A checked run of this account on its board. */
export async function rankRun(ticket: string): Promise<boolean> {
  const res = await post('/api/scores', { ticket });
  return res?.ok ?? false;
}
