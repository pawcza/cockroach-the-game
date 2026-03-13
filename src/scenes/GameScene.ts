import Phaser from 'phaser';
import {
  FLOOR_BOTTOM_Y,
  FLOOR_TOP_Y,
  COCKROACH_START_X,
  COCKROACH_BASE_SPEED,
  SPEED_BOOST_PER_LEVEL,
  DEPTH,
} from '../config/constants';
import { popupStyle } from '../utils/TextStyles';
import { ObstacleSpawner } from '../objects/ObstacleSpawner';
import { SeededRNG } from '../multiplayer/SeededRNG';
import { mpClient, MPPlayer } from '../multiplayer/MultiplayerClient';
import { GhostManager } from '../multiplayer/GhostManager';
import { VisualEffects } from '../effects/VisualEffects';
import { AudioManager } from '../audio/AudioManager';
import { LEVELS, getLevelForDistance, LevelConfig } from '../config/levels';
import { GameHUD, HUDUpdateData } from '../ui/GameHUD';
import { TouchControls } from '../ui/TouchControls';
import { Player, Floor } from '../objects/Player';
import { FloorManager } from '../systems/FloorManager';
import { SpawnManager } from '../systems/SpawnManager';
import { CollisionManager } from '../systems/CollisionManager';
import { PauseManager } from '../systems/PauseManager';
import { GameOverHandler } from '../systems/GameOverHandler';

export class GameScene extends Phaser.Scene {
  // Floor positions
  public floorBottomY = FLOOR_BOTTOM_Y;
  public floorTopY = FLOOR_TOP_Y;

  // Player
  private player!: Player;
  private _isDead = false;

  // Exposed for ObstacleSpawner
  public get cockroach(): Phaser.Physics.Arcade.Sprite { return this.player.sprite; }
  public get isDead(): boolean { return this._isDead; }
  private set isDead(val: boolean) { this._isDead = val; }

  // Multiplayer RNG
  private rng: SeededRNG | null = null;

  // Multiplayer
  private isMultiplayer = false;
  private ghostManager: GhostManager | null = null;
  private _wasDashing = false;
  private _wasPillActive = false;

  // Level progression
  private currentLevel = 0;

  // Backgrounds (current + next for crossfade)
  private skyBg!: Phaser.GameObjects.TileSprite;
  private midBg!: Phaser.GameObjects.TileSprite;
  private fgBg!: Phaser.GameObjects.TileSprite;
  private nextSkyBg!: Phaser.GameObjects.TileSprite;
  private nextMidBg!: Phaser.GameObjects.TileSprite;
  private nextFgBg!: Phaser.GameObjects.TileSprite;
  private bgTransitioning = false;

  // Physics groups
  private obstacles!: Phaser.Physics.Arcade.Group;
  private apples!: Phaser.Physics.Arcade.Group;
  private tyskies!: Phaser.Physics.Arcade.Group;
  private pills!: Phaser.Physics.Arcade.Group;

  // Systems
  private obstacleSpawner!: ObstacleSpawner;
  private vfx!: VisualEffects;
  private audio!: AudioManager;
  private hud!: GameHUD;
  private touchControls!: TouchControls;
  private floorManager!: FloorManager;
  private spawnManager!: SpawnManager;
  private collisionManager!: CollisionManager;
  private pauseManager!: PauseManager;
  private gameOverHandler!: GameOverHandler;

  // Scoring
  private score = 0;
  private startTime = 0;
  private activePlayTime = 0;
  private lastFrameTime = 0;
  private lastScoreTime = 0;

  // Spawning
  private nextSpawnX = 0;

  // Input
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private ctrlKey!: Phaser.Input.Keyboard.Key;
  private shiftKey!: Phaser.Input.Keyboard.Key;
  private rightKey!: Phaser.Input.Keyboard.Key;
  private escKey!: Phaser.Input.Keyboard.Key;

  // Countdown
  private isCountingDown = true;
  private countdownStartReal = 0;
  private countdownLastShown = -1;

  // Dust trail
  private dustTimer = 0;

