import { Server, Socket } from 'socket.io';
import { LobbyManager } from './lobby';

function serializeLobby(lobbies: LobbyManager, lobbyId: string) {
  const lobby = lobbies.getLobby(lobbyId);
  if (!lobby) return null;
  return {
    id: lobby.id,
    players: lobbies.serializePlayers(lobby),
    status: lobby.status,
  };
}

export function setupMultiplayer(io: Server): void {
  const lobbies = new LobbyManager();
  // Track death data server-side per lobby
  const lobbyDeathData = new Map<string, Map<string, { score: number; stats: Record<string, unknown> }>>();

  interface LobbyBossState {
    active: boolean;
    hp: number;
    maxHp: number;
    hostId: string;
  }
  const lobbyBossState = new Map<string, LobbyBossState>();

  /** Broadcast the current lobby list to everyone in the lobby-browser room. */
  function broadcastLobbyList(): void {
    io.to('lobby-browser').emit('lobbies:updated', lobbies.listLobbies());
  }

  io.on('connection', (socket: Socket) => {
    let playerName = '';

    socket.on('set-name', (name: string) => {
      playerName = name.trim().slice(0, 20);
    });

    // Join/leave the lobby browser room for real-time list updates
    socket.on('lobby:browse', () => {
      socket.join('lobby-browser');
      // Send current list immediately
      socket.emit('lobbies:updated', lobbies.listLobbies());
    });

    socket.on('lobby:browse-stop', () => {
      socket.leave('lobby-browser');
    });

    socket.on('lobby:list', (callback: Function) => {
      callback(lobbies.listLobbies());
    });

    socket.on('lobby:create', (callback: Function) => {
      if (!playerName) {
        callback({ error: 'Name not set' });
        return;
      }

      const lobby = lobbies.createLobby(socket.id, playerName);
      socket.join(lobby.id);
      socket.leave('lobby-browser');
      callback({
        lobby: {
          id: lobby.id,
          players: lobbies.serializePlayers(lobby),
          status: lobby.status,
        },
      });
      broadcastLobbyList();
    });

    socket.on('lobby:join', (lobbyId: string, callback: Function) => {
      if (!playerName) {
        callback({ error: 'Name not set' });
        return;
      }

      const lobby = lobbies.joinLobby(lobbyId, socket.id, playerName);
      if (!lobby) {
        callback({ error: 'Cannot join lobby' });
        return;
      }

      socket.join(lobbyId);
      socket.leave('lobby-browser');
      const lobbyData = serializeLobby(lobbies, lobbyId);
      callback({ lobby: lobbyData });
      // Notify others in the lobby
      socket.to(lobbyId).emit('lobby:updated', lobbyData);
      broadcastLobbyList();
    });

    socket.on('lobby:leave', () => {
      const result = lobbies.leaveLobby(socket.id);
      if (!result) return;

      socket.leave(result.lobbyId);
      if (!result.disbanded) {
        const lobbyData = serializeLobby(lobbies, result.lobbyId);
        if (lobbyData) {
          socket.to(result.lobbyId).emit('lobby:updated', lobbyData);
        }
      }
      broadcastLobbyList();
    });

    socket.on('lobby:color', (colorIndex: number, callback: Function) => {
      const lobby = lobbies.changeColor(socket.id, colorIndex);
      if (!lobby) {
        callback({ error: 'Color unavailable' });
        return;
      }

      const lobbyData = serializeLobby(lobbies, lobby.id);
      callback({ lobby: lobbyData });
      socket.to(lobby.id).emit('lobby:updated', lobbyData);
    });

    socket.on('lobby:ready', (ready: boolean, callback: Function) => {
      const lobby = lobbies.setReady(socket.id, ready);
      if (!lobby) {
        callback({ error: 'Cannot set ready' });
        return;
      }

      const lobbyData = serializeLobby(lobbies, lobby.id);
      callback({ lobby: lobbyData });
      socket.to(lobby.id).emit('lobby:updated', lobbyData);
    });

    socket.on('lobby:start', (callback: Function) => {
      const lobby = lobbies.startGame(socket.id);
      if (!lobby) {
        callback({ error: 'Cannot start game' });
        return;
      }

      const players = lobbies.serializePlayers(lobby);
      // Clear any stale death data for this lobby
      lobbyDeathData.set(lobby.id, new Map());
      callback({ ok: true, seed: lobby.seed, players });
      socket.to(lobby.id).emit('game:start', {
        seed: lobby.seed,
        players,
      });
      broadcastLobbyList();
    });

    // Game event relay — each event has its own handler to normalize data shapes
    socket.on('game:swap', (data: { lane: string; x?: number }) => {
      const lobbyId = lobbies.getPlayerLobbyId(socket.id);
      if (!lobbyId) return;
      socket.to(lobbyId).emit('game:swap', { id: socket.id, lane: data.lane, x: data.x });
    });

    socket.on('game:dash-start', () => {
      const lobbyId = lobbies.getPlayerLobbyId(socket.id);
      if (!lobbyId) return;
      socket.to(lobbyId).emit('game:dash-start', { id: socket.id });
    });

    socket.on('game:dash-end', () => {
      const lobbyId = lobbies.getPlayerLobbyId(socket.id);
      if (!lobbyId) return;
      socket.to(lobbyId).emit('game:dash-end', { id: socket.id });
    });

    socket.on('game:pill-start', () => {
      const lobbyId = lobbies.getPlayerLobbyId(socket.id);
      if (!lobbyId) return;
      socket.to(lobbyId).emit('game:pill-start', { id: socket.id });
    });

    socket.on('game:pill-end', () => {
      const lobbyId = lobbies.getPlayerLobbyId(socket.id);
      if (!lobbyId) return;
      socket.to(lobbyId).emit('game:pill-end', { id: socket.id });
    });

    socket.on('game:position', (data: { x: number; lane: string }) => {
      const lobbyId = lobbies.getPlayerLobbyId(socket.id);
      if (!lobbyId) return;
      socket.to(lobbyId).emit('game:position', { id: socket.id, x: data.x, lane: data.lane });
    });

    socket.on('game:pickup', (data: { x: number; score: number }) => {
      const lobbyId = lobbies.getPlayerLobbyId(socket.id);
      if (!lobbyId) return;
      socket.to(lobbyId).emit('game:pickup', { id: socket.id, x: data.x, score: data.score });
    });

    socket.on('game:boss-start', (data: { triggerX: number; hp: number }) => {
      const lobbyId = lobbies.getPlayerLobbyId(socket.id);
      if (!lobbyId) return;
      if (lobbyBossState.has(lobbyId)) return;

      const lobby = lobbies.getLobby(lobbyId);
      if (!lobby) return;

      const deathData = lobbyDeathData.get(lobbyId);
      const aliveCount = [...lobby.players.keys()].filter(pid => !deathData?.has(pid)).length;
      const scaledHp = data.hp * aliveCount;

      lobbyBossState.set(lobbyId, {
        active: true,
        hp: scaledHp,
        maxHp: scaledHp,
        hostId: socket.id,
      });

      io.to(lobbyId).emit('game:boss-start', { triggerX: data.triggerX, hp: scaledHp, hostId: socket.id });
    });

    socket.on('game:boss-projectile', (data: any) => {
      const lobbyId = lobbies.getPlayerLobbyId(socket.id);
      if (!lobbyId) return;
      const bossState = lobbyBossState.get(lobbyId);
      if (!bossState?.active || bossState.hostId !== socket.id) return;
      socket.to(lobbyId).emit('game:boss-projectile', data);
    });

    socket.on('game:boss-shoot', () => {
      const lobbyId = lobbies.getPlayerLobbyId(socket.id);
      if (!lobbyId) return;
      socket.to(lobbyId).emit('game:boss-shoot', { id: socket.id });
    });

    socket.on('game:boss-rage', () => {
      const lobbyId = lobbies.getPlayerLobbyId(socket.id);
      if (!lobbyId) return;
      const bossState = lobbyBossState.get(lobbyId);
      if (!bossState?.active || bossState.hostId !== socket.id) return;
      socket.to(lobbyId).emit('game:boss-rage');
    });

    socket.on('game:boss-hit', () => {
      const lobbyId = lobbies.getPlayerLobbyId(socket.id);
      if (!lobbyId) return;
      const bossState = lobbyBossState.get(lobbyId);
      if (!bossState?.active) return;

      bossState.hp--;
      io.to(lobbyId).emit('game:boss-hit', { id: socket.id, hp: bossState.hp });

      if (bossState.hp <= 0) {
        io.to(lobbyId).emit('game:boss-end', { result: 'victory', bonus: 500 });
        lobbyBossState.delete(lobbyId);
      }
    });

    socket.on('game:death', (data: { score: number; stats: Record<string, unknown> }) => {
      const lobbyId = lobbies.getPlayerLobbyId(socket.id);
      if (!lobbyId) return;

      // Record score server-side
      let deathData = lobbyDeathData.get(lobbyId);
      if (!deathData) {
        deathData = new Map();
        lobbyDeathData.set(lobbyId, deathData);
      }
      deathData.set(socket.id, { score: data.score, stats: data.stats });

      // Relay to others
      socket.to(lobbyId).emit('game:death', { id: socket.id, score: data.score, stats: data.stats });

      const bossState = lobbyBossState.get(lobbyId);
      if (bossState?.active && bossState.hostId === socket.id) {
        const deathData2 = lobbyDeathData.get(lobbyId);
        const lobby2 = lobbies.getLobby(lobbyId);
        if (lobby2) {
          const newHost = [...lobby2.players.keys()].find(pid => !deathData2?.has(pid));
          if (newHost) {
            bossState.hostId = newHost;
            io.to(lobbyId).emit('game:boss-host-transfer', { newHostId: newHost });
          }
        }
      }

      // Check if all players in lobby are dead
      const lobby = lobbies.getLobby(lobbyId);
      if (lobby && lobby.status === 'ingame') {
        const allDead = [...lobby.players.keys()].every(pid => deathData!.has(pid));
        if (allDead) {
          // Build rankings from server-recorded data
          const rankings = [...lobby.players.values()].map(p => ({
            id: p.id,
            name: p.name,
            color: p.color,
            score: deathData!.get(p.id)?.score ?? 0,
            stats: deathData!.get(p.id)?.stats ?? {},
          })).sort((a, b) => b.score - a.score);

          lobbies.endGame(lobbyId);
          io.to(lobbyId).emit('game:over', { rankings, hostId: lobby.hostId });
          lobbyBossState.delete(lobbyId);
          lobbyDeathData.delete(lobbyId);
          broadcastLobbyList();
        }
      }
    });

    // game:all-dead is now a no-op — server detects all-dead from game:death events
    socket.on('game:all-dead', () => {
      // Ignored: server handles all-dead detection automatically
    });

    socket.on('lobby:restart', (callback: Function) => {
      const lobby = lobbies.restartLobby(socket.id);
      if (!lobby) {
        callback({ error: 'Cannot restart lobby' });
        return;
      }

      const lobbyData = serializeLobby(lobbies, lobby.id);
      callback({ ok: true });
      io.to(lobby.id).emit('lobby:updated', lobbyData);
      broadcastLobbyList();
    });

    socket.on('disconnect', () => {
      // Before leaving lobby, check if this disconnect triggers all-dead
      const lobbyId = lobbies.getPlayerLobbyId(socket.id);
      const lobbyBeforeLeave = lobbyId ? lobbies.getLobby(lobbyId) : null;
      const wasIngame = lobbyBeforeLeave?.status === 'ingame';

      const result = lobbies.leaveLobby(socket.id);
      if (!result || result.disbanded) {
        // Clean up death data for disbanded lobbies
        if (result?.disbanded && lobbyId) {
          lobbyDeathData.delete(lobbyId);
        }
        broadcastLobbyList();
        return;
      }

      const lobbyData = serializeLobby(lobbies, result.lobbyId);
      if (lobbyData) {
        io.to(result.lobbyId).emit('lobby:updated', lobbyData);
        // Also emit player-left during game so ghosts can be cleaned up
        if (wasIngame) {
          io.to(result.lobbyId).emit('game:player-left', { id: socket.id });

          const bossState = lobbyBossState.get(result.lobbyId);
          if (bossState?.active && bossState.hostId === socket.id) {
            const deathData2 = lobbyDeathData.get(result.lobbyId);
            const lobby2 = lobbies.getLobby(result.lobbyId);
            if (lobby2) {
              const newHost = [...lobby2.players.keys()].find(pid => !deathData2?.has(pid));
              if (newHost) {
                bossState.hostId = newHost;
                io.to(result.lobbyId).emit('game:boss-host-transfer', { newHostId: newHost });
              }
            }
          }

          // Remove disconnected player from death data and check if all remaining are dead
          const deathData = lobbyDeathData.get(result.lobbyId);
          if (deathData) {
            deathData.delete(socket.id);
            const lobby = lobbies.getLobby(result.lobbyId);
            if (lobby && lobby.status === 'ingame') {
              const allDead = [...lobby.players.keys()].every(pid => deathData.has(pid));
              if (allDead) {
                const rankings = [...lobby.players.values()].map(p => ({
                  id: p.id,
                  name: p.name,
                  color: p.color,
                  score: deathData.get(p.id)?.score ?? 0,
                  stats: deathData.get(p.id)?.stats ?? {},
                })).sort((a, b) => b.score - a.score);

                lobbies.endGame(result.lobbyId);
                io.to(result.lobbyId).emit('game:over', { rankings, hostId: lobby.hostId });
                lobbyBossState.delete(result.lobbyId);
                lobbyDeathData.delete(result.lobbyId);
              }
            }
          }
        }
      }
      broadcastLobbyList();
    });
  });
}
