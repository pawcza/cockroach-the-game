/**
 * DJ Bigos's set: what he plays, beat by beat, and when each thing reaches the roach. Plain data and no Phaser, so the
 * fight can be simulated in tests: the fight plays these same numbers on its 120 BPM clock.
 *
 * Every attack is a musical phrase that starts on a beat and lands on one: a call the player can count (he points, the
 * cone charges, BLAST on the fourth), a light that shows a beat ahead where it will flash, a record thrown on the beat.
 * Every attack is aimed: its lanes are relative to the roach's when the attack starts, and the first thing to reach it
 * comes down on its lane, so standing still on either lane never survives. The hop answers rings, records and lights;
 * the dash answers the bass drop (both lanes at once) and turns rings and records into feedback: each one dashed
 * through or smashed feeds the speakers, and a full meter overloads one, which is the opening to dash into it.
 */
export { fightRandom } from './lodziaPatterns';

export type Lane = 'top' | 'bottom';
/** A lane relative to the roach's when the attack starts. */
export type Rel = 'same' | 'other';

export const other = (lane: Lane): Lane => (lane === 'top' ? 'bottom' : 'top');
export const resolve = (rel: Rel, roachLane: Lane): Lane => (rel === 'same' ? roachLane : other(roachLane));

export const BPM = 120;
export const BEAT_MS = 60000 / BPM;

/** A ring: he points on beat 0, the cone charges, it fires on this beat, and reaches the roach a beat later. */
export const RING_FIRE_BEAT = 3;
export const RING_TRAVEL_MS = BEAT_MS;
/** The bass drop builds for two bars the first time, one bar after, and fires on the beat after them. */
export const DROP_BUILD_FIRST = 8;
export const DROP_BUILD = 4;
/** A record leaves his hand on this beat. */
export const RECORD_RELEASE_BEAT = 1;
/** A light shows on its lane a beat before it flashes; the flash is the dangerous part. */
export const LIGHT_PREVIEW_BEATS = 1;
export const LIGHT_MS = 150;

/** The dash, as Player has it: nothing hurts during the first 375 ms, the next one is ready 1575 ms after the press. */
export const DASH_MS = 375;
export const DASH_CYCLE_MS = 375 + 1200;

/** Feedback: what fills a speaker's meter (or the ball's heat), and how full it overloads. */
export const FEED_MAX = 3;
export const FEED_DASH = 1;
export const FEED_DROP = 2;
/** An opening lasts this many beats; after a wreck the next phase starts this many beats later. */
export const OPEN_BEATS = 6;
export const WRECK_BEATS = 4;

export type HazardKind = 'ring' | 'record' | 'light' | 'drop';

export interface Hazard {
  /** ms from the attack's first beat until it reaches the roach (a light: until its flash). */
  t: number;
  rel: Rel | 'both';
  kind: HazardKind;
  /** How long it stays dangerous after t: a flash lasts, a ring or record only passes. */
  lasts: number;
}

export type Attack =
  /** Rings fired down lanes, a beat apart. Hop out of the lane, or dash through for feedback. */
  | { kind: 'rings'; lanes: Rel[] }
  /** A build (`build` beats: two bars the first time, one after), then both lanes at once: only a dash gets through. */
  | { kind: 'drop'; travel: number; build: number }
  /** Records flung along lanes, `spacing` beats apart: hop out and back, or smash one with a dash. */
  | { kind: 'records'; lanes: Rel[]; travel: number; spacing: number }
  /** The ball's spotlight hopping lane to lane, one flash a beat, each shown a beat ahead. */
  | { kind: 'lights'; lanes: Rel[] };