  // Bird overlook
  private birdOverlookTimer = 0;
  private nextBirdOverlookTime = 0;

  // Cockroach ambient noise
  private cockroachNoiseTimer = 0;
  private nextNoiseTime = 0;
  private cockroachNoiseSound: Phaser.Sound.BaseSound | null = null;

  // Pickup combo
  private pickupCombo = 0;

  // Mobile detection (input only — not scaling)
  private isMobile = false;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    const data = this.scene.settings.data as {
      multiplayer?: boolean;
      seed?: number;
      players?: MPPlayer[];
      myId?: string;
    } | undefined;

    this.isMultiplayer = data?.multiplayer ?? false;
    this.rng = (this.isMultiplayer && data?.seed != null) ? new SeededRNG(data.seed) : null;

    // Reset state
    this.ghostManager = null;
    this._wasDashing = false;
    this._wasPillActive = false;
    this.score = 0;
    this.isDead = false;
    this.nextSpawnX = COCKROACH_START_X + 400;
    this.startTime = this.time.now;
    this.activePlayTime = 0;
    this.lastFrameTime = this.time.now;
    this.lastScoreTime = this.time.now;
    this.dustTimer = 0;
    this.birdOverlookTimer = 0;
    this.nextBirdOverlookTime = 15000 + Math.random() * 10000;
    this.cockroachNoiseTimer = 0;
    this.nextNoiseTime = 20000 + Math.random() * 15000;
    this.pickupCombo = 0;
    this.currentLevel = 1;
    this.isCountingDown = true;
    this.bgTransitioning = false;

    const w = this.cameras.main.width;
    const h = this.cameras.main.height;
    this.isMobile = !this.sys.game.device.os.desktop;
    this.floorBottomY = FLOOR_BOTTOM_Y;
    this.floorTopY = FLOOR_TOP_Y;

