/**
 * Runs as the server knows them: a ticket issued when a run starts, and the run's report checked against it when it
 * ends. Only a checked run pays okruszki (its score / 100, at least 1), moves the missions and the lifetime stats the
 * achievements are paid from, and goes on a board.
 *
 * A ticket is a random id, issued to an account or to a guest's cookie, with where the run starts, which day's run it
 * is or which match, and when it was issued. It takes one report, from whoever it was issued to; a newer ticket of the
 * same player closes the older ones still open (one run at a time). A guest's finished run waits on its ticket for the
 * account that signs in from the same browser, which may claim it once (the sign-in round trip of the game over).
 *
 * The report is held to what the run could have done (runCheck.ts, on the bounds of runBounds.ts): the distance to what
 * the speed formula allows in the time since the ticket was issued, every count to what the course lays up to that
 * distance, the score to the most those counts could have scored. A distance out of reach is refused; a count or a
 * score over its bound is held to it. What that guarantees and what it doesn't is said at checkRun.
 */
import crypto from 'crypto';
import db from './db';
import { acceptsDaily } from './daily';
import { CHECKPOINT_STARTS, ENDLESS_START } from './bossDistances';
import { balanceOf, credit, payAchievements, reportRun, type PaidAchievement, type RunReport } from './economy';
import { saveStats, statsOf, withCheckedRun } from './playerStats';
import { checkRun, type CheckedRun, type RunClaim, type RunMode } from './runCheck';

export { parseRunClaim, validStart, type CheckedRun, type RunClaim, type RunMode } from './runCheck';

/** A guest's finished run waits this long for the account that signs in to claim it. */
export const CLAIM_TTL_MS = 3_600_000;
/** Tickets are kept this long, then swept. */
const KEEP_MS = 7 * 86_400_000;

db.exec(`
  CREATE TABLE IF NOT EXISTS run_tickets (
    id TEXT PRIMARY KEY,
    user_id INTEGER,
    guest TEXT,
    mode TEXT NOT NULL,
    start INTEGER NOT NULL DEFAULT 0,
    daily TEXT,
    issued_at INTEGER NOT NULL,
    closed INTEGER NOT NULL DEFAULT 0,
    died_at INTEGER,
    death_score INTEGER,
    finished_at INTEGER,
    result TEXT,
    paid_to INTEGER,
    on_board INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_run_tickets_issued ON run_tickets(issued_at);
  CREATE INDEX IF NOT EXISTS idx_run_tickets_user ON run_tickets(user_id, finished_at);
  CREATE INDEX IF NOT EXISTS idx_run_tickets_guest ON run_tickets(guest, finished_at);
`);

interface TicketRow {
  id: string;
  user_id: number | null;
  guest: string | null;
  mode: RunMode;
  start: number;
  daily: string | null;
  issued_at: number;
  closed: number;
  died_at: number | null;
  death_score: number | null;
  finished_at: number | null;
  result: string | null;
  paid_to: number | null;
  on_board: number;
}

/** Who a request comes from: an account, or a guest known by their cookie. */
export interface Owner {
  userId: number | null;
  guest: string | null;
}

const ticketOf = (id: string): TicketRow | undefined =>
  db.prepare('SELECT * FROM run_tickets WHERE id = ?').get(id) as TicketRow | undefined;

const owns = (ticket: TicketRow, owner: Owner): boolean =>
  ticket.user_id !== null ? ticket.user_id === owner.userId : ticket.guest !== null && ticket.guest === owner.guest;

/**
 * Issues a run's ticket and closes the player's other open ones. Solo runs start from 0 or a checkpoint; a day's run
 * from 0 m on today's day; a match ticket is issued by the match itself (multiplayer.ts), as its run starts.
 */
