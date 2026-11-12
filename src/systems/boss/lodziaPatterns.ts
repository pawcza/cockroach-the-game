/**
 * Pani Lodzia's attacks and when each of them reaches the roach. Plain data and no Phaser, so the fight can be
 * simulated in tests: the fight plays these same numbers, and moves what she throws so it reaches the roach exactly
 * when this says.
 *
 * Every attack is aimed: its lanes are relative to the lane the roach stands on when the attack's telegraph starts,
 * and the first thing to reach it always comes down on that lane. So standing still, on either lane, never survives.
 * The only answer is the lane hop, and what varies is when to hop and when to come back.
 */
import { SeededRNG } from '../../multiplayer/SeededRNG';

export type Lane = 'top' | 'bottom';
/** A lane relative to the roach's when the attack starts. */
export type Rel = 'same' | 'other';

export const other = (lane: Lane): Lane => (lane === 'top' ? 'bottom' : 'top');
export const resolve = (rel: Rel, roachLane: Lane): Lane => (rel === 'same' ? roachLane : other(roachLane));

// Her animations' timings, ms (lodziaConfig's frame counts and speeds)
export const WINDUP_MS = (5 * 1000) / 12;
/** From the slam's start to its impact frame. */
export const SLAM_IMPACT_MS = 1000 / 18;
export const SLAM_MS = (5 * 1000) / 18;
/** A slam's shockwave, from the slipper landing to the roach. */
export const WAVE_MS = 200;
export const THROW_MS = (6 * 1000) / 12;
export const THROW_RELEASE_MS = (4 * 1000) / 12;
export const BOOMERANG_MS = (8 * 1000) / 12;
export const BOOMERANG_RELEASE_MS = (6 * 1000) / 12;
export const TANTRUM_MS = (8 * 1000) / 10;
export const TANTRUM_RELEASE_MS = [(2 * 1000) / 10, (6 * 1000) / 10];
export const HURT_MS = (4 * 1000) / 12;

/** The boomerang, after passing the roach on its way back, reaches her face this much later. */
export const FACE_MS = 450;
/** A curler bounces from lane to lane on this beat, and reaches the roach mid-beat after this many. */
export const CURLER_BEAT_MS = 300;
export const CURLER_BEATS = 3;
export const CURLER_ARRIVAL_MS = (CURLER_BEATS + 0.45) * CURLER_BEAT_MS;

/** Her stamina, and what takes it. Playing close and making her hit herself ends the fight sooner. */
export const STAMINA = 100;
export const DODGE_DAMAGE = 2;
export const CLOSE_CALL_DAMAGE = 2;
export const SMACK_DAMAGE = 16;

export type Attack =
  /** Her slipper slammed on the lane: a shockwave runs the whole lane. Be on the other one. */
  | { kind: 'slam'; hold: number }
  /** Slippers whipped along lanes, one after another: each only hurts where it is, so hop out and back. */
  | { kind: 'throws'; lanes: Rel[]; travel: number; spacing: number }
  /** Out along the roach's lane, off the left edge and back along the other, then into her face. */
  | { kind: 'boomerang'; travel: number; back: number }
  /** A slipper at the roach's lane, then a slam on the other one: wait out the wave, then hop into its lane. */
  | { kind: 'combo'; travel: number }
  /** Curlers bouncing from lane to lane: read where each will be when it reaches the roach. */
  | { kind: 'curlers'; count: 1 | 2 };

export type HazardKind = 'wave' | 'slipper' | 'boomerang' | 'curler';

export interface Hazard {
  /** ms from the attack's start (its telegraph) until it reaches the roach. */
  t: number;
  rel: Rel;
  kind: HazardKind;
}

export interface Timed {
  hazards: Hazard[];
  /** When her own part is done: the last animation over, the boomerang home. */
  end: number;
  /** The boomerang hits her in the face at this time. */
  smackAt?: number;
}

