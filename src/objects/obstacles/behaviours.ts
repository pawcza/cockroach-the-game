/**
 * What the run's enemies do, as pure functions of the run clock: where an enemy is, which lane it threatens, whether it
 * hurts right now and since when that was readable. The game draws and collides from these, and the fairness tests
 * simulate a player against the very same functions. Phaser-free.
 *
 * Every client of a match evaluates them at about the same run time, so an enemy stands in the same place on every
 * screen: nothing here may read the player, a timer started at spawn, or Math.random.
 */
import { FLOOR_BOTTOM_Y, FLOOR_TOP_Y, PIXEL_BLOCK } from '../../config/constants';

export type Lane = 'top' | 'bottom';

export const otherLane = (lane: Lane): Lane => (lane === 'top' ? 'bottom' : 'top');

/** Obstacles stand this far into the floor's top edge, like the roach's feet. */
export const OBSTACLE_SINK = 6;

/** Where an enemy's baseline sits when it stands on this lane. */
export const laneY = (lane: Lane): number => (lane === 'top' ? FLOOR_TOP_Y : FLOOR_BOTTOM_Y) + OBSTACLE_SINK;

/** The roach's hitbox along the run, from its x: ROACH_BODY in config/sprites.ts (columns 26 to 66 of 88, centre 44). */
export const ROACH_BACK = 36;
export const ROACH_FRONT = 44;

/** An enemy lower than this over its lane (baseline px) is into the roach's body: below it, it hurts. */
const STRIKE_HEIGHT = 40;

/** Transparent margin around the atlas frames that holds their glow (GLOW_PAD in config/sprites.ts). */
const GLOW_PAD = 8;

/** Its frame in the atlas, in native px, and where its baseline is: enough to place and size its hitbox. */
export interface Art { w: number; h: number; pivotY: number }

/** The physics body's width in world px, as fitBody makes it. */
export const bodyWidth = (art: Art, ratio: { w: number }): number => (art.w - GLOW_PAD * 2) * ratio.w * PIXEL_BLOCK;

/** The body's top and bottom against the sprite's baseline y (centred in the art, as fitBody(..., true) puts it). */
export function bodySpan(art: Art, ratio: { h: number }): { top: number; bottom: number } {
  const half = ((art.h - GLOW_PAD * 2) * ratio.h) / 2;
  const base = art.pivotY * art.h;
  return { top: (art.h / 2 - half - base) * PIXEL_BLOCK, bottom: (art.h / 2 + half - base) * PIXEL_BLOCK };
}

export type Pose = 'idle' | 'windup' | 'strike' | 'recover' | 'air' | 'parked';

/** A stretch of a lane where it hurts, and the run time from which a player could read that it would. */
export interface Zone {
  lane: Lane;
  x0: number;
  x1: number;
  since: number;
}

export interface EnemyState {
  /** The sprite's position: x along the run, y its baseline. */
  x: number;
  y: number;
  /** The lane it is in or over (its shadow's), or null up high or between the lanes. */
  lane: Lane | null;
  /** Hurts on contact now: in its lane, low enough to hit. */
  danger: boolean;
  pose: Pose;
  /** How many of its cycles have begun: a new strike is a new number. */
  cycle: number;
  zones: Zone[];
  /** For an enemy drawn pose by pose (the swatters): which frame of its strip. */
  frame?: number;
  /** Far back in the scene: drawn behind both ledges. */
  behind?: boolean;
  /** A swatter's landing spot on the lane, and how far its approach has come (0 none, 1 about to land): the spot's shadow. */
  mark?: { lane: Lane; x: number; progress: number };
  /** More than one such spot (the boots, one per lane). */
  marks?: { lane: Lane; x: number; progress: number }[];
  /** The other things it is made of, each where and how it is now (the bleach's drop and splash). */
  parts?: Record<string, Part>;
  /** A stretch of lane it warns of: one it is about to close (the mop's sweep, the light's lane). */
  warn?: { lane: Lane; x0: number; x1: number; level: number };
}

/** One piece of a many-piece enemy: where it is, which frame, whether it shows, whether it hurts. */
export interface Part {
  x: number;
  y: number;
  frame: number;
  visible: boolean;
  danger: boolean;
}

/** One enemy as the course laid it: what, where, the lane it starts from and where in its rhythm. */
export interface EnemyPlan {
  id: string;
  x: number;
  lane: Lane;
  /** ms into its cycle at run time 0. */
  phase: number;
  /** A chaser's run: from when it runs, the moment it meets the course's nominal runner at x, and its speed. */
  chase?: { startAt: number; meetAt: number; speed: number };
}

export interface Body {
  /** Half the hitbox width, world px. */
  half: number;
  art: Art;
  hitbox: { w: number; h: number };
}

export type Behaviour = (plan: EnemyPlan, t: number, body: Body) => EnemyState;

// ── Timing helpers ──────────────────────────────────────────────────────

