import Phaser from 'phaser';
import { FLOOR_BOTTOM_Y, FLOOR_TOP_Y } from '../config/constants';
import { ObstacleSpawner } from '../objects/ObstacleSpawner';
import { SeededRNG } from '../multiplayer/SeededRNG';
import { MPPlayer } from '../multiplayer/MultiplayerClient';
import { GameEventBridge } from '../multiplayer/GameEventBridge';
import { MultiplayerSession } from '../multiplayer/MultiplayerSession';
import { VisualEffects } from '../effects/VisualEffects';
import { AudioManager, VOL } from '../audio/AudioManager';
import { GameHUD } from '../ui/GameHUD';
import { Player, type Floor } from '../objects/Player';
import { ROACH_FEET_OFFSET } from '../config/sprites';
import { GameClock } from '../utils/GameClock';
import { AbilityLessons } from '../systems/AbilityLessons';
import { AmbientEffects } from '../systems/AmbientEffects';
import { BossEncounter } from '../systems/BossEncounter';
import type { BossFight } from '../systems/boss/BossFight';
import { TauntDirector } from '../systems/boss/TauntDirector';
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
import { Tutorial } from '../systems/Tutorial';
import { RiskBonus } from '../systems/RiskBonus';
import { RunGun } from '../systems/RunGun';
import { AMMO_PER_BOX, KILL_SCORE } from '../systems/gunRules';
import { TIMINGS } from '../objects/obstacles/cast';
import { getFx } from '../effects/Fx';
import { DEPTH } from '../config/constants';
import { SpectateController } from '../systems/SpectateController';
import type { DailyRun } from '../ui/Scoreboard';
import { BestRunGhost, RunTrackRecorder } from '../systems/BestRunGhost';
import { isTutorialDone, loadBestTrack } from '../utils/Storage';
import { awardDuringRun, type RunSnapshot } from '../systems/Profile';
import { showAchievement } from '../ui/shared';
import { PLAIN, type Look } from '../config/skins';
import { myLook } from '../ui/Shop';
import { areDeferredAssetsLoaded, DEFERRED_LOADED_EVENT } from './DeferredLoadScene';

interface GameSceneData {
  multiplayer?: boolean;
  seed?: number;
  players?: MPPlayer[];
  myId?: string;
  /** Straight back in from a solo game over: a short "JAZDA!" instead of the 3-2-1. */
  retry?: boolean;
  /** Multiplayer: when every client's run starts (Date.now time). */
  startsAt?: number;
  /** Joined while the run was going: watch it, from this far in, with these players already out. */
  watch?: { elapsedMs: number; dead: string[] };
  /** Karaluch Dnia: a solo run on the day's shared seed. */
  daily?: DailyRun;
}

/** Builds a run in a fixed order and calls its systems in a fixed per-frame order. */

/** How often a run checks what it has earned. */
const ACHIEVEMENT_CHECK_MS = 500;
/** Killed by an obstacle, solo: the world holds this long (real ms) with the culprit blinking, before the death. */
const HIT_STOP_MS = 400;
const HIT_BLINK_MS = 80;
export class GameScene extends Phaser.Scene {
  // Read by ObstacleSpawner
  public floorBottomY = FLOOR_BOTTOM_Y;
  public floorTopY = FLOOR_TOP_Y;
  public get cockroach(): Phaser.Physics.Arcade.Sprite { return this.player.sprite; }
  public get isDead(): boolean { return this.run.isDead; }
  public get runTime(): number { return Math.max(0, this.clock?.activePlayTime ?? 0); }
  /** The vacuum's suction, on this client's roach only (ObstacleScene). */
  public pullRoach(share: number): void { if (!this.run.isDead) this.player.setPull(share); }
  /** A shot aerosol can goes off (ObstacleScene): the run's gun sees to what it takes with it. */
  public blast(source: Phaser.Physics.Arcade.Sprite, radius: number, cause: string): void {
    if (!this.run.isDead) this.runGun.blast(source, radius, cause);
  }

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
  private groups!: Record<'obstacles' | 'apples' | 'beers' | 'pills' | 'ammo', Phaser.Physics.Arcade.Group>;

