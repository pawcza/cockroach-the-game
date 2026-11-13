/**
 * Pani Lodzia's attacks and when each of them reaches the roach. Plain data and no Phaser, so the fight can be
 * simulated in tests: the fight plays these same numbers, and moves what she throws so it reaches the roach exactly
 * when this says.
 *
 * Built for a person seeing it for the first time, who has to see which attack it is, work out the answer and then
 * hop: one idea at a time. Every attack is a single threat (the boomerang is one thing that passes twice), and the
 * next one's wind-up starts only once the last has gone past the roach. Every attack is aimed at the lane the roach is
 * on when its wind-up starts, so standing still, on either lane, never survives. It is hard by rhythm and variety:
 * phase 3 chains single threats with shrinking gaps, never two at once.
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
/** A throw reads from its third frame on: the slipper out of the pocket and cocked high or low, glowing. */
export const THROW_CUE_MS = (2 * 1000) / 12;
export const THROW_RELEASE_MS = (4 * 1000) / 12;
export const BOOMERANG_MS = (8 * 1000) / 12;
export const BOOMERANG_RELEASE_MS = (6 * 1000) / 12;
export const TANTRUM_MS = (8 * 1000) / 10;
/** The curler leaves her fist on the tantrum's third frame. */
export const TANTRUM_RELEASE_MS = (2 * 1000) / 10;
export const HURT_MS = (4 * 1000) / 12;

/** The boomerang, after passing the roach on its way back, reaches her face this much later. */
export const FACE_MS = 450;
/**
 * A curler lands three times on its way: on the roach's lane, on the other one, and back on the roach's, where it stays
 * and rolls on at the roach. The landings are a beat apart, the first half a beat after it leaves her fist; from its
 * last landing it rolls for `settle` before it reaches the roach. So it is on the lane it will hit with time to see it.
 */
export const CURLER_LANDINGS = 3;
export const curlerLanding = (beat: number, k: number): number => (k + 0.5) * beat;
export const curlerArrival = (beat: number, settle: number): number => curlerLanding(beat, CURLER_LANDINGS - 1) + settle;

/** Her stamina, and what takes it. Playing close and making her hit herself ends the fight sooner. */
export const STAMINA = 100;
export const DODGE_DAMAGE = 3;
export const CLOSE_CALL_DAMAGE = 2;
export const SMACK_DAMAGE = 18;

export type Attack =
  /** Her slipper slammed on the lane: a shockwave runs the whole lane. Be on the other one. */
  | { kind: 'slam'; hold: number; gap: number }
  /** A slipper whipped along the lane: hop out of it. */
  | { kind: 'throw'; travel: number; gap: number }
  /** Out along the roach's lane, off the left edge and back along the other, then into her face. */
  | { kind: 'boomerang'; travel: number; back: number; gap: number }
  /** A curler bouncing lane to lane, settling on the roach's and rolling at it. */
  | { kind: 'curler'; beat: number; settle: number; gap: number };

export type AttackKind = Attack['kind'];
export type HazardKind = 'wave' | 'slipper' | 'boomerang' | 'curler';

export interface Hazard {
  /** ms from the attack's start (its wind-up) until it reaches the roach. */
  t: number;
  /** ms from the attack's start until a player can first read where it will be: the lane-specific wind-up, the
   * boomerang passing (it comes back on the other lane), the curler's last landing. */
  cue: number;
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
      return { hazards: [{ t, cue: 0, rel: 'same', kind: 'wave' }], end: Math.max(t, WINDUP_MS + attack.hold + SLAM_MS) };
    }
    case 'throw': {
      const t = THROW_RELEASE_MS + attack.travel;
      return { hazards: [{ t, cue: THROW_CUE_MS, rel: 'same', kind: 'slipper' }], end: Math.max(t, THROW_MS) };
    }
    case 'boomerang': {
      const out = BOOMERANG_RELEASE_MS + attack.travel;
      const back = out + attack.back;
      const smackAt = back + FACE_MS;
      return {
        hazards: [
          { t: out, cue: 0, rel: 'same', kind: 'boomerang' },
          { t: back, cue: out, rel: 'other', kind: 'boomerang' },
        ],
        end: smackAt + HURT_MS,
        smackAt,
      };
    }
    case 'curler': {
      const t = TANTRUM_RELEASE_MS + curlerArrival(attack.beat, attack.settle);
      const cue = TANTRUM_RELEASE_MS + curlerLanding(attack.beat, CURLER_LANDINGS - 1);
      return { hazards: [{ t, cue, rel: 'same', kind: 'curler' }], end: Math.max(t, TANTRUM_MS) };
    }
  }
}

export interface Phase {
  attacks: Attack[];
}