type Segments = readonly (readonly [string, number])[];

interface Moment {
  /** Which cycle, and when it began (run time). */
  k: number;
  start: number;
  /** The segment, how far through it (0 to 1), and when it began. */
  seg: string;
  p: number;
  segStart: number;
  /** When a named segment of this cycle begins. */
  at: (name: string) => number;
}

/** A rhythm: its segments in order, each one's offset into the cycle, and the cycle's length. */
interface Rhythm { segs: Segments; offsets: Map<string, number>; total: number }

function rhythm(segs: Segments): Rhythm {
  const offsets = new Map<string, number>();
  let total = 0;
  for (const [name, ms] of segs) { offsets.set(name, total); total += ms; }
  return { segs, offsets, total };
}

function moment(t: number, phase: number, r: Rhythm): Moment {
  const s = t + phase;
  const k = Math.floor(s / r.total);
  const start = k * r.total - phase;
  const at = (name: string): number => start + r.offsets.get(name)!;
  let u = s - k * r.total;
  for (const [name, ms] of r.segs) {
    if (u < ms) return { k, start, seg: name, p: u / ms, segStart: at(name), at };
    u -= ms;
  }
  const [name] = r.segs[r.segs.length - 1];
  return { k, start, seg: name, p: 1, segStart: at(name), at };
}

const easeOut = (p: number): number => 1 - (1 - p) * (1 - p);
const easeIn = (p: number): number => p * p;
const easeInOut = (p: number): number => (1 - Math.cos(Math.PI * p)) / 2;
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
/** A small shiver on the run clock: the wind-up's tremble. */
const shiver = (t: number, px: number): number => Math.sin(t / 14) * px;
/** The lane a lane-alternating enemy takes on cycle k. */
const alternate = (start: Lane, k: number): Lane => (((k % 2) + 2) % 2 === 0 ? start : otherLane(start));

function zone(lane: Lane, x: number, body: Body, since: number, reach = 0): Zone {
  return { lane, x0: x - body.half - reach, x1: x + body.half, since };
}

function state(x: number, y: number, lane: Lane | null, pose: Pose, cycle: number, zones: Zone[]): EnemyState {
  return { x, y, lane, danger: zones.length > 0, pose, cycle, zones };
}

/** Low enough over its lane to hit: the strikers' rule, what you see is what hurts. */
const low = (y: number, lane: Lane): boolean => laneY(lane) - y < STRIKE_HEIGHT;

// ── Behaviours ──────────────────────────────────────────────────────────

/** Sits in its lane. */
export const blocker: Behaviour = (plan, _t, body) =>
  state(plan.x, laneY(plan.lane), plan.lane, 'idle', 0, [zone(plan.lane, plan.x, body, -Infinity)]);

/**
 * Stands in its lane (a blocker, unless `solid` is off) and on a rhythm, after a tremble, closes a stretch of the lane
 * ahead of it (`reach` px towards the runner) for a moment. A reach of Infinity closes the whole lane: the one kind of
 * hazard that may show a lane strip.
 */
export function sweeper(t: { idle: number; windup: number; sweep: number; reach: number; solid: boolean }): Behaviour {
  const segs = rhythm([['idle', t.idle], ['windup', t.windup], ['sweep', t.sweep]]);
  return (plan, time, body) => {
    const m = moment(time, plan.phase, segs);
    const pose: Pose = m.seg === 'windup' ? 'windup' : m.seg === 'sweep' ? 'strike' : 'idle';
    // The wind-up: a tremble and little jumps on the spot, the can building pressure
    const x = plan.x + (m.seg === 'windup' ? shiver(time, 2) : 0);
    const hop = m.seg === 'windup' ? Math.abs(Math.sin(time / 40)) * 4 : 0;
    const zones: Zone[] = t.solid ? [zone(plan.lane, x, body, -Infinity)] : [];
    if (m.seg === 'sweep') {
      const since = m.at('windup');
      zones.push(t.reach === Infinity
        ? { lane: plan.lane, x0: -Infinity, x1: Infinity, since }
        : { lane: plan.lane, x0: x - body.half - t.reach, x1: x - body.half, since });
    }
    return state(x, laneY(plan.lane) - hop, plan.lane, pose, m.k, zones);
  };
}

/** The swatters' strip (tools/art/swatters.py): far, windback, three swing poses, impact, landed, two peel poses. */
export const SWAT_FRAMES = { far: 0, windback: 1, swing: [2, 3, 4], impact: 5, landed: 6, peel: [7, 8] } as const;

/**
 * How a hand kills a cockroach on a shelf: the slipper (or the rolled paper) waits far back in the room over its lane,
 * small and dim; it is pulled back, swings in towards the camera, growing, and lands flat along the lane with a slap,
 * covering `footprint` px of it; a moment later it peels up and goes back into the room. Its landing spot shows a
 * shadow from the wind-back on, growing and darkening until the slap. It hurts only at the slap and just after, never
 * while far or lifting. With `alternate` it takes the lanes in turns, so the lane it waits over is the one it hits.
 */
