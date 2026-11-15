/**
 * A run's report held to what the run could have done: pure, so the tests hold it to the real planner's courses
 * (tests/run-bounds.test.ts). runs.ts keeps the tickets and pays what this lets through.
 */
import { BOSS_TRIGGER_DISTANCE, CHECKPOINT_STARTS } from './bossDistances';
import type { CountedRun } from './playerStats';
import {
  BEER_CHANCE, BOSS_FIGHTS, bossesOf, busySlots, distancePoints, eventPoints, lessonApples, levelAt, luckyShare, MATCH_BOSS,
  maxDistance, MOULT_SAVES_PER_RUN, PILL_CHANCE, richSlots, slotsUpTo, wallsIn,
} from './runBounds';
import { isRecord, parseDeathCause } from './validate';

export type RunMode = 'solo' | 'daily' | 'match';

/** A run's ticket is good for this long: the longest run with every pause. */
export const TICKET_TTL_MS = 6 * 3_600_000;
/** A claimed distance may run over the speed formula's by this much (timers, frame steps): a share and some metres. */
const DISTANCE_SLACK = 1.02;
const DISTANCE_SLACK_M = 10;
/** The client counts whole seconds of play from its own clock: this much over the server's wall clock is allowed. */
const SECONDS_SLACK = 1;
/**
 * The least a run must be to pay and count: this much play and this many metres. Less is still checked and shown, but
 * pays nothing and counts for nothing (no run, no mission, no stat). A roach left alone dies at the first obstacle in
 * its lane some 8-12 s and 10 m in; one that hops into the first slot's enemy can die sooner, and earns nothing then.
 */
export const REAL_RUN = { seconds: 5, metres: 10 };

/** Where a solo run may start: 0, or a checkpoint's distance. */
export const validStart = (start: unknown): start is number =>
  typeof start === 'number' && (start === 0 || CHECKPOINT_STARTS.includes(start));

/** What of a ticket the check reads. */
export interface TicketFacts {
  mode: RunMode;
  start: number;
  daily: string | null;
  issued_at: number;
  died_at: number | null;
  death_score: number | null;
}

const BOSS_IDS = Object.keys(BOSS_TRIGGER_DISTANCE) as (keyof typeof BOSS_TRIGGER_DISTANCE)[];
const MAX_COUNT = 10_000_000;

/** A finished run as a client reports it: everything still a claim. */
export interface RunClaim {
  score: number;
  /** Metres from the course's start, where the run ended. */
  distance: number;
  level: number;
  combo: number;
  apples: number;
  beers: number;
  pills: number;
  nearMisses: number;
  dashThroughs: number;
  wallsBroken: number;
  kills: number;
  /** Whole seconds of play: pauses and fights left out. */
  seconds: number;
  bosses: string[];
  noHitWins: number;
  allBosses: boolean;
  moultSaves: number;
  pacifist: boolean;
  deathCause: string | null;
}

/** A run report: whole numbers in range, the bosses by id, once each. Null for junk. */
export function parseRunClaim(body: unknown): RunClaim | null {
  if (!isRecord(body)) return null;
  const keys = ['score', 'distance', 'level', 'combo', 'apples', 'beers', 'pills', 'nearMisses', 'dashThroughs', 'wallsBroken',
    'kills', 'seconds', 'noHitWins', 'moultSaves'] as const;
  const out: Partial<RunClaim> = {};
  for (const key of keys) {
    const value = body[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_COUNT) return null;
    out[key] = Math.floor(value);
  }
  const bosses = body.bosses ?? [];
  if (!Array.isArray(bosses) || bosses.length > BOSS_IDS.length) return null;
  if (!bosses.every((b): b is string => typeof b === 'string' && (BOSS_IDS as string[]).includes(b))) return null;
  return {
    ...out as Omit<RunClaim, 'bosses' | 'allBosses' | 'pacifist' | 'deathCause'>,
    bosses: [...new Set(bosses)],
    allBosses: body.allBosses === true,
    pacifist: body.pacifist === true,
    deathCause: parseDeathCause(body.deathCause),
  };
}

/** A run the server checked: what it pays, counts and ranks. */
export interface CheckedRun extends CountedRun {
  mode: RunMode;
  dailyDate: string | null;
  deathCause: string | null;
  /** The claims that were held to a bound, by name (for the log; an honest run has none). */
  clamped: string[];
  /** Long enough to pay and count (REAL_RUN); a shorter one is shown and pays nothing. */
  counted: boolean;
}

export type CheckResult = { ok: true; run: CheckedRun } | { ok: false; reason: string };

/**
 * Holds a report to its ticket and to what the run could have done.
 *
 * Guaranteed: a run pays and ranks only once, only for whoever its ticket was issued to, only after the time its
 * distance takes at the speed formula's most (dash and pills included), and with no count above what the course lays
 * up to that distance, no boss beaten that the run didn't reach, and no score above what a flawless run on the luckiest
 * course would make of those counts.
 *
 * Not guaranteed: that the run was played. The server never sees the run itself, so a report within these bounds is
 * taken as it comes: a script that waits as long as the run would take may claim a flawless run of that length. See
 * the bounds' looseness in runBounds.ts.
 */
