/**
 * Zlewiatan's solo fight as numbers: what each head does, when it reaches the roach, what the roach's bullets, hops
 * and dash do to it, and the director that decides what comes next. Plain data and no Phaser, so the fight can be
 * simulated in tests: ZlewiatanSoloFight plays these same numbers and asks the director what comes next and what a hit
 * did. (A match still plays the old fight, ZlewiatanFight, whose HP the server owns.)
 *
 * Three heads on drain pipes, three health bars, and the player picks the order by where it stands: bullets fly along
 * the roach's lane and hit the head on it. With three heads that is the pierog on the top lane (it sits in front of the
 * tower block, which its own slabs sent back by a dash hurt) and the carp on the bottom. With two left there is always
 * one per lane: the pierog drops into the carp's place when the carp is gone. The last one moves to the middle and
 * fills both lanes.
 *
 * Each head has an attack for every tool: the block shoves a slab down the top lane (hop out, shoot it to pieces, or
 * dash into it and it goes back into the block); the carp spits fishbones a beat apart (hop, one bullet each, or dash
 * one back and hop the next), and from two heads on counted runs of them lane to lane; the pierog bounces cracklings
 * lane to lane like Pani Lodzia's curler, settling on the roach's lane and rolling at it (hop, shoot it, or smash it
 * back with a dash), and from two heads on throws boomerang pierogi out along the roach's lane and back along the other
 * into its own face, and sour cream that leaves a puddle. The last head throws radiators down both lanes at once, which
 * only a dash gets through. A head with no health left falls off and rolls at the roach, pass after pass, until it is
 * shot down or smashed; the last one takes the creature down with it.
 *
 * Built like the other bosses for a person seeing it the first time: one idea at a time (the next thing's first cue
 * only once the last threat has gone past), every attack aimed at the roach's lane when it starts, each attack taught
 * alone and slowly the first time. Every head lost makes the rest harder: they gain attacks and come closer together
 * (three heads, one attack at a time; two, call and response, boomerangs and runs of four; one, runs of five, its
 * attack grown a second part and the radiators). Nothing is ever refused: every bullet that reaches a head counts.
 */
export { fightRandom } from './lodziaPatterns';

export type Lane = 'top' | 'bottom';
export type Head = 'block' | 'pierog' | 'carp';
export type Rel = 'same' | 'other';

export const HEADS: readonly Head[] = ['block', 'pierog', 'carp'];
export const other = (lane: Lane): Lane => (lane === 'top' ? 'bottom' : 'top');
export const resolve = (rel: Rel, roachLane: Lane): Lane => (rel === 'same' ? roachLane : other(roachLane));

// ── The arena ───────────────────────────────────────────────────────

/**
 * Distances along a lane, world px from the roach, on a 16:9 screen (the fight measures its own and scales): where the
 * bullets stop on each head, where its shots leave from. The roach stands at 0, its pistol's muzzle a little ahead.
 */
export const REF = {
  muzzle: 40,
  front: { carp: 338, pierog: 395, block: 513 } as Record<Head, number>,
  /** Where a bottom-lane bullet glances off the pipes once the carp is gone. */
  pipes: 420,
  slab: 560,
  bone: 340,
  pierogi: 400,
  radiator: { block: 520, pierog: 420, carp: 340 } as Record<Head, number>,
  /** A loose head's first landing, in front of the body. */
  loose: 400,
};

/** The fight's pistol: a shot every SHOT_MS, the bullet flying this fast (px per ms). One damage a bullet. */
export const SHOT_MS = 250;
export const BULLET_SPEED = 1.2;
export const BULLET_DAMAGE = 1;

/** The dash, as Player has it: nothing hurts for 375 ms, the next one is ready 1575 ms after the press. */
export const DASH_MS = 375;
export const DASH_CYCLE_MS = 375 + 1200;
/** The lunge: out along the lane in this share of the dash, back in the rest; it reaches this far (px, at REF). */
export const LUNGE_OUT_SHARE = 0.45;
export const LUNGE_OUT_MS = DASH_MS * LUNGE_OUT_SHARE;
export const LUNGE_REACH = 240;

/** A hop: the roach changes lane at the press; drawn across in this long. */
export const HOP_MS = 100;
/** A prompt, once it shows, is pressed within this long by a person who has seen it. */
export const PROMPT_REACTION_MS = 400;

// ── Health and damage ───────────────────────────────────────────────

export const HEAD_HP: Record<Head, number> = { block: 66, pierog: 66, carp: 60 };
export const TOTAL_HP = HEAD_HP.block + HEAD_HP.pierog + HEAD_HP.carp;
/**
 * When a head falls off, the ones left are cranked back up to at least this share of their health, like DJ Bigos's
 * last speaker: three fifths with two left, three quarters for the last one, so every phase is fought.
 */
export const CRANK_SHARE = { two: 0.6, one: 0.75 };
export const crankHp = (head: Head, left: number): number => Math.round(HEAD_HP[head] * (left === 1 ? CRANK_SHARE.one : CRANK_SHARE.two));
/** Fallen off and rolling: what is left to shoot or smash. */
export const LOOSE_HP: Record<Head, number> = { block: 16, pierog: 14, carp: 12 };
/** A dash that meets the loose head smashes it for this, and knocks it back. */
export const SMASH_DAMAGE = 8;
/** Sent back by a dash: into the head that threw it. */
export const PARRY_DAMAGE = { slab: 12, bone: 4, radiator: 10, crackling: 4, pierogi: 6 } as const;
/** A boomerang (the pierog's pierogi, the lone block's slab) that came back along the other lane flies on into its
 * thrower's face. */
export const SMACK_DAMAGE = 10;
/** Bullets a slab takes before it breaks, a boomerang pieróg two; a fishbone or a rolling crackling one; a radiator stops
 * every bullet and never breaks. */
export const SLAB_HP = 3;
export const PIEROGI_HP = 2;

// ── Timings ─────────────────────────────────────────────────────────

/** A crackling bursts on its spot for this long; sour cream lies there as a puddle for this long. */
export const CRACKLING_MS = 150;
export const PUDDLE_MS = 1800;
/** The block alone: a slab past the roach comes back along the other lane this long after, and hits the block this
 * long after that. */
export const SLAB_BACK_MS = 1500;
export const SMACK_DELAY_MS = 900;
/** A crackling bounces this many times lane to lane (the roach's, the other, the roach's), on a steady beat, each leap
 * lower; the last landing is the settle, and from it the crackling rolls at the roach in a constant time. */
export const CRACKLING_LANDINGS = 3;
/** A head with no health left pops off and drops to the floor; then its passes. */
export const FALL_MS = 1000;
/** After a loose head has rolled past the roach it bounces back over to the right: the next pass this long after. */
export const PASS_BACK_MS = 800;
/** After a smash knocks it back, the next pass this long after. */
export const SMASH_BACK_MS = 1300;
/** After the last loose head is gone, the next phase this long after. */
export const BREATHER_MS = 1100;

interface SlabSpec { windup: number; travel: number }
interface BoneSpec { windup: number; travel: number; spacing: number }
interface LobSpec { windup: number; flight: number }
interface BounceSpec { windup: number; beat: number; settle: number }
interface BoomerangSpec { windup: number; travel: number; back: number }
interface RunSpec { count: number; windup: number; travel: number; spacing: number }
interface RadiatorSpec { build: number; firstBuild: number; travel: number }

