/**
 * DJ Bigos's set: what he plays, beat by beat, what each thing does when it reaches the roach, and what the roach's
 * dash does to him. Plain data and no Phaser, so the fight can be simulated in tests: the fight plays these same
 * numbers on its 120 BPM clock and asks the director here what comes next and what a hit did.
 *
 * He is the first boss the roach can fight back against, so the fight is built round the dash. The dash is a lunge
 * down the lane into whatever stands at its end: a speaker (1 damage), and in the last phase the ball over the top
 * lane. It is always allowed and every lunge that reaches something counts. A dash that meets a ring or a record on
 * its way sends it back for 3 (a parry). What keeps it from being spam is the dash itself: it protects for 375 ms and
 * comes back 1575 ms after the press, and the bass drop only a dash gets through: a wave front a few floor tiles wide
 * that leaves the speakers on both lanes at once and travels at the roach, so hopping is no escape, and a dash into
 * it bounces it back like a ring (for more when it is bounced at the last moment). From phase two a second wave
 * follows, timed to arrive as the dash comes back: lunge at the speakers in between and it finds you without one.
 *
 * Built for a person seeing it the first time, one idea at a time, like Pani Lodzia: an attack is one idea (a ring, a
 * record, a run of lights, a drop, a speaker's burst), its first readable cue is a fixed time before it lands, and the
 * next attack's cue starts only once the last threat has gone past. Every attack he picks is aimed at the roach's lane
 * when it starts, so standing still never survives. A speaker hit hard enough answers on its own lane (a burst of
 * three rings); when the first speaker goes he cranks the other back up to half; bouncing a drop back overloads his
 * system for a few beats, nothing comes and every lunge counts double.
 *
 * Phases bring new ideas, not speed: one, two speakers (lunge at them, hop or parry the rings, the drop); two, one
 * speaker left (records to smash back at it, its lane is the dangerous one, it fights back, the drop comes twice);
 * three, the ball (records a beat apart, quicker lights, no breathers, and runs of lights straight into a double
 * drop: hop, hop, dash, dash). There is little waiting: the gaps between attacks are a beat, the openings to lunge in.
 */
export { fightRandom } from './lodziaPatterns';

export type Lane = 'top' | 'bottom';
/** A lane relative to the roach's when the attack starts; 'live' is the lane of the one speaker still standing. */
export type Rel = 'same' | 'other';
export type RingRel = Rel | 'live';
export type Target = Lane | 'ball';

export const other = (lane: Lane): Lane => (lane === 'top' ? 'bottom' : 'top');
export const resolve = (rel: Rel, roachLane: Lane): Lane => (rel === 'same' ? roachLane : other(roachLane));

export const BPM = 120;
export const BEAT_MS = 60000 / BPM;

/** A ring: its speaker charges this many beats (he points at it), fires on the beat, and the ring reaches the roach a
 * beat later. */
export const RING_CHARGE_BEATS = 1;
export const RING_TRAVEL_MS = BEAT_MS;
/** A record glows in his glove, his arm aimed at its lane, for a beat; then it leaves his hand. */
export const RECORD_WINDUP_BEATS = 1;
/** A light is shown on its lane (the ball turned to it, the lane marked) this many beats before it flashes, and the
 * next is shown as it flashes: two beats in phase one, a beat and a half once the player knows them. */
export const LIGHT_CUE_BEATS = 2;
export const LIGHT_CUE_QUICK = 1.5;
export const LIGHT_MS = 150;
/**
 * The bass drop builds for two beats (three the first time); then a wave front leaves the speakers on both lanes and
 * travels at the roach, reaching it `travel` later (the first one slower, then quicker by phase). It hits where its
 * front is: a roach that is not dashing is hit once the front has run DROP_GRACE_MS into it, and a dash that touches it
 * before then, from the moment it leaves, bounces it back (and the twin on the other lane collapses with it). Bounced
 * in its last DROP_TIGHT_MS it is worth DROP_TIGHT_BONUS more. With `waves: 2` the speakers recharge as the first
 * arrives and the second leaves DROP_WAVE_BREAK_MS later, so it arrives just as a dash spent on the first comes back.
 */
