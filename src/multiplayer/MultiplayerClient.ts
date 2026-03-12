import { io, Socket } from 'socket.io-client';

export interface MPPlayer {
  id: string;
  name: string;
  color: number;
  isHost: boolean;
}

export interface MPLobbyData {
  id: string;
  players: MPPlayer[];
  status: string;
}

export interface MPLobbyListEntry {
  id: string;
  host: string;
  playerCount: number;
  status: string;
}

class MultiplayerClient {
  private socket: Socket | null = null;
  private _myId = '';

  get myId(): string { return this._myId; }
  get connected(): boolean { return this.socket?.connected ?? false; }

  connect(): void {
    if (this.socket) return;
    this.socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
    this.socket.on('connect', () => {
      this._myId = this.socket!.id!;
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  setName(name: string): void {
    this.socket?.emit('set-name', name);
  }

  listLobbies(): Promise<MPLobbyListEntry[]> {
    return new Promise((resolve) => {
      this.socket?.emit('lobby:list', (list: MPLobbyListEntry[]) => resolve(list));
    });
  }

  createLobby(): Promise<MPLobbyData> {
    return new Promise((resolve, reject) => {
      this.socket?.emit('lobby:create', (res: { lobby?: MPLobbyData; error?: string }) => {
        if (res.error) reject(new Error(res.error));
        else resolve(res.lobby!);
      });
    });
  }

  joinLobby(lobbyId: string): Promise<MPLobbyData> {
    return new Promise((resolve, reject) => {
      this.socket?.emit('lobby:join', lobbyId, (res: { lobby?: MPLobbyData; error?: string }) => {
        if (res.error) reject(new Error(res.error));
        else resolve(res.lobby!);
      });
    });
  }

  leaveLobby(): void {
    this.socket?.emit('lobby:leave');
  }

  changeColor(colorIndex: number): Promise<MPLobbyData> {
    return new Promise((resolve, reject) => {
      this.socket?.emit('lobby:color', colorIndex, (res: { lobby?: MPLobbyData; error?: string }) => {
        if (res.error) reject(new Error(res.error));
        else resolve(res.lobby!);
      });
    });
  }

  startGame(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket?.emit('lobby:start', (res: { ok?: boolean; error?: string }) => {
        if (res.error) reject(new Error(res.error));
        else resolve();
      });
    });
  }

  restartLobby(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket?.emit('lobby:restart', (res: { ok?: boolean; error?: string }) => {
        if (res.error) reject(new Error(res.error));
        else resolve();
      });
    });
  }

  // Game events — send
  sendSwap(lane: string): void { this.socket?.emit('game:swap', lane); }
  sendDashStart(): void { this.socket?.emit('game:dash-start'); }
  sendDashEnd(): void { this.socket?.emit('game:dash-end'); }
  sendPillStart(): void { this.socket?.emit('game:pill-start'); }
  sendPillEnd(): void { this.socket?.emit('game:pill-end'); }
  sendPosition(x: number, lane: string): void { this.socket?.emit('game:position', { x, lane }); }
  sendDeath(score: number, stats: Record<string, unknown>): void { this.socket?.emit('game:death', { score, stats }); }
  sendAllDead(rankings: Array<Record<string, unknown>>): void { this.socket?.emit('game:all-dead', rankings); }

  // Event listeners
  on(event: string, handler: (...args: any[]) => void): void {
    this.socket?.on(event, handler);
  }

  off(event: string, handler?: (...args: any[]) => void): void {
    if (handler) this.socket?.off(event, handler);
    else this.socket?.removeAllListeners(event);
  }
}

// Singleton
export const mpClient = new MultiplayerClient();
