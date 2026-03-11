export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 512;

// Floor positions (Y coordinates)
export const FLOOR_BOTTOM_Y = 396;
export const FLOOR_TOP_Y = 296;
export const FLOOR_HEIGHT = 16;

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
