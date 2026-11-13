/**
 * The fairness tests' simulated player (tests/enemies.test.ts), against the same behaviour functions the game runs.
 */
import { DASH_COOLDOWN, DASH_DURATION, DASH_SPEED_BOOST, GAME_WIDTH } from '../../src/config/constants';
import { CHASER_CUE_MS, Lane, ROACH_BACK, ROACH_FRONT, Zone } from '../../src/objects/obstacles/behaviours';
import { ENEMIES, EnemyId, TIMINGS, bodyOf, enemyState } from '../../src/objects/obstacles/cast';
import type { SlotItem } from '../../src/systems/CourseLayout';

export interface Laid { x: number; items: SlotItem[] }

// ── A player who reads the telegraphs ────────────────────────────────────

/**
 * The simulated player: it runs at a steady speed, sees an enemy once it is on screen (the chaser once its cue shows)
 * and learns of each attack when the attack telegraphs (each zone's `since`), then needs `reaction` ms to act on it (the
 * dancing boots: one pair at a time, see below). Its lane changes count from the press, as the game's do. It
 * plans lane changes against what it knows (fewest hops), replans when it learns more, and dies if the real danger
 * (known or not) catches it. Its dash only breaks walls, so everything else must be beatable with hops.
 */
export interface Sim {
  level: number;
  speed: number;
  reaction: number;
  dash: boolean;
}

const DT = 10;
const HORIZON = 300;
/** No double-taps faster than this. */
const MIN_HOP_GAP = 8;
const SCREEN_AHEAD = GAME_WIDTH - 200;
const SCREEN_BEHIND = 200;
/** The wall's hitbox: PLANK_ROWS (19) native px wide at PIXEL_BLOCK, 0.8 of it (obstacles/wall.ts). */
const WALL_HALF = (19 * 2 * 0.8) / 2;

interface Threat {
  zones: (t: number) => Zone[];
  visibleFrom: number;
  id: string;
  /** Where it is anchored: nothing reaches further than NEAR from there. A chaser has none. */
  anchor: number | null;
}

const NEAR = 700;
/** Room the player keeps round a known danger, px. */
const AVOID_MARGIN = 10;

/** On a death, what led to it: per step the roach's x, its lane (0 top, 1 bottom), each lane's danger and when it was knowable. */
export interface Trace { xs: number[]; lanes: number[]; deadly: Uint8Array[]; knownAt: Float64Array[] }

/** Survived: the roach's x and lane (0 top, 1 bottom) at every step, for what it passed on the way (the ammo model). */
export type Outcome = { died: false; xs: number[]; lanes: number[] } | { died: true; t: number; x: number; by: string; trace: Trace };

