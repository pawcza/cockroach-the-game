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

  io.on('connection', (socket: Socket) => {
    let playerName = '';

    socket.on('set-name', (name: string) => {
      playerName = name.trim().slice(0, 20);
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
      callback({
        lobby: {
          id: lobby.id,
          players: lobbies.serializePlayers(lobby),
          status: lobby.status,
        },
      });
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
      const lobbyData = serializeLobby(lobbies, lobbyId);
      callback({ lobby: lobbyData });
      // Notify others in the lobby
      socket.to(lobbyId).emit('lobby:updated', lobbyData);
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

    socket.on('lobby:start', (callback: Function) => {
      const lobby = lobbies.startGame(socket.id);
      if (!lobby) {
        callback({ error: 'Cannot start game' });
        return;
      }

      const players = lobbies.serializePlayers(lobby);
      callback({ ok: true, seed: lobby.seed, players });
      socket.to(lobby.id).emit('game:start', {
        seed: lobby.seed,
        players,
      });
    });

    // Game event relay — each event has its own handler to normalize data shapes
    socket.on('game:swap', (lane: string) => {
      const lobbyId = lobbies.getPlayerLobbyId(socket.id);
      if (!lobbyId) return;
      socket.to(lobbyId).emit('game:swap', { id: socket.id, lane });
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

    socket.on('game:death', (data: { score: number; stats: Record<string, unknown> }) => {
      const lobbyId = lobbies.getPlayerLobbyId(socket.id);
      if (!lobbyId) return;
      socket.to(lobbyId).emit('game:death', { id: socket.id, score: data.score, stats: data.stats });
    });

    socket.on('game:all-dead', (data: any) => {
      const lobbyId = lobbies.getPlayerLobbyId(socket.id);
      if (!lobbyId) return;

      const lobby = lobbies.endGame(lobbyId);
      if (!lobby) return; // Already ended (another client beat us)

      io.to(lobbyId).emit('game:over', data);
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
    });

    socket.on('disconnect', () => {
      const result = lobbies.leaveLobby(socket.id);
      if (!result || result.disbanded) return;

      const lobbyData = serializeLobby(lobbies, result.lobbyId);
      if (lobbyData) {
        io.to(result.lobbyId).emit('lobby:updated', lobbyData);
        // Also emit player-left during game so ghosts can be cleaned up
        if (lobbyData.status === 'ingame') {
          io.to(result.lobbyId).emit('game:player-left', { id: socket.id });
        }
      }
    });
  });
}