/** Per phase (0: three heads, 1: two, 2: one) and the first time each is seen: slower, with a breather after. */
const SLAB: { teach: SlabSpec; phases: SlabSpec[] } = {
  teach: { windup: 750, travel: 2000 },
  phases: [{ windup: 600, travel: 1700 }, { windup: 500, travel: 1500 }, { windup: 500, travel: 1400 }],
};
const BONES: { teach: BoneSpec; phases: BoneSpec[] } = {
  teach: { windup: 650, travel: 1000, spacing: 700 },
  phases: [{ windup: 450, travel: 800, spacing: 650 }, { windup: 450, travel: 700, spacing: 600 }, { windup: 400, travel: 650, spacing: 650 }],
};
const BONE_COUNT = [2, 3, 3];
const LOB: { teach: LobSpec; phases: LobSpec[] } = {
  teach: { windup: 650, flight: 1300 },
  phases: [{ windup: 500, flight: 1100 }, { windup: 450, flight: 1000 }, { windup: 450, flight: 950 }],
};
/** The crackling's bounce: the settle a constant 700 ms from the roach while three heads are on, 600 after. */
const BOUNCE: { teach: BounceSpec; phases: BounceSpec[] } = {
  teach: { windup: 650, beat: 450, settle: 700 },
  phases: [{ windup: 500, beat: 450, settle: 700 }, { windup: 450, beat: 420, settle: 600 }, { windup: 400, beat: 400, settle: 600 }],
};
/** Boomerang pierogi: out along the roach's lane, back along the other `back` ms after passing it. */
const PIEROGI: { teach: BoomerangSpec; phases: BoomerangSpec[] } = {
  teach: { windup: 650, travel: 1200, back: 1500 },
  phases: [{ windup: 600, travel: 1100, back: 1500 }, { windup: 500, travel: 1000, back: 1400 }, { windup: 450, travel: 900, back: 1300 }],
};
/** Counted runs, lane to lane on a steady beat, from two heads on: four, then five. */
const RUN: RunSpec[] = [
  { count: 3, windup: 450, travel: 800, spacing: 700 },
  { count: 4, windup: 450, travel: 750, spacing: 650 },
  { count: 5, windup: 400, travel: 700, spacing: 600 },
];
const RADIATOR: { first: RadiatorSpec; later: RadiatorSpec } = {
  first: { build: 900, firstBuild: 1800, travel: 1300 },
  later: { build: 700, firstBuild: 1200, travel: 1100 },
};
/** The gap after a step, by phase: a moment to shoot. After the first of anything, this long instead. */
const GAP = [420, 340, 280];
const TEACH_GAP = 600;
/** The puddle's trap with the block: two slabs, closer than the dash comes back. */
const TRAP_SLAB_SPACING = 1000;
/** A rest: nothing comes, by phase. The opening one is longer and asks for the gun. */
const REST = [700, 550, 400];
const OPENING_MS = 1500;

/** Each head's passes once it has fallen off: the block drops and rolls straight, slow and heavy; the pierog bounces
 * lane to lane like a curler and settles; the carp flops fast, lane to lane. `beat`: between landings; `settle`: from
 * the last landing (where it settles on the roach's lane: the cue) to the roach. */
export const PASS: Record<Head, { landings: number; beat: number; settle: number }> = {
  block: { landings: 1, beat: 900, settle: 1500 },
  pierog: { landings: 3, beat: 450, settle: 700 },
  carp: { landings: 4, beat: 340, settle: 520 },
};

// ── Hazards and steps ───────────────────────────────────────────────

export type HazardKind = 'slab' | 'bone' | 'crackling' | 'cream' | 'radiator' | 'pierogi' | 'head';

export interface Landing { at: number; lane: Lane; x: number }

export interface Hazard {
  kind: HazardKind;
  /** Who threw it (a loose head: itself). */
  head: Head;
  lane: Lane;
  /** ms from the step's start: the thrower starts its wind-up. */
  tell: number;
  /** When a player can first read where it will be: the wind-up for what flies along a lane, the shadow for a lob,
   * a loose head's settle. */
  cue: number;
  /** It leaves the mouth (what flies), or is lobbed (a shadow appears where it lands). */
  fire: number;
  /** It reaches the roach's spot. */
  t: number;
  /** It stays dangerous this long after t (a crackling bursting; sour cream's puddle). */
  lasts: number;
  /** What flies along the lane: px from the roach where it starts (at fire). A loose head: where it settles (at cue). */
  from: number;
  /** Bullets it takes to break: 0, bullets do not meet it; Infinity, it stops them and never breaks. */
  hp: number;
  /** A dash that meets it sends it back for this much into its thrower (0: it can't be sent back). */
  parry: number;
  /** A boomerang coming back from behind along the other lane (cannot be shot or sent back). */
  returning?: boolean;
  /** The returning boomerang hits its thrower this long after its t. */
  smackAt?: number;
  /** A crackling bouncing lane to lane: in the air until its last landing, then rolling at the roach from `from`. */
  bounce?: boolean;
  /** Its place in a counted run, from 1. */
  count?: number;
  /** A loose head (its passes); bullets on its lane hit it while it rolls; a dash smashes it. */
  loose?: boolean;
  /** Where it comes down on the way (a loose head's bounces, a walking line's lobs), for the looks. */
  landings?: Landing[];
  /** Sour cream: the spot (the roach's lane) is closed from t for `lasts`. */
  puddle?: boolean;
}

export type AttackKind = 'slab' | 'bones' | 'crackling' | 'cream' | 'pair' | 'boomerang' | 'volley' | 'pierogi' | 'run' | 'radiators';
export type StepKind = 'rest' | 'attack' | 'fall' | 'pass';
export type PromptKey = 'shoot' | 'parry' | 'radiator' | 'smash';

export interface Step {
  kind: StepKind;
  phase: number;
  index: number;
  /** How long it holds the stage, its gap included. */
  ms: number;
  hazards: Hazard[];
  attack?: AttackKind;
  /** A fall or a pass: whose. */
  head?: Head;
  /** A pass: which, from 0. */
  pass?: number;
  /** Radiators in the volley. */
  count?: number;
  /** The first time this is seen: slower, and maybe a prompt. */
  first?: boolean;
  /** Its keycap, the first time. */
  prompt?: PromptKey;
}

const lastOf = (hazards: Hazard[]): number => Math.max(0, ...hazards.map(h => h.t + h.lasts + (h.smackAt ?? 0)));

/** The block's slab down the top lane, from `start` ms. */
function slab(start: number, spec: SlabSpec): Hazard {
  const fire = start + spec.windup;
  return {
    kind: 'slab', head: 'block', lane: 'top', tell: start, cue: start, fire, t: fire + spec.travel, lasts: 0,
    from: REF.slab, hp: SLAB_HP, parry: PARRY_DAMAGE.slab,
  };
}

