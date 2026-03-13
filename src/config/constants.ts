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

// Scoring
export const APPLE_SCORE = 10;
export const TYSKIE_SCORE = 25;
export const PILL_SCORE = 100;
export const SURVIVAL_SCORE_INTERVAL = 1000;

// ── Shared color palettes ─────────────────────────────────────────────
export const COLORS = {
  /** Neon accent colors used for floating particles, background effects. */
  NEON: [0xff00ff, 0x00ffff, 0xff6600, 0x00ff66, 0xffff00, 0xff0088, 0x8800ff],
  /** Rainbow cycling colors for #1 rank effects. */
  RAINBOW: ['#ffd700', '#ff00ff', '#ffff00', '#00ffff', '#ff6600'],
  /** Confetti burst colors (new-record celebrations). */
  CONFETTI: [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xff6600],
  /** Collect burst colors. */
  COLLECT: [0xffd700, 0xff6b35, 0xff1493, 0x00ff88, 0xffff00],
  /** Disco ball palette. */
  DISCO: [0xff00ff, 0x00ffff, 0xffff00, 0xff6600, 0x00ff66],
  /** Dash trail colors. */
  DASH_TRAIL: [0x00ffff, 0x0088ff, 0x00ffcc],
  /** Pill pickup line colors. */
  PILL_LINES: [0xff00ff, 0x00ffff, 0xffff00],
  /** Pill glow color. */
  PILL_GLOW: 0xff00ff,
  /** Tyskie glow color. */
  TYSKIE_GLOW: 0xffd700,
  /** Apple glow color. */
  APPLE_GLOW: 0x00ff00,
  /** Death particle color. */
  DEATH_PARTICLE: 0xaa0000,
} as const;

// ── Depth layers ──────────────────────────────────────────────────────
export const DEPTH = {
  /** Standard HUD elements (score, bars, indicators). */
  HUD: 100,
  /** HUD bar fills (one above HUD bg). */
  HUD_FILL: 101,
  /** Level-up / milestone announcements. */
  ANNOUNCEMENT: 1000,
  /** Touch controls. */
  TOUCH: 3000,
  /** Pause overlay background. */
  PAUSE: 4001,
  /** Pause overlay text. */
  PAUSE_TEXT: 4002,
  /** Pause button (always on top of touch). */
  PAUSE_BTN: 5000,
  PAUSE_BTN_LABEL: 5001,
} as const;
