/**
 * DJ Bigos's frames: his own atlas (tools/art/bake_bosses.py, rig tools/art/bigos.py), loaded with the other boss
 * assets after boot. Four kinds of cell share it: his (him with his booth, pivot on the floor under his middle; the
 * beam's light is baked on the same cell to lay over him), the speaker's (pivot on the floor under the cabinet's
 * middle), the shockwave ring's (pivot bottom left) and the beam strip's (untrimmed so it tiles, pivot on its axis at
 * the left). Everything here is checked against the rig when it is baked.
 */
export const BIGOS_TEXTURE = 'boss-bigos';
export const BIGOS_ATLAS = { image: 'boss/bigos.webp', json: 'boss/bigos.json' };

/** Everything he does is laid out on this beat: the loops run 4 frames a beat, the one-shots name their beat frame. */
export const BIGOS_BPM = 120;
export const BEAT_MS = 60000 / BIGOS_BPM;

export type BigosAnim =
  'groove' | 'point-top' | 'point-bottom' | 'drop' | 'drop-windup' |
  'beam-top-windup' | 'beam-top-loop' | 'beam-top-release' |
  'beam-bottom-windup' | 'beam-bottom-loop' | 'beam-bottom-release' |
  'hurt' | 'overheat' | 'defeat' |
  'light-top' | 'light-bottom' |
  'speaker-thump' | 'speaker-charge' | 'speaker-blast' | 'speaker-overload' | 'speaker-broken' |
  'ring' | 'strip' | 'record' | 'record-shatter';

/** As baked: bake_bosses.py checks these against the rig. */
export const BIGOS_ANIMS: Record<BigosAnim, { frames: number; fps: number; loop: boolean }> = {
  'groove': { frames: 8, fps: 8, loop: true },
  'point-top': { frames: 5, fps: 12, loop: false },
  'point-bottom': { frames: 5, fps: 12, loop: false },
  'drop': { frames: 6, fps: 12, loop: false },
  'drop-windup': { frames: 4, fps: 8, loop: true },
  'beam-top-windup': { frames: 3, fps: 8, loop: false },
  'beam-top-loop': { frames: 4, fps: 8, loop: true },
  'beam-top-release': { frames: 2, fps: 8, loop: false },
  'beam-bottom-windup': { frames: 3, fps: 8, loop: false },
  'beam-bottom-loop': { frames: 4, fps: 8, loop: true },
  'beam-bottom-release': { frames: 2, fps: 8, loop: false },
  'hurt': { frames: 4, fps: 12, loop: false },
  'overheat': { frames: 4, fps: 8, loop: true },
  'defeat': { frames: 12, fps: 10, loop: false },
  'light-top': { frames: 4, fps: 8, loop: true },
  'light-bottom': { frames: 4, fps: 8, loop: true },
  'speaker-thump': { frames: 4, fps: 8, loop: true },
  'speaker-charge': { frames: 4, fps: 8, loop: true },
  'speaker-blast': { frames: 4, fps: 12, loop: false },
  'speaker-overload': { frames: 4, fps: 8, loop: true },
  'speaker-broken': { frames: 5, fps: 10, loop: false },
  'ring': { frames: 5, fps: 12, loop: true },
  'strip': { frames: 4, fps: 8, loop: true },
  'record': { frames: 4, fps: 16, loop: true },
  'record-shatter': { frames: 4, fps: 16, loop: false },
};

/** The frame of each one-shot that lands on the beat: start it that many frames before. */
export const BIGOS_HIT: Partial<Record<BigosAnim, number>> = {
  'point-top': 2,
  'point-bottom': 2,
  'drop': 3,
  'speaker-blast': 1,
};

/**
 * Native px. His from his pivot: the beams' axes over the floor, his cell's left edge (the strip tiles on leftward from
 * there), the ball's middle and radius as it overheats, the booth's left edge. The speaker's from its pivot: its box
 * and the big cone's middle (where a ring leaves). Then the ring's and the strip's sizes.
 */
export const BIGOS_LAYOUT = {
  beamTop: -80,
  beamBottom: -12,
  cellLeft: -90,
  ballX: 2,
  ballY: -79,
  ballR: 18,
  boothLeft: -45,
  speakerW: 44,
  speakerH: 56,
  coneX: -5,
  coneY: -21,
  ringW: 26,
  ringH: 40,
  stripW: 64,
  stripH: 23,
} as const;

/**
 * His near glove's wrist in every frame of the loop and the two points, native px from his pivot (the bake checks them
 * against the rig): the record he winds up with sits in the glove, BIGOS_GLOVE from there.
 */
export const BIGOS_HAND = {
  'groove': [{ x: -23, y: -46 }, { x: -23, y: -46 }, { x: -24, y: -46 }, { x: -24, y: -46 }, { x: -25, y: -46 }, { x: -25, y: -46 }, { x: -24, y: -46 }, { x: -24, y: -46 }],
  'point-top': [{ x: -12, y: -58 }, { x: -23, y: -83 }, { x: -22, y: -82 }, { x: -23, y: -82 }, { x: -23, y: -82 }],
  'point-bottom': [{ x: -14, y: -67 }, { x: -24, y: -43 }, { x: -31, y: -38 }, { x: -30, y: -39 }, { x: -30, y: -39 }],
} as const;
export const BIGOS_GLOVE = { x: -6, y: -2 } as const;

export const bigosFrame = (anim: BigosAnim, index = 0): string => `bigos-${anim}_${index}`;

/** What hit the roach, for its game-over line: the server only hears 'bigos'. */
export type BigosCause = 'ring' | 'drop' | 'record' | 'light';
/** The registry key the fight leaves the cause under for the game-over screen. */
export const BIGOS_CAUSE_KEY = 'bigos-cause';

const DEATH_LINES: Record<BigosCause, string[]> = {
  ring: ['Bas przeszedł po tobie!', 'Fala z głośnika!', 'Trzeba było skakać na raz!'],
  drop: ['Drop cię zmiótł!', 'Na dropie się dashuje!', 'Ostatni kawałek dla ciebie!'],
  record: ['Płytą w łeb!', 'Winyl nie wybacza!', 'Hit sezonu prosto w czoło!'],
  light: ['Oślepiony na parkiecie!', 'Światła na ciebie!', 'Kula widzi wszystko!'],
};

/** The game-over lines for a death in his fight, by what did it (any of them when it isn't known). */
export function bigosDeathLines(cause: unknown): string[] {
  return typeof cause === 'string' && cause in DEATH_LINES
    ? DEATH_LINES[cause as BigosCause]
    : Object.values(DEATH_LINES).flat();
}
