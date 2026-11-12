/**
 * The run's enemies as data: what each one is (art, hitbox, behaviour), which of them each level can field and how
 * often, and the seeded picks that fill a slot. Replacing an enemy is a change here plus its spawn file. Phaser-free.
 *
 * THE SEEDED-COURSE RULE: a match and the daily run lay one course for everyone from one seed. `EnemyPicker.pick` draws
 * from the shared random source in a fixed order (the pick, the lane unless the pattern gave one, the phase) and from
 * nothing else; it may depend on the slot's x and level, never on a player.
 */
import {
  COCKROACH_BASE_SPEED,
  COCKROACH_SPEED_MAX_BOOST,
  COCKROACH_SPEED_TAU,
  COCKROACH_START_X,
  SPEED_BOOST_PER_LEVEL,
} from '../../config/constants';
import { getLevelForDistance } from '../../config/levels';
import {
  Art,
  Behaviour,
  Body,
  EnemyPlan,
  EnemyState,
  Lane,
  blocker,
  bodyWidth,
  drip,
  light,
  mopSweep,
  chaser,
  charger,
  depthSwat,
  floater,
  peck,
  pounce,
  scuttle,
  still,
  stomp,
  suck,
  sweeper,
  swoop,
  tongue,
  cloudWall,
} from './behaviours';

export type EnemyId =
  | 'onion' | 'flipper' | 'spray' | 'newspaper' | 'bird' | 'cat' | 'catChase'
  | 'jellyfish' | 'pope' | 'bison' | 'blackhole' | 'glue' | 'bleach' | 'lamp' | 'mop'
  | 'vacuum' | 'hen' | 'frog' | 'centipede' | 'boots' | 'hedgehog' | 'sprayWall';

/** What a pattern can ask a slot for: an enemy of this kind of behaviour. */
export type CastRole = 'swatter' | 'sweeper' | 'switcher' | 'chaser' | 'light' | 'mop' | 'scuttler' | 'dancer' | 'pecker' | 'licker';

/** Roles laid only by their own patterns (each needs quiet round it), never by a plain obstacle beat. */
const OWN_PATTERN: ReadonlySet<string> = new Set(['chaser', 'light', 'mop', 'scuttler', 'dancer', 'wall', 'pecker', 'licker']);

export interface EnemyDef {
  id: EnemyId;
  /** Its death cause and game-over art: the names the server accepts (server/validate.ts). */
  type: string;
  /** Its atlas animation, and that frame's size (native px) and baseline. */
  art: string;
  frame: Art;
  hitbox: { w: number; h: number };
  /** A swatter's landing stretch, world px: its hitbox is that wide and low on the lane instead of `hitbox`. */
  footprint?: number;
  role: CastRole | 'blocker' | 'swoop' | 'charger' | 'floater' | 'hole' | 'dripper' | 'wall';
  /** A pattern may stand it in one lane. The others pick their own way between the lanes. */
  laneBound: boolean;
  /** The only lanes it can be in (the bleach drips only onto the lower lane, from the upper ledge). */
  lanes?: readonly Lane[];
  /** It reaches into the other lane too (the bleach's drop, the hen's peck): never beside a pickup in a pair. */
  both?: boolean;
  behave: Behaviour;
  /** It shows its own attack (pose, motion): no red "!" as it arrives. */
  telegraphs: boolean;
}

const DEFAULT_HITBOX = { w: 0.6, h: 0.7 };

/**
 * The swatters drawn with the hand holding them (tools/art/swatters.py, `-hand` strips) instead of on their own. Off:
 * the hand is mush at this size and its arm clutters the lane; kept so both can be compared.
 */
export const SWAT_HAND = false;

