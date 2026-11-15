/**
 * The run's layout: hand-built chunks of beats instead of one independent roll per slot, in waves that build up and
 * then let the player breathe. Pure and driven by the run's random source, so every multiplayer client lays out the
 * same run: the order of random calls here must never depend on anything but the slots themselves.
 */

import { ENDLESS_TOP_LEVEL } from '../config/constants';
import { castFor, MAX_CAST_LEVEL, type CastRole, type EnemyId } from '../objects/obstacles/cast';

export type Lane = 'top' | 'bottom';

/**
 * What stands at one slot. A lane of null leaves it to the obstacle, like the floaters that cross both. A role asks for
 * an enemy of that kind of behaviour (a swatter for a gate, the chaser for a chase).
 */
export type Beat =
  | { kind: 'obstacle'; lane: Lane | null; role?: CastRole; enemy?: EnemyId }
  | { kind: 'pickup'; lane: Lane }
  /** An obstacle in one lane and a pickup in the other, side by side. */
  | { kind: 'pair'; obstacle: Lane; role?: CastRole }
  /** A plain standing blocker in one lane: the calm stretch after a checkpoint lays no other enemy. */
  | { kind: 'blocker'; lane: Lane }
  /** Both lanes blocked: only a dash (or the pill) gets through. */
  | { kind: 'wall' }
  /** The spray's cloud wall: both lanes shut while its cloud hangs, open between puffs. */
  | { kind: 'cloud' }
  /** A plain threat laid by the quiet-time guarantee (RunPatterns quietSlots), drawing nothing from the run's source. */
  | { kind: 'filler' }
  | { kind: 'empty' };

export interface Random {
  next(): number;
}

type Rel = 'A' | 'B';
/** An obstacle step may ask for a kind of behaviour, or one enemy by name. */
type Ask = CastRole | { enemy: EnemyId };
type Step =
  | ['obstacle', Rel | null, Ask?]
  | ['pickup', Rel]
  | ['pair', Rel, CastRole?]
  | ['blocker', Rel]
  | ['wall']
  | ['cloud']
  | ['empty'];

interface Chunk {
  name: string;
  minLevel: number;
  /** The last level it is laid on, when what it asks for leaves the cast (cast.ts CAST). */
  maxLevel?: number;
  /** How much it adds to the wave's heat. Breathers add none and end a wave. */
  heat: number;
  weight: number;
  steps: Step[];
}

