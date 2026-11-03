import Phaser from 'phaser';
import { FLOOR_BOTTOM_Y, FLOOR_TOP_Y } from '../config/constants';
import { ObstacleSpawner } from '../objects/ObstacleSpawner';
import { SeededRNG } from '../multiplayer/SeededRNG';
import { MPPlayer } from '../multiplayer/MultiplayerClient';
import { GameEventBridge } from '../multiplayer/GameEventBridge';
import { MultiplayerSession } from '../multiplayer/MultiplayerSession';
import { VisualEffects } from '../effects/VisualEffects';
import { AudioManager } from '../audio/AudioManager';
import { GameHUD } from '../ui/GameHUD';
import { Player } from '../objects/Player';
import { GameClock } from '../utils/GameClock';
import { AmbientEffects } from '../systems/AmbientEffects';
import { BossEncounter } from '../systems/BossEncounter';
import { BossFight } from '../systems/BossFight';
import { CollisionManager } from '../systems/CollisionManager';
import { ComboFeedback } from '../systems/ComboFeedback';
import { DeathReplayRecorder } from '../systems/DeathReplay';
import { FloorManager } from '../systems/FloorManager';
import { GameInput } from '../systems/GameInput';
import { GameOverHandler } from '../systems/GameOverHandler';
import { distanceAt, LevelProgression } from '../systems/LevelProgression';
import { NotificationManager } from '../systems/NotificationManager';
import { ParallaxBackground } from '../systems/ParallaxBackground';
import { PauseManager } from '../systems/PauseManager';
import { PickupMagnet } from '../systems/PickupMagnet';
import { RunCountdown } from '../systems/RunCountdown';
import { comboMultiplier, RunState } from '../systems/RunState';
import { ScoreTracker } from '../systems/ScoreTracker';
import { sceneManager } from '../systems/SceneManager';
import { SpawnManager } from '../systems/SpawnManager';
import { SpectateController } from '../systems/SpectateController';
import { areDeferredAssetsLoaded, DEFERRED_LOADED_EVENT } from './DeferredLoadScene';

interface GameSceneData {
  multiplayer?: boolean;
  seed?: number;
  players?: MPPlayer[];
  myId?: string;
}

/** Builds a run in a fixed order and calls its systems in a fixed per-frame order. */
export class GameScene extends Phaser.Scene {
  // Read by ObstacleSpawner
  public floorBottomY = FLOOR_BOTTOM_Y;
  public floorTopY = FLOOR_TOP_Y;
  public get cockroach(): Phaser.Physics.Arcade.Sprite { return this.player.sprite; }
  public get isDead(): boolean { return this.run.isDead; }

  // These two outlive a run: restart resets them instead of replacing them.
  private readonly run = new RunState();
  private readonly ambient = new AmbientEffects(this);

  private isMultiplayer = false;
  private rng: SeededRNG | null = null;
  private seed: number | null = null;
  private clock!: GameClock;
  private eventBridge!: GameEventBridge;

  private player!: Player;
  private audio!: AudioManager;
  private vfx!: VisualEffects;
  private hud!: GameHUD;
  private background!: ParallaxBackground;
  private floorManager!: FloorManager;
  private groups!: Record<'obstacles' | 'apples' | 'beers' | 'pills', Phaser.Physics.Arcade.Group>;

  private spawnManager!: SpawnManager;
  private pauseManager!: PauseManager;
  private gameOverHandler!: GameOverHandler;
  private replayRecorder!: DeathReplayRecorder;
  private score!: ScoreTracker;
  private levels!: LevelProgression;
  private boss!: BossEncounter;
  private session!: MultiplayerSession;
  private magnet!: PickupMagnet;
  private gameInput!: GameInput;
  private spectate!: SpectateController;
  private countdown!: RunCountdown;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    const data = this.scene.settings.data as GameSceneData | undefined;

    this.resetRun(data);
    this.createWorld();
    this.createHud();

    this.createPlaySystems();
    this.createEncounters(data);
    this.listenForLifecycle();

    this.gameInput = new GameInput(this, this.run, this.player, this.hud, this.pauseManager, this.eventBridge, this.boss);
    this.spectate = new SpectateController(this, this.gameInput, this.levels, this.gameOverHandler, this.hud, () => {
      this.background.update();
      this.updateFloors();
      this.spawnManager.handleSpawning(this.cameraRight);
      this.cleanupOffscreen();
    });

