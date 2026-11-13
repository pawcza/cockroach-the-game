/**
 * The Eksterminator's job, step by step: what he does, when each thing reaches the roach, what the roach's gun and
 * dash do to him, where he stands, and how fast he works. Plain data and no Phaser, so the fight can be simulated in
 * tests: the fight plays these same numbers on its own clock, places him and what he throws by the same geometry, and
 * asks the director here what comes next and what a hit did.
 *
 * The final exam: the feet first, then the tools. Something is always coming down a lane, so standing and holding the
 * trigger dies. Every bullet that reaches him counts (1 on the tank, three times that while it is under pressure), but
 * that is a trickle: the fight is won by turning his attacks back on him. A canister shot in the moment it comes down
 * into the pistol's line bursts on him; a cloud, mine or rolling grenade dashed through is blown back into him; his
 * chained canister, met with a dash as it comes, goes back into him; a dash into him as he charges past, or into his
 * pump, sends him reeling. He walks in from the second phase and a dash shoves him home.
 *
 * One idea at a time, like Pani Lodzia and DJ Bigos: each threat's first readable cue a fixed time before it lands, the
 * next attack only once the last threat has gone past, every attack aimed at the lane the roach is on. Phases bring
 * ideas: one, the spray, the canister and counted runs of jets; two, he walks in, a grenade bounces lane to lane and
 * settles, a chained canister goes out on one lane and comes back on the other, and the cloud-and-spray combination;
 * three, he charges along one lane past the roach and back along the other, pumps for a sweep, and lobs mines. And he
 * rages: the emptier the tank, the faster he works (a step at each quarter, shown and heard), down to floors a person
 * reacting in 400 ms still reads. Nearly empty, the tank leaks; he backs off and fires jets lane to lane on the fastest
 * count of the game until a bullet bursts it.
 */
export { fightRandom } from './lodziaPatterns';

export type Lane = 'top' | 'bottom';
/** A lane relative to the roach's when the attack starts. */
export type Rel = 'same' | 'other';

export const other = (lane: Lane): Lane => (lane === 'top' ? 'bottom' : 'top');
export const resolve = (rel: Rel, roachLane: Lane): Lane => (rel === 'same' ? roachLane : other(roachLane));

// ── His timings, ms at full tempo (eksterminatorConfig's frame counts and speeds) ──
/** A spray's wind-up: 4 frames at 10 fps (never scaled), then held on the last (aimed) for the attack's hold. */
export const WINDUP_MS = 400;
export const SPRAY_HOLD_FIRST = 900;
export const SPRAY_HOLD = 500;
export const SPRAY_MS = 1000;
/** From the stream leaving the nozzle to its front reaching the roach. */
export const STREAM_REACH_MS = 100;
export const RELEASE_MS = 300;
/** The tank stays under pressure this long after a stream stops. */
export const PRESSURE_AFTER_MS = 800;
/** The lob: 6 frames at 10 fps, the canister leaving his hand on the fourth. It glows in his fist from frame 1. */
export const LOB_MS = 600;
export const LOB_RELEASE_MS = 300;
export const PUMP_MS = 600;
export const PUMP_HOLD_MS = 500;
export const SWEEP_HOLD_MS = 300;
export const SWEEP_SWITCH_MS = 400;
export const SWEEP_SPRAY_MS = 800;
export const STAGGER_MS = 360;
export const KNOCK_OPEN_MS = 1500;
export const SHOVE_MS = 400;
export const VENT_HOLD_MS = 400;
export const VENT_MS = 500;
/** A run of jets: one every beat, each lane shown a beat ahead (his nozzle on it, the lane marked), each this short. */
export const JET_BEAT = 1000;
export const JET_MS = 250;
/** The finale's jets, on the fastest count. */
export const FINALE_BEAT = 1000;
/** The bouncing grenade: it lands three times on a steady beat (the roach's lane, the other, the roach's again), the
 * third the settle; then it rolls at the roach and reaches it `BOUNCE_SETTLE` later. */
export const BOUNCE_BEAT = 450;
export const BOUNCE_SETTLE = 900;
export const BOUNCE_LANDINGS = 3;
/** Where each landing is, px from the roach: walking in on it. */
export const BOUNCE_X = [350, 250, 150] as const;
/** The chained canister: px/s out along the roach's lane, round the far end, back along the other, to his hand. */
export const CHAIN_SPEED = 600;
export const CHAIN_TURN_MS = 200;
export const CHAIN_SWING_MS = 400;
/** His charge: braced this long (which lane he drops to), then along it at this speed past the roach to `CHARGE_OUT`
 * px behind it, turned onto the other lane in `CHARGE_TURN`, and back home along it. */
export const CHARGE_BRACE = 800;
export const CHARGE_SPEED = 800;
export const CHARGE_OUT = 400;
export const CHARGE_TURN = 600;
/** Half his width as he charges: he is at the roach's spot this long either side of passing it. */
export const CHARGE_HALF_PX = 50;
export const WALK_STEP_MS = 700;
export const GAP_MS = 500;
export const PHASE_BREATHER_MS = 1800;

// ── Rage: the emptier the tank, the faster he works ──
/** Tempo, a share of every scalable time (holds, gaps, flights, beats, walks, speeds), by how much tank is left. */
export const RAGE_STEPS: readonly { above: number; tempo: number }[] = [
  { above: 0.75, tempo: 1 }, { above: 0.5, tempo: 0.9 }, { above: 0.25, tempo: 0.8 }, { above: 0, tempo: 0.75 },
];
export const FINALE_TEMPO = 0.7;
export const tempoFor = (hpShare: number, finale: boolean): number =>
  finale ? FINALE_TEMPO : RAGE_STEPS.find(s => hpShare > s.above)?.tempo ?? RAGE_STEPS[RAGE_STEPS.length - 1].tempo;

// ── Where he stands, px along the lane from the roach's spot ──
export type Pos = 0 | 1 | 2;
export const FAR: Pos = 0;
export const NEAR: Pos = 2;
export const DIST = [480, 390, 300] as const;
export const BODY_PX = 70;
export const bodyX = (pos: Pos): number => DIST[pos] - BODY_PX;