/** The carp's fishbones, one wind-up each, `spacing` apart, on these lanes. */
function bones(start: number, lanes: Lane[], spec: BoneSpec): Hazard[] {
  return lanes.map((lane, i) => {
    const cue = start + i * spec.spacing;
    const fire = cue + spec.windup;
    return {
      kind: 'bone', head: 'carp', lane, tell: cue, cue, fire, t: fire + spec.travel, lasts: 0, from: REF.bone,
      hp: 1, parry: PARRY_DAMAGE.bone,
    } as Hazard;
  });
}

/** The pierog lobs onto the roach's spot on `lane`: the shadow shows from the lob; a crackling, or sour cream. */
function lob(start: number, lane: Lane, spec: LobSpec, cream: boolean): Hazard {
  const fire = start + spec.windup;
  return {
    kind: cream ? 'cream' : 'crackling', head: 'pierog', lane, tell: start, cue: fire, fire, t: fire + spec.flight,
    lasts: cream ? PUDDLE_MS : CRACKLING_MS, from: 0, hp: 0, parry: 0, puddle: cream || undefined,
  };
}

/**
 * The pierog's crackling, bounced at the roach like Pani Lodzia's curler: it leaves the mouth, lands on the roach's lane,
 * the other, and the roach's again on a steady beat, each leap lower, a step closer each time; the third landing is the
 * settle and the cue, and it rolls flat at the roach from there in `settle` ms.
 */
function bouncer(start: number, roachLane: Lane, spec: BounceSpec): Hazard {
  const fire = start + spec.windup;
  const settleAt = fire + CRACKLING_LANDINGS * spec.beat;
  const t = settleAt + spec.settle;
  const speed = REF.loose / (t - fire - spec.beat);
  const landings = Array.from({ length: CRACKLING_LANDINGS }, (_, k): Landing => ({
    at: fire + (k + 1) * spec.beat, lane: (CRACKLING_LANDINGS - 1 - k) % 2 === 0 ? roachLane : other(roachLane),
    x: Math.round(REF.loose - speed * k * spec.beat),
  }));
  return {
    kind: 'crackling', head: 'pierog', lane: roachLane, tell: start, cue: settleAt, fire, t, lasts: 0,
    from: Math.round(speed * spec.settle), hp: 1, parry: PARRY_DAMAGE.crackling, bounce: true, landings,
  };
}

/** A boomerang: out along `lane`, off the left edge and back along the other one, then into its thrower's face. */
function boomerang(out: Hazard, back: number): Hazard[] {
  const ret: Hazard = { ...out, lane: other(out.lane), cue: out.t, t: out.t + back, returning: true, hp: 0, parry: 0, smackAt: SMACK_DELAY_MS };
  return [out, ret];
}

/** The pierog's boomerang pieróg, out along the roach's lane. */
function pierogi(start: number, roachLane: Lane, spec: BoomerangSpec): Hazard[] {
  const fire = start + spec.windup;
  return boomerang({
    kind: 'pierogi', head: 'pierog', lane: roachLane, tell: start, cue: start, fire, t: fire + spec.travel, lasts: 0,
    from: REF.pierogi, hp: PIEROGI_HP, parry: PARRY_DAMAGE.pierogi,
  }, spec.back);
}

/** A counted run lane to lane: the first at the roach, then never three on one lane in a row, one a beat. */
function runLanes(count: number, roachLane: Lane, rand: () => number): Lane[] {
  const lanes: Lane[] = [roachLane];
  let streak = 1;
  for (let i = 1; i < count; i++) {
    const stay = streak < 2 && rand() < 0.3;
    const lane = stay ? lanes[i - 1] : other(lanes[i - 1]);
    streak = stay ? streak + 1 : 1;
    lanes.push(lane);
  }
  return lanes;
}

/** A run thrown by `head`: its fishbones (the carp), straight pierogi (the pierog), slabs (the block). */
function run(start: number, head: Head, lanes: Lane[], spec: RunSpec): Hazard[] {
  return lanes.map((lane, i) => {
    const cue = start + i * spec.spacing;
    const fire = cue + spec.windup;
    const kind: HazardKind = head === 'carp' ? 'bone' : head === 'pierog' ? 'pierogi' : 'slab';
    const travel = kind === 'slab' ? spec.travel + 400 : spec.travel;
    return {
      kind, head, lane, tell: cue, cue, fire, t: fire + travel, lasts: 0,
      from: kind === 'bone' ? REF.bone : kind === 'pierogi' ? REF.pierogi : REF.slab,
      hp: kind === 'bone' ? 1 : kind === 'pierogi' ? PIEROGI_HP : SLAB_HP, parry: PARRY_DAMAGE[kind], count: i + 1,
    } as Hazard;
  });
}

/** Radiators down both lanes at once, `count` of them one after another, each built up on the head first. */
function radiators(start: number, head: Head, count: number, spec: RadiatorSpec): Hazard[] {
  const out: Hazard[] = [];
  let cue = start;
  for (let i = 0; i < count; i++) {
    const fire = cue + (i === 0 ? spec.firstBuild : spec.build);
    const t = fire + spec.travel;
    for (const lane of ['top', 'bottom'] as Lane[]) {
      out.push({
        kind: 'radiator', head, lane, tell: cue, cue, fire, t, lasts: 0, from: REF.radiator[head], hp: Infinity,
        parry: PARRY_DAMAGE.radiator,
      });
    }
    cue = t + 100;
  }
  return out;
}

/** A loose head's pass at the roach on `lane`: its landings on a steady beat, the last on the roach's lane, then the
 * roll at it. `lanes`: where each landing comes down. */
function pass(head: Head, lanes: Lane[]): Hazard {
  const p = PASS[head];
  const settleAt = p.landings * p.beat;
  const t = settleAt + p.settle;
  // From its first landing in front of the body to the roach at one speed, so every landing is a step closer
  const speed = REF.loose / (t - p.beat);
  const landings = lanes.map((lane, k): Landing => ({ at: (k + 1) * p.beat, lane, x: Math.round(REF.loose - speed * k * p.beat) }));
  const lane = lanes[lanes.length - 1];
  // Readable from the moment the shadow of its last landing shows: as it leaves (the block), or as it comes down on
  // the landing before
  return {
    kind: 'head', head, lane, tell: 0, cue: (p.landings - 1) * p.beat, fire: 0, t, lasts: 0,
    from: Math.round(speed * p.settle), hp: 0, parry: 0, loose: true, landings,
  };
}

/** Where a loose head comes down, pass by pass: the block always on the roach's lane; the pierog the roach's, the
 * other, the roach's; the carp flops lane to lane, never three on one, ending on the roach's. */
function passLanes(head: Head, roachLane: Lane, rand: () => number): Lane[] {
  const p = PASS[head];
  if (head === 'block') return [roachLane];
  if (head === 'pierog') return Array.from({ length: p.landings }, (_, k) => ((p.landings - 1 - k) % 2 === 0 ? roachLane : other(roachLane)));
  const lanes: Lane[] = [roachLane];
  let streak = 1;
  for (let k = 1; k < p.landings; k++) {
    // Built backwards from the roach's lane
    const stay = streak < 2 && rand() < 0.35;
    const prev = lanes[0];
    const lane = stay ? prev : other(prev);
    streak = stay ? streak + 1 : 1;
    lanes.unshift(lane);
  }
  return lanes;
}

// ── The director ────────────────────────────────────────────────────

