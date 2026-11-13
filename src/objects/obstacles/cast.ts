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
  laneY,
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
  sweeper,
  swoop,
  tongue,
  cloudWall,
  zap,
  patrol,
  rings,
  lure,
  VacuumTimings,
  WaspTimings,
  Zone,
} from './behaviours';

export type EnemyId =
  | 'onion' | 'flipper' | 'spray' | 'newspaper' | 'bird' | 'cat' | 'catChase'
  | 'jellyfish' | 'pope' | 'bison' | 'blackhole' | 'glue' | 'bleach' | 'lamp' | 'mop'
  | 'vacuum' | 'hen' | 'frog' | 'centipede' | 'boots' | 'hedgehog' | 'sprayWall'
  | 'gull' | 'wasp' | 'zapper' | 'robotVacuum' | 'repeller' | 'aerosol' | 'bait';

/** What a pattern can ask a slot for: an enemy of this kind of behaviour. */
export type CastRole =
  | 'swatter' | 'sweeper' | 'switcher' | 'chaser' | 'light' | 'mop' | 'scuttler' | 'dancer' | 'pecker' | 'licker'
  | 'tracker' | 'zapper' | 'emitter' | 'lure';

/** Roles laid only by their own patterns (each needs quiet round it), never by a plain obstacle beat. */
export const OWN_PATTERN: ReadonlySet<string> = new Set([
  'chaser', 'light', 'mop', 'scuttler', 'dancer', 'wall', 'pecker', 'licker', 'tracker', 'zapper', 'emitter', 'lure',
]);

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
  role: CastRole | 'blocker' | 'swoop' | 'charger' | 'floater' | 'hole' | 'dripper' | 'wall' | 'patrol';
  /** A pattern may stand it in one lane. The others pick their own way between the lanes. */
  laneBound: boolean;
  /** The only lanes it can be in (the bleach drips only onto the lower lane, from the upper ledge). */
  lanes?: readonly Lane[];
  /** It reaches into the other lane too (the bleach's drop, the hen's peck): never beside a pickup in a pair. */
  both?: boolean;
  behave: Behaviour;
  /** It shows its own attack (pose, motion): no red "!" as it arrives. */
  telegraphs: boolean;
  /** Where its picture sits against its lane, hand-tuned (see Placement). */
  place?: Placement;
  /** Bullets it takes to go down (the run's pistol): 1 unless it is tough. */
  hits?: number;
  /**
   * A bullet only meets it where it hurts (a swatter low on its lane, a bird in its dive, a boot that is down): up high,
   * far back or raised it is out of the bullet's way. Otherwise it is met wherever it stands in its lane, too.
   */
  shotWhereItHurts?: boolean;
  /** A bullet only meets the thing itself, never what it sends out (the zapper's bolt, the repeller's rings, the gel). */
  shotAtBody?: boolean;
}

const DEFAULT_HITBOX = { w: 0.6, h: 0.7 };

/**
 * Where an enemy's picture was hand-tuned against its lane, on top of what its behaviour says (what the owner set in
 * the sprite tuner). One mechanism for every enemy: ObstacleKit puts the sprite at its state plus the offset, so its
 * hitbox, its shadow's x and every effect anchored on it move together; the view files read `placeOf` for what they
 * anchor to the lane. A vertical shift changes no lane and no zone; a horizontal one moves the hurt zone that is the
 * body (Body.dx), never the stretches it threatens with.
 */