export const DROP_BUILD_FIRST = 3;
export const DROP_BUILD = 2;
export const FIRST_DROP_TRAVEL = 1250;
export const DROP_TRAVEL_1 = 1000;
export const DROP_TRAVEL = 750;
export const DROP_GRACE_MS = 120;
export const DROP_TIGHT_MS = 200;
export const DROP_TIGHT_BONUS = 2;
export const DROP_WAVE_BREAK_MS = 1000;

/** The dash, as Player has it: nothing hurts during the first 375 ms, the next one is ready 1575 ms after the press. */
export const DASH_MS = 375;
export const DASH_CYCLE_MS = 375 + 1200;
/** The lunge: out to the end of the lane in this share of the dash, back in the rest. It hits on arriving. */
export const LUNGE_OUT_SHARE = 0.45;
export const LUNGE_OUT_MS = DASH_MS * LUNGE_OUT_SHARE;
/**
 * How far the lunge reaches, as a share of the distance from the roach to where a ring, record or beam starts: about
 * 1 on the screen (they come out of the speakers it lunges at); the tests model it lower to be safe.
 */
export const LUNGE_REACH_SHARE = 0.9;

/** Each part of his sound system takes this much: two speakers, then the ball. */
export const SEGMENT_HP = 16;
export const SEGMENTS = 3;
export const TOTAL_HP = SEGMENT_HP * SEGMENTS;
/** A lunge that reaches its target, and a ring or record sent back. */
export const HIT_DAMAGE = 1;
export const PARRY_DAMAGE = 3;
/** A drop bounced back overloads his system this many beats: nothing comes, and every lunge counts this many times. */
export const OPEN_BEATS = 5;
export const OPEN_MULTIPLIER = 2;
/** A speaker that has taken this much since its last burst answers with one. */
export const RETALIATE_AT = 5;
export const BURST_RINGS = 3;
/** When the first speaker goes he cranks the other one up to at least this, so phase two is always fought. */
export const CRANK_HP = SEGMENT_HP / 2;
/** After a wreck the next phase starts this many beats later. */
export const WRECK_BEATS = 3;
/** A prompt, once it shows, is pressed within this long by a person who has seen it. */
export const PROMPT_REACTION_MS = 400;

export type HazardKind = 'ring' | 'record' | 'light' | 'drop';

export interface Hazard {
  /** ms from the attack's start until it reaches the roach (a light: until its flash). */
  t: number;
  /** ms from the attack's start until a player can first read where it will be. */
  cue: number;
  /** ms from the attack's start until it leaves (a ring its speaker, a record his hand, a drop's fronts); a light: t. */
  fire: number;
  lane: RingRel | Lane | 'both';
  kind: HazardKind;
  /** How long it stays dangerous after t: a flash lasts, a ring or record only passes. */
  lasts: number;
  /** A dash that meets it sends it back. */
  parry: boolean;
}

export type Attack =
  /** Nothing: a bar to lunge at the speakers in. */
  | { kind: 'rest'; beats: number; gap: number }
  /** Rings, `spacing` beats apart, each from the speaker on its lane. Hop out, or dash through and send it back. */
  | { kind: 'rings'; lanes: RingRel[]; spacing: number; gap: number }
  /** Records flung along lanes, `spacing` beats apart: hop out, or smash one with a dash and send it back. */
  | { kind: 'records'; lanes: Rel[]; spacing: number; travel: number; gap: number }
  /** The ball's spotlight, lane to lane, one flash every `beat` beats: each shown that long ahead. Hop. */
  | { kind: 'lights'; lanes: Rel[]; beat: number; gap: number }
  /** A build, then a wave front travelling down both lanes at once (`waves` of them): dash into each to bounce it. */
  | { kind: 'drop'; build: number; travel: number; waves: number; gap: number }
  /** A speaker hit too often shrieks for RING_CHARGE_BEATS and fires a ring a beat down its own lane, `count` times. */
  | { kind: 'burst'; lane: Lane; count: number; gap: number };

export type AttackKind = Attack['kind'];