// ── The roach's tools ──
export const DASH_MS = 375;
export const DASH_CYCLE_MS = 375 + 1200;
export const LUNGE_REACH = 250;
export const LUNGE_OUT_SHARE = 0.45;
export const LUNGE_OUT_MS = Math.round(DASH_MS * LUNGE_OUT_SHARE);
/** A dash meets something coming down its lane (him charging, the chained canister, the grenade rolling) when it is
 * pressed at most this long before that thing reaches the roach: the lunge runs out into it. */
export const MEET_MS = 250;

/** The lunge's offset from the roach's spot, px, `dt` ms after the press: out fast, back easing. */
export function lungeOffset(dt: number, reach: number): number {
  if (dt < 0 || dt >= DASH_MS) return 0;
  if (dt < LUNGE_OUT_MS) {
    const k = dt / LUNGE_OUT_MS;
    return reach * (1 - (1 - k) * (1 - k));
  }
  const back = (dt - LUNGE_OUT_MS) / (DASH_MS - LUNGE_OUT_MS);
  return reach * (0.5 + 0.5 * Math.cos(Math.PI * back));
}
export const RETURN_MS = 200;
export const SHOOT_MS = 350;
export const MUZZLE_DX = 30;
/** The pistol's line, px over the lane's floor: a bullet flies flat along it. */
export const MUZZLE_Y = -30;
export const BULLET_SPEED = 800;
/** A bullet meets a canister in the pistol's line when it is this close to it along the lane. */
export const INTERCEPT_PX = 16;

// ── What he throws ──
export const RELEASE_DX = -40;
export const RELEASE_Y = -264;
export const PEAK_PX = 60;
export const MINE_PEAK_PX = 120;
export const LANE_Y: Record<Lane, number> = { bottom: 0, top: -136 };
export const FLIGHT = [1300, 1100, 900] as const;
export const FIRST_FLIGHT = 1500;
/**
 * A canister coming down ahead of the roach ends its arc in the pistol's line: it drops to GLIDE_Y over the lane and
 * skims down the last GLIDE_DX px to land, in GLIDE_MS (the first one, slower). Only then can a bullet meet it.
 */
export const GLIDE_MS = 100;
export const FIRST_GLIDE_MS = 250;
export const GLIDE_DX = 30;
export const GLIDE_Y = -44;
export const CLOUD_AHEAD = 150;
export const CLOUD_SIT_MS = 1200;
export const CLOUD_ROLL = 230;
export const CLOUD_HIT_PX = 46;
export const MINE_AT = 20;
export const MINE_ARM_MS = 1000;
export const MINE_LINGER_MS = 3600;
export const MINE_HALF_PX = 56;
export const SMOKE_FLIGHT = 450;
export const SMOKE_SIT_MS = 1000;
export const feetX = (pos: Pos): number => bodyX(pos) - 20;
/** The things that pass the roach (him, the chain, the grenade) touch it for this long. */
export const PASS_MS = 120;

// ── His tank ──
export const TANK_HP = 720;
export const PHASE_AT = [560, 300] as const;
export const FINALE_HP = 32;
export const BULLET_DAMAGE = 1;
export const PRESSURE_MULT = 3;
/** What turning his attacks back on him is worth: the big numbers of the fight. */
export const PARRY_DAMAGE = 30;
export const BLOWBACK_DAMAGE = 18;
export const SHOVE_DAMAGE = 10;
export const KNOCK_DAMAGE = 80;
export const CRASH_DAMAGE = 70;
export const VENT_AT = 24;
export const SMOKE_AT = 24;
export const SMOKE_EVERY = 3;

/** parry: a canister shot down, or the chain sent back; crash: a dash into him as he charges past. */
export type HitSource = 'bullet' | 'parry' | 'blowback' | 'shove' | 'knock' | 'crash';
const BASE: Record<HitSource, number> = {
  bullet: BULLET_DAMAGE, parry: PARRY_DAMAGE, blowback: BLOWBACK_DAMAGE, shove: SHOVE_DAMAGE, knock: KNOCK_DAMAGE, crash: CRASH_DAMAGE,
};
export const PROMPT_REACTION_MS = 400;

// ── Attacks ──────────────────────────────────────────────────────────

export type Attack =
  | { kind: 'spray'; hold: number }
  | { kind: 'lob'; flight?: number; glide?: number }
  | { kind: 'cloudSpray' }
  | { kind: 'pump'; walkIn?: boolean }
  | { kind: 'mine' }
  | { kind: 'vent' }
  | { kind: 'smoke' }
  /** A counted run of jets, lane to lane, each shown a beat ahead. The finale's are on its own count. */
  | { kind: 'jets'; lanes: Rel[]; finale?: boolean }
  /** The grenade bouncing lane to lane, settling on the roach's lane and rolling at it. */
  | { kind: 'bounce' }
  /** The chained canister: out along the roach's lane, back along the other, into his hand. */
  | { kind: 'chain' }
  /** He charges along the roach's lane past it and back along the other, home. */
  | { kind: 'charge' };

export type AttackKind = Attack['kind'];
/** stream: a spray or jet down a whole lane; cloud, mine: gas; roller: the grenade; chain: the chained canister; him. */
export type HazardKind = 'stream' | 'cloud' | 'mine' | 'roller' | 'chain' | 'him';

export interface Hazard {
  kind: HazardKind;
  lane: Rel;
  cue: number;
  t: number;
  lasts: number;
  /** A stream: when it leaves the nozzle. A cloud, mine or roller: when its canister lands (settles). */
  fire: number;
  from?: number;
  /** A stream: when his wind-up for it starts (its lane is marked from then). */
  windup?: number;
  /** A stream that puts the tank under pressure (a spray; a jet does not). */
  pressure?: boolean;
}

/** A canister in the air: it leaves his hand at `release`, lands `flight` later where `land` says. */
export interface Throw {
  release: number;
  flight: number;
  lane: Rel;
  land: 'ahead' | 'spot' | 'feet';
  /** Its last part in the pistol's line, ms (0: never in it). */
  glide: number;
}

export interface Timed {
  hazards: Hazard[];
  throws: Throw[];
  pressure: { from: number; to: number }[];
  knock: { from: number; to: number } | null;
  approach: number;
  end: number;
  vents: boolean;
  /** The grenade's landings: when and on which lane (the last is the settle), for its shadow and its bounce. */
  bounces?: { at: number; lane: Rel; x: number }[];
  /** His charge: when he leaves (after the brace), turns at the far end, and is home. */
  charge?: { go: number; turn: number; back: number; home: number; out: Rel; speed: number; from: number };
  /** The chain: when it leaves his hand, turns, and is back in it. */
  chain?: { go: number; turn: number; back: number; home: number; speed: number; from: number };
}

