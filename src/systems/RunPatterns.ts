/**
 * The run's layout: hand-built chunks of beats instead of one independent roll per slot, in waves that build up and
 * then let the player breathe. Pure and driven by the run's random source, so every multiplayer client lays out the
 * same run: the order of random calls here must never depend on anything but the slots themselves.
 */

export type Lane = 'top' | 'bottom';

/** What stands at one slot. A lane of null leaves it to the obstacle, like the floaters that cross both. */
export type Beat =
  | { kind: 'obstacle'; lane: Lane | null }
  | { kind: 'pickup'; lane: Lane }
  /** An obstacle in one lane and a pickup in the other, side by side. */
  | { kind: 'pair'; obstacle: Lane }
  /** Both lanes blocked: only a dash (or the pill) gets through. */
  | { kind: 'wall' }
  | { kind: 'empty' };

export interface Random {
  next(): number;
}

type Rel = 'A' | 'B';
type Step =
  | ['obstacle', Rel | null]
  | ['pickup', Rel]
  | ['pair', Rel]
  | ['wall']
  | ['empty'];

interface Chunk {
  name: string;
  minLevel: number;
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
];

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

  constructor(rng: Random) {
    this.rng = rng;
  }

  /** The beat for the next slot, on this level. */
  next(level: number): Beat {
    if (this.queue.length === 0) this.queue = this.pickChunk(level);
    const beat = this.queue.shift()!;
    this.beatsSinceWall = beat.kind === 'wall' ? 0 : this.beatsSinceWall + 1;
    return beat;
  }

  private pickChunk(level: number): Beat[] {
    if (this.heat >= waveHeat(level)) {
      this.heat = 0;
      return this.lay(BREATHER);
    }
    // A wall waits for its cooldown and the queue it is laid from must not start with one already behind
    const wallReady = this.beatsSinceWall >= WALL_COOLDOWN_BEATS;
    const open = CHUNKS.filter(c => c.minLevel <= level && (c.name !== 'wall' || wallReady));
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
        case 'obstacle': return { kind: 'obstacle', lane: step[1] ? lane(step[1]) : null };
        case 'pickup': return { kind: 'pickup', lane: lane(step[1]) };
        case 'pair': return { kind: 'pair', obstacle: lane(step[1]) };
        case 'wall': return { kind: 'wall' };
        case 'empty': return { kind: 'empty' };
      }
    });
  }
}
