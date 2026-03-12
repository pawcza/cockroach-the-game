import { Server, Socket } from 'socket.io';
import { LobbyManager } from './lobby';

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
        lobbyId: lobby.id,
        players: lobbies.serializePlayers(lobby),
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
      const players = lobbies.serializePlayers(lobby);
      callback({ lobbyId: lobby.id, players });
      socket.to(lobbyId).emit('lobby:player-joined', players);
    });

    socket.on('lobby:leave', () => {
      const result = lobbies.leaveLobby(socket.id);
      if (!result) return;

      socket.leave(result.lobbyId);
      if (!result.disbanded) {
        const lobby = lobbies.getLobby(result.lobbyId);
        if (lobby) {
          socket.to(result.lobbyId).emit('lobby:player-left', lobbies.serializePlayers(lobby));
        }
      }
    });

    socket.on('lobby:color', (colorIndex: number, callback: Function) => {
      const lobby = lobbies.changeColor(socket.id, colorIndex);
      if (!lobby) {
        callback({ error: 'Color unavailable' });
        return;
      }

      const players = lobbies.serializePlayers(lobby);
      callback({ players });
      socket.to(lobby.id).emit('lobby:color-changed', players);
    });

    socket.on('lobby:start', (callback: Function) => {
      const lobby = lobbies.startGame(socket.id);
      if (!lobby) {
        callback({ error: 'Cannot start game' });
        return;
      }

      callback({ seed: lobby.seed });
      socket.to(lobby.id).emit('lobby:game-started', {
        seed: lobby.seed,
        players: lobbies.serializePlayers(lobby),
      });
    });

    // Game event relay
    const gameEvents = [
      'game:swap',
      'game:dash-start',
      'game:dash-end',
      'game:pill-start',
      'game:pill-end',
      'game:position',
      'game:death',
    ];

    for (const event of gameEvents) {
      socket.on(event, (data: any) => {
        const lobbyId = lobbies.getPlayerLobbyId(socket.id);
        if (!lobbyId) return;
        socket.to(lobbyId).emit(event, { playerId: socket.id, ...data });
      });
    }

    socket.on('game:all-dead', (data: any) => {
      const lobbyId = lobbies.getPlayerLobbyId(socket.id);
      if (!lobbyId) return;

      const lobby = lobbies.endGame(lobbyId);
      if (!lobby) return;

      io.to(lobbyId).emit('game:over', data);
    });

    socket.on('lobby:restart', (callback: Function) => {
      const lobby = lobbies.restartLobby(socket.id);
      if (!lobby) {
        callback({ error: 'Cannot restart lobby' });
        return;
      }

      const players = lobbies.serializePlayers(lobby);
      callback({ players });
      socket.to(lobby.id).emit('lobby:restarted', { players });
    });

    socket.on('disconnect', () => {
      const result = lobbies.leaveLobby(socket.id);
      if (!result || result.disbanded) return;

      const lobby = lobbies.getLobby(result.lobbyId);
      if (lobby) {
        io.to(result.lobbyId).emit('lobby:player-left', lobbies.serializePlayers(lobby));
      }
    });
  });
}