type Slot =
  | { kind: 'rest'; ms: number; prompt?: PromptKey }
  | { kind: 'teach' }
  /** The head on the roach's lane attacks it. */
  | { kind: 'lane' }
  /** The pierog lobs at the roach (if it is still on the body; else the head on the roach's lane). */
  | { kind: 'pierog' }
  | { kind: 'cream' }
  | { kind: 'pair' }
  | { kind: 'signature' }
  | { kind: 'pierogi' }
  | { kind: 'run' }
  | { kind: 'radiators'; count: number };

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export type Target = Head | 'loose';

export interface HitResult {
  dealt: number;
  /** A head that just ran out of health and falls off now. */
  fell: Head | null;
  /** The loose head shot down or smashed for good. */
  destroyed: Head | null;
  won: boolean;
  /** Heads still on the body that a fall cranked back up (crankHp). */
  cranked?: Head[];
}

/**
 * What comes next, and what a hit does: the fight and the simulation both run on this. The fight asks `next` each time
 * the stage is free (with the lane the roach is on), and tells it every hit. A head falling, or a loose head smashed,
 * ends the step in progress: the caller drops what it still had coming and asks again.
 */
export class ZlewiatanDirector {
  readonly hp: Record<Head, number> = { ...HEAD_HP };
  /** The head off the body and rolling (or about to drop), and what is left of it. */
  loose: { head: Head; hp: number; passes: number; fallen: boolean } | null = null;
  /** Heads that ran out while another was loose: they fall in turn. */
  private waiting: Head[] = [];
  private readonly gone = new Set<Head>();
  /** 0: three heads on the body, 1: two, 2: one. */
  phase = 0;
  private queue: Slot[];
  private readonly taught = new Set<string>();
  private index = 0;
  private breather = false;
  private radiatorsSeen = false;

  constructor(private readonly rand: () => number) {
    this.queue = this.intro(0);
  }

  onBody(head: Head): boolean { return this.hp[head] > 0; }
  get bodyHeads(): Head[] { return HEADS.filter(h => this.onBody(h)); }
  get won(): boolean { return this.gone.size === HEADS.length; }
  isGone(head: Head): boolean { return this.gone.has(head); }

  /** While a head is off and rolling, the ones left duck into the drain and hold their fire: one idea at a time. */
  get ducked(): boolean { return this.loose !== null; }

  /**
   * What a bullet on this lane hits on the body. Three heads: the pierog on the top lane (in front of the block), the carp
   * on the bottom. Two: one each, the block or the pierog on top, the carp or the pierog (dropped into its place) below.
   * One: it sits in the middle and fills both lanes. Ducked, nothing: the loose head is the one thing to shoot.
   */
  frontTarget(lane: Lane): Head | null {
    if (this.ducked) return null;
    const heads = this.bodyHeads;
    if (heads.length === 1) return heads[0];
    if (heads.length === 3) return lane === 'top' ? 'pierog' : 'carp';
    if (lane === 'top') return this.onBody('block') ? 'block' : 'pierog';
    return this.onBody('carp') ? 'carp' : 'pierog';
  }

  /** The head whose own lane this is, the one that attacks a roach standing on it. */
  laneHead(lane: Lane): Head | null {
    const heads = this.bodyHeads;
    if (heads.length === 1) return heads[0];
    if (lane === 'top') return this.onBody('block') ? 'block' : this.onBody('pierog') ? 'pierog' : null;
    return this.onBody('carp') ? 'carp' : this.onBody('pierog') ? 'pierog' : null;
  }

  private intro(phase: number): Slot[] {
    if (phase === 0) return [{ kind: 'rest', ms: OPENING_MS, prompt: 'shoot' }, { kind: 'teach' }];
    if (phase === 1) {
      const out: Slot[] = [{ kind: 'pair' }, { kind: 'rest', ms: REST[1] }, { kind: 'run' }, { kind: 'rest', ms: REST[1] }];
      if (this.onBody('pierog')) out.push({ kind: 'pierogi' }, { kind: 'rest', ms: REST[1] }, { kind: 'cream' }, { kind: 'rest', ms: REST[1] });
      return out;
    }
    return [{ kind: 'radiators', count: 1 }, { kind: 'rest', ms: REST[2] }, { kind: 'signature' }, { kind: 'rest', ms: REST[2] },
      { kind: 'run' }, { kind: 'rest', ms: REST[2] }];
  }

  private loop(phase: number): Slot[] {
    const rest: Slot = { kind: 'rest', ms: REST[phase] };
    if (phase === 0) {
      return shuffle<Slot>([{ kind: 'lane' }, { kind: 'lane' }, { kind: 'pierog' }, { kind: 'pierog' }], this.rand).flatMap(s => [s, rest]);
    }
    if (phase === 1) {
      const pierog = this.onBody('pierog');
      const slots: Slot[] = [{ kind: 'pair' }, { kind: 'pair' }, { kind: 'run' },
        pierog ? { kind: 'pierogi' } : { kind: 'lane' }, pierog ? { kind: 'cream' } : { kind: 'run' }];
      return shuffle<Slot>(slots, this.rand).flatMap(s => [s, rest]);
    }
    const count = 2 + (this.rand() < 0.5 ? 1 : 0);
    return [{ kind: 'signature' }, rest, { kind: 'run' }, rest, { kind: 'radiators', count }, rest, { kind: 'lane' }, { kind: 'run' }, rest,
      { kind: 'signature' }, { kind: 'run' }, rest, { kind: 'radiators', count: 5 - count }, rest];
  }

  /** The next step, aimed at the roach on `roachLane`. */
  next(roachLane: Lane): Step {
    const index = this.index++;
    const phase = this.phase;
    if (this.loose) {
      const loose = this.loose;
      if (!loose.fallen) {
        loose.fallen = true;
        return { kind: 'fall', phase, index, ms: FALL_MS, hazards: [], head: loose.head };
      }
      const hazard = pass(loose.head, passLanes(loose.head, roachLane, this.rand));
      const n = loose.passes++;
      const first = !this.taught.has('smash');
      this.taught.add('smash');
      return {
        kind: 'pass', phase, index, ms: hazard.t + PASS_BACK_MS, hazards: [hazard], head: loose.head, pass: n, first,
        prompt: first ? 'smash' : undefined,
      };
    }
    if (this.breather) {
      this.breather = false;
      return { kind: 'rest', phase, index, ms: BREATHER_MS, hazards: [] };
    }
    for (let guard = 0; guard < 8; guard++) {
      if (!this.queue.length) this.queue = this.loop(phase);
      const slot = this.queue[0];
      const step = this.play(slot, roachLane, index);
      // A teaching slot stays until every attack of phase one has been seen
      if (slot.kind !== 'teach' || this.taughtAll()) this.queue.shift();
      if (step) return step;
    }
    return { kind: 'rest', phase, index, ms: REST[phase], hazards: [] };
  }

  private taughtAll(): boolean {
    return this.taught.has('slab') && this.taught.has('bones') && this.taught.has('crackling');
  }

