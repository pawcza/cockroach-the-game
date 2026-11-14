/**
 * Decides when each boss fight starts and ends for this run, solo or server-driven, and does what every fight shares:
 * the clock and spawns stand still, the arena is cleared, the bar shows, and afterwards the run picks up again.
 */
import Phaser from 'phaser';
import { AudioManager } from '../audio/AudioManager';
import { LEVELS } from '../config/levels';
import { GameEventBridge } from '../multiplayer/GameEventBridge';
import { GhostManager } from '../multiplayer/GhostManager';
import { mpClient } from '../multiplayer/MultiplayerClient';
import { Player } from '../objects/Player';
import { GameHUD } from '../ui/GameHUD';
import { GameClock } from '../utils/GameClock';
import { BOSS_MAX_HP } from './boss/bossConfig';
import { BossFight, BossFightRole } from './boss/BossFight';
import { BossDef, BossId, bossById, dueBoss } from './boss/bosses';
import { BOSS_FIGHTS, fightReady, MULTIPLAYER_BOSS, soloLadder } from './boss/fights';
import { VersusSplash } from './boss/VersusSplash';
import { ZlewiatanFight } from './boss/ZlewiatanFight';
import { AbilityId } from './abilities';
import { AbilityReward } from './AbilityReward';
import { GameOverHandler } from './GameOverHandler';
import { RunState } from './RunState';
import { ScoreTracker } from './ScoreTracker';
import { SpawnManager } from './SpawnManager';

/** Emitted on the scene with the boss's id once it is beaten, as the run resumes. */
export const BOSS_DEFEATED_EVENT = 'boss-defeated';

/** The roach blinks, and nothing hurts it, this long after a fight. */
const RESUME_GRACE_MS = 1500;

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
  /** The run's seed, in a daily run or a match. */
  seed?: number | null;
  /** A hit in a fight that would kill: true when the wylinka took it instead. */
  absorbHit: () => boolean;
  /** A power was earned and the run has picked up again: where a lesson for it can be laid. */
  onAbilityEarned?: (ability: AbilityId) => void;
}

export class BossEncounter {
  private scene: Phaser.Scene;
  private deps: BossEncounterDeps;
  /** The bosses this run can meet. A match has the server's one boss. */
  private ladder: readonly BossDef[];
  private beaten = new Set<BossId>();
  private _fight: BossFight | null = null;
  private _isActive = false;
  /** The versus splash, from the trigger until its wipe is done. */
  private splash: VersusSplash | null = null;
  /** The new-ability beat after a boss, until it is done. The world stands still under it, like the splash. */
  private reward: AbilityReward | null = null;
  /** Solo: the world stands still under the splash, until the fight is made. */
  private _isFrozen = false;

  constructor(scene: Phaser.Scene, deps: BossEncounterDeps) {
    this.scene = scene;
    this.deps = deps;
    this.ladder = deps.isMultiplayer ? [bossById(MULTIPLAYER_BOSS)] : soloLadder();
    if (import.meta.env.DEV && !deps.isMultiplayer) this.skipToBoss(new URLSearchParams(window.location.search).get('boss'));
  }

  /**
   * Dev only, `?boss=<id>`: that boss comes 15 m into the run, with the earlier ones counted as beaten and their
   * powers already earned, so one fight can be tried without playing up to it.
   */
  private skipToBoss(id: string | null): void {
    const at = this.ladder.findIndex(boss => boss.id === id);
    if (at < 0) return;
    for (const earlier of this.ladder.slice(0, at)) {
      this.beaten.add(earlier.id);
      this.deps.run.abilities.grantReward(earlier);
    }
    this.ladder = this.ladder.map((boss, i) => (i === at ? { ...boss, triggerDistance: 15 } : boss));
  }

  /** True from the trigger on, which in multiplayer is before the server has answered. */
  get isActive(): boolean { return this._isActive; }

  /** The splash owns the screen: the run's input must not reach the game. */
  get isSplashing(): boolean { return this.splash?.blocking ?? false; }

  /** Solo, between the trigger and the fight: nothing in the world moves, and nothing can hurt the roach. */
  get isFrozen(): boolean { return this._isFrozen; }

