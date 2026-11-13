/**
 * The run's layout: hand-built chunks of beats instead of one independent roll per slot, in waves that build up and
 * then let the player breathe. Pure and driven by the run's random source, so every multiplayer client lays out the
 * same run: the order of random calls here must never depend on anything but the slots themselves.
 */

import type { CastRole, EnemyId } from '../objects/obstacles/cast';

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
  /** Both lanes blocked: only a dash (or the pill) gets through. */
  | { kind: 'wall' }
  /** The spray's cloud wall: both lanes shut while its cloud hangs, open between puffs. */
  | { kind: 'cloud' }
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

function introduction(enemy: EnemyId): Chunk {
  const steps: Step[] = enemy === 'lamp'
    ? [['empty'], ['empty'], ['obstacle', 'A', { enemy }], ['pickup', 'B'], ['pickup', 'B'], ['empty']]
    : enemy === 'mop'
      ? [['pickup', 'B'], ['obstacle', 'A', { enemy }], ['pickup', 'B'], ['empty']]
      : enemy === 'vacuum'
        ? [['obstacle', 'A', { enemy }], ['pickup', 'B'], ['pickup', 'B'], ['empty'], ['pickup', 'A'], ['pickup', 'A'], ['empty']]
        : enemy === 'centipede' || enemy === 'hen'
          ? [['empty'], ['obstacle', 'A', { enemy }], ['pickup', 'B'], ['empty']]
          : enemy === 'frog' || enemy === 'repeller'
            ? [['empty'], ['pickup', 'B'], ['obstacle', 'A', { enemy }], ['pickup', 'B'], ['empty']]
          : enemy === 'wasp'
            ? [['obstacle', 'A', { enemy }], ['empty'], ['empty'], ['pickup', 'B'], ['pickup', 'A'], ['empty']]
          : enemy === 'zapper'
            ? [['empty'], ['obstacle', 'A', { enemy }], ['pickup', 'B'], ['pickup', 'B'], ['empty']]
          : enemy === 'bait'
            ? [['empty'], ['pickup', 'A'], ['obstacle', 'A', { enemy }], ['empty'], ['pickup', 'A'], ['empty']]
      : FREE.has(enemy)
        ? [['empty'], ['obstacle', null, { enemy }], ['empty'], ['pickup', 'A']]
        : [['pickup', 'A'], ['obstacle', 'A', { enemy }], ['pickup', 'A'], ['empty']];
  return { name: `intro-${enemy}`, minLevel: 1, heat: 0, weight: 0, steps };
}

const BREATHER: Chunk = {
  name: 'breather', minLevel: 1, heat: 0, weight: 0,
  steps: [['empty'], ['pickup', 'A'], ['pickup', 'A'], ['pickup', 'B'], ['pickup', 'B']],
};

/** A wall needs the dash back: at least this many beats since the last one. */
const WALL_COOLDOWN_BEATS = 8;

/** Heat a wave holds before the breather; waves run longer as the levels climb. */
export function waveHeat(level: number): number {
  return 6 + level * 1.5;
}

/**
 * World px between slots on this level. It grows with the level so the time between beats shrinks far less than the
 * speed rises: harder, never a wall of noise. From the slot's position only, never the runner's own speed, which a
 * dash or pill changes on one client and not the others.
 */
export function beatSpacing(level: number): number {
  return 200 + (level - 1) * 16;
}

export class RunPatterns {
  private rng: Random;
  private queue: Beat[] = [];
  private heat = 0;
  private beatsSinceWall = WALL_COOLDOWN_BEATS;
  /** The highest level whose newcomers have been shown. */
  private introduced = 0;

  constructor(rng: Random) {
    this.rng = rng;
  }

  /** The beat for the next slot, on this level. */
  next(level: number): Beat {
    // A new level's first beats introduce its newcomers, once each. A run that starts past level 1 (only the tests
    // do) is shown its own level's
    if (this.introduced === 0) this.introduced = level - 1;
    while (this.queue.length === 0 && this.introduced < level) {
      this.introduced++;
      for (const enemy of NEWCOMERS[this.introduced] ?? []) this.queue.push(...this.lay(introduction(enemy)));
    }
    if (this.queue.length === 0) this.queue = this.pickChunk(level);
    const beat = this.queue.shift()!;
    this.beatsSinceWall = beat.kind === 'wall' || beat.kind === 'cloud' ? 0 : this.beatsSinceWall + 1;
    return beat;
  }

  private pickChunk(level: number): Beat[] {
    if (this.heat >= waveHeat(level)) {
      this.heat = 0;
      return this.lay(BREATHER);
    }
    // A wall waits for its cooldown and the queue it is laid from must not start with one already behind
    const wallReady = this.beatsSinceWall >= WALL_COOLDOWN_BEATS;
    // The cloud wall goes where a wall goes and waits for the same dash
    const open = CHUNKS.filter(c => c.minLevel <= level && level <= (c.maxLevel ?? Infinity) && ((c.name !== 'wall' && c.name !== 'cloud') || wallReady));
    const total = open.reduce((sum, c) => sum + c.weight, 0);
    let roll = this.rng.next() * total;
    let chosen = open[open.length - 1];
    for (const chunk of open) {
      roll -= chunk.weight;
      if (roll < 0) { chosen = chunk; break; }
    }
    this.heat += chosen.heat;
    return this.lay(chosen);
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
        case 'wall': return { kind: 'wall' };
        case 'cloud': return { kind: 'cloud' };
        case 'empty': return { kind: 'empty' };
      }
    });
  }
}