  private play(slot: Slot, roachLane: Lane, index: number): Step | null {
    const phase = this.phase;
    const mk = (attack: AttackKind, hazards: Hazard[], first: boolean, extra: Partial<Step> = {}): Step => ({
      kind: 'attack', phase, index, attack, hazards, first,
      ms: lastOf(hazards) + (first ? TEACH_GAP : GAP[phase]), ...extra,
    });
    switch (slot.kind) {
      case 'rest':
        return { kind: 'rest', phase, index, ms: slot.ms, hazards: [], prompt: slot.prompt, first: slot.prompt !== undefined };
      case 'teach': {
        const head = this.laneHead(roachLane);
        const kind = head === 'block' ? 'slab' : head === 'carp' ? 'bones' : 'crackling';
        if (head && !this.taught.has(kind)) return this.single(head, roachLane, index, true);
        if (this.taughtAll()) return null;
        // The pierog's crackling, taught; then the head of the other lane shows its attack down its own lane, slowly,
        // even if the roach (having smashed the crackling instead of hopping it) is not standing there
        if (!this.taught.has('crackling')) return this.single('pierog', roachLane, index, true);
        const there = this.laneHead(other(roachLane));
        return there ? this.single(there, other(roachLane), index, true) : null;
      }
      case 'lane': {
        const head = this.laneHead(roachLane);
        // The block alone, with the roach down on the bottom lane: the slab that comes back is the one that reaches it
        if (head === 'block' && roachLane === 'bottom' && this.bodyHeads.length === 1) return this.signature(roachLane, index);
        return head ? this.single(head, roachLane, index, false) : null;
      }
      case 'pierog':
        return this.onBody('pierog') ? this.single('pierog', roachLane, index, false) : this.play({ kind: 'lane' }, roachLane, index);
      case 'cream': {
        if (!this.onBody('pierog')) return null;
        const first = !this.taught.has('cream');
        this.taught.add('cream');
        const spec = first ? LOB.teach : LOB.phases[phase];
        const cream = lob(0, roachLane, spec, true);
        const hazards = [cream];
        // Then the head of the lane the roach had to go to, while the puddle keeps it from coming back: more than one
        // dash can send back (two slabs, three fishbones), so the gun has to answer; never anything only a hop would
        const there = other(roachLane);
        const answer = there === 'top' ? (this.onBody('block') ? 'block' : null) : (this.onBody('carp') ? 'carp' : null);
        if (answer && !first) {
          const start = cream.t;
          if (answer === 'block') {
            const spec = SLAB.phases[phase];
            hazards.push(slab(start, spec), slab(start + TRAP_SLAB_SPACING, spec));
          } else hazards.push(...bones(start, [there, there, there], BONES.phases[phase]));
        }
        return mk('cream', hazards, first);
      }
      case 'pair':
        return this.pair(roachLane, index);
      case 'pierogi': {
        if (!this.onBody('pierog')) return null;
        const first = !this.taught.has('pierogi');
        this.taught.add('pierogi');
        return mk('pierogi', pierogi(0, roachLane, first ? PIEROGI.teach : PIEROGI.phases[phase]), first, { head: 'pierog' });
      }
      case 'run': {
        const heads = this.bodyHeads;
        const head = heads.includes('carp') ? 'carp' : heads.includes('pierog') ? 'pierog' : 'block';
        const spec = RUN[phase];
        const first = !this.taught.has('run');
        this.taught.add('run');
        return mk('run', run(0, head, runLanes(spec.count, roachLane, this.rand), first ? { ...spec, spacing: spec.spacing + 150 } : spec), first,
          { head, count: spec.count });
      }
      case 'signature':
        return this.signature(roachLane, index);
      case 'radiators': {
        const head = this.bodyHeads[0];
        const first = !this.radiatorsSeen;
        this.radiatorsSeen = true;
        const hazards = radiators(0, head, slot.count, first ? RADIATOR.first : RADIATOR.later);
        return mk('radiators', hazards, first, { count: slot.count, head, prompt: first ? 'radiator' : undefined });
      }
    }
  }

  /** One head's attack at the roach. */
  private single(head: Head, roachLane: Lane, index: number, teach: boolean): Step {
    const phase = this.phase;
    const kind: AttackKind = head === 'block' ? 'slab' : head === 'carp' ? 'bones' : 'crackling';
    const first = teach && !this.taught.has(kind);
    this.taught.add(kind);
    const hazards = this.attackOf(head, roachLane, 0, first);
    return {
      kind: 'attack', phase, index, attack: kind, hazards, first, head,
      ms: lastOf(hazards) + (first ? TEACH_GAP : GAP[phase]), prompt: first && kind === 'slab' ? 'parry' : undefined,
    };
  }

  /** What a head throws at `lane` from `start`. The block's slab only ever comes down the top lane, the carp's bones the
   * bottom one while another head is on the body. */
  private attackOf(head: Head, lane: Lane, start: number, teach: boolean): Hazard[] {
    const phase = this.phase;
    if (head === 'block') return [slab(start, teach ? SLAB.teach : SLAB.phases[phase])];
    if (head === 'carp') {
      const count = teach ? 1 : BONE_COUNT[phase];
      // The carp spits along the roach's lane; with the pierog in its place below, the block's slab stays on top
      return bones(start, Array.from({ length: count }, () => lane), teach ? BONES.teach : BONES.phases[phase]);
    }
    return [bouncer(start, lane, teach ? BOUNCE.teach : BOUNCE.phases[phase])];
  }

  /** Two heads: the one on the roach's lane attacks; once it has gone past, the other answers on the other lane. */
  private pair(roachLane: Lane, index: number): Step | null {
    const phase = this.phase;
    const call = this.laneHead(roachLane);
    if (!call) return null;
    const first = !this.taught.has('pair');
    this.taught.add('pair');
    const a = this.attackOf(call, roachLane, 0, false);
    const there = other(roachLane);
    const answerer = this.laneHead(there);
    const hazards = a.slice();
    if (answerer && (answerer !== call || call === 'pierog')) {
      // The first time, a beat more between them
      hazards.push(...this.attackOf(answerer, there, lastOf(a) + (first ? 300 : 0), false));
    }
    return {
      kind: 'attack', phase, index, attack: 'pair', hazards, first,
      ms: lastOf(hazards) + (first ? TEACH_GAP : GAP[phase]),
    };
  }

  /** One head left: its attack grows a second part. */
  private signature(roachLane: Lane, index: number): Step {
    const phase = this.phase;
    const head = this.bodyHeads[0];
    const first = !this.taught.has(`sig-${head}`);
    this.taught.add(`sig-${head}`);
    let hazards: Hazard[];
    let attack: AttackKind;
    if (head === 'block') {
      // Out along the top lane, off the left edge and back along the bottom one, into the block's face
      attack = 'boomerang';
      hazards = boomerang(slab(0, first ? SLAB.teach : SLAB.phases[2]), SLAB_BACK_MS);
    } else if (head === 'carp') {
      attack = 'volley';
      const spec = first ? { ...BONES.phases[2], spacing: 800, travel: 800 } : BONES.phases[2];
      hazards = bones(0, [roachLane, other(roachLane), roachLane], spec);
    } else {
      // A boomerang pieróg, and as it comes back a crackling bounced at the lane it left the roach on
      attack = 'pierogi';
      const a = pierogi(0, roachLane, first ? PIEROGI.teach : PIEROGI.phases[2]);
      hazards = [...a, bouncer(a[1].t, roachLane, BOUNCE.phases[2])];
    }
    return { kind: 'attack', phase, index, attack, hazards, first, head, ms: lastOf(hazards) + (first ? TEACH_GAP : GAP[2]) };
  }