/** What one attack sends at the roach and when. */
export function timeAttack(attack: Attack): Timed {
  switch (attack.kind) {
    case 'slam': {
      const t = WINDUP_MS + attack.hold + SLAM_IMPACT_MS + WAVE_MS;
      return { hazards: [{ t, rel: 'same', kind: 'wave' }], end: Math.max(t, WINDUP_MS + attack.hold + SLAM_MS) };
    }
    case 'throws': {
      const scale = Math.min(1, attack.spacing / THROW_MS);
      const hazards = attack.lanes.map((rel, i): Hazard =>
        ({ t: i * attack.spacing + THROW_RELEASE_MS * scale + attack.travel, rel, kind: 'slipper' }));
      return { hazards, end: Math.max(hazards[hazards.length - 1].t, (attack.lanes.length - 1) * attack.spacing + THROW_MS * scale) };
    }
    case 'boomerang': {
      const out = BOOMERANG_RELEASE_MS + attack.travel;
      const back = out + attack.back;
      const smackAt = back + FACE_MS;
      return {
        hazards: [{ t: out, rel: 'same', kind: 'boomerang' }, { t: back, rel: 'other', kind: 'boomerang' }],
        end: smackAt + HURT_MS,
        smackAt,
      };
    }
    case 'combo': {
      const wave = THROW_MS + WINDUP_MS + SLAM_IMPACT_MS + WAVE_MS;
      const slipper = THROW_RELEASE_MS + attack.travel;
      return {
        hazards: [{ t: wave, rel: 'other', kind: 'wave' }, { t: slipper, rel: 'same', kind: 'slipper' }],
        end: Math.max(slipper, THROW_MS + WINDUP_MS + SLAM_MS),
      };
    }
    case 'curlers': {
      const hazards = TANTRUM_RELEASE_MS.slice(0, attack.count).map((release, i): Hazard =>
        ({ t: release + CURLER_ARRIVAL_MS, rel: i === 0 ? 'same' : 'other', kind: 'curler' }));
      return { hazards, end: Math.max(TANTRUM_MS, hazards[hazards.length - 1].t) };
    }
  }
}

export interface Phase {
  attacks: Attack[];
  /** From one attack done to the next one's telegraph, ms. */
  gap: number;
}

// Phase 1 teaches: the slam, then single thrown slippers, slowly, every one at the roach
const PHASE_1_GAP = 400;
const SLAM_HOLD = 450;
const THROW_TRAVEL_1 = 650;
// Phase 2: volleys, a pair on the same lane, the first boomerangs
const PHASE_2_GAP = 300;
const THROW_TRAVEL_2 = 600;
const VOLLEY_SPACING = 500;
const BOOMERANG_2 = { travel: 600, back: 900 };
// Phase 3: a pair on both lanes a beat apart, slam and slipper together, curlers, boomerangs
const PHASE_3_GAP = 240;
const THROW_TRAVEL_3 = 500;
const PAIR_SPACING = 400;
/** The combo's slipper flies slower: it reaches the roach after the slam's wave has passed the other lane. */
const COMBO_TRAVEL = 1250;
const BOOMERANG_3 = { travel: 550, back: 800 };

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A volley of three: the first at the roach, then never three in a row on one lane. */
function volley(rand: () => number): Rel[] {
  const second: Rel = rand() < 0.75 ? 'other' : 'same';
  const third: Rel = second === 'same' ? 'other' : (rand() < 0.5 ? 'same' : 'other');
  return ['same', second, third];
}