/** Timings, ms. Each enemy's wind-up is its on-enemy telegraph: the reaction it asks for is in the fairness test. */
export const TIMINGS = {
  // From the shadow's first frame (the wind-back) to the slap: 950 ms for the slipper, 1200 for the paper. Footprints
  // are 85% of each lying flat at its native size (tools/art/swatters.py)
  flipper: { idle: 1000, windup: 300, swing: 650, slap: 60, down: 140, peel: 260, recede: 450, footprint: 70, alternate: false },
  spray: { idle: 900, windup: 550, sweep: 550, reach: 56, solid: true },
  newspaper: { idle: 900, windup: 350, swing: 850, slap: 60, down: 160, peel: 280, recede: 500, footprint: 62, alternate: true },
  bird: { circle: 1200, windup: 600, dive: 200, glide: 320, climb: 480, high: 120, glideDx: -40 },
  cat: { sit: 1400, crouch: 550, leap: 200, stay: 420, back: 200 },
  catChase: { run: 1250, windup: 450, jump: 220 },
  bleach: { idle: 700, swell: 650, fall: 260, splash: 150, puddle: 300, spot: 56, jugDx: 30 },
  // How far along its lane the light reaches either side of the bulb: most of the screen, but never a roach the bulb
  // has only just come into view for (420 px in from the right edge is time to see it flicker at any speed)
  lamp: { dark: 1600, flicker: 750, on: 550, ahead: 420, behind: 180 },
  mop: { wait: 900, windup: 700, press: 120, sweep: 700, lift: 280, back: 600, from: 130, to: -110, raise: 36 },
  bison: { stand: 1000, paw: 600, rush: 380, halt: 400, back: 620, distance: 120 },
  hedgehog: { stand: 1000, paw: 600, rush: 380, halt: 400, back: 620, distance: 110 },
  // From its start (VACUUM_LEAD before it meets the slot): closing in, holding just behind the runner, falling back
  vacuum: {
    approach: 2200, hold: 2600, fallBack: 220, start: 700, close: 64, reach: 150, length: 120,
    swings: [2600, 3800], swingWarn: 500, swingMove: 220,
  },
  hen: { idle: 900, windup: 480, peck: 110, hold: 260, back: 250, ahead: 150, spot: 40 },
  frog: { idle: 1000, windup: 550, shoot: 130, hold: 220, back: 180, reach: 170, mouth: 20 },
  // Its lane switches, ms before it meets the nominal runner at its slot (two, or the last one only)
  centipede: { speed: 300, from: 900, switches: [1500, 800], warn: 420, jump: 200 },
  boots: { beat: 500, down: 260, lift: 120, height: 30 },
  sprayWall: { idle: 900, windup: 600, puff: 700, reach: 90 },
} as const;

/** The vacuum sets off this long before it would meet the nominal runner at its slot. */
export const VACUUM_LEAD = 1500;

