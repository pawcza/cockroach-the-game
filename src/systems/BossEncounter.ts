/** Decides when the boss fight starts and ends for this run, solo or server-driven. */
import Phaser from 'phaser';
import { AudioManager } from '../audio/AudioManager';
import { getLevelForDistance } from '../config/levels';
import { GameEventBridge } from '../multiplayer/GameEventBridge';
import { GhostManager } from '../multiplayer/GhostManager';
import { mpClient } from '../multiplayer/MultiplayerClient';
import { Player } from '../objects/Player';
import { GameHUD } from '../ui/GameHUD';
import { GameClock } from '../utils/GameClock';
import { BOSS_MAX_HP } from './boss/bossConfig';
import { BossFight, BossFightRole } from './BossFight';
import { GameOverHandler } from './GameOverHandler';
import { RunState } from './RunState';
import { ScoreTracker } from './ScoreTracker';
import { SpawnManager } from './SpawnManager';

const BOSS_TRIGGER_DISTANCE = 1800;

export interface BossEncounterDeps {
  run: RunState;
  player: Player;
  audio: AudioManager;
  hud: GameHUD;
  score: ScoreTracker;
  clock: GameClock;
  spawnManager: SpawnManager;
  gameOverHandler: GameOverHandler;
  eventBridge: GameEventBridge;
  isMultiplayer: boolean;
  floorTopY: number;
  floorBottomY: number;
  groups: Phaser.Physics.Arcade.Group[];
  getDistance: () => number;
  getGhostManager: () => GhostManager | null;
}

export class BossEncounter {
  private scene: Phaser.Scene;
  private deps: BossEncounterDeps;
  private _fight: BossFight | null = null;
  private _isActive = false;
  private defeated = false;

  constructor(scene: Phaser.Scene, deps: BossEncounterDeps) {
    this.scene = scene;
    this.deps = deps;
  }

  get fight(): BossFight | null { return this._fight; }

  /** True from the trigger on, which in multiplayer is before the server has answered. */
  get isActive(): boolean { return this._isActive; }

  /** The fight in progress, once there is one to run. */
  get activeFight(): BossFight | null { return this._isActive ? this._fight : null; }

  /** Starts the fight once the player reaches it; true when this frame should stop here. */
  tryTrigger(distance: number): boolean {
    const { run, isMultiplayer, eventBridge, player } = this.deps;
    if (this._isActive || this.defeated || distance < BOSS_TRIGGER_DISTANCE || run.isDead) return false;

    this._isActive = true;
    if (isMultiplayer) {
      eventBridge.onBossStart(player.x, BOSS_MAX_HP);
    } else {
      this.createFight('solo');
    }
    return true;
  }

  handleServerStart(data: { triggerX: number; hp: number; hostId: string }): void {
    if (this._fight) return;

    const { player, floorTopY, floorBottomY } = this.deps;
    player.forceEndEffects();
    this.clearArena();

    const role = data.hostId === mpClient.myId ? 'host' : 'client';

    this._isActive = true;
    player.sprite.x = data.triggerX;
    this.scene.cameras.main.scrollX = data.triggerX - 200;

    this.createFight(role, data.hp);
    this.deps.getGhostManager()?.enterBossFight(data.triggerX, floorTopY, floorBottomY);
  }

  handleServerEnd(data: { result: 'victory'; bonus: number }): void {
    const { run, score, hud, player, clock, spawnManager } = this.deps;
    if (!run.isDead) score.addScore(data.bonus);
    this.deps.getGhostManager()?.leaveBossFight();
    this.destroy();
    this._isActive = false;
    this.defeated = true;
    hud.hideBossHP();
    // Resume player and camera for all clients (solo path handles this in onComplete)
    if (!run.isDead) {
      const camera = this.scene.cameras.main;
      player.resumeAfterBossFight();
      player.updateSpeed(run.activePlayTime, run.currentLevel);
      camera.startFollow(player.sprite, true, 1, 0);
      camera.setFollowOffset(-200, 0);
      clock.resume();
      spawnManager.advanceSpawnX(player.x + 400);
    }
  }

  /** Ends the fight outright when the run is over. */
  cleanup(): void {
    this.destroy();
    this._isActive = false;
  }

  destroy(): void {
    this._fight?.destroy();
    this._fight = null;
  }

  private clearArena(): void {
    for (const group of this.deps.groups) {
      for (const obj of group.getChildren().slice()) {
        (obj as Phaser.Physics.Arcade.Sprite).destroy();
      }
    }
  }

  private createFight(role: BossFightRole, overrideHp?: number): void {
    const { player, audio, hud, clock, gameOverHandler, score, isMultiplayer, eventBridge } = this.deps;
    this.clearArena();

    this._isActive = true;
    clock.pause();
    this._fight = new BossFight(
      this.scene, player, audio, hud,
      this.deps.floorTopY, this.deps.floorBottomY,
      {
        onComplete: () => this.completeSoloFight(),
        onDie: (type) => {
          if (!isMultiplayer) this.cleanup();
          gameOverHandler.die(type);
        },
        addScore: (points) => score.addScore(points),
      },
      role,
      isMultiplayer ? eventBridge : undefined,
    );

    if (overrideHp != null && overrideHp !== BOSS_MAX_HP) {
      this._fight.updateHP(overrideHp);
    }
  }

  private completeSoloFight(): void {
    const { run, score, clock, player, audio, spawnManager } = this.deps;
    score.addScore(this._fight!.victoryBonus);
    this.destroy();
    clock.resume();
    this._isActive = false;
    this.defeated = true;
    player.resumeAfterBossFight();
    player.updateSpeed(run.activePlayTime, run.currentLevel);
    const blinkTween = player.startInvulnerabilityBlink();
    this.scene.time.delayedCall(1500, () => player.endInvulnerability(blinkTween));
    audio.switchBGM(getLevelForDistance(this.deps.getDistance()).bgmKey);
    spawnManager.advanceSpawnX(player.x + 400);
    this.deps.getGhostManager()?.leaveBossFight();
  }
}