/** This fight's phases. rand is the fight's own: the day's seed in a daily run, Math.random otherwise. */
export function buildPhases(rand: () => number): Phase[] {
  const first: Attack[] = [
    { kind: 'slam', hold: SLAM_HOLD },
    { kind: 'throws', lanes: ['same'], travel: THROW_TRAVEL_1, spacing: VOLLEY_SPACING },
    ...shuffle<Attack>([
      { kind: 'slam', hold: SLAM_HOLD },
      { kind: 'throws', lanes: ['same'], travel: THROW_TRAVEL_1, spacing: VOLLEY_SPACING },
    ], rand),
  ];
  // A volley opens it, so the first boomerang comes after the player has hopped back and forth once
  const second: Attack[] = [
    { kind: 'throws', lanes: volley(rand), travel: THROW_TRAVEL_2, spacing: VOLLEY_SPACING },
    ...shuffle<Attack>([
      { kind: 'throws', lanes: ['same', 'same'], travel: THROW_TRAVEL_2, spacing: VOLLEY_SPACING },
      { kind: 'boomerang', ...BOOMERANG_2 },
      { kind: 'throws', lanes: volley(rand), travel: THROW_TRAVEL_2, spacing: VOLLEY_SPACING },
    ], rand),
    { kind: 'boomerang', ...BOOMERANG_2 },
  ];
  // One curler before two; it ends on a boomerang
  const third: Attack[] = shuffle<Attack>([
    { kind: 'throws', lanes: ['same', 'other'], travel: THROW_TRAVEL_3, spacing: PAIR_SPACING },
    { kind: 'combo', travel: COMBO_TRAVEL },
    { kind: 'boomerang', ...BOOMERANG_3 },
    { kind: 'combo', travel: COMBO_TRAVEL },
  ], rand);
  third.splice(1 + Math.floor(rand() * 2), 0, { kind: 'curlers', count: 1 });
  third.splice(4 + Math.floor(rand() * 2), 0, { kind: 'curlers', count: 2 });
  third.push({ kind: 'boomerang', ...BOOMERANG_3 });
  return [
    { attacks: first, gap: PHASE_1_GAP },
    { attacks: second, gap: PHASE_2_GAP },
    { attacks: third, gap: PHASE_3_GAP },
  ];
}

/** How long one attack holds the stage: until her part is done and its last hazard has passed, then the gap. */
export function attackLength(attack: Attack, gap: number): number {
  const timed = timeAttack(attack);
  return Math.max(timed.end, ...timed.hazards.map(h => h.t)) + gap;
}

export interface SimResult {
  died: boolean;
  /** Every hazard's absolute lane and time, for the ones that came. */
  hazards: { at: number; lane: Lane; kind: HazardKind }[];
  /** The shortest time between two hazards on different lanes, back to back: the tightest hop window there is. */
  minWindow: number;
  damage: number;
}

/**
 * Plays the phases against a player. 'still' never moves; a fixed lane stands there whatever comes; 'perfect' is on the
 * safe lane for every hazard, hopping in the window between two that come down on different lanes.
 * breakMs: the breather between phases.
 */
export function simulate(phases: Phase[], player: 'still' | Lane | 'perfect', start: Lane, breakMs = 2000): SimResult {
  let lane: Lane = player === 'still' || player === 'perfect' ? start : player;
  let t = 0;
  let minWindow = Infinity;
  let prev: { at: number; lane: Lane } | null = null;
  let damage = 0;
  const seen: SimResult['hazards'] = [];
  for (const phase of phases) {
    for (const attack of phase.attacks) {
      const roachLane = lane;
      const timed = timeAttack(attack);
      const hazards = timed.hazards.map(h => ({ at: t + h.t, lane: resolve(h.rel, roachLane), kind: h.kind }))
        .sort((a, b) => a.at - b.at);
      for (const h of hazards) {
        if (player === 'perfect' && lane === h.lane) lane = other(lane);
        if (prev && prev.lane !== h.lane) minWindow = Math.min(minWindow, h.at - prev.at);
        prev = h;
        seen.push(h);
        if (lane === h.lane) return { died: true, hazards: seen, minWindow, damage };
        damage += DODGE_DAMAGE;
      }
      if (timed.smackAt !== undefined) damage += SMACK_DAMAGE;
      t += attackLength(attack, phase.gap);
    }
    t += breakMs;
  }
  return { died: false, hazards: seen, minWindow, damage };
}

/**
 * A fight's own random numbers. With the run's seed (a daily run) everyone that day meets the same fight, without
 * drawing a single number from the run's own generator; without one, Math.random.
 */
export function fightRandom(seed: number | null | undefined, bossId: string): () => number {
  if (seed === null || seed === undefined) return Math.random;
  let mixed = seed | 0;
  for (let i = 0; i < bossId.length; i++) mixed = Math.imul(mixed ^ bossId.charCodeAt(i), 16777619);
  const rng = new SeededRNG(mixed);
  return () => rng.next();
}