/** What one attack sends at the roach and when, and the beats it holds the stage for (before the gap). */
export function timeAttack(attack: Attack): { hazards: Hazard[]; beats: number } {
  let hazards: Hazard[];
  switch (attack.kind) {
    case 'rings':
      hazards = attack.lanes.map((rel, i) => ({ t: (RING_FIRE_BEAT + i) * BEAT_MS + RING_TRAVEL_MS, rel, kind: 'ring', lasts: 0 }));
      break;
    case 'drop':
      hazards = [{ t: attack.build * BEAT_MS + attack.travel, rel: 'both', kind: 'drop', lasts: LIGHT_MS }];
      break;
    case 'records':
      hazards = attack.lanes.map((rel, i) =>
        ({ t: (RECORD_RELEASE_BEAT + i * attack.spacing) * BEAT_MS + attack.travel, rel, kind: 'record', lasts: 0 }));
      break;
    case 'lights':
      hazards = attack.lanes.map((rel, i) =>
        ({ t: (LIGHT_PREVIEW_BEATS + 1 + i) * BEAT_MS, rel, kind: 'light', lasts: LIGHT_MS }));
      break;
  }
  const last = Math.max(...hazards.map(h => h.t + h.lasts));
  return { hazards, beats: Math.ceil(last / BEAT_MS) + 1 };
}

export interface Phase {
  attacks: Attack[];
  /** Beats between one attack and the next. */
  gap: number;
}

// Phase 1: a ring at the roach, the first drop (slow, with the prompt), a record to smash: an opening comes early for
// anyone who dashes. Then the patterns the rest of the fight is made of, slowly
const P1_GAP = 1;
const FIRST_DROP_TRAVEL = 750;
const RECORD_TRAVEL_1 = 750;
// Phase 2: one speaker left, quicker records, rings in threes, the drop again
const P2_GAP = 1;
const DROP_TRAVEL = BEAT_MS;
const RECORD_TRAVEL_2 = 650;
// Phase 3: the ball alone: lights in long runs, records, a drop of light
const P3_GAP = 1;
const RECORD_TRAVEL_3 = 600;

const pick = <T>(items: T[], rand: () => number): T => items[Math.floor(rand() * items.length)];

/** A run of lights: the first at the roach, then never three on one lane in a row. */
function lightRun(length: number, rand: () => number): Rel[] {
  const lanes: Rel[] = ['same'];
  let lane: 'a' | 'b' = 'a';
  let streak = 1;
  for (let i = 1; i < length; i++) {
    const stay = streak < 2 && rand() < 0.4;
    if (!stay) { lane = lane === 'a' ? 'b' : 'a'; streak = 1; } else streak++;
    lanes.push(lane === 'a' ? 'same' : 'other');
  }
  return lanes;
}

/** The fight's three phases. rand is the fight's own: the day's seed in a daily run, Math.random otherwise. */
export function buildPhases(rand: () => number): Phase[] {
  const one: Attack[] = [
    { kind: 'rings', lanes: ['same'] },
    { kind: 'drop', travel: FIRST_DROP_TRAVEL, build: DROP_BUILD_FIRST },
    { kind: 'records', lanes: ['same'], travel: RECORD_TRAVEL_1, spacing: 2 },
    { kind: 'rings', lanes: pick<Rel[]>([['other', 'same'], ['same', 'same']], rand) },
    { kind: 'lights', lanes: lightRun(4, rand) },
    { kind: 'records', lanes: ['same', 'other'], travel: RECORD_TRAVEL_1, spacing: 2 },
  ];
  const two: Attack[] = [
    { kind: 'records', lanes: ['same', 'other', 'same'], travel: RECORD_TRAVEL_2, spacing: 1 },
    { kind: 'rings', lanes: pick<Rel[]>([['same', 'other', 'same'], ['other', 'same', 'same']], rand) },
    { kind: 'drop', travel: DROP_TRAVEL, build: DROP_BUILD },
    { kind: 'lights', lanes: lightRun(5, rand) },
    { kind: 'records', lanes: pick<Rel[]>([['same', 'same'], ['same', 'other']], rand), travel: RECORD_TRAVEL_2, spacing: 1 },
  ];
  const three: Attack[] = [
    { kind: 'lights', lanes: lightRun(6, rand) },
    { kind: 'records', lanes: ['same', 'other', 'same'], travel: RECORD_TRAVEL_3, spacing: 1 },
    { kind: 'drop', travel: DROP_TRAVEL, build: DROP_BUILD },
    { kind: 'lights', lanes: lightRun(6, rand) },
  ];
  return [
    { attacks: one, gap: P1_GAP },
    { attacks: two, gap: P2_GAP },
    { attacks: three, gap: P3_GAP },
  ];
}