export interface Placement {
  /** World px, right and down positive. */
  dx?: number;
  dy?: number;
  /**
   * How much its art was grown or shrunk when baked (tools/art): the picture and its hitbox already are at that size, so
   * only what is anchored by a fixed number of px (a dust puff at its hooves) needs it.
   */
  size?: number;
  /** A sprite that rides with it and has its own offset on top of the enemy's (the bleach's bead). */
  parts?: Record<string, { dx?: number; dy?: number }>;
}

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
  // The look is its tell, held for a 400 ms reaction plus the hop before it lands (tests/enemies.test.ts); the hold
  // after each landing is the grace in which it cannot swap again
  cat: { hold: 1000, look: 500, leap: 200 },
  catChase: { run: 1250, windup: 450, jump: 220 },
  bleach: { fall: 320, splash: 130, spot: 56, jugDx: 30 },
  // How far along its lane the light reaches either side of the bulb: most of the screen, but never a roach the bulb
  // has only just come into view for (420 px in from the right edge is time to see it flicker at any speed)
  lamp: { dark: 1600, flicker: 750, on: 550, ahead: 420, behind: 180 },
  mop: { wait: 900, windup: 700, press: 120, sweep: 700, lift: 280, back: 600, from: 130, to: -110, raise: 36 },
  bison: { stand: 1000, paw: 600, rush: 380, halt: 400, back: 620, distance: 120 },
  hedgehog: { stand: 1000, paw: 600, rush: 380, halt: 400, back: 620, distance: 110 },
  hen: { idle: 900, windup: 480, peck: 110, hold: 260, back: 250, ahead: 150, spot: 40 },
  frog: { idle: 1000, windup: 550, shoot: 130, hold: 220, back: 180, reach: 170, mouth: 20 },
  // Its lane switches, ms before it meets the nominal runner at its slot (two, or the last one only)
  centipede: { speed: 300, from: 900, switches: [1500, 800], warn: 420, jump: 200 },
  boots: { beat: 500, down: 260, lift: 120, height: 30 },
  sprayWall: { idle: 900, windup: 600, puff: 700, reach: 90 },
  // The gun act. The gull screeches and rises (the wind-up, its landing shadow growing), dives into a lane and skims
  // along it at the runner, then climbs
  gull: { circle: 1300, windup: 700, dive: 220, glide: 380, climb: 520, high: 140, glideDx: -140 },
  // The zapper's bolt runs `reach` px down its lane towards the runner
  zapper: { idle: 1100, charge: 650, bolt: 380, cool: 220, reach: 250, hang: 64 },
  robotVacuum: { drive: 1300, wait: 450, range: 100 },
  // One ring a beat, rolling down the repeller's lane
  // ...short of a screen's worth: a ring is seen with its repeller, never coming out of nowhere
  repeller: { beat: 1100, pulse: 300, speed: 170, life: 1100, ring: 18 },
  bait: { idle: 1400, ooze: 800, flood: 1300, dry: 300, spread: 140 },
  // The aerosol's fuse after a shot (its blast radius shown meanwhile), the blast's reach either way along both lanes,
  // and the bonus for each enemy it takes with it
  aerosol: { fuse: 160, radius: 130, bonus: 30 },
} as const;

/**
 * The wasp hunts the roach itself (behaviours.stepWasp): where it comes in, how it hovers, follows and dives. From its
 * lock (the wind-up, drawing back `drawBack` px) to the sting reaching the roach is over 700 ms: a 400 ms reaction and
 * a hop, with room to spare.
 */
export const WASP: WaspTimings = {
  cue: 700, enter: 350, hover: 1300, follow: 600, switch: 200, windup: 600, dive: 300, ahead: 230, drawBack: 56, diveTo: -120,
  height: 34,
};

/**
 * The vacuum hunts the roach itself (behaviours.stepVacuum), from behind. Heard for `cue` ms before its nozzle slides in
 * (from just past the screen's left edge to `start` px behind the roach's tail, in `enter` ms); from there it closes in
 * at `creep` px/s while it shares the roach's lane: on screen for well over 2 s before it can bite, past the dash's
 * cooldown and a 400 ms reaction. A dash opening the gap `breakFree` px breaks its grip; after `hold` ms of sucking it
 * gives up, before its quiet stretch of the course (RunPatterns) runs out.
 */
export const VACUUM: VacuumTimings = {
  cue: 400, enter: 600, start: 60, creep: 40, breakFree: 50, follow: 300, switch: 220, hold: 2400, fallBack: 900,
};

/** The centipede sets off this long before it would meet the nominal runner at its slot. */
export const CENTIPEDE_LEAD = 1500;