/** What one attack sends at the roach and when, and how many beats it holds the stage (its gap included). */
export function timeAttack(attack: Attack): { hazards: Hazard[]; beats: number } {
  let hazards: Hazard[] = [];
  switch (attack.kind) {
    case 'rest':
      return { hazards, beats: attack.beats + attack.gap };
    case 'rings':
      hazards = attack.lanes.map((lane, i) => {
        const fire = (i * attack.spacing + RING_CHARGE_BEATS) * BEAT_MS;
        return { t: fire + RING_TRAVEL_MS, cue: i * attack.spacing * BEAT_MS, fire, lane, kind: 'ring', lasts: 0, parry: true };
      });
      break;
    case 'records':
      hazards = attack.lanes.map((lane, i) => {
        const cue = i * attack.spacing * BEAT_MS;
        const fire = cue + RECORD_WINDUP_BEATS * BEAT_MS;
        return { t: fire + attack.travel, cue, fire, lane, kind: 'record', lasts: 0, parry: true };
      });
      break;
    case 'lights':
      hazards = attack.lanes.map((lane, i) => {
        const t = (i + 1) * attack.beat * BEAT_MS;
        return { t, cue: t - attack.beat * BEAT_MS, fire: t, lane, kind: 'light', lasts: LIGHT_MS, parry: false };
      });
      break;
    case 'drop': {
      // Each wave after the first is read from the speakers recharging, which starts as the one before arrives
      let cue = 0;
      let fire = attack.build * BEAT_MS;
      for (let i = 0; i < attack.waves; i++) {
        const t = fire + attack.travel;
        hazards.push({ t, cue, fire, lane: 'both', kind: 'drop', lasts: DROP_GRACE_MS, parry: true });
        cue = t;
        fire = t + DROP_WAVE_BREAK_MS;
      }
      break;
    }
    case 'burst':
      hazards = Array.from({ length: attack.count }, (_, i) => {
        const fire = (RING_CHARGE_BEATS + i) * BEAT_MS;
        return { t: fire + RING_TRAVEL_MS, cue: 0, fire, lane: attack.lane, kind: 'ring', lasts: 0, parry: true };
      });
      break;
  }
  const last = Math.max(...hazards.map(h => h.t + h.lasts));
  return { hazards, beats: Math.ceil(last / BEAT_MS) + attack.gap };
}

export interface Phase {
  /** Played once, in order, when the phase starts. */
  intro: Attack[];
  /** Then this, over and over. */
  loop: Attack[];
}

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

const RECORD_TRAVEL_FIRST = 650;
const RECORD_TRAVEL_2 = 550;
const RECORD_TRAVEL_3 = 500;

/** The fight's three phases. rand is the fight's own: the day's seed in a daily run, Math.random otherwise. */
export function buildPhases(rand: () => number): Phase[] {
  // One: a short bar to lunge in (the dash prompt), rings one at a time, lights, the first drop (prompted)
  const drop1 = { kind: 'drop', build: DROP_BUILD, travel: DROP_TRAVEL_1, waves: 1, gap: 1 } as const;
  const one: Phase = {
    intro: [
      { kind: 'rest', beats: 3, gap: 0 },
      { kind: 'rings', lanes: ['same'], spacing: 2, gap: 1 },
      { kind: 'rings', lanes: ['same'], spacing: 2, gap: 1 },
      { kind: 'lights', lanes: lightRun(3, rand), beat: LIGHT_CUE_BEATS, gap: 1 },
      drop1,
    ],
    loop: [
      { kind: 'rings', lanes: pick<RingRel[]>([['same', 'other'], ['same', 'same']], rand), spacing: 2, gap: 1 },
      { kind: 'lights', lanes: lightRun(3, rand), beat: LIGHT_CUE_BEATS, gap: 1 },
      { kind: 'rings', lanes: ['same'], spacing: 2, gap: 1 },
      drop1,
    ],
  };
  // Two: one speaker, the dangerous lane is its own. Records to smash back at it (the first alone, prompted), and the
  // drop comes twice
  const drop2 = { kind: 'drop', build: DROP_BUILD, travel: DROP_TRAVEL, waves: 2, gap: 1 } as const;
  const two: Phase = {
    intro: [
      { kind: 'records', lanes: ['same'], spacing: 2, travel: RECORD_TRAVEL_FIRST, gap: 1 },
      // Early, so a quick player who wrecked the first speaker before its drop still meets one before the ball
      drop2,
      { kind: 'rings', lanes: ['live', 'live'], spacing: 1, gap: 1 },
      { kind: 'records', lanes: ['same', 'other', 'same'], spacing: 2, travel: RECORD_TRAVEL_2, gap: 1 },
    ],
    loop: [
      { kind: 'records', lanes: pick<Rel[]>([['same', 'other', 'same'], ['same', 'same', 'other']], rand), spacing: 2, travel: RECORD_TRAVEL_2, gap: 1 },
      { kind: 'rings', lanes: ['live', 'live', 'live'], spacing: 1, gap: 1 },
      { kind: 'lights', lanes: lightRun(4, rand), beat: LIGHT_CUE_QUICK, gap: 1 },
      drop2,
    ],
  };
  // Three: the ball. Records into it a beat apart, and runs of lights straight into a double drop. No breathers
  const three: Phase = {
    intro: [
      { kind: 'records', lanes: ['same', 'other'], spacing: 1, travel: RECORD_TRAVEL_3, gap: 0 },
      { kind: 'lights', lanes: lightRun(3, rand), beat: LIGHT_CUE_QUICK, gap: 0 },
      drop2,
    ],
    loop: [
      { kind: 'records', lanes: pick<Rel[]>([['same', 'other', 'same'], ['same', 'same', 'other']], rand), spacing: 1, travel: RECORD_TRAVEL_3, gap: 0 },
      { kind: 'lights', lanes: lightRun(5, rand), beat: LIGHT_CUE_QUICK, gap: 0 },
      drop2,
    ],
  };
  return [one, two, three];
}