/** A chaser runs this much faster than the course's nominal runner where it meets it, and sets off this far behind. */
export const CHASE_SPEEDUP = 1.6;
export const CHASE_START_GAP = 1400;

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  onion: {
    id: 'onion', type: 'onion', art: 'onion', frame: { w: 43, h: 37, pivotY: 0.7838 }, hitbox: DEFAULT_HITBOX,
    role: 'blocker', laneBound: true, behave: blocker, telegraphs: false,
  },
  flipper: {
    id: 'flipper', type: 'flipper', art: SWAT_HAND ? 'flipper-swat-hand' : 'flipper-swat',
    frame: SWAT_HAND ? { w: 86, h: 63, pivotY: 0.873 } : { w: 67, h: 53, pivotY: 0.8491 }, hitbox: DEFAULT_HITBOX,
    footprint: TIMINGS.flipper.footprint, role: 'swatter', laneBound: true, behave: depthSwat(TIMINGS.flipper), telegraphs: true,
  },
  spray: {
    id: 'spray', type: 'spray', art: 'spray', frame: { w: 34, h: 46, pivotY: 0.8261 }, hitbox: DEFAULT_HITBOX,
    role: 'sweeper', laneBound: true, behave: sweeper(TIMINGS.spray), telegraphs: true,
  },
  newspaper: {
    id: 'newspaper', type: 'newspaper', art: SWAT_HAND ? 'newspaper-swat-hand' : 'newspaper-swat',
    frame: SWAT_HAND ? { w: 70, h: 49, pivotY: 0.8367 } : { w: 63, h: 54, pivotY: 0.8519 }, hitbox: DEFAULT_HITBOX,
    footprint: TIMINGS.newspaper.footprint, role: 'swatter', laneBound: false, behave: depthSwat(TIMINGS.newspaper),
    telegraphs: true,
  },
  bird: {
    id: 'bird', type: 'bird', art: 'bird', frame: { w: 61, h: 63, pivotY: 0.873 }, hitbox: { w: 0.75, h: 0.42 },
    role: 'swoop', laneBound: false, behave: swoop(TIMINGS.bird), telegraphs: true,
  },
  cat: {
    id: 'cat', type: 'cat', art: 'cat', frame: { w: 63, h: 61, pivotY: 0.8689 }, hitbox: { w: 0.5, h: 0.5 },
    role: 'switcher', laneBound: true, both: true, behave: pounce(TIMINGS.cat), telegraphs: true,
  },
  // The same cat, running the roach down from behind. Dies as 'cat': the server knows no other name for it
  catChase: {
    id: 'catChase', type: 'cat', art: 'cat', frame: { w: 63, h: 61, pivotY: 0.8689 }, hitbox: { w: 0.5, h: 0.5 },
    role: 'chaser', laneBound: true, behave: chaser(TIMINGS.catChase), telegraphs: true,
  },
  jellyfish: {
    id: 'jellyfish', type: 'jellyfish', art: 'jellyfish', frame: { w: 39, h: 44, pivotY: 0.8182 }, hitbox: { w: 0.7, h: 0.85 },
    role: 'floater', laneBound: false, behave: floater({ half: 2500 }), telegraphs: false,
  },
  pope: {
    id: 'pope', type: 'pope', art: 'pope', frame: { w: 43, h: 43, pivotY: 0.814 }, hitbox: DEFAULT_HITBOX,
    role: 'floater', laneBound: false, behave: floater({ half: 1800 }), telegraphs: false,
  },
  bison: {
    id: 'bison', type: 'bison', art: 'bison', frame: { w: 63, h: 51, pivotY: 0.8431 }, hitbox: { w: 0.6, h: 0.55 },
    role: 'charger', laneBound: true, behave: charger(TIMINGS.bison), telegraphs: true,
  },
  glue: {
    id: 'glue', type: 'glue', art: 'glue', frame: { w: 60, h: 44, pivotY: 0.8182 }, hitbox: { w: 0.75, h: 0.6 },
    role: 'blocker', laneBound: true, behave: blocker, telegraphs: false,
  },
  bleach: {
    id: 'bleach', type: 'bleach', art: 'bleach', frame: { w: 53, h: 54, pivotY: 0.8519 }, hitbox: DEFAULT_HITBOX,
    footprint: TIMINGS.bleach.spot, role: 'dripper', laneBound: true, lanes: ['bottom'], both: true, behave: drip(TIMINGS.bleach),
    telegraphs: true,
  },
  lamp: {
    id: 'lamp', type: 'lamp', art: 'lamp', frame: { w: 50, h: 57, pivotY: 0.8596 }, hitbox: { w: 0.4, h: 0.4 },
    role: 'light', laneBound: true, behave: light(TIMINGS.lamp), telegraphs: true,
  },
  mop: {
    id: 'mop', type: 'mop', art: 'mop', frame: { w: 64, h: 64, pivotY: 0.875 }, hitbox: DEFAULT_HITBOX,
    footprint: 58, role: 'mop', laneBound: true, behave: mopSweep(TIMINGS.mop), telegraphs: true,
  },
  vacuum: {
    id: 'vacuum', type: 'vacuum', art: 'vacuum', frame: { w: 82, h: 58, pivotY: 0.8621 }, hitbox: { w: 0.4, h: 0.5 },
    role: 'chaser', laneBound: true, behave: suck(TIMINGS.vacuum), telegraphs: true,
  },
  hen: {
    id: 'hen', type: 'hen', art: 'hen', frame: { w: 49, h: 63, pivotY: 0.873 }, hitbox: { w: 0.6, h: 0.7 },
    role: 'pecker', laneBound: true, lanes: ['top'], both: true, behave: peck(TIMINGS.hen), telegraphs: true,
  },
  frog: {
    id: 'frog', type: 'frog', art: 'frog', frame: { w: 42, h: 38, pivotY: 0.7895 }, hitbox: { w: 0.7, h: 0.7 },
    role: 'licker', laneBound: true, behave: tongue(TIMINGS.frog), telegraphs: true,
  },
  centipede: {
    id: 'centipede', type: 'centipede', art: 'centipede', frame: { w: 67, h: 39, pivotY: 0.7949 }, hitbox: { w: 0.6, h: 0.6 },
    role: 'scuttler', laneBound: true, behave: scuttle(TIMINGS.centipede), telegraphs: true,
  },
  boots: {
    id: 'boots', type: 'boots', art: 'boot', frame: { w: 45, h: 42, pivotY: 0.8095 }, hitbox: { w: 0.7, h: 0.6 },
    role: 'dancer', laneBound: false, behave: stomp(TIMINGS.boots), telegraphs: true,
  },
  // Built now from its two stills, for level 9 later: in no cast yet
  hedgehog: {
    id: 'hedgehog', type: 'hedgehog', art: 'hedgehog', frame: { w: 56, h: 48, pivotY: 0.8333 }, hitbox: { w: 0.6, h: 0.6 },
    role: 'charger', laneBound: true, behave: charger(TIMINGS.hedgehog), telegraphs: true,
  },
  // The spray's cloud wall: laid by the course where walls go (CourseLayout), never picked
  sprayWall: {
    id: 'sprayWall', type: 'spray', art: 'spray-big', frame: { w: 42, h: 62, pivotY: 0.871 }, hitbox: DEFAULT_HITBOX,
    role: 'wall', laneBound: false, behave: cloudWall(TIMINGS.sprayWall), telegraphs: true,
  },
  blackhole: {
    id: 'blackhole', type: 'blackhole', art: 'blackhole', frame: { w: 62, h: 44, pivotY: 0.8182 }, hitbox: { w: 0.5, h: 0.5 },
    role: 'hole', laneBound: false, behave: still, telegraphs: false,
  },
};