export function checkRun(ticket: TicketFacts, claim: RunClaim, now: number): CheckResult {
  const end = ticket.died_at ?? now;
  const elapsedS = (end - ticket.issued_at) / 1000;
  if (end - ticket.issued_at > TICKET_TTL_MS) return { ok: false, reason: 'expired' };
  const multiplayer = ticket.mode === 'match';
  const start = ticket.start;
  const clamped: string[] = [];
  const hold = (name: string, value: number, bound: number): number => {
    if (value <= bound) return value;
    clamped.push(name);
    return Math.max(0, Math.floor(bound));
  };

  const distance = claim.distance;
  if (distance < start) return { ok: false, reason: 'distance' };
  if (claim.seconds > elapsedS + SECONDS_SLACK) return { ok: false, reason: 'time' };

  // The bosses the run reached, and those it beat: solo, a run only gets past a boss by beating him, so every boss
  // behind its distance was beaten, whatever it claims; one it reached and claims beaten, too. Every win takes a fight's
  // least time on top of the play, which the wall clock must have had
  const ladder = bossesOf(multiplayer);
  const fought = ladder.filter(b => b > start && b <= distance + 2);
  const idAt = (at: number): string => BOSS_IDS.find(id => BOSS_TRIGGER_DISTANCE[id] === at)!;
  const bosses: string[] = multiplayer ? [] : BOSS_IDS.filter((id) => {
    const at = BOSS_TRIGGER_DISTANCE[id];
    return at > start && (at < distance - 2 || (at <= distance + 2 && claim.bosses.includes(id)));
  });
  if (claim.bosses.some(id => !bosses.includes(id))) clamped.push('bosses');
  const fightTime = bosses.reduce((sum, id) => sum + BOSS_FIGHTS[id].minSeconds, 0);
  if (claim.seconds + fightTime > elapsedS + SECONDS_SLACK) return { ok: false, reason: 'time' };

  // What the course laid up to there: pickups and enemies from its slots, walls from its slots where walls stand, the
  // lessons' apples where a lesson was passed. Nothing where it laid nothing
  const { slots, wallSlots } = slotsUpTo(start, distance, ladder);
  const rich = richSlots(slots);
  const walls = wallsIn(wallSlots);
  const lessons = multiplayer ? 0 : lessonApples(start, distance);
  const pills = hold('pills', claim.pills, luckyShare(rich, PILL_CHANCE));
  const beers = hold('beers', claim.beers, luckyShare(rich, BEER_CHANCE));
  const apples = hold('apples', claim.apples, rich + lessons - pills - beers);

  // How far it could have got in the time it played
  const seconds = Math.min(claim.seconds, elapsedS) + 1;
  if (distance > maxDistance(start, seconds, pills) * DISTANCE_SLACK + DISTANCE_SLACK_M) return { ok: false, reason: 'too fast' };

  // Enemies: a close call off each at most, a dash through each and through the walls, a shot down each (solo only:
  // the pistol is not in a match), and all of those together no more than there were enemies and walls, which with the
  // pickups were no more than the slots carry together
  const room = Math.max(0, Math.min(rich + walls, busySlots(slots) + lessons - apples - beers - pills));
  const wallsBroken = hold('wallsBroken', claim.wallsBroken, walls);
  const kills = hold('kills', claim.kills, multiplayer ? 0 : room);
  const dashThroughs = hold('dashThroughs', claim.dashThroughs, room - kills);
  const nearMisses = hold('nearMisses', claim.nearMisses, room - kills - dashThroughs);
  const events = apples + beers + pills + nearMisses + dashThroughs + kills;
  const combo = hold('combo', claim.combo, events);
  const topLevel = levelAt(Math.max(start, distance));
  const level = hold('level', claim.level, topLevel);

  const noHitWins = hold('noHitWins', claim.noHitWins, bosses.length);
  const allBosses = claim.allBosses && start === 0 && BOSS_IDS.every(id => bosses.includes(id));
  // The moult is Zlewiatan's: won in this run, or owned from a start past him; one hit a run
  const hasMoult = !multiplayer && (start >= BOSS_TRIGGER_DISTANCE.zlewiatan || bosses.includes('zlewiatan'));
  const moultSaves = hold('moultSaves', claim.moultSaves, hasMoult ? MOULT_SAVES_PER_RUN : 0);
  // From level 7 (DJ Bigos's distance) to level 9 (Zlewiatan's) with the pistol unfired: a run that ran into level 7 with
  // the pistol won from Bigos in it, and beat Zlewiatan to get into level 9
  const pacifist = claim.pacifist && bosses.includes('bigos') && bosses.includes('zlewiatan');
  if (claim.allBosses && !allBosses) clamped.push('allBosses');
  if (claim.pacifist && !pacifist) clamped.push('pacifist');

  // The score: the distance's points, a point a second of play, every event at its best, and each fight reached at most
  // its cap (a fight's length is not taken from the wall clock: a longer one is held to the cap)
  const fights = multiplayer ? fought.length * MATCH_BOSS.cap : fought.reduce((sum, at) => sum + BOSS_FIGHTS[idAt(at)].cap, 0);
  const bound = distancePoints(start, distance) + Math.floor(seconds) + 1
    + eventPoints({ apples, beers, pills, nearMisses, dashThroughs, kills }, combo, topLevel) + fights;
  let score = hold('score', claim.score, bound);
  // A match's score is the one the server relayed to the others when the player died
  if (ticket.death_score !== null) score = hold('score', score, ticket.death_score);
  const counted = claim.seconds >= REAL_RUN.seconds && distance - start >= REAL_RUN.metres;

  return {
    ok: true,
    run: {
      mode: ticket.mode,
      dailyDate: ticket.daily,
      score, start, distance, level, combo, apples, beers, pills, nearMisses, dashThroughs, wallsBroken, kills,
      seconds: Math.floor(Math.min(claim.seconds, elapsedS)),
      bosses, noHitWins, allBosses, moultSaves, pacifist,
      daily: ticket.mode === 'daily',
      multiplayer,
      deathCause: claim.deathCause,
      clamped,
      counted,
    },
  };
}
