export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 512;

// Real pixel art: the world is drawn on a grid of PIXEL_BLOCK logical px (256 native rows), and the canvas is
// scaled by a whole number of device pixels per native pixel.
export const PIXEL_BLOCK = 2;

/** A pickup's burst plays this much higher than the pickup's baseline: where pickups hovered before they were lowered. */
export const PICKUP_BURST_RISE = 20;


// Floor positions (Y coordinates)
export const FLOOR_BOTTOM_Y = 408;
export const FLOOR_TOP_Y = 272;
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
export const COCKROACH_SPEED_MAX_BOOST = 300; // max px/s added by time (1.5 * BASE)
export const COCKROACH_SPEED_TAU = 200; // seconds to reach ~63% of max boost

// Spawning
export const SPAWN_DISTANCE_AHEAD = 900;

// Dash
export const DASH_DURATION = 375;
export const DASH_COOLDOWN = 1200;
export const DASH_SPEED_BOOST = 300; // flat px/s added during dash

// Pill pickup
// Of the pickups the run's patterns lay out, how many are a pill or a beer instead of an apple
export const PILL_CHANCE = 0.012;
export const PILL_SPEED_MULTIPLIER = 1.5;
export const PILL_DURATION = 5000; // 5 seconds
export const PILL_WARN_TIME = 1000; // last 1 second blinks as warning

// Speed per level (added on top of time-based acceleration)
export const SPEED_BOOST_PER_LEVEL = 20; // px/s per level crossed

export const BEER_CHANCE = 0.12;

// Scoring
export const APPLE_SCORE = 10;
export const BEER_SCORE = 25;
export const PILL_SCORE = 100;

// ── Color palettes ──────────────────────────────────────────────────

export const COLORS = {
  /** Pill pickup glow */
  PILL_GLOW: 0xff00ff,
} as const;

// ── Depth layers ────────────────────────────────────────────────────

export const DEPTH = {
  SKY_BG: 0,
  MID_BG: 1,
  FG_BG: 2,
  /** An enemy held up over the lower lane: behind the upper ledge, so it hangs under it instead of standing on it. */
  BEHIND_LEDGE: 2.5,
  FLOOR: 3,
  CONTACT_SHADOW: 4,
  GODRAY: 8,
  GLOW: 9,
  PICKUPS: 11,
  OBSTACLES: 10,
  NEAR_LAYER: 50,
  MENU_PAGE: 10,
  DISCO_STROBE: 90,
  VIGNETTE_MENU: 100,
  WARNING: 500,
  GHOST_SPRITE: 500,
  GHOST_LABEL: 501,
  PILL_SPEED_LINES: 988,
  PILL_OVERLAY: 989,
  VFX_VIGNETTE: 991,
  VFX_FLASH: 995,
  VFX_TEXT: 996,
  SCORE_MILESTONE: 998,
  POPUP: 999,
  HUD: 1000,
  HUD_FILL: 1001,
  COUNTDOWN: 1000,
  ANNOUNCEMENT: 1002,
  /** A boss mocking the roach mid-run: the portrait and speech panel. Over the HUD, under the pause. */
  TAUNT: 1100,
  BIRD_OVERLOOK: 2000,
  /** The new-ability beat after a boss: the dimmer, rays and icon, then the text above them. */
  REWARD: 2400,
  REWARD_TEXT: 2401,
  TOUCH_ZONE: 2999,
  TOUCH_BUTTON: 3000,
  /** The tutorial's small "Pomiń": over the touch zone, so a tap on it is not a lane change. */
  TUTORIAL_SKIP: 3001,
  SCOREBOARD: 3000,
  GHOST_ARROW: 3500,
  SPECTATE_OVERLAY: 3500,
  PAUSE: 4000,
  DEATH_NOTIFICATION: 4000,
  PAUSE_TEXT: 4001,
  PAUSE_BTN: 5000,
  /** The boss versus splash covers everything, the pause button too: its layer, the text above it, and the flash over both. */
  VERSUS: 5100,
  VERSUS_TEXT: 5101,
  VERSUS_FLASH: 5102,
  DEATH_REPLAY_BG: 6000,
  DEATH_REPLAY_FLOOR: 6001,
  DEATH_REPLAY_SPRITE: 6002,
  DEATH_REPLAY_TEXT: 6003,
  DEATH_REPLAY_LABEL: 6004,
} as const;

/**
 * The combo's exhaust flames (VisualEffects): fire from 40 in a row, hotter with speed lines from 120, a comet from 200.
 * They fall on whole multiplier steps (x2, x4, x6: comboMultiplier adds 0.025 a pickup). Measured on headless bot runs
 * that missed almost nothing: about 30 in a row by the end of level 2, 75 by the end of level 4, 100-120 by the end of
 * level 6, and the streak broke in the gun act (level 7+); the course lays about one pickup every 10 m, so an unbroken
 * streak reaches 200 near level 9. The first flames are earned after Lodzia, the second by a clean run to DJ Bigos,
 * the third by a near-perfect one.
 */
export const COMBO_FLAMES = [40, 120, 200] as const;

/** The combo notices, the flames' tiers among them (40, 120, 200) and x3 between (80). */
export const COMBO_TIERS = [
  { threshold: 10,  color: 0x44ff44, label: 'NIEZŁE!' },
  { threshold: 25,  color: 0xffff00, label: 'MASAKRA!' },
  { threshold: 40,  color: 0xff6600, label: 'SZALEŃSTWO!' },
  { threshold: 80,  color: 0xff00ff, label: 'TURBOKOMPOT!' },
  { threshold: 120, color: 0x00ffff, label: 'ULTRA KARALUCH!' },
  { threshold: 200, color: 0xff0000, label: 'NIEMOŻLIWE!!!' },
] as const;
