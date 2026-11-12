/**
 * The Eksterminator's attacks, phase by phase: plain data and no Phaser, so the patterns can be tested. A phase is a
 * list the fight plays in a loop until his tank drops to the next third; each phase is faster and mixes more.
 *
 * Every attack has an answer the roach has by 2600 m: a spray is dodged on the other lane; a canister is shot down
 * from the lane it is crossing, or its cloud is left on its lane, or dashed through; a cloud on one lane with a spray
 * on the other needs the canister shot or the dash.
 */
import type { Lane } from './lodziaPatterns';

export type { Lane };

export type Attack =
  /** Wand levelled at the top lane, or bent over pouring along the floor: the stream holds the lane. */
  | { kind: 'spray'; lane: Lane }
  /** A canister lobbed onto a lane: its cloud rolls along it towards the roach. */
  | { kind: 'lob'; lane: Lane }
  /** Two canisters, one per lane, the second a beat after the first. */
  | { kind: 'doubleLob'; first: Lane }
  /** A canister onto one lane, then the stream on the other, held while the cloud reaches the roach. */
  | { kind: 'cloudSpray'; cloud: Lane }
  /** The pump announces it: the stream on one lane, then straight on to the other. */
  | { kind: 'sweep'; first: Lane };

export interface Phase {
  /** The opening attacks, played once. */
  opening: Attack[];
  /** Then these, in a loop, until the phase ends. */
  loop: Attack[];
  /** How long a spray's wind-up holds on its last frame before the stream comes, ms. */
  hold: number;
  /** From one attack done to the next wind-up, ms. */
  gap: number;
  /** How long the stream holds a lane, ms. */
  spray: number;
  /** The canister's time in the air, ms. */
  flight: number;
}

/** Phase 1 teaches: a spray on each lane, then a canister on each, then those two, alone. */
export const PHASE_1 = { hold: 900, gap: 950, spray: 1000, flight: 1350 };
/** Phase 2: faster, and the combinations come in. */
export const PHASE_2 = { hold: 650, gap: 700, spray: 1000, flight: 1200 };
/** Phase 3: fast, and the pump's sweep. */
export const PHASE_3 = { hold: 450, gap: 550, spray: 900, flight: 1050 };

/** How many attacks a phase's loop holds before it repeats. */
export const LOOP_LENGTH = 8;

const other = (lane: Lane): Lane => (lane === 'top' ? 'bottom' : 'top');
const pick = <T>(items: readonly T[], rand: () => number): T => items[Math.floor(rand() * items.length)];
const lane = (rand: () => number): Lane => (rand() < 0.5 ? 'top' : 'bottom');

function make(kind: Attack['kind'], rand: () => number): Attack {
  switch (kind) {
    case 'spray': return { kind, lane: lane(rand) };
    case 'lob': return { kind, lane: lane(rand) };
    case 'doubleLob': return { kind, first: lane(rand) };
    case 'cloudSpray': return { kind, cloud: lane(rand) };
    case 'sweep': return { kind, first: lane(rand) };
  }
}

/** A loop from a pool, never the same kind twice running. */
function loop(pool: Attack['kind'][], rand: () => number): Attack[] {
  const out: Attack[] = [];
  while (out.length < LOOP_LENGTH) {
    const kind = pick(pool, rand);
    if (out.length && out[out.length - 1].kind === kind && pool.length > 1) continue;
    out.push(make(kind, rand));
  }
  return out;
}

/** The fight's three phases. rand is the fight's own (the day's seed in a daily run); roachLane where it stands. */
export function buildPhases(rand: () => number, roachLane: Lane): Phase[] {
  const firstLob = lane(rand);
  return [
    {
      opening: [
        { kind: 'spray', lane: roachLane },
        { kind: 'spray', lane: other(roachLane) },
        { kind: 'lob', lane: firstLob },
        { kind: 'lob', lane: other(firstLob) },
      ],
      loop: loop(['spray', 'lob'], rand),
      ...PHASE_1,
    },
    {
      opening: [make('cloudSpray', rand), make('spray', rand)],
      loop: loop(['cloudSpray', 'doubleLob', 'spray', 'lob'], rand),
      ...PHASE_2,
    },
    {
      opening: [make('sweep', rand)],
      loop: loop(['sweep', 'cloudSpray', 'doubleLob', 'spray'], rand),
      ...PHASE_3,
    },
  ];
}

// ── Timing ─────────────────────────────────────────────────────────
// What the fight plays, in ms from an attack's start: the fight schedules by these, and the tests read the same
// numbers to prove every attack can be read and answered.