    // Parallax backgrounds
    this.skyBg = this.add.tileSprite(0, 0, w, h, 'lv1-sky').setOrigin(0, 0).setScrollFactor(0).setAlpha(0.8);
    this.midBg = this.add.tileSprite(0, 0, w, h, 'lv1-bg').setOrigin(0, 0).setScrollFactor(0)
      .setDepth(DEPTH.MID_BG).setAlpha(0.15).setBlendMode(Phaser.BlendModes.SOFT_LIGHT);
    this.fgBg = this.add.tileSprite(0, 0, w, h, 'lv1-fg').setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.FG_BG);

    this.nextSkyBg = this.add.tileSprite(0, 0, w, h, 'lv1-sky').setOrigin(0, 0).setScrollFactor(0).setAlpha(0);
    this.nextMidBg = this.add.tileSprite(0, 0, w, h, 'lv1-bg').setOrigin(0, 0).setScrollFactor(0)
      .setDepth(DEPTH.MID_BG).setAlpha(0).setBlendMode(Phaser.BlendModes.SOFT_LIGHT);
    this.nextFgBg = this.add.tileSprite(0, 0, w, h, 'lv1-fg').setOrigin(0, 0).setScrollFactor(0)
      .setDepth(DEPTH.FG_BG).setAlpha(0);

    // Floor manager
    this.floorManager = new FloorManager(this, this.floorTopY, this.floorBottomY);
    this.floorManager.create(w);

    // Audio (created before Player since Player needs it)
    this.audio = new AudioManager(this);

    // Player
    this.player = new Player(this, this.audio, this.floorManager.topColliderY, this.floorManager.bottomColliderY);
    this.player.create();
    this.player.resetState();

    // Physics groups
    this.obstacles = this.physics.add.group();
    this.data.set('obstacles', this.obstacles);
    this.apples = this.physics.add.group();
    this.tyskies = this.physics.add.group();
    this.pills = this.physics.add.group();

    // Obstacle spawner
    this.obstacleSpawner = new ObstacleSpawner(this, this.obstacles);
    if (this.rng) this.obstacleSpawner.setRNG(this.rng);

    // Visual effects
    this.vfx = new VisualEffects(this);
    this.vfx.init();

    // HUD
    this.hud = new GameHUD(this, () => {
      if (this.isDead || this.isCountingDown) return;
      this.pauseManager.toggle(
        () => this.lastFrameTime,
        (t) => { this.lastFrameTime = t; },
      );
    });
    this.hud.create();

    // Collision manager
    this.collisionManager = new CollisionManager(this, this.player, this.vfx, this.audio, {
      getScore: () => this.score,
      addScore: (points) => { this.score += points; this.hud.updateScore(this.score); },
      getPickupCombo: () => this.pickupCombo,
      incrementCombo: () => { this.pickupCombo++; },
      getComboMultiplier: () => this.getComboMultiplier(),
      isMultiplayer: this.isMultiplayer,
      onDie: (obstacleType) => this.gameOverHandler.die(obstacleType),
    });
    this.collisionManager.setupFloorColliders(this.floorManager.topBody, this.floorManager.bottomBody);
    this.collisionManager.setupOverlaps(this.apples, this.tyskies, this.pills, this.obstacles);

    // Spawn manager
    this.spawnManager = new SpawnManager(
      this, this.obstacles, this.apples, this.tyskies, this.pills,
      this.obstacleSpawner, this.rng, this.floorTopY, this.floorBottomY,
    );

    // Pause manager
    this.pauseManager = new PauseManager(this, this.hud, this.isMultiplayer);

    // Game over handler
    this.gameOverHandler = new GameOverHandler(this, this.player, this.vfx, this.audio, this.hud, this.isMultiplayer, {
      getScore: () => this.score,
      getActivePlayTime: () => this.activePlayTime,
      getDistance: () => this.getDistance(),
      getCurrentLevel: () => this.currentLevel,
      getGhostManager: () => this.ghostManager,
      setGhostManager: (gm) => { this.ghostManager = gm; },
      setIsDead: () => { this.isDead = true; },
      followSpectateTarget: (sprite) => this.followSpectateTarget(sprite),
    });

    // Ghost manager for multiplayer
    if (this.isMultiplayer && data?.players && data?.myId) {
      this.ghostManager = new GhostManager(
        this, data.players, data.myId,
        this.floorManager.topColliderY, this.floorManager.bottomColliderY,
        COCKROACH_START_X,
      );
      this.setupMultiplayerListeners();
    }

    // Touch controls
    this.touchControls = new TouchControls(this, this.isMobile, {
      onSwap: () => {
        this.player.swapLane();
        if (this.isMultiplayer) mpClient.sendSwap(this.player.currentFloor);
      },
      onDash: () => {
        this.player.startDash();
        if (this.isMultiplayer) mpClient.sendDashStart();
      },
      isDisabled: () => this.isDead || this.pauseManager.isPaused || this.isCountingDown || this.pauseManager.isUnpauseCountdown,
      isDashAllowed: () => this.player.dashReady && !this.player.isDashing,
    });
    this.touchControls.create();

    // Input
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.ctrlKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL);
    this.shiftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.rightKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    // Pointer handler for lane swap (desktop only — mobile uses button)
    if (!this.isMobile) {
      this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (this.isDead || this.pauseManager.isPaused || this.isCountingDown || this.pauseManager.isUnpauseCountdown) return;

        const pauseBtn = this.hud.pauseButton;
        const pauseDist = Phaser.Math.Distance.Between(pointer.x, pointer.y, pauseBtn.x, pauseBtn.y);
        if (pauseDist <= pauseBtn.radius) return;

        this.player.swapLane();
        if (this.isMultiplayer) mpClient.sendSwap(this.player.currentFloor);
      });
    }

    // Camera
    this.cameras.main.startFollow(this.player.sprite, true, 1, 0);
    this.cameras.main.setFollowOffset(-200, 0);
    this.cameras.main.scrollY = 0;

    // Audio start BGM
    this.audio.startBGM('bgm-lv1');

    // Starting invulnerability
    const blinkTween = this.player.startInvulnerabilityBlink();
    this.time.delayedCall(1500, () => { this.player.endInvulnerability(blinkTween); });

    // Countdown before game starts
    this.player.freezeForCountdown();
    this.countdownStartReal = performance.now();
    this.countdownLastShown = -1;
  }

  private updateCountdown(): void {
    const elapsed = performance.now() - this.countdownStartReal;
    const countdownTexts = ['3', '2', '1', 'JAZDA!'];
    const step = Math.floor(elapsed / 600);

    if (step < countdownTexts.length && step > this.countdownLastShown) {
      this.countdownLastShown = step;
      const text = countdownTexts[step];
      const countText = this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2 - 30, text,
        popupStyle({ fontSize: text === 'JAZDA!' ? '24px' : '32px', color: text === 'JAZDA!' ? '#00ff00' : '#ffffff', strokeThickness: 6 }),
      );
      countText.setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.COUNTDOWN);
      this.tweens.add({
        targets: countText,
        scale: { from: 2, to: 0.5 },
        alpha: { from: 1, to: 0 },
        duration: 500,
        ease: 'Power2',
        onComplete: () => countText.destroy(),
      });
    }

    if (elapsed >= countdownTexts.length * 600) {
      this.isCountingDown = false;
      this.player.startRunning();
      this.startTime = this.time.now;
      this.lastFrameTime = this.time.now;
      this.activePlayTime = 0;
      this.lastScoreTime = this.time.now;
    }
  }

  update(): void {
    if (this.isDead) {
      // Keep ghosts moving even before spectating starts
      if (this.isMultiplayer && this.ghostManager) {
        this.ghostManager.update(
          this.game.loop.delta,
          this.cameras.main.scrollX,
          this.cameras.main.width,
          this.cameras.main.height,
        );
      }

      if (this.isMultiplayer && this.ghostManager?.isSpectating) {
        const target = this.ghostManager.spectateTargetPlayer;

        // Cycle spectate target with arrow keys
        if (Phaser.Input.Keyboard.JustDown(this.cursors.left) ||
            Phaser.Input.Keyboard.JustDown(this.cursors.up)) {
          const newTarget = this.ghostManager.cycleSpectate(-1);
          if (newTarget) this.followSpectateTarget(newTarget.sprite);
        }
        if (Phaser.Input.Keyboard.JustDown(this.cursors.right) ||
            Phaser.Input.Keyboard.JustDown(this.cursors.down)) {
          const newTarget = this.ghostManager.cycleSpectate(1);
          if (newTarget) this.followSpectateTarget(newTarget.sprite);
        }

        // Update level and milestones based on spectated player
        if (target && target.alive) {
          const ghostDistance = Math.floor((target.sprite.x - COCKROACH_START_X) / 50);
          const newLevelConfig = getLevelForDistance(ghostDistance);
          if (newLevelConfig.level !== this.currentLevel) {
            this.currentLevel = newLevelConfig.level;
            this.switchLevel(newLevelConfig);
          }
          this.gameOverHandler.checkSpectatedMilestones(target.liveScore);
        }

        this.updateParallax();
        this.updateFloors();
        this.spawnManager.handleSpawning(this.cameras.main.scrollX + this.cameras.main.width);
        this.spawnManager.cleanupOffscreen(this.cameras.main.scrollX - 200, () => { this.pickupCombo = 0; });

        if (target && !target.alive) {
          const next = this.ghostManager.cycleSpectate(1);
          if (next) {
            this.followSpectateTarget(next.sprite);
          } else if (this.ghostManager.allDead()) {
            this.gameOverHandler.triggerMultiplayerGameOver();
          }
        }
      }
      return;
    }

    if (this.isCountingDown) {
      this.player.freezeForCountdown();
      this.updateCountdown();
      this.updateFloors();
      this.spawnManager.handleSpawning(this.cameras.main.scrollX + this.cameras.main.width);
      this.updateParallax();
      return;
    }

    // Pause toggle
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.pauseManager.toggle(
        () => this.lastFrameTime,
        (t) => { this.lastFrameTime = t; },
      );
    }
    if (this.pauseManager.isPaused) {
      const keys = this.input.keyboard!.keys;
      if (this.pauseManager.handlePausedInput(keys, Phaser.Input.Keyboard.KeyCodes.ESC, () => {
        this.pauseManager.toggle(
          () => this.lastFrameTime,
          (t) => { this.lastFrameTime = t; },
        );
      })) {
        this.lastFrameTime = this.time.now;
        return;
      }
      this.lastFrameTime = this.time.now;
      return;
    }

    // Accumulate active play time
    this.activePlayTime += this.time.now - this.lastFrameTime;
    this.lastFrameTime = this.time.now;

    // Update player
    this.player.updateSpeed(this.activePlayTime, this.currentLevel);

    // Dust trail particles
    this.dustTimer += this.game.loop.delta;
    const dustInterval = Math.max(100, 300 / this.player.speedMultiplier);
    const onGroundForDust = this.player.sprite.body!.touching.down || this.player.sprite.body!.blocked.down;
    if (this.dustTimer >= dustInterval && onGroundForDust) {
      this.dustTimer = 0;
      this.spawnDustParticle();
    } else if (this.dustTimer >= dustInterval) {
      this.dustTimer = 0;
    }

    this.updateParallax();
    this.updateFloors();

    // Off-screen death
    if (this.player.y > this.cameras.main.height + 50 || this.player.y < -100) {
      this.gameOverHandler.die();
      return;
    }

    // Input — lane swap
    const jumpPressed = Phaser.Input.Keyboard.JustDown(this.spaceKey) || Phaser.Input.Keyboard.JustDown(this.cursors.up);
    const dropPressed = Phaser.Input.Keyboard.JustDown(this.ctrlKey) || Phaser.Input.Keyboard.JustDown(this.cursors.down);
    if (jumpPressed || dropPressed) {
      this.player.swapLane();
      if (this.isMultiplayer) mpClient.sendSwap(this.player.currentFloor);
    }

    // Input — dash
    const dashPressed = Phaser.Input.Keyboard.JustDown(this.shiftKey) || Phaser.Input.Keyboard.JustDown(this.rightKey);
    if (dashPressed && this.player.dashReady && !this.player.isDashing) {
      this.player.startDash();
      if (this.isMultiplayer) mpClient.sendDashStart();
    }

    // Update dash and pill state machines
    this.player.updateDash();
    this.player.updatePill();

    // Multiplayer sync
    if (this.isMultiplayer && this._wasDashing && !this.player.isDashing) mpClient.sendDashEnd();
    this._wasDashing = this.player.isDashing;
    if (this.isMultiplayer && this._wasPillActive && !this.player.isPillActive) mpClient.sendPillEnd();
    this._wasPillActive = this.player.isPillActive;
    this.player.updateVisuals();

    // Survival score (+1 per second)
    if (this.time.now - this.lastScoreTime >= 1000) {
      this.score += 1;
      this.lastScoreTime = this.time.now;
    }

    // Score milestones
    this.gameOverHandler.checkMilestones(this.score);

    // Level progression
    const distance = this.getDistance();
    const newLevelConfig = getLevelForDistance(distance);
    if (newLevelConfig.level !== this.currentLevel) {
      this.currentLevel = newLevelConfig.level;
      this.switchLevel(newLevelConfig);
    }

    // Update HUD
    const hudData: HUDUpdateData = {
      score: this.score,
      distance,
      speedMultiplier: this.player.speedMultiplier,
      currentFloor: this.player.currentFloor,
      pickupCombo: this.pickupCombo,
      comboMultiplier: this.getComboMultiplier(),
      timeNow: this.time.now,
    };
    this.hud.update(hudData);

    // Spawning & cleanup
    const cameraRight = this.cameras.main.scrollX + this.cameras.main.width;
    this.spawnManager.handleSpawning(cameraRight);
    this.spawnManager.showObstacleWarnings(cameraRight, this.player.currentFloor);
    this.spawnManager.cleanupOffscreen(this.cameras.main.scrollX - 200, () => { this.pickupCombo = 0; });

    // Visual effects & audio
    this.vfx.update(this.player.speedMultiplier);
    this.audio.updatePitch(this.player.speedMultiplier * this.player.pillSpeedBoost);

    // Bird overlook
    this.birdOverlookTimer += this.game.loop.delta;
    if (this.birdOverlookTimer >= this.nextBirdOverlookTime) {
      this.birdOverlookTimer = 0;
      this.nextBirdOverlookTime = 15000 + Math.random() * 10000;
      this.spawnBirdOverlook();
    }

    // Cockroach ambient noise
    this.cockroachNoiseTimer += this.game.loop.delta;
    if (this.cockroachNoiseTimer >= this.nextNoiseTime) {
      this.cockroachNoiseTimer = 0;
      this.nextNoiseTime = 20000 + Math.random() * 15000;
      if (!this.cockroachNoiseSound || !this.cockroachNoiseSound.isPlaying) {
        this.cockroachNoiseSound = this.sound.add('cockroach-noise', { volume: 0.3 });
        this.cockroachNoiseSound.play();
      }
    }

    // Ghost manager update
    if (this.ghostManager) {
      this.ghostManager.update(
        this.game.loop.delta,
        this.cameras.main.scrollX,
        this.cameras.main.width,
        this.cameras.main.height,
      );
    }
  }

  private setupMultiplayerListeners(): void {
    mpClient.on('game:swap', (data: any) => { this.ghostManager?.handleSwap(data.id, data.lane); });
    mpClient.on('game:dash-start', (data: any) => { this.ghostManager?.handleDashStart(data.id); });
    mpClient.on('game:dash-end', (data: any) => { this.ghostManager?.handleDashEnd(data.id); });
    mpClient.on('game:pill-start', (data: any) => { this.ghostManager?.handlePillStart(data.id); });
    mpClient.on('game:pill-end', (data: any) => { this.ghostManager?.handlePillEnd(data.id); });

    mpClient.on('game:pickup', (data: any) => {
      if (data.id && data.score != null) {
        this.ghostManager?.updateGhostScore(data.id, data.score);
      }
      if (this.isDead) {
        this.spawnManager.queuePickupDestruction(data.x);
      }
    });

    this.gameOverHandler.setupMultiplayerListeners(() => this.isDead);

    this.events.on('shutdown', () => {
      if (this.isMultiplayer) {
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
      this.ghostManager?.destroy();
      this.ghostManager = null;
    });
  }

  private followSpectateTarget(sprite: Phaser.GameObjects.Sprite): void {
    this.cameras.main.stopFollow();
    this.cameras.main.scrollX = sprite.x - 200;
    this.cameras.main.startFollow(sprite, true, 1, 0);
    this.cameras.main.setFollowOffset(-200, 0);
  }

  private getComboMultiplier(): number {
    return 1 + this.pickupCombo * 0.025;
  }

  private getDistance(): number {
    return Math.floor((this.player.x - COCKROACH_START_X) / 50);
  }

  private switchLevel(config: LevelConfig): void {
    this.nextSkyBg.setTexture(config.skyKey);
    this.nextMidBg.setTexture(config.bgKey);
    this.nextFgBg.setTexture(config.fgKey);
    this.nextFgBg.setDepth(DEPTH.FG_BG);
    this.bgTransitioning = true;

    const fadeDuration = 3000;
    this.tweens.add({ targets: this.nextSkyBg, alpha: 0.8, duration: fadeDuration, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: this.nextMidBg, alpha: 0.15, duration: fadeDuration, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: this.nextFgBg, alpha: 1, duration: fadeDuration, ease: 'Sine.easeInOut' });

    this.tweens.add({ targets: this.skyBg, alpha: 0, duration: fadeDuration, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: this.midBg, alpha: 0, duration: fadeDuration, ease: 'Sine.easeInOut' });
    this.tweens.add({
      targets: this.fgBg, alpha: 0, duration: fadeDuration, ease: 'Sine.easeInOut',
      onComplete: () => {
        this.skyBg.setTexture(config.skyKey).setAlpha(0.8);
        this.midBg.setTexture(config.bgKey).setAlpha(0.15);
        this.fgBg.setTexture(config.fgKey).setAlpha(1);
        this.fgBg.setDepth(DEPTH.FG_BG);
        this.nextSkyBg.setAlpha(0);
        this.nextMidBg.setAlpha(0);
        this.nextFgBg.setAlpha(0);
        this.bgTransitioning = false;
      },
    });

    this.audio.switchBGM(config.bgmKey);
    this.hud.showLevelAnnouncement(config);
  }

  private updateParallax(): void {
    const breatheFactor = this.data.get('breatheFactor') ?? 1.0;
    const scrollX = this.cameras.main.scrollX;
    this.skyBg.tilePositionX = scrollX * 0.1 * breatheFactor;
    this.midBg.tilePositionX = scrollX * 0.4 * breatheFactor;
    this.fgBg.tilePositionX = scrollX * 0.7 * breatheFactor;

    if (this.bgTransitioning) {
      this.nextSkyBg.tilePositionX = scrollX * 0.1 * breatheFactor;
      this.nextMidBg.tilePositionX = scrollX * 0.4 * breatheFactor;
      this.nextFgBg.tilePositionX = scrollX * 0.7 * breatheFactor;
    }

    const targetZoom = Math.max(0.88, 1 - Math.max(this.player.speedMultiplier - 5, 0) * 0.02);
    this.cameras.main.zoom = Phaser.Math.Linear(this.cameras.main.zoom, targetZoom, 0.02);

    const darkening = Math.min(Math.max(this.player.speedMultiplier - 3.5, 0) * 0.08, 0.5);
    if (darkening > 0) {
      this.skyBg.setTint(
        Phaser.Display.Color.GetColor(
          Math.floor(255 * (1 - darkening)),
          Math.floor(255 * (1 - darkening * 0.8)),
          Math.floor(255 * (1 - darkening * 0.3)),
        ),
      );
    }

    this.cameras.main.scrollY = 0;
  }

  private updateFloors(): void {
    let trackX: number;
    let trackFloor: 'top' | 'bottom';
    let shouldTrack: boolean;

    if (this.isDead && this.isMultiplayer && this.ghostManager?.isSpectating) {
      const target = this.ghostManager.spectateTargetPlayer;
      if (target && target.alive) {
        trackX = target.sprite.x;
        trackFloor = target.lane as 'top' | 'bottom';
        shouldTrack = true;
      } else {
        shouldTrack = false;
        trackX = 0;
        trackFloor = 'bottom';
      }
    } else {
      trackX = this.player.x;
      trackFloor = this.player.currentFloor;
      shouldTrack = !this.isCountingDown && !this.isDead;
    }

    this.floorManager.update(
      this.cameras.main.scrollX,
      trackX, trackFloor, shouldTrack,
      this.player.currentFloor,
      this.time.now,
    );
  }

  private spawnDustParticle(): void {
    const dust = this.add.circle(
      this.player.x - 20,
      this.player.y + 10,
      2 + Math.random() * 2,
      0x8b7355,
      0.6,
    );
    this.tweens.add({
      targets: dust,
      y: dust.y - 15,
      alpha: 0,
      scaleX: 0.3,
      scaleY: 0.3,
      duration: 400,
      onComplete: () => { dust.destroy(); },
    });
  }

  private spawnBirdOverlook(): void {
    const corners = [
      { x: 60, y: this.cameras.main.height - 60, flipX: false, flipY: false },
      { x: this.cameras.main.width - 60, y: this.cameras.main.height - 60, flipX: true, flipY: false },
      { x: 60, y: 60, flipX: false, flipY: true },
      { x: this.cameras.main.width - 60, y: 60, flipX: true, flipY: true },
    ];
    const corner = corners[Math.floor(Math.random() * corners.length)];

    const birdImg = this.add.image(corner.x, corner.y, 'bird-overlook');
    birdImg.setScrollFactor(0).setDepth(DEPTH.BIRD_OVERLOOK).setScale(0.4).setAlpha(0);
    birdImg.setFlipX(corner.flipX).setFlipY(corner.flipY);

    this.sound.play('huh', { volume: 0.5 });

    this.tweens.add({
      targets: birdImg,
      alpha: 1,
      duration: 300,
      hold: 1500,
      yoyo: true,
      onComplete: () => birdImg.destroy(),
    });
  }
}