/** A chaser runs this much faster than the course's nominal runner where it meets it, and sets off this far behind. */
export const CHASE_SPEEDUP = 1.6;
export const CHASE_START_GAP = 1400;

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  onion: {
    id: 'onion', type: 'onion', art: 'onion', frame: { w: 43, h: 37, pivotY: 0.7838 }, hitbox: DEFAULT_HITBOX,
    role: 'blocker', laneBound: true, behave: blocker, telegraphs: false,
    place: { dy: -24 },
  },
  flipper: {
    id: 'flipper', type: 'flipper', art: SWAT_HAND ? 'flipper-swat-hand' : 'flipper-swat',
    frame: SWAT_HAND ? { w: 86, h: 63, pivotY: 0.873 } : { w: 85, h: 56, pivotY: 0.8571 }, hitbox: DEFAULT_HITBOX,
    footprint: TIMINGS.flipper.footprint, role: 'swatter', laneBound: true, behave: depthSwat(TIMINGS.flipper), telegraphs: true, shotWhereItHurts: true,
  },
  spray: {
    id: 'spray', type: 'spray', art: 'spray', frame: { w: 34, h: 46, pivotY: 0.8261 }, hitbox: DEFAULT_HITBOX,
    role: 'sweeper', laneBound: true, behave: sweeper(TIMINGS.spray), telegraphs: true,
    place: { dy: -16 },
  },
  newspaper: {
    id: 'newspaper', type: 'newspaper', art: SWAT_HAND ? 'newspaper-swat-hand' : 'newspaper-swat',
    frame: SWAT_HAND ? { w: 70, h: 49, pivotY: 0.8367 } : { w: 81, h: 50, pivotY: 0.84 }, hitbox: DEFAULT_HITBOX,
    footprint: TIMINGS.newspaper.footprint, role: 'swatter', laneBound: false, behave: depthSwat(TIMINGS.newspaper),
    telegraphs: true, shotWhereItHurts: true,
  },
  bird: {
    id: 'bird', type: 'bird', art: 'bird', frame: { w: 61, h: 63, pivotY: 0.873 }, hitbox: { w: 0.75, h: 0.42 },
    role: 'swoop', laneBound: false, behave: swoop(TIMINGS.bird), telegraphs: true, shotWhereItHurts: true,
  },
  cat: {
    id: 'cat', type: 'cat', art: 'cat', frame: { w: 64, h: 61, pivotY: 0.8689 }, hitbox: { w: 0.5, h: 0.5 },
    role: 'switcher', laneBound: true, both: true, behave: pounce(TIMINGS.cat), telegraphs: true,
  },
  // The same cat, running the roach down from behind. Dies as 'cat': the server knows no other name for it
  catChase: {
    id: 'catChase', type: 'cat', art: 'cat', frame: { w: 64, h: 61, pivotY: 0.8689 }, hitbox: { w: 0.5, h: 0.5 },
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
    id: 'bison', type: 'bison', art: 'bison', frame: { w: 86, h: 68, pivotY: 0.8824 }, hitbox: { w: 0.6, h: 0.55 },
    role: 'charger', laneBound: true, behave: charger(TIMINGS.bison), telegraphs: true,
    place: { dy: 4, size: 1.5 },
  },
  glue: {
    id: 'glue', type: 'glue', art: 'glue', frame: { w: 45, h: 34, pivotY: 0.7647 }, hitbox: { w: 0.75, h: 0.6 },
    role: 'blocker', laneBound: true, behave: blocker, telegraphs: false,
    place: { dy: -28 },
  },
  bleach: {
    id: 'bleach', type: 'bleach', art: 'bleach', frame: { w: 45, h: 46, pivotY: 0.8261 }, hitbox: DEFAULT_HITBOX,
    footprint: TIMINGS.bleach.spot, role: 'dripper', laneBound: true, lanes: ['bottom'], both: true, behave: drip(TIMINGS.bleach),
    telegraphs: false,
    place: { dx: -10, dy: 22, parts: { bead: { dx: 10, dy: 44 } } },
  },
  lamp: {
    id: 'lamp', type: 'lamp', art: 'lamp', frame: { w: 50, h: 57, pivotY: 0.8596 }, hitbox: { w: 0.4, h: 0.4 },
    role: 'light', laneBound: true, behave: light(TIMINGS.lamp), telegraphs: true, shotWhereItHurts: true,
  },
  mop: {
    id: 'mop', type: 'mop', art: 'mop', frame: { w: 64, h: 64, pivotY: 0.875 }, hitbox: DEFAULT_HITBOX,
    footprint: 58, role: 'mop', laneBound: true, behave: mopSweep(TIMINGS.mop), telegraphs: true,
  },
  vacuum: {
    id: 'vacuum', type: 'vacuum', art: 'vacuum', frame: { w: 82, h: 58, pivotY: 0.8621 }, hitbox: { w: 0.4, h: 0.5 },
    role: 'chaser', laneBound: true, behave: still, telegraphs: true,
    place: { dy: 10 },
  },
  hen: {
    id: 'hen', type: 'hen', art: 'hen', frame: { w: 49, h: 63, pivotY: 0.873 }, hitbox: { w: 0.6, h: 0.7 },
    role: 'pecker', laneBound: true, lanes: ['top'], both: true, behave: peck(TIMINGS.hen), telegraphs: true,
  },
  frog: {
    id: 'frog', type: 'frog', art: 'frog', frame: { w: 52, h: 46, pivotY: 0.8261 }, hitbox: { w: 0.7, h: 0.7 },
    role: 'licker', laneBound: true, behave: tongue(TIMINGS.frog), telegraphs: true,
    place: { dx: 10, dy: 16, size: 1.35 },
  },
  centipede: {
    id: 'centipede', type: 'centipede', art: 'centipede', frame: { w: 67, h: 39, pivotY: 0.7949 }, hitbox: { w: 0.6, h: 0.6 },
    role: 'scuttler', laneBound: true, behave: scuttle(TIMINGS.centipede), telegraphs: true,
    place: { dy: 22 },
  },
  boots: {
    id: 'boots', type: 'boots', art: 'boot', frame: { w: 45, h: 42, pivotY: 0.8095 }, hitbox: { w: 0.7, h: 0.6 },
    role: 'dancer', laneBound: false, behave: stomp(TIMINGS.boots), telegraphs: true, shotWhereItHurts: true,
  },
  // Built now from its two stills, for level 9 later: in no cast yet
  hedgehog: {
    id: 'hedgehog', type: 'hedgehog', art: 'hedgehog', frame: { w: 68, h: 58, pivotY: 0.8621 }, hitbox: { w: 0.6, h: 0.6 },
    role: 'charger', laneBound: true, behave: charger(TIMINGS.hedgehog), telegraphs: true,
    place: { dy: 4, size: 1.3 },
  },
  // The spray's cloud wall: laid by the course where walls go (CourseLayout), never picked
  sprayWall: {
    id: 'sprayWall', type: 'spray', art: 'spray-big', frame: { w: 42, h: 62, pivotY: 0.871 }, hitbox: DEFAULT_HITBOX,
    role: 'wall', laneBound: false, behave: cloudWall(TIMINGS.sprayWall), telegraphs: true,
    place: { dy: 10 },
  },
  blackhole: {
    id: 'blackhole', type: 'blackhole', art: 'blackhole', frame: { w: 62, h: 44, pivotY: 0.8182 }, hitbox: { w: 0.5, h: 0.5 },
    role: 'hole', laneBound: false, behave: still, telegraphs: false,
  },
  // The gun act (levels 7-10)
  gull: {
    id: 'gull', type: 'gull', art: 'gull', frame: { w: 58, h: 58, pivotY: 0.8621 }, hitbox: { w: 0.7, h: 0.42 },
    role: 'swoop', laneBound: false, behave: swoop(TIMINGS.gull), telegraphs: true, shotWhereItHurts: true,
  },
  // It hunts the roach itself (behaviours.stepWasp, obstacles/wasp.ts): its plan only says where it comes in
  wasp: {
    id: 'wasp', type: 'wasp', art: 'wasp', frame: { w: 44, h: 47, pivotY: 0.8298 }, hitbox: { w: 0.6, h: 0.5 },
    role: 'tracker', laneBound: true, behave: still, telegraphs: true,
  },
  // It hangs from a cord over the upper lane: under the upper ledge there is no room for it over the lower one
  zapper: {
    id: 'zapper', type: 'zapper', art: 'bug-zapper', frame: { w: 38, h: 64, pivotY: 0.875 }, hitbox: { w: 0.6, h: 0.8 },
    role: 'zapper', laneBound: true, lanes: ['top'], behave: zap(TIMINGS.zapper), telegraphs: true, shotAtBody: true,
  },
  // The one tough enemy: the first shot cracks it, the second finishes it
  robotVacuum: {
    id: 'robotVacuum', type: 'robotVacuum', art: 'robot-vacuum', frame: { w: 66, h: 60, pivotY: 0.8667 }, hitbox: { w: 0.85, h: 0.45 },
    role: 'patrol', laneBound: true, behave: patrol(TIMINGS.robotVacuum), telegraphs: true, hits: 2,
    place: { dy: -2 },
  },
  repeller: {
    id: 'repeller', type: 'repeller', art: 'repeller', frame: { w: 40, h: 39, pivotY: 0.7949 }, hitbox: { w: 0.7, h: 0.7 },
    role: 'emitter', laneBound: true, behave: rings(TIMINGS.repeller), telegraphs: true, shotAtBody: true,
    place: { dy: -22 },
  },
  // A blocker that goes off when shot: its blast clears both lanes round it (obstacles/aerosol.ts)
  aerosol: {
    id: 'aerosol', type: 'aerosol', art: 'aerosol', frame: { w: 58, h: 71, pivotY: 0.8873 }, hitbox: { w: 0.36, h: 0.7 },
    role: 'blocker', laneBound: true, behave: blocker, telegraphs: false,
    place: { dy: 8 },
  },
  bait: {
    id: 'bait', type: 'bait', art: 'bait', frame: { w: 53, h: 38, pivotY: 0.7895 }, hitbox: { w: 0.75, h: 0.6 },
    role: 'lure', laneBound: true, behave: lure(TIMINGS.bait), telegraphs: true, shotAtBody: true,
    place: { dy: 8 },
  },
};