/**
 * Who each level fields, and how often. Each level's newcomer leads its weights; the onion is the only enemy that just
 * stands there. Past level 10 the table holds at level 10. The light stops at level 6: past it the roach runs too fast to
 * see it flicker long before it is lit. The vacuum stays in the dash act (3-6): faster, its hold behind the runner
 * runs on into whatever comes after its quiet stretch. The chaser (catChase) is off until it has art of its own: its
 * behaviour and its 'chase' role are kept, so bringing it back is a weight here and its chunk in RunPatterns.
 */
export const CAST: Record<number, Partial<Record<EnemyId, number>>> = {
  1: { onion: 2, glue: 2, flipper: 3, bleach: 3 },
  2: { onion: 1, glue: 1, flipper: 2, bleach: 2, spray: 4, lamp: 1, mop: 1 },
  3: { onion: .5, glue: .5, flipper: 2, bleach: 1.5, spray: 2, newspaper: 4, lamp: 1, mop: 1, vacuum: 1 },
  4: { onion: .5, glue: .3, flipper: 1.5, bleach: 1, spray: 1.5, newspaper: 2, bird: 4, hen: 4, lamp: 1, mop: 1, vacuum: 1 },
  5: { onion: .3, flipper: 1, bleach: 1, spray: 1.5, newspaper: 1.5, bird: 2, hen: 2, cat: 4, frog: 4, lamp: 1, mop: 1, vacuum: 1 },
  6: { flipper: 1, spray: 1.5, newspaper: 1.5, bird: 1.5, hen: 1.5, cat: 2, frog: 2, centipede: 4, boots: 4, lamp: 1, mop: 1, vacuum: 1 },
  7: { flipper: 1, spray: 1, newspaper: 1.5, bird: 1.5, hen: 1.5, cat: 1.5, frog: 1.5, jellyfish: 4, centipede: 1, boots: 1, mop: 1 },
  8: { flipper: 1, spray: 1, newspaper: 1.5, bird: 1.5, hen: 1.5, cat: 1.5, frog: 1.5, jellyfish: 2, pope: 4, centipede: 1, boots: 1, mop: 1 },
  9: { flipper: 1, spray: 1, newspaper: 1.5, bird: 1.5, hen: 1.5, cat: 1.5, frog: 1.5, jellyfish: 2, pope: 2, bison: 4, centipede: 1, boots: 1, mop: 1 },
  10: { flipper: 1, spray: 1, newspaper: 1.5, bird: 1.5, hen: 1.5, cat: 1.5, frog: 1.5, jellyfish: 2, pope: 2, bison: 2, blackhole: 3, centipede: 1, boots: 1, mop: 1 },
};

export const MAX_CAST_LEVEL = 10;

export function castFor(level: number): { def: EnemyDef; weight: number }[] {
  const row = CAST[Math.min(Math.max(1, level), MAX_CAST_LEVEL)];
  return (Object.entries(row) as [EnemyId, number][]).map(([id, weight]) => ({ def: ENEMIES[id], weight }));
}

/** The hitbox an enemy's behaviour measures with. */
export function bodyOf(def: EnemyDef): Body {
  return { half: (def.footprint ?? bodyWidth(def.frame, def.hitbox)) / 2, art: def.frame, hitbox: def.hitbox };
}

export function enemyState(plan: EnemyPlan, t: number): EnemyState {
  const def = ENEMIES[plan.id as EnemyId];
  return def.behave(plan, t, bodyOf(def));
}

// ── The course's nominal runner ─────────────────────────────────────────

/** When and how fast a runner reaches a point of the course: the chaser times its run from it. */
export interface CourseClock {
  timeAt(x: number): number;
  speedAt(x: number): number;
}

/**
 * A runner that never dashes, never takes a pill and never stops: the player's speed formula (Player.updateSpeed)
 * stepped from the start. Pure arithmetic on x, so every client gets the same answer.
 */
class NominalCourse implements CourseClock {
  private xs: number[] = [COCKROACH_START_X];
  private ts: number[] = [0];
  private vs: number[] = [COCKROACH_BASE_SPEED];
  private static readonly STEP_MS = 50;