/** A and B are the chunk's two lanes, picked fresh each time. */
const CHUNKS: Chunk[] = [
  { name: 'single', minLevel: 1, heat: 1, weight: 4, steps: [['obstacle', null]] },
  { name: 'trail', minLevel: 1, heat: 0.5, weight: 2, steps: [['pickup', 'A'], ['pickup', 'A'], ['pickup', 'A']] },
  { name: 'step', minLevel: 1, heat: 2, weight: 3, steps: [['obstacle', 'A'], ['pickup', 'B'], ['obstacle', 'B']] },
  { name: 'slalom', minLevel: 2, heat: 3, weight: 3, steps: [['obstacle', 'A'], ['obstacle', 'B'], ['obstacle', 'A']] },
  { name: 'bait', minLevel: 2, heat: 2, weight: 2, steps: [['pickup', 'A'], ['obstacle', 'A'], ['pickup', 'A']] },
  { name: 'corridor', minLevel: 3, heat: 3, weight: 2, steps: [['pair', 'A'], ['pair', 'A'], ['pair', 'B'], ['pair', 'B']] },
  { name: 'wall', minLevel: 4, heat: 3, weight: 1, steps: [['pickup', 'A'], ['empty'], ['wall'], ['empty']] },
  { name: 'gauntlet', minLevel: 6, heat: 5, weight: 1, steps: [['obstacle', 'A'], ['obstacle', 'B'], ['pair', 'A'], ['obstacle', 'B'], ['obstacle', 'A']] },
  // Built around behaviours. A gate: apples through a swatter's lane, taken by passing between its slaps
  { name: 'gate', minLevel: 1, heat: 1.5, weight: 3, steps: [['pickup', 'A'], ['obstacle', 'A', 'swatter'], ['pickup', 'A']] },
  // A sweeper puffing its lane shut while apples run down the free one
  { name: 'sweep', minLevel: 2, heat: 1.5, weight: 2, steps: [['pair', 'A', 'sweeper'], ['pickup', 'B'], ['pickup', 'B']] },
  { name: 'gates', minLevel: 3, heat: 3, weight: 2, steps: [['obstacle', 'A', 'swatter'], ['pickup', 'B'], ['obstacle', 'B', 'swatter'], ['pickup', 'A']] },
  // Apples on both sides of a pouncer: the one beyond it is in the lane it pounces into
  { name: 'switch-bait', minLevel: 5, heat: 2.5, weight: 2, steps: [['pickup', 'A'], ['obstacle', 'A', 'switcher'], ['pickup', 'B']] },
  // The light closes its whole lane while it is on, the mop the stretch it sweeps: each with quiet round it and apples
  // down the lane to be on
  { name: 'light', minLevel: 2, heat: 2, weight: 1.5, steps: [['empty'], ['empty'], ['obstacle', 'A', 'light'], ['pickup', 'B'], ['pickup', 'B'], ['empty']] },
  { name: 'mop', minLevel: 2, heat: 2, weight: 1.5, steps: [['pickup', 'B'], ['obstacle', 'A', 'mop'], ['pickup', 'B'], ['empty']] },
  // The dash act. The vacuum comes from behind as the roach reaches its slot and closes in until a dash breaks its grip
  // (or it gives up): a stretch without obstacles as long as it can last, apples in both lanes
  { name: 'vacuum', minLevel: 3, heat: 3, weight: 1, steps: [['obstacle', 'A', 'chaser'], ['pickup', 'B'], ['pickup', 'B'], ['empty'], ['pickup', 'A'], ['pickup', 'A'], ['empty']] },
  // A cloud wall where a wall would go: shut while it hangs, open between puffs, always open to a dash
  { name: 'cloud', minLevel: 3, heat: 3, weight: 1, steps: [['pickup', 'A'], ['empty'], ['cloud'], ['empty']] },
  // The hen reaches into the lower lane in front of her, the frog licks far along its own: each with room before it
  { name: 'hen', minLevel: 4, heat: 2, weight: 2, steps: [['empty'], ['obstacle', 'A', 'pecker'], ['pickup', 'A'], ['empty']] },
  { name: 'frog', minLevel: 5, heat: 2, weight: 2, steps: [['empty'], ['pickup', 'B'], ['obstacle', 'A', 'licker'], ['pickup', 'B'], ['empty']] },
  { name: 'centipede', minLevel: 6, heat: 2, weight: 1.5, steps: [['empty'], ['obstacle', 'A', 'scuttler'], ['pickup', 'B'], ['empty']] },
  // A dance line: three pairs of boots, all stomping on one beat, each with a slot of floor before the next. Which lane
  // a pair leaves open depends on where in the beat the roach gets to it, so each pair is its own read: in slots side by
  // side the next one had to be read while still under the last (tests/enemies.test.ts, the dance line)
  { name: 'dance', minLevel: 6, maxLevel: 7, heat: 3, weight: 1.5, steps: [['empty'], ['obstacle', null, 'dancer'], ['empty'], ['obstacle', null, 'dancer'], ['empty'], ['obstacle', null, 'dancer'], ['empty']] },
  // The gun act. The wasp comes in ahead of the roach and hunts it for a couple of seconds: nothing else meanwhile but
  // apples to take while it hovers
  { name: 'wasp', minLevel: 7, heat: 2.5, weight: 1.5, steps: [['obstacle', 'A', 'tracker'], ['empty'], ['empty'], ['pickup', 'B'], ['pickup', 'A'], ['empty']] },
  // The zapper's bolt runs down its lane at the runner: room before it, apples down the other lane
  { name: 'zapper', minLevel: 8, heat: 2, weight: 1.5, steps: [['empty'], ['obstacle', 'A', 'zapper'], ['pickup', 'B'], ['pickup', 'B'], ['empty']] },
  // The repeller's rings roll a long way down its lane: the other lane carries the apples
  { name: 'repeller', minLevel: 9, heat: 2, weight: 1.5, steps: [['empty'], ['pickup', 'B'], ['obstacle', 'A', 'emitter'], ['pickup', 'B'], ['empty']] },
  // The bait: apples in its own lane either side of it, the lure, taken between its floods (or after a shot)
  { name: 'bait', minLevel: 10, heat: 2, weight: 1.5, steps: [['empty'], ['pickup', 'A'], ['obstacle', 'A', 'lure'], ['empty'], ['pickup', 'A'], ['empty']] },
];