export function depthSwat(t: {
  idle: number; windup: number; swing: number; slap: number; down: number; peel: number; recede: number;
  footprint: number; alternate: boolean;
}): Behaviour {
  const segs = rhythm([
    ['idle', t.idle], ['windup', t.windup], ['swing', t.swing], ['slap', t.slap], ['down', t.down], ['peel', t.peel],
    ['recede', t.recede],
  ]);
  // Far back over a lane: higher (further) over the upper lane; over the lower one it stays below the upper ledge
  const far = (lane: Lane): { x: number; y: number } => ({ x: 22, y: laneY(lane) - (lane === 'top' ? 104 : 56) });
  const half = t.footprint / 2;
  return (plan, time) => {
    const m = moment(time, plan.phase, segs);
    const lane = t.alternate ? alternate(plan.lane, m.k) : plan.lane;
    const next = t.alternate ? otherLane(lane) : lane;
    const home = far(lane);
    const back = { x: home.x + 10, y: home.y - 10 };
    let x = home.x + Math.sin(time / 300) * 2;
    let y = home.y + Math.sin(time / 210) * 2;
    let frame: number = SWAT_FRAMES.far;
    let behind = true;
    let pose: Pose = 'idle';
    let progress = 0;
    switch (m.seg) {
      case 'windup':
        x = lerp(home.x, back.x, easeOut(m.p));
        y = lerp(home.y, back.y, easeOut(m.p));
        frame = SWAT_FRAMES.windback;
        pose = 'windup';
        progress = .25 * m.p;
        break;
      case 'swing': {
        const p = easeIn(m.p);
        x = lerp(back.x, 0, p);
        y = lerp(back.y, laneY(lane), p);
        frame = SWAT_FRAMES.swing[Math.min(2, Math.floor(m.p * 3))];
        behind = m.p < .55;
        pose = 'windup';
        progress = .25 + .75 * m.p;
        break;
      }
      case 'slap': x = 0; y = laneY(lane); frame = SWAT_FRAMES.impact; behind = false; pose = 'strike'; progress = 1; break;
      case 'down':
        // A small bounce off the ledge
        x = 0; y = laneY(lane) - 2 * Math.sin(Math.PI * Math.min(1, m.p * 2)); frame = SWAT_FRAMES.landed;
        behind = false; pose = 'strike'; progress = 1;
        break;
      case 'peel':
        x = 6 * m.p; y = laneY(lane) - 22 * easeOut(m.p);
        frame = SWAT_FRAMES.peel[m.p < .5 ? 0 : 1]; behind = m.p > .6; pose = 'recover'; progress = 1 - m.p;
        break;
      case 'recede': {
        const to = far(next);
        x = lerp(6, to.x, easeInOut(m.p)); y = lerp(laneY(lane) - 22, to.y, easeInOut(m.p));
        frame = m.p < .5 ? SWAT_FRAMES.peel[1] : SWAT_FRAMES.far; pose = 'recover';
        break;
      }
    }
    const over: Lane = m.seg === 'recede' && m.p >= .5 ? next : lane;
    const hits = m.seg === 'slap' || m.seg === 'down';
    const zones = hits ? [{ lane, x0: plan.x - half, x1: plan.x + half, since: m.at('windup') }] : [];
    const st = state(plan.x + x, y, over, pose, m.k, zones);
    st.frame = frame;
    st.behind = behind;
    if (progress > 0) st.mark = { lane, x: plan.x, progress };
    return st;
  };
}

/**
 * Circles high, out of reach; then a dive pose (rising, drawing back) over the lane it is about to hit, a dive, a glide
 * along that lane towards the runner and a climb back up. The lanes take turns.
 */
export function swoop(t: { circle: number; windup: number; dive: number; glide: number; climb: number; high: number; glideDx: number }): Behaviour {
  const segs = rhythm([['circle', t.circle], ['windup', t.windup], ['dive', t.dive], ['glide', t.glide], ['climb', t.climb]]);
  const highY = laneY('top') - t.high;
  const diveDx = -10;
  return (plan, time, body) => {
    const m = moment(time, plan.phase, segs);
    const lane = alternate(plan.lane, m.k);
    let x = 0;
    let y = highY;
    let over: Lane | null = null;
    let pose: Pose = 'idle';
    switch (m.seg) {
      case 'circle': {
        const a = m.p * Math.PI * 2;
        x = 20 * Math.cos(a);
        y = highY + 8 * Math.sin(a);
        break;
      }
      case 'windup': x = 20 + 10 * easeOut(m.p); y = highY - 12 * easeOut(m.p); over = lane; pose = 'windup'; break;
      case 'dive': x = lerp(30, diveDx, m.p); y = lerp(highY - 12, laneY(lane), easeIn(m.p)); over = lane; pose = 'strike'; break;
      case 'glide': x = lerp(diveDx, diveDx + t.glideDx, m.p); y = laneY(lane); over = lane; pose = 'strike'; break;
      case 'climb':
        x = lerp(diveDx + t.glideDx, 20, easeInOut(m.p));
        y = lerp(laneY(lane), highY, easeOut(m.p));
        over = low(y, lane) ? lane : null;
        pose = 'recover';
        break;
    }
    x += plan.x;
    const zones = over === lane && low(y, lane) ? [zone(lane, x, body, m.at('windup'))] : [];
    return state(x, y, over, pose, m.k, zones);
  };
}