  /** Damage to a head on the body or to the loose one; what it did. */
  hit(target: Target, base: number): HitResult {
    const none: HitResult = { dealt: 0, fell: null, destroyed: null, won: this.won };
    if (this.won) return none;
    if (target === 'loose') {
      const loose = this.loose;
      if (!loose || !loose.fallen || loose.hp <= 0) return none;
      const dealt = Math.min(loose.hp, base);
      loose.hp -= dealt;
      if (loose.hp > 0) return { dealt, fell: null, destroyed: null, won: false };
      this.gone.add(loose.head);
      const destroyed = loose.head;
      const nextHead = this.waiting.shift();
      this.loose = nextHead ? { head: nextHead, hp: LOOSE_HP[nextHead], passes: 0, fallen: false } : null;
      if (!this.loose && !this.won) {
        this.phase = HEADS.length - this.bodyHeads.length;
        this.queue = this.intro(this.phase);
        this.breather = true;
      }
      return { dealt, fell: null, destroyed, won: this.won };
    }
    if (this.hp[target] <= 0) return none;
    const dealt = Math.min(this.hp[target], base);
    this.hp[target] -= dealt;
    if (this.hp[target] > 0) return { dealt, fell: null, destroyed: null, won: false };
    // The last head: no roll, it takes the whole creature down with it
    if (this.bodyHeads.length === 0 && !this.loose && !this.waiting.length) {
      for (const head of HEADS) this.gone.add(head);
      return { dealt, fell: null, destroyed: target, won: true };
    }
    // Off it comes: it rolls at the roach until it is gone for good. One at a time: a head run out while another is
    // loose waits for its turn
    if (this.loose) this.waiting.push(target);
    else this.loose = { head: target, hp: LOOSE_HP[target], passes: 0, fallen: false };
    // The others take it badly: what they took stays taken, down to half, so every phase is fought
    const cranked: Head[] = [];
    const left = this.bodyHeads;
    for (const head of left) {
      const floor = crankHp(head, left.length);
      if (this.hp[head] < floor) {
        this.hp[head] = floor;
        cranked.push(head);
      }
    }
    return { dealt, fell: target, destroyed: null, won: false, cranked };
  }
}

// ── The lunge ───────────────────────────────────────────────────────

/** The lunge's offset from the roach's spot, px, `dt` ms after the press. */
export function lungeOffset(dt: number, reach = LUNGE_REACH): number {
  if (dt < 0 || dt >= DASH_MS) return 0;
  if (dt < LUNGE_OUT_MS) {
    const k = dt / LUNGE_OUT_MS;
    return reach * (1 - (1 - k) * (1 - k));
  }
  const back = (dt - LUNGE_OUT_MS) / (DASH_MS - LUNGE_OUT_MS);
  return reach * (0.5 + 0.5 * Math.cos(Math.PI * back));
}

/** Where something flying at the roach is at `now` (px from the roach), from `from` at `fire` to 0 at `arrive`. */
export function flyX(from: number, fire: number, arrive: number, now: number): number {
  return from * (1 - (now - fire) / Math.max(1, arrive - fire));
}

/**
 * Whether a dash pressed at `press` meets something that leaves `from` px away at `fire` and reaches the roach at
 * `arrive`, while the dash protects: the lunge runs out to meet it, or it arrives on the roach mid-dash.
 */
export function lungeMeets(press: number, from: number, fire: number, arrive: number, reach = LUNGE_REACH): boolean {
  for (let t = Math.max(press, fire); t <= Math.min(press + DASH_MS - 1, arrive); t += 1) {
    if (lungeOffset(t - press, reach) >= flyX(from, fire, arrive, t)) return true;
  }
  return false;
}

/** The earliest press that meets it (see lungeMeets), or null if none before it arrives. */
export function earliestMeet(from: number, fire: number, arrive: number, reach = LUNGE_REACH): number | null {
  for (let p = Math.round(fire - DASH_MS); p <= arrive; p += 5) if (lungeMeets(p, from, fire, arrive, reach)) return p;
  return null;
}

/** When a loose head or a bounced crackling settles on the roach's lane and starts rolling at it: its last landing. */
export function rollStart(h: Hazard): number {
  return h.landings![h.landings!.length - 1].at;
}

// ── Prompts ─────────────────────────────────────────────────────────

/**
 * A keycap prompt: shown over the roach from `from` to `to` (ms from its step's start), only while pressing is right
 * then (the fight checks the roach's lane, the dash being ready, a head to shoot). `meet`: what the dash it asks for
 * must meet; null for the gun's.
 */
export interface Prompt {
  key: PromptKey;
  from: number;
  to: number;
  meet: { from: number; fire: number; arrive: number } | null;
  until: number;
}

/** How long a dash prompt shows at most. */
const PROMPT_SHOW_MS = 300;

/** The prompt a step carries the first time its kind comes (the director marks which). */
export function promptFor(step: Step): Prompt | null {
  if (!step.prompt) return null;
  if (step.prompt === 'shoot') {
    // Any press while it shows lands a bullet on a head before the rest is over
    const travel = REF.front.block / BULLET_SPEED;
    return { key: 'shoot', from: 0, to: step.ms - PROMPT_REACTION_MS - travel - 50, meet: null, until: step.ms };
  }
  const h = step.prompt === 'radiator' ? step.hazards[0] : step.hazards.find(x => x.kind === 'slab' || x.kind === 'head');
  if (!h) return null;
  const fire = h.loose || h.bounce ? rollStart(h) : h.fire;
  const from = h.from;
  const earliest = earliestMeet(from, fire, h.t);
  if (earliest === null) return null;
  // From the moment a press would meet it, gone early enough that a press PROMPT_REACTION_MS after its last moment
  // still comes before it arrives
  const start = Math.max(earliest, h.cue);
  const to = Math.min(start + PROMPT_SHOW_MS, h.t - PROMPT_REACTION_MS - 30);
  if (to < start) return null;
  return { key: step.prompt, from: start, to, meet: { from, fire, arrive: h.t }, until: step.ms };
}

// ── Simulation ──────────────────────────────────────────────────────

/**
 * A simulated player. reaction: ms from a thing's first readable cue to answering it; one thing at a time (never
 * before the one ahead of it has gone past). shoot: 'aimed' fires at heads and at what it means to shoot down, holding
 * fire for what it means to send back; 'blind' fires every time the gun is ready; 'never'. parry: dashes into what can
 * be sent back. dash: 'never' never presses it; 'spam' presses it the moment it is back.
 */
export interface SimPlayer {
  reaction: number;
  shoot: 'aimed' | 'blind' | 'never';
  parry: boolean;
  dash?: 'normal' | 'never' | 'spam';
  /** Only hops: never shoots or dashes at a loose head (it still shoots heads on the body if `shoot` says so). */
  dodgeLoose?: boolean;
  /** A spammer's first press comes this late. */
  offset?: number;
}