/**
 * Each level opens by showing its newcomers one at a time, the first time the run gets there: alone, with apples
 * leading through (the onion is the tutorial's). Laid from the same random source as everything else, at the same slots
 * on every client.
 */
const NEWCOMERS: Record<number, EnemyId[]> = {
  1: ['glue', 'flipper', 'bleach'],
  2: ['spray', 'lamp', 'mop'],
  3: ['newspaper', 'vacuum'],
  4: ['bird', 'hen'],
  5: ['cat', 'frog'],
  6: ['centipede', 'boots'],
  7: ['jellyfish', 'gull', 'wasp'],
  8: ['robotVacuum', 'zapper', 'aerosol'],
  9: ['bison', 'hedgehog', 'repeller'],
  10: ['bait'],
};

/** The ones that pick their own way between the lanes: shown with room either side instead of apples through. */
const FREE: ReadonlySet<EnemyId> = new Set(['newspaper', 'bird', 'boots', 'jellyfish', 'pope', 'blackhole', 'gull']);

/**
 * A newcomer's introduction ends on its last apple, not in a hole: the next one, or the course, follows straight on. The
 * vacuum and the wasp keep their quiet tail, which is their hunt, and the bait its room after the flood.
 */
function introduction(enemy: EnemyId): Chunk {
  const steps: Step[] = enemy === 'lamp'
    ? [['empty'], ['empty'], ['obstacle', 'A', { enemy }], ['pickup', 'B'], ['pickup', 'B']]
    : enemy === 'mop'
      ? [['pickup', 'B'], ['obstacle', 'A', { enemy }], ['pickup', 'B']]
      : enemy === 'vacuum'
        ? [['obstacle', 'A', { enemy }], ['pickup', 'B'], ['pickup', 'B'], ['empty'], ['pickup', 'A'], ['pickup', 'A'], ['empty']]
        : enemy === 'centipede' || enemy === 'hen'
          ? [['empty'], ['obstacle', 'A', { enemy }], ['pickup', 'B']]
          : enemy === 'frog' || enemy === 'repeller'
            ? [['empty'], ['pickup', 'B'], ['obstacle', 'A', { enemy }], ['pickup', 'B']]
          : enemy === 'wasp'
            ? [['obstacle', 'A', { enemy }], ['empty'], ['empty'], ['pickup', 'B'], ['pickup', 'A'], ['empty']]
          : enemy === 'zapper'
            ? [['empty'], ['obstacle', 'A', { enemy }], ['pickup', 'B'], ['pickup', 'B']]
          : enemy === 'bait'
            ? [['empty'], ['pickup', 'A'], ['obstacle', 'A', { enemy }], ['empty'], ['pickup', 'A'], ['empty']]
      : FREE.has(enemy)
        ? [['empty'], ['obstacle', null, { enemy }], ['empty'], ['pickup', 'A']]
        : [['pickup', 'A'], ['obstacle', 'A', { enemy }], ['pickup', 'A']];
  return { name: `intro-${enemy}`, minLevel: 1, heat: 0, weight: 0, steps };
}

const BREATHER: Chunk = {
  name: 'breather', minLevel: 1, heat: 0, weight: 0,
  steps: [['empty'], ['pickup', 'A'], ['pickup', 'A'], ['pickup', 'B'], ['pickup', 'B']],
};

/**
 * A run started from a checkpoint eases into its speed (checkpoints.ts): meanwhile only apples and plain blockers, each
 * with room round it. Every one of its chunks has a blocker, so the stretch is calm, never empty.
 */