/**
 * Sits in its home lane; crouches, pounces over to the other lane, holds there a moment and springs back. Harmless in
 * the air only.
 */
export function pounce(t: { sit: number; crouch: number; leap: number; stay: number; back: number }): Behaviour {
  const segs = rhythm([['sit', t.sit], ['crouch', t.crouch], ['leap', t.leap], ['stay', t.stay], ['back', t.back]]);
  const arc = 28;
  return (plan, time, body) => {
    const m = moment(time, plan.phase, segs);
    const home = plan.lane;
    const away = otherLane(home);
    let x = plan.x;
    let y = laneY(home);
    let lane: Lane | null = home;
    let pose: Pose = 'idle';
    let since = m.start - t.stay - t.back;   // back home: readable since it landed over there
    switch (m.seg) {
      // Sinks into a crouch and draws back, trembling, then springs
      case 'crouch': y += 8 * easeOut(m.p); x += 12 * easeOut(m.p) + shiver(time, 2); pose = 'windup'; break;
      case 'leap': y = lerp(laneY(home), laneY(away), easeInOut(m.p)) - arc * Math.sin(Math.PI * m.p); x += 12 * (1 - m.p); lane = null; pose = 'air'; break;
      case 'stay': y = laneY(away); lane = away; pose = 'strike'; since = m.at('crouch'); break;
      case 'back': y = lerp(laneY(away), laneY(home), easeInOut(m.p)) - arc * Math.sin(Math.PI * m.p); lane = null; pose = 'air'; break;
    }
    return state(x, y, lane, pose, m.k, lane ? [zone(lane, x, body, since)] : []);
  };
}

/** Stands in its lane, paws and leans back, rushes along the lane at the runner, halts and walks back. Always solid. */
export function charger(t: { stand: number; paw: number; rush: number; halt: number; back: number; distance: number }): Behaviour {
  const segs = rhythm([['stand', t.stand], ['paw', t.paw], ['rush', t.rush], ['halt', t.halt], ['back', t.back]]);
  return (plan, time, body) => {
    const m = moment(time, plan.phase, segs);
    let dx = 0;
    let pose: Pose = 'idle';
    let since = -Infinity;
    switch (m.seg) {
      // Pawing it still stands where it stood, in plain view
      case 'paw': dx = 12 * easeOut(m.p) + shiver(time, 2); pose = 'windup'; break;
      case 'rush': dx = lerp(12, -t.distance, easeIn(m.p)); pose = 'strike'; since = m.at('paw'); break;
      case 'halt': dx = -t.distance; pose = 'strike'; since = m.at('paw'); break;
      case 'back': dx = -t.distance * (1 - easeInOut(m.p)); pose = 'recover'; break;
    }
    const x = plan.x + dx;
    return state(x, laneY(plan.lane), plan.lane, pose, m.k, [zone(plan.lane, x, body, since)]);
  };
}

/**
 * A chaser's cue shows at the left edge from this long before it would reach the roach at the speed it gains: about a
 * second before it runs onto the screen, which it crosses in about another before it reaches the roach.
 */
export const CHASER_CUE_MS = 2500;

/**
 * Comes from behind: runs along the run faster than the course's runner, from `chase.startAt`, passing it at
 * `chase.meetAt` by the slot's x. On a rhythm it crouches and jumps to the other lane (harmless in the air).
 */
export function chaser(t: { run: number; windup: number; jump: number }): Behaviour {
  const segs = rhythm([['run', t.run], ['windup', t.windup], ['jump', t.jump]]);
  return (plan, time, body) => {
    const chase = plan.chase!;
    const x = plan.x + chase.speed * (time - chase.meetAt) / 1000;
    if (time < chase.startAt) return state(x, laneY(plan.lane), null, 'parked', 0, []);
    const m = moment(time, plan.phase, segs);
    const lane = alternate(plan.lane, m.k);
    const since = Math.max(chase.startAt, m.start - t.jump - t.windup);
    if (m.seg === 'jump') {
      return state(x, lerp(laneY(lane), laneY(otherLane(lane)), easeInOut(m.p)), null, 'air', m.k, []);
    }
    // Before it jumps lanes it crouches low and trembles
    const crouch = m.seg === 'windup';
    const cx = x + (crouch ? shiver(time, 1.5) : 0);
    return state(cx, laneY(lane) + (crouch ? 6 * easeOut(m.p) : 0), lane, crouch ? 'windup' : 'idle', m.k, [zone(lane, cx, body, since)]);
  };
}

