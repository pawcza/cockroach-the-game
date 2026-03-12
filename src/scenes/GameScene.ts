import Phaser from 'phaser';
import {
  FLOOR_BOTTOM_Y,
  FLOOR_TOP_Y,
  FLOOR_HEIGHT,
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
import { VisualEffects } from '../effects/VisualEffects';
import { AudioManager } from '../audio/AudioManager';
import { LEVELS, getLevelForScore, LevelConfig, POINTS_PER_LEVEL } from '../config/levels';
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

  // Level progression
  private currentLevel = 0;

  // Backgrounds
  private skyBg!: Phaser.GameObjects.TileSprite;
  private midBg!: Phaser.GameObjects.TileSprite;
  private fgBg!: Phaser.GameObjects.TileSprite;

  // Floors
  private floorTopTile!: Phaser.GameObjects.TileSprite;
  private floorBottomTile!: Phaser.GameObjects.TileSprite;

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
  private lastTimeMilestone = 0;

  // Mobile detection
  private isMobile = false;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    // Reset ALL state
    this.score = 0;
    this.isDead = false;
    this.nextSpawnX = COCKROACH_START_X + 400;
    this.startTime = this.time.now;
    this.activePlayTime = 0;
    this.lastFrameTime = this.time.now;
    this.lastScoreTime = this.time.now;
    this.lastMilestone = 1;
    this.isCountingDown = true;
    this.dustTimer = 0;
    this.birdOverlookTimer = 0;
    this.nextBirdOverlookTime = 15000 + Math.random() * 10000;
    this.cockroachNoiseTimer = 0;
    this.nextNoiseTime = 20000 + Math.random() * 15000;
    this.pickupCombo = 0;
    this.lastTimeMilestone = 0;
    this.isPaused = false;
    this.currentLevel = 1;

    // Screen dimensions
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;

    // Mobile floor positions: 72px from bottom, 100px gap
    this.isMobile = !this.sys.game.device.os.desktop;
    if (this.isMobile) {
      this.floorBottomY = h - 72;
      this.floorTopY = h - 172;
    } else {
      this.floorBottomY = FLOOR_BOTTOM_Y;
      this.floorTopY = FLOOR_TOP_Y;
    }

    // Parallax backgrounds
    this.skyBg = this.add
      .tileSprite(0, 0, w, h, 'lv1-sky')
      .setOrigin(0, 0)
      .setScrollFactor(0);

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
      .setDepth(LEVELS[0].fgAboveFloors ? 5 : 2);

    // Floor platforms
    const FLOOR_WIDTH = w + 200;

    this.floorTopTile = this.add
      .tileSprite(0, this.floorTopY, FLOOR_WIDTH, FLOOR_HEIGHT, 'lv1-floor')
      .setOrigin(0, 0);
    this.floorTopTile.setDepth(3);
    this.physics.add.existing(this.floorTopTile, true);

    this.floorBottomTile = this.add
      .tileSprite(0, this.floorBottomY, FLOOR_WIDTH, FLOOR_HEIGHT, 'lv1-floor')
      .setOrigin(0, 0);
    this.floorBottomTile.setDepth(3);
    this.physics.add.existing(this.floorBottomTile, true);

    // Audio (created before Player since Player needs it)
    this.audio = new AudioManager(this);

    // Player
    this.player = new Player(this, this.audio, this.floorTopY, this.floorBottomY);
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

    // Floor colliders with process callbacks
    this.physics.add.collider(this.player.sprite, this.floorTopTile, undefined, () => {
      return this.player.currentFloor === 'top';
    }, this);
    this.physics.add.collider(this.player.sprite, this.floorBottomTile, undefined, () => {
      return this.player.currentFloor === 'bottom';
    }, this);

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
      onSwap: () => this.player.swapLane(),
      onDash: () => this.player.startDash(),
      isDisabled: () => this.isDead || this.isPaused || this.isCountingDown,
      isDashAllowed: () => this.player.dashReady && !this.player.isDashing,
    });
    this.touchControls.create();

    // Pointer handler for lane swap (desktop only -- mobile uses button)
    if (!this.isMobile) {
      this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (this.isDead || this.isPaused || this.isCountingDown) return;

        // Ignore taps on dash button / pause button
        const dashBtn = this.touchControls.dashButton;
        const dbX = dashBtn.x - dashBtn.width / 2;
        const dbY = dashBtn.y - dashBtn.height / 2;
        if (pointer.x >= dbX && pointer.x <= dbX + dashBtn.width &&
            pointer.y >= dbY && pointer.y <= dbY + dashBtn.height) return;
        const pauseBtn = this.hud.pauseButton;
        const pauseX = pauseBtn.x - pauseBtn.width / 2;
        const pauseY = pauseBtn.y;
        if (pointer.x >= pauseX && pointer.x <= pauseX + pauseBtn.width &&
            pointer.y >= pauseY && pointer.y <= pauseY + pauseBtn.height) return;

        this.player.swapLane();
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
    if (this.isDead) return;

    if (this.isCountingDown) {
      this.player.freezeForCountdown();
      this.updateCountdown();
      return;
    }

    // Unpause countdown (3-2-1 after resuming from pause)
    if (this.isUnpauseCountdown) {
      this.updateUnpauseCountdown();
      this.lastFrameTime = this.time.now;
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
          break;
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
    const dustInterval = Math.max(50, 150 / this.player.speedMultiplier);
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

    // Parallax scrolling (with breathe factor from VFX)
    const breatheFactor = this.data.get('breatheFactor') ?? 1.0;
    this.skyBg.tilePositionX = this.cameras.main.scrollX * 0.1 * breatheFactor;
    this.midBg.tilePositionX = this.cameras.main.scrollX * 0.4 * breatheFactor;
    this.fgBg.tilePositionX = this.cameras.main.scrollX * 0.7 * breatheFactor;

    // Slight zoom out at higher speeds
    const targetZoom = Math.max(0.88, 1 - Math.max(this.player.speedMultiplier - 5, 0) * 0.02);
    this.cameras.main.zoom = Phaser.Math.Linear(this.cameras.main.zoom, targetZoom, 0.02);

    // Progressive sky darkening with speed
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

    // Lock camera vertical position
    this.cameras.main.scrollY = 0;

    // Move floor tiles to follow camera
    const floorX = this.cameras.main.scrollX - 100;
    this.floorTopTile.x = floorX;
    this.floorTopTile.tilePositionX = this.cameras.main.scrollX;
    (this.floorTopTile.body as Phaser.Physics.Arcade.StaticBody).x = floorX;
    (this.floorTopTile.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
    this.floorBottomTile.x = floorX;
    this.floorBottomTile.tilePositionX = this.cameras.main.scrollX;
    (this.floorBottomTile.body as Phaser.Physics.Arcade.StaticBody).x = floorX;
    (this.floorBottomTile.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();

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
    }

    // Dash
    const dashPressed =
      Phaser.Input.Keyboard.JustDown(this.shiftKey) ||
      Phaser.Input.Keyboard.JustDown(this.rightKey);

    if (dashPressed && this.player.dashReady && !this.player.isDashing) {
      this.player.startDash();
    }

    // Update dash and pill state machines
    this.player.updateDash();
    this.player.updatePill();
    this.player.updateVisuals();

    // Survival score (+1 per second)
    if (this.time.now - this.lastScoreTime >= 1000) {
      this.score += 1;
      this.lastScoreTime = this.time.now;
    }

    // Survival time milestones
    const elapsedSeconds = this.activePlayTime / 1000;
    const survivalSeconds = Math.floor(elapsedSeconds);
    const milestones: Record<number, string> = {
      10: 'JESZCZE \u017bYJESZ?!',
      30: 'PRZETRWA\u0141E\u015a P\u00d3\u0141 MINUTKI!',
      60: 'MINUTOWY MISTRZ KARALUCHA!',
      120: 'DWA MINUTY? SZACUNECZEK!',
      180: 'LEGENDA KUCHENNA!',
      300: 'NIE\u015aMIERTELNY ROBACZEK!',
    };
    if (milestones[survivalSeconds] && survivalSeconds > this.lastTimeMilestone) {
      this.lastTimeMilestone = survivalSeconds;
      this.hud.showSurvivalMilestone(milestones[survivalSeconds]);
    }

    // Level progression check
    const newLevelConfig = getLevelForScore(this.score);
    if (newLevelConfig.level !== this.currentLevel) {
      this.currentLevel = newLevelConfig.level;
      this.switchLevel(newLevelConfig);
    }

    // Update HUD
    const hudData: HUDUpdateData = {
      score: this.score,
      speedMultiplier: this.player.speedMultiplier,
      cockroachX: this.player.x,
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
  }

  private togglePause(): void {
    if (this.isUnpauseCountdown) return;

    if (!this.isPaused) {
      this.isPaused = true;
      this.physics.pause();
      this.hud.showPauseOverlay();
    } else {
      // Start unpause countdown
      this.isPaused = false;
      this.hud.hidePauseOverlay();
      this.isUnpauseCountdown = true;
      this.unpauseCountdownStart = performance.now();
      this.unpauseCountdownLastShown = -1;
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

      const roll = Math.random();
      if (roll < PILL_SPAWN_CHANCE) {
        const pFloor: Floor = Math.random() > 0.5 ? 'top' : 'bottom';
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
        const tFloor: Floor = Math.random() > 0.5 ? 'top' : 'bottom';
        const tY = (tFloor === 'top' ? this.floorTopY : this.floorBottomY) - 30;
        const tyskie = this.tyskies.create(slotX, tY, 'tyskie') as Phaser.Physics.Arcade.Sprite;
        tyskie.setScale(0.25);
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
          scale: 0.3,
          duration: 600,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        tyskie.setTint(0xffdd00);
      } else if (roll < PILL_SPAWN_CHANCE + TYSKIE_SPAWN_CHANCE + APPLE_SPAWN_CHANCE) {
        const appleFloor: Floor = Math.random() > 0.5 ? 'top' : 'bottom';
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
      } else {
        this.obstacleSpawner.spawn(slotX, this.score);
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
        applesCollected: Math.floor((this.score - Math.floor(this.activePlayTime / 1000)) / 10),
        topSpeed: this.player.speedMultiplier,
        distance: Math.floor((this.player.x - COCKROACH_START_X) / 50),
        obstacleType: obstacleType || null,
        level: this.currentLevel,
      });
    });
  }

  private switchLevel(config: LevelConfig): void {
    this.skyBg.setTexture(config.skyKey);
    this.midBg.setTexture(config.bgKey);
    this.fgBg.setTexture(config.fgKey);
    this.fgBg.setDepth(config.fgAboveFloors ? 5 : 2);
    this.floorTopTile.setTexture(config.floorKey);
    this.floorBottomTile.setTexture(config.floorKey);
    this.audio.switchBGM(config.bgmKey);
    this.hud.showLevelAnnouncement(config);
  }

  /** Combo multiplier: 10 combo = 1.5x, 20 combo = 2.0x, etc. */
  private getComboMultiplier(): number {
    return 1 + this.pickupCombo * 0.025;
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
