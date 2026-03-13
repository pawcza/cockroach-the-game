import Phaser from 'phaser';
import {
  FLOOR_BOTTOM_Y,
  FLOOR_TOP_Y,
  COCKROACH_START_X,
  COCKROACH_BASE_SPEED,
  SPAWN_DISTANCE_AHEAD,
  MIN_OBSTACLE_SPACING,
  SPEED_BOOST_PER_LEVEL,
} from '../config/constants';

import { ObstacleSpawner } from '../objects/ObstacleSpawner';
import { SeededRNG } from '../multiplayer/SeededRNG';
import { mpClient, MPPlayer } from '../multiplayer/MultiplayerClient';
import { GhostManager } from '../multiplayer/GhostManager';
import { VisualEffects } from '../effects/VisualEffects';
import { AudioManager } from '../audio/AudioManager';
import { getLevelForDistance, LevelConfig } from '../config/levels';
import { GameHUD, HUDUpdateData } from '../ui/GameHUD';
import { TouchControls } from '../ui/TouchControls';
import { Player } from '../objects/Player';

// Systems
import { ParallaxManager } from '../systems/ParallaxManager';
import { FloorManager } from '../systems/FloorManager';
import { PickupSpawner } from '../systems/PickupSpawner';
import { AmbientEffects } from '../systems/AmbientEffects';
import { CountdownManager } from '../systems/CountdownManager';
import { MultiplayerHandler } from '../systems/MultiplayerHandler';
import { ScoreManager } from '../systems/ScoreManager';

export class GameScene extends Phaser.Scene {
  // Floor positions (dynamic on mobile, constant on desktop)
  public floorBottomY = FLOOR_BOTTOM_Y;
  public floorTopY = FLOOR_TOP_Y;

  // Player
  private player!: Player;
  private _isDead = false;

  // Exposed for ObstacleSpawner (accessed via GameSceneAccessor interface cast)
  public get cockroach(): Phaser.Physics.Arcade.Sprite { return this.player.sprite; }
  public get isDead(): boolean { return this._isDead; }
  private set isDead(val: boolean) { this._isDead = val; }

  // Multiplayer RNG (null in solo mode)
  private rng: SeededRNG | null = null;

  // Multiplayer
  private isMultiplayer = false;
  private ghostManager: GhostManager | null = null;
  private multiplayerHandler: MultiplayerHandler | null = null;
  private mpMyName = '';
  private _wasDashing = false;
  private _wasPillActive = false;

  // Level progression
  private currentLevel = 0;

  // Groups
  private obstacles!: Phaser.Physics.Arcade.Group;
  private apples!: Phaser.Physics.Arcade.Group;
  private tyskies!: Phaser.Physics.Arcade.Group;
  private pills!: Phaser.Physics.Arcade.Group;

  // Core systems
  private obstacleSpawner!: ObstacleSpawner;
  private vfx!: VisualEffects;
  private audio!: AudioManager;
  private hud!: GameHUD;
  private touchControls!: TouchControls;

  // Extracted subsystems
  private parallaxManager!: ParallaxManager;
  private floorManager!: FloorManager;
  private pickupSpawner!: PickupSpawner;
  private ambientEffects!: AmbientEffects;
  private countdownManager!: CountdownManager;
  private scoreManager!: ScoreManager;

  // Timing
  private startTime = 0;
  private activePlayTime = 0;
  private lastFrameTime = 0;

  // Speed
  private lastMilestone = 1;

  // Spawning (position-based)
  private nextSpawnX = 0;

  // Input
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private ctrlKey!: Phaser.Input.Keyboard.Key;
  private shiftKey!: Phaser.Input.Keyboard.Key;
  private rightKey!: Phaser.Input.Keyboard.Key;
  private escKey!: Phaser.Input.Keyboard.Key;

  // Pause
  private isPaused = false;
  private isUnpauseCountdown = false;

  // Countdown
  private isCountingDown = true;

  // Mobile detection
  private isMobile = false;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    // Read multiplayer config from scene data
    const data = this.scene.settings.data as {
      multiplayer?: boolean;
      seed?: number;
      players?: MPPlayer[];
      myId?: string;
    } | undefined;

    this.isMultiplayer = data?.multiplayer ?? false;

