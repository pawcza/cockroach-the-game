import { Server } from 'socket.io';

// Mirror the game's speed constants
const COCKROACH_BASE_SPEED = 200;
const COCKROACH_SPEED_MAX_BOOST = 300;
const COCKROACH_SPEED_TAU = 200;
const SPEED_BOOST_PER_LEVEL = 20;
const DASH_SPEED_BOOST = 300;
const DASH_DURATION = 375;
const LEVEL_THRESHOLDS = [0, 100, 250, 450, 700, 950, 1200, 1500, 1800, 2200];

function getLevelForDistance(dist: number): number {
  let level = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (dist >= LEVEL_THRESHOLDS[i]) { level = i + 1; break; }
  }
  return level;
}

function getSpeed(elapsedSeconds: number, level: number, isDashing: boolean): number {
  const timeBoost = COCKROACH_SPEED_MAX_BOOST * (1 - Math.exp(-elapsedSeconds / COCKROACH_SPEED_TAU));
  const levelBonus = (level - 1) * SPEED_BOOST_PER_LEVEL;
  const base = COCKROACH_BASE_SPEED + timeBoost + levelBonus;
  return base + (isDashing ? DASH_SPEED_BOOST : 0);
}

/**
 * Compute position analytically from the integral of the speed formula.
 * Ignores level bonus (small, corrected by position events).
 *
 * speed(t) = BASE + MAX_BOOST * (1 - exp(-t/TAU))
 * ∫speed dt = BASE*t + MAX_BOOST*(t + TAU*exp(-t/TAU) - TAU) + C
 * At t=0: position = startX, so C = startX + MAX_BOOST * TAU
 */
function getPositionAtTime(elapsedSeconds: number, startX: number): number {
  const B = COCKROACH_BASE_SPEED;
  const M = COCKROACH_SPEED_MAX_BOOST;
  const T = COCKROACH_SPEED_TAU;
  return startX + B * elapsedSeconds + M * (elapsedSeconds + T * Math.exp(-elapsedSeconds / T) - T);
}

export function setupDebugBot(_io: Server): void {
  // Placeholder — bot spawning is triggered from multiplayer.ts
}

export function spawnBotForLobby(io: Server, lobbyId: string, hostSocket?: any): void {
  const { io: ioClient } = require('socket.io-client');

  const port = process.env.PORT || 3456;
  const bot = ioClient(`http://localhost:${port}`, {
    path: '/socket.io',
    transports: ['websocket'],
  });

  let lane: 'top' | 'bottom' = 'bottom';
  let x = 150;
  let alive = true;
  let score = 0;
  let combo = 0;
  let gameStarted = false;
  let isDashing = false;
  let activePlayTime = 0;
  let startTime = 0;

  bot.on('connect', () => {
    bot.emit('set-name', 'DebugBot');
    bot.emit('lobby:join', lobbyId, (res: any) => {
      if (res?.error) {
        console.log('[DebugBot] Failed to join lobby:', res.error);
        bot.disconnect();
        return;
      }
      console.log('[DebugBot] Joined lobby', lobbyId);
      bot.emit('lobby:ready', true, () => {});
    });

    // If the debug player leaves, bot becomes host of an empty lobby — disconnect
    bot.on('lobby:updated', (lobbyData: any) => {
      if (!lobbyData) return;
      const players = lobbyData.players || [];
      const botPlayer = players.find((p: any) => p.name === 'DebugBot');
      if (players.length <= 1 && botPlayer) {
        console.log('[DebugBot] Alone in lobby, disconnecting');
        bot.disconnect();
      }
    });
  });

  bot.on('game:start', () => {
    console.log('[DebugBot] Game started, waiting for countdown...');
    gameStarted = true;
    alive = true;
    x = 150;
    score = 0;
    combo = 0;
    isDashing = false;
    activePlayTime = 0;
    lane = 'bottom';
    startTime = Date.now();

    const countdownEnd = Date.now() + 2400;
    const TICK_MS = 100;
    let lastTick = Date.now();
    let sentInitialPos = false;
    let gameplayStartWallClock = 0;

    const playInterval = setInterval(() => {
      if (!alive || !gameStarted) {
        clearInterval(playInterval);
        return;
      }

      const now = Date.now();
      if (now < countdownEnd) { lastTick = now; return; }

      // Send initial position immediately at countdown end
      if (!sentInitialPos) {
        sentInitialPos = true;
        gameplayStartWallClock = now;
        lastTick = now;
        bot.emit('game:position', { x, lane, t: 0 });
        return;
      }

      lastTick = now;

      // Use wall clock for activePlayTime (same as GameClock.activePlayTime)
      activePlayTime = now - gameplayStartWallClock;

      // Compute position analytically — no accumulation, no drift
      x = getPositionAtTime(activePlayTime / 1000, 150);

      // Swap lanes every ~4s
      if (Math.random() < 0.025) {
        lane = lane === 'top' ? 'bottom' : 'top';
        bot.emit('game:swap', { lane, x });
      }

      // Position sync every tick
      bot.emit('game:position', { x, lane, t: activePlayTime });
    }, TICK_MS);

    // Die 5-15 seconds after another player dies, or after 120s max
    const dieNow = (): void => {
      if (!alive || !gameStarted) return;
      alive = false;
      const timeSurvived = Math.floor((Date.now() - startTime) / 1000);
      const distance = Math.floor((x - 150) / 50);
      bot.emit('game:death', {
        score,
        stats: {
          timeSurvived,
          distance,
          maxSpeed: getSpeed(activePlayTime / 1000, getLevelForDistance(distance), false) / COCKROACH_BASE_SPEED,
          obstacleType: 'onion',
          applesCollected: Math.floor(score / 10),
          beersCollected: 0,
          pillsCollected: 0,
          maxCombo: combo,
          maxLevel: getLevelForDistance(distance),
        },
      });
      console.log('[DebugBot] Died at distance', distance, 'score', score);
    };

    bot.on('game:death', () => {
      if (!alive) return;
      const delay = 5000 + Math.random() * 10000;
      setTimeout(dieNow, delay);
    });
    setTimeout(dieNow, 120000);
  });

  bot.on('game:over', () => {
    gameStarted = false;
    console.log('[DebugBot] Game over, disconnecting');
    setTimeout(() => bot.disconnect(), 2000);
  });

  bot.on('game:boss-start', (data: any) => {
    console.log('[DebugBot] Boss fight started');
    x = data.triggerX;
    const shootInterval = setInterval(() => {
      if (!alive || !gameStarted) {
        clearInterval(shootInterval);
        return;
      }
      bot.emit('game:boss-shoot');
      bot.emit('game:boss-hit');
      if (Math.random() < 0.3) {
        lane = lane === 'top' ? 'bottom' : 'top';
        bot.emit('game:swap', { lane, x });
      }
    }, 300);
  });

  bot.on('disconnect', () => {
    console.log('[DebugBot] Disconnected');
    gameStarted = false;
    alive = false;
  });
}