export type Step =
  | { kind: 'attack'; attack: Attack; phase: number; index: number }
  /** His system overloaded after a drop bounced back: nothing comes, lunges count OPEN_MULTIPLIER times. */
  | { kind: 'open'; beats: number; phase: number; index: number };

export function stepBeats(step: Step): number {
  return step.kind === 'open' ? step.beats : timeAttack(step.attack).beats;
}

/**
 * What comes next, and what a hit does: the fight and the simulation both run on this. The fight asks `next` each
 * time the stage is free, tells it every hit, and that a drop was bounced back.
 */
export class BigosDirector {
  phase = 0;
  readonly hp: Record<Target, number> = { top: SEGMENT_HP, bottom: SEGMENT_HP, ball: SEGMENT_HP };
  /** Overloaded: the step playing is the opening after a bounced drop. */
  open = false;
  private queue: Attack[];
  private openPending = false;
  private readonly anger: Record<Lane, number> = { top: 0, bottom: 0 };
  private index = 0;
  private dropped = false;

  constructor(private readonly phases: Phase[]) {
    this.queue = phases[0].intro.slice();
  }

  wrecked(lane: Lane): boolean { return this.hp[lane] <= 0; }

  /** The speaker still standing, in phase two. */
  get liveLane(): Lane | null {
    if (this.phase !== 1) return null;
    return this.wrecked('top') ? 'bottom' : 'top';
  }

  get remaining(): number {
    return Math.max(0, this.hp.top) + Math.max(0, this.hp.bottom) + Math.max(0, this.hp.ball);
  }

  get won(): boolean { return this.hp.ball <= 0; }

  /** What a lunge down this lane reaches: its speaker while it stands, then the ball, which hangs over the top lane. */
  lungeTarget(lane: Lane): Target | null {
    if (this.phase === 2) return lane === 'top' ? 'ball' : null;
    return this.wrecked(lane) ? null : lane;
  }

  /** What a ring or record sent back from this lane hits: its lane's speaker, the one left, or the ball. */
  parryTarget(lane: Lane): Target {
    if (this.phase === 2) return 'ball';
    if (this.phase === 1) return this.liveLane!;
    return lane;
  }

  /** A ring aimed relative to the roach, or at the speaker still standing. */
  ringLane(rel: RingRel | Lane, roachLane: Lane): Lane {
    if (rel === 'top' || rel === 'bottom') return rel;
    if (rel === 'live') return this.liveLane ?? roachLane;
    return resolve(rel, roachLane);
  }