/**
 * Floats between the two lanes and back, eased, hurting wherever its body meets the roach's. Where in its swing it is
 * comes from the run clock and the lane it set off from (ObstacleKit.swing did the same).
 */
export function floater(t: { half: number }): Behaviour {
  return (plan, time, body) => {
    const from = laneY(plan.lane);
    const to = laneY(otherLane(plan.lane));
    const offset = (Math.abs(Math.round(from)) * 37) % (t.half * 2);
    const u = ((time + offset) % (t.half * 2)) / t.half;
    const there = u <= 1 ? u : 2 - u;
    const y = from + (to - from) * easeInOut(there);
    const span = bodySpan(body.art, body.hitbox);
    const zones: Zone[] = [];
    for (const lane of ['top', 'bottom'] as const) {
      // The roach's box on that lane: its feet on the collider, 8 px under the ledge's top, 52 px tall
      const feet = laneY(lane) + 2;
      if (y + span.bottom > feet - 52 && y + span.top < feet) zones.push(zone(lane, plan.x, body, -Infinity));
    }
    return state(plan.x, y, null, 'idle', 0, zones);
  };
}

/** Out of both lanes; what it does is pull (not modelled here). */
export const still: Behaviour = (plan) => state(plan.x, laneY(plan.lane), null, 'idle', 0, []);

// ── The hop act ─────────────────────────────────────────────────────────

/**
 * A jug of bleach lying tipped at the back of the upper ledge, its cap over the lower lane: a drop swells at the cap,
 * falls and splashes on one spot of the lower lane, leaving a puddle a moment. The jug itself is out of the way (the
 * upper lane runs in front of it); the lower lane hurts only at the splash spot, only while it is wet. The swelling
 * drop is the telegraph, on the enemy.
 */
export function drip(t: { idle: number; swell: number; fall: number; splash: number; puddle: number; spot: number; jugDx: number }): Behaviour {
  const segs = rhythm([['idle', t.idle], ['swell', t.swell], ['fall', t.fall], ['splash', t.splash], ['puddle', t.puddle]]);
  const capY = laneY('top') + 6;
  return (plan, time) => {
    const m = moment(time, plan.phase, segs);
    let pose: Pose = 'idle';
    const drop: Part = { x: plan.x, y: capY, frame: 0, visible: false, danger: false };
    const splash: Part = { x: plan.x, y: laneY('bottom'), frame: 0, visible: false, danger: false };
    switch (m.seg) {
      case 'swell': drop.visible = true; drop.frame = Math.min(2, Math.floor(m.p * 3)); pose = 'windup'; break;
      case 'fall': drop.visible = true; drop.frame = 3; drop.y = lerp(capY, laneY('bottom') - 24, easeIn(m.p)); pose = 'windup'; break;
      case 'splash': splash.visible = true; splash.frame = m.p < .4 ? 0 : 1; splash.danger = true; pose = 'strike'; break;
      case 'puddle': splash.visible = true; splash.frame = 2; splash.danger = true; pose = 'recover'; break;
    }
    const zones: Zone[] = splash.danger
      ? [{ lane: 'bottom', x0: plan.x - t.spot / 2, x1: plan.x + t.spot / 2, since: m.at('swell') }]
      : [];
    // The jug lies to the right of its cap, which is over the spot (plan.x)
    const st = state(plan.x + t.jugDx, laneY('top'), 'bottom', pose, m.k, zones);
    st.parts = { drop, splash };
    // Where it will land: a spot on the lower lane, darkening as the drop swells and falls
    if (m.seg === 'swell') st.mark = { lane: 'bottom', x: plan.x, progress: .6 * m.p };
    if (m.seg === 'fall') st.mark = { lane: 'bottom', x: plan.x, progress: .6 + .4 * m.p };
    return st;
  };
}

/**
 * A bare bulb over a lane. Dark, then it flickers (on and off, a faint light on its lane: the warning), then snaps on
 * and floods its whole lane with light for a moment: anything in that lane is seen. The one hazard of the hop act that
 * closes a lane end to end, so its lane shows a warning band while it flickers. End to end is as far as the screen
 * goes while the bulb is on it: from `ahead` px before it (the bulb just in at the right edge) to `behind` px after it
 * (the bulb just gone at the left), so a bulb off the screen lights nothing you can be in.
 */
