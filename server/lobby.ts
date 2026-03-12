export interface LobbyPlayer {
  id: string;
  name: string;
  color: number;
  isHost: boolean;
}

export type LobbyStatus = 'waiting' | 'ingame' | 'postgame';

export interface Lobby {
  id: string;
  hostId: string;
  players: Map<string, LobbyPlayer>;
  status: LobbyStatus;
  seed: number | null;
  maxPlayers: number;
}

export const PLAYER_COLORS: number[] = [
  0xff0000, // red
  0x0000ff, // blue
  0x00cc00, // green
  0xffff00, // yellow
  0xff8800, // orange
  0x8800ff, // purple
  0x00cccc, // cyan
  0xff00ff, // magenta
  0xff4488, // pink
  0x88cc00, // lime
  0x0088ff, // sky blue
  0xcc4400, // brown
  0x8888ff, // lavender
  0x00ff88, // mint
  0xffcc00, // gold
  0xcccccc, // silver
];

function generateLobbyId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export class LobbyManager {
  private lobbies = new Map<string, Lobby>();
  private playerLobbyMap = new Map<string, string>();

  createLobby(hostId: string, hostName: string): Lobby {
    let id = generateLobbyId();
    while (this.lobbies.has(id)) {
      id = generateLobbyId();
    }

    const host: LobbyPlayer = {
      id: hostId,
      name: hostName,
      color: 0,
      isHost: true,
    };

    const lobby: Lobby = {
      id,
      hostId,
      players: new Map([[hostId, host]]),
      status: 'waiting',
      seed: null,
      maxPlayers: 16,
    };

    this.lobbies.set(id, lobby);
    this.playerLobbyMap.set(hostId, id);
    return lobby;
  }

  joinLobby(lobbyId: string, playerId: string, playerName: string): Lobby | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return null;
    if (lobby.status === 'ingame') return null;
    if (lobby.players.size >= lobby.maxPlayers) return null;

    const usedColors = new Set([...lobby.players.values()].map((p) => p.color));
    let colorIndex = 0;
    while (usedColors.has(colorIndex) && colorIndex < PLAYER_COLORS.length) {
      colorIndex++;
    }

    const player: LobbyPlayer = {
      id: playerId,
      name: playerName,
      color: colorIndex,
      isHost: false,
    };

    lobby.players.set(playerId, player);
    this.playerLobbyMap.set(playerId, lobbyId);
    return lobby;
  }

  leaveLobby(playerId: string): { lobbyId: string; disbanded: boolean } | null {
    const lobbyId = this.playerLobbyMap.get(playerId);
    if (!lobbyId) return null;

    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return null;

    lobby.players.delete(playerId);
    this.playerLobbyMap.delete(playerId);

    if (lobby.players.size === 0) {
      this.lobbies.delete(lobbyId);
      return { lobbyId, disbanded: true };
    }

    // Transfer host if the leaving player was the host
    if (lobby.hostId === playerId) {
      const newHost = lobby.players.values().next().value!;
      newHost.isHost = true;
      lobby.hostId = newHost.id;
    }

    return { lobbyId, disbanded: false };
  }

  changeColor(playerId: string, colorIndex: number): Lobby | null {
    const lobbyId = this.playerLobbyMap.get(playerId);
    if (!lobbyId) return null;

    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return null;

    if (colorIndex < 0 || colorIndex >= PLAYER_COLORS.length) return null;

    // Check if color is taken by another player
    for (const [id, player] of lobby.players) {
      if (id !== playerId && player.color === colorIndex) {
        return null;
      }
    }

    const player = lobby.players.get(playerId);
    if (!player) return null;

    player.color = colorIndex;
    return lobby;
  }

  startGame(hostId: string): Lobby | null {
    const lobbyId = this.playerLobbyMap.get(hostId);
    if (!lobbyId) return null;

    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return null;
    if (lobby.hostId !== hostId) return null;
    if (lobby.players.size < 2) return null;

    lobby.seed = Date.now();
    lobby.status = 'ingame';
    return lobby;
  }

  endGame(lobbyId: string): Lobby | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return null;

    lobby.status = 'postgame';
    return lobby;
  }

  restartLobby(hostId: string): Lobby | null {
    const lobbyId = this.playerLobbyMap.get(hostId);
    if (!lobbyId) return null;

    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return null;
    if (lobby.hostId !== hostId) return null;

    lobby.status = 'waiting';
    lobby.seed = null;
    return lobby;
  }

  getLobby(lobbyId: string): Lobby | null {
    return this.lobbies.get(lobbyId) ?? null;
  }

  getPlayerLobbyId(playerId: string): string | null {
    return this.playerLobbyMap.get(playerId) ?? null;
  }

  listLobbies(): Array<{ id: string; host: string; playerCount: number; status: LobbyStatus }> {
    const result: Array<{ id: string; host: string; playerCount: number; status: LobbyStatus }> = [];
    for (const lobby of this.lobbies.values()) {
      const host = lobby.players.get(lobby.hostId);
      result.push({
        id: lobby.id,
        host: host?.name ?? 'Unknown',
        playerCount: lobby.players.size,
        status: lobby.status,
      });
    }
    return result;
  }

  serializePlayers(lobby: Lobby): LobbyPlayer[] {
    return [...lobby.players.values()];
  }
}