  next(): Step {
    this.open = false;
    const index = this.index++;
    if (this.openPending) {
      this.openPending = false;
      this.open = true;
      return { kind: 'open', beats: OPEN_BEATS, phase: this.phase, index };
    }
    if (this.phase < 2) {
      const angry = (['top', 'bottom'] as Lane[]).find(l => !this.wrecked(l) && this.anger[l] >= RETALIATE_AT);
      if (angry) {
        this.anger[angry] = 0;
        return { kind: 'attack', attack: { kind: 'burst', lane: angry, count: BURST_RINGS, gap: 1 }, phase: this.phase, index };
      }
    }
    if (!this.queue.length) this.queue = this.phases[this.phase].loop.slice();
    let attack = this.queue.shift()!;
    // The fight's first drop, whichever phase it comes in (a quick player can wreck a speaker before it): a longer
    // build, a slower fall and one wave, with the prompt
    if (attack.kind === 'drop' && !this.dropped) attack = { ...attack, build: DROP_BUILD_FIRST, travel: FIRST_DROP_TRAVEL, waves: 1 };
    if (attack.kind === 'drop') this.dropped = true;
    return { kind: 'attack', attack, phase: this.phase, index };
  }

  /** A drop was bounced back: the next step is the opening. */
  dropBounced(): void {
    this.openPending = true;
  }

  /** Damage to a target; what it did. Overloaded, a lunge counts double (a parry can only come from an attack). */
  hit(target: Target, base: number): { dealt: number; wrecked: Target | null; won: boolean; cranked: boolean } {
    if (this.hp[target] <= 0 || this.won) return { dealt: 0, wrecked: null, won: this.won, cranked: false };
    const dealt = Math.min(this.hp[target], base * (this.open ? OPEN_MULTIPLIER : 1));
    this.hp[target] -= dealt;
    if (target !== 'ball') this.anger[target] += dealt;
    if (this.hp[target] > 0) return { dealt, wrecked: null, won: false, cranked: false };
    if (target === 'ball') return { dealt, wrecked: 'ball', won: true, cranked: false };
    // A speaker wrecked: the next phase, from its start. What the other speaker took stays taken, down to CRANK_HP
    let cranked = false;
    if (this.phase === 0 && this.hp[other(target)] < CRANK_HP) {
      this.hp[other(target)] = CRANK_HP;
      cranked = true;
    }
    this.phase++;
    this.queue = this.phases[this.phase].intro.slice();
    this.openPending = false;
    this.open = false;
    this.anger.top = this.anger.bottom = 0;
    if (this.phase === 2) this.hp.top = this.hp.bottom = 0;
    return { dealt, wrecked: target, won: false, cranked };
  }
}

/** The lunge's offset from the roach's spot, as a share of its reach, `dt` ms after the press. */
export function lungeOffset(dt: number, reach = 1): number {
  if (dt < 0 || dt >= DASH_MS) return 0;
  if (dt < LUNGE_OUT_MS) {
    const k = dt / LUNGE_OUT_MS;
    return reach * (1 - (1 - k) * (1 - k));
  }
  const back = (dt - LUNGE_OUT_MS) / (DASH_MS - LUNGE_OUT_MS);
  return reach * (0.5 + 0.5 * Math.cos(Math.PI * back));
}

/**
 * Whether a dash pressed at `press` meets something that leaves the far end of the lane at `fire` and would reach
 * the roach's spot at `arrive`, while the dash still protects: the lunge runs out to meet it.
 */
export function lungeMeets(press: number, fire: number, arrive: number, reach = LUNGE_REACH_SHARE): boolean {
  for (let t = Math.max(press, fire); t <= press + DASH_MS; t += 1) {
    const x = 1 - (t - fire) / (arrive - fire);
    if (lungeOffset(t - press, reach) >= x) return true;
  }
  return false;
}

/**
 * Whether a dash pressed at `press` bounces a drop's front that leaves at `fire` and reaches the roach's spot at
 * `arrive`: it runs out and meets it, or the front is already on the roach (inside its grace) when it starts.
 */
export function frontMeets(press: number, fire: number, arrive: number): boolean {
  if (press > arrive + DROP_GRACE_MS) return false;
  return press >= arrive || lungeMeets(press, fire, arrive);
}