/**
 * Who each level fields, and how often. Each level's newcomer leads its weights (those laid by their own patterns, the
 * wasp, the zapper, the repeller and the bait, come by weight within them); the onion and the aerosol just stand there. Past level 10 the table holds at level 10. The light stops at level 6: past it the roach runs too fast to
 * see it flicker long before it is lit. The vacuum stays in the dash act (3-6): the dash is what breaks its grip, and
 * past it the gun act has threats of its own. The chaser (catChase) is off until it has art of its own: its
 * behaviour and its 'chase' role are kept, so bringing it back is a weight here and its chunk in RunPatterns.
 */
export const CAST: Record<number, Partial<Record<EnemyId, number>>> = {
  1: { onion: 2, glue: 2, flipper: 3, bleach: 3 },
  2: { onion: 1, glue: 1, flipper: 2, bleach: 2, spray: 4, lamp: 1, mop: 1 },
  3: { onion: .5, glue: .5, flipper: 2, bleach: 1.5, spray: 2, newspaper: 4, lamp: 1, mop: 1, vacuum: 1 },
  4: { onion: .5, glue: .3, flipper: 1.5, bleach: 1, spray: 1.5, newspaper: 2, bird: 4, hen: 4, lamp: 1, mop: 1, vacuum: 1 },
  5: { onion: .3, flipper: 1, bleach: 1, spray: 1.5, newspaper: 1.5, bird: 2, hen: 2, cat: 4, frog: 4, lamp: 1, mop: 1, vacuum: 1 },
  6: { flipper: 1, spray: 1.5, newspaper: 1.5, bird: 1.5, hen: 1.5, cat: 2, frog: 2, centipede: 4, boots: 4, lamp: 1, mop: 1, vacuum: 1 },
  // The gun act: what the pistol is for, every one of them still passed without a shot. The centipede and the boots
  // leave after level 7; the pope (level 8) and the black hole (level 10) are gone, their frames kept for old records
  7: { flipper: 1, spray: 1, newspaper: 1, bird: 1, hen: 1, cat: 1.5, frog: 1.5, jellyfish: 4, gull: 4, wasp: 1.5, centipede: 1, boots: 1, mop: .5 },
  8: { flipper: 1, spray: 1, newspaper: 1, hen: 1, cat: 1, frog: 1, jellyfish: 2, gull: 2, wasp: 1.5, zapper: 1.5, robotVacuum: 4, aerosol: 4 },
  9: { flipper: 1, newspaper: 1, cat: 1, frog: 1, jellyfish: 1.5, gull: 1.5, wasp: 1.5, zapper: 1.5, robotVacuum: 2, aerosol: 2, bison: 4, hedgehog: 4, repeller: 1.5 },
  10: { flipper: 1, newspaper: 1, cat: 1, jellyfish: 1.5, gull: 1.5, wasp: 1.5, zapper: 1.5, robotVacuum: 2, aerosol: 2.5, bison: 2, hedgehog: 2, repeller: 1.5, bait: 1.5 },
};

