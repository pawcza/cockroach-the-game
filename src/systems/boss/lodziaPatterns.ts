/**
 * Pani Lodzia's attacks and when each of them reaches the roach. Plain data and no Phaser, so the fight can be
 * simulated in tests: the fight plays these same numbers, and moves what she throws so it reaches the roach exactly
 * when this says.
 *
 * Built for a person seeing it for the first time, who has to see which attack it is, work out the answer and then
 * hop: one idea at a time. An attack is one idea (the boomerang is one thing that passes twice; a volley is three
 * slippers whipped one after another, each read from her own wind-up), and the next one's wind-up starts only once
 * the last has gone past the roach. Every attack is aimed at the lane the roach is on when its wind-up starts, so
 * standing still, on either lane, never survives. It is hard by rhythm and variety: phase 3 chains them with shrinking
 * gaps. Never a slam and a slipper together, never two curlers at once.
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
 * A curler lands three times on its way, on a steady beat counted from the moment it leaves her fist: on the roach's
 * lane, on the other one, and back on the roach's, each leap lower than the one before. The third landing is the
 * settle: it stops bouncing and rolls flat at the roach, and reaches it `settle` later, the same every time. That
 * landing is the cue, and the lane it settles on is the one it hits.
 */
export const CURLER_LANDINGS = 3;
export const curlerLanding = (beat: number, k: number): number => (k + 1) * beat;
export const curlerArrival = (beat: number, settle: number): number => curlerLanding(beat, CURLER_LANDINGS - 1) + settle;

/**
 * Her stamina, and what takes it. Playing close and making her hit herself ends the fight sooner. But only her own
 * boomerang finishes her: dodges and close calls wear her down to the sliver and no further, and from there the next
 * attack is a boomerang, whose smack in her face is the blow that ends it.
 */
export const STAMINA = 100;
export const DODGE_DAMAGE = 3;
export const CLOSE_CALL_DAMAGE = 2;
/** A hop out of a lane this close before what comes down it reaches the roach is a close call. */
export const CLOSE_CALL_MS = 250;
export const SMACK_DAMAGE = 16;
/** What dodges leave of her: the bar reads nearly empty and she is on her last legs, for the boomerang to finish. */
export const SLIVER = 2;

export const atSliver = (stamina: number): boolean => stamina <= SLIVER;
/** A dodge's wear: never into the sliver's last points, and never more than she has. */
export const dodgeWear = (stamina: number, amount: number): number => Math.min(stamina, Math.max(SLIVER, stamina - amount));
/** The boomerang in her face. One that would leave her in the sliver or below ends her; `lethal` takes all that is left. */
export const smackWear = (stamina: number, lethal = false): number => {
  const left = stamina - SMACK_DAMAGE;
  return lethal || left <= SLIVER ? 0 : left;
};