/**
 * A keycap prompt: shown over the roach only from `from` to `to` (ms from its step's start), and only while the dash
 * is ready; before it, from `countFrom`, a ring closing in counts the beat in without asking for anything yet.
 * `meet`: what the dash it asks for must meet (a drop's front, a record), or none (a lunge into something open); `grace`,
 * how long after reaching the roach's spot it can still be dashed into (a drop's front).
 */
export interface Prompt {
  key: 'hit' | 'drop' | 'smash' | 'open';
  countFrom: number;
  from: number;
  to: number;
  meet: { fire: number; arrive: number; grace: number } | null;
  /** The step's length, ms: a lunge it asks for must arrive inside it. */
  until: number;
}

/** How long a prompt shows: anyone who presses within PROMPT_REACTION_MS of seeing it, at any moment, is still safe. */
const PROMPT_SHOW_MS = 300;

/** The prompt a step carries the first time its kind comes in a fight (the fight keeps track of which came already). */
export function promptFor(step: Step): Prompt | null {
  const until = stepBeats(step) * BEAT_MS;
  if (step.kind === 'open') {
    return { key: 'open', countFrom: 0, from: 0, to: until - PROMPT_REACTION_MS - LUNGE_OUT_MS - 50, meet: null, until };
  }
  const attack = step.attack;
  if (attack.kind === 'rest') {
    return { key: 'hit', countFrom: 0, from: 0, to: until - PROMPT_REACTION_MS - LUNGE_OUT_MS - 50, meet: null, until };
  }
  if (attack.kind === 'drop' || (attack.kind === 'records' && attack.lanes.length === 1)) {
    const [h] = timeAttack(attack).hazards;
    // From the moment it leaves: a dash pressed any time it is in flight runs out and meets it. Gone early enough that
    // a press PROMPT_REACTION_MS after its last moment still comes before it arrives
    const grace = attack.kind === 'drop' ? DROP_GRACE_MS : 0;
    const to = Math.min(h.fire + PROMPT_SHOW_MS, h.t + grace - PROMPT_REACTION_MS - 30);
    if (to < h.fire) return null;
    return {
      key: attack.kind === 'drop' ? 'drop' : 'smash', countFrom: Math.max(0, h.fire - 2 * BEAT_MS), from: h.fire, to,
      meet: { fire: h.fire, arrive: h.t, grace }, until,
    };
  }
  return null;
}

// ── Simulation ──────────────────────────────────────────────────────

/**
 * A simulated player. reaction: ms from a thing's first readable cue to answering it; one thing at a time (never
 * before the one ahead of it has gone past). parry: dashes through rings and records on its lane when the dash is
 * ready. lunge: 'safe' lunges at the speakers between threats, never with a drop on the way it would have no dash
 * for; 'blind' presses the dash the moment it is ready, whatever is coming; 'never' only dashes at drops and parries.
 */
export interface SimPlayer {
  reaction: number; parry: boolean; lunge: 'safe' | 'blind' | 'never';
  /** A blind player's first press comes this late, so its presses fall anywhere against his beat. */
  offset?: number;
  /** Never presses the dash at all, not even for a drop. */
  noDash?: boolean;
  /**
   * A person, not a machine: each thing's reaction drawn from `reaction` (ms), a missed read of which lane now and then
   * (`miss`, the share) that comes `missDelay` late, and a drop's dash timed by eye at its front (the whole scene
   * builds to it, so it is not missed), off by up to `drift` ms either way. Seeded.
   */
  noise?: { seed: number; reaction: [number, number]; miss: number; missDelay: number; drift: number };
}

/** Where a timing player aims its dash at a drop's front: this long before it arrives, for the last-moment bonus. */
export const DROP_AIM_MS = 100;