    this.startRun();
  }

  update(): void {
    if (this.run.isDead) {
      this.updateDead();
      return;
    }

    if (this.run.isCountingDown) {
      this.updateCountdown();
      return;
    }

    if (this.gameInput.pausePressed()) this.pauseManager.toggle();
    // While paused the pause menu's own MenuNav has the keyboard
    if (this.pauseManager.isPaused) return;

    // Active play time stands still during a boss fight
    if (!this.boss.isActive) {
      this.run.activePlayTime = this.clock.activePlayTime;
    }

    const fight = this.boss.activeFight;
    if (fight) {
      this.updateBossFight(fight);
      return;
    }

    this.updateRunning();
  }

  private resetRun(data: GameSceneData | undefined): void {
    this.isMultiplayer = data?.multiplayer ?? false;
    this.eventBridge?.destroy();
    this.eventBridge = new GameEventBridge(this.isMultiplayer);
    this.seed = this.isMultiplayer ? data?.seed ?? null : null;
    this.rng = this.seed !== null ? new SeededRNG(this.seed) : null;

    // Defensive cleanup of prior run. The Clock outlives a restart, so leaving a paused run would freeze this one.
    this.clock?.destroy();
    this.clock = new GameClock(this);
    this.time.timeScale = 1.0;
    this.time.paused = false;
    this.session?.destroy();
    this.boss?.destroy();

    this.run.reset(this.time.now);
    this.ambient.reset();
    this.floorBottomY = FLOOR_BOTTOM_Y;
    this.floorTopY = FLOOR_TOP_Y;
  }

  private createWorld(): void {
    const { width, height } = this.cameras.main;

    this.background = new ParallaxBackground(this, width, height);

    this.floorManager = new FloorManager(this, this.floorTopY, this.floorBottomY);
    this.floorManager.create(width);

    // Audio comes before Player, which needs it
    this.audio = new AudioManager(this);

    this.player = new Player(this, this.audio, this.floorManager.topColliderY, this.floorManager.bottomColliderY);
    this.player.create();
    this.player.resetState();
    this.ambient.attachTo(this.player, this.audio);

    this.groups = {
      obstacles: this.physics.add.group(),
      apples: this.physics.add.group(),
      beers: this.physics.add.group(),
      pills: this.physics.add.group(),
    };
    this.data.set('obstacles', this.groups.obstacles);

    this.vfx = new VisualEffects(this);
    this.vfx.init();
  }

  private createHud(): void {
    const leaveRun = (target: string, data?: Record<string, unknown>) => {
      sceneManager.goto(this, target, data, () => {
        this.sound.stopAll();
        this.audio.destroy();
      });
    };
    this.hud = new GameHUD(
      this,
      () => {
        if (this.run.isDead || this.run.isCountingDown) return;
        this.pauseManager.toggle();
      },
      this.isMultiplayer ? undefined : () => leaveRun('GameScene', { multiplayer: false }),
      this.isMultiplayer ? undefined : () => leaveRun('MenuScene'),
    );
    this.hud.create();

    const comboFeedback = new ComboFeedback(new NotificationManager(this));
    this.score = new ScoreTracker(this, this.run, this.hud, comboFeedback, this.audio, this.vfx);
    this.levels = new LevelProgression(this, this.run, this.background, this.audio, this.hud, this.seed);
    this.replayRecorder = new DeathReplayRecorder();
  }

  private createPlaySystems(): void {
    const { run, groups } = this;
    const { obstacles, apples, beers, pills } = groups;

    const collisions = new CollisionManager(this, this.player, this.vfx, this.audio, {
      getScore: () => run.score,
      addScore: (points) => this.score.addScore(points),
      getPickupCombo: () => run.pickupCombo,
      incrementCombo: () => this.score.incrementCombo(),
      getComboMultiplier: () => comboMultiplier(run.pickupCombo),
      onAppleCollected: () => { run.applesCollected++; },
      onBeerCollected: () => { run.beersCollected++; },
      onPillCollected: () => { run.pillsCollected++; },
      onPickup: (x, score) => this.eventBridge.onPickup(x, score, run.pickupCombo),
      onPillStart: () => this.eventBridge.onPillStart(this.player.x),
      onDie: (obstacleType) => this.gameOverHandler.die(obstacleType),
      onPickupCollected: (x, y, frameName) => this.replayRecorder.recordPickupCollected(this.time.now, x, y, frameName),
    });
    collisions.setupFloorColliders(this.floorManager.topBody, this.floorManager.bottomBody);
    collisions.setupOverlaps(apples, beers, pills, obstacles);

    const obstacleSpawner = new ObstacleSpawner(this, obstacles, this.audio, this.rng);
    this.spawnManager = new SpawnManager(
      this, obstacles, apples, beers, pills,
      obstacleSpawner, this.rng, this.floorTopY, this.floorBottomY,
    );
    this.magnet = new PickupMagnet(this, this.player, [apples, beers, pills]);

    this.pauseManager = new PauseManager(this, this.hud, this.isMultiplayer,
      () => {
        this.clock.pause();
        this.levels.setPaused(true);
      },
      (pausedMs) => {
        this.clock.resume();
        this.levels.setPaused(false);
        this.player.adjustTimersForPause(pausedMs);
      },
    );

    this.gameOverHandler = new GameOverHandler(this, this.player, this.vfx, this.audio, this.hud, this.isMultiplayer, {
      getScore: () => run.score,
      getActivePlayTime: () => run.activePlayTime,
      getDistance: () => this.getDistance(),
      getCurrentLevel: () => run.currentLevel,
      getPickupCounts: () => ({ apples: run.applesCollected, beers: run.beersCollected, pills: run.pillsCollected }),
      getMaxCombo: () => run.maxCombo,
      getGhostManager: () => this.session.ghostManager,
      setGhostManager: (gm) => { this.session.ghostManager = gm; },
      setIsDead: () => { run.isDead = true; },
      followSpectateTarget: (sprite) => this.spectate.follow(sprite),
      onDeath: (score, stats) => this.eventBridge.onDeath(score, stats),
      cleanupBossFight: () => this.boss.cleanup(),
      getReplayData: (obstacleType) => this.replayRecorder.getReplayData(obstacleType, obstacles, [apples, beers, pills]),
    });
  }

  private createEncounters(data: GameSceneData | undefined): void {
    const { run, player, audio, clock, eventBridge, isMultiplayer, spawnManager, gameOverHandler } = this;
    const shared = { run, player, audio, clock, eventBridge, isMultiplayer, spawnManager, gameOverHandler };
    const { obstacles, apples, beers, pills } = this.groups;

    this.boss = new BossEncounter(this, {
      ...shared,
      hud: this.hud,
      score: this.score,
      floorTopY: this.floorTopY,
      floorBottomY: this.floorBottomY,
      groups: [obstacles, apples, beers, pills],
      getDistance: () => this.getDistance(),
      getGhostManager: () => this.session.ghostManager,
    });

    this.session = new MultiplayerSession(this, { ...shared, boss: this.boss });
    if (isMultiplayer && data?.players && data?.myId) {
      this.session.joinPlayers(data.players, data.myId, this.floorManager.topColliderY, this.floorManager.bottomColliderY);
    }
  }

  private listenForLifecycle(): void {
    // Auto-pause on tab losing focus (singleplayer only)
    const onVisibilityChange = () => {
      if (document.hidden) this.pauseIfRunning();
    };
    if (!this.isMultiplayer) {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    const regenerateFloors = () => this.floorManager.regenerateFloorTextures();
    if (!areDeferredAssetsLoaded(this.game)) this.game.events.once(DEFERRED_LOADED_EVENT, regenerateFloors);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.relayout, this);

    this.events.once('shutdown', () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      this.game.events.off(DEFERRED_LOADED_EVENT, regenerateFloors);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.relayout, this);
      this.clock?.destroy();
      this.eventBridge?.destroy();
      this.levels?.destroy();
      this.boss?.destroy();
      this.session?.destroy();
    });
  }

  /** Multiplayer runs can't pause, so there this does nothing. */
  pauseIfRunning(): void {
    if (!this.run.isDead && !this.run.isCountingDown) this.pauseManager.pause();
  }

  private relayout(gameSize: Phaser.Structs.Size): void {
    const { width, height } = gameSize;
    this.hud.layout(width, height);
    this.background.resize(width, height);
    this.floorManager.resize(width);
    this.player.resize(width, height);
    this.vfx.resize(width, height);
    this.levels.resize();
    this.gameInput.layout(width, height);
  }

  private startRun(): void {
    const camera = this.cameras.main;
    camera.startFollow(this.player.sprite, true, 1, 0);
    camera.setFollowOffset(-200, 0);
    camera.scrollY = 0;

    this.audio.startBGM('bgm-lv1');

    // Starting invulnerability
    const blinkTween = this.player.startInvulnerabilityBlink();
    this.time.delayedCall(1500, () => { this.player.endInvulnerability(blinkTween); });

    this.player.freezeForCountdown();
    this.countdown = new RunCountdown(this, () => this.beginRunning());
  }

  private beginRunning(): void {
    this.run.isCountingDown = false;
    this.player.startRunning();
    this.run.activePlayTime = 0;
    this.clock.start();
    this.run.lastScoreTime = this.time.now;
    this.session.startPositionBroadcast();
  }

  private updateDead(): void {
    // Keep ghosts moving even before spectating starts
    this.session.updateGhosts();
    // Keep boss fight rendering during spectate (projectiles, HP updates from server)
    this.boss.activeFight?.update(this.game.loop.delta);

    const ghostManager = this.session.ghostManager;
    if (ghostManager?.isSpectating) this.spectate.update(ghostManager);
  }

  private updateCountdown(): void {
    this.player.freezeForCountdown();
    this.countdown.update();
    this.updateFloors();
    this.spawnManager.handleSpawning(this.cameraRight);
    this.background.update();
  }

  private updateBossFight(fight: BossFight): void {
    this.gameInput.handleBossKeys(fight);
    fight.update(this.game.loop.delta);
    this.background.update();
    this.updateFloors();
    this.updateHud(this.getDistance());
  }

  private updateRunning(): void {
    const { player } = this;

    player.updateSpeed(this.run.activePlayTime, this.run.currentLevel);
    this.ambient.updateDust();
    this.background.update();
    this.updateFloors();

    // Off-screen death
    if (player.y > this.cameras.main.height + 50 || player.y < -100) {
      this.gameOverHandler.die();
      return;
    }

    this.gameInput.handleRunKeys();
    player.updateDash();
    player.updatePill();
    this.magnet.update();

    this.session.sendEndedEffects();
    player.updateVisuals();
    this.replayRecorder.sample(
      this.time.now, player.x, player.y,
      player.currentFloor, player.isDashing,
      player.isPillActive, player.sprite.frame.name,
    );

    this.score.tickSurvival();
    this.gameOverHandler.checkMilestones(this.run.score);

    const distance = this.getDistance();
    this.levels.update(distance);
    if (this.boss.tryTrigger(distance)) return;

    this.updateHud(distance);

    this.spawnManager.handleSpawning(this.cameraRight);
    this.spawnManager.showObstacleWarnings(this.cameraRight, player.currentFloor);
    this.cleanupOffscreen();

    this.vfx.update(player.speedMultiplier);
    this.audio.updatePitch(player.speedMultiplier * player.pillSpeedBoost);
    this.ambient.update();
    this.session.updateGhosts();
  }

  private updateHud(distance: number): void {
    this.hud.update({
      score: this.run.score,
      distance,
      speedMultiplier: this.player.speedMultiplier,
      currentFloor: this.player.currentFloor,
      pickupCombo: this.run.pickupCombo,
      comboMultiplier: comboMultiplier(this.run.pickupCombo),
      timeNow: this.time.now,
    });
  }

  private updateFloors(): void {
    const { player, run } = this;
    const ghostManager = this.session.ghostManager;
    let trackX = player.x;
    let trackFloor = player.currentFloor;
    let shouldTrack = !run.isCountingDown && !run.isDead;

    if (run.isDead && ghostManager?.isSpectating) {
      const target = ghostManager.spectateTargetPlayer;
      if (target && target.alive) {
        trackX = target.sprite.x;
        trackFloor = target.lane as 'top' | 'bottom';
        shouldTrack = true;
      } else {
        trackX = 0;
        trackFloor = 'bottom';
      }
    }

    this.floorManager.update(
      this.cameras.main.scrollX,
      trackX, trackFloor, shouldTrack,
      player.currentFloor,
      this.time.now,
    );
    this.spawnManager.dropObstaclesOverGaps((x, floor) => this.floorManager.isGap(x, floor));
  }

  private cleanupOffscreen(): void {
    this.spawnManager.cleanupOffscreen(
      this.cameras.main.scrollX,
      (comboLost) => this.score.loseCombo(comboLost),
      this.run.pickupCombo,
    );
  }

  private get cameraRight(): number {
    return this.cameras.main.scrollX + this.cameras.main.width;
  }

  private getDistance(): number {
    return distanceAt(this.player.x);
  }
}