export type Attack =
  /** Her slipper slammed on the lane: a shockwave runs the whole lane. Be on the other one. */
  | { kind: 'slam'; hold: number; gap: number }
  /** A slipper whipped along the lane: hop out of it. */
  | { kind: 'throw'; travel: number; gap: number }
  /** Three slippers whipped along lanes one after another: each only hurts where it is, so hop out and back. */
  | { kind: 'volley'; lanes: Rel[]; travel: number; spacing: number; gap: number }
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
    case 'volley': {
      // Spaced closer than her throw takes, the animation is sped up to fit
      const scale = Math.min(1, attack.spacing / THROW_MS);
      const hazards = attack.lanes.map((rel, i): Hazard => ({
        t: i * attack.spacing + THROW_RELEASE_MS * scale + attack.travel,
        cue: i * attack.spacing + THROW_CUE_MS * scale,
        rel,
        kind: 'slipper',
      }));
      const last = attack.lanes.length - 1;
      return { hazards, end: Math.max(hazards[last].t, last * attack.spacing + THROW_MS * scale) };
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
// Phase 2 brings the volley, the boomerang and the curler, each the first time slower and with a breather after it
const VOLLEY_2 = { travel: 600, spacing: 500, gap: 600 };
const SLAM_2 = { hold: 350, gap: 350 };
const BOOMERANG_FIRST = { travel: 700, back: 1000, gap: 700 };
const CURLER_FIRST = { beat: 450, settle: 700, gap: 700 };
const BOOMERANG_2 = { travel: 600, back: 900, gap: 400 };
// Phase 3 chains them all, one idea at a time with the gaps between them shrinking, the boomerang the payoff
const THROW_3 = { travel: 520 };
const VOLLEY_3 = { travel: 520, spacing: 450 };
const SLAM_3 = { hold: 300 };
const CURLER_3 = { beat: 450, settle: 600 };
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

/** A volley of three: the first at the roach, then never three in a row on one lane. */
function volleyLanes(rand: () => number): Rel[] {
  const second: Rel = rand() < 0.75 ? 'other' : 'same';
  const third: Rel = second === 'same' ? 'other' : (rand() < 0.5 ? 'same' : 'other');
  return ['same', second, third];
}

/** This fight's phases. rand is the fight's own: the day's seed in a daily run, Math.random otherwise. */
export function buildPhases(rand: () => number): Phase[] {
  const first: Attack[] = [
    { kind: 'slam', ...SLAM_1 },
    { kind: 'throw', ...THROW_1 },
    ...shuffle<Attack>([{ kind: 'slam', ...SLAM_1 }, { kind: 'throw', ...THROW_1 }], rand),
  ];
  const second: Attack[] = [
    { kind: 'volley', lanes: volleyLanes(rand), ...VOLLEY_2 },
    { kind: 'boomerang', ...BOOMERANG_FIRST },
    { kind: 'slam', ...SLAM_2 },
    { kind: 'curler', ...CURLER_FIRST },
    { kind: 'boomerang', ...BOOMERANG_2 },
  ];
  // Two runs of throws, a volley, a slam and a curler, each ended by a boomerang; never a curler first or two in a row
  type Kind = 'throw' | 'volley' | 'slam' | 'curler';
  const run = (): Kind[] => {
    let order: Kind[];
    do order = shuffle<Kind>(['throw', 'volley', 'slam', 'curler', 'throw'], rand);
    while (order[0] === 'curler');
    return order;
  };
  const kinds: AttackKind[] = [...run(), 'boomerang', ...run(), 'boomerang'];
  const third: Attack[] = kinds.map((kind, i) => {
    const gap = Math.round(PHASE_3_GAPS[0] + (PHASE_3_GAPS[1] - PHASE_3_GAPS[0]) * (i / (kinds.length - 1)));
    switch (kind) {
      case 'throw': return { kind, ...THROW_3, gap };
      case 'volley': return { kind, lanes: volleyLanes(rand), ...VOLLEY_3, gap };
      case 'slam': return { kind, ...SLAM_3, gap };
      case 'curler': return { kind, ...CURLER_3, gap };
      default: return { kind: 'boomerang', ...BOOMERANG_3, gap };
    }
  });
  return [{ attacks: first }, { attacks: second }, { attacks: third }];
}

/**
 * The boomerang that ends her when dodges have worn her to the sliver, thrown the way her phase throws it (so a fair,
 * practised telegraph). It draws nothing from the fight's random numbers: nothing about it depends on the player.
 */
export function finisherFor(phase: number): Attack {
  if (phase === 0) return { kind: 'boomerang', ...BOOMERANG_FIRST };
  if (phase === 1) return { kind: 'boomerang', ...BOOMERANG_2 };
  return { kind: 'boomerang', ...BOOMERANG_3, gap: PHASE_3_GAPS[1] };
}

export type Step =
  /** Throw this. `listed`: it is the phase's next attack (move on in the list); otherwise it is the inserted finisher.
   * `lethal`: its smack takes whatever is left (her list ran out with stamina to spare: a moult-saved run). */
  | { kind: 'attack'; attack: Attack; listed: boolean; lethal: boolean }
  /** This phase's attacks are done: the breather, then the next phase. */
  | { kind: 'breather' };

/**
 * What she does after an attack has fully played out (every threat past the roach, the boomerang home): once dodges
 * have worn her to the sliver the next attack is a boomerang, ahead of whatever was next and ahead of any breather; a
 * list that ends in the last phase with stamina left ends on one too.
 */
export function nextStep(phases: Phase[], phase: number, index: number, stamina: number): Step {
  const next = phases[phase].attacks[index];
  if (atSliver(stamina)) {
    return next?.kind === 'boomerang'
      ? { kind: 'attack', attack: next, listed: true, lethal: false }
      : { kind: 'attack', attack: finisherFor(phase), listed: false, lethal: false };
  }
  if (next) return { kind: 'attack', attack: next, listed: true, lethal: false };
  if (phase < phases.length - 1) return { kind: 'breather' };
  return { kind: 'attack', attack: finisherFor(phase), listed: false, lethal: true };
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
  /** What her stamina had lost before the blow that ended her, if it did. */
  damage: number;
  /** When dodges first wore her to the sliver, if they did: ms into the fighting, breathers included. */
  sliverAt: number | null;
  /** When the boomerang smacked her to the end, if it did: ms into the fighting, breathers included. */
  doneAt: number | null;
}

/**
 * Plays the phases against a player. 'still' never moves; a fixed lane stands there whatever comes. A number is a
 * reaction time: that player answers one threat at a time, hopping out of its lane that long after its first readable
 * cue, and a hop that late is a close call when it comes within CLOSE_CALL_MS of the hit. breakMs: the breather between
 * phases. startStamina: a fight begun worn down, to put the sliver anywhere in the list. Ends on the smack that
 * finishes her.
 */
export function simulate(
  phases: Phase[], player: 'still' | Lane | number, start: Lane, breakMs = 1800, startStamina = STAMINA,
): SimResult {
  let lane: Lane = typeof player === 'string' && player !== 'still' ? player : start;
  let t = 0;
  let stamina = startStamina;
  let sliverAt: number | null = null;
  let passedAt = 0;
  let phase = 0;
  let index = 0;
  const seen: SimHazard[] = [];
  const result = (died: boolean, doneAt: number | null): SimResult =>
    ({ died, hazards: seen, damage: startStamina - stamina, sliverAt, doneAt });
  for (;;) {
    const step = nextStep(phases, phase, index, stamina);
    if (step.kind === 'breather') {
      t += breakMs;
      phase++;
      index = 0;
      continue;
    }
    const attackIndex = index;
    if (step.listed) index++;
    const attack = step.attack;
    const roachLane = lane;
    const timed = timeAttack(attack);
    for (const h of timed.hazards.slice().sort((x, y) => x.t - y.t)) {
      const hazard = { at: t + h.t, cue: t + h.cue, lane: resolve(h.rel, roachLane), kind: h.kind, phase, attack: attackIndex, start: t };
      seen.push(hazard);
      // The reacting player hops out if it is in the lane and its hop comes before the hit window opens; it answers
      // one thing at a time, so never before the one ahead of it (a volley's last slipper) has gone past
      const hopAt = Math.max(hazard.cue + (typeof player === 'number' ? player : 0), passedAt + 20);
      let close = false;
      if (typeof player === 'number' && lane === hazard.lane && hopAt < hazard.at - 40) {
        lane = other(lane);
        close = hazard.at - hopAt <= CLOSE_CALL_MS;
      }
      passedAt = hazard.at;
      if (lane === hazard.lane) return result(true, null);
      stamina = dodgeWear(stamina, close ? DODGE_DAMAGE + CLOSE_CALL_DAMAGE : DODGE_DAMAGE);
      if (sliverAt === null && atSliver(stamina)) sliverAt = hazard.at;
    }
    if (timed.smackAt !== undefined) {
      const left = smackWear(stamina, step.lethal);
      if (left <= 0) return result(false, t + timed.smackAt);
      stamina = left;
    }
    t += attackLength(attack);
  }
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
