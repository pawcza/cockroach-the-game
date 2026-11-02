import { mpClient, type MPRanking, type SocketHandler } from './MultiplayerClient';

export interface BossProjectileData {
  lane: 'top' | 'bottom';
  speed: number;
  faceIdx: number;
  indestructible: boolean;
  volley: boolean;
}

export interface GameOverData {
  rankings: MPRanking[];
  hostId: string;
}

/** What the server sends for each game event. */
interface GameSocketEvents {
  'game:swap': { id: string; lane: string; x?: number };
  'game:dash-start': { id: string; x?: number };
  'game:dash-end': { id: string; x?: number };
  'game:pill-start': { id: string; x?: number };
  'game:pill-end': { id: string; x?: number };
  'game:position': { id: string; x: number; lane: string; t?: number };
  'game:pickup': { id: string; x: number; score: number; combo?: number };
  'game:death': { id: string; score: number; stats: Record<string, unknown> };
  'game:player-left': { id: string };
  'game:over': GameOverData;
  'game:boss-start': { triggerX: number; hp: number; hostId: string };
  'game:boss-projectile': BossProjectileData;
  'game:boss-shoot': { id: string };
  'game:boss-hit': { id: string; hp: number };
  'game:boss-rage': undefined;
  'game:boss-end': { result: 'victory'; bonus: number };
  'game:boss-host-transfer': { newHostId: string };
}

export interface GameEventCallbacks {
  onGhostSwap: (id: string, lane: string, x?: number) => void;
  onGhostDashStart: (id: string, x?: number) => void;
  onGhostDashEnd: (id: string, x?: number) => void;
  onGhostPillStart: (id: string, x?: number) => void;
  onGhostPillEnd: (id: string, x?: number) => void;
  onGhostPosition: (id: string, x: number, lane: string, t?: number) => void;
  onGhostPickup: (id: string, x: number, score: number, combo?: number) => void;
  onGhostDeath: (id: string, score: number, stats: Record<string, unknown>) => void;
  onPlayerLeft: (id: string) => void;
  onGameOver: (data: GameOverData) => void;
  onBossStart: (data: { triggerX: number; hp: number; hostId: string }) => void;
  onBossProjectile: (data: BossProjectileData) => void;
  onBossShoot: (id: string) => void;
  onBossHit: (data: { id: string; hp: number }) => void;
  onBossRage: () => void;
  onBossEnd: (data: { result: 'victory'; bonus: number }) => void;
  onBossHostTransfer: (data: { newHostId: string }) => void;
}

export class GameEventBridge {
  private multiplayer: boolean;
  private listeners: Array<{ event: string; handler: SocketHandler }> = [];

  constructor(multiplayer: boolean) {
    this.multiplayer = multiplayer;
  }

  // ── Outgoing events (no-ops in solo) ────────────────────────────

  onSwap(lane: string, x?: number): void {
    if (this.multiplayer) mpClient.sendSwap(lane, x);
  }

  onDashStart(x?: number): void {
    if (this.multiplayer) mpClient.sendDashStart(x);
  }

  onDashEnd(x?: number): void {
    if (this.multiplayer) mpClient.sendDashEnd(x);
  }

  onPillStart(x?: number): void {
    if (this.multiplayer) mpClient.sendPillStart(x);
  }

  onPillEnd(x?: number): void {
    if (this.multiplayer) mpClient.sendPillEnd(x);
  }

  onPosition(x: number, lane: string, activePlayTime?: number): void {
    if (this.multiplayer) mpClient.sendPosition(x, lane, activePlayTime);
  }

  onPickup(x: number, score: number, combo?: number): void {
    if (this.multiplayer) mpClient.sendPickup(x, score, combo);
  }

  onDeath(score: number, stats: Record<string, unknown>): void {
    if (this.multiplayer) mpClient.sendDeath(score, stats);
  }

  onBossStart(triggerX: number, hp: number): void {
    if (this.multiplayer) mpClient.sendBossStart(triggerX, hp);
  }

  onBossShoot(): void {
    if (this.multiplayer) mpClient.sendBossShoot();
  }

  onBossHit(): void {
    if (this.multiplayer) mpClient.sendBossHit();
  }

  onBossProjectile(data: BossProjectileData): void {
    if (this.multiplayer) mpClient.sendBossProjectile(data);
  }

  onBossRage(): void {
    if (this.multiplayer) mpClient.sendBossRage();
  }

  // ── Incoming events (sets up socket listeners) ──────────────────

  setupListeners(callbacks: GameEventCallbacks): void {
    if (!this.multiplayer) return;

    const listen = <E extends keyof GameSocketEvents>(
      event: E,
      handler: (data: GameSocketEvents[E]) => void,
    ): void => {
      this.listeners.push({ event, handler });
      mpClient.on(event, handler);
    };

    listen('game:swap', (data) => callbacks.onGhostSwap(data.id, data.lane, data.x));
    listen('game:dash-start', (data) => callbacks.onGhostDashStart(data.id, data.x));
    listen('game:dash-end', (data) => callbacks.onGhostDashEnd(data.id, data.x));
    listen('game:pill-start', (data) => callbacks.onGhostPillStart(data.id, data.x));
    listen('game:pill-end', (data) => callbacks.onGhostPillEnd(data.id, data.x));
    listen('game:position', (data) => callbacks.onGhostPosition(data.id, data.x, data.lane, data.t));
    listen('game:pickup', (data) => callbacks.onGhostPickup(data.id, data.x, data.score, data.combo));
    listen('game:death', (data) => callbacks.onGhostDeath(data.id, data.score, data.stats));
    listen('game:player-left', (data) => callbacks.onPlayerLeft(data.id));
    listen('game:over', (data) => callbacks.onGameOver(data));
    listen('game:boss-start', (data) => callbacks.onBossStart(data));
    listen('game:boss-projectile', (data) => callbacks.onBossProjectile(data));
    listen('game:boss-shoot', (data) => callbacks.onBossShoot(data.id));
    listen('game:boss-hit', (data) => callbacks.onBossHit(data));
    listen('game:boss-rage', () => callbacks.onBossRage());
    listen('game:boss-end', (data) => callbacks.onBossEnd(data));
    listen('game:boss-host-transfer', (data) => callbacks.onBossHostTransfer(data));
  }

  // ── Cleanup ─────────────────────────────────────────────────────

  destroy(): void {
    for (const { event, handler } of this.listeners) {
      mpClient.off(event, handler);
    }
    this.listeners = [];
  }
}