export function light(t: { dark: number; flicker: number; on: number; ahead: number; behind: number }): Behaviour {
  const segs = rhythm([['dark', t.dark], ['flicker', t.flicker], ['on', t.on]]);
  return (plan, time) => {
    const m = moment(time, plan.phase, segs);
    let frame = 0;
    let pose: Pose = 'idle';
    const zones: Zone[] = [];
    if (m.seg === 'flicker') {
      // Three stutters, closer together as it comes on
      const u = m.p;
      frame = (u > .15 && u < .25) || (u > .45 && u < .55) || (u > .7 && u < .78) || u > .9 ? 1 : 0;
      pose = 'windup';
    } else if (m.seg === 'on') {
      frame = 1;
      pose = 'strike';
      zones.push({ lane: plan.lane, x0: plan.x - t.ahead, x1: plan.x + t.behind, since: m.at('flicker') });
    }
    const st = state(plan.x, laneY(plan.lane), plan.lane, pose, m.k, zones);
    st.frame = frame;
    if (pose !== 'idle') {
      st.warn = { lane: plan.lane, x0: plan.x - t.ahead, x1: plan.x + t.behind, level: pose === 'strike' ? 1 : frame ? .5 : .2 };
    }
    return st;
  };
}

/**
 * The mop: raised over its lane ahead of its spot, dripping suds; it presses down and sweeps along the lane towards the
 * runner, closing the stretch it passes, then lifts and goes back. The stretch it is about to sweep shows a warning.
 */
export function mopSweep(t: { wait: number; windup: number; press: number; sweep: number; lift: number; back: number; from: number; to: number; raise: number }): Behaviour {
  const segs = rhythm([['wait', t.wait], ['windup', t.windup], ['press', t.press], ['sweep', t.sweep], ['lift', t.lift], ['back', t.back]]);
  return (plan, time, body) => {
    const m = moment(time, plan.phase, segs);
    let dx = t.from;
    let lift = t.raise;
    let frame = 0;
    let pose: Pose = 'idle';
    switch (m.seg) {
      case 'windup': frame = Math.floor(time / 120) % 2; pose = 'windup'; lift = t.raise + 4 * Math.sin(time / 50); break;
      case 'press': lift = t.raise * (1 - easeIn(m.p)); frame = 2; pose = 'windup'; break;
      case 'sweep': lift = 0; dx = lerp(t.from, t.to, m.p); frame = 2 + (Math.floor(time / 90) % 2); pose = 'strike'; break;
      case 'lift': lift = t.raise * easeOut(m.p); dx = t.to; frame = 2; pose = 'recover'; break;
      case 'back': dx = lerp(t.to, t.from, easeInOut(m.p)); pose = 'recover'; break;
    }
    const x = plan.x + dx;
    const zones = m.seg === 'sweep' ? [zone(plan.lane, x, body, m.at('windup'))] : [];
    const st = state(x, laneY(plan.lane) - lift, plan.lane, pose, m.k, zones);
    st.frame = frame;
    if (m.seg === 'windup' || m.seg === 'press' || m.seg === 'sweep') {
      // What is left to sweep: from the head to the end of its run
      st.warn = { lane: plan.lane, x0: plan.x + t.to - body.half, x1: x + body.half, level: m.seg === 'sweep' ? 1 : .6 };
    }
    return st;
  };
}


// ── The dash act ────────────────────────────────────────────────────────

/** The nominal runner's position near a plan's meeting time: its slot at `meetAt`, at its speed there. */
const nominalX = (plan: EnemyPlan, time: number): number =>
  plan.x + plan.chase!.speed * (time - plan.chase!.meetAt) / 1000;

/**
 * The vacuum cleaner, from behind. From `chase.startAt` its nozzle closes in on the course's nominal runner along its
 * lane until it is `close` px behind the runner's tail, holds there a while, then falls back and is gone. It doesn't
 * outrun anyone: what kills is its suction (the game drags a roach in its lane back towards the nozzle while it is
 * within `reach`). It swings its nozzle to the other lane at fixed moments, with a wind-up. Its zones are the nozzle
 * plus the stretch it pulls from: a roach that stays out of them is never pulled, so hops alone answer it; a dash
 * carries a roach clear of the reach for good (it only ever tracks the nominal runner).
 */
export function suck(t: {
  approach: number; hold: number; fallBack: number; start: number; close: number; reach: number;
  swings: readonly number[]; swingWarn: number; swingMove: number; length: number;
}): Behaviour {
  return (plan, time, body) => {
    const chase = plan.chase!;
    const s = time - chase.startAt;
    const gap = s < t.approach ? lerp(t.start, t.close, easeOut(Math.max(0, s / t.approach)))
      : s < t.approach + t.hold ? t.close
        : t.close + ((s - t.approach - t.hold) / 1000) * t.fallBack;
    const nozzle = nominalX(plan, time) - ROACH_BACK - gap;
    const x = nozzle - body.half;
    if (time < chase.startAt) return state(x, laneY(plan.lane), null, 'parked', 0, []);
    // Its lane: it swings at fixed moments after it starts, each announced by a wind-up
    let lane: Lane = plan.lane;
    let pose: Pose = 'idle';
    let since = chase.startAt;
    for (const at of t.swings) {
      const sw = chase.startAt + at;
      if (time >= sw + t.swingMove) { lane = otherLane(lane); since = sw - t.swingWarn; continue; }
      if (time >= sw) {
        return state(x, lerp(laneY(lane), laneY(otherLane(lane)), easeInOut((time - sw) / t.swingMove)), null, 'air', 0, []);
      }
      if (time >= sw - t.swingWarn) pose = 'windup';
      break;
    }
    const gone = s > t.approach + t.hold + 4000;
    const zones: Zone[] = gone ? [] : [{ lane, x0: nozzle - t.length, x1: nozzle + t.reach, since }];
    const st = state(x, laneY(lane), lane, pose, 0, zones);
    st.frame = Math.floor(time / 50) % 2;
    return st;
  };
}

