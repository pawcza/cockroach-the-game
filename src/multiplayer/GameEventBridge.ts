import { mpClient } from './MultiplayerClient';

export interface BossProjectileData {
  lane: 'top' | 'bottom';
  speed: number;
  faceIdx: number;
  indestructible: boolean;
  volley: boolean;
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
  onGameOver: (data: { rankings: any[]; hostId: string }) => void;
  onBossStart: (data: { triggerX: number; hp: number; hostId: string }) => void;
  onBossProjectile: (data: BossProjectileData) => void;
  onBossShoot: (id: string) => void;
  onBossHit: (data: { id: string; hp: number }) => void;
  onBossRage: () => void;
  onBossEnd: (data: { result: 'victory' | 'defeat'; bonus: number }) => void;
  onBossHostTransfer: (data: { newHostId: string }) => void;
}

export class GameEventBridge {
  private multiplayer: boolean;
  private listeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];

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

    const listen = (event: string, handler: (...args: any[]) => void): void => {
      this.listeners.push({ event, handler });
      mpClient.on(event, handler);
    };

    listen('game:swap', (data: any) => callbacks.onGhostSwap(data.id, data.lane, data.x));
    listen('game:dash-start', (data: any) => callbacks.onGhostDashStart(data.id, data.x));
    listen('game:dash-end', (data: any) => callbacks.onGhostDashEnd(data.id, data.x));
    listen('game:pill-start', (data: any) => callbacks.onGhostPillStart(data.id, data.x));
    listen('game:pill-end', (data: any) => callbacks.onGhostPillEnd(data.id, data.x));
    listen('game:position', (data: any) => callbacks.onGhostPosition(data.id, data.x, data.lane, data.t));
    listen('game:pickup', (data: any) => callbacks.onGhostPickup(data.id, data.x, data.score, data.combo));
    listen('game:death', (data: any) => callbacks.onGhostDeath(data.id, data.score, data.stats));
    listen('game:player-left', (data: any) => callbacks.onPlayerLeft(data.id));
    listen('game:over', (data: any) => callbacks.onGameOver(data));
    listen('game:boss-start', (data: any) => callbacks.onBossStart(data));
    listen('game:boss-projectile', (data: any) => callbacks.onBossProjectile(data));
    listen('game:boss-shoot', (data: any) => callbacks.onBossShoot(data.id));
    listen('game:boss-hit', (data: any) => callbacks.onBossHit(data));
    listen('game:boss-rage', () => callbacks.onBossRage());
    listen('game:boss-end', (data: any) => callbacks.onBossEnd(data));
    listen('game:boss-host-transfer', (data: any) => callbacks.onBossHostTransfer(data));
  }

  // ── Cleanup ─────────────────────────────────────────────────────

  destroy(): void {
    for (const { event, handler } of this.listeners) {
      mpClient.off(event, handler);
    }
    this.listeners = [];
  }
}
