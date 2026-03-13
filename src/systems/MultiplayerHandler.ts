import Phaser from 'phaser';
import { mpClient } from '../multiplayer/MultiplayerClient';
import { GhostManager } from '../multiplayer/GhostManager';

export interface MultiplayerDeathNotificationCallback {
  (name: string, color: number, disconnected?: boolean): void;
}

export interface MultiplayerPickupCallback {
  (x: number): boolean;
}

/**
 * Manages all multiplayer socket event handlers and ghost delegation.
 */
export class MultiplayerHandler {
  private scene: Phaser.Scene;
  private ghostManager: GhostManager;
  private onDeathNotification: MultiplayerDeathNotificationCallback;
  private onPickupDestroy: MultiplayerPickupCallback;
  private onAllDead: () => void;
  private onGameOver: (data: any) => void;
  private _mpGameOverTriggered = false;

  pendingPickupDestructions: number[] = [];

  get mpGameOverTriggered(): boolean { return this._mpGameOverTriggered; }
  set mpGameOverTriggered(val: boolean) { this._mpGameOverTriggered = val; }

  constructor(
    scene: Phaser.Scene,
    ghostManager: GhostManager,
    callbacks: {
      onDeathNotification: MultiplayerDeathNotificationCallback;
      onPickupDestroy: MultiplayerPickupCallback;
      onAllDead: () => void;
      onGameOver: (data: any) => void;
    },
  ) {
    this.scene = scene;
    this.ghostManager = ghostManager;
    this.onDeathNotification = callbacks.onDeathNotification;
    this.onPickupDestroy = callbacks.onPickupDestroy;
    this.onAllDead = callbacks.onAllDead;
    this.onGameOver = callbacks.onGameOver;
  }

  setupListeners(isDead: () => boolean): void {
    this._mpGameOverTriggered = false;
    this.pendingPickupDestructions = [];

    mpClient.on('game:swap', (data: any) => {
      this.ghostManager.handleSwap(data.id, data.lane);
    });
    mpClient.on('game:dash-start', (data: any) => {
      this.ghostManager.handleDashStart(data.id);
    });
    mpClient.on('game:dash-end', (data: any) => {
      this.ghostManager.handleDashEnd(data.id);
    });
    mpClient.on('game:pill-start', (data: any) => {
      this.ghostManager.handlePillStart(data.id);
    });
    mpClient.on('game:pill-end', (data: any) => {
      this.ghostManager.handlePillEnd(data.id);
    });
    mpClient.on('game:death', (data: any) => {
      const name = this.ghostManager.getGhostName(data.id);
      const color = this.ghostManager.getGhostColor(data.id);
      this.ghostManager.handleDeath(data.id, data.score, data.stats);
      if (name) {
        this.onDeathNotification(name, color ?? 0xffffff);
      }
      if (isDead() && this.ghostManager.allDead()) {
        this.onAllDead();
      }
    });
    mpClient.on('game:player-left', (data: any) => {
      const name = this.ghostManager.getGhostName(data.id);
      const color = this.ghostManager.getGhostColor(data.id);
      this.ghostManager.handleDeath(data.id, 0, {});
      if (name) {
        this.onDeathNotification(name, color ?? 0xffffff, true);
      }
      if (isDead() && this.ghostManager.allDead()) {
        this.onAllDead();
      }
    });
    mpClient.on('game:pickup', (data: any) => {
      if (isDead()) {
        if (!this.onPickupDestroy(data.x)) {
          this.pendingPickupDestructions.push(data.x);
        }
      }
    });
    mpClient.on('game:over', (data: any) => {
      this.onGameOver(data);
    });

    // Cleanup on scene shutdown
    this.scene.events.on('shutdown', () => {
      this.removeListeners();
      this.ghostManager.destroy();
    });
  }

  removeListeners(): void {
    mpClient.off('game:swap');
    mpClient.off('game:dash-start');
    mpClient.off('game:dash-end');
    mpClient.off('game:pill-start');
    mpClient.off('game:pill-end');
    mpClient.off('game:pickup');
    mpClient.off('game:death');
    mpClient.off('game:player-left');
    mpClient.off('game:over');
  }

  flushPendingPickupDestructions(destroyFn: (x: number) => boolean): void {
    if (this.pendingPickupDestructions.length > 0) {
      this.pendingPickupDestructions = this.pendingPickupDestructions.filter(
        x => !destroyFn(x),
      );
    }
  }
}