export interface SimHazard extends Hazard {
  step: number; phase: number;
  /** Absolute times (the Hazard's are from the step's start). */
  start: number;
  resolved?: boolean;
  /** Bullets it has taken. */
  taken?: number;
  /** A loose head's roll was knocked back (smashed). */
  smashed?: boolean;
  /** Still on its way when its step was cut short (a head fell, a loose head went): it never came. */
  dropped?: boolean;
}

export interface SimResult {
  died: boolean;
  cause: SimHazard | null;
  endedAt: number;
  won: boolean;
  hazards: SimHazard[];
  steps: { step: Step; start: number }[];
  parries: number;
  smashes: number;
  bullets: number;
  /** Damage by head (body and loose together) and by source. */
  dealt: Record<Head, number>;
  bySource: { bullet: number; parry: number; smash: number; smack: number };
  /** When each head fell off and when it was gone for good. */
  fell: Partial<Record<Head, number>>;
  destroyed: Partial<Record<Head, number>>;
}

const TICK = 5;

/** Absolute hazard times from a step's start. */
function place(h: Hazard, at: number, step: Step): SimHazard {
  return {
    ...h, tell: at + h.tell, cue: at + h.cue, fire: at + h.fire, t: at + h.t, start: at, step: step.index, phase: step.phase,
    landings: h.landings?.map(l => ({ ...l, at: at + l.at })),
  };
}

/** Where a hazard is along the lane now (px), if it is on the lane and in a bullet's way; null otherwise. */
export function laneX(h: SimHazard | Hazard, now: number): number | null {
  if (h.loose || h.bounce) {
    const from = rollStart(h);
    if (now < from || now > h.t) return null;
    return flyX(h.from, from, h.t, now);
  }
  if (h.kind === 'cream' || h.returning) return null;
  if (now < h.fire || now > h.t) return null;
  return flyX(h.from, h.fire, h.t, now);
}

/**
 * Plays the fight against a player, on the director the fight uses. 'still' never moves; a lane stands there whatever
 * comes; a SimPlayer reads and answers. limitMs: when to give up on a fight that does not end.
 */
