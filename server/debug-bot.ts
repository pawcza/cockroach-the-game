import { Server } from 'socket.io';

/**
 * Debug bot that auto-joins a lobby when a player named "debug" is present.
 * The bot connects as a real socket client internally, so it goes through
 * the full network path with real latency.
 *
 * After the game starts, the bot auto-plays: swaps lanes occasionally,
 * dashes, and sends position updates.
 */
export function setupDebugBot(io: Server): void {
  // Track active bots per lobby
  const activeBots = new Map<string, ReturnType<typeof createBot>>();

  io.on('connection', (socket) => {
    // When a lobby is updated, check if we need to spawn/remove a bot
    socket.on('lobby:join', () => checkForDebugPlayer(socket));
    socket.on('lobby:leave', () => cleanupBot(socket));
  });

  function checkForDebugPlayer(triggerSocket: any): void {
    // This is called after a player joins. We check all lobbies for "debug" players.
    // The actual bot spawning happens via lobby:updated events.
  }

  function cleanupBot(_socket: any): void {
    // Cleanup handled by bot disconnect
  }

  // Simpler approach: hook into lobby:updated broadcasts
  // When we see a lobby with a "debug" player, spawn a bot
  const origEmit = io.emit.bind(io);

  // Monitor lobby updates to detect "debug" players
  io.use((socket, next) => {
    const origOn = socket.on.bind(socket);
    socket.on = function (event: string, ...args: any[]) {
      if (event === 'set-name') {
        const handler = args[0];
        args[0] = (name: string) => {
          handler(name);
          if (name === 'debug') {
            // This socket is the debug player — spawn a bot in their lobby after game starts
            socket.data.isDebugPlayer = true;
          }
        };
      }
      return origOn(event, ...args);
    } as any;
    next();
  });
}

/**
 * Creates a bot that joins a lobby and auto-plays.
 * Call this from the lobby:start handler when a debug player is detected.
 */
export function spawnBotForLobby(io: Server, lobbyId: string): void {
  const { io: ioClient } = require('socket.io-client');

  // Connect to ourselves
  const port = process.env.PORT || 3000;
  const bot = ioClient(`http://localhost:${port}`, {
    path: '/socket.io',
    transports: ['websocket'],
  });

  let lane: 'top' | 'bottom' = 'bottom';
  let x = 150; // COCKROACH_START_X
  let alive = true;
  let score = 0;
  let gameStarted = false;

  bot.on('connect', () => {
    bot.emit('set-name', 'DebugBot');
    // Join the lobby
    bot.emit('lobby:join', lobbyId, (res: any) => {
      if (res?.error) {
        console.log('[DebugBot] Failed to join lobby:', res.error);
        bot.disconnect();
        return;
      }
      console.log('[DebugBot] Joined lobby', lobbyId);
      // Set ready
      bot.emit('lobby:ready', true, () => {});
    });
  });

  bot.on('game:start', () => {
    console.log('[DebugBot] Game started, waiting for countdown...');
    gameStarted = true;
    alive = true;
    x = 150;
    score = 0;
    lane = 'bottom';

    // Wait for countdown (4 steps × 600ms = 2400ms)
    setTimeout(() => {
      console.log('[DebugBot] Playing');
    }, 2500);

    const countdownEnd = Date.now() + 2500;

    // Auto-play loop (waits for countdown)
    const playInterval = setInterval(() => {
      if (!alive || !gameStarted) {
        clearInterval(playInterval);
        return;
      }
      if (Date.now() < countdownEnd) return;

      // Advance X (approximate speed)
      x += 200 * 0.5; // ~half second intervals at base speed

      // Random swap (30% chance)
      if (Math.random() < 0.3) {
        lane = lane === 'top' ? 'bottom' : 'top';
        bot.emit('game:swap', { lane, x });
      }

      // Random dash (10% chance)
      if (Math.random() < 0.1) {
        bot.emit('game:dash-start', { x });
        setTimeout(() => {
          x += 50;
          bot.emit('game:dash-end', { x });
        }, 375);
      }

      // Occasional pickup event (simulates collecting)
      if (Math.random() < 0.2) {
        score += 10;
        bot.emit('game:pickup', { x: x - 20, score, combo: Math.floor(Math.random() * 5) });
      }
    }, 500);

    // Die 5-15 seconds after another player dies (to test spectate flow)
    const dieNow = (): void => {
      if (!alive || !gameStarted) return;
      alive = false;
      const timeSurvived = Math.floor((Date.now() - startTime) / 1000);
      bot.emit('game:death', {
        score,
        stats: {
          timeSurvived,
          distance: Math.floor(x / 50),
          maxSpeed: 2.0,
          obstacleType: 'onion',
          applesCollected: Math.floor(score / 10),
          beersCollected: 0,
          pillsCollected: 0,
          maxCombo: 3,
          maxLevel: 2,
        },
      });
      console.log('[DebugBot] Died with score', score);
    };

    const startTime = Date.now();

    // Die after host dies (5-15s delay) or after 120s max
    bot.on('game:death', () => {
      if (!alive) return;
      const delay = 5000 + Math.random() * 10000;
      setTimeout(dieNow, delay);
    });
    setTimeout(dieNow, 120000);
  });

  // Handle game over
  bot.on('game:over', () => {
    gameStarted = false;
    console.log('[DebugBot] Game over');
  });

  // Handle boss fight
  bot.on('game:boss-start', (data: any) => {
    console.log('[DebugBot] Boss fight started');
    // Bot shoots at the boss
    const shootInterval = setInterval(() => {
      if (!alive || !gameStarted) {
        clearInterval(shootInterval);
        return;
      }
      bot.emit('game:boss-shoot');
      bot.emit('game:boss-hit');

      // Swap lanes during boss fight too
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