export const MAX_CAST_LEVEL = 10;

export function castFor(level: number): { def: EnemyDef; weight: number }[] {
  const row = CAST[Math.min(Math.max(1, level), MAX_CAST_LEVEL)];
  return (Object.entries(row) as [EnemyId, number][]).map(([id, weight]) => ({ def: ENEMIES[id], weight }));
}

/** An enemy's hand-tuned placement with its defaults filled in. */
export function placeOf(id: string): { dx: number; dy: number; size: number } {
  const place = ENEMIES[id as EnemyId].place;
  return { dx: place?.dx ?? 0, dy: place?.dy ?? 0, size: place?.size ?? 1 };
}

/** Where a part that rides with an enemy sits against its state: the enemy's own offset and the part's on top. */
export function partOf(id: string, part: string): { dx: number; dy: number } {
  const own = placeOf(id);
  const extra = ENEMIES[id as EnemyId].place?.parts?.[part];
  return { dx: own.dx + (extra?.dx ?? 0), dy: own.dy + (extra?.dy ?? 0) };
}

/** The baseline a lane-coded effect of this enemy is placed at: its lane's, moved with the enemy. */
export const feetY = (id: string, lane: Lane): number => laneY(lane) + placeOf(id).dy;

/** The hitbox an enemy's behaviour measures with. */
export function bodyOf(def: EnemyDef): Body {
  return { half: (def.footprint ?? bodyWidth(def.frame, def.hitbox)) / 2, dx: def.place?.dx ?? 0, art: def.frame, hitbox: def.hitbox };
}