  private spawnManager!: SpawnManager;
  private pauseManager!: PauseManager;
  private gameOverHandler!: GameOverHandler;
  private replayRecorder!: DeathReplayRecorder;
  private runTrack!: RunTrackRecorder;
  private bestGhost: BestRunGhost | null = null;
  /** Running time as the world saw it: the frames the run actually played, excluding pauses and the boss. */
  private raceTime = 0;
  private nextAchievementCheck = 0;
  private score!: ScoreTracker;
  private levels!: LevelProgression;
  private boss!: BossEncounter;
  private taunts!: TauntDirector;
  private lessons!: AbilityLessons;
  /** The opening lesson of a solo run on a device that has not had it. */
  private tutorial: Tutorial | null = null;
  private session!: MultiplayerSession;
  private magnet!: PickupMagnet;
  private risk!: RiskBonus;
  /** The pistol between the fights (solo, from DJ Bigos on). */
  private runGun!: RunGun;
  private quickStart = false;
  private startsAt: number | undefined;
  private watching: { elapsedMs: number; dead: string[] } | undefined;
  private daily: DailyRun | undefined;
  private look: Look = PLAIN;
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

    this.gameInput = new GameInput(this, this.run, this.player, this.pauseManager, this.eventBridge, this.boss,
      () => this.runGun.fire());
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