/**
 * The hen stands on the upper ledge, blocking that lane, and on a rhythm rears back (the cluck, the telegraph) and
 * pecks a spot of the lower lane well in front of her, her head darting down and back. Only that spot hurts below,
 * only while her beak is there; far enough in front that a roach can pass it up top and drop down before her.
 */
export function peck(t: { idle: number; windup: number; peck: number; hold: number; back: number; ahead: number; spot: number }): Behaviour {
  const segs = rhythm([['idle', t.idle], ['windup', t.windup], ['peck', t.peck], ['hold', t.hold], ['back', t.back]]);
  return (plan, time, body) => {
    const m = moment(time, plan.phase, segs);
    let dx = 0;
    let frame = 0;
    let pose: Pose = 'idle';
    let reachP = 0;
    switch (m.seg) {
      case 'windup': dx = 6 * easeOut(m.p); frame = 1; pose = 'windup'; break;
      case 'peck': reachP = easeIn(m.p); pose = 'strike'; break;
      case 'hold': reachP = 1; pose = 'strike'; break;
      case 'back': reachP = 1 - easeOut(m.p); pose = 'recover'; break;
    }
    const x = plan.x + dx;
    const spot = plan.x - t.ahead;
    const zones: Zone[] = [zone('top', x, body, -Infinity)];
    const pecking = m.seg === 'hold' || (m.seg === 'peck' && m.p > .7);
    if (pecking) zones.push({ lane: 'bottom', x0: spot - t.spot / 2, x1: spot + t.spot / 2, since: m.at('windup') });
    const st = state(x, laneY('top'), 'top', pose, m.k, zones);
    st.frame = frame;
    // The head, from her neck (in front of her, chest high) to the spot on the lower lane
    const neck = { x: x - body.half * .5, y: laneY('top') - 58 };
    st.parts = {
      head: { x: lerp(neck.x, spot, reachP), y: lerp(neck.y, laneY('bottom') - 4, reachP), frame: 0, visible: reachP > 0, danger: pecking },
      neck: { x: neck.x, y: neck.y, frame: 0, visible: reachP > 0, danger: false },
    };
    if (m.seg === 'windup') st.mark = { lane: 'bottom', x: spot, progress: m.p };
    if (pecking) st.mark = { lane: 'bottom', x: spot, progress: 1 };
    return st;
  };
}

/**
 * The frog sits in its lane (blocking it); its throat swells and its mouth opens (the telegraph, with a warning along
 * the stretch it will lick), then its tongue shoots `reach` px along its lane at the runner, holds and snaps back.
 */
export function tongue(t: { idle: number; windup: number; shoot: number; hold: number; back: number; reach: number; mouth: number }): Behaviour {
  const segs = rhythm([['idle', t.idle], ['windup', t.windup], ['shoot', t.shoot], ['hold', t.hold], ['back', t.back]]);
  return (plan, time, body) => {
    const m = moment(time, plan.phase, segs);
    let len = 0;
    let frame = 0;
    let pose: Pose = 'idle';
    let dy = 0;
    switch (m.seg) {
      case 'windup': frame = 1; pose = 'windup'; dy = Math.round(Math.abs(Math.sin(time / 45)) * 2) * 2; break;
      case 'shoot': len = t.reach * easeOut(m.p); frame = 1; pose = 'strike'; break;
      case 'hold': len = t.reach; frame = 1; pose = 'strike'; break;
      case 'back': len = t.reach * (1 - easeIn(m.p)); frame = 1; pose = 'recover'; break;
    }
    const mouth = plan.x - t.mouth;
    const zones: Zone[] = [zone(plan.lane, plan.x, body, -Infinity)];
    if (len > 0) zones.push({ lane: plan.lane, x0: mouth - len, x1: mouth, since: m.at('windup') });
    const st = state(plan.x, laneY(plan.lane) - dy, plan.lane, pose, m.k, zones);
    st.frame = frame;
    st.parts = { tip: { x: mouth - len, y: laneY(plan.lane) - 14, frame: 0, visible: len > 0, danger: len > 0 } };
    if (m.seg === 'windup' || len > 0) st.warn = { lane: plan.lane, x0: mouth - t.reach, x1: mouth, level: len > 0 ? 1 : .5 };
    return st;
  };
}