/** A small seeded generator for the simulated person (never the fight's own numbers). */
function personRandom(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SimHazard {
  at: number; cue: number; fire: number; lasts: number; lane: Lane | 'both'; kind: HazardKind; parry: boolean;
  phase: number; step: number;
  /** When its step started. */
  start: number;
  resolved?: boolean;
  /** Gone with the stage when a wreck cleared it: it never reached anyone. */
  cleared?: boolean;
  /** This player's reaction to it, and when it would press for it if it is a drop. */
  react?: number;
  press?: number;
}

export interface SimResult {
  died: boolean;
  /** What hit it, if it died. */
  cause: SimHazard | null;
  /** When the fight ended (the ball wrecked) or the roach died, ms from the first beat. */
  endedAt: number;
  won: boolean;
  hazards: SimHazard[];
  steps: { step: Step; start: number; end: number }[];
  parries: number;
  hits: number;
  /** Damage dealt per phase. */
  dealt: number[];
  /** Drops bounced in their last moment. */
  tight: number;
}

const TICK = 5;

/**
 * Plays the fight against a player, on the director the fight uses. 'still' never moves; a lane stands there whatever
 * comes; a SimPlayer reads and answers. limitMs: when to give up on a fight that does not end.
 */
export function simulate(phases: Phase[], player: 'still' | Lane | SimPlayer, start: Lane, limitMs = 300000): SimResult {
  const director = new BigosDirector(phases);
  const p = typeof player === 'object' ? player : null;
  let lane: Lane = player === 'top' || player === 'bottom' ? player : start;
  const hazards: SimHazard[] = [];
  const steps: SimResult['steps'] = [];
  const dealt = [0, 0, 0];
  let parries = 0;
  let hits = 0;
  let press = -Infinity;
  let readyAt = 0;
  let lungeArrive: number | null = null;
  let lastPassed = -Infinity;
  let live: SimHazard[] = [];
  let stageEnd = 0;
  const result = (died: boolean, cause: SimHazard | null, at: number): SimResult =>
    ({ died, cause, endedAt: at, won: director.won, hazards, steps, parries, hits, dealt, tight });
  let tight = 0;
  const person = p?.noise ? personRandom(p.noise.seed) : null;
  /** This player's reaction to a thing, and, for a drop, when it presses: by eye at the front, not before seeing it. */
  const plan = (h: SimHazard): void => {
    if (!p) return;
    let react = p.reaction;
    let drift = 0;
    if (person && p.noise) {
      const [lo, hi] = p.noise.reaction;
      react = lo + (hi - lo) * person();
      if (person() < p.noise.miss && h.kind !== 'drop') react += p.noise.missDelay;
      drift = (person() * 2 - 1) * p.noise.drift;
    }
    h.react = react;
    if (h.kind === 'drop') h.press = Math.max(h.fire + react, h.at - DROP_AIM_MS + drift);
  };

  const begin = (at: number): void => {
    const step = director.next();
    const beats = stepBeats(step);
    steps.push({ step, start: at, end: at + beats * BEAT_MS });
    stageEnd = at + beats * BEAT_MS;
    if (step.kind !== 'attack') return;
    for (const h of timeAttack(step.attack).hazards) {
      const resolved: Lane | 'both' = h.lane === 'both' ? 'both' : director.ringLane(h.lane, lane);
      const sh: SimHazard = {
        at: at + h.t, cue: at + h.cue, fire: at + h.fire, lasts: h.lasts, lane: resolved, kind: h.kind, parry: h.parry,
        phase: step.phase, step: step.index, start: at,
      };
      plan(sh);
      hazards.push(sh);
      live.push(sh);
    }
  };

  const damage = (target: Target | null, base: number, now: number): boolean => {
    if (!target) return false;
    const phase = director.phase;
    const r = director.hit(target, base);
    dealt[phase] += r.dealt;
    if (r.wrecked && !r.won) {
      // The stage clears; the next phase after a breather, on a beat
      for (const h of live) if (!h.resolved) h.cleared = true;
      live = [];
      stageEnd = Math.ceil(now / BEAT_MS) * BEAT_MS + WRECK_BEATS * BEAT_MS;
    }
    return r.won;
  };

  const onLane = (h: SimHazard) => h.lane === 'both' || h.lane === lane;
  const dashing = (now: number) => now - press < DASH_MS;
  const ready = (now: number) => now >= readyAt;
  const dash = (now: number) => {
    if (p?.noDash) return;
    press = now;
    readyAt = now + DASH_CYCLE_MS;
    lungeArrive = now + LUNGE_OUT_MS;
  };
  const known = (h: SimHazard, now: number) => p !== null && now >= h.cue + (h.react ?? p.reaction);
  /** When this player presses for a drop's front: aimed at its last moment, never before it has seen it leave. */
  const dropPress = (h: SimHazard) => h.press ?? h.fire + p!.reaction;

  begin(0);
  for (let now = 0; now < limitMs; now += TICK) {
    if (live.length === 0 && now >= stageEnd) begin(stageEnd);

    // The player
    if (p) {
      const pending = live.filter(h => !h.resolved).sort((a, b) => a.at - b.at);
      const first = pending[0];
      let acted = false;
      if (first && onLane(first) && known(first, now) && now >= lastPassed + 20) {
        if (first.kind === 'drop') {
          if (!dashing(now) && ready(now) && now >= dropPress(first)) { dash(now); acted = true; }
        } else {
          const wantParry = p.parry && first.parry && !dashing(now);
          const parryAt = Math.max(first.fire + 30, first.cue + (first.react ?? p.reaction));
          const drop = pending.find(h => h.kind === 'drop' && known(h, now));
          const conflict = drop !== undefined && parryAt + DASH_CYCLE_MS > dropPress(drop);
          if (wantParry && !conflict && readyAt <= parryAt && parryAt <= first.at - 30) {
            if (now >= parryAt) { dash(now); acted = true; }
          } else if (!(dashing(now) && first.parry && lungeMeets(press, first.fire, first.at))) {
            lane = other(lane);
            acted = true;
          }
        }
      }
      if (!acted && p.lunge !== 'never' && !dashing(now)) {
        const target = director.lungeTarget(lane);
        if (p.lunge === 'blind' && ready(now) && now >= (p.offset ?? 0)) {
          dash(now);
        } else if (target === null && director.lungeTarget(other(lane)) !== null) {
          // Over to the lane it can hit from, when nothing it knows of is coming down that one soon
          const there = other(lane);
          if (!pending.some(h => (h.lane === there || h.lane === 'both') && h.at - now < 900)) lane = there;
        } else if (p.lunge === 'safe' && target !== null && ready(now)) {
          // Between his attacks: once everything he sent has gone past, before the next one shows
          if (pending.length === 0) dash(now);
        }
      }
    }

    if (lungeArrive !== null && now >= lungeArrive) {
      lungeArrive = null;
      const target = director.lungeTarget(lane);
      if (target) {
        hits++;
        if (damage(target, HIT_DAMAGE, now)) return result(false, null, now);
      }
    }

    // What reaches the roach
    for (const h of live) {
      if (h.resolved) continue;
      if (h.kind === 'light') {
        if (now < h.at) continue;
        if (onLane(h) && !dashing(now)) return result(true, h, now);
        if (now >= h.at + h.lasts) { h.resolved = true; lastPassed = h.at + h.lasts; }
        continue;
      }
      if (now < h.fire) continue;
      const x = 1 - (now - h.fire) / (h.at - h.fire);
      if (h.kind === 'drop') {
        // A front on both lanes: a dash that touches it (or starts inside it) bounces it, else it hits once it is in
        const touching = dashing(now) && (x <= 0 || lungeOffset(now - press, LUNGE_REACH_SHARE) >= x);
        if (!touching && now < h.at + h.lasts) continue;
        h.resolved = true;
        lastPassed = now;
        if (!touching) return result(true, h, now);
        director.dropBounced();
        parries++;
        const late = now >= h.at - DROP_TIGHT_MS;
        if (late) tight++;
        if (damage(director.parryTarget(lane), PARRY_DAMAGE + (late ? DROP_TIGHT_BONUS : 0), now)) return result(false, null, now);
        continue;
      }
      const r = dashing(now) ? lungeOffset(now - press, LUNGE_REACH_SHARE) : 0;
      if (r < x) continue;
      h.resolved = true;
      lastPassed = now;
      if (!onLane(h)) continue;
      if (!dashing(now)) return result(true, h, now);
      if (h.parry) {
        parries++;
        if (damage(director.parryTarget(lane), PARRY_DAMAGE, now)) return result(false, null, now);
      }
    }
    live = live.filter(h => !h.resolved || now < h.at + h.lasts);
  }
  return result(false, null, limitMs);
}