export const issueTicket = db.transaction((owner: Owner, mode: RunMode, start: number, daily: string | null, now: number): string => {
  const id = crypto.randomBytes(16).toString('base64url');
  db.prepare('DELETE FROM run_tickets WHERE issued_at < ?').run(now - KEEP_MS);
  if (owner.userId !== null) {
    db.prepare('UPDATE run_tickets SET closed = 1 WHERE user_id = ? AND finished_at IS NULL AND closed = 0').run(owner.userId);
  } else if (owner.guest !== null) {
    db.prepare('UPDATE run_tickets SET closed = 1 WHERE user_id IS NULL AND guest = ? AND finished_at IS NULL AND closed = 0').run(owner.guest);
  }
  db.prepare('INSERT INTO run_tickets (id, user_id, guest, mode, start, daily, issued_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, owner.userId, owner.guest, mode, start, daily, now);
  return id;
});

/** A match's player died: when, and with what score, as the server saw it (the relayed game:death). */
export function noteMatchDeath(ticketId: string, score: number, at: number): void {
  db.prepare('UPDATE run_tickets SET died_at = ?, death_score = ? WHERE id = ? AND died_at IS NULL').run(at, score, ticketId);
}

/**
 * A match is over: every account in it played one more, the winner (of two or more) won one. The server's own
 * count, paid on at once; a guest's match is not counted.
 */
export const noteMatchOver = db.transaction((players: { ticketId: string; won: boolean }[]): void => {
  // An account in the match twice (two tabs) plays one match, and wins it if either tab did
  const accounts = new Map<number, boolean>();
  for (const { ticketId, won } of players) {
    const userId = ticketOf(ticketId)?.user_id;
    if (userId !== null && userId !== undefined) accounts.set(userId, (accounts.get(userId) ?? false) || won);
  }
  for (const [userId, won] of accounts) {
    const stats = statsOf(userId);
    saveStats(userId, { ...stats, matches: stats.matches + 1, matchWins: stats.matchWins + (won && players.length > 1 ? 1 : 0) });
    payAchievements(userId);
  }
});

/** Whether the server has seen this match player's death (the score a match pays is held to it). */
export const deathSeen = (ticketId: string): boolean =>
  (db.prepare('SELECT died_at FROM run_tickets WHERE id = ?').get(ticketId) as { died_at: number | null } | undefined)?.died_at != null;

/** The ticket's mode, if there is such a ticket. */
export const modeOf = (ticketId: string): RunMode | null => ticketOf(ticketId)?.mode ?? null;

/** Where an account may start a ticketed run: 0, and every checkpoint the server has seen it unlock. A guest: 0 only. */
export function startAllowed(owner: Owner, start: number): boolean {
  if (start === 0) return true;
  if (owner.userId === null) return false;
  return CHECKPOINT_STARTS.slice(0, statsOf(owner.userId).checkpoints).includes(start);
}

/** Warnings about refused or held reports: a few a minute at most, so a flood of junk can't flood the log. */
const WARNINGS_PER_MINUTE = 20;
let warned = { minute: 0, count: 0 };
function warn(message: string): void {
  const minute = Math.floor(Date.now() / 60_000);
  if (warned.minute !== minute) warned = { minute, count: 0 };
  if (++warned.count <= WARNINGS_PER_MINUTE) console.warn(message);
}

// ── Paying ──────────────────────────────────────────────────────────────

/** What a run pays by itself: its score / 100, rounded, and at least 1; nothing for one too short to count. */
export const runCrumbs = (run: Pick<CheckedRun, 'score' | 'counted'>): number => (run.counted ? Math.max(1, Math.round(run.score / 100)) : 0);

/** Where a run's okruszki came from, as the game over shows it. Every number on that screen is from here. */
export interface Receipt {
  /** Paid to the account (false: a guest's run, shown as what it would have paid). */
  paid: boolean;
  score: number;
  /** The run's own okruszki. */
  crumbs: number;
  missions: { text: string; reward: number }[];
  achievements: PaidAchievement[];
  total: number;
  /** The wallet after it; null for a guest. */
  balance: number | null;
  /** The board this run may go on, if it makes it: the main one, a day's, Bez końca's, or none (practice, a match). */
  board: 'main' | 'daily' | 'endless' | null;
  /** Long enough to count (runCheck.ts REAL_RUN): a shorter run pays and counts nothing. */
  counted: boolean;
}

/** The board a checked run may go on. A match goes on the main one, as it always has (cockroach#219). */
function boardOf(run: CheckedRun): Receipt['board'] {
  if (!run.counted) return null;
  if (run.mode === 'daily') return 'daily';
  if (run.start === 0) return 'main';
  return run.start === ENDLESS_START ? 'endless' : null;
}

const missionReport = (run: CheckedRun): RunReport => ({
  score: run.score,
  distance: run.distance - run.start,
  level: run.level,
  combo: run.combo,
  apples: run.apples,
  beers: run.beers,
  pills: run.pills,
  nearMisses: run.nearMisses,
  dashThroughs: run.dashThroughs,
  wallsBroken: run.wallsBroken,
  daily: run.daily,
  multiplayer: run.multiplayer,
});

/** Pays a checked run to an account: its own okruszki, the missions it finished, the achievements it reached. */
const payRun = db.transaction((userId: number, run: CheckedRun, now: number): Receipt => {
  const crumbs = runCrumbs(run);
  credit(userId, crumbs);
  // A run too short to count moves no mission and no stat
  const missions = run.counted ? reportRun(userId, missionReport(run), now) : [];
  if (run.counted) saveStats(userId, withCheckedRun(statsOf(userId), run));
  const achievements = run.counted ? payAchievements(userId) : [];
  return {
    paid: true,
    score: run.score,
    crumbs,
    missions,
    achievements,
    total: crumbs + missions.reduce((s, m) => s + m.reward, 0) + achievements.reduce((s, a) => s + a.reward, 0),
    balance: balanceOf(userId),
    board: boardOf(run),
    counted: run.counted,
  };
});

const guestReceipt = (run: CheckedRun): Receipt => {
  const crumbs = runCrumbs(run);
  return { paid: false, score: run.score, crumbs, missions: [], achievements: [], total: crumbs, balance: null, board: boardOf(run), counted: run.counted };
};

export type FinishResult = { ok: true; receipt: Receipt } | { ok: false; status: number; reason: string };

/** A run's report: checked once against its ticket, paid to its account (a guest's waits for a claim). */
export const finishRun = db.transaction((ticketId: string, owner: Owner, claim: RunClaim, now: number): FinishResult => {
  const ticket = ticketOf(ticketId);
  if (!ticket || !owns(ticket, owner)) return { ok: false, status: 404, reason: 'unknown ticket' };
  if (ticket.finished_at !== null) return { ok: false, status: 409, reason: 'already reported' };
  if (ticket.closed) return { ok: false, status: 409, reason: 'superseded' };
  const checked = checkRun(ticket, claim, now);
  if (!checked.ok) {
    // A refused report closes its ticket: it is not tried again with other numbers
    db.prepare('UPDATE run_tickets SET closed = 1 WHERE id = ?').run(ticketId);
    warn(`run ${ticketId} refused: ${checked.reason}`);
    return { ok: false, status: 422, reason: checked.reason };
  }
  if (checked.run.clamped.length > 0) warn(`run ${ticketId} held to its bounds: ${checked.run.clamped.join(', ')}`);
  const paidTo = ticket.user_id;
  db.prepare('UPDATE run_tickets SET finished_at = ?, result = ?, paid_to = ? WHERE id = ?')
    .run(now, JSON.stringify(checked.run), paidTo, ticketId);
  return { ok: true, receipt: paidTo !== null ? payRun(paidTo, checked.run, now) : guestReceipt(checked.run) };
});

/**
 * A guest's finished run, claimed by the account that just signed in from the same browser: paid to it as if it had
 * been signed in all along. Once, and within CLAIM_TTL_MS of the run's end.
 */
export const claimRun = db.transaction((ticketId: string, userId: number, guest: string | null, now: number): FinishResult => {
  const ticket = ticketOf(ticketId);
  if (!ticket || ticket.user_id !== null || ticket.guest === null || ticket.guest !== guest) return { ok: false, status: 404, reason: 'unknown ticket' };
  if (ticket.finished_at === null || !ticket.result) return { ok: false, status: 409, reason: 'not finished' };
  if (ticket.paid_to !== null) return { ok: false, status: 409, reason: 'already claimed' };
  if (now - ticket.finished_at > CLAIM_TTL_MS) return { ok: false, status: 410, reason: 'expired' };
  db.prepare('UPDATE run_tickets SET paid_to = ? WHERE id = ?').run(userId, ticketId);
  return { ok: true, receipt: payRun(userId, JSON.parse(ticket.result) as CheckedRun, now) };
});

export type BoardResult = { ok: true; run: CheckedRun } | { ok: false; status: number; reason: string };

/** A checked run of this account, to go on its board: once, and only a run that may go on one. */
export const takeForBoard = db.transaction((ticketId: string, userId: number, now: number): BoardResult => {
  const ticket = ticketOf(ticketId);
  if (!ticket || ticket.paid_to !== userId || !ticket.result) return { ok: false, status: 404, reason: 'unknown run' };
  if (ticket.on_board) return { ok: false, status: 409, reason: 'already on the board' };
  const run = JSON.parse(ticket.result) as CheckedRun;
  const board = boardOf(run);
  if (!board) return { ok: false, status: 400, reason: 'A run from a checkpoint is practice and is not ranked' };
  if (board === 'daily' && !(run.dailyDate && acceptsDaily(run.dailyDate, now))) return { ok: false, status: 400, reason: 'That day\'s run is over' };
  if (board === 'endless' && statsOf(userId).checkpoints < CHECKPOINT_STARTS.length) {
    return { ok: false, status: 403, reason: 'Beat the Eksterminator first: the endless start is not unlocked on this account' };
  }
  db.prepare('UPDATE run_tickets SET on_board = 1 WHERE id = ?').run(ticketId);
  return { ok: true, run };
});

/** Forgets a player's tickets, with their account. */
export function forgetTickets(userId: number): void {
  db.prepare('DELETE FROM run_tickets WHERE user_id = ? OR paid_to = ?').run(userId, userId);
}