export type Player = 'still' | Lane | 'perfect' | 'aggressive';

export interface SimResult {
  died: boolean;
  /** When the fight ended, ms, counting openings and the pauses after wrecks. */
  endedAt: number;
  /** The shortest time the roach had to get from one lane to the other between two hazards. */
  minWindow: number;
  /** A drop arrived while the dash was still cooling down from the last one that was required. */
  dashOnCooldown: boolean;
  openings: number;
}

/**
 * Plays the fight against a player. 'still' never moves; a lane stands there whatever comes; 'perfect' hops out of every
 * hazard's lane and dashes only through drops (the guaranteed openings end each phase); 'aggressive' also dashes through
 * every ring and record on its lane whenever the dash is ready, which fills the meters and brings openings early.
 * Every opening is taken: a dash on its first beat.
 */
export function simulate(phases: Phase[], player: Player, start: Lane): SimResult {
  let lane: Lane = player === 'top' || player === 'bottom' ? player : start;
  const moves = player === 'perfect' || player === 'aggressive';
  let t = 0;
  let minWindow = Infinity;
  let dashReadyAt = 0;
  let requiredReadyAt = 0;
  let dashOnCooldown = false;
  let openings = 0;
  /** When each lane was last dangerous. */
  const lastOn: Record<Lane, number> = { top: -Infinity, bottom: -Infinity };
  for (let p = 0; p < phases.length; p++) {
    const phase = phases[p];
    let feed = 0;
    let opened = false;
    for (const attack of phase.attacks) {
      if (opened) break;
      const roachLane = lane;
      const { hazards, beats } = timeAttack(attack);
      for (const h of hazards.slice().sort((a, b) => a.t - b.t)) {
        const at = t + h.t;
        const lanes: Lane[] = h.rel === 'both' ? ['top', 'bottom'] : [resolve(h.rel, roachLane)];
        if (h.kind === 'drop') {
          if (!moves) return { died: true, endedAt: at, minWindow, dashOnCooldown, openings };
          if (at - 100 < requiredReadyAt) dashOnCooldown = true;
          dashReadyAt = requiredReadyAt = at - 100 + DASH_CYCLE_MS;
          feed += FEED_DROP;
        } else if (lanes.includes(lane)) {
          const canSmash = h.kind !== 'light' && at - 100 >= dashReadyAt;
          if (player === 'aggressive' && canSmash) {
            dashReadyAt = at - 100 + DASH_CYCLE_MS;
            feed += FEED_DASH;
          } else if (moves) {
            const to = other(lane);
            minWindow = Math.min(minWindow, at - lastOn[to]);
            lane = to;
          } else {
            return { died: true, endedAt: at, minWindow, dashOnCooldown, openings };
          }
        }
        for (const l of lanes) lastOn[l] = Math.max(lastOn[l], at + h.lasts);
      }
      t += (beats + phase.gap) * BEAT_MS;
      if (feed >= FEED_MAX) opened = true;
    }
    // The opening: early if the meter filled, otherwise guaranteed once the phase's set is played
    openings++;
    if (t < dashReadyAt) t = Math.ceil(dashReadyAt / BEAT_MS) * BEAT_MS;
    dashReadyAt = t + DASH_CYCLE_MS;
    t += (1 + WRECK_BEATS) * BEAT_MS;
  }
  return { died: false, endedAt: t, minWindow, dashOnCooldown, openings };
}