    if (this.isMultiplayer && data?.seed != null) {
      this.rng = new SeededRNG(data.seed);
    } else {
      this.rng = null;
    }

    // Reset multiplayer state
    this.ghostManager = null;
    this.multiplayerHandler = null;
    this.mpMyName = localStorage.getItem('cockroach-mp-name') || 'Karaluch';
    this._wasDashing = false;
    this._wasPillActive = false;
    this.deathNotificationY = 80;

    // Reset ALL state
    this.isDead = false;
    this.nextSpawnX = COCKROACH_START_X + 400;
    this.startTime = this.time.now;
    this.activePlayTime = 0;
    this.lastFrameTime = this.time.now;
    this.lastMilestone = 0;
    this.isCountingDown = true;
    this.isPaused = false;
    this.currentLevel = 1;

    // Screen dimensions
    const w = this.cameras.main.width;

    this.isMobile = !this.sys.game.device.os.desktop;
    this.floorBottomY = FLOOR_BOTTOM_Y;
    this.floorTopY = FLOOR_TOP_Y;

    // --- Subsystems ---

    // Parallax backgrounds
    this.parallaxManager = new ParallaxManager(this);
    this.parallaxManager.create();

    // Floor manager
    this.floorManager = new FloorManager(this, this.floorTopY, this.floorBottomY);
    this.floorManager.create();
    this.floorManager.resetCrumbleState();

    // Audio (created before Player since Player needs it)
    this.audio = new AudioManager(this);

    // Player
    const COLLIDER_DROP = 8;
    this.player = new Player(this, this.audio, this.floorTopY + COLLIDER_DROP, this.floorBottomY + COLLIDER_DROP);
    this.player.create();
    this.player.resetState();

    // Store obstacles group in scene data so Player.endDash can access it
    this.obstacles = this.physics.add.group();
    this.data.set('obstacles', this.obstacles);
    this.apples = this.physics.add.group();
    this.tyskies = this.physics.add.group();
    this.pills = this.physics.add.group();

    // Obstacle spawner
    this.obstacleSpawner = new ObstacleSpawner(this, this.obstacles);
    if (this.rng) {
      this.obstacleSpawner.setRNG(this.rng);
    }

    // Pickup spawner
    this.pickupSpawner = new PickupSpawner(
      this, this.apples, this.tyskies, this.pills,
      this.floorTopY, this.floorBottomY, this.rng,
    );

    // Score manager
    this.scoreManager = new ScoreManager(this);
    this.scoreManager.reset(this.time.now);

    // Ambient effects
    this.ambientEffects = new AmbientEffects(this);
    this.ambientEffects.reset();

    // Countdown manager
    this.countdownManager = new CountdownManager(this);

    // Floor colliders with process callbacks
    this.physics.add.collider(this.player.sprite, this.floorManager.floorTopBody, undefined, () => {
      return this.player.currentFloor === 'top';
    }, this);
    this.physics.add.collider(this.player.sprite, this.floorManager.floorBottomBody, undefined, () => {
      return this.player.currentFloor === 'bottom';
    }, this);

    // Create ghost manager for multiplayer
    if (this.isMultiplayer && data?.players && data?.myId) {
      this.ghostManager = new GhostManager(
        this,
        data.players,
        data.myId,
        this.floorTopY + COLLIDER_DROP,
        this.floorBottomY + COLLIDER_DROP,
        COCKROACH_START_X,
      );
      this.multiplayerHandler = new MultiplayerHandler(this, this.ghostManager, {
        onDeathNotification: (name, color, disconnected) => this.showDeathNotification(name, color, disconnected),
        onPickupDestroy: (x) => this.pickupSpawner.destroyPickupNear(x),
        onAllDead: () => this.triggerMultiplayerGameOver(),
        onGameOver: (data) => this.handleMpGameOver(data),
      });
      this.multiplayerHandler.setupListeners(() => this.isDead);
    }

