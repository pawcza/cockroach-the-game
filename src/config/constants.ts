export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 512;

// Floor positions (Y coordinates)
export const FLOOR_BOTTOM_Y = 396;
export const FLOOR_TOP_Y = 296;
export const FLOOR_HEIGHT = 32;

// Floor tile rendering
export const FLOOR_TILE_W = 64;
export const FLOOR_TILE_H = 32;
export const FLOOR_TILE_GAP = 4;
export const FLOOR_TILE_STEP = FLOOR_TILE_W + FLOOR_TILE_GAP; // 68
export const FLOOR_TILE_RADIUS = 6;

// Cockroach
export const COCKROACH_START_X = 150;
export const COCKROACH_BASE_SPEED = 200;
export const COCKROACH_ACCELERATION = 1.5; // px/s per second
export const COCKROACH_JUMP_VELOCITY = -550;
export const COCKROACH_GRAVITY = 800;

// Spawning
export const SPAWN_DISTANCE_AHEAD = 900;
export const MIN_OBSTACLE_SPACING = 250;
export const APPLE_SPAWN_CHANCE = 0.4;
export const OBSTACLE_SPAWN_INTERVAL = 350;

// Dash
export const DASH_DURATION = 375;
export const DASH_COOLDOWN = 1200;
export const DASH_SPEED_BOOST = 300; // flat px/s added during dash

// Pill pickup
export const PILL_SPAWN_CHANCE = 0.005; // 0.5% - 10x rarer than beer
export const PILL_SPEED_MULTIPLIER = 1.5;
export const PILL_DURATION = 4000; // 4 seconds
export const PILL_WARN_TIME = 1000; // last 1 second blinks as warning

// Speed per level (added on top of time-based acceleration)
export const SPEED_BOOST_PER_LEVEL = 20; // px/s per level crossed

// Tyskie pickup
export const TYSKIE_SPAWN_CHANCE = 0.05; // 5% of slots get a Tyskie

// Scoring
export const APPLE_SCORE = 10;
export const TYSKIE_SCORE = 25;
export const PILL_SCORE = 100;
export const SURVIVAL_SCORE_INTERVAL = 1000;

// ---------------------------------------------------------------------------
//  Color palettes
// ---------------------------------------------------------------------------

export const COLORS = {
  /** Neon palette used across menu/multiplayer scenes. */
  NEON: [0xff00ff, 0x00ffff, 0xff6600, 0x00ff66, 0xffff00, 0xff0088, 0x8800ff] as const,
  /** Full rainbow cycle (pill effects, afterimages). */
  RAINBOW: [0xff0000, 0xff8800, 0xffff00, 0x00ff00, 0x00ffff, 0x0088ff, 0xff00ff] as const,
  /** Confetti burst colours. */
  CONFETTI: [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xff6600] as const,
  /** Warm collect-effect palette. */
  COLLECT: [0xffd700, 0xff6b35, 0xff1493, 0x00ff88, 0xffff00] as const,
  /** Disco ball ray colours. */
  DISCO: [0xff00ff, 0x00ffff, 0xffff00, 0x00ff66, 0xff6600, 0x8800ff] as const,
  /** Dash trail per-speed colours. */
  DASH_TRAIL: [0xffff00, 0xff6600, 0xff00ff, 0x00ffff, 0x00ff00] as const,
  /** Pill speed-line colours. */
  PILL_LINES: [0xff00ff, 0x00ffff, 0xffff00, 0xff0088, 0x00ff88] as const,

  // Single-use named colours
  PILL_GLOW: 0xff00ff,
  TYSKIE_GLOW: 0xffdd00,
  APPLE_GLOW: 0x00ff44,
  DEATH_PARTICLE: 0xaa0000,
} as const;

// ---------------------------------------------------------------------------
//  Depth layers
// ---------------------------------------------------------------------------

export const DEPTH = {
  BACKGROUND: 0,
  PARALLAX_MID: 1,
  PARALLAX_FG: 2,
  FLOOR: 3,
  GLOW: 9,
  PICKUPS: 10,
  PLAYER: 50,
  OBSTACLES: 50,
  UI_OVERLAY: 100,
  PILL_SPEED_LINES: 988,
  PILL_OVERLAY: 989,
  VFX_TINT: 990,
  VFX_VIGNETTE: 991,
  VFX_BORDER: 993,
  VFX_FLASH: 995,
  VFX_TEXT: 996,
  POPUP: 999,
  HUD: 1000,
  PAUSE: 4000,
  SCOREBOARD: 3000,
} as const;