export function landX(land: Throw['land'], pos: Pos): number {
  return land === 'ahead' ? CLOUD_AHEAD : land === 'spot' ? MINE_AT : feetX(pos);
}

const rollMs = (fromX: number): number => ((fromX - CLOUD_HIT_PX) / CLOUD_ROLL) * 1000;
const CONTACT_MS = ((2 * CLOUD_HIT_PX) / CLOUD_ROLL) * 1000;
const COMBO_LEAD_MS = 600;
const COMBO_TAIL_MS = 400;

/** What one attack does, in ms from its start; pos is where he stands, tempo how fast he works (1 at full tank). */
export function timeAttack(attack: Attack, pos: Pos, tempo = 1): Timed {
  const sc = (ms: number): number => Math.round(ms * tempo);
  const hazards: Hazard[] = [];
  const throws: Throw[] = [];
  const pressure: { from: number; to: number }[] = [];
  let knock: Timed['knock'] = null;
  let approach = 0;
  let end = 0;
  const timed: Partial<Timed> = {};
  const spray = (lane: Rel, cue: number, hold: number, length: number, read = cue, pressed = true): number => {
    const fire = cue + WINDUP_MS + hold;
    hazards.push({ kind: 'stream', lane, cue: read, t: fire + STREAM_REACH_MS, lasts: length, fire, windup: cue, pressure: pressed });
    if (pressed) pressure.push({ from: fire, to: fire + length + PRESSURE_AFTER_MS });
    end = Math.max(end, fire + length + (pressed ? RELEASE_MS : 0));
    return fire;
  };
  const lob = (lane: Rel, cue: number, flight: number, land: Throw['land'], at: Pos, glide = GLIDE_MS): Hazard => {
    const release = cue + LOB_RELEASE_MS;
    const lands = release + flight;
    throws.push({ release, flight, lane, land, glide: land === 'ahead' ? glide : 0 });
    const from = throws.length - 1;
    const x = landX(land, at);
    const h: Hazard = land === 'spot'
      ? { kind: 'mine', lane, cue, t: lands + sc(MINE_ARM_MS), lasts: MINE_LINGER_MS, fire: lands, from }
      : { kind: 'cloud', lane, cue, t: lands + sc(land === 'feet' ? SMOKE_SIT_MS : CLOUD_SIT_MS) + rollMs(x), lasts: CONTACT_MS, fire: lands, from };
    hazards.push(h);
    end = Math.max(end, cue + LOB_MS);
    return h;
  };
  switch (attack.kind) {
    case 'spray':
      spray('same', 0, sc(attack.hold), SPRAY_MS);
      break;
    case 'lob':
      lob('same', 0, sc(attack.flight ?? FLIGHT[pos]), 'ahead', pos, attack.glide ?? GLIDE_MS);
      break;
    case 'cloudSpray': {
      const cloud = lob('same', 0, sc(FLIGHT[pos]), 'ahead', pos);
      const from = cloud.t - COMBO_LEAD_MS;
      const fire = from - STREAM_REACH_MS;
      spray('other', fire - WINDUP_MS - sc(SPRAY_HOLD), sc(SPRAY_HOLD), cloud.t + cloud.lasts + COMBO_TAIL_MS - from);
      break;
    }
    case 'pump': {
      approach = attack.walkIn ? (NEAR - pos) * sc(WALK_STEP_MS) : 0;
      const braced = approach + PUMP_MS + sc(PUMP_HOLD_MS);
      const first = spray('same', braced, sc(SWEEP_HOLD_MS), SWEEP_SPRAY_MS);
      const stops = first + SWEEP_SPRAY_MS;
      spray('other', stops, Math.max(300, sc(SWEEP_SWITCH_MS)), SWEEP_SPRAY_MS, stops + STREAM_REACH_MS);
      pressure.splice(0, 2, { from: pressure[0].from, to: pressure[1].to });
      if (attack.walkIn || pos === NEAR) knock = { from: approach + PUMP_MS / 2, to: first };
      break;
    }
    case 'mine':
      lob('same', 0, sc(FLIGHT[pos]), 'spot', pos);
      break;
    case 'vent':
      spray('same', 0, sc(VENT_HOLD_MS), VENT_MS);
      pressure.length = 0;
      break;
    case 'smoke':
      lob('same', 0, sc(SMOKE_FLIGHT), 'feet', pos);
      break;
    case 'jets': {
      const beat = sc(attack.finale ? FINALE_BEAT : JET_BEAT);
      attack.lanes.forEach((lane, i) => {
        // Jet i is shown from i beats in (its lane marked, his nozzle swinging to it) and reaches the roach a beat later
        const t = (i + 1) * beat;
        const fire = t - STREAM_REACH_MS;
        hazards.push({ kind: 'stream', lane, cue: i * beat, t, lasts: JET_MS, fire, windup: Math.max(i * beat, fire - WINDUP_MS), pressure: false });
      });
      end = attack.lanes.length * beat + JET_MS;
      break;
    }
    case 'bounce': {
      const release = LOB_RELEASE_MS;
      const beat = sc(BOUNCE_BEAT);
      const lanes: Rel[] = ['same', 'other', 'same'];
      timed.bounces = lanes.map((lane, k) => ({ at: release + (k + 1) * beat, lane, x: BOUNCE_X[k] }));
      const settle = timed.bounces[BOUNCE_LANDINGS - 1].at;
      hazards.push({ kind: 'roller', lane: 'same', cue: settle, t: settle + sc(BOUNCE_SETTLE), lasts: PASS_MS, fire: settle });
      end = LOB_MS;
      break;
    }
    case 'chain': {
      const speed = CHAIN_SPEED / tempo;
      const from = DIST[pos] + RELEASE_DX;
      // He swings it round his head a moment first, then lets it fly
      const go = LOB_RELEASE_MS + sc(CHAIN_SWING_MS);
      const pass1 = go + (from / speed) * 1000;
      const turn = pass1 + (CHARGE_OUT / speed) * 1000;
      const pass2 = turn + sc(CHAIN_TURN_MS) + (CHARGE_OUT / speed) * 1000;
      const home = pass2 + (from / speed) * 1000;
      hazards.push({ kind: 'chain', lane: 'same', cue: 0, t: pass1 - PASS_MS / 2, lasts: PASS_MS, fire: go });
      hazards.push({ kind: 'chain', lane: 'other', cue: pass1 + PASS_MS / 2, t: pass2 - PASS_MS / 2, lasts: PASS_MS, fire: turn });
      timed.chain = { go, turn, back: turn + sc(CHAIN_TURN_MS), home, speed, from };
      end = home;
      break;
    }
    case 'charge': {
      const speed = CHARGE_SPEED / tempo;
      const from = DIST[pos];
      const go = sc(CHARGE_BRACE);
      const half = (CHARGE_HALF_PX / speed) * 1000;
      const pass1 = go + (from / speed) * 1000;
      const turn = pass1 + (CHARGE_OUT / speed) * 1000;
      const back = turn + sc(CHARGE_TURN);
      const pass2 = back + (CHARGE_OUT / speed) * 1000;
      const home = pass2 + (DIST[FAR] / speed) * 1000;
      hazards.push({ kind: 'him', lane: 'same', cue: 0, t: pass1 - half, lasts: 2 * half, fire: go });
      // The way back is read from when he turns onto the other lane at the far end
      hazards.push({ kind: 'him', lane: 'other', cue: turn, t: pass2 - half, lasts: 2 * half, fire: back });
      // Out of position on his way back, the tank sloshing: exposed until he is home and set
      pressure.push({ from: turn, to: home + PRESSURE_AFTER_MS });
      timed.charge = { go, turn, back, home, out: 'same', speed, from };
      end = home;
      break;
    }
  }
  return { hazards, throws, pressure, knock, approach, end, vents: attack.kind === 'vent', ...timed };
}