const CALM: Chunk[] = [
  { name: 'calm-step', minLevel: 1, heat: 0, weight: 1, steps: [['blocker', 'A'], ['pickup', 'B'], ['pickup', 'B'], ['empty']] },
  { name: 'calm-bait', minLevel: 1, heat: 0, weight: 1, steps: [['pickup', 'A'], ['empty'], ['blocker', 'A'], ['pickup', 'B'], ['empty']] },
];

/** A wall needs the dash back: at least this many beats since the last one. */
const WALL_COOLDOWN_BEATS = 8;

/** The fight is the wave's breather: none is laid in this many slots before the course stops short of a boss. */
export const BOSS_NO_BREATHER_SLOTS = 8;

/**
 * THE QUIET-TIME GUARANTEE. Outside its deliberate rests the course never goes more than `quietSlots(level)` slots from
 * one threat (an enemy, a wall, a cloud wall) to the next: 3 s at the nominal runner's speed where the level starts
 * (cast.ts nominalCourse, cruiseSpeed; the slowest it runs there, so the most time a slot takes), rounded down to whole
 * slots. Written out per level, like the spacing (tests/run-patterns.test.ts holds them to 3 s), levels 1 to 10; 6 from
 * level 11. The rests: the breather, whose stretch may run one slot longer (it is the cap long itself, never more than a
 * breath); a newcomer's introduction, alone, inside its level's opening; the calm stretch after a checkpoint; the boss
 * runway; the run's start. Where a chunk about to start would break it, a filler beat (one plain threat, as a 'single'
 * chunk would lay) goes first. It goes only between chunks, so it never comes inside a chunk's own room (a light's, a
 * wall's, the vacuum's) and every pair of neighbours it makes is one two chunks laid side by side could already make;
 * where a chunk's own room is longer than the cap (a pickup trail or a light's on levels 1-3, the vacuum's and the
 * wasp's hunts) the stretch is that room and a slot. Past a beaten boss the course picks up with a threat (resume).
 * A filler draws nothing from the run's source (CourseLayout), so the beats and picks round it are the ones the
 * course would have laid without it, a slot later.
 */
const QUIET_SLOTS = [3, 3, 3, 4, 4, 4, 5, 5, 5, 5];
const ENDLESS_QUIET_SLOTS = 6;
export function quietSlots(level: number): number {
  return level <= MAX_CAST_LEVEL ? QUIET_SLOTS[Math.max(1, level) - 1] : ENDLESS_QUIET_SLOTS;
}

/** What counts as a threat for the guarantee. */
export const isThreat = (beat: Beat): boolean =>
  beat.kind !== 'pickup' && beat.kind !== 'empty';

/** A queued beat. The first of a chunk carries how many beats of the chunk come before its first threat (all, if none). */
interface Queued {
  beat: Beat;
  lead?: number;
  /** The chunk is the breather. */
  rest?: boolean;
}

/**
 * How far an endless level is into its escalation: 0 up to level 10, rising by 1/15 a level to 1 at ENDLESS_TOP_LEVEL,
 * where it holds. Everything that escalates past the story is a pure function of this (or of the level number).
 */
export function endlessProgress(level: number): number {
  const span = ENDLESS_TOP_LEVEL - MAX_CAST_LEVEL;
  return Math.min(Math.max(level - MAX_CAST_LEVEL, 0), span) / span;
}

/** Heat a wave holds before the breather; waves run longer as the levels climb, until ENDLESS_TOP_LEVEL. */
export function waveHeat(level: number): number {
  return 6 + Math.min(level, ENDLESS_TOP_LEVEL) * 1.5;
}

/**
 * World px between slots, levels 7 to ENDLESS_TOP_LEVEL (levels 1-6: 200 + 16 a level). Each is the nominal runner's
 * speed where the level starts (cast.ts nominalCourse, cruiseSpeed) times the time between slots wanted there: 0.58 and
 * 0.55 s at the start of levels 7 and 8, then over the endless levels from 0.50 s down by 1/300 s a level to 0.45 s at
 * level 25 (tests/run-patterns.test.ts holds each to its tempo). Levels 9 and 10, the chargers' and the robot vacuum's,
 * are held at 306 px (0.542 and 0.510 s): closer, two of them reaching into consecutive slots of a slalom leave no way
 * through for a player who reads every telegraph (tests/enemies.test.ts; at 294 and 300 px about one course in fifty
 * killed the 250 ms reader). Whole px written out, so no client works them out from floats.
 */