export function simulate(course: Laid[], sim: Sim, startX: number): Outcome {
  const lastX = course[course.length - 1].x + 400;
  const steps = Math.ceil(((lastX - startX) / sim.speed) * 1000 / DT);

  // The roach's path: steady, plus a dash that starts just short of each wall (and each cloud wall, whose cloud starts
  // TIMINGS.sprayWall.reach before its slot) when the dash is owned
  const walls = course.flatMap(s => s.items.flatMap(i =>
    i.kind === 'wall' ? [s.x - WALL_HALF] : i.kind === 'cloud' ? [s.x - TIMINGS.sprayWall.reach] : []));
  const xs: number[] = new Array(steps + 1);
  const invulnerable: boolean[] = new Array(steps + 1).fill(false);
  let x = startX;
  let dashFrom = -Infinity;
  let readyAt = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i * DT;
    if (sim.dash && t >= readyAt && walls.some(w => w - (x + ROACH_FRONT) > 0 && w - (x + ROACH_FRONT) < 30)) {
      dashFrom = t;
      readyAt = t + DASH_DURATION + DASH_COOLDOWN;
    }
    const dashing = t - dashFrom < DASH_DURATION;
    invulnerable[i] = dashing;
    xs[i] = x;
    x += ((sim.speed + (dashing ? DASH_SPEED_BOOST : 0)) * DT) / 1000;
  }

  const threats: Threat[] = [];
  for (const slot of course) {
    for (const item of slot.items) {
      if (item.kind === 'wall') {
        threats.push({
          id: 'wall',
          anchor: slot.x,
          visibleFrom: -Infinity,
          zones: () => (['top', 'bottom'] as const).map(lane => ({ lane, x0: slot.x - WALL_HALF, x1: slot.x + WALL_HALF, since: -Infinity })),
        });
      } else if (item.kind === 'enemy' || item.kind === 'cloud') {
        const plan = item.plan;
        const half = bodyOf(ENEMIES[plan.id as EnemyId]).half;
        let visibleFrom = Infinity;
        const anchor = plan.chase ? null : plan.x;
        for (let i = 0; i <= steps; i++) {
          if (anchor !== null && xs[i] < anchor - NEAR - SCREEN_AHEAD) continue;
          if (plan.chase && i * DT < plan.chase.startAt) continue;
          const s = enemyState(plan, i * DT);
          if (s.pose === 'parked') continue;
          const ahead = s.x - half <= xs[i] + SCREEN_AHEAD && s.x + half >= xs[i] - SCREEN_BEHIND;
          // A chaser is announced by its cue
          const cued = plan.chase !== undefined
            && xs[i] - ROACH_BACK - (s.x + half) <= ((plan.chase.speed - sim.speed) * CHASER_CUE_MS) / 1000;
          if (ahead || cued) { visibleFrom = i * DT; break; }
        }
        threats.push({ id: plan.id, anchor, visibleFrom, zones: t => enemyState(plan, t).zones });
      }
    }
  }

  // The dancing boots stomp on one beat shared by every pair, so which lane a pair leaves open is read by counting the
  // beat to the moment the roach gets there. A player counts it for one pair at a time: the next pair is read from
  // when the roach is past the one before it, not from when it came on screen
  let cleared = -Infinity;
  const dancers = threats
    .filter(t => t.anchor !== null && ENEMIES[t.id as EnemyId]?.role === 'dancer')
    .sort((a, b) => a.anchor! - b.anchor!);
  for (const threat of dancers) {
    threat.visibleFrom = Math.max(threat.visibleFrom, cleared);
    // Past the furthest any of its boots comes down
    let end = threat.anchor!;
    for (let t = 0; t < TIMINGS.boots.beat * 2; t += DT) for (const z of threat.zones(t)) end = Math.max(end, z.x1);
    const past = xs.findIndex(x => x - ROACH_BACK > end);
    cleared = past < 0 ? Infinity : past * DT;
  }

  // Per step and lane: whether it is deadly, and from when the player could know it. The player keeps a little room
  // (AVOID_MARGIN) round what it knows, as anyone does: it plans against zones that much wider than they hurt
  const lanes: Lane[] = ['top', 'bottom'];
  const deadly = lanes.map(() => new Uint8Array(steps + 1));
  const avoid = lanes.map(() => new Uint8Array(steps + 1));
  const knownAt = lanes.map(() => new Float64Array(steps + 1).fill(Infinity));
  const culprit = lanes.map(() => new Array<string>(steps + 1));
  for (let i = 0; i <= steps; i++) {
    if (invulnerable[i]) continue;
    const back = xs[i] - ROACH_BACK;
    const front = xs[i] + ROACH_FRONT;
    for (const threat of threats) {
      if (threat.anchor !== null && Math.abs(threat.anchor - xs[i]) > NEAR) continue;
      for (const z of threat.zones(i * DT)) {
        if (z.x1 + AVOID_MARGIN < back || z.x0 - AVOID_MARGIN > front) continue;
        const l = z.lane === 'top' ? 0 : 1;
        avoid[l][i] = 1;
        knownAt[l][i] = Math.min(knownAt[l][i], Math.max(z.since, threat.visibleFrom));
        if (z.x1 < back || z.x0 > front) continue;
        deadly[l][i] = 1;
        culprit[l][i] = threat.id;
      }
    }
  }

  let lane = 1;
  const lanesTaken: number[] = [];
  let sinceHop = MIN_HOP_GAP;
  let plan: number[] = [];
  let planFrom = 0;
  const known = (l: number, j: number, now: number): boolean => avoid[l][j] === 1 && knownAt[l][j] <= now - sim.reaction;

  const replan = (i: number, now: number): void => {
    const end = Math.min(steps, i + HORIZON);
    const n = end - i + 1;
    const G = MIN_HOP_GAP;
    // cost[j][l][g]: fewest hops from step i+j in lane l, g steps since the last hop
    const INF = 1e9;
    const cost: Float64Array[] = Array.from({ length: n + 1 }, () => new Float64Array(2 * (G + 1)).fill(0));
    for (let j = n - 1; j >= 0; j--) {
      const step = i + j;
      for (let l = 0; l < 2; l++) {
        for (let g = 0; g <= G; g++) {
          const k = l * (G + 1) + g;
          if (known(l, step, now)) { cost[j][k] = INF; continue; }
          const stay = cost[j + 1][l * (G + 1) + Math.min(G, g + 1)];
          const hop = g >= G ? 1 + cost[j + 1][(1 - l) * (G + 1)] : INF;
          cost[j][k] = Math.min(stay, hop);
        }
      }
    }
    plan = [];
    planFrom = i;
    // Each step's lane is chosen just before it, the first one included: a hop counts from the press
    let l = lane;
    let g = sinceHop;
    for (let j = 0; j < n; j++) {
      const stay = cost[j][l * (G + 1) + Math.min(G, g + 1)];
      const hop = g >= G ? 1 + cost[j][(1 - l) * (G + 1)] : INF;
      if (hop < stay) { l = 1 - l; g = 0; } else g = Math.min(G, g + 1);
      plan.push(l);
    }
  };

  for (let i = 0; i <= steps; i++) {
    const now = i * DT;
    const p = i - planFrom;
    const stale = plan.length === 0 || p >= plan.length - 100
      || plan.some((l, j) => j >= p && known(l, planFrom + j, now));
    if (stale) { replan(i, now); if (process.env.SIM_DEBUG) console.log("replan", now, plan.filter((_, j) => j % 10 === 0).join("")); }
    const want = plan[i - planFrom];
    if (want !== lane) { lane = want; sinceHop = 0; } else sinceHop = Math.min(MIN_HOP_GAP, sinceHop + 1);
    lanesTaken.push(lane);
    if (deadly[lane][i]) return { died: true, t: now, x: xs[i], by: culprit[lane][i], trace: { xs, lanes: lanesTaken, deadly, knownAt } };
  }
  return { died: false, xs, lanes: lanesTaken };
}