export function simulate(rand: () => number, player: 'still' | Lane | SimPlayer, start: Lane, limitMs = 240000): SimResult {
  const director = new ZlewiatanDirector(rand);
  const p = typeof player === 'object' ? player : null;
  const dashMode = p?.dash ?? 'normal';
  let lane: Lane = player === 'top' || player === 'bottom' ? player : start;
  const hazards: SimHazard[] = [];
  const steps: SimResult['steps'] = [];
  const dealt: Record<Head, number> = { block: 0, pierog: 0, carp: 0 };
  const bySource = { bullet: 0, parry: 0, smash: 0, smack: 0 };
  const fell: SimResult['fell'] = {};
  const destroyed: SimResult['destroyed'] = {};
  let parries = 0;
  let smashes = 0;
  let fired = 0;
  let press = -Infinity;
  let dashReadyAt = 0;
  let gunReadyAt = 0;
  let lastPassed = -Infinity;
  let live: SimHazard[] = [];
  let stageEnd = 0;
  let bullets: { t0: number; lane: Lane; inFront: Set<SimHazard> }[] = [];
  /** Planned answers: a dash at a time for a hazard, a late hop. */
  let plannedDash: { at: number; for: SimHazard } | null = null;
  let plannedHop: { at: number; for: SimHazard } | null = null;
  const smacks: { at: number; head: Head }[] = [];
  let won = false;

  const result = (died: boolean, cause: SimHazard | null, at: number): SimResult => ({
    died, cause, endedAt: at, won, hazards, steps, parries, smashes, bullets: fired, dealt, bySource, fell, destroyed,
  });

  const begin = (at: number): void => {
    const step = director.next(lane);
    steps.push({ step, start: at });
    stageEnd = at + step.ms;
    for (const h of step.hazards) {
      const sh = place(h, at, step);
      hazards.push(sh);
      live.push(sh);
    }
  };

  /** Damage; what it means for the stage. */
  const damage = (target: Target, base: number, now: number, source: keyof typeof bySource): void => {
    const loose = director.loose;
    const head = target === 'loose' ? loose?.head : target;
    const r = director.hit(target, base);
    if (head && r.dealt > 0) dealt[head] += r.dealt;
    bySource[source] += r.dealt;
    if (r.destroyed) destroyed[r.destroyed] = now;
    if (r.won) { won = true; return; }
    if (r.fell) {
      fell[r.fell] = now;
      // Falling off clears the stage, unless a loose head is already rolling (the stage is its)
      if (!loose || !loose.fallen) {
        for (const h of live) if (!h.resolved) h.dropped = true;
        live = [];
        plannedDash = null;
        plannedHop = null;
        stageEnd = now + 50;
      }
    }
    if (r.destroyed) {
      for (const h of live) if (!h.resolved) h.dropped = true;
      live = [];
      plannedDash = null;
      plannedHop = null;
      stageEnd = now + 50;
    }
  };

  const dashing = (now: number) => now - press < DASH_MS;
  const doDash = (now: number) => {
    if (dashMode === 'never' || now < dashReadyAt || dashing(now)) return false;
    press = now;
    dashReadyAt = now + DASH_CYCLE_MS;
    return true;
  };
  const closed = (l: Lane, now: number) => live.some(h => h.puddle && h.lane === l && now >= h.t - 50 && now <= h.t + h.lasts + 50);
  const hop = (now: number) => {
    const to = other(lane);
    if (closed(to, now)) return false;
    lane = to;
    return true;
  };
  const known = (h: SimHazard, now: number) => p !== null && now >= h.cue + p.reaction;
  /** What a bullet fired now on this lane would meet first: something flying at the roach, else the head in front. */
  const bulletTarget = (now: number, l: Lane): SimHazard | Head | null => {
    let best: SimHazard | null = null;
    let bestX = Infinity;
    for (const h of live) {
      if (h.resolved || h.lane !== l || h.hp === 0 && !h.loose) continue;
      const x = laneX(h, now);
      if (x !== null && x > REF.muzzle && x < bestX) { best = h; bestX = x; }
      // Not on the lane yet but about to be, before the bullet gets past where it will be: it will meet it
      if (x === null && !h.loose && !h.bounce && now < h.fire && h.fire - now < 250) { best = h; bestX = h.from; }
    }
    return best ?? director.frontTarget(l);
  };
  const radiatorSoon = (now: number) => live.some(h => !h.resolved && h.kind === 'radiator' && h.t - now < DASH_CYCLE_MS + 400 && h.t > now);

  begin(0);
  for (let now = 0; now < limitMs; now += TICK) {
    if (live.every(h => h.resolved) && now >= stageEnd) {
      live = [];
      begin(now);
    }

    // ── The player
    if (p) {
      // What still has to be answered: a puddle already lying matters only to a roach standing in it
      const pending = live.filter(h => !h.resolved && (h.t >= now || (h.lane === lane && h.t + h.lasts >= now)))
        .sort((a, b) => a.t - b.t || (a.lane === lane ? -1 : b.lane === lane ? 1 : 0));
      const first = pending[0];
      let acted = false;
      if (dashMode === 'spam' && now >= (p.offset ?? 0) && now >= dashReadyAt) acted = doDash(now);
      if (plannedDash && now >= plannedDash.at) {
        if (!plannedDash.for.resolved) doDash(now);
        plannedDash = null;
        acted = true;
      }
      if (plannedHop && now >= plannedHop.at) {
        const h = plannedHop.for;
        plannedHop = null;
        if (!h.resolved && h.lane === lane && !dashing(now)) { hop(now); acted = true; }
      }
      if (!acted && first && first.lane === lane && known(first, now) && now >= lastPassed + 20
        && !plannedDash && !plannedHop && !dashing(now)) {
        const h = first;
        const meets = (at: number) => {
          if (h.loose || h.bounce) return lungeMeets(at, h.from, rollStart(h), h.t);
          return lungeMeets(at, h.from, h.fire, h.t);
        };
        const sendable = (h.parry > 0 && p.parry) || (h.loose && !p.dodgeLoose);
        let planned = false;
        if (sendable && dashMode === 'normal' && !(h.kind !== 'radiator' && radiatorSoon(now + 400))) {
          const fire = h.loose || h.bounce ? rollStart(h) : h.fire;
          const earliest = earliestMeet(h.from, fire, h.t);
          if (earliest !== null) {
            const at = Math.max(now, earliest + 20);
            if (at <= h.t - 10 && dashReadyAt <= at && meets(at)) {
              plannedDash = { at, for: h };
              planned = true;
            }
          }
        }
        if (!planned && h.kind === 'radiator' && dashMode !== 'never') {
          // Both lanes: only the dash gets through
          const earliest = earliestMeet(h.from, h.fire, h.t);
          if (earliest !== null) {
            const at = Math.max(now, earliest + 20, dashReadyAt);
            if (at <= h.t - 5) { plannedDash = { at, for: h }; planned = true; }
          }
        }
        if (!planned) {
          // Shot down in time? Then stand and shoot; else hop, late if it is being shot at meanwhile
          const shootable = p.shoot !== 'never' && (h.hp > 0 && h.hp !== Infinity || (h.loose && !p.dodgeLoose));
          if (shootable && h.lane === lane) {
            const late = h.t - 300;
            plannedHop = { at: Math.max(now, late), for: h };
          } else if (h.kind !== 'radiator') {
            acted = hop(now);
            if (!acted && h.hp > 0 && h.hp !== Infinity) plannedHop = null;
          }
        }
      }
      // Over to a lane with a head to shoot, when nothing it knows of is coming soon
      if (!acted && p.shoot !== 'never' && !plannedDash && !plannedHop && !dashing(now)) {
        const soon = pending.some(h => h.t - now < 1200);
        if (!soon && director.frontTarget(lane) === null && director.frontTarget(other(lane)) !== null
          && !(director.loose && director.loose.fallen)) {
          hop(now);
        }
      }
      // The gun
      if (p.shoot !== 'never' && now >= gunReadyAt) {
        const target = bulletTarget(now, lane);
        let fire = p.shoot === 'blind';
        if (p.shoot === 'aimed' && target !== null) {
          if (typeof target === 'string') fire = true;
          else if (target.loose) fire = !p.dodgeLoose;
          else if (target.hp === Infinity) fire = false;
          else fire = !(plannedDash && plannedDash.for === target);
        }
        if (fire) {
          gunReadyAt = now + SHOT_MS;
          fired++;
          bullets.push({ t0: now, lane, inFront: new Set(live.filter(h => { const x = laneX(h, now); return x === null || x > REF.muzzle; })) });
        }
      }
    }

    // ── Bullets
    const keep: typeof bullets = [];
    for (const b of bullets) {
      const x = REF.muzzle + BULLET_SPEED * (now - b.t0);
      let spent = false;
      let best: SimHazard | null = null;
      let bestX = Infinity;
      for (const h of live) {
        if (h.resolved || h.lane !== b.lane || !b.inFront.has(h)) continue;
        if (h.hp === 0 && !h.loose) continue;
        const hx = laneX(h, now);
        if (hx !== null && hx <= x && hx < bestX) { best = h; bestX = hx; }
      }
      if (best) {
        spent = true;
        if (best.loose) {
          damage('loose', BULLET_DAMAGE, now, 'bullet');
        } else if (best.hp !== Infinity) {
          best.taken = (best.taken ?? 0) + 1;
          if (best.taken >= best.hp) { best.resolved = true; lastPassed = now; }
        }
      } else {
        const head = director.frontTarget(b.lane);
        if (head && x >= REF.front[head]) {
          spent = true;
          damage(head, BULLET_DAMAGE, now, 'bullet');
        } else if (!head && x >= REF.pipes) spent = true;
      }
      if (won) return result(false, null, now);
      if (!spent && x < 900) keep.push(b);
    }
    bullets = keep;

    // ── What reaches the roach
    for (const h of live) {
      if (h.resolved) continue;
      if (h.kind === 'cream') {
        if (now < h.t) continue;
        if (h.lane === lane && !dashing(now)) return result(true, h, now);
        if (now >= h.t + h.lasts) { h.resolved = true; lastPassed = h.t + h.lasts; }
        continue;
      }
      if (h.returning) {
        if (now < h.t) continue;
        h.resolved = true;
        lastPassed = now;
        if (h.lane === lane && !dashing(now)) return result(true, h, now);
        smacks.push({ at: h.t + (h.smackAt ?? 0), head: h.head });
        continue;
      }
      const x = h.loose || h.bounce ? laneX(h, now) : (now >= h.fire ? flyX(h.from, h.fire, h.t, now) : null);
      if (x === null) {
        if ((h.loose || h.bounce) && now > h.t) h.resolved = true;
        continue;
      }
      const r = dashing(now) ? lungeOffset(now - press) : 0;
      if (r < x) continue;
      h.resolved = true;
      lastPassed = now;
      if (h.lane !== lane) {
        // A slab that went past the roach on the top lane comes back along the bottom one (the block alone)
        continue;
      }
      if (!dashing(now)) return result(true, h, now);
      if (h.loose) {
        smashes++;
        h.smashed = true;
        damage('loose', SMASH_DAMAGE, now, 'smash');
        if (won) return result(false, null, now);
        if (director.loose && !live.length) continue;
        // Knocked back: the pass is over, the next one after it lands back
        live = live.filter(x2 => x2 !== h);
        stageEnd = Math.min(stageEnd, now + SMASH_BACK_MS);
      } else if (h.parry > 0) {
        parries++;
        damage(h.head, h.parry, now, 'parry');
        if (won) return result(false, null, now);
        // Sent back before it came back: no return
        for (const back of live) if (back.returning && back.start === h.start) back.resolved = true;
      }
    }
    // A boomerang broken or sent back never comes back
    for (const back of live) {
      if (!back.returning || back.resolved) continue;
      const out = live.find(x2 => x2.start === back.start && x2.kind === back.kind && !x2.returning);
      if (out && out.resolved && (out.taken ?? 0) >= out.hp) back.resolved = true;
    }
    for (let i = smacks.length - 1; i >= 0; i--) {
      if (now < smacks[i].at) continue;
      const { head } = smacks.splice(i, 1)[0];
      if (director.onBody(head)) damage(head, SMACK_DAMAGE, now, 'smack');
      if (won) return result(false, null, now);
    }
    live = live.filter(h => !h.resolved || now < h.t + h.lasts);
  }
  return result(false, null, limitMs);
}