/**
 * The house centipede runs at the runner along a lane from far ahead, fast, and switches lanes once or twice on the
 * way, rearing up first (the telegraph). Timed off the course's nominal runner (it meets it at its slot), so its lane
 * at every moment is the same for everyone.
 */
export function scuttle(t: { speed: number; from: number; switches: readonly number[]; warn: number; jump: number }): Behaviour {
  return (plan, time, body) => {
    const chase = plan.chase!;
    const x = plan.x - t.speed * (time - chase.meetAt) / 1000;
    if (x - plan.x > t.from) return state(x, laneY(plan.lane), null, 'parked', 0, []);
    // Two switches, or one, from the phase drawn at spawn
    const switches = plan.phase % 2 === 0 ? t.switches : t.switches.slice(1);
    let lane: Lane = plan.lane;
    let pose: Pose = 'idle';
    let since = -Infinity;
    for (const before of switches) {
      const at = chase.meetAt - before;
      if (time >= at + t.jump) { lane = otherLane(lane); since = at - t.warn; continue; }
      if (time >= at) return state(x, lerp(laneY(lane), laneY(otherLane(lane)), easeInOut((time - at) / t.jump)), null, 'air', 0, []);
      if (time >= at - t.warn) pose = 'windup';
      break;
    }
    const st = state(x, laneY(lane) - (pose === 'windup' ? 6 : 0), lane, pose, 0, [zone(lane, x, body, since)]);
    st.frame = Math.floor(time / 70) % 2;
    return st;
  };
}

/**
 * A pair of dancing boots at one x, one over each lane, stomping in turn on one beat shared by every pair (a row of
 * them is one dance): the boot that is up hangs over its lane, its shadow where it will land; it comes down, stays a
 * moment and lifts as the other comes down. Each stomp hurts only under that boot.
 */
export function stomp(t: { beat: number; down: number; lift: number; height: number }): Behaviour {
  return (plan, time, body) => {
    const cycle = t.beat * 2;
    const boot = (lane: Lane, offset: number): { part: Part; zone?: Zone; progress: number } => {
      const v = (((time - offset) % cycle) + cycle) % cycle;  // ms since this boot came down
      const down = v < t.down;
      const fall = 90;
      let lift = t.height + 2 * Math.sin(time / 90);
      if (down) lift = 0;
      else if (v < t.down + t.lift) lift = t.height * easeOut((v - t.down) / t.lift);
      else if (v > cycle - fall) lift = t.height * (cycle - v) / fall;
      const x = plan.x + (lane === 'top' ? -6 : 6);
      // Readable from when it went up and hung there
      const since = time - v - (cycle - t.down - t.lift);
      return {
        part: { x, y: laneY(lane) - lift, frame: down ? 1 : 0, visible: true, danger: down },
        zone: down ? { lane, x0: x - body.half, x1: x + body.half, since } : undefined,
        progress: down ? 1 : Math.min(1, Math.max(0, (v - t.down - t.lift) / (cycle - t.down - t.lift))),
      };
    };
    const top = boot('top', 0);
    const bottom = boot('bottom', t.beat);
    const zones = [top.zone, bottom.zone].filter((z): z is Zone => !!z);
    const st = state(top.part.x, top.part.y, null, zones.length ? 'strike' : 'idle', Math.floor(time / t.beat), zones);
    st.frame = top.part.frame;
    st.parts = { bottom: bottom.part };
    st.marks = [
      { lane: 'top', x: top.part.x, progress: top.progress },
      { lane: 'bottom', x: bottom.part.x, progress: bottom.progress },
    ];
    return st;
  };
}

/**
 * The spray's cloud wall: a big can at the back of the upper ledge puffs a tall cloud that hangs across both lanes
 * ahead of it for a moment, on a rhythm. While it hangs only a dash gets through; between puffs anyone does. Laid
 * where walls are (a wall that is sometimes open), its phase from its x: nothing drawn from the seed.
 */
export function cloudWall(t: { idle: number; windup: number; puff: number; reach: number }): Behaviour {
  const segs = rhythm([['idle', t.idle], ['windup', t.windup], ['puff', t.puff]]);
  return (plan, time) => {
    const m = moment(time, plan.phase, segs);
    const pose: Pose = m.seg === 'windup' ? 'windup' : m.seg === 'puff' ? 'strike' : 'idle';
    const since = m.at('windup');
    const zones: Zone[] = m.seg === 'puff'
      ? (['top', 'bottom'] as const).map(lane => ({ lane, x0: plan.x - t.reach, x1: plan.x, since }))
      : [];
    const x = plan.x + 22 + (m.seg === 'windup' ? shiver(time, 2) : 0);
    const st = state(x, laneY('top') - 26, null, pose, m.k, zones);
    if (pose !== 'idle') st.warn = { lane: 'top', x0: plan.x - t.reach, x1: plan.x, level: pose === 'strike' ? 1 : .5 };
    return st;
  };
}