export function attackLength(attack: Attack, pos: Pos, tempo = 1): number {
  const timed = timeAttack(attack, pos, tempo);
  const passed = Math.max(...timed.hazards.map(h => (h.kind === 'mine' ? h.t : h.t + h.lasts)));
  const gap = attack.kind === 'jets' && attack.finale ? 100 : Math.round(GAP_MS * tempo);
  return Math.max(timed.end, passed) + gap;
}

// ── The arc of a thrown canister ─────────────────────────────────────

export const releasePoint = (pos: Pos): { x: number; y: number } => ({ x: DIST[pos] + RELEASE_DX, y: RELEASE_Y });
export const peakOf = (land: Throw['land']): number => (land === 'spot' ? MINE_PEAK_PX : PEAK_PX);

/** The share of an arc to the top: a parabola through both ends peaking `peakPx` over the higher. */
export function peakShare(fromY: number, toY: number, peakPx = PEAK_PX): number {
  const lift = Math.min(fromY, toY) - peakPx;
  const a = Math.sqrt(fromY - lift);
  const b = Math.sqrt(toY - lift);
  return a / (a + b);
}

function arc(k: number, from: { x: number; y: number }, to: { x: number; y: number }, peakPx: number): { x: number; y: number } {
  const t = Math.min(1, Math.max(0, k));
  const lift = Math.min(from.y, to.y) - peakPx;
  const h0 = from.y - lift;
  const h1 = to.y - lift;
  const peak = peakShare(from.y, to.y, peakPx);
  const y = t < peak ? lift + h0 * Math.pow(1 - t / peak, 2) : lift + h1 * Math.pow((t - peak) / (1 - peak), 2);
  return { x: from.x + (to.x - from.x) * t, y };
}

/**
 * Where a canister is `elapsed` ms after leaving his hand: its arc to the start of its glide (over the lane, in the
 * pistol's line), then the glide down to its spot. Without a glide, the arc all the way.
 */
export function canisterAt(elapsed: number, th: Pick<Throw, 'flight' | 'glide' | 'land'>, from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number } {
  const peakPx = peakOf(th.land);
  if (th.glide <= 0) return arc(elapsed / th.flight, from, to, peakPx);
  const g = { x: to.x + GLIDE_DX, y: to.y + GLIDE_Y };
  const arcMs = th.flight - th.glide;
  if (elapsed < arcMs) return arc(elapsed / arcMs, from, g, peakPx);
  const k = Math.min(1, (elapsed - arcMs) / th.glide);
  return { x: g.x + (to.x - g.x) * k, y: g.y + (to.y - g.y) * k };
}

/** The pistol's line meets a canister only while it glides in it (ms from its release). */
export const inLine = (elapsed: number, th: Pick<Throw, 'flight' | 'glide'>): boolean =>
  th.glide > 0 && elapsed >= th.flight - th.glide && elapsed < th.flight;

/**
 * When a bullet fired at `press` meets a throw's canister, or null: flat along the roach's lane, it meets it only if it
 * is still short of it when the glide starts (earlier it passed under the canister high in its arc) and reaches it
 * before it lands.
 */
export function bulletMeets(press: number, th: Throw, pos: Pos): number | null {
  if (th.glide <= 0) return null;
  const from = releasePoint(pos);
  const to = { x: landX(th.land, pos), y: 0 };
  for (let t = Math.max(press, th.release); t < th.release + th.flight; t += 2) {
    const bullet = MUZZLE_DX + ((t - press) * BULLET_SPEED) / 1000;
    const can = canisterAt(t - th.release, th, from, to);
    if (bullet >= can.x - INTERCEPT_PX) return inLine(t - th.release, th) ? t : null;
  }
  return null;
}

/** Where his chain's canister is along the lanes `ms` into a chain attack: x from the roach, and the lane it is on. */
export function chainAt(ms: number, c: NonNullable<Timed['chain']>): { x: number; out: boolean } | null {
  const v = c.speed / 1000;
  if (ms < c.go || ms >= c.home) return null;
  if (ms < c.turn) return { x: c.from - (ms - c.go) * v, out: true };
  if (ms < c.back) return { x: -CHARGE_OUT, out: false };
  return { x: -CHARGE_OUT + (ms - c.back) * v, out: false };
}

/** Where he is along the lanes `ms` into his charge (x of his middle from the roach), and on which leg. */
export function chargeAt(ms: number, c: NonNullable<Timed['charge']>): { x: number; leg: 'brace' | 'out' | 'turn' | 'back' } {
  const v = c.speed / 1000;
  if (ms < c.go) return { x: c.from, leg: 'brace' };
  if (ms < c.turn) return { x: c.from - (ms - c.go) * v, leg: 'out' };
  if (ms < c.back) return { x: -CHARGE_OUT, leg: 'turn' };
  return { x: Math.min(DIST[FAR], -CHARGE_OUT + (ms - c.back) * v), leg: 'back' };
}