const SPACING_FROM_7 = [
  286, 292, 306, 306,
  305, 311, 315, 318, 321, 323, 324, 325, 325, 326, 326, 325, 325, 325, 324,
];

/**
 * World px between slots on this level. It grows with the level so the time between beats shrinks far less than the
 * speed rises: harder, never a wall of noise. From the slot's position only, never the runner's own speed, which a
 * dash or pill changes on one client and not the others.
 */
export function beatSpacing(level: number): number {
  if (level < 7) return 200 + (level - 1) * 16;
  return SPACING_FROM_7[Math.min(level, ENDLESS_TOP_LEVEL) - 7];
}

/** The roles a chunk asks the cast for. */
const asks = (chunk: Chunk): CastRole[] => chunk.steps.flatMap((step): CastRole[] =>
  (step[0] === 'obstacle' || step[0] === 'pair') && typeof step[2] === 'string' ? [step[2]] : []);

/**
 * The chunks a level lays: only those whose roles its cast fields (a chunk built round an enemy the level doesn't field
 * would lay a stand-in amid that enemy's quiet). The story: by each chunk's own levels too. An endless level: whatever
 * their levels, weighted towards the hotter ones as the escalation goes (a chunk's weight times 1 + p(heat / 2 - 1): at
 * the top a pickup trail weighs a quarter of its story weight, the gauntlet two and a half times).
 */
function chunksFor(level: number): Chunk[] {
  const fielded = new Set<string>(castFor(level).map(e => e.def.role));
  const laid = (c: Chunk): boolean => asks(c).every(role => fielded.has(role));
  if (level <= MAX_CAST_LEVEL) return CHUNKS.filter(c => c.minLevel <= level && level <= (c.maxLevel ?? Infinity) && laid(c));
  const p = endlessProgress(level);
  return CHUNKS.filter(laid).map(c => ({ ...c, weight: c.weight * (1 + p * (c.heat / 2 - 1)) }));
}

/**
 * The breather that ends a wave: apples for as long as the level's quiet cap (quietSlots), so it is a breath and not a
 * hole; in the endless levels it shortens, to five beats, to four past level 15 and to three past level 20.
 */
export function breatherBeats(level: number): number {
  return Math.min(quietSlots(level), level <= 15 ? 5 : level <= 20 ? 4 : 3);
}
function breatherFor(level: number): Chunk {
  return { ...BREATHER, steps: BREATHER.steps.slice(0, breatherBeats(level)) };
}

/** The beats a chunk lays before its first threat: all of them if it has none. */
function leadOf(beats: Beat[]): number {
  const first = beats.findIndex(isThreat);
  return first < 0 ? beats.length : first;
}

export class RunPatterns {
  private rng: Random;
  private queue: Queued[] = [];
  private heat = 0;
  private beatsSinceWall = WALL_COOLDOWN_BEATS;
  /** The highest level whose newcomers have been shown. */
  private introduced = 0;
  /** The calm stretch's own queue: the regular course (its waves, newcomers and walls) starts fresh after it. */
  private calmQueue: Beat[] = [];
  /** A calm stretch was laid: the run started from a checkpoint. */
  private calmed = false;
  /** Beats since the last threat, and whether a breather is among them (the quiet-time guarantee). */
  private quiet = 0;
  private resting = false;

  constructor(rng: Random) {
    this.rng = rng;
  }

  /**
   * The beat for the next slot, on this level. `slotsLeft`: how many slots the course still lays, this one included,
   * before it stops short of a boss (Infinity: no boss ahead).
   */
  next(level: number, slotsLeft = Infinity): Beat {
    // A new level's first beats introduce its newcomers, once each. A run from a checkpoint (it laid a calm stretch
    // first) starts in the level its boss was beaten into: they have been met already, so no show
    if (this.introduced === 0) this.introduced = this.calmed ? level : level - 1;
    while (this.queue.length === 0 && this.introduced < level) {
      this.introduced++;
      // The opening is one piece for the guarantee: it may need a filler before it, never between its introductions
      NEWCOMERS[this.introduced]?.forEach((enemy, i) => this.queue.push(...this.mark(this.lay(introduction(enemy)), i === 0)));
    }
    if (this.queue.length === 0) this.queue = this.pickChunk(level, slotsLeft);
    const head = this.queue[0];
    if (head.lead !== undefined) {
      const lead = head.lead;
      delete head.lead;
      // The next threat would come this many slots after the last one: past the cap, a filler first
      const cap = quietSlots(level) + (head.rest || this.resting ? 1 : 0);
      if (this.quiet + lead + 1 > cap) return this.counted({ kind: 'filler' });
    }
    this.queue.shift();
    if (head.rest) this.resting = true;
    return this.counted(head.beat);
  }