/** A spray's wind-up (4 frames at 10 fps, either lane). */
export const WINDUP_MS = 400;
/** The lob's frame where the canister leaves his hand (frame 3 at 10 fps). */
export const LOB_RELEASE_MS = 300;
/** The pump (6 frames at 10 fps), and its glint held before the sweep. */
export const PUMP_MS = 600;
export const PUMP_HOLD_MS = 500;
/** The sweep: its first wind-up holds at most this long, the second lane's only this long; each stream this long. */
export const SWEEP_FIRST_HOLD_MS = 300;
export const SWEEP_SWITCH_HOLD_MS = 180;
export const SWEEP_SPRAY_MS = 800;
/** Two canisters: the second lob starts this long after the first canister leaves his hand. */
export const DOUBLE_LOB_GAP_MS = 700;
/** The canister lands this far ahead of the roach; its cloud boils there, then rolls at the roach. */
export const CLOUD_LAND_AHEAD = 150;
export const CLOUD_SIT_MS = 1300;
export const CLOUD_ROLL_SPEED = 230;
/** The cloud touches the roach while they are this close along the lane, px. */
export const CLOUD_HIT_PX = 46;
/** In the combination the stream holds the other lane from this long before the cloud reaches the roach until this
 * long after it has passed. */
export const COMBO_LEAD_MS = 650;
export const COMBO_TAIL_MS = 450;

/** From a canister leaving his hand to its cloud touching the roach, and how long it touches. */
export const cloudArrivesMs = (flight: number): number =>
  flight + CLOUD_SIT_MS + ((CLOUD_LAND_AHEAD - CLOUD_HIT_PX) / CLOUD_ROLL_SPEED) * 1000;
export const CLOUD_CONTACT_MS = ((2 * CLOUD_HIT_PX) / CLOUD_ROLL_SPEED) * 1000;

/** The combination's stream: when it starts (from the canister's release) and how long it holds. */
export function comboSpray(phase: Pick<Phase, 'hold' | 'spray' | 'flight'>): { start: number; length: number } {
  const arrive = cloudArrivesMs(phase.flight);
  const start = Math.max(0, arrive - COMBO_LEAD_MS - WINDUP_MS - phase.hold);
  const length = Math.max(phase.spray, arrive + CLOUD_CONTACT_MS - (start + WINDUP_MS + phase.hold) + COMBO_TAIL_MS);
  return { start, length };
}

/** Something on a lane at the roach's spot: from when to when, and when its lane was first marked. */
export interface Hazard {
  lane: Lane;
  kind: 'stream' | 'cloud';
  from: number;
  to: number;
  warnAt: number;
}

/** What an attack puts at the roach's spot, in ms from its start, and when it is done (the next one waits). */
export function attackHazards(attack: Attack, phase: Phase): { hazards: Hazard[]; done: number } {
  const hazards: Hazard[] = [];
  const spray = (lane: Lane, at: number, hold: number, length: number): number => {
    const from = at + WINDUP_MS + hold;
    hazards.push({ lane, kind: 'stream', from, to: from + length, warnAt: at });
    return from + length;
  };
  const lob = (lane: Lane, at: number): number => {
    const from = at + LOB_RELEASE_MS + cloudArrivesMs(phase.flight);
    hazards.push({ lane, kind: 'cloud', from, to: from + CLOUD_CONTACT_MS, warnAt: at });
    return from + CLOUD_CONTACT_MS;
  };
  let done = 0;
  switch (attack.kind) {
    case 'spray':
      done = spray(attack.lane, 0, phase.hold, phase.spray);
      break;
    case 'lob':
      done = lob(attack.lane, 0);
      break;
    case 'doubleLob':
      done = Math.max(lob(attack.first, 0), lob(other(attack.first), LOB_RELEASE_MS + DOUBLE_LOB_GAP_MS));
      break;
    case 'cloudSpray': {
      const { start, length } = comboSpray(phase);
      done = Math.max(lob(attack.cloud, 0), spray(other(attack.cloud), LOB_RELEASE_MS + start, phase.hold, length));
      break;
    }
    case 'sweep': {
      const first = spray(attack.first, PUMP_MS + PUMP_HOLD_MS, Math.min(phase.hold, SWEEP_FIRST_HOLD_MS), SWEEP_SPRAY_MS);
      done = spray(other(attack.first), first, SWEEP_SWITCH_HOLD_MS, SWEEP_SPRAY_MS);
      break;
    }
  }
  return { hazards, done };
}
