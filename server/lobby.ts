/**
 * A multiplayer run starts this long after the server's start reaches each client: the crossfade, the countdown and a
 * margin for a slow machine to build the scene. Every client counts down to the same moment, so their run clocks agree
 * and the obstacles that move on that clock stand in the same place on every screen.
 */
export const MP_START_LEAD_MS = 3500;

/** Where a player is: the lobby screen, a run, watching a run they joined too late for, or the last run's results. */
export type PlayerPlace = 'lobby' | 'game' | 'watching' | 'results';

export interface LobbyPlayer {
  id: string;
  name: string;
  color: number;
  isHost: boolean;
  ready: boolean;
  place: PlayerPlace;
  /** What their roach wears, from their account; null for a guest or the plain roach. */
  look: { skin: string | null; head: string | null; back: string | null } | null;
}

/** Between runs a lobby is simply waiting: players ready up and the host starts from the lobby or the results. */
export type LobbyStatus = 'waiting' | 'ingame';

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

const MAX_LOBBIES = 200;

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

  createLobby(hostId: string, hostName: string, look: LobbyPlayer['look'] = null): Lobby | null {
    if (this.playerLobbyMap.has(hostId) || this.lobbies.size >= MAX_LOBBIES) return null;

    let id = generateLobbyId();
    while (this.lobbies.has(id)) {
      id = generateLobbyId();
    }

    const host: LobbyPlayer = {
      id: hostId,
      name: hostName,
      color: 0,
      isHost: true,
      ready: false,
      place: 'lobby',
      look,
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

  joinLobby(lobbyId: string, playerId: string, playerName: string, look: LobbyPlayer['look'] = null): Lobby | null {
    if (this.playerLobbyMap.has(playerId)) return null;

    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return null;
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
      ready: false,
      // Too late for a run in progress: they watch it, and play the next one
      place: lobby.status === 'ingame' ? 'watching' : 'lobby',
      look,
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

    if (!Number.isInteger(colorIndex) || colorIndex < 0 || colorIndex >= PLAYER_COLORS.length) return null;

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

  setReady(playerId: string, ready: boolean): Lobby | null {
    const lobbyId = this.playerLobbyMap.get(playerId);
    if (!lobbyId) return null;

    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.status !== 'waiting') return null;

    const player = lobby.players.get(playerId);
    if (!player) return null;

    player.ready = ready;
    return lobby;
  }

  allReady(lobby: Lobby): boolean {
    for (const player of lobby.players.values()) {
      if (player.isHost) continue; // host doesn't need to ready up
      if (!player.ready) return false;
    }
    return true;
  }

  startGame(hostId: string): Lobby | null {
    const lobbyId = this.playerLobbyMap.get(hostId);
    if (!lobbyId) return null;

    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return null;
    if (lobby.hostId !== hostId || lobby.status !== 'waiting') return null;
    if (lobby.players.size < 2) return null;
    if (!this.allReady(lobby)) return null;

    lobby.seed = Date.now();
    lobby.status = 'ingame';
    // Everyone is pulled in, from the lobby or the results; the next run needs a fresh ready
    for (const player of lobby.players.values()) {
      player.place = 'game';
      player.ready = false;
    }
    return lobby;
  }

  /** The run is over: everyone is on the results, and the lobby is open for the next one straight away. */
  endGame(lobbyId: string): Lobby | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return null;

    lobby.status = 'waiting';
    lobby.seed = null;
    for (const player of lobby.players.values()) {
      player.place = 'results';
      player.ready = false;
    }
    return lobby;
  }

  /** A player moving between the lobby screen and the results, between runs. */
  setPlace(playerId: string, place: PlayerPlace): Lobby | null {
    const lobbyId = this.playerLobbyMap.get(playerId);
    const lobby = lobbyId ? this.lobbies.get(lobbyId) : undefined;
    const player = lobby?.players.get(playerId);
    if (!lobby || !player || lobby.status !== 'waiting' || place === 'game') return null;

    player.place = place;
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