  /** The boss this run meets next, and the distance it starts from (the last boss beaten, or the start): the taunts' cue. */
  get upcoming(): { boss: BossDef; from: number } | null {
    let next: BossDef | null = null;
    for (const boss of this.ladder) {
      if (!this.beaten.has(boss.id) && (!next || boss.triggerDistance < next.triggerDistance)) next = boss;
    }
    if (!next) return null;
    let from = 0;
    for (const boss of this.ladder) {
      if (this.beaten.has(boss.id) && boss.triggerDistance < next.triggerDistance) from = Math.max(from, boss.triggerDistance);
    }
    return { boss: next, from };
  }

  /** The fight in progress, once there is one to run. */
  get activeFight(): BossFight | null { return this._isActive ? this._fight : null; }

  /** The match's fight, for the server's boss events. */
  get serverFight(): ZlewiatanFight | null {
    return this._fight instanceof ZlewiatanFight ? this._fight : null;
  }

  /** Starts the next boss's fight once the player reaches it; true when this frame should stop here. */
  tryTrigger(distance: number): boolean {
    const { run, isMultiplayer, eventBridge, player } = this.deps;
    if (this._isActive || run.isDead) return false;
    const boss = dueBoss(this.ladder, distance, this.beaten);
    if (!boss) return false;
    // Its art loads after boot: until it is in, the run goes on
    if (!fightReady(boss.id, this.scene.textures)) return false;

    this._isActive = true;
    if (isMultiplayer) {
      eventBridge.onBossStart(player.x, BOSS_MAX_HP);
    } else {
      this.freezeWorld();
      // Solo it holds on the finished splash until a press, and only then is the fight made
      this.playSplash(boss, true, () => {
        this.thawWorld();
        this.startFight(boss, 'solo');
      });
    }
    return true;
  }

  handleServerStart(data: { triggerX: number; hp: number; hostId: string }): void {
    if (this._fight) return;

    const { player, floorTopY, floorBottomY } = this.deps;
    player.sprite.x = data.triggerX;
    this.scene.cameras.main.scrollX = data.triggerX - 200;

    // The fight starts at once, as the server's state must find it ready; the splash plays over its intro
    const boss = bossById(MULTIPLAYER_BOSS);
    this.startFight(boss, data.hostId === mpClient.myId ? 'host' : 'client');
    // A match cannot wait for a press: the splash goes by itself after a short hold
    this.playSplash(boss, false, () => {});
    if (data.hp !== BOSS_MAX_HP) this.serverFight?.updateHP(data.hp);
    this.deps.getGhostManager()?.enterBossFight(data.triggerX, floorTopY, floorBottomY);
  }

  handleServerEnd(data: { result: 'victory'; bonus: number }): void {
    this.endFight(MULTIPLAYER_BOSS, data.bonus);
  }

  /** Ends the fight outright when the run is over. */
  cleanup(): void {
    this.destroy();
    this._isActive = false;
  }

  destroy(): void {
    this.splash?.destroy();
    this.splash = null;
    this.reward?.destroy();
    this.reward = null;
    this.thawWorld();
    this._fight?.destroy();
    this._fight = null;
    this.deps.hud.hideBossHP();
  }

  private playSplash(boss: BossDef, waitForPress: boolean, onWipe: () => void): void {
    const { audio, run } = this.deps;
    this.splash?.destroy();
    // The level's music gives way to the pre-battle loop for the whole splash
    audio.beginPrelude('boss-prelude');
    this.splash = new VersusSplash({
      scene: this.scene,
      audio: this.deps.audio,
      boss,
      waitForPress,
      onWipe: () => {
        // The press (or, in a match, the hold's end): the boss's music comes in off the loop, quickly. Left to the
        // fight itself this came only after its intro, a walk-in or a rise, and then a level-length crossfade
        audio.endPrelude(boss.music, LEVELS[run.currentLevel - 1].bgmKey);
        onWipe();
      },
      onEnd: () => { this.splash = null; },
    });
  }

