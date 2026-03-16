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
export const COCKROACH_ACCELERATION = 1.5; // legacy — unused, kept for reference
export const COCKROACH_SPEED_MAX_BOOST = 300; // max px/s added by time (1.5 * BASE)
export const COCKROACH_SPEED_TAU = 200; // seconds to reach ~63% of max boost
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

// Beer pickup
export const BEER_SPAWN_CHANCE = 0.05; // 5% of slots get a beer

// Scoring
export const APPLE_SCORE = 10;
export const BEER_SCORE = 25;
export const PILL_SCORE = 100;
export const SURVIVAL_SCORE_INTERVAL = 1000;

// ── Color palettes ──────────────────────────────────────────────────

export const COLORS = {
  /** Neon accent colors */
  NEON: [0xff00ff, 0x00ffff, 0xffff00, 0x00ff88],
  /** Full rainbow spectrum */
  RAINBOW: [0xff0000, 0xff8800, 0xffff00, 0x00ff00, 0x00ffff, 0x0088ff, 0xff00ff],
  /** Confetti burst colors */
  CONFETTI: [0xff00ff, 0x00ffff, 0xffff00, 0xff6600, 0x00ff88],
  /** Apple / generic collect burst */
  COLLECT: [0xffd700, 0xff6b35, 0xff1493, 0x00ff88, 0xffff00],
  /** Disco ball ray colors */
  DISCO: [0xff00ff, 0x00ffff, 0xffff00, 0x00ff66, 0xff6600, 0x8800ff],
  /** Dash afterimage trail */
  DASH_TRAIL: [0xffff00, 0xff6600, 0xff00ff, 0x00ffff, 0x00ff00],
  /** Pill speed-line colors */
  PILL_LINES: [0xff00ff, 0x00ffff, 0xffff00, 0xff0088, 0x00ff88],
  /** Pill pickup glow */
  PILL_GLOW: 0xff00ff,
  /** Beer pickup glow */
  BEER_GLOW: 0xffdd00,
  /** Apple pickup glow */
  APPLE_GLOW: 0x00ff44,
  /** Death particle color */
  DEATH_PARTICLE: 0xff0000,
} as const;

// ── Depth layers ────────────────────────────────────────────────────

export const DEPTH = {
  SKY_BG: 0,
  MID_BG: 1,
  FG_BG: 2,
  FLOOR_HIGHLIGHT: 2,
  FLOOR: 3,
  GODRAY: 8,
  GLOW: 9,
  PICKUPS: 10,
  OBSTACLES: 10,
  DISCO_STROBE: 90,
  VIGNETTE_MENU: 100,
  WARNING: 500,
  GHOST_SPRITE: 500,
  GHOST_LABEL: 501,
  PILL_SPEED_LINES: 988,
  PILL_OVERLAY: 989,
  VFX_TINT: 990,
  VFX_VIGNETTE: 991,
  VFX_BORDER: 993,
  VFX_FLASH: 995,
  VFX_TEXT: 996,
  POPUP: 999,
  HUD: 1000,
  HUD_FILL: 1001,
  COUNTDOWN: 1000,
  ANNOUNCEMENT: 1002,
  BIRD_OVERLOOK: 2000,
  TOUCH_ZONE: 2999,
  TOUCH_BUTTON: 3000,
  TOUCH_LABEL: 3001,
  SCOREBOARD: 3000,
  GHOST_ARROW: 3500,
  SPECTATE_OVERLAY: 3500,
  PAUSE: 4000,
  DEATH_NOTIFICATION: 4000,
  PAUSE_TEXT: 4001,
  UNPAUSE_COUNTDOWN: 4003,
  PAUSE_BTN: 5000,
  PAUSE_BTN_LABEL: 5001,
} as const;