    // The versus splash holds the run: no pausing, no input, nothing moving until the fight is made
    if (this.boss.isFrozen) {
      this.gameInput.discardInput();
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
    this.quickStart = !this.isMultiplayer && data?.retry === true;
    this.startsAt = this.isMultiplayer ? data?.startsAt : undefined;
    this.watching = this.isMultiplayer ? data?.watch : undefined;
    // Your skin: in a match as the lobby has it (what the others see too), solo from your account
    this.look = this.isMultiplayer ? data?.players?.find(p => p.id === data?.myId)?.look ?? PLAIN : myLook();
    this.eventBridge?.destroy();
    this.eventBridge = new GameEventBridge(this.isMultiplayer);
    this.daily = this.isMultiplayer ? undefined : data?.daily;
    // Multiplayer and Karaluch Dnia lay out the same run for everyone from one seed; a plain solo run doesn't
    this.seed = this.isMultiplayer ? data?.seed ?? null : this.daily?.seed ?? null;
    this.rng = this.seed !== null ? new SeededRNG(this.seed) : null;

    // Defensive cleanup of prior run. The Clock outlives a restart, so leaving a paused run would freeze this one.
    this.clock?.destroy();
    this.clock = new GameClock(this);
    this.time.timeScale = 1.0;
    this.time.paused = false;
    this.session?.destroy();
    this.boss?.destroy();

    this.run.reset(this.time.now, this.isMultiplayer);
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
    this.player.setLook(this.look);
    this.ambient.attachTo(this.player, this.audio);

    this.groups = {
      obstacles: this.physics.add.group(),
      apples: this.physics.add.group(),
      beers: this.physics.add.group(),
      pills: this.physics.add.group(),
      ammo: this.physics.add.group(),
    };
    this.data.set('obstacles', this.groups.obstacles);

    this.vfx = new VisualEffects(this);
    this.vfx.init();
    this.vfx.attachPlayer(this.player);
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
        if (this.run.isDead || this.run.isCountingDown || this.boss.isFrozen) return;
        this.pauseManager.toggle();
      },
      this.isMultiplayer ? undefined : () => leaveRun('GameScene', { multiplayer: false, retry: true, daily: this.daily }),
      this.isMultiplayer ? undefined : () => leaveRun('MenuScene'),
    );
    this.hud.create();

    const comboFeedback = new ComboFeedback(new NotificationManager(this));
    this.score = new ScoreTracker(this, this.run, this.hud, comboFeedback, this.audio, this.vfx);
    this.levels = new LevelProgression(this, this.run, this.background, this.audio, this.hud, this.seed);
    this.replayRecorder = new DeathReplayRecorder();
    this.runTrack = new RunTrackRecorder();
    this.bestGhost = null;
    this.raceTime = 0;
  }

  private createPlaySystems(): void {
    const { run, groups } = this;
    const { obstacles, apples, beers, pills, ammo } = groups;

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
      onDie: (obstacleType, culprit) => this.killedBy(obstacleType, culprit),
      survivesHit: () => this.absorbHit(),
      onPickupCollected: (x, y, frameName) => {
        this.replayRecorder.recordPickupCollected(this.time.now, x, y, frameName);
        this.vfx.pickupCollectEffect(x, y, frameName);
      },
      onDashThrough: (obstacle) => this.risk.dashedThrough(obstacle),
    });
    collisions.setupFloorColliders(this.floorManager.topBody, this.floorManager.bottomBody);
    collisions.setupOverlaps(apples, beers, pills, obstacles);

    const obstacleSpawner = new ObstacleSpawner(this, obstacles, this.audio);
    this.spawnManager = new SpawnManager(
      this, obstacles, apples, beers, pills, ammo,
      obstacleSpawner, this.rng, this.floorTopY, this.floorBottomY,
      () => run.abilities.canDash,
      !this.isMultiplayer,
    );
    this.lessons = new AbilityLessons(this, this.player, this.spawnManager);
    this.magnet = new PickupMagnet(this, this.player, [apples, beers, pills, ammo]);
    // A shot down scores like a close call: it feeds the combo and its multiplier
    this.runGun = new RunGun(this, this.player, obstacles, this.audio, {
      onKill: (sprite, base, label) => {
        run.kills++;
        this.score.incrementCombo();
        const points = Math.round(base * comboMultiplier(run.pickupCombo));
        this.score.addScore(points);
        collisions.showPickupPopup(sprite.x, sprite.y - 50, `${label} +${points}`, '#ffb066');
      },
      killRoach: (cause, culprit) => this.killedBy(cause, culprit),
    }, KILL_SCORE, TIMINGS.aerosol.bonus);
    // An ammo box: rounds into the magazine, as many as fit
    this.physics.add.overlap(this.player.sprite, ammo, (_roach, box) => {
      const sprite = box as Phaser.Physics.Arcade.Sprite;
      const added = this.runGun.reload(AMMO_PER_BOX);
      getFx(this).play('glint-gold', sprite.x, sprite.y - 16, { depth: DEPTH.POPUP });
      this.audio.playSfx('shell-casing', VOL.pickup);
      collisions.showPickupPopup(sprite.x, sprite.y - 30, added > 0 ? `+${added} NAB.` : 'PEŁNY', '#ffe066');
      sprite.destroy();
    });
    // Close calls score like a pickup: they feed the combo and its multiplier
    this.risk = new RiskBonus(this.player, obstacles, (base, label, x, y, color, kind) => {
      if (kind === 'near') { run.nearMisses++; this.taunts?.nearMiss(); this.audio.playSfx('na-styk', VOL.stinger); }
      else {
        run.dashThroughs++;
        if (kind.dashed === 'wall') run.wallsBroken++;
        this.audio.playSfx('przebicie', VOL.stinger);
      }
      this.score.incrementCombo();
      const points = Math.round(base * comboMultiplier(run.pickupCombo));
      this.score.addScore(points);
      collisions.showPickupPopup(x, y, `${label} +${points}`, color);
    });

    this.pauseManager = new PauseManager(this, this.hud, this.isMultiplayer,
      () => {
        this.clock.pause();
        this.levels.setPaused(true);
        this.audio.pauseLoops();
      },
      (pausedMs) => {
        this.clock.resume();
        this.levels.setPaused(false);
        this.audio.resumeLoops();
        this.player.adjustTimersForPause(pausedMs);
      },
    );

    this.gameOverHandler = new GameOverHandler(this, this.player, this.vfx, this.audio, this.hud, this.isMultiplayer, this.daily ?? null, {
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
      getRunTrack: () => this.runTrack.track,
      getRunSnapshot: () => this.runSnapshot(),
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
      seed: this.seed,
      absorbHit: () => this.absorbHit(),
      onAbilityEarned: (ability) => this.lessons.teach(ability, this.run.abilities.canShootInRun),
    });

    this.taunts = new TauntDirector({
      scene: this, run, boss: this.boss, isMultiplayer,
      isPaused: () => this.pauseManager.isPaused,
      getDistance: () => this.getDistance(),
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
    if (!this.run.isDead && !this.run.isCountingDown && !this.boss.isFrozen) this.pauseManager.pause();
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
    if (this.watching) {
      this.startWatching(this.watching);
      return;
    }
    const camera = this.cameras.main;
    camera.startFollow(this.player.sprite, true, 1, 0);
    camera.setFollowOffset(-200, 0);
    camera.scrollY = 0;

    this.audio.startBGM('bgm-lv1');

    // Starting invulnerability
    const blinkTween = this.player.startInvulnerabilityBlink();
    this.time.delayedCall(1500, () => { this.player.endInvulnerability(blinkTween); });

    if (this.daily) this.hud.showDailyBanner(this.daily.date);

    // Never in a match or Karaluch Dnia, which lay one course out for everyone
    // Nor with the dev shortcut to a boss (?boss=), which puts the fight where the lesson would be
    const toBoss = import.meta.env.DEV && new URLSearchParams(window.location.search).has('boss');
    this.tutorial = !this.isMultiplayer && !this.daily && !toBoss && !isTutorialDone()
      ? new Tutorial({ scene: this, player: this.player, spawnManager: this.spawnManager, isPaused: () => this.pauseManager.isPaused })
      : null;

    // Solo: your record run (or today's best daily run) races beside you. Not through a tutorial, which would only confuse
    const best = this.isMultiplayer || this.tutorial ? null : loadBestTrack(this.daily?.date);
    if (best) {
      const laneY = (floor: Floor): number =>
        (floor === 'top' ? this.floorManager.topColliderY : this.floorManager.bottomColliderY) - ROACH_FEET_OFFSET;
      this.bestGhost = new BestRunGhost(this, best, laneY);
    }

    this.player.freezeForCountdown();
    this.countdown = new RunCountdown(this, () => this.beginRunning(), this.quickStart, this.startsAt);
  }

  /**
   * Into a run already going: no roach of your own, the run's clock at the run's time (so the moving obstacles stand
   * where the players see them), and the camera on someone still alive. The arrows switch between them.
   */
  private startWatching(watch: { elapsedMs: number; dead: string[] }): void {
    this.run.isCountingDown = false;
    this.run.isDead = true;
    this.player.benchForWatching();
    this.clock.start(Date.now() - watch.elapsedMs);
    this.audio.startBGM('bgm-lv1');
    this.gameOverHandler.watchOnly = true;

    const ghosts = this.session.ghostManager;
    if (!ghosts) return;
    for (const id of watch.dead) ghosts.handleDeath(id, 0, {});
    ghosts.startSpectating();
    const target = ghosts.spectateTargetPlayer;
    if (target) this.spectate.follow(target.sprite);
  }

  /** The run so far, for stats and achievements. */
  private runSnapshot(): RunSnapshot {
    const { run } = this;
    return {
      score: run.score,
      distance: Math.floor(this.getDistance()),
      level: run.currentLevel,
      combo: run.maxCombo,
      apples: run.applesCollected,
      beers: run.beersCollected,
      pills: run.pillsCollected,
      nearMisses: run.nearMisses,
      dashThroughs: run.dashThroughs,
      wallsBroken: run.wallsBroken,
      kills: run.kills,
      seconds: Math.floor(run.activePlayTime / 1000),
      daily: this.daily !== undefined,
    };
  }

  private beginRunning(): void {
    this.run.isCountingDown = false;
    this.player.startRunning();
    this.run.activePlayTime = 0;
    // The agreed moment, not this frame: a frame can land well after it on a slow machine
    this.clock.start(this.countdown.endsAt);
    this.run.lastScoreTime = this.time.now;
    this.session.startPositionBroadcast();
  }

  private updateDead(): void {
    this.lessons.dismiss();
    this.tutorial?.dismiss();
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
    // A throw here would stop Phaser's loop for good (the next frame is only asked for after this one returns): a
    // fight's bug costs that frame, never the game
    try {
      fight.update(this.game.loop.delta);
    } catch (error) {
      console.error(`${fight.id} fight update failed`, error);
    }
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

    this.gameInput.handleRunKeys(this.ammoView());
    player.carryPistol(this.run.abilities.canShootInRun);
    this.runGun.update(this.game.loop.delta);
    this.lessons.update();
    this.tutorial?.update(this.run.activePlayTime);
    player.updateDash();
    player.updatePill();
    this.magnet.update();
    this.risk.update();

    this.session.sendEndedEffects();
    player.updateVisuals();
    // The ghost's clock is the one that moves the world: frame time actually simulated, so a run with hitches
    // doesn't fall behind a ghost that ran smoothly, or the other way round
    this.raceTime += this.game.loop.delta;
    this.runTrack.sample(this.raceTime, player.x, player.currentFloor);
    this.bestGhost?.update(this.raceTime, player.x);
    // Achievements the run earns as it goes: a distance, a level, a combo pop up the moment they're reached
    if (this.time.now >= this.nextAchievementCheck) {
      this.nextAchievementCheck = this.time.now + ACHIEVEMENT_CHECK_MS;
      for (const earned of awardDuringRun(this.runSnapshot())) showAchievement(this, earned);
    }
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

  /**
   * Killed by an obstacle. Solo, everything holds for a moment first with the culprit blinking, so you see what hit you
   * (the boss fights do the same). A match reports the death at once, as everyone else's run goes on: there the
   * culprit blinks over the death sequence instead.
   */
  private killedBy(obstacleType: string | null | undefined, culprit?: Phaser.Physics.Arcade.Sprite): void {
    if (this.run.isDead) return;
    if (culprit) {
      // What to show as the culprit: itself, or what it stands for (the bulb, for the light that floods its lane)
      const shown = (culprit.getData('shows') as Phaser.Physics.Arcade.Sprite | undefined) ?? culprit;
      // The impact lands with the hit; solo the world is about to stand still, so it plays on real time
      this.vfx.hitImpact(shown, !this.isMultiplayer);
      // On the wall clock: the world (and in a match the death's slow-motion) must not hold the blink up
      const blink = window.setInterval(() => {
        if (shown.active) shown.setAlpha(shown.alpha < 1 ? 1 : 0.2);
      }, HIT_BLINK_MS);
      window.setTimeout(() => {
        window.clearInterval(blink);
        if (shown.active) shown.setAlpha(1);
      }, HIT_STOP_MS);
    }
    if (this.isMultiplayer || !culprit) {
      this.gameOverHandler.die(obstacleType);
      return;
    }
    // The run is over from the hit: no input, no pause, no score; the enemies' clock stops with the world
    this.run.isDead = true;
    this.clock.pause();
    this.physics.pause();
    this.anims.pauseAll();
    this.tweens.pauseAll();
    window.setTimeout(() => {
      if (!this.sys.isActive()) return;
      this.physics.resume();
      this.anims.resumeAll();
      this.tweens.resumeAll();
      this.gameOverHandler.die(obstacleType);
    }, HIT_STOP_MS);
  }

  /** A hit that would kill: the wylinka takes it instead, once. Only a solo run has one (see Abilities). */
  private absorbHit(): boolean {
    // The lesson's obstacle can't hurt; a boss that arrives while the lesson is still up can
    if (!this.boss.isActive && this.tutorial?.absorbHit()) return true;
    if (!this.run.abilities.consumeMoult()) return false;
    this.player.moult();
    return true;
  }

  /** The run's magazine as the HUD and the gun button show it. */
  private ammoView(): { count: number; max: number; dry: boolean } {
    return { count: this.runGun.ammo.count, max: this.runGun.ammo.max, dry: this.time.now < this.runGun.dryUntil };
  }

  private updateHud(distance: number): void {
    const { abilities } = this.run;
    this.hud.update({
      score: this.run.score,
      distance,
      speedMultiplier: this.player.speedMultiplier,
      currentFloor: this.player.currentFloor,
      pickupCombo: this.run.pickupCombo,
      comboMultiplier: comboMultiplier(this.run.pickupCombo),
      timeNow: this.time.now,
      abilities: {
        dash: abilities.canDash,
        dashCharge: this.player.dashCharge,
        gun: abilities.canShoot,
        ammo: abilities.canShootInRun ? this.ammoView() : undefined,
        moult: abilities.has('moult'),
        moultReady: abilities.moultCharges > 0,
      },
    });
  }

  private updateFloors(): void {
    const { player, run } = this;
    const ghostManager = this.session.ghostManager;
    let trackX = player.x;
    let trackFloor = player.currentFloor;
    // A boss holds the roach in place: the ledge it braked on and stands on stays, and nothing crumbles until it runs on
    let shouldTrack = !run.isCountingDown && !run.isDead && !this.boss.isActive;

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
      (comboLost) => { this.score.loseCombo(comboLost); this.taunts.comboLost(comboLost); },
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