  private extendTo(x: number): void {
    while (this.xs[this.xs.length - 1] < x) {
      const i = this.xs.length - 1;
      const t = this.ts[i];
      const level = getLevelForDistance(Math.floor((this.xs[i] - COCKROACH_START_X) / 50)).level;
      const v = COCKROACH_BASE_SPEED + COCKROACH_SPEED_MAX_BOOST * (1 - Math.exp(-t / 1000 / COCKROACH_SPEED_TAU))
        + (level - 1) * SPEED_BOOST_PER_LEVEL;
      this.xs.push(this.xs[i] + (v * NominalCourse.STEP_MS) / 1000);
      this.ts.push(t + NominalCourse.STEP_MS);
      this.vs.push(v);
    }
  }

  private index(x: number): number {
    this.extendTo(x);
    let lo = 0;
    let hi = this.xs.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.xs[mid] <= x) lo = mid; else hi = mid;
    }
    return lo;
  }

  timeAt(x: number): number {
    if (x <= COCKROACH_START_X) return 0;
    const i = this.index(x);
    const span = this.xs[i + 1] - this.xs[i];
    return this.ts[i] + ((x - this.xs[i]) / span) * NominalCourse.STEP_MS;
  }

  speedAt(x: number): number {
    return this.vs[Math.min(this.index(x) + 1, this.vs.length - 1)];
  }
}

export const nominalCourse: CourseClock = new NominalCourse();

// ── Seeded picks ────────────────────────────────────────────────────────

export interface Random {
  next(): number;
}

export interface EnemyRequest {
  lane?: Lane;
  role?: CastRole;
  /** One enemy by name: a level's opening introduces each newcomer on its own. */
  enemy?: EnemyId;
  /** A pickup stands in the other lane at the same x: nothing that reaches into both lanes (the bleach's jug). */
  pair?: boolean;
}

/** Phases are drawn over this span: longer than any cycle, so every point of a rhythm is as likely. */
const PHASE_SPAN = 12000;

/** Picks which enemy fills a slot, its lane and its phase. Exactly the same draws for the same slots, on every client. */
export class EnemyPicker {
  private last: EnemyId | null = null;

  constructor(private rng: Random, private clock: CourseClock = nominalCourse) {}

  pick(x: number, level: number, request: EnemyRequest = {}): EnemyPlan {
    const fits = (def: EnemyDef): boolean =>
      (!request.lane || (def.laneBound && (!def.lanes || def.lanes.includes(request.lane))))
      && !(request.pair && def.both);
    const cast = castFor(level).filter(e => fits(e.def));
    const plain = cast.filter(e => !OWN_PATTERN.has(e.def.role));
    const wanted = request.enemy
      ? [{ def: ENEMIES[request.enemy], weight: 1 }]
      : request.role ? cast.filter(e => e.def.role === request.role) : plain;
    const pool = wanted.length > 0 ? wanted : plain;
    const fresh = pool.length > 1 ? pool.filter(e => e.def.id !== this.last) : pool;
    const total = fresh.reduce((sum, e) => sum + e.weight, 0);
    let roll = this.rng.next() * total;
    let def = fresh[fresh.length - 1].def;
    for (const e of fresh) {
      roll -= e.weight;
      if (roll < 0) { def = e.def; break; }
    }
    this.last = def.id;

    const drawn: Lane = request.lane ?? (this.rng.next() < 0.5 ? 'top' : 'bottom');
    // One that can only be in some lanes takes the first of them (the draw is made all the same, so the course
    // after it doesn't depend on what was picked)
    const lane: Lane = def.lanes && !def.lanes.includes(drawn) ? def.lanes[0] : drawn;
    const phase = Math.floor(this.rng.next() * PHASE_SPAN);
    const plan: EnemyPlan = { id: def.id, x, lane, phase };
    if (def.id === 'catChase') plan.chase = chaseFor(x, this.clock);
    // The vacuum and the centipede are timed off the nominal runner at their slot
    if (def.id === 'vacuum' || def.id === 'centipede') {
      const meetAt = this.clock.timeAt(x);
      plan.chase = { meetAt, speed: this.clock.speedAt(x), startAt: meetAt - VACUUM_LEAD };
    }
    return plan;
  }
}

/** A chaser meets the nominal runner at x, running CHASE_SPEEDUP times its speed there, from CHASE_START_GAP behind. */
export function chaseFor(x: number, clock: CourseClock): NonNullable<EnemyPlan['chase']> {
  const v = clock.speedAt(x);
  const speed = v * CHASE_SPEEDUP;
  const meetAt = clock.timeAt(x);
  return { meetAt, speed, startAt: meetAt - (CHASE_START_GAP / (speed - v)) * 1000 };
}