// Phase 1 teaches the slam and the thrown slipper, slowly, one at a time
const SLAM_1 = { hold: 500, gap: 450 };
const THROW_1 = { travel: 700, gap: 450 };
// Phase 2 brings the boomerang and the curler, each the first time slower and with a breather after it
const THROW_2 = { travel: 600, gap: 350 };
const SLAM_2 = { hold: 350, gap: 350 };
const BOOMERANG_FIRST = { travel: 700, back: 1000, gap: 700 };
const CURLER_FIRST = { beat: 650, settle: 700, gap: 700 };
const BOOMERANG_2 = { travel: 600, back: 900, gap: 400 };
// Phase 3 chains them all, single threats with the gaps between them shrinking, the boomerang the payoff
const THROW_3 = { travel: 520 };
const SLAM_3 = { hold: 300 };
const CURLER_3 = { beat: 550, settle: 560 };
const BOOMERANG_3 = { travel: 600, back: 900 };
/** Phase 3's gaps from one threat gone by to the next wind-up: from the first attack's to the last's. */
const PHASE_3_GAPS = [420, 240];

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** This fight's phases. rand is the fight's own: the day's seed in a daily run, Math.random otherwise. */
export function buildPhases(rand: () => number): Phase[] {
  const first: Attack[] = [
    { kind: 'slam', ...SLAM_1 },
    { kind: 'throw', ...THROW_1 },
    ...shuffle<Attack>([{ kind: 'slam', ...SLAM_1 }, { kind: 'throw', ...THROW_1 }], rand),
  ];
  const second: Attack[] = [
    { kind: 'throw', ...THROW_2 },
    { kind: 'throw', ...THROW_2 },
    { kind: 'boomerang', ...BOOMERANG_FIRST },
    { kind: 'slam', ...SLAM_2 },
    { kind: 'curler', ...CURLER_FIRST },
    { kind: 'boomerang', ...BOOMERANG_2 },
  ];
  // Two runs of throws, a slam and a curler, each ended by a boomerang; never a curler first or two in a row
  type Kind = 'throw' | 'slam' | 'curler';
  const run = (): Kind[] => {
    let order: Kind[];
    do order = shuffle<Kind>(['throw', 'throw', 'slam', 'curler', 'throw'], rand);
    while (order[0] === 'curler');
    return order;
  };
  const kinds: AttackKind[] = [...run(), 'boomerang', ...run(), 'boomerang'];
  const third: Attack[] = kinds.map((kind, i) => {
    const gap = Math.round(PHASE_3_GAPS[0] + (PHASE_3_GAPS[1] - PHASE_3_GAPS[0]) * (i / (kinds.length - 1)));
    switch (kind) {
      case 'throw': return { kind, ...THROW_3, gap };
      case 'slam': return { kind, ...SLAM_3, gap };
      case 'curler': return { kind, ...CURLER_3, gap };
      default: return { kind: 'boomerang', ...BOOMERANG_3, gap };
    }
  });
  return [{ attacks: first }, { attacks: second }, { attacks: third }];
}

/** How long one attack holds the stage: her part done and its threat gone past the roach, then its gap. */
export function attackLength(attack: Attack): number {
  const timed = timeAttack(attack);
  return Math.max(timed.end, ...timed.hazards.map(h => h.t)) + attack.gap;
}

export interface SimHazard {
  at: number; cue: number; lane: Lane; kind: HazardKind; phase: number; attack: number;
  /** When its attack's wind-up started. */
  start: number;
}

export interface SimResult {
  died: boolean;
  /** Every hazard that came, absolute times. */
  hazards: SimHazard[];
  damage: number;
  /** When her stamina ran out, if it did: ms into the fighting, breathers included. */
  doneAt: number | null;
}

/**
 * Plays the phases against a player. 'still' never moves; a fixed lane stands there whatever comes. A number is a
 * reaction time: that player answers one threat at a time, hopping out of its lane that long after its first readable
 * cue. breakMs: the breather between phases.
 */
export function simulate(phases: Phase[], player: 'still' | Lane | number, start: Lane, breakMs = 1800): SimResult {
  let lane: Lane = typeof player === 'string' && player !== 'still' ? player : start;
  let t = 0;
  let damage = 0;
  let doneAt: number | null = null;
  const seen: SimHazard[] = [];
  for (let p = 0; p < phases.length; p++) {
    const attacks = phases[p].attacks;
    for (let a = 0; a < attacks.length; a++) {
      const roachLane = lane;
      const timed = timeAttack(attacks[a]);
      for (const h of timed.hazards.slice().sort((x, y) => x.t - y.t)) {
        const hazard = { at: t + h.t, cue: t + h.cue, lane: resolve(h.rel, roachLane), kind: h.kind, phase: p, attack: a, start: t };
        seen.push(hazard);
        // The reacting player hops out if it is in the lane and its hop comes before the hit window opens
        if (typeof player === 'number' && lane === hazard.lane && hazard.cue + player < hazard.at - 40) lane = other(lane);
        if (lane === hazard.lane) return { died: true, hazards: seen, damage, doneAt };
        damage += DODGE_DAMAGE;
        if (doneAt === null && damage >= STAMINA) doneAt = hazard.at;
      }
      if (timed.smackAt !== undefined) {
        damage += SMACK_DAMAGE;
        if (doneAt === null && damage >= STAMINA) doneAt = t + timed.smackAt;
      }
      t += attackLength(attacks[a]);
    }
    t += breakMs;
  }
  return { died: false, hazards: seen, damage, doneAt };
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
