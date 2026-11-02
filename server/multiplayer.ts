import { Server, Socket } from 'socket.io';
import { LobbyManager, type Lobby } from './lobby';
import { clientIp, TokenBucket } from './net';
import {
  cleanName, MAX_NAME_LENGTH, parseBossProjectile, parseCoord, parseLane, parseLobbyId, parseRunStats, parseScore,
} from './validate';

const MAX_CONNECTIONS = 1000;
const MAX_CONNECTIONS_PER_IP = 20;
const LOBBY_LIST_DELAY_MS = 100;

/** Matches BOSS_MAX_HP on the client: one player's worth of boss. */
const BOSS_HP_PER_PLAYER = 50;
const BOSS_BONUS = 500;

/** A running player sends a position 10 times a second, so a minute of nothing means the tab is gone. */
const STALL_MS = 60_000;
const SWEEP_MS = 5000;

type Ack = (response: unknown) => void;

interface DeathRecord {
  score: number;
  stats: Record<string, number | string>;
}

interface BossState {
  hp: number;
  hostId: string;
}

/** What the server tracks for one game in progress. */
interface Run {
  deaths: Map<string, DeathRecord>;
  lastSeen: Map<string, number>;
  lastScore: Map<string, number>;
  boss: BossState | null;
  bossDefeated: boolean;
}

export interface MultiplayerOptions {
  stallMs?: number;
  sweepMs?: number;
}