// ── Phases ───────────────────────────────────────────────────────────

export interface Phase { intro: Attack[]; loop: Attack[] }

const shuffle = <T>(items: T[], rand: () => number): T[] => {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** A run of jets: the first at the roach, then never three on one lane in a row. */
export function jetRun(length: number, rand: () => number): Rel[] {
  const lanes: Rel[] = ['same'];
  let lane: 'a' | 'b' = 'a';
  let streak = 1;
  for (let i = 1; i < length; i++) {
    const stay = streak < 2 && rand() < 0.3;
    if (!stay) { lane = lane === 'a' ? 'b' : 'a'; streak = 1; } else streak++;
    lanes.push(lane === 'a' ? 'same' : 'other');
  }
  return lanes;
}

function loopOf(kinds: AttackKind[], rand: () => number): Attack[] {
  let order: AttackKind[];
  do order = shuffle(kinds, rand);
  while (order.some((k, i) => k === order[(i + 1) % order.length]));
  return order.map((kind): Attack => {
    if (kind === 'spray') return { kind, hold: SPRAY_HOLD };
    if (kind === 'jets') return { kind, lanes: jetRun(4 + Math.floor(rand() * 2), rand) };
    return { kind } as Attack;
  });
}

/** The fight's three phases. rand is the fight's own: the day's seed in a daily run, Math.random otherwise. */
export function buildPhases(rand: () => number): Phase[] {
  const one: Phase = {
    intro: [
      { kind: 'spray', hold: SPRAY_HOLD_FIRST },
      { kind: 'lob', flight: FIRST_FLIGHT, glide: FIRST_GLIDE_MS },
      { kind: 'jets', lanes: jetRun(4, rand) },
      { kind: 'spray', hold: SPRAY_HOLD },
    ],
    loop: loopOf(['spray', 'lob', 'jets', 'lob', 'jets', 'spray'], rand),
  };
  const two: Phase = {
    intro: [{ kind: 'bounce' }, { kind: 'chain' }, { kind: 'cloudSpray' }],
    loop: loopOf(['bounce', 'chain', 'cloudSpray', 'jets', 'lob', 'spray', 'bounce', 'chain'], rand),
  };
  const three: Phase = {
    intro: [{ kind: 'charge' }, { kind: 'pump', walkIn: true }, { kind: 'mine' }],
    loop: loopOf(['charge', 'pump', 'mine', 'chain', 'bounce', 'jets', 'charge', 'cloudSpray'], rand),
  };
  return [one, two, three];
}

// ── The director ─────────────────────────────────────────────────────

export type Step =
  | { kind: 'attack'; attack: Attack; phase: number; index: number; pos: Pos; tempo: number }
  | { kind: 'walk'; phase: number; index: number; pos: Pos; tempo: number };

export function stepLength(step: Step): number {
  return step.kind === 'walk' ? Math.round(WALK_STEP_MS * step.tempo) : attackLength(step.attack, step.pos, step.tempo);
}

export interface HitResult {
  dealt: number; mult: number; phaseStarted: number | null; finale: boolean; won: boolean; vents: boolean;
  /** His rage stepped up with this hit (the new tempo). */
  rage: number | null;
}

export class EksDirector {
  phase = 0;
  hp = TANK_HP;
  pos: Pos = FAR;
  finale = false;
  private queue: Attack[];
  private index = 0;
  private introLeft: number;
  private windowDamage = 0;
  private offHits = 0;
  private ventPending = false;
  private smokePending = false;
  private lastWasAttack = false;
  private sinceSmoke = SMOKE_EVERY;
  private mineFollow = false;
  private finaleRun = 0;

  constructor(private readonly phases: Phase[], private readonly rand: () => number = Math.random) {
    this.queue = phases[0].intro.slice();
    this.introLeft = this.queue.length;
  }

  get won(): boolean { return this.hp <= 0; }

  /** How fast he works now: 1 at a full tank, down a step at each quarter, fastest in the finale. */
  get tempo(): number { return tempoFor(this.hp / TANK_HP, this.finale); }

  private get floor(): number {
    if (this.finale) return 0;
    if (this.phase < PHASE_AT.length) return PHASE_AT[this.phase];
    return FINALE_HP;
  }

  next(): Step {
    const index = this.index++;
    const tempo = this.tempo;
    const attack = (a: Attack): Step => {
      this.lastWasAttack = true;
      this.sinceSmoke = a.kind === 'smoke' ? 0 : this.sinceSmoke + 1;
      return { kind: 'attack', attack: a, phase: this.phase, index, pos: this.pos, tempo };
    };
    if (this.finale) {
      // Jets lane to lane on the fastest count, a run of six at a time, the first always at the roach
      this.finaleRun++;
      return attack({ kind: 'jets', lanes: jetRun(6, this.rand), finale: true });
    }
    if (this.mineFollow) {
      this.mineFollow = false;
      return attack({ kind: 'lob' });
    }
    if (this.ventPending) {
      this.ventPending = false;
      return attack({ kind: 'vent' });
    }
    if (this.phase >= 1 && this.lastWasAttack && this.pos < NEAR) {
      this.lastWasAttack = false;
      return { kind: 'walk', phase: this.phase, index, pos: this.pos, tempo };
    }
    if (this.smokePending && this.sinceSmoke >= SMOKE_EVERY) {
      this.smokePending = false;
      return attack({ kind: 'smoke' });
    }
    if (!this.queue.length) this.queue = this.phases[this.phase].loop.slice();
    if (this.introLeft > 0) this.introLeft--;
    return attack(this.queue.shift()!);
  }

  moved(pos: Pos): void { this.pos = pos; }

  pressureOpened(): void {
    this.windowDamage = 0;
    this.offHits = 0;
  }

  mineStays(): void { this.mineFollow = true; }
  mineGone(): void { this.mineFollow = false; }

  hit(source: HitSource, pressured: boolean): HitResult {
    const none: HitResult = { dealt: 0, mult: 1, phaseStarted: null, finale: false, won: this.won, vents: false, rage: null };
    if (this.won) return none;
    const before = this.tempo;
    const mult = source === 'bullet' && pressured ? PRESSURE_MULT : 1;
    const floor = this.floor;
    const least = this.finale && source !== 'bullet' ? 1 : floor;
    const dealt = Math.min(BASE[source] * mult, this.hp - least);
    if (dealt <= 0) return none;
    this.hp -= dealt;
    const result: HitResult = { dealt, mult, phaseStarted: null, finale: false, won: this.won, vents: false, rage: null };
    if (this.hp <= floor && !this.won) {
      this.windowDamage = this.offHits = 0;
      this.ventPending = this.smokePending = this.mineFollow = false;
      this.lastWasAttack = false;
      if (floor === FINALE_HP) {
        this.finale = true;
        this.pos = FAR;
        result.finale = true;
      } else {
        this.phase++;
        this.queue = this.phases[this.phase].intro.slice();
        this.introLeft = this.queue.length;
        result.phaseStarted = this.phase;
      }
    } else if (!this.won) {
      const answers = !this.finale && !(this.phase === 0 && this.introLeft > 0);
      if (pressured) {
        this.windowDamage += dealt;
        if (answers && this.windowDamage >= VENT_AT && !this.ventPending) {
          this.ventPending = true;
          this.windowDamage = 0;
          result.vents = true;
        }
      } else if (source === 'bullet') {
        this.offHits++;
        if (answers && this.offHits >= SMOKE_AT && !this.smokePending) {
          this.smokePending = true;
          this.offHits = 0;
        }
      }
    }
    if (this.tempo < before && !this.won) result.rage = this.tempo;
    return result;
  }
}

// ── Prompts ──────────────────────────────────────────────────────────

/**
 * A keycap prompt over the roach, the first time each comes, shown only while pressing then is right: shoot-pressure
 * the first pressure window (a shot then counts triple), dash-cloud a cloud in reach, dash-knock his pump close,
 * dash-shove him close with nothing coming. The canister's shot has no prompt: its window is shorter than a reaction,
 * so it is learnt from its arc and its flash as it enters the pistol's line.
 */
export interface Prompt {
  key: 'shoot-pressure' | 'dash-cloud' | 'dash-knock' | 'dash-shove';
  from: number;
  to: number;
  lane: Rel;
}
const PROMPT_SHOW_MS = 500;

export function promptFor(attack: Attack, pos: Pos, tempo = 1): Prompt | null {
  const timed = timeAttack(attack, pos, tempo);
  if (attack.kind === 'spray') {
    const w = timed.pressure[0];
    return { key: 'shoot-pressure', from: w.from, to: Math.min(w.from + PROMPT_SHOW_MS * 2, w.to - PROMPT_REACTION_MS), lane: 'other' };
  }
  if (attack.kind === 'pump' && timed.knock) {
    return { key: 'dash-knock', from: timed.knock.from, to: timed.knock.to - PROMPT_REACTION_MS - LUNGE_OUT_MS, lane: 'same' };
  }
  return null;
}

export function cloudPrompt(attack: Attack, pos: Pos, tempo = 1): Prompt | null {
  if (attack.kind !== 'lob') return null;
  const h = timeAttack(attack, pos, tempo).hazards[0];
  return { key: 'dash-cloud', from: h.fire, to: Math.min(h.fire + PROMPT_SHOW_MS * 2, h.t - PROMPT_REACTION_MS - 50), lane: 'same' };
}

export const SHOVE_PROMPT = { from: 1, to: PROMPT_SHOW_MS };

// ── Simulation ──────────────────────────────────────────────────────

/**
 * A simulated player. reaction: ms from a thing's first readable cue to answering it, one thing at a time. shoot:
 * 'aimed' fires whenever ready but saves its shot for a canister's moment in the pistol's line and fires it then;
 * 'spam' fires every time the pistol is ready, whatever is coming; 'never'. dash: 'smart' turns what it can back on him
 * (clouds, mines, the grenade, the chain, him charging, his pump; shoves him in phase two), 'never', or 'blind' (the
 * moment it is back). late: hops only at the last moment (this long before a thing reaches it), reading nothing early.
 */
export interface SimPlayer {
  reaction: number;
  shoot: 'aimed' | 'spam' | 'never';
  dash: 'smart' | 'never' | 'blind';
  offset?: number;
  late?: number;
}

export interface SimHazard {
  kind: HazardKind; lane: Lane; cue: number; at: number; lasts: number; fire: number;
  phase: number; step: number; start: number;
  gone?: boolean;
  passed?: boolean;
  can?: SimCanister;
  until?: number;
}

export interface SimCanister {
  release: number; th: Throw; lane: Lane; from: { x: number; y: number }; to: { x: number; y: number };
  shot: boolean; hazard: SimHazard; pos: Pos;
}

export interface SimResult {
  died: boolean;
  cause: SimHazard | null;
  endedAt: number;
  won: boolean;
  hazards: SimHazard[];
  steps: { step: Step; start: number; end: number }[];
  dealt: number[];
  /** Damage dealt by each source. */
  by: Record<HitSource, number>;
  count: Record<HitSource | 'vent' | 'smoke' | 'whiff', number>;
}

const TICK = 5;
const PASSING: HazardKind[] = ['roller', 'chain', 'him'];

export function simulate(phases: Phase[], player: 'still' | Lane | SimPlayer, start: Lane, limitMs = 300000, seed = 1): SimResult {
  let s = seed | 0;
  const rand = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const director = new EksDirector(phases, rand);
  const p = typeof player === 'object' ? player : null;
  let lane: Lane = player === 'top' || player === 'bottom' ? player : start;
  const hazards: SimHazard[] = [];
  const steps: SimResult['steps'] = [];
  const dealt = [0, 0, 0, 0];
  const by: SimResult['by'] = { bullet: 0, parry: 0, blowback: 0, shove: 0, knock: 0, crash: 0 };
  const count: SimResult['count'] = { bullet: 0, parry: 0, blowback: 0, shove: 0, knock: 0, crash: 0, vent: 0, smoke: 0, whiff: 0 };
  let live: SimHazard[] = [];
  let cans: SimCanister[] = [];
  let bullets: { t0: number; lane: Lane; pressured: boolean }[] = [];
  let pressure: { from: number; to: number }[] = [];
  let knock = null as { from: number; to: number; done: boolean } | null;
  let charge = null as { t0: number; c: NonNullable<Timed['charge']>; step: number } | null;
  let stageFree = 0;
  let current = null as Step | null;
  let walkTo = null as { at: number; pos: Pos } | null;
  let press = -Infinity;
  let readyAt = p?.offset ?? 0;
  let lunge: number | null = null;
  let shotAt = -Infinity;
  let lastPassed = -Infinity;
  let delayed: { at: number; source: HitSource }[] = [];
  let ended = null as SimResult | null;

  const result = (died: boolean, cause: SimHazard | null, at: number): SimResult =>
    ({ died, cause, endedAt: at, won: director.won, hazards, steps, dealt, by, count });
  const underPressure = (now: number) => pressure.some(w => now >= w.from && now < w.to);
  /** His middle, px from the roach: charging, where the charge has him; otherwise where he stands. */
  const himX = (now: number) => (charge ? chargeAt(now - charge.t0, charge.c).x : DIST[director.pos]);

  const clearStage = (now: number, breather: number) => {
    for (const h of live) h.gone = true;
    live = [];
    cans = [];
    pressure = [];
    knock = null;
    walkTo = null;
    if (charge) director.moved(FAR);
    charge = null;
    stageFree = now + breather;
    current = null;
  };

  const damage = (source: HitSource, now: number, pressured: boolean): void => {
    const phase = director.finale ? 3 : director.phase;
    const r = director.hit(source, pressured);
    if (r.dealt <= 0) return;
    dealt[phase] += r.dealt;
    by[source] += r.dealt;
    count[source]++;
    if (r.won) { ended = result(false, null, now); return; }
    if (r.phaseStarted !== null || r.finale) { clearStage(now, PHASE_BREATHER_MS); return; }
    if (r.vents) pressure = pressure.map(w => ({ from: w.from, to: Math.min(w.to, now) }));
  };

  /** He is knocked out of his charge: the rest of it is off, he is sent home reeling and the tank is open. */
  const crash = (now: number): void => {
    for (const h of live) if (h.kind === 'him') h.gone = true;
    charge = null;
    director.moved(FAR);
    if (!underPressure(now)) director.pressureOpened();
    pressure = [{ from: now, to: now + KNOCK_OPEN_MS }];
    stageFree = now + STAGGER_MS + KNOCK_OPEN_MS;
    damage('crash', now, false);
  };

  const begin = (at: number): void => {
    const step = director.next();
    current = step;
    const length = stepLength(step);
    steps.push({ step, start: at, end: at + length });
    stageFree = at + length;
    if (step.kind === 'walk') {
      walkTo = { at: at + Math.round(WALK_STEP_MS * step.tempo), pos: (step.pos + 1) as Pos };
      return;
    }
    const attack = step.attack;
    if (attack.kind === 'vent') count.vent++;
    if (attack.kind === 'smoke') count.smoke++;
    const timed = timeAttack(attack, step.pos, step.tempo);
    const roachLane = lane;
    if (timed.approach > 0) walkTo = { at: at + timed.approach, pos: NEAR };
    for (const w of timed.pressure) {
      if (!underPressure(at + w.from)) director.pressureOpened();
      pressure.push({ from: at + w.from, to: at + w.to });
    }
    knock = timed.knock ? { from: at + timed.knock.from, to: at + timed.knock.to, done: false } : null;
    charge = timed.charge ? { t0: at, c: timed.charge, step: step.index } : null;
    const made: SimHazard[] = timed.hazards.map(h => ({
      kind: h.kind, lane: resolve(h.lane, roachLane), cue: at + h.cue, at: at + h.t, lasts: h.lasts, fire: at + h.fire,
      phase: step.phase, step: step.index, start: at,
    }));
    timed.throws.forEach((th, i) => {
      const hazard = made[timed.hazards.findIndex(h => h.from === i)];
      const throwLane = resolve(th.lane, roachLane);
      const can: SimCanister = {
        release: at + th.release, th, lane: throwLane, from: releasePoint(step.pos), to: { x: landX(th.land, step.pos), y: 0 },
        shot: false, hazard, pos: step.pos,
      };
      hazard.can = can;
      cans.push(can);
    });
    for (const h of made) {
      if (h.kind === 'mine') h.until = h.at + h.lasts;
      hazards.push(h);
      live.push(h);
    }
  };

  const cloudX = (h: SimHazard, now: number): number | null => {
    if (now < h.fire) return null;
    const x0 = h.can!.to.x;
    const sit = h.at - h.fire - rollMs(x0);
    return now < h.fire + sit ? x0 : x0 - ((now - h.fire - sit) * CLOUD_ROLL) / 1000;
  };

  const dashing = (now: number) => now - press < DASH_MS;
  const ready = (now: number) => now >= readyAt;
  const dash = (now: number) => {
    press = now;
    readyAt = now + DASH_CYCLE_MS;
    lunge = now + LUNGE_OUT_MS;
    // The first thing in reach on its lane takes the lunge
    const met = live.filter(h => !h.gone && !h.passed && h.lane === lane && (
      (h.kind === 'mine' && now >= h.fire && now < h.until!)
      || (h.kind === 'cloud' && (x => x !== null && x > -CLOUD_HIT_PX && x <= LUNGE_REACH)(cloudX(h, now)))
      || (PASSING.includes(h.kind) && now >= h.at - MEET_MS && now <= h.at + h.lasts && now >= h.fire)));
    if (!met.length) return;
    lunge = null;
    const first = met.sort((a, b) => a.at - b.at)[0];
    if (first.kind === 'him') { crash(now + LUNGE_OUT_MS); return; }
    for (const h of met) h.gone = true;
    if (met.some(h => h.kind === 'mine')) director.mineGone();
    delayed.push({ at: now + LUNGE_OUT_MS + RETURN_MS, source: first.kind === 'chain' ? 'parry' : 'blowback' });
  };
  const known = (h: SimHazard, now: number) => p !== null && now >= h.cue + p.reaction;
  const safe = (l: Lane, from: number, until: number) => !live.some(h => !h.gone && h.lane === l && (
    h.kind === 'mine' ? h.at < until + 30 && h.until! > from : h.at < until + 30 && h.at + h.lasts > from - 30));
  /** When an aimed shot meets a canister of this player's lane: the middle of the presses that do. */
  const aimAt = (c: SimCanister): number | null => {
    const th = { ...c.th, release: 0 };
    const hits: number[] = [];
    for (let t = -600; t < th.flight; t += 5) if (bulletMeets(t, th, c.pos) !== null) hits.push(t);
    return hits.length ? c.release + hits[Math.floor(hits.length / 2)] : null;
  };

  begin(0);
  for (let now = 0; now < limitMs; now += TICK) {
    if (ended) return ended;
    if (walkTo && now >= walkTo.at) { director.moved(walkTo.pos); walkTo = null; }
    if (charge && now >= charge.t0 + charge.c.home) { charge = null; director.moved(FAR); }
    const pendingHazards = live.filter(h => !h.gone && !h.passed);
    if (now >= stageFree && !pendingHazards.some(h => h.kind !== 'mine' && now < h.at + h.lasts)) {
      if (director.won) break;
      const mine = live.find(h => h.kind === 'mine' && !h.gone && now < h.until!);
      if (mine && current?.kind === 'attack' && current.attack.kind === 'mine' && mine.lane !== lane) director.mineStays();
      begin(now);
    }

    // The player
    if (p) {
      const pending = live.filter(h => !h.gone && !h.passed && (h.kind !== 'mine' || now < h.until!)).sort((a, b) => a.at - b.at);
      const first = pending.find(h => h.lane === lane);
      let acted = false;
      let saving = false;
      if (first && (p.late !== undefined ? now >= first.at - p.late : known(first, now)) && now >= lastPassed + 20) {
        const there = other(lane);
        const until = first.kind === 'mine' ? first.until! : first.at + first.lasts;
        const canDash = p.dash === 'smart' && ready(now) && !dashing(now);
        const hop = () => { if (now < first.at && safe(there, now, until)) { lane = there; acted = true; } };
        if (first.kind === 'stream') hop();
        else if (PASSING.includes(first.kind)) {
          // Meet it with a dash as it comes, or hop out of its way
          if (canDash && now >= first.at - MEET_MS + 30 && now >= first.fire) { dash(now); acted = true; }
          else if (!canDash || p.late !== undefined || now >= first.at - MEET_MS + 60) hop();
        } else {
          const can = first.can!;
          const landed = now >= first.fire;
          const aimed = p.shoot === 'aimed' && !landed && !can.shot && can.th.glide > 0;
          const x = first.kind === 'cloud' ? cloudX(first, now) : MINE_AT;
          const inReach = landed && x !== null && x <= LUNGE_REACH;
          if (aimed) saving = true;
          else if (canDash && inReach) { dash(now); acted = true; }
          else if (landed && (p.dash !== 'smart' || !canDash || p.late !== undefined)) hop();
        }
      }
      if (!acted && p.dash === 'blind' && ready(now) && !dashing(now) && now >= (p.offset ?? 0)) {
        dash(now);
      } else if (!acted && p.dash === 'smart' && ready(now) && !dashing(now) && director.pos === NEAR && !charge) {
        const inKnock = knock && !knock.done && now >= knock.from && now + LUNGE_OUT_MS < knock.to;
        const pumping = current?.kind === 'attack' && current.attack.kind === 'pump';
        if (inKnock && now >= knock!.from - (PUMP_MS / 2) + p.reaction) dash(now);
        else if (!pumping && pending.length === 0 && director.phase === 1) dash(now);
      }
      // The pistol: an aimed player holds its shot for a canister coming down on its lane and fires it in the moment
      const target = p.shoot === 'aimed' ? cans.find(c => !c.shot && c.lane === lane && c.th.glide > 0) : undefined;
      const aim = target ? aimAt(target) : null;
      const fire = p.shoot === 'spam' || (p.shoot === 'aimed' && (aim === null ? !saving : now >= aim || now + SHOOT_MS < aim));
      if (fire && now - shotAt >= SHOOT_MS) {
        shotAt = now;
        bullets.push({ t0: now, lane, pressured: underPressure(now) });
      }
    }

    if (lunge !== null && now >= lunge) {
      lunge = null;
      if (bodyX(director.pos) <= LUNGE_REACH && !director.finale && !charge) {
        if (knock && !knock.done && now >= knock.from && now < knock.to) {
          knock.done = true;
          for (const h of live) if (h.step === current?.index && h.kind === 'stream') h.gone = true;
          if (!underPressure(now)) director.pressureOpened();
          pressure = [{ from: now, to: now + KNOCK_OPEN_MS }];
          stageFree = now + STAGGER_MS + KNOCK_OPEN_MS;
          damage('knock', now, false);
        } else {
          director.moved(FAR);
          damage('shove', now, false);
        }
      } else count.whiff++;
    }
    for (const d of delayed.filter(d => now >= d.at)) damage(d.source, now, false);
    delayed = delayed.filter(d => now < d.at);
    if (ended) return ended;

    // Bullets: a canister in the pistol's line on their lane, else him
    for (const b of bullets) {
      const x = MUZZLE_DX + ((now - b.t0) * BULLET_SPEED) / 1000;
      const can = cans.find(c => !c.shot && c.lane === b.lane && now >= c.release && now < c.release + c.th.flight
        && x >= canisterAt(now - c.release, c.th, c.from, c.to).x - INTERCEPT_PX);
      if (can && inLine(now - can.release, can.th)) {
        can.shot = true;
        can.hazard.gone = true;
        b.t0 = -Infinity;
        damage('parry', now, false);
        continue;
      }
      const hx = himX(now);
      if (hx - BODY_PX > MUZZLE_DX && x >= hx - BODY_PX) {
        b.t0 = -Infinity;
        damage('bullet', now, b.pressured || underPressure(now));
      }
      if (ended) return ended;
    }
    bullets = bullets.filter(b => b.t0 !== -Infinity);
    cans = cans.filter(c => !c.shot && now < c.release + c.th.flight);

    for (const h of live) {
      if (h.gone || h.passed) continue;
      if (h.kind === 'mine') {
        if (now >= h.until!) { h.passed = true; continue; }
        if (now >= h.at && h.lane === lane && !dashing(now)) return result(true, h, now);
        continue;
      }
      if (now < h.at) continue;
      if (now >= h.at + h.lasts) { h.passed = true; lastPassed = h.at + h.lasts; continue; }
      if (h.lane === lane && !dashing(now)) return result(true, h, now);
    }
    live = live.filter(h => !h.gone && !h.passed);
  }
  return ended ?? result(false, null, limitMs);
}