    // Overlap detectors
    this.physics.add.overlap(
      this.player.sprite,
      this.apples,
      this.collectApple as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );
    this.physics.add.overlap(
      this.player.sprite,
      this.tyskies,
      this.collectTyskie as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );
    this.physics.add.overlap(
      this.player.sprite,
      this.pills,
      this.collectPill as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );
    this.physics.add.overlap(
      this.player.sprite,
      this.obstacles,
      this.hitObstacle as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      (_cockroach, obstacle) => {
        if (this.player.isDashing || this.player.isInvulnerable) return false;
        const obstacleFloor = (obstacle as Phaser.Physics.Arcade.Sprite).getData('floor');
        return !obstacleFloor || obstacleFloor === this.player.currentFloor;
      },
      this,
    );

    // Camera
    this.cameras.main.startFollow(this.player.sprite, true, 1, 0);
    this.cameras.main.setFollowOffset(-200, 0);
    this.cameras.main.scrollY = 0;

    // Input
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.ctrlKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL);
    this.shiftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.rightKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    // Visual effects
    this.vfx = new VisualEffects(this);
    this.vfx.init();

    // HUD
    this.hud = new GameHUD(this, this.isMobile, () => {
      if (this.isDead || this.isCountingDown) return;
      this.togglePause();
    });
    this.hud.create();

    // Touch controls
    this.touchControls = new TouchControls(this, this.isMobile, {
      onSwap: () => {
        this.player.swapLane();
        if (this.isMultiplayer) {
          mpClient.sendSwap(this.player.currentFloor);
        }
      },
      onDash: () => {
        this.player.startDash();
        if (this.isMultiplayer) {
          mpClient.sendDashStart();
        }
      },
      isDisabled: () => this.isDead || this.isPaused || this.isCountingDown || this.isUnpauseCountdown,
      isDashAllowed: () => this.player.dashReady && !this.player.isDashing,
    });
    this.touchControls.create();

    // Pointer handler for lane swap (desktop only -- mobile uses button)
    if (!this.isMobile) {
      this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (this.isDead || this.isPaused || this.isCountingDown || this.isUnpauseCountdown) return;

        // Ignore taps on dash button / pause button
        const dashBtn = this.touchControls.dashButton;
        const dbX = dashBtn.x - dashBtn.width / 2;
        const dbY = dashBtn.y - dashBtn.height / 2;
        if (pointer.x >= dbX && pointer.x <= dbX + dashBtn.width &&
            pointer.y >= dbY && pointer.y <= dbY + dashBtn.height) return;
        const pauseBtn = this.hud.pauseButton;
        const pauseDist = Phaser.Math.Distance.Between(pointer.x, pointer.y, pauseBtn.x, pauseBtn.y);
        if (pauseDist <= pauseBtn.radius) return;

        this.player.swapLane();
        if (this.isMultiplayer) {
          mpClient.sendSwap(this.player.currentFloor);
        }
      });
    }

    // Audio start BGM
    this.audio.startBGM('bgm-lv1');

    // Starting invulnerability blink tween
    const blinkTween = this.player.startInvulnerabilityBlink();

    // End invulnerability after 1500ms
    this.time.delayedCall(1500, () => {
      this.player.endInvulnerability(blinkTween);
    });

    // Countdown before game starts
    this.player.freezeForCountdown();
    this.countdownManager.startCountdown();
  }

  update(): void {
    if (this.isDead) {
      if (this.isMultiplayer && this.ghostManager?.isSpectating) {
        const target = this.ghostManager.spectateTargetPlayer;
        if (target && target.alive) {
          // Frame-rate independent smooth camera follow toward spectated player
          const targetScrollX = target.sprite.x - 200;
          const camFactor = 1 - Math.pow(1 - 0.25, this.game.loop.delta / 16.667);
          this.cameras.main.scrollX += (targetScrollX - this.cameras.main.scrollX) * camFactor;
        }

        // Allow cycling with left/right keys or taps
        if (Phaser.Input.Keyboard.JustDown(this.cursors.left) ||
            Phaser.Input.Keyboard.JustDown(this.cursors.up)) {
          this.ghostManager.cycleSpectate(-1);
        }
        if (Phaser.Input.Keyboard.JustDown(this.cursors.right) ||
            Phaser.Input.Keyboard.JustDown(this.cursors.down)) {
          this.ghostManager.cycleSpectate(1);
        }

        // Update level based on spectated player's position
        if (target && target.alive) {
          const ghostDistance = Math.floor((target.sprite.x - COCKROACH_START_X) / 50);
          const newLevelConfig = getLevelForDistance(ghostDistance);
          if (newLevelConfig.level !== this.currentLevel) {
            this.currentLevel = newLevelConfig.level;
            this.switchLevel(newLevelConfig);
          }
        }

        // Keep the world alive for spectating
        this.parallaxManager.update(this.player.speedMultiplier);
        this.updateFloorTracking();
        this.handleSpawning();
        this.cleanupOffscreen();

        // Update ghost manager
        this.ghostManager.update(
          this.game.loop.delta,
          this.cameras.main.scrollX,
          this.cameras.main.width,
          this.cameras.main.height,
        );

        // Check if spectate target died
        if (target && !target.alive) {
          const next = this.ghostManager.cycleSpectate(1);
          if (!next && this.ghostManager.allDead()) {
            this.triggerMultiplayerGameOver();
          }
        }
      }
      return;
    }

    if (this.isCountingDown) {
      this.player.freezeForCountdown();
      const done = this.countdownManager.updateCountdown();
      if (done) {
        this.isCountingDown = false;
        this.player.startRunning();
        this.startTime = this.time.now;
        this.lastFrameTime = this.time.now;
        this.activePlayTime = 0;
        this.scoreManager.reset(this.time.now);
      }
      this.updateFloorTracking();
      this.handleSpawning();
      this.parallaxManager.update(this.player.speedMultiplier);
      return;
    }

    // Pause toggle
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.togglePause();
    }
    if (this.isPaused) {
      // Any key or tap unpauses
      const keys = this.input.keyboard!.keys;
      for (const key of keys) {
        if (key && Phaser.Input.Keyboard.JustDown(key) && key.keyCode !== Phaser.Input.Keyboard.KeyCodes.ESC) {
          this.togglePause();
          this.lastFrameTime = this.time.now;
          return; // Don't process input this frame
        }
      }
      this.lastFrameTime = this.time.now;
      return;
    }

    // Accumulate active play time (excludes paused time)
    this.activePlayTime += this.time.now - this.lastFrameTime;
    this.lastFrameTime = this.time.now;

    // Update player speed + velocity
    this.player.updateSpeed(this.activePlayTime, this.currentLevel);

    // Ambient effects (dust, birds, noise)
    this.ambientEffects.update(this.player);

    this.parallaxManager.update(this.player.speedMultiplier);
    this.updateFloorTracking();

    // --- Off-screen death ---
    if (this.player.y > this.cameras.main.height + 50 || this.player.y < -100) {
      this.die();
      return;
    }

    // Input
    const jumpPressed =
      Phaser.Input.Keyboard.JustDown(this.spaceKey) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.up);
    const dropPressed =
      Phaser.Input.Keyboard.JustDown(this.ctrlKey) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.down);

    if (jumpPressed || dropPressed) {
      this.player.swapLane();
      if (this.isMultiplayer) {
        mpClient.sendSwap(this.player.currentFloor);
      }
    }

    // Dash
    const dashPressed =
      Phaser.Input.Keyboard.JustDown(this.shiftKey) ||
      Phaser.Input.Keyboard.JustDown(this.rightKey);

    if (dashPressed && this.player.dashReady && !this.player.isDashing) {
      this.player.startDash();
      if (this.isMultiplayer) {
        mpClient.sendDashStart();
      }
    }

    // Update dash and pill state machines
    this.player.updateDash();
    this.player.updatePill();

    // Detect dash end for multiplayer sync
    if (this.isMultiplayer && this._wasDashing && !this.player.isDashing) {
      mpClient.sendDashEnd();
    }
    this._wasDashing = this.player.isDashing;

    // Detect pill end for multiplayer sync
    if (this.isMultiplayer && this._wasPillActive && !this.player.isPillActive) {
      mpClient.sendPillEnd();
    }
    this._wasPillActive = this.player.isPillActive;
    this.player.updateVisuals();

    // Survival score
    this.scoreManager.updateSurvival(this.time.now);

    // Score milestones
    this.scoreManager.checkMilestones(this.hud);

    // Level progression check (distance-based)
    const distance = this.getDistance();
    const newLevelConfig = getLevelForDistance(distance);
    if (newLevelConfig.level !== this.currentLevel) {
      this.currentLevel = newLevelConfig.level;
      this.switchLevel(newLevelConfig);
    }

    // Update HUD
    const hudData: HUDUpdateData = {
      score: this.scoreManager.score,
      distance,
      speedMultiplier: this.player.speedMultiplier,
      currentFloor: this.player.currentFloor,
      pickupCombo: this.scoreManager.pickupCombo,
      comboMultiplier: this.scoreManager.getComboMultiplier(),
      dashReady: this.player.dashReady,
      isDashing: this.player.isDashing,
      dashStartTime: this.player.dashStartTime,
      timeNow: this.time.now,
    };
    this.hud.update(hudData);

    // Update touch controls dash button color
    this.touchControls.updateDashState(this.player.dashReady, this.player.isDashing);

    // Spawning
    this.handleSpawning();

    // Cleanup
    this.showObstacleWarnings();
    this.cleanupOffscreen();

    // Visual effects update
    this.vfx.update(this.player.speedMultiplier);

    // Audio pitch update (pill mode speeds up BGM further)
    this.audio.updatePitch(this.player.speedMultiplier * this.player.pillSpeedBoost);

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

  // --- Floor tracking delegation ---

  private updateFloorTracking(): void {
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

    this.floorManager.update(trackX, trackFloor, shouldTrack, this.player.currentFloor);
  }

  // --- Spawning ---

  private handleSpawning(): void {
    const cameraRight = this.cameras.main.scrollX + this.cameras.main.width;
    const spawnHorizon = cameraRight + SPAWN_DISTANCE_AHEAD;

    while (this.nextSpawnX <= spawnHorizon) {
      const slotX = this.nextSpawnX;

      // Derive level and speed from slot position -- deterministic across all clients
      const slotDistance = Math.floor((slotX - COCKROACH_START_X) / 50);
      const spawnLevel = getLevelForDistance(slotDistance).level;
      const levelSpeedMult = 1 + (spawnLevel - 1) * (SPEED_BOOST_PER_LEVEL / COCKROACH_BASE_SPEED);
      const slotWidth = MIN_OBSTACLE_SPACING * Math.max(1, levelSpeedMult * 0.3);
      this.nextSpawnX += slotWidth;

      const roll = this.rng?.next() ?? Math.random();
      if (!this.pickupSpawner.trySpawn(slotX, roll)) {
        this.obstacleSpawner.spawn(slotX, spawnLevel);
      }
    }

    // Flush queued pickup destructions (from events that arrived before we spawned them)
    if (this.multiplayerHandler) {
      this.multiplayerHandler.flushPendingPickupDestructions(
        (x) => this.pickupSpawner.destroyPickupNear(x),
      );
    }
  }

  private cleanupOffscreen(): void {
    const cameraLeft = this.cameras.main.scrollX - 200;

    this.obstacles.getChildren().forEach((obj) => {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      if (sprite.x < cameraLeft) sprite.destroy();
    });

    this.pickupSpawner.cleanup(cameraLeft, () => {
      this.scoreManager.resetCombo();
    });
  }

  // --- Pickup collection ---

  private collectApple(
    _cockroach: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    apple: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    const sprite = apple as Phaser.Physics.Arcade.Sprite;
    if (this.isMultiplayer) mpClient.sendPickup(sprite.x);
    this.vfx.appleCollectEffect(sprite.x, sprite.y);
    this.audio.playApple();
    sprite.destroy();

    const points = this.scoreManager.addAppleScore();
    const combo = this.scoreManager.pickupCombo;
    const comboColor = combo >= 10 ? '#ff00ff' : combo >= 5 ? '#ffff00' : '#00ff00';
    this.scoreManager.showPickupPopup(sprite.x, sprite.y, `+${points}`, comboColor);
    this.hud.updateScore(this.scoreManager.score);
  }

  private collectTyskie(
    _cockroach: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    tyskie: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    const sprite = tyskie as Phaser.Physics.Arcade.Sprite;
    if (this.isMultiplayer) mpClient.sendPickup(sprite.x);
    this.vfx.appleCollectEffect(sprite.x, sprite.y);
    this.sound.play('burp', { volume: 0.8 });
    sprite.destroy();

    const points = this.scoreManager.addTyskieScore();
    this.scoreManager.showPickupPopup(sprite.x, sprite.y, `+${points}`, '#ffdd00');
    this.hud.updateScore(this.scoreManager.score);
  }

  private collectPill(
    _cockroach: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    pill: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    const sprite = pill as Phaser.Physics.Arcade.Sprite;
    if (this.isMultiplayer) mpClient.sendPickup(sprite.x);
    const px = sprite.x;
    const py = sprite.y;

    const glowTween = sprite.getData('glowTween');
    if (glowTween) glowTween.destroy();
    sprite.destroy();

    // Score with combo
    this.scoreManager.addPillScore();
    this.hud.updateScore(this.scoreManager.score);

    // VFX
    this.vfx.appleCollectEffect(px, py);

    // Activate pill on player
    this.player.activatePill(px, py);

    if (this.isMultiplayer) {
      mpClient.sendPillStart();
    }
  }

  private hitObstacle(
    _cockroach: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    obstacle: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    const obstacleType = (obstacle as Phaser.Physics.Arcade.Sprite).getData('type') || null;
    this.die(obstacleType);
  }

  // --- Death ---

  private die(obstacleType?: string | null): void {
    if (this.isDead) return;
    this.isDead = true;

    this.player.die();

    document.title = `ZGNIOT\u0141E\u015a SI\u0118! | ${this.scoreManager.score} pkt`;
    this.cameras.main.shake(300, 0.02);

    this.sound.play('cockroach-hiss', { volume: 0.7 });

    this.vfx.deathEffect();
    this.audio.playDeath();

    // In multiplayer, start spectating instead of transitioning to GameOverScene
    if (this.isMultiplayer) {
      const stats = {
        timeSurvived: Math.floor(this.activePlayTime / 1000),
        distance: Math.floor(this.getDistance()),
        maxSpeed: this.player.speedMultiplier,
        obstacleType: obstacleType || 'fall',
      };
      mpClient.sendDeath(this.scoreManager.score, stats);

      // Start spectating after death animation plays out
      if (this.ghostManager && !this.ghostManager.allDead()) {
        this.cameras.main.stopFollow();
        this.time.delayedCall(1000, () => {
          if (this.ghostManager && !this.ghostManager.allDead()) {
            this.ghostManager.startSpectating();
            // Snap camera to spectate target immediately
            const target = this.ghostManager.spectateTargetPlayer;
            if (target && target.alive) {
              this.cameras.main.scrollX = target.sprite.x - 200;
            }
          } else {
            this.triggerMultiplayerGameOver();
          }
        });
      } else {
        this.triggerMultiplayerGameOver();
      }
      return; // Don't transition to solo GameOverScene
    }

    // Increment games played
    const gamesPlayed = parseInt(localStorage.getItem('cockroach-games-played') || '0', 10);
    localStorage.setItem('cockroach-games-played', (gamesPlayed + 1).toString());

    // Persist high score
    const highScore = parseInt(localStorage.getItem('cockroach-highscore') || '0', 10);
    if (this.scoreManager.score > highScore) {
      localStorage.setItem('cockroach-highscore', this.scoreManager.score.toString());
    }

    this.time.delayedCall(250, () => {
      this.vfx.destroy();
      this.audio.destroy();
      this.scene.start('GameOverScene', {
        score: this.scoreManager.score,
        timeSurvived: Math.floor(this.activePlayTime / 1000),
        topSpeed: this.player.speedMultiplier,
        distance: this.getDistance(),
        obstacleType: obstacleType || null,
        level: this.currentLevel,
      });
    });
  }

  // --- Level switching ---

  private switchLevel(config: LevelConfig): void {
    this.parallaxManager.crossfade(config);

    if (!this.isDead) {
      this.audio.switchBGM(config.bgmKey);
    }
    this.hud.showLevelAnnouncement(config);
  }

  // --- Multiplayer ---

  private deathNotificationY = 80;

  private showDeathNotification(name: string, color: number, disconnected = false): void {
    const cam = this.cameras.main;
    const colorStr = '#' + color.toString(16).padStart(6, '0');
    const label = disconnected ? `${name} uciek\u0142` : `${name} zgin\u0105\u0142!`;

    const text = this.add.text(cam.width / 2, this.deathNotificationY, label, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '10px',
      color: colorStr,
      stroke: '#000000',
      strokeThickness: 3,
    });
    text.setOrigin(0.5, 0);
    text.setScrollFactor(0);
    text.setDepth(4000);
    text.setAlpha(0);

    this.deathNotificationY += 20;

    this.tweens.add({
      targets: text,
      alpha: 1,
      duration: 200,
      ease: 'Power2',
      onComplete: () => {
        this.tweens.add({
          targets: text,
          alpha: 0,
          y: text.y - 15,
          delay: 2000,
          duration: 500,
          ease: 'Power2',
          onComplete: () => {
            text.destroy();
            this.deathNotificationY = Math.max(80, this.deathNotificationY - 20);
          },
        });
      },
    });
  }

  private handleMpGameOver(data: any): void {
    if (this.multiplayerHandler?.mpGameOverTriggered) return;
    if (this.multiplayerHandler) this.multiplayerHandler.mpGameOverTriggered = true;
    // Wait for the last death animation to finish before transitioning
    this.time.delayedCall(1200, () => {
      this.audio.destroy();
      this.sound.stopAll();
      this.ghostManager?.destroy();
      this.ghostManager = null;
      this.scene.start('MultiplayerGameOverScene', {
        rankings: data.rankings,
        myId: mpClient.myId,
        isHost: data.hostId === mpClient.myId,
      });
    });
  }

  private triggerMultiplayerGameOver(): void {
    if (this.multiplayerHandler?.mpGameOverTriggered) return;
    this.time.delayedCall(3000, () => {
      if (this.multiplayerHandler?.mpGameOverTriggered) return;
      if (this.multiplayerHandler) this.multiplayerHandler.mpGameOverTriggered = true;
      const rankings = this.ghostManager?.getRankings(
        this.scoreManager.score,
        this.mpMyName,
        {
          timeSurvived: Math.floor(this.activePlayTime / 1000),
          distance: Math.floor(this.getDistance()),
          maxSpeed: this.player.speedMultiplier,
        },
      ) ?? [];
      this.audio.destroy();
      this.sound.stopAll();
      this.ghostManager?.destroy();
      this.ghostManager = null;
      this.scene.start('MultiplayerGameOverScene', {
        rankings,
        myId: mpClient.myId,
        isHost: false,
      });
    });
  }

  // --- Pause ---

  private togglePause(): void {
    if (this.isMultiplayer) return;
    if (this.isUnpauseCountdown) return;

    if (!this.isPaused) {
      this.isPaused = true;
      this.physics.pause();
      this.hud.showPauseOverlay();
    } else {
      // Resume with a brief grace period to absorb the unpause input
      this.isPaused = false;
      this.isUnpauseCountdown = true; // acts as input guard for one frame
      this.hud.hidePauseOverlay();
      this.physics.resume();
      this.lastFrameTime = this.time.now;
      this.time.delayedCall(100, () => {
        this.isUnpauseCountdown = false;
      });
    }
  }

  // --- Helpers ---

  private getDistance(): number {
    return Math.floor((this.player.x - COCKROACH_START_X) / 50);
  }

  private showObstacleWarnings(): void {
    const cameraRight = this.cameras.main.scrollX + this.cameras.main.width;
    const warningZoneStart = cameraRight - 50;
    const warningZoneEnd = cameraRight + 300;

    this.obstacles.getChildren().forEach((obj) => {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      if (sprite.x > warningZoneStart && sprite.x < warningZoneEnd && !sprite.getData('warned')) {
        sprite.setData('warned', true);
        const obstacleFloor = sprite.getData('floor');
        if (obstacleFloor && obstacleFloor !== this.player.currentFloor) return;

        const warningY = sprite.y < this.cameras.main.height / 2 ? 30 : this.cameras.main.height - 30;
        const warning = this.add.text(this.cameras.main.width - 30, warningY, '!', {
          fontSize: '12px',
          fontFamily: '"Press Start 2P", monospace',
          color: '#ff0000',
          stroke: '#000000',
          strokeThickness: 3,
        });
        warning.setOrigin(0.5);
        warning.setScrollFactor(0);
        warning.setDepth(500);
        this.tweens.add({
          targets: warning,
          alpha: 0,
          scale: 2,
          duration: 400,
          ease: 'Power2',
          onComplete: () => warning.destroy(),
        });
      }
    });
  }
}