  /**
   * The course was stopped short of a boss, who is beaten now: past him it starts on a fresh chunk (what was left of the
   * one the runway cut is not carried past the fight), whose first beat is a threat or comes after a filler. The wave
   * goes on where it was: one that was due its breather (none is laid just before a boss) takes it now.
   */
  resume(level: number): void {
    this.queue = [];
    this.quiet = quietSlots(level) - 1;
    this.resting = false;
  }

  /** A beat of the calm stretch after a checkpoint: an apple, a plain blocker or room. */
  calm(): Beat {
    this.calmed = true;
    if (this.calmQueue.length === 0) this.calmQueue = this.lay(CALM[Math.floor(this.rng.next() * CALM.length)]);
    return this.counted(this.calmQueue.shift()!);
  }

  private counted(beat: Beat): Beat {
    if (isThreat(beat)) {
      this.quiet = 0;
      this.resting = false;
    } else {
      this.quiet++;
    }
    this.beatsSinceWall = beat.kind === 'wall' || beat.kind === 'cloud' ? 0 : this.beatsSinceWall + 1;
    return beat;
  }

  private mark(beats: Beat[], check: boolean, rest = false): Queued[] {
    return beats.map((beat, i) => (i === 0 && check ? { beat, lead: leadOf(beats), rest } : { beat }));
  }

  private pickChunk(level: number, slotsLeft: number): Queued[] {
    const breather = breatherFor(level);
    // (one slot spare: the guarantee may put a filler before it)
    if (this.heat >= waveHeat(level) && breather.steps.length + 1 <= slotsLeft - BOSS_NO_BREATHER_SLOTS) {
      this.heat = 0;
      return this.mark(this.lay(breather), true, true);
    }
    // A wall waits for its cooldown and the queue it is laid from must not start with one already behind
    const wallReady = this.beatsSinceWall >= WALL_COOLDOWN_BEATS;
    // The cloud wall goes where a wall goes and waits for the same dash
    const open = chunksFor(level).filter(c => (c.name !== 'wall' && c.name !== 'cloud') || wallReady);
    const total = open.reduce((sum, c) => sum + c.weight, 0);
    let roll = this.rng.next() * total;
    let chosen = open[open.length - 1];
    for (const chunk of open) {
      roll -= chunk.weight;
      if (roll < 0) { chosen = chunk; break; }
    }
    this.heat += chosen.heat;
    return this.mark(this.lay(chosen), true);
  }

  private lay(chunk: Chunk): Beat[] {
    const a: Lane = this.rng.next() < 0.5 ? 'top' : 'bottom';
    const lane = (rel: Rel): Lane => (rel === 'A' ? a : a === 'top' ? 'bottom' : 'top');
    return chunk.steps.map((step): Beat => {
      switch (step[0]) {
        case 'obstacle': {
          const ask = step[2];
          const beat: Beat = { kind: 'obstacle', lane: step[1] ? lane(step[1]) : null };
          if (typeof ask === 'string') beat.role = ask;
          else if (ask) beat.enemy = ask.enemy;
          return beat;
        }
        case 'pickup': return { kind: 'pickup', lane: lane(step[1]) };
        case 'pair': return { kind: 'pair', obstacle: lane(step[1]), ...(step[2] && { role: step[2] }) };
        case 'blocker': return { kind: 'blocker', lane: lane(step[1]) };
        case 'wall': return { kind: 'wall' };
        case 'cloud': return { kind: 'cloud' };
        case 'empty': return { kind: 'empty' };
      }
    });
  }
}