export function enemyState(plan: EnemyPlan, t: number): EnemyState {
  const def = ENEMIES[plan.id as EnemyId];
  return def.behave(plan, t, bodyOf(def));
}

/**
 * Where a bullet flying along `lane` meets the enemy at run time t, as a stretch of that lane; null when it would fly
 * past (out of the lane, up high, far back, or not in it yet). Its zones in that lane always count; so does its body
 * where it stands in the lane, unless it is one that is only met where it hurts (shotWhereItHurts). A wall-like hazard
 * (the cloud wall) is no target: SpawnManager's walls and it stop bullets instead (RunGun).
 */
export function shotSpan(plan: EnemyPlan, t: number, lane: Lane): { x0: number; x1: number } | null {
  const def = ENEMIES[plan.id as EnemyId];
  const body = bodyOf(def);
  const s = def.behave(plan, t, body);
  if (s.pose === 'parked' || s.behind) return null;
  const spans: Zone[] = def.shotAtBody ? [] : s.zones.filter(z => z.lane === lane);
  if (!def.shotWhereItHurts && s.lane === lane) spans.push({ lane, x0: s.x + body.dx - body.half, x1: s.x + body.dx + body.half, since: 0 });
  if (spans.length === 0) return null;
  return { x0: Math.min(...spans.map(z => z.x0)), x1: Math.max(...spans.map(z => z.x1)) };
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
    // The centipede is timed off the nominal runner at its slot
    if (def.id === 'centipede') {
      const meetAt = this.clock.timeAt(x);
      plan.chase = { meetAt, speed: this.clock.speedAt(x), startAt: meetAt - CENTIPEDE_LEAD };
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
