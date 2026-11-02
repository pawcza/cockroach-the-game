/** One run's link to the other players: ghosts, incoming events and outgoing player state. */
import Phaser from 'phaser';
import { AudioManager } from '../audio/AudioManager';
import { COCKROACH_START_X } from '../config/constants';
import { Player } from '../objects/Player';
import { BossEncounter } from '../systems/BossEncounter';
import { GameOverHandler } from '../systems/GameOverHandler';
import { RunState } from '../systems/RunState';
import { sceneManager } from '../systems/SceneManager';
import { SpawnManager } from '../systems/SpawnManager';
import { GameClock } from '../utils/GameClock';
import { GameEventBridge } from './GameEventBridge';
import { GhostManager } from './GhostManager';
import { mpClient, MPPlayer } from './MultiplayerClient';

export interface MultiplayerSessionDeps {
  run: RunState;
  player: Player;
  audio: AudioManager;
  clock: GameClock;
  eventBridge: GameEventBridge;
  isMultiplayer: boolean;
  spawnManager: SpawnManager;
  gameOverHandler: GameOverHandler;
  boss: BossEncounter;
}

export class MultiplayerSession {
  ghostManager: GhostManager | null = null;

  private scene: Phaser.Scene;
  private deps: MultiplayerSessionDeps;
  private wasDashing = false;
  private wasPillActive = false;
  private stopWatchingDrop: (() => void) | null = null;

  constructor(scene: Phaser.Scene, deps: MultiplayerSessionDeps) {
    this.scene = scene;
    this.deps = deps;
  }

  joinPlayers(players: MPPlayer[], myId: string, topColliderY: number, bottomColliderY: number): void {
    const { run, audio, eventBridge, spawnManager, gameOverHandler, boss } = this.deps;

    this.ghostManager = new GhostManager(
      this.scene, players, myId,
      topColliderY, bottomColliderY,
      COCKROACH_START_X,
    );
    eventBridge.setupListeners({
      onGhostSwap: (id, lane, x) => this.ghostManager?.handleSwap(id, lane, x),
      onGhostDashStart: (id, x) => this.ghostManager?.handleDashStart(id, x),
      onGhostDashEnd: (id, x) => this.ghostManager?.handleDashEnd(id, x),
      onGhostPillStart: (id, x) => this.ghostManager?.handlePillStart(id, x),
      onGhostPillEnd: (id, x) => this.ghostManager?.handlePillEnd(id, x),
      onGhostPosition: (id, x, _lane, t) => this.ghostManager?.handlePosition(id, x, t),
      onGhostPickup: (id, x, score, combo) => {
        this.ghostManager?.updateGhostScore(id, score, x, combo);
        if (run.isDead) {
          spawnManager.queuePickupDestruction(x);
          audio.playApple();
        }
      },
      onGhostDeath: (id, score, stats) => gameOverHandler.handleGhostDeath(id, score, stats, () => run.isDead),
      onPlayerLeft: (id) => gameOverHandler.handlePlayerLeft(id, () => run.isDead),
      onGameOver: (data) => gameOverHandler.handleServerGameOver(data),
      onBossStart: (data) => boss.handleServerStart(data),
      onBossProjectile: (data) => boss.fight?.spawnExternalProjectile(data),
      onBossShoot: (id) => this.ghostManager?.handleBossShoot(id),
      onBossHit: (data) => boss.fight?.updateHP(data.hp),
      onBossRage: () => boss.fight?.triggerExternalRage(),
      onBossEnd: (data) => boss.handleServerEnd(data),
      onBossHostTransfer: (data) => {
        if (data.newHostId === mpClient.myId) {
          boss.fight?.promoteToHost();
        }
      },
    });
    gameOverHandler.resetMpState();

    this.stopWatchingDrop = mpClient.onDrop(() => {
      sceneManager.goto(this.scene, 'MultiplayerMenuScene', { notice: 'Utracono połączenie z serwerem' }, () => {
        audio.destroy();
        this.scene.sound.stopAll();
      });
    });
  }

  /** Sends an immediate position so ghosts can start moving without delay, then one every 100 ms. */
  startPositionBroadcast(): void {
    const { run, player, clock, eventBridge, isMultiplayer, boss } = this.deps;
    if (!isMultiplayer) return;

    eventBridge.onPosition(player.x, player.currentFloor, 0);
    clock.repeat(100, () => {
      if (!run.isDead && !boss.isActive) {
        eventBridge.onPosition(player.x, player.currentFloor, clock.activePlayTime);
      }
    });
  }

  /** Reports dash and pill effects that ended on their own this frame. */
  sendEndedEffects(): void {
    const { player, eventBridge } = this.deps;
    if (this.wasDashing && !player.isDashing) eventBridge.onDashEnd(player.x);
    this.wasDashing = player.isDashing;
    if (this.wasPillActive && !player.isPillActive) eventBridge.onPillEnd(player.x);
    this.wasPillActive = player.isPillActive;
  }

  updateGhosts(): void {
    const camera = this.scene.cameras.main;
    this.ghostManager?.update(this.scene.game.loop.delta, camera.scrollX, camera.width, camera.height);
  }

  destroy(): void {
    this.stopWatchingDrop?.();
    this.stopWatchingDrop = null;
    this.ghostManager?.destroy();
    this.ghostManager = null;
  }
}
