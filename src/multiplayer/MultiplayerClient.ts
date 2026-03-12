import { io, Socket } from 'socket.io-client';

export interface MPPlayer {
  id: string;
  name: string;
  color: number;
  isHost: boolean;
  ready: boolean;
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

/** Default timeout for socket acknowledgement callbacks (ms). */
const ACK_TIMEOUT = 5000;

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

  /**
   * Helper: emit with ack callback wrapped in a Promise.
   * Rejects if socket is disconnected or if the server doesn't respond within timeout.
   */
  private emitWithAck<T>(event: string, ...args: any[]): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error('Socket not connected'));
        return;
      }

      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for ${event}`));
      }, ACK_TIMEOUT);

      const callback = (res: any) => {
        clearTimeout(timer);
        if (res?.error) reject(new Error(res.error));
        else resolve(res as T);
      };

      this.socket.emit(event, ...args, callback);
    });
  }

  async listLobbies(): Promise<MPLobbyListEntry[]> {
    return this.emitWithAck<MPLobbyListEntry[]>('lobby:list');
  }

  async createLobby(): Promise<MPLobbyData> {
    const res = await this.emitWithAck<{ lobby: MPLobbyData }>('lobby:create');
    return res.lobby;
  }

  async joinLobby(lobbyId: string): Promise<MPLobbyData> {
    const res = await this.emitWithAck<{ lobby: MPLobbyData }>('lobby:join', lobbyId);
    return res.lobby;
  }

  leaveLobby(): void {
    this.socket?.emit('lobby:leave');
  }

  async changeColor(colorIndex: number): Promise<MPLobbyData> {
    const res = await this.emitWithAck<{ lobby: MPLobbyData }>('lobby:color', colorIndex);
    return res.lobby;
  }

  async setReady(ready: boolean): Promise<MPLobbyData> {
    const res = await this.emitWithAck<{ lobby: MPLobbyData }>('lobby:ready', ready);
    return res.lobby;
  }

  async startGame(): Promise<{ seed: number; players: MPPlayer[] }> {
    return this.emitWithAck<{ ok: boolean; seed: number; players: MPPlayer[] }>('lobby:start');
  }

  async restartLobby(): Promise<void> {
    await this.emitWithAck<{ ok: boolean }>('lobby:restart');
  }

  // Game events — send
  sendSwap(lane: string): void { this.socket?.emit('game:swap', lane); }
  sendDashStart(): void { this.socket?.emit('game:dash-start'); }
  sendDashEnd(): void { this.socket?.emit('game:dash-end'); }
  sendPillStart(): void { this.socket?.emit('game:pill-start'); }
  sendPillEnd(): void { this.socket?.emit('game:pill-end'); }
  sendPosition(x: number, lane: string): void { this.socket?.emit('game:position', { x, lane }); }
  sendPickup(x: number): void { this.socket?.emit('game:pickup', { x }); }
  sendDeath(score: number, stats: Record<string, unknown>): void { this.socket?.emit('game:death', { score, stats }); }
  sendAllDead(rankings: Array<Record<string, unknown>>): void { this.socket?.emit('game:all-dead', { rankings }); }

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
