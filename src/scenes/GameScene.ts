import Phaser from 'phaser';
import {
  FLOOR_BOTTOM_Y,
  FLOOR_TOP_Y,
  FLOOR_HEIGHT,
  FLOOR_TILE_W,
  FLOOR_TILE_H,
  FLOOR_TILE_GAP,
  FLOOR_TILE_STEP,
  FLOOR_TILE_RADIUS,
  COCKROACH_START_X,
  COCKROACH_BASE_SPEED,
  APPLE_SCORE,
  PILL_SCORE,
  TYSKIE_SCORE,
  SPAWN_DISTANCE_AHEAD,
  MIN_OBSTACLE_SPACING,
  APPLE_SPAWN_CHANCE,
  PILL_SPAWN_CHANCE,
} from '../config/constants';

const TYSKIE_SPAWN_CHANCE = 0.05; // 5% of slots get a Tyskie
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
  private mpPositionTimer = 0;
  private mpMyName = '';
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

  // Floors
  private floorTopBody!: Phaser.GameObjects.Rectangle;
  private floorBottomBody!: Phaser.GameObjects.Rectangle;
  private floorTopSprites: Phaser.GameObjects.Image[] = [];
  private floorBottomSprites: Phaser.GameObjects.Image[] = [];
  private floorHighlightTop!: Phaser.GameObjects.Rectangle;
  private floorHighlightBottom!: Phaser.GameObjects.Rectangle;

  // Floor crumble — tiles behind cockroach fall away
  // Each range is {from, to, lastFallX} — the cockroach walked from `from` to `to` on that floor
  private steppedTopRanges: { from: number; to: number; lastFallX: number }[] = [];
  private steppedBottomRanges: { from: number; to: number; lastFallX: number }[] = [];
  private lastTrackedFloor: 'top' | 'bottom' = 'bottom';

  // Groups
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

  // Scoring
  private score = 0;
  private startTime = 0;
  private activePlayTime = 0;
  private lastFrameTime = 0;
  private lastScoreTime = 0;

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
  private unpauseCountdownStart = 0;
  private unpauseCountdownLastShown = -1;

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
    this.mpPositionTimer = 0;
    this.mpMyName = localStorage.getItem('cockroach-mp-name') || 'Karaluch';
    this._wasDashing = false;
    this._wasPillActive = false;

    // Reset ALL state
    this.score = 0;
    this.isDead = false;
    this.nextSpawnX = COCKROACH_START_X + 400;
    this.startTime = this.time.now;
    this.activePlayTime = 0;
    this.lastFrameTime = this.time.now;
    this.lastScoreTime = this.time.now;
    this.lastMilestone = 0;
    this.isCountingDown = true;
    this.steppedTopRanges = [];
    const startSnap = Math.floor(COCKROACH_START_X / FLOOR_TILE_STEP) * FLOOR_TILE_STEP;
    this.steppedBottomRanges = [{ from: startSnap, to: COCKROACH_START_X, lastFallX: startSnap - FLOOR_TILE_STEP }];
    this.lastTrackedFloor = 'bottom';
    this.dustTimer = 0;
    this.birdOverlookTimer = 0;
    this.nextBirdOverlookTime = 15000 + Math.random() * 10000;
    this.cockroachNoiseTimer = 0;
    this.nextNoiseTime = 20000 + Math.random() * 15000;
    this.pickupCombo = 0;
    this.isPaused = false;
    this.currentLevel = 1;

    // Screen dimensions
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;

    this.isMobile = !this.sys.game.device.os.desktop;
    this.floorBottomY = FLOOR_BOTTOM_Y;
    this.floorTopY = FLOOR_TOP_Y;

    // Parallax backgrounds
    this.skyBg = this.add
      .tileSprite(0, 0, w, h, 'lv1-sky')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setAlpha(0.8);

    this.midBg = this.add
      .tileSprite(0, 0, w, h, 'lv1-bg')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1)
      .setAlpha(0.15);
    this.midBg.setBlendMode(Phaser.BlendModes.SOFT_LIGHT);

    this.fgBg = this.add
      .tileSprite(0, 0, w, h, 'lv1-fg')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(2);

    // Next-level background layers (for crossfade transitions)
    this.nextSkyBg = this.add.tileSprite(0, 0, w, h, 'lv1-sky')
      .setOrigin(0, 0).setScrollFactor(0).setAlpha(0);
    this.nextMidBg = this.add.tileSprite(0, 0, w, h, 'lv1-bg')
      .setOrigin(0, 0).setScrollFactor(0).setDepth(1).setAlpha(0)
      .setBlendMode(Phaser.BlendModes.SOFT_LIGHT);
    this.nextFgBg = this.add.tileSprite(0, 0, w, h, 'lv1-fg')
      .setOrigin(0, 0).setScrollFactor(0).setDepth(2).setAlpha(0);
    this.bgTransitioning = false;

    // Generate rounded floor textures for all levels
    this.generateRoundedFloorTextures();

    // Reset floor sprite arrays (old sprites are destroyed by scene restart)
    this.floorTopSprites = [];
    this.floorBottomSprites = [];

    // Floor platforms — invisible physics bodies + visual tile sprites
    const FLOOR_WIDTH = w + 200;

    const COLLIDER_DROP = 8; // shift colliders down so cockroach sits on the tile visually
    this.floorTopBody = this.add.rectangle(0, this.floorTopY + COLLIDER_DROP, FLOOR_WIDTH, FLOOR_HEIGHT, 0x000000, 0)
      .setOrigin(0, 0);
    this.physics.add.existing(this.floorTopBody, true);

    this.floorBottomBody = this.add.rectangle(0, this.floorBottomY + COLLIDER_DROP, FLOOR_WIDTH, FLOOR_HEIGHT, 0x000000, 0)
      .setOrigin(0, 0);
    this.physics.add.existing(this.floorBottomBody, true);

    // Create visual floor tile sprites
    const tilesNeeded = Math.ceil(FLOOR_WIDTH / FLOOR_TILE_STEP) + 2;
    for (let i = 0; i < tilesNeeded; i++) {
      const topTile = this.add.image(i * FLOOR_TILE_STEP, this.floorTopY, 'floor-rounded-lv1')
        .setOrigin(0, 0).setDepth(3);
      this.floorTopSprites.push(topTile);

      const bottomTile = this.add.image(i * FLOOR_TILE_STEP, this.floorBottomY, 'floor-rounded-lv1')
        .setOrigin(0, 0).setDepth(3);
      this.floorBottomSprites.push(bottomTile);
    }

    // Active floor highlight — subtle glow strip behind the current floor
    const highlightW = w + 200;
    this.floorHighlightTop = this.add.rectangle(0, this.floorTopY + FLOOR_TILE_H / 2, highlightW, FLOOR_TILE_H + 8, 0xffffff, 0)
      .setOrigin(0, 0.5).setDepth(2).setBlendMode(Phaser.BlendModes.ADD);
    this.floorHighlightBottom = this.add.rectangle(0, this.floorBottomY + FLOOR_TILE_H / 2, highlightW, FLOOR_TILE_H + 8, 0xffffff, 0)
      .setOrigin(0, 0.5).setDepth(2).setBlendMode(Phaser.BlendModes.ADD);

    // Audio (created before Player since Player needs it)
    this.audio = new AudioManager(this);

    // Player
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

    // Floor colliders with process callbacks
    this.physics.add.collider(this.player.sprite, this.floorTopBody, undefined, () => {
      return this.player.currentFloor === 'top';
    }, this);
    this.physics.add.collider(this.player.sprite, this.floorBottomBody, undefined, () => {
      return this.player.currentFloor === 'bottom';
    }, this);

    // Create ghost manager for multiplayer
    if (this.isMultiplayer && data?.players && data?.myId) {
      const COLLIDER_DROP = 8;
      this.ghostManager = new GhostManager(
        this,
        data.players,
        data.myId,
        this.floorTopY + COLLIDER_DROP,
        this.floorBottomY + COLLIDER_DROP,
        COCKROACH_START_X,
      );
      this.setupMultiplayerListeners();
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
      const countText = this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2 - 30, text, {
        fontSize: text === 'JAZDA!' ? '24px' : '32px',
        fontFamily: '"Press Start 2P", monospace',
        color: text === 'JAZDA!' ? '#00ff00' : '#ffffff',
        stroke: '#000000',
        strokeThickness: 6,
      });
      countText.setOrigin(0.5);
      countText.setScrollFactor(0);
      countText.setDepth(1000);
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

        // Keep the world alive — parallax, floors, obstacles, cleanup
        // so spectating feels like watching through the other player's eyes
        this.updateParallax();
        this.updateFloors();
        this.handleSpawning();
        this.cleanupOffscreen();

        // Update ghost manager
        this.ghostManager.update(
          this.game.loop.delta,
          this.cameras.main.scrollX,
          this.cameras.main.width,
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
      this.updateCountdown();
      this.updateFloors();
      this.handleSpawning();
      this.updateParallax();
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

    // Dust trail particles
    this.dustTimer += this.game.loop.delta;
    const dustInterval = Math.max(100, 300 / this.player.speedMultiplier);
    const onGroundForDust = this.player.sprite.body!.touching.down || this.player.sprite.body!.blocked.down;
    if (this.dustTimer >= dustInterval && onGroundForDust) {
      this.dustTimer = 0;
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
        onComplete: () => {
          dust.destroy();
        },
      });
    } else if (this.dustTimer >= dustInterval) {
      this.dustTimer = 0;
    }

    this.updateParallax();
    this.updateFloors();

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

    // Survival score (+1 per second)
    if (this.time.now - this.lastScoreTime >= 1000) {
      this.score += 1;
      this.lastScoreTime = this.time.now;
    }

    // Score milestones
    const scoreMilestones: { threshold: number; text: string; tier: number }[] = [
      { threshold: 100, text: 'SETUNIA MMMMMMM', tier: 1 },
      { threshold: 250, text: 'MAŁPECZKA Z ŻABKI', tier: 1 },
      { threshold: 420, text: 'BLAZE IT!', tier: 2 },
      { threshold: 500, text: 'PI\u0118\u0106 DYCH NA BROWARA!', tier: 2 },
      { threshold: 1000, text: 'GRAJ ZE MNOM W TYSIĄCA', tier: 3 },
      { threshold: 1500, text: 'MIÓD PITNY PÓŁTORAK', tier: 3 },
      { threshold: 2000, text: 'DWA KAFLE WYPŁATY', tier: 4 },
      { threshold: 2137, text: 'KREM\u00d3WKI DLA WSZYSTKICH!', tier: 5 },
      { threshold: 3000, text: 'TRZY WIELKIE KLOCE', tier: 4 },
      { threshold: 4000, text: 'BANIA U CYGANA', tier: 4 },
      { threshold: 4200, text: 'SNOOP DOGGY DOGG', tier: 5 },
      { threshold: 5000, text: 'GDZIE KARALUCHY ZIMUJOM', tier: 5 },
      { threshold: 10000, text: 'KARALUCH JEST BOGIEM!', tier: 5 },
    ];
    for (const m of scoreMilestones) {
      if (this.score >= m.threshold && this.lastMilestone < m.threshold) {
        this.lastMilestone = m.threshold;
        this.hud.showScoreMilestone(m.text, m.tier, m.threshold);
        this.sound.play(`milestone-${m.threshold}`, { volume: 0.7 });
        break;
      }
    }

    // Level progression check (distance-based)
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

    // Multiplayer position sync (every 500ms)
    if (this.isMultiplayer && !this.isDead) {
      this.mpPositionTimer += this.game.loop.delta;
      if (this.mpPositionTimer >= 500) {
        this.mpPositionTimer = 0;
        mpClient.sendPosition(this.player.x, this.player.currentFloor);
      }
    }

    // Ghost manager update
    if (this.ghostManager) {
      this.ghostManager.update(
        this.game.loop.delta,
        this.cameras.main.scrollX,
        this.cameras.main.width,
      );
    }
  }

  private _mpGameOverTriggered = false;

  private setupMultiplayerListeners(): void {
    this._mpGameOverTriggered = false;

    mpClient.on('game:swap', (data: any) => {
      this.ghostManager?.handleSwap(data.id, data.lane);
    });
    mpClient.on('game:dash-start', (data: any) => {
      this.ghostManager?.handleDashStart(data.id);
    });
    mpClient.on('game:dash-end', (data: any) => {
      this.ghostManager?.handleDashEnd(data.id);
    });
    mpClient.on('game:pill-start', (data: any) => {
      this.ghostManager?.handlePillStart(data.id);
    });
    mpClient.on('game:pill-end', (data: any) => {
      this.ghostManager?.handlePillEnd(data.id);
    });
    mpClient.on('game:position', (data: any) => {
      this.ghostManager?.handlePosition(data.id, data.x, data.lane);
    });
    mpClient.on('game:death', (data: any) => {
      this.ghostManager?.handleDeath(data.id, data.score, data.stats);
      // If I'm spectating and all ghosts are now dead, trigger game over
      if (this.isDead && this.ghostManager?.allDead()) {
        this.triggerMultiplayerGameOver();
      }
    });
    // Handle player disconnect mid-game — kill their ghost
    mpClient.on('game:player-left', (data: any) => {
      this.ghostManager?.handleDeath(data.id, 0, {});
      if (this.isDead && this.ghostManager?.allDead()) {
        this.triggerMultiplayerGameOver();
      }
    });
    mpClient.on('game:pickup', (data: any) => {
      // Only destroy pickups on spectator's screen — don't steal from alive players
      if (this.isDead) {
        this.destroyPickupNear(data.x);
      }
    });
    mpClient.on('game:over', (data: any) => {
      if (this._mpGameOverTriggered) return;
      this._mpGameOverTriggered = true;
      this.ghostManager?.destroy();
      this.ghostManager = null;
      this.scene.start('MultiplayerGameOverScene', {
        rankings: data.rankings,
        myId: mpClient.myId,
        isHost: data.hostId === mpClient.myId,
      });
    });

    // Cleanup on scene shutdown
    this.events.on('shutdown', () => {
      if (this.isMultiplayer) {
        mpClient.off('game:swap');
        mpClient.off('game:dash-start');
        mpClient.off('game:dash-end');
        mpClient.off('game:pill-start');
        mpClient.off('game:pill-end');
        mpClient.off('game:position');
        mpClient.off('game:pickup');
        mpClient.off('game:death');
        mpClient.off('game:player-left');
        mpClient.off('game:over');
      }
      this.ghostManager?.destroy();
      this.ghostManager = null;
    });
  }

  private triggerMultiplayerGameOver(): void {
    // Server detects all-dead automatically from game:death events
    // and emits game:over with server-validated rankings.
    // Nothing to do here — the game:over listener handles the transition.
  }

  private togglePause(): void {
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

  private updateUnpauseCountdown(): void {
    const elapsed = performance.now() - this.unpauseCountdownStart;
    const steps = ['3', '2', '1', 'JAZDA!'];
    const step = Math.floor(elapsed / 600);

    if (step < steps.length && step > this.unpauseCountdownLastShown) {
      this.unpauseCountdownLastShown = step;
      const text = steps[step];
      const countText = this.add.text(
        this.cameras.main.width / 2, this.cameras.main.height / 2 - 30, text, {
          fontSize: text === 'JAZDA!' ? '24px' : '32px',
          fontFamily: '"Press Start 2P", monospace',
          color: text === 'JAZDA!' ? '#00ff00' : '#ffffff',
          stroke: '#000000',
          strokeThickness: 6,
        },
      );
      countText.setOrigin(0.5).setScrollFactor(0).setDepth(4003);
      this.tweens.add({
        targets: countText,
        scale: { from: 2, to: 0.5 },
        alpha: { from: 1, to: 0 },
        duration: 500,
        ease: 'Power2',
        onComplete: () => countText.destroy(),
      });
    }

    if (elapsed >= steps.length * 600) {
      this.isUnpauseCountdown = false;
      this.physics.resume();
      this.lastFrameTime = this.time.now;
    }
  }

  private handleSpawning(): void {
    const slotWidth = MIN_OBSTACLE_SPACING * Math.max(1, this.player.speedMultiplier * 0.3);
    const cameraRight = this.cameras.main.scrollX + this.cameras.main.width;
    const spawnHorizon = cameraRight + SPAWN_DISTANCE_AHEAD;

    while (this.nextSpawnX <= spawnHorizon) {
      const slotX = this.nextSpawnX;
      this.nextSpawnX += slotWidth;

      const roll = this.rng?.next() ?? Math.random();
      if (roll < PILL_SPAWN_CHANCE) {
        const pFloor: Floor = (this.rng?.next() ?? Math.random()) > 0.5 ? 'top' : 'bottom';
        const pY = (pFloor === 'top' ? this.floorTopY : this.floorBottomY) - 30;
        const pill = this.pills.create(slotX, pY, 'pill') as Phaser.Physics.Arcade.Sprite;
        pill.setScale(0.15);
        pill.setDepth(10);
        (pill.body as Phaser.Physics.Arcade.Body).allowGravity = false;
        pill.setImmovable(true);
        this.tweens.add({
          targets: pill,
          y: pY - 10,
          duration: 400,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        const pillGlowTween = this.tweens.addCounter({
          from: 0,
          to: 360,
          duration: 1500,
          repeat: -1,
          onUpdate: (tween) => {
            if (pill.active) {
              const hue = tween.getValue() ?? 0;
              const color = Phaser.Display.Color.HSLToColor(hue / 360, 1, 0.5);
              pill.setTint(color.color);
            }
          },
        });
        pill.setData('glowTween', pillGlowTween);
        // Pulsing pink glow
        const pGlow = this.add.circle(slotX, pY, 20, 0xff00ff, 0.3).setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: pGlow, alpha: 0.1, scale: 1.3, duration: 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        pill.on('destroy', () => { this.tweens.killTweensOf(pill); this.tweens.killTweensOf(pGlow); pGlow.destroy(); });
        this.tweens.add({
          targets: pill,
          scaleX: 0.18,
          scaleY: 0.18,
          duration: 300,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      } else if (roll < PILL_SPAWN_CHANCE + TYSKIE_SPAWN_CHANCE) {
        const tFloor: Floor = (this.rng?.next() ?? Math.random()) > 0.5 ? 'top' : 'bottom';
        const tY = (tFloor === 'top' ? this.floorTopY : this.floorBottomY) - 30;
        const tyskie = this.tyskies.create(slotX, tY, 'tyskie') as Phaser.Physics.Arcade.Sprite;
        tyskie.setScale(0.18);
        tyskie.setDepth(10);
        (tyskie.body as Phaser.Physics.Arcade.Body).allowGravity = false;
        tyskie.setImmovable(true);
        this.tweens.add({
          targets: tyskie,
          y: tY - 8,
          duration: 400,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        this.tweens.add({
          targets: tyskie,
          scale: 0.22,
          duration: 600,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        tyskie.setTint(0xffdd00);
        // Golden glow
        const tGlow = this.add.circle(slotX, tY, 18, 0xffdd00, 0.25).setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: tGlow, alpha: 0.1, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        tyskie.on('destroy', () => { this.tweens.killTweensOf(tyskie); this.tweens.killTweensOf(tGlow); tGlow.destroy(); });
      } else if (roll < PILL_SPAWN_CHANCE + TYSKIE_SPAWN_CHANCE + APPLE_SPAWN_CHANCE) {
        const appleFloor: Floor = (this.rng?.next() ?? Math.random()) > 0.5 ? 'top' : 'bottom';
        const appleY = (appleFloor === 'top' ? this.floorTopY : this.floorBottomY) - 30;
        const apple = this.apples.create(slotX, appleY, 'apple') as Phaser.Physics.Arcade.Sprite;
        apple.setScale(0.15);
        apple.setDepth(10);
        (apple.body as Phaser.Physics.Arcade.Body).allowGravity = false;
        apple.setImmovable(true);
        this.tweens.add({
          targets: apple,
          y: appleY - 8,
          duration: 500,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        // Green glow
        const aGlow = this.add.circle(slotX, appleY, 16, 0x00ff44, 0.2).setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: aGlow, alpha: 0.08, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        apple.on('destroy', () => { this.tweens.killTweensOf(apple); this.tweens.killTweensOf(aGlow); aGlow.destroy(); });
      } else {
        this.obstacleSpawner.spawn(slotX, this.currentLevel);
      }
    }
  }

  private destroyPickupNear(x: number): void {
    const tolerance = 30;
    const groups = [this.apples, this.tyskies, this.pills];
    for (const group of groups) {
      for (const obj of group.getChildren()) {
        const sprite = obj as Phaser.Physics.Arcade.Sprite;
        if (Math.abs(sprite.x - x) < tolerance) {
          sprite.destroy();
          return;
        }
      }
    }
  }

  private cleanupOffscreen(): void {
    const cameraLeft = this.cameras.main.scrollX - 200;

    this.obstacles.getChildren().forEach((obj) => {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      if (sprite.x < cameraLeft) sprite.destroy();
    });

    this.apples.getChildren().forEach((obj) => {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      if (sprite.x < cameraLeft) {
        this.pickupCombo = 0;
        sprite.destroy();
      }
    });

    this.tyskies.getChildren().forEach((obj) => {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      if (sprite.x < cameraLeft) {
        this.pickupCombo = 0;
        sprite.destroy();
      }
    });

    this.pills.getChildren().forEach((obj) => {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      if (sprite.x < cameraLeft) {
        this.pickupCombo = 0;
        sprite.destroy();
      }
    });
  }

  private collectApple(
    _cockroach: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    apple: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    const sprite = apple as Phaser.Physics.Arcade.Sprite;
    if (this.isMultiplayer) mpClient.sendPickup(sprite.x);
    this.vfx.appleCollectEffect(sprite.x, sprite.y);
    this.audio.playApple();
    sprite.destroy();

    this.pickupCombo++;
    const multiplier = this.getComboMultiplier();
    const points = Math.round(APPLE_SCORE * multiplier);
    this.score += points;

    const comboColor = this.pickupCombo >= 10 ? '#ff00ff' : this.pickupCombo >= 5 ? '#ffff00' : '#00ff00';
    this.showPickupPopup(sprite.x, sprite.y, `+${points}`, comboColor);
    this.hud.updateScore(this.score);
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

    this.pickupCombo++;
    const multiplier = this.getComboMultiplier();
    const points = Math.round(TYSKIE_SCORE * multiplier);
    this.score += points;

    this.showPickupPopup(sprite.x, sprite.y, `+${points}`, '#ffdd00');
    this.hud.updateScore(this.score);
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
    this.pickupCombo++;
    const multiplier = this.getComboMultiplier();
    const pillPoints = Math.round(PILL_SCORE * multiplier);
    this.score += pillPoints;
    this.hud.updateScore(this.score);

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

  private showPickupPopup(x: number, y: number, text: string, color: string): void {
    const popup = this.add.text(x, y - 20, text, {
      fontSize: '12px',
      fontFamily: '"Press Start 2P", monospace',
      color,
      stroke: '#000000',
      strokeThickness: 3,
    });
    popup.setOrigin(0.5);
    popup.setDepth(999);
    popup.setAlpha(0);

    // Phase 1: Slide up + fade in (150ms)
    this.tweens.add({
      targets: popup,
      y: popup.y - 15,
      alpha: 1,
      duration: 150,
      ease: 'Power2',
      onComplete: () => {
        // Phase 2: Wobble in place (300ms)
        this.tweens.add({
          targets: popup,
          angle: { from: -3, to: 3 },
          duration: 75,
          yoyo: true,
          repeat: 1,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            // Phase 3: Slide up + fade out (150ms)
            this.tweens.add({
              targets: popup,
              y: popup.y - 20,
              alpha: 0,
              duration: 150,
              ease: 'Power2',
              onComplete: () => popup.destroy(),
            });
          },
        });
      },
    });
  }

  private die(obstacleType?: string | null): void {
    if (this.isDead) return;
    this.isDead = true;

    this.player.die();

    document.title = `ZGNIOT\u0141E\u015a SI\u0118! | ${this.score} pkt`;
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
      };
      mpClient.sendDeath(this.score, stats);

      // Start spectating if there are alive ghosts
      if (this.ghostManager && !this.ghostManager.allDead()) {
        this.cameras.main.stopFollow();
        this.ghostManager.startSpectating();
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
    if (this.score > highScore) {
      localStorage.setItem('cockroach-highscore', this.score.toString());
    }

    this.time.delayedCall(250, () => {
      this.vfx.destroy();
      this.audio.destroy();
      this.scene.start('GameOverScene', {
        score: this.score,
        timeSurvived: Math.floor(this.activePlayTime / 1000),
        topSpeed: this.player.speedMultiplier,
        distance: this.getDistance(),
        obstacleType: obstacleType || null,
        level: this.currentLevel,
      });
    });
  }

  private switchLevel(config: LevelConfig): void {
    // Floor tiles transition spatially in updateFloors() — no bulk swap needed

    // Crossfade backgrounds over 3 seconds
    this.nextSkyBg.setTexture(config.skyKey);
    this.nextMidBg.setTexture(config.bgKey);
    this.nextFgBg.setTexture(config.fgKey);
    this.nextFgBg.setDepth(2);
    this.bgTransitioning = true;

    const fadeDuration = 3000;

    // Fade in next backgrounds to their target alphas
    this.tweens.add({ targets: this.nextSkyBg, alpha: 0.8, duration: fadeDuration, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: this.nextMidBg, alpha: 0.15, duration: fadeDuration, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: this.nextFgBg, alpha: 1, duration: fadeDuration, ease: 'Sine.easeInOut' });

    // Fade out current backgrounds, then swap
    this.tweens.add({ targets: this.skyBg, alpha: 0, duration: fadeDuration, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: this.midBg, alpha: 0, duration: fadeDuration, ease: 'Sine.easeInOut' });
    this.tweens.add({
      targets: this.fgBg, alpha: 0, duration: fadeDuration, ease: 'Sine.easeInOut',
      onComplete: () => {
        // Swap: current takes next's textures, reset alphas
        this.skyBg.setTexture(config.skyKey).setAlpha(0.8);
        this.midBg.setTexture(config.bgKey).setAlpha(0.15);
        this.fgBg.setTexture(config.fgKey).setAlpha(1);
        this.fgBg.setDepth(2);
        this.nextSkyBg.setAlpha(0);
        this.nextMidBg.setAlpha(0);
        this.nextFgBg.setAlpha(0);
        this.bgTransitioning = false;
      },
    });

    this.audio.switchBGM(config.bgmKey);
    this.hud.showLevelAnnouncement(config);
  }

  /** Combo multiplier: 10 combo = 1.5x, 20 combo = 2.0x, etc. */
  private getComboMultiplier(): number {
    return 1 + this.pickupCombo * 0.025;
  }

  private getDistance(): number {
    return Math.floor((this.player.x - COCKROACH_START_X) / 50);
  }

  private generateRoundedFloorTextures(): void {
    for (let i = 1; i <= 10; i++) {
      const key = `floor-rounded-lv${i}`;
      const sourceKey = `lv${i}-floor`;
      const sourceImage = this.textures.get(sourceKey).getSourceImage() as HTMLImageElement;

      if (this.textures.exists(key)) {
        // Redraw existing canvas in place and refresh the texture source
        const tex = this.textures.get(key);
        const existingCanvas = tex.getSourceImage() as HTMLCanvasElement;
        const ctx = existingCanvas.getContext('2d')!;
        ctx.clearRect(0, 0, FLOOR_TILE_W, FLOOR_TILE_H);
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(0, 0, FLOOR_TILE_W, FLOOR_TILE_H, FLOOR_TILE_RADIUS);
        ctx.clip();
        ctx.drawImage(sourceImage, 0, 0, FLOOR_TILE_W, FLOOR_TILE_H);
        ctx.restore();
        (tex.source[0] as Phaser.Textures.TextureSource).update();
      } else {
        const canvas = document.createElement('canvas');
        canvas.width = FLOOR_TILE_W;
        canvas.height = FLOOR_TILE_H;
        const ctx = canvas.getContext('2d')!;
        ctx.beginPath();
        ctx.roundRect(0, 0, FLOOR_TILE_W, FLOOR_TILE_H, FLOOR_TILE_RADIUS);
        ctx.clip();
        ctx.drawImage(sourceImage, 0, 0, FLOOR_TILE_W, FLOOR_TILE_H);
        this.textures.addCanvas(key, canvas);
      }
    }
  }

  private updateParallax(): void {
    const breatheFactor = this.data.get('breatheFactor') ?? 1.0;
    const scrollX = this.cameras.main.scrollX;
    this.skyBg.tilePositionX = scrollX * 0.1 * breatheFactor;
    this.midBg.tilePositionX = scrollX * 0.4 * breatheFactor;
    this.fgBg.tilePositionX = scrollX * 0.7 * breatheFactor;

    // Keep next-level backgrounds in sync during crossfade
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
    const camX = this.cameras.main.scrollX;
    const bodyX = camX - 100;

    // Move invisible physics bodies
    this.floorTopBody.x = bodyX;
    (this.floorTopBody.body as Phaser.Physics.Arcade.StaticBody).x = bodyX;
    (this.floorTopBody.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
    this.floorBottomBody.x = bodyX;
    (this.floorBottomBody.body as Phaser.Physics.Arcade.StaticBody).x = bodyX;
    (this.floorBottomBody.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();

    // Advance stepped-on ranges for the cockroach's current floor
    const cockroachX = this.player.x;
    if (!this.isCountingDown && !this.isDead) {
      const currentFloor = this.player.currentFloor;
      const ranges = currentFloor === 'top' ? this.steppedTopRanges : this.steppedBottomRanges;

      // On floor swap, start a new range at the landing position
      if (currentFloor !== this.lastTrackedFloor) {
        const snapX = Math.floor(cockroachX / FLOOR_TILE_STEP) * FLOOR_TILE_STEP;
        ranges.push({ from: snapX, to: cockroachX, lastFallX: snapX - FLOOR_TILE_STEP });
        this.lastTrackedFloor = currentFloor;
      }

      // Extend the current range
      if (ranges.length > 0) {
        const current = ranges[ranges.length - 1];
        current.to = Math.max(current.to, cockroachX);
      }
    }

    // Position visual tile sprites — snap to tile grid, pick texture per tile based on world position
    const firstTileX = Math.floor((camX - 100) / FLOOR_TILE_STEP) * FLOOR_TILE_STEP;
    for (let i = 0; i < this.floorTopSprites.length; i++) {
      const tx = firstTileX + i * FLOOR_TILE_STEP;
      this.floorTopSprites[i].x = tx;
      this.floorBottomSprites[i].x = tx;

      // Pick texture based on world position (spatial level transition)
      const tileDistance = (tx - COCKROACH_START_X) / 50;
      const tileLevelConfig = getLevelForDistance(tileDistance);
      const tileTextureKey = `floor-rounded-lv${tileLevelConfig.level}`;

      // Top floor tile: hide if inside any stepped range
      const topStepped = this.isTileStepped(tx, this.steppedTopRanges);
      this.floorTopSprites[i].setVisible(!topStepped);
      if (!topStepped && this.floorTopSprites[i].texture.key !== tileTextureKey) {
        this.floorTopSprites[i].setTexture(tileTextureKey);
      }

      // Bottom floor tile: hide if inside any stepped range
      const bottomStepped = this.isTileStepped(tx, this.steppedBottomRanges);
      this.floorBottomSprites[i].setVisible(!bottomStepped);
      if (!bottomStepped && this.floorBottomSprites[i].texture.key !== tileTextureKey) {
        this.floorBottomSprites[i].setTexture(tileTextureKey);
      }
    }

    // Spawn falling tile copies for all ranges
    for (const range of this.steppedTopRanges) {
      this.spawnFallingTilesForRange(range, this.floorTopY);
    }
    for (const range of this.steppedBottomRanges) {
      this.spawnFallingTilesForRange(range, this.floorBottomY);
    }

    // Active floor highlight — pulse the glow on the current floor
    this.floorHighlightTop.x = bodyX;
    this.floorHighlightBottom.x = bodyX;
    const currentFloor = this.player.currentFloor;
    const pulse = 0.08 + Math.sin(this.time.now * 0.004) * 0.04;
    this.floorHighlightTop.setAlpha(currentFloor === 'top' ? pulse : 0);
    this.floorHighlightBottom.setAlpha(currentFloor === 'bottom' ? pulse : 0);
  }

  private isTileStepped(tx: number, ranges: { from: number; to: number }[]): boolean {
    const tileEnd = tx + FLOOR_TILE_W;
    for (const range of ranges) {
      if (tileEnd > range.from && tileEnd < range.to) return true;
    }
    return false;
  }

  private spawnFallingTilesForRange(range: { from: number; to: number; lastFallX: number }, floorY: number): void {
    // Snap to tile grid from the last spawned position
    let startX = Math.floor((range.lastFallX + 1) / FLOOR_TILE_STEP) * FLOOR_TILE_STEP;
    if (startX <= range.lastFallX) startX += FLOOR_TILE_STEP;

    const MAX_TILES_PER_FRAME = 3;
    let tilesSpawned = 0;

    while (startX + FLOOR_TILE_W < range.to && tilesSpawned < MAX_TILES_PER_FRAME) {
      const tileDistance = (startX - COCKROACH_START_X) / 50;
      const tileLevelConfig = getLevelForDistance(tileDistance);
      const textureKey = `floor-rounded-lv${tileLevelConfig.level}`;

      const fallingTile = this.add.image(startX, floorY, textureKey)
        .setOrigin(0, 0).setDepth(3);

      const spinDir = Math.random() > 0.5 ? 1 : -1;
      this.tweens.add({
        targets: fallingTile,
        y: floorY + 200 + Math.random() * 100,
        angle: spinDir * (30 + Math.random() * 60),
        alpha: 0,
        duration: 600 + Math.random() * 400,
        ease: 'Quad.easeIn',
        onComplete: () => fallingTile.destroy(),
      });

      range.lastFallX = startX;
      startX += FLOOR_TILE_STEP;
      tilesSpawned++;
    }
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
    birdImg.setScrollFactor(0);
    birdImg.setDepth(2000);
    birdImg.setScale(0.4);
    birdImg.setAlpha(0);
    birdImg.setFlipX(corner.flipX);
    birdImg.setFlipY(corner.flipY);

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