function ackOf(value: unknown): Ack {
  return typeof value === 'function' ? (value as Ack) : () => {};
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function serializeLobby(lobbies: LobbyManager, lobby: Lobby) {
  return { id: lobby.id, players: lobbies.serializePlayers(lobby), status: lobby.status };
}

/** Wires up the game's sockets and returns a function that stops the server's timers. */
export function setupMultiplayer(io: Server, options: MultiplayerOptions = {}): () => void {
  const stallMs = options.stallMs ?? STALL_MS;
  const lobbies = new LobbyManager();
  const runs = new Map<string, Run>();
  const connectionsByIp = new Map<string, number>();
  let connections = 0;
  let lobbyListTimer: NodeJS.Timeout | null = null;

  /** Debounced: joining and leaving in a loop must not turn into a broadcast to every open browser each time. */
  function broadcastLobbyList(): void {
    if (lobbyListTimer) return;
    lobbyListTimer = setTimeout(() => {
      lobbyListTimer = null;
      io.to('lobby-browser').emit('lobbies:updated', lobbies.listLobbies());
    }, LOBBY_LIST_DELAY_MS);
  }

  function transferBossHost(lobbyId: string, run: Run, formerHostId: string): void {
    if (run.boss?.hostId !== formerHostId) return;
    const lobby = lobbies.getLobby(lobbyId);
    const newHost = lobby && [...lobby.players.keys()].find((id) => id !== formerHostId && !run.deaths.has(id));
    if (!newHost) return;
    run.boss.hostId = newHost;
    io.to(lobbyId).emit('game:boss-host-transfer', { newHostId: newHost });
  }

  function finishIfAllDead(lobbyId: string, run: Run): void {
    const lobby = lobbies.getLobby(lobbyId);
    if (lobby?.status !== 'ingame') return;
    if (![...lobby.players.keys()].every((id) => run.deaths.has(id))) return;

    const rankings = [...lobby.players.values()].map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      score: run.deaths.get(player.id)?.score ?? 0,
      stats: run.deaths.get(player.id)?.stats ?? {},
    })).sort((a, b) => b.score - a.score);

    lobbies.endGame(lobbyId);
    runs.delete(lobbyId);
    io.to(lobbyId).emit('game:over', { rankings, hostId: lobby.hostId });
    broadcastLobbyList();
  }

  function recordDeath(lobbyId: string, run: Run, id: string, death: DeathRecord): void {
    run.deaths.set(id, death);
    io.to(lobbyId).except(id).emit('game:death', { id, ...death });
    transferBossHost(lobbyId, run, id);
    finishIfAllDead(lobbyId, run);
  }

  /** The one way out of a lobby, whether the player left or the connection dropped. */
  function removePlayer(socket: Socket): void {
    const lobbyId = lobbies.getPlayerLobbyId(socket.id);
    const run = lobbyId ? runs.get(lobbyId) : undefined;
    const result = lobbies.leaveLobby(socket.id);
    if (!result) return;

    socket.leave(result.lobbyId);
    const lobby = lobbies.getLobby(result.lobbyId);
    if (result.disbanded || !lobby) {
      runs.delete(result.lobbyId);
    } else {
      io.to(result.lobbyId).emit('lobby:updated', serializeLobby(lobbies, lobby));
      if (run) {
        io.to(result.lobbyId).emit('game:player-left', { id: socket.id });
        run.deaths.delete(socket.id);
        run.lastSeen.delete(socket.id);
        run.lastScore.delete(socket.id);
        transferBossHost(result.lobbyId, run, socket.id);
        finishIfAllDead(result.lobbyId, run);
      }
    }
    broadcastLobbyList();
  }

  // A client that stops talking without disconnecting (a backgrounded phone) would hold its lobby in-game forever
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [lobbyId, run] of runs) {
      for (const [id, seen] of [...run.lastSeen]) {
        if (run.deaths.has(id) || now - seen < stallMs) continue;
        recordDeath(lobbyId, run, id, { score: run.lastScore.get(id) ?? 0, stats: { obstacleType: 'fall' } });
      }
    }
  }, options.sweepMs ?? SWEEP_MS);
  sweep.unref();

  io.use((socket, next) => {
    const ip = clientIp(socket.handshake.address, socket.handshake.headers);
    const fromIp = connectionsByIp.get(ip) ?? 0;
    if (connections >= MAX_CONNECTIONS || fromIp >= MAX_CONNECTIONS_PER_IP) {
      next(new Error('Too many connections'));
      return;
    }
    connections++;
    connectionsByIp.set(ip, fromIp + 1);
    socket.data.ip = ip;
    next();
  });

  io.on('connection', (socket: Socket) => {
    let playerName = '';
    const gameEvents = new TokenBucket(60, 120);
    const lobbyEvents = new TokenBucket(10, 20);
    const bossHits = new TokenBucket(6, 8);

    socket.use(([event], next) => {
      const bucket = String(event).startsWith('game:') ? gameEvents : lobbyEvents;
      if (bucket.take()) next();
    });

    /** Registers a handler that can't take the server down. */
    const on = (event: string, handler: (...args: unknown[]) => void): void => {
      socket.on(event, (...args: unknown[]) => {
        try {
          handler(...args);
        } catch (error) {
          console.error(`Socket handler ${event} failed:`, error);
        }
      });
    };

    /** The lobby and run of a living player, or null if this socket isn't in a game. */
    const activeGame = (): { lobbyId: string; run: Run } | null => {
      const lobbyId = lobbies.getPlayerLobbyId(socket.id);
      const run = lobbyId ? runs.get(lobbyId) : undefined;
      if (!lobbyId || !run || run.deaths.has(socket.id)) return null;
      run.lastSeen.set(socket.id, Date.now());
      return { lobbyId, run };
    };

    const relay = (event: string, parse: (data: Record<string, unknown>) => object | null): void => {
      on(event, (data) => {
        const game = activeGame();
        const payload = game && parse(asRecord(data));
        if (game && payload) socket.to(game.lobbyId).emit(event, { id: socket.id, ...payload });
      });
    };

    const relayX = (data: Record<string, unknown>) => ({ x: parseCoord(data.x) });

    on('set-name', (name) => {
      const cleaned = cleanName(name)?.slice(0, MAX_NAME_LENGTH);
      if (cleaned) playerName = cleaned;
    });

    on('lobby:browse', () => {
      socket.join('lobby-browser');
      socket.emit('lobbies:updated', lobbies.listLobbies());
    });

    on('lobby:browse-stop', () => {
      socket.leave('lobby-browser');
    });

    on('lobby:create', (callback) => {
      const ack = ackOf(callback);
      if (!playerName) {
        ack({ error: 'Name not set' });
        return;
      }

      const lobby = lobbies.createLobby(socket.id, playerName);
      if (!lobby) {
        ack({ error: 'Cannot create lobby' });
        return;
      }

      socket.join(lobby.id);
      socket.leave('lobby-browser');
      ack({ lobby: serializeLobby(lobbies, lobby) });
      broadcastLobbyList();

      // Local testing: with DEBUG_BOT=1, a player named "debug" gets a bot in their lobby.
      if (process.env.DEBUG_BOT === '1' && process.env.NODE_ENV !== 'production' && playerName === 'debug') {
        const lobbyId = lobby.id;
        void import('./debug-bot').then(({ spawnBotForLobby }) => {
          setTimeout(() => spawnBotForLobby(lobbyId), 500);
        });
      }
    });

    on('lobby:join', (id, callback) => {
      const ack = ackOf(callback);
      if (!playerName) {
        ack({ error: 'Name not set' });
        return;
      }

      const lobbyId = parseLobbyId(id);
      const lobby = lobbyId && lobbies.joinLobby(lobbyId, socket.id, playerName);
      if (!lobby) {
        ack({ error: 'Cannot join lobby' });
        return;
      }

      socket.join(lobby.id);
      socket.leave('lobby-browser');
      const lobbyData = serializeLobby(lobbies, lobby);
      ack({ lobby: lobbyData });
      socket.to(lobby.id).emit('lobby:updated', lobbyData);
      broadcastLobbyList();
    });

    on('lobby:leave', () => removePlayer(socket));

    on('lobby:color', (colorIndex, callback) => {
      const ack = ackOf(callback);
      const lobby = typeof colorIndex === 'number' ? lobbies.changeColor(socket.id, colorIndex) : null;
      if (!lobby) {
        ack({ error: 'Color unavailable' });
        return;
      }

      const lobbyData = serializeLobby(lobbies, lobby);
      ack({ lobby: lobbyData });
      socket.to(lobby.id).emit('lobby:updated', lobbyData);
    });

    on('lobby:ready', (ready, callback) => {
      const ack = ackOf(callback);
      const lobby = typeof ready === 'boolean' ? lobbies.setReady(socket.id, ready) : null;
      if (!lobby) {
        ack({ error: 'Cannot set ready' });
        return;
      }

      const lobbyData = serializeLobby(lobbies, lobby);
      ack({ lobby: lobbyData });
      socket.to(lobby.id).emit('lobby:updated', lobbyData);
    });

    on('lobby:start', (callback) => {
      const ack = ackOf(callback);
      const lobby = lobbies.startGame(socket.id);
      if (!lobby) {
        ack({ error: 'Cannot start game' });
        return;
      }

      const now = Date.now();
      runs.set(lobby.id, {
        deaths: new Map(),
        lastSeen: new Map([...lobby.players.keys()].map((id) => [id, now])),
        lastScore: new Map(),
        boss: null,
        bossDefeated: false,
      });

      const players = lobbies.serializePlayers(lobby);
      ack({ ok: true, seed: lobby.seed, players });
      socket.to(lobby.id).emit('game:start', { seed: lobby.seed, players });
      broadcastLobbyList();
    });

    on('lobby:restart', (callback) => {
      const ack = ackOf(callback);
      const lobby = lobbies.restartLobby(socket.id);
      if (!lobby) {
        ack({ error: 'Cannot restart lobby' });
        return;
      }

      ack({ ok: true });
      io.to(lobby.id).emit('lobby:updated', serializeLobby(lobbies, lobby));
      broadcastLobbyList();
    });

    relay('game:dash-start', relayX);
    relay('game:dash-end', relayX);
    relay('game:pill-start', relayX);
    relay('game:pill-end', relayX);

    relay('game:swap', (data) => {
      const lane = parseLane(data.lane);
      return lane && { lane, x: parseCoord(data.x) };
    });

    relay('game:position', (data) => {
      const lane = parseLane(data.lane);
      const x = parseCoord(data.x);
      return lane && x !== undefined ? { x, lane, t: parseCoord(data.t) } : null;
    });

    on('game:pickup', (data) => {
      const game = activeGame();
      const { x, score, combo } = asRecord(data);
      const validX = parseCoord(x);
      const validScore = parseScore(score);
      if (!game || validX === undefined || validScore === null) return;
      game.run.lastScore.set(socket.id, validScore);
      socket.to(game.lobbyId).emit('game:pickup', {
        id: socket.id, x: validX, score: validScore, combo: parseScore(combo) ?? undefined,
      });
    });

    on('game:boss-start', (data) => {
      const game = activeGame();
      const triggerX = parseCoord(asRecord(data).triggerX);
      if (!game || triggerX === undefined || game.run.boss || game.run.bossDefeated) return;

      const lobby = lobbies.getLobby(game.lobbyId);
      if (!lobby) return;

      const alive = [...lobby.players.keys()].filter((id) => !game.run.deaths.has(id)).length;
      const hp = BOSS_HP_PER_PLAYER * alive;
      game.run.boss = { hp, hostId: socket.id };
      io.to(game.lobbyId).emit('game:boss-start', { triggerX, hp, hostId: socket.id });
    });

    on('game:boss-projectile', (data) => {
      const game = activeGame();
      const projectile = parseBossProjectile(data);
      if (game?.run.boss?.hostId === socket.id && projectile) {
        socket.to(game.lobbyId).emit('game:boss-projectile', projectile);
      }
    });

    on('game:boss-rage', () => {
      const game = activeGame();
      if (game?.run.boss?.hostId === socket.id) socket.to(game.lobbyId).emit('game:boss-rage');
    });

    on('game:boss-shoot', () => {
      const game = activeGame();
      if (game?.run.boss) socket.to(game.lobbyId).emit('game:boss-shoot', { id: socket.id });
    });

    on('game:boss-hit', () => {
      const game = activeGame();
      const boss = game?.run.boss;
      if (!game || !boss || !bossHits.take()) return;

      boss.hp--;
      io.to(game.lobbyId).emit('game:boss-hit', { id: socket.id, hp: boss.hp });

      if (boss.hp <= 0) {
        io.to(game.lobbyId).emit('game:boss-end', { result: 'victory', bonus: BOSS_BONUS });
        game.run.boss = null;
        game.run.bossDefeated = true;
      }
    });

    on('game:death', (data) => {
      const game = activeGame();
      const { score, stats } = asRecord(data);
      if (game) recordDeath(game.lobbyId, game.run, socket.id, { score: parseScore(score) ?? 0, stats: parseRunStats(stats) });
    });

    on('disconnect', () => {
      removePlayer(socket);

      connections--;
      const ip = socket.data.ip as string;
      const remaining = (connectionsByIp.get(ip) ?? 1) - 1;
      if (remaining > 0) connectionsByIp.set(ip, remaining);
      else connectionsByIp.delete(ip);
    });
  });

  return () => {
    clearInterval(sweep);
    if (lobbyListTimer) clearTimeout(lobbyListTimer);
  };
}