  /** The hit-stop: the clock, physics, tweens and animations stop where they are. */
  private freezeWorld(): void {
    this._isFrozen = true;
    this.deps.clock.pause();
    this.scene.physics.pause();
    this.scene.tweens.pauseAll();
    this.scene.anims.pauseAll();
  }

  private thawWorld(): void {
    if (!this._isFrozen) return;
    this._isFrozen = false;
    this.scene.physics.resume();
    this.scene.tweens.resumeAll();
    this.scene.anims.resumeAll();
  }

  private clearArena(): void {
    for (const group of this.deps.groups) {
      for (const obj of group.getChildren().slice()) {
        (obj as Phaser.Physics.Arcade.Sprite).destroy();
      }
    }
  }

  private startFight(boss: BossDef, role: BossFightRole): void {
    const { player, audio, hud, clock, gameOverHandler, score, isMultiplayer, eventBridge } = this.deps;
    player.forceEndEffects();
    this.clearArena();

    this._isActive = true;
    clock.pause();
    const fight = BOSS_FIGHTS[boss.id]!({
      scene: this.scene,
      player,
      audio,
      boss,
      floorTopY: this.deps.floorTopY,
      floorBottomY: this.deps.floorBottomY,
      role,
      eventBridge: isMultiplayer ? eventBridge : null,
      seed: this.deps.seed,
      abilities: this.deps.run.abilities,
      survivesHit: () => this.deps.absorbHit(),
      addScore: (points) => score.addScore(points),
      showBar: (value, max) => hud.showBossHP(boss.name, value, max),
      updateBar: (value, last) => hud.updateBossHP(value, last),
      showSegments: (segments) => hud.showBossSegments(boss.name, segments),
      onWon: () => this.endFight(boss.id, fight.victoryBonus),
      onLost: (deathType) => {
        // Solo the fight goes with the run; in a match it stays on screen for spectators. Nothing in taking it down
        // may stop the death itself: a throw there would leave the run frozen with no game over
        try {
          if (!isMultiplayer) this.cleanup();
        } catch (error) {
          console.error('boss fight cleanup failed', error);
        }
        gameOverHandler.die(deathType);
      },
    });
    this._fight = fight;
  }

  /** The boss is beaten: the bonus, its reward if it has one, and the run picks up where it stopped. */
  private endFight(id: BossId, bonus: number): void {
    const { run, score } = this.deps;
    if (!run.isDead) score.addScore(bonus);
    this.destroy();
    this._isActive = false;
    this.beaten.add(id);
    this.deps.getGhostManager()?.leaveBossFight();
    this.scene.events.emit(BOSS_DEFEATED_EVENT, id);
    if (run.isDead) return;

    // The registry says what this boss gives; a match, or a power already owned, gives nothing
    const earned = run.abilities.grantReward(bossById(id));
    if (!earned) {
      this.resumeRun(null);
      return;
    }
    this.freezeWorld();
    // The boss's music ended when he died: the ability screen has a calm loop of its own until it is dismissed
    this.deps.audio.switchBGM('boss-aftermath');
    this.reward = new AbilityReward({
      scene: this.scene,
      audio: this.deps.audio,
      ability: earned,
      onDone: () => {
        this.reward = null;
        this.thawWorld();
        this.resumeRun(earned);
      },
    });
  }

  private resumeRun(earned: AbilityId | null): void {
    const { run, player, clock, audio, spawnManager } = this.deps;
    const camera = this.scene.cameras.main;
    player.resumeAfterBossFight();
    player.updateSpeed(run.activePlayTime, run.currentLevel);
    camera.startFollow(player.sprite, true, 1, 0);
    camera.setFollowOffset(-200, 0);
    clock.resume();
    const blinkTween = player.startInvulnerabilityBlink();
    this.scene.time.delayedCall(RESUME_GRACE_MS, () => player.endInvulnerability(blinkTween));
    // The level the fight was fought in; a level that waited on this boss arrives next frame (LevelProgression), with
    // its own music
    audio.switchBGM(LEVELS[run.currentLevel - 1].bgmKey);
    spawnManager.advanceSpawnX(player.x + 400);
    if (earned) this.deps.onAbilityEarned?.(earned);
  }
}
