import Phaser from 'phaser';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  FLOOR_BOTTOM_Y,
  FLOOR_TOP_Y,
  FLOOR_HEIGHT,
  COCKROACH_START_X,
  COCKROACH_BASE_SPEED,
  COCKROACH_ACCELERATION,
  APPLE_SCORE,
  PILL_SCORE,
  TYSKIE_SCORE,
  SPAWN_DISTANCE_AHEAD,
  MIN_OBSTACLE_SPACING,
  APPLE_SPAWN_CHANCE,
  DASH_DURATION,
  DASH_COOLDOWN,
  DASH_SPEED_BOOST,
  PILL_SPAWN_CHANCE,
  PILL_SPEED_MULTIPLIER,
  PILL_DURATION,
  PILL_WARN_TIME,
  SPEED_BOOST_PER_LEVEL,
} from '../config/constants';

const TYSKIE_SPAWN_CHANCE = 0.05; // 5% of slots get a Tyskie
import { ObstacleSpawner } from '../objects/ObstacleSpawner';
import { VisualEffects } from '../effects/VisualEffects';
import { AudioManager } from '../audio/AudioManager';
import { LEVELS, getLevelForScore, LevelConfig, POINTS_PER_LEVEL } from '../config/levels';

type Floor = 'top' | 'bottom';

export class GameScene extends Phaser.Scene {
  // Player
  private cockroach!: Phaser.Physics.Arcade.Sprite;
  private cockroachOffset = 24;
  private currentFloor: Floor = 'bottom';
  private isDead = false;

  // Speed multiplier (updated each frame, used by handleSpawning)
  private speedMultiplier = 1;

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

  // Scoring
  private score = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private levelBarBg!: Phaser.GameObjects.Rectangle;
  private levelBarFill!: Phaser.GameObjects.Rectangle;
  private levelNameText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;
  private floorIndicator!: Phaser.GameObjects.Text;
  private startTime = 0;
  private activePlayTime = 0;
  private lastFrameTime = 0;
  private lastScoreTime = 0;

  // Speed
  private currentSpeed = COCKROACH_BASE_SPEED;
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
  private pauseText!: Phaser.GameObjects.Text;
  private pauseOverlay!: Phaser.GameObjects.Rectangle;

  // Dash
  private isDashing = false;
  private dashCooldown = 0;
  private dashReady = true;
  private dashTrailTimer: Phaser.Time.TimerEvent | null = null;

  // Invulnerability
  private isInvulnerable = false;
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

  // Pickup combo — any pickup increases it, missing any resets it
  private pickupCombo = 0;
  private lastTimeMilestone = 0;

  // Dash UI
  private dashBarBg!: Phaser.GameObjects.Rectangle;
  private dashBarFill!: Phaser.GameObjects.Rectangle;
  private dashStartTime = 0;

  private distanceText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;

  // Pill effect
  private isPillActive = false;
  private pillSpeedBoost = 1;
  private pillRainbowTimer: Phaser.Time.TimerEvent | null = null;
  private pillTrailTimer: Phaser.Time.TimerEvent | null = null;
  private pillOverlay!: Phaser.GameObjects.Rectangle;
  private pillSpeedLines: Phaser.GameObjects.Rectangle[] = [];
  private pillStartTime = 0;
  private isPillWarning = false;

  // Touch UI
  private isMobile = false;
  private touchDashBtn!: Phaser.GameObjects.Rectangle;
  private touchDashLabel!: Phaser.GameObjects.Text;
  private touchPauseBtn!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    // Reset ALL state
    this.score = 0;
    this.isDead = false;
    this.currentFloor = 'bottom';
    this.speedMultiplier = 1;
    this.currentSpeed = COCKROACH_BASE_SPEED;
    this.nextSpawnX = COCKROACH_START_X + 400;
    this.startTime = this.time.now;
    this.activePlayTime = 0;
    this.lastFrameTime = this.time.now;
    this.lastScoreTime = this.time.now;
    this.lastMilestone = 1;
    this.isDashing = false;
    this.dashCooldown = 0;
    this.dashReady = true;
    if (this.dashTrailTimer) { this.dashTrailTimer.destroy(); }
    this.dashTrailTimer = null;
    this.isInvulnerable = true;
    this.isCountingDown = true;
    this.dustTimer = 0;
    this.birdOverlookTimer = 0;
    this.nextBirdOverlookTime = 15000 + Math.random() * 10000;
    this.cockroachNoiseTimer = 0;
    this.nextNoiseTime = 20000 + Math.random() * 15000;
    this.pickupCombo = 0;
    this.lastTimeMilestone = 0;
    this.dashStartTime = 0;
    this.isPaused = false;
    this.currentLevel = 1;
    this.isPillActive = false;
    this.pillSpeedBoost = 1;
    if (this.pillRainbowTimer) { this.pillRainbowTimer.destroy(); this.pillRainbowTimer = null; }
    if (this.pillTrailTimer) { this.pillTrailTimer.destroy(); this.pillTrailTimer = null; }
    this.pillStartTime = 0;
    this.pillSpeedLines.forEach(l => l.destroy());
    this.pillSpeedLines = [];
    this.isPillWarning = false;

    // Parallax backgrounds
    this.skyBg = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'lv1-sky')
      .setOrigin(0, 0)
      .setScrollFactor(0);

    this.midBg = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'lv1-bg')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1)
      .setAlpha(0.15);
    this.midBg.setBlendMode(Phaser.BlendModes.SOFT_LIGHT);

    this.fgBg = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'lv1-fg')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(LEVELS[0].fgAboveFloors ? 5 : 2);

    // Floor platforms — use screen-width tiles that follow the camera
    // (avoids 50000px WebGL texture errors)
    const FLOOR_WIDTH = GAME_WIDTH + 200; // slight overscan

    this.floorTopTile = this.add
      .tileSprite(0, FLOOR_TOP_Y, FLOOR_WIDTH, FLOOR_HEIGHT, 'lv1-floor')
      .setOrigin(0, 0);
    this.floorTopTile.setDepth(3);
    this.physics.add.existing(this.floorTopTile, true);

    this.floorBottomTile = this.add
      .tileSprite(0, FLOOR_BOTTOM_Y, FLOOR_WIDTH, FLOOR_HEIGHT, 'lv1-floor')
      .setOrigin(0, 0);
    this.floorBottomTile.setDepth(3);
    this.physics.add.existing(this.floorBottomTile, true);

    // Cockroach
    this.cockroach = this.physics.add.sprite(
      COCKROACH_START_X,
      FLOOR_BOTTOM_Y - 24,
      'cockroach',
    );
    this.cockroach.setCollideWorldBounds(false);
    this.cockroach.setFlipY(false);
    this.cockroach.setScale(0.15);
    this.cockroach.setDepth(10);
    this.cockroach.body!.setSize(400, 200);
    this.cockroachOffset = this.cockroach.displayHeight / 2;

    // Groups
    this.obstacles = this.physics.add.group();
    this.apples = this.physics.add.group();
    this.tyskies = this.physics.add.group();
    this.pills = this.physics.add.group();

    // Obstacle spawner
    this.obstacleSpawner = new ObstacleSpawner(this, this.obstacles);

    // Floor colliders with process callbacks — only collide with the active floor
    // Both are always registered, process callback decides which one is active
    this.physics.add.collider(this.cockroach, this.floorTopTile, undefined, () => {
      return this.currentFloor === 'top';
    }, this);
    this.physics.add.collider(this.cockroach, this.floorBottomTile, undefined, () => {
      return this.currentFloor === 'bottom';
    }, this);

    // Overlap detectors
    this.physics.add.overlap(
      this.cockroach,
      this.apples,
      this.collectApple as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );
    this.physics.add.overlap(
      this.cockroach,
      this.tyskies,
      this.collectTyskie as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );
    this.physics.add.overlap(
      this.cockroach,
      this.pills,
      this.collectPill as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );
    this.physics.add.overlap(
      this.cockroach,
      this.obstacles,
      this.hitObstacle as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      (_cockroach, obstacle) => {
        // Invulnerable during dash or starting invulnerability; only collide with obstacles on the same floor
        if (this.isDashing || this.isInvulnerable) return false;
        const obstacleFloor = (obstacle as Phaser.Physics.Arcade.Sprite).getData('floor');
        return !obstacleFloor || obstacleFloor === this.currentFloor;
      },
      this,
    );

    // Camera — follow horizontally only, lock vertical to Y=0
    this.cameras.main.startFollow(this.cockroach, true, 1, 0);
    this.cameras.main.setFollowOffset(-200, 0);
    this.cameras.main.scrollY = 0;

    // Score UI
    this.scoreText = this.add
      .text(16, 16, 'Punktówy: 0', {
        fontSize: '20px',
        color: '#ffffff',
        fontFamily: 'monospace',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setScrollFactor(0)
      .setDepth(100);

    // Level progress bar
    this.levelBarBg = this.add.rectangle(16, 44, 150, 12, 0x333333, 0.8).setOrigin(0, 0).setScrollFactor(0).setDepth(100);
    this.levelBarFill = this.add.rectangle(16, 44, 0, 12, 0xff6600, 1).setOrigin(0, 0).setScrollFactor(0).setDepth(101);
    this.levelNameText = this.add
      .text(16, 58, 'Lv1 Zwykła Kuchnia', {
        fontSize: '10px',
        color: '#cccccc',
        fontFamily: 'monospace',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setScrollFactor(0)
      .setDepth(100);
    this.speedText = this.add
      .text(170, 44, '1.0x', {
        fontSize: '12px',
        color: '#ff6600',
        fontFamily: 'monospace',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.floorIndicator = this.add
      .text(GAME_WIDTH - 16, GAME_HEIGHT / 2, '▼', {
        fontSize: '24px',
        color: '#ffffff',
        fontFamily: 'monospace',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(100);

    // Dash cooldown bar
    this.dashBarBg = this.add.rectangle(16, 78, 100, 8, 0x333333, 0.8).setOrigin(0, 0).setScrollFactor(0).setDepth(100);
    this.dashBarFill = this.add.rectangle(16, 78, 100, 8, 0x00ffff, 1).setOrigin(0, 0).setScrollFactor(0).setDepth(101);

    this.distanceText = this.add
      .text(16, 94, 'Dystansik: 0m', {
        fontSize: '12px',
        color: '#aaaaaa',
        fontFamily: 'monospace',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.comboText = this.add
      .text(GAME_WIDTH - 16, 44, '', {
        fontSize: '16px',
        color: '#ffff00',
        fontFamily: 'monospace',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);

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

    // Pill psychedelic overlay (hidden by default)
    this.pillOverlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xff00ff, 0)
      .setScrollFactor(0)
      .setDepth(989)
      .setBlendMode(Phaser.BlendModes.ADD);

    // Pause UI
    this.pauseOverlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6)
      .setScrollFactor(0).setDepth(2000).setVisible(false)
      .setInteractive();
    this.pauseOverlay.on('pointerdown', () => {
      if (this.isPaused) this.togglePause();
    });
    this.pauseText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'PAUZKA!', {
      fontSize: '48px',
      fontFamily: 'Georgia, serif',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2001).setVisible(false);

    // Mobile detection & touch UI
    this.isMobile = !this.sys.game.device.os.desktop;
    this.createTouchUI();

    // Pointer handler for lane swap
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isDead || this.isPaused || this.isCountingDown) return;

      // On mobile, right half = dash, left half = lane swap
      if (this.isMobile) {
        if (pointer.x >= GAME_WIDTH / 2) return; // right half is dash zone
      } else {
        // Desktop: ignore taps on dash button / pause button
        const dbX = this.touchDashBtn.x - this.touchDashBtn.width / 2;
        const dbY = this.touchDashBtn.y - this.touchDashBtn.height / 2;
        if (pointer.x >= dbX && pointer.x <= dbX + this.touchDashBtn.width &&
            pointer.y >= dbY && pointer.y <= dbY + this.touchDashBtn.height) return;
      }
      const pauseX = this.touchPauseBtn.x - this.touchPauseBtn.width / 2;
      const pauseY = this.touchPauseBtn.y;
      if (pointer.x >= pauseX && pointer.x <= pauseX + this.touchPauseBtn.width &&
          pointer.y >= pauseY && pointer.y <= pauseY + this.touchPauseBtn.height) return;

      this.swapLane();
    });

    // Audio
    this.audio = new AudioManager(this);
    this.audio.startBGM('bgm-lv1');

    // Starting invulnerability blink tween
    const blinkTween = this.tweens.add({
      targets: this.cockroach,
      alpha: { from: 1, to: 0.3 },
      duration: 120,
      yoyo: true,
      repeat: -1,
    });

    // End invulnerability after 1500ms
    this.time.delayedCall(1500, () => {
      this.isInvulnerable = false;
      blinkTween.destroy();
      this.cockroach.setAlpha(1);
    });

    // Countdown before game starts — fully freeze the cockroach
    this.cockroach.setVelocity(0, 0);
    (this.cockroach.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    this.countdownStartReal = performance.now();
    this.countdownLastShown = -1;
  }

  private updateCountdown(): void {
    const elapsed = performance.now() - this.countdownStartReal;
    const countdownTexts = ['3', '2', '1', 'JAZDA!'];
    const step = Math.floor(elapsed / 600);

    // Show each countdown text once
    if (step < countdownTexts.length && step > this.countdownLastShown) {
      this.countdownLastShown = step;
      const text = countdownTexts[step];
      const countText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, text, {
        fontSize: text === 'JAZDA!' ? '48px' : '64px',
        fontFamily: 'Georgia, serif',
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

    // End countdown after all texts shown + last text duration
    if (elapsed >= countdownTexts.length * 600) {
      this.isCountingDown = false;
      // Pin cockroach to floor and re-enable gravity
      this.cockroach.y = FLOOR_BOTTOM_Y - this.cockroachOffset;
      this.cockroach.setVelocity(0, 0);
      (this.cockroach.body as Phaser.Physics.Arcade.Body).allowGravity = true;
      this.startTime = this.time.now;
      this.lastFrameTime = this.time.now;
      this.activePlayTime = 0;
      this.lastScoreTime = this.time.now;
    }
  }

  update(): void {
    if (this.isDead) return;

    if (this.isCountingDown) {
      this.cockroach.setVelocity(0, 0);
      this.updateCountdown();
      return;
    }

    // Pause toggle
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.togglePause();
    }
    if (this.isPaused) {
      this.lastFrameTime = this.time.now;
      return;
    }

    // Accumulate active play time (excludes paused time)
    this.activePlayTime += this.time.now - this.lastFrameTime;
    this.lastFrameTime = this.time.now;

    // Speed: accelerate based on active play time + level bonus
    const elapsedSeconds = this.activePlayTime / 1000;
    const levelBonus = (this.currentLevel - 1) * SPEED_BOOST_PER_LEVEL;
    this.currentSpeed = COCKROACH_BASE_SPEED + elapsedSeconds * COCKROACH_ACCELERATION + levelBonus;
    this.speedMultiplier = this.currentSpeed / COCKROACH_BASE_SPEED;

    // Auto-run (flat dash boost + pill multiplier)
    const dashBoost = this.isDashing ? DASH_SPEED_BOOST : 0;
    this.cockroach.setVelocityX((this.currentSpeed + dashBoost) * this.pillSpeedBoost);

    // Dust trail particles
    this.dustTimer += this.game.loop.delta;
    const dustInterval = Math.max(50, 150 / this.speedMultiplier);
    const onGroundForDust = this.cockroach.body!.touching.down || this.cockroach.body!.blocked.down;
    if (this.dustTimer >= dustInterval && onGroundForDust) {
      this.dustTimer = 0;
      const dust = this.add.circle(
        this.cockroach.x - 20,
        this.cockroach.y + 10,
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

    // Slight zoom out at higher speeds for better visibility (kicks in ~Lv8+)
    const targetZoom = Math.max(0.88, 1 - Math.max(this.speedMultiplier - 5, 0) * 0.02);
    this.cameras.main.zoom = Phaser.Math.Linear(this.cameras.main.zoom, targetZoom, 0.02);

    // Progressive sky darkening with speed (kicks in ~Lv7+)
    const darkening = Math.min(Math.max(this.speedMultiplier - 3.5, 0) * 0.08, 0.5);
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

    // Move floor tiles to follow camera (they're screen-width, not world-width)
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
    if (this.cockroach.y > GAME_HEIGHT + 50 || this.cockroach.y < -100) {
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
      this.swapLane();
    }

    // Floor indicator
    if (this.currentFloor === 'top') {
      this.floorIndicator.setText('▲ GÓRA');
      this.floorIndicator.setColor('#88ccff');
    } else {
      this.floorIndicator.setText('▼ DÓŁ');
      this.floorIndicator.setColor('#ffcc88');
    }

    // Dash
    const dashPressed =
      Phaser.Input.Keyboard.JustDown(this.shiftKey) ||
      Phaser.Input.Keyboard.JustDown(this.rightKey);

    if (dashPressed && this.dashReady && !this.isDashing) {
      this.startDash();
    }

    // Dash duration/cooldown check (update-loop-based, no delayedCall)
    if (this.dashStartTime > 0 && !this.dashReady) {
      const dashElapsed = this.time.now - this.dashStartTime;
      if (this.isDashing && dashElapsed >= DASH_DURATION) {
        this.endDash();
      }
      if (!this.isDashing && dashElapsed >= DASH_DURATION + DASH_COOLDOWN) {
        this.dashReady = true;
        this.dashStartTime = 0;
        this.playDashReadyEffect();
      }
    }

    // Survival score (+1 per second)
    if (this.time.now - this.lastScoreTime >= 1000) {
      this.score += 1;
      this.lastScoreTime = this.time.now;
      this.updateScoreText();
    }

    // Survival time milestones
    const survivalSeconds = Math.floor(elapsedSeconds);
    const milestones: Record<number, string> = {
      10: 'JESZCZE ŻYJESZ?!',
      30: 'PRZETRWAŁEŚ PÓŁ MINUTKI!',
      60: 'MINUTOWY MISTRZ KARALUCHA!',
      120: 'DWA MINUTY? SZACUNECZEK!',
      180: 'LEGENDA KUCHENNA!',
      300: 'NIEŚMIERTELNY ROBACZEK!',
    };
    if (milestones[survivalSeconds] && survivalSeconds > this.lastTimeMilestone) {
      this.lastTimeMilestone = survivalSeconds;
      const milestone = this.add.text(
        GAME_WIDTH / 2, GAME_HEIGHT - 40,
        milestones[survivalSeconds],
        {
          fontSize: '20px',
          fontFamily: 'monospace',
          color: '#ffff00',
          stroke: '#000000',
          strokeThickness: 4,
        },
      );
      milestone.setOrigin(0.5);
      milestone.setScrollFactor(0);
      milestone.setDepth(999);
      this.tweens.add({
        targets: milestone,
        y: milestone.y - 60,
        alpha: 0,
        scale: 1.5,
        duration: 2000,
        ease: 'Power2',
        onComplete: () => milestone.destroy(),
      });
    }

    // Level progression check
    const newLevelConfig = getLevelForScore(this.score);
    if (newLevelConfig.level !== this.currentLevel) {
      this.currentLevel = newLevelConfig.level;
      this.switchLevel(newLevelConfig);
    }

    // Level bar + speed UI
    const levelConfig = getLevelForScore(this.score);
    const scoreInLevel = this.score - (levelConfig.level - 1) * POINTS_PER_LEVEL;
    const levelProgress = levelConfig.level >= LEVELS.length ? 1 : Math.min(scoreInLevel / POINTS_PER_LEVEL, 1);
    this.levelBarFill.width = 150 * levelProgress;
    this.levelNameText.setText(`Lv${levelConfig.level} ${levelConfig.name}`);

    // Bar color: orange → red → magenta based on speed
    if (this.speedMultiplier >= 5) {
      this.levelBarFill.setFillStyle(0xff00ff);
      this.speedText.setColor('#ff00ff');
    } else if (this.speedMultiplier >= 3) {
      this.levelBarFill.setFillStyle(0xff3300);
      this.speedText.setColor('#ff3300');
    } else {
      this.levelBarFill.setFillStyle(0xff6600);
      this.speedText.setColor('#ff6600');
    }
    this.speedText.setText(`${this.speedMultiplier.toFixed(1)}x`);

    // Dynamic page title
    document.title = `KARALUCH | ${this.score} pkt | ${this.speedMultiplier.toFixed(1)}x`;

    const distance = Math.floor((this.cockroach.x - COCKROACH_START_X) / 50);
    this.distanceText.setText(`Dystansik: ${distance}m`);

    // Combo display
    if (this.pickupCombo > 1) {
      const multiplier = this.getComboMultiplier();
      this.comboText.setText(`KOMBÓŚ x${multiplier.toFixed(1)}`);
      this.comboText.setVisible(true);
    } else {
      this.comboText.setVisible(false);
    }

    // Pill duration check (update-loop-based, no delayedCall)
    if (this.isPillActive && this.pillStartTime > 0) {
      const pillElapsed = this.time.now - this.pillStartTime;

      // Enter warning phase
      if (!this.isPillWarning && pillElapsed >= PILL_DURATION - PILL_WARN_TIME) {
        this.isPillWarning = true;
        // Stop rainbow trail and blink during warning
        if (this.pillTrailTimer) {
          this.pillTrailTimer.destroy();
          this.pillTrailTimer = null;
        }
        if (this.pillRainbowTimer) {
          this.pillRainbowTimer.destroy();
          this.pillRainbowTimer = null;
        }
      }

      // End pill effect
      if (pillElapsed >= PILL_DURATION) {
        this.endPillEffect();
      }
    }

    // Cockroach glow at high speeds (pill mode overrides this)
    if (this.isPillActive) {
      if (this.isPillWarning) {
        // Warning phase: rapid blinking between normal and pill tint
        const blinkOn = Math.floor(this.time.now / 100) % 2 === 0;
        if (blinkOn) {
          this.cockroach.setTint(0xff00ff);
          this.cockroach.setAlpha(1);
        } else {
          this.cockroach.clearTint();
          this.cockroach.setAlpha(0.4);
        }
        this.cockroach.setScale(0.15);
        // Overlay flickers with warning
        this.pillOverlay.setFillStyle(0xff00ff, blinkOn ? 0.1 : 0);
      } else {
        // Full pill mode: rainbow overlay + throb
        const t = this.time.now * 0.003;
        const r = Math.floor((Math.sin(t) + 1) * 127);
        const g = Math.floor((Math.sin(t + 2.094) + 1) * 127);
        const b = Math.floor((Math.sin(t + 4.189) + 1) * 127);
        this.pillOverlay.setFillStyle(Phaser.Display.Color.GetColor(r, g, b), 0.15 + Math.sin(t * 1.5) * 0.05);

        // Cockroach pulsing throb
        const throb = 0.15 + Math.sin(this.time.now * 0.01) * 0.01;
        this.cockroach.setScale(throb);
      }
    } else if (this.speedMultiplier >= 3 && !this.isDashing && !this.isInvulnerable) {
      const glowIntensity = Math.min((this.speedMultiplier - 3) / 5, 1);
      const r = Math.floor(255 * glowIntensity);
      const g = Math.floor(100 + 155 * (1 - glowIntensity));
      this.cockroach.setTint(Phaser.Display.Color.GetColor(r, g, 50));
    } else if (!this.isDashing && !this.isInvulnerable && this.dashReady) {
      this.cockroach.clearTint();
    }


    // Dash cooldown bar + touch button
    if (this.dashReady) {
      this.dashBarFill.width = 100;
      this.dashBarFill.setFillStyle(0x00ffff);
      this.touchDashBtn.setFillStyle(0x00ffff, 0.4);
      this.touchDashLabel.setColor('#00ffff');
    } else {
      const totalCooldown = DASH_DURATION + DASH_COOLDOWN;
      const elapsed = this.time.now - this.dashStartTime;
      const progress = Math.min(elapsed / totalCooldown, 1);
      this.dashBarFill.width = 100 * progress;
      if (this.isDashing) {
        this.dashBarFill.setFillStyle(0xffffff);
        this.touchDashBtn.setFillStyle(0xffffff, 0.4);
        this.touchDashLabel.setColor('#ffffff');
      } else {
        this.dashBarFill.setFillStyle(0xff6600);
        this.touchDashBtn.setFillStyle(0xff6600, 0.4);
        this.touchDashLabel.setColor('#ff6600');
      }
    }

    // Spawning
    this.handleSpawning();

    // Cleanup
    this.showObstacleWarnings();
    this.cleanupOffscreen();

    // Visual effects update
    this.vfx.update(this.speedMultiplier);

    // Audio pitch update (pill mode speeds up BGM further)
    this.audio.updatePitch(this.speedMultiplier * this.pillSpeedBoost);

    // Bird overlook — occasionally a pigeon peeks from a screen corner
    this.birdOverlookTimer += this.game.loop.delta;
    if (this.birdOverlookTimer >= this.nextBirdOverlookTime) {
      this.birdOverlookTimer = 0;
      this.nextBirdOverlookTime = 15000 + Math.random() * 10000;
      this.spawnBirdOverlook();
    }

    // Cockroach ambient noise — only play if previous one finished
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

  private startDash(): void {
    this.isDashing = true;
    this.dashReady = false;
    this.dashStartTime = this.time.now;

    // Visual: semi-transparent + yellow tint
    this.cockroach.setAlpha(0.5);
    this.cockroach.setTint(0xffffaa);

    // Audio
    this.audio.playDash();

    // Afterimage trail: spawn a fading copy every 50ms
    this.dashTrailTimer = this.time.addEvent({
      delay: 50,
      repeat: Math.floor(DASH_DURATION / 50) - 1,
      callback: () => {
        this.spawnAfterimage();
      },
    });

    // Dash timing is handled in update() via dashStartTime
  }

  private endDash(): void {
    this.isDashing = false;
    this.cockroach.setAlpha(1);
    this.cockroach.clearTint();

    if (this.dashTrailTimer) {
      this.dashTrailTimer.destroy();
      this.dashTrailTimer = null;
    }

    // Destroy any obstacles currently overlapping the cockroach so they don't kill on next frame
    const cockroachBounds = this.cockroach.getBounds();
    this.obstacles.getChildren().forEach((obj) => {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      if (sprite.getBounds().contains(cockroachBounds.centerX, cockroachBounds.centerY)) {
        // Poof effect
        this.tweens.add({
          targets: sprite,
          alpha: 0,
          scale: 0.5,
          duration: 200,
          onComplete: () => sprite.destroy(),
        });
      }
    });
  }

  private spawnAfterimage(): void {
    // Create a static copy of the cockroach at its current position
    const afterimage = this.add.sprite(
      this.cockroach.x,
      this.cockroach.y,
      this.cockroach.texture.key,
      this.cockroach.frame.name,
    );
    afterimage.setScale(this.cockroach.scaleX, this.cockroach.scaleY);
    afterimage.setAlpha(0.4);
    // Trail color varies with speed
    const trailColors = [0xffff00, 0xff6600, 0xff00ff, 0x00ffff, 0x00ff00];
    const colorIndex = Math.floor(this.speedMultiplier) % trailColors.length;
    afterimage.setTint(trailColors[colorIndex]);
    afterimage.setFlipY(this.cockroach.flipY);

    // Fade out and destroy
    this.tweens.add({
      targets: afterimage,
      alpha: 0,
      duration: 200,
      onComplete: () => {
        afterimage.destroy();
      },
    });
  }

  private playDashReadyEffect(): void {
    // Bright pulsing glow — 3 flashes so player definitely notices
    if (this.isDead) return;
    this.cockroach.setTint(0x00ffff);
    this.tweens.add({
      targets: this.cockroach,
      alpha: { from: 1, to: 0.4 },
      duration: 150,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        this.cockroach.clearTint();
        this.cockroach.setAlpha(1);
      },
    });

    // Also flash a "DASH!" text above cockroach
    const dashText = this.add.text(
      this.cockroach.x, this.cockroach.y - 50,
      'DASHERÓWKA!', {
        fontSize: '14px',
        fontFamily: 'monospace',
        color: '#00ffff',
        stroke: '#000000',
        strokeThickness: 3,
      },
    );
    dashText.setOrigin(0.5);
    dashText.setDepth(999);
    this.tweens.add({
      targets: dashText,
      y: dashText.y - 30,
      alpha: 0,
      duration: 800,
      ease: 'Power2',
      onComplete: () => dashText.destroy(),
    });
  }

  private swapLane(): void {
    if (this.currentFloor === 'bottom') {
      this.cockroach.y = FLOOR_TOP_Y - this.cockroachOffset;
      this.cockroach.setVelocityY(0);
      this.currentFloor = 'top';
      this.audio.playJump();
    } else {
      this.cockroach.y = FLOOR_BOTTOM_Y - this.cockroachOffset;
      this.cockroach.setVelocityY(0);
      this.currentFloor = 'bottom';
      this.audio.playFloorSwitch();
    }
  }

  private togglePause(): void {
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.physics.pause();
      this.pauseOverlay.setVisible(true);
      this.pauseText.setVisible(true);
    } else {
      this.physics.resume();
      this.pauseOverlay.setVisible(false);
      this.pauseText.setVisible(false);
    }
  }

  private createTouchUI(): void {
    const btnAlpha = this.isMobile ? 0.7 : 0.3;

    // Dash button — right half of screen on mobile, small button on desktop
    const dashW = this.isMobile ? GAME_WIDTH / 2 : 56;
    const dashH = this.isMobile ? GAME_HEIGHT : 56;
    const dashX = this.isMobile ? GAME_WIDTH - dashW / 2 : GAME_WIDTH - 44;
    const dashY = this.isMobile ? GAME_HEIGHT / 2 : GAME_HEIGHT - 44;
    const dashAlpha = this.isMobile ? 0 : 0.3;

    this.touchDashBtn = this.add.rectangle(
      dashX, dashY, dashW, dashH, 0x00ffff, 0.4,
    )
      .setScrollFactor(0)
      .setDepth(3000)
      .setAlpha(dashAlpha)
      .setInteractive();

    this.touchDashLabel = this.add.text(
      this.isMobile ? GAME_WIDTH - 60 : GAME_WIDTH - 44,
      this.isMobile ? GAME_HEIGHT - 30 : GAME_HEIGHT - 44,
      'DASH', {
        fontSize: '12px',
        fontFamily: 'monospace',
        color: '#00ffff',
        stroke: '#000000',
        strokeThickness: 2,
      },
    )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(3001)
      .setAlpha(this.isMobile ? 0.5 : 0.3);

    this.touchDashBtn.on('pointerdown', () => {
      if (this.isDead || this.isPaused || this.isCountingDown) return;
      if (this.dashReady && !this.isDashing) {
        this.startDash();
      }
    });

    // Pause button — top-right
    this.touchPauseBtn = this.add.text(
      GAME_WIDTH - 20, 12, '\u23f8', {
        fontSize: '28px',
        fontFamily: 'monospace',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      },
    )
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(3000)
      .setAlpha(btnAlpha)
      .setInteractive();

    this.touchPauseBtn.on('pointerdown', () => {
      if (this.isDead || this.isCountingDown) return;
      this.togglePause();
    });
  }

  private handleSpawning(): void {
    // Position-based spawning: track the world X of the next spawn point.
    // Each spawn advances nextSpawnX by the current slot width, avoiding
    // gaps caused by a changing slotWidth multiplied by a monotonic index.
    const slotWidth = MIN_OBSTACLE_SPACING * Math.max(1, this.speedMultiplier * 0.3);
    const cameraRight = this.cameras.main.scrollX + GAME_WIDTH;
    const spawnHorizon = cameraRight + SPAWN_DISTANCE_AHEAD;

    // Fill slots up to the spawn horizon
    while (this.nextSpawnX <= spawnHorizon) {
      const slotX = this.nextSpawnX;
      this.nextSpawnX += slotWidth;

      // Decide what goes in this slot
      const roll = Math.random();
      if (roll < PILL_SPAWN_CHANCE) {
        // Pill slot (ultra rare!)
        const pFloor: Floor = Math.random() > 0.5 ? 'top' : 'bottom';
        const pY = (pFloor === 'top' ? FLOOR_TOP_Y : FLOOR_BOTTOM_Y) - 30;
        const pill = this.pills.create(slotX, pY, 'pill') as Phaser.Physics.Arcade.Sprite;
        pill.setScale(0.15);
        pill.setDepth(10);
        (pill.body as Phaser.Physics.Arcade.Body).allowGravity = false;
        pill.setImmovable(true);
        // Dramatic bobbing
        this.tweens.add({
          targets: pill,
          y: pY - 10,
          duration: 400,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        // Rainbow glow cycling
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
        // Pulsing scale
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
        // Tyskie slot (rare!)
        const tFloor: Floor = Math.random() > 0.5 ? 'top' : 'bottom';
        const tY = (tFloor === 'top' ? FLOOR_TOP_Y : FLOOR_BOTTOM_Y) - 30;
        const tyskie = this.tyskies.create(slotX, tY, 'tyskie') as Phaser.Physics.Arcade.Sprite;
        tyskie.setScale(0.25);
        tyskie.setDepth(10);
        (tyskie.body as Phaser.Physics.Arcade.Body).allowGravity = false;
        tyskie.setImmovable(true);
        // Bobbing + pulsing glow
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
        // Apple slot
        const appleFloor: Floor = Math.random() > 0.5 ? 'top' : 'bottom';
        const appleY = (appleFloor === 'top' ? FLOOR_TOP_Y : FLOOR_BOTTOM_Y) - 30;
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
        // Obstacle slot
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
        // Apple went offscreen uncollected — break combo
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

    // Floating score popup with combo
    const comboText = this.pickupCombo > 1 ? ` x${multiplier.toFixed(1)} KOMBÓŚ!` : '';
    const comboColor = this.pickupCombo >= 10 ? '#ff00ff' : this.pickupCombo >= 5 ? '#ffff00' : '#00ff00';
    const comboSize = Math.min(18 + this.pickupCombo * 2, 32);
    const popup = this.add.text(sprite.x, sprite.y - 20, `+${points}${comboText}`, {
      fontSize: `${comboSize}px`,
      fontFamily: 'monospace',
      color: comboColor,
      stroke: '#000000',
      strokeThickness: 3,
    });
    popup.setOrigin(0.5);
    popup.setDepth(999);
    this.tweens.add({
      targets: popup,
      y: popup.y - 40,
      alpha: 0,
      duration: 600,
      ease: 'Power2',
      onComplete: () => popup.destroy(),
    });
    this.updateScoreText();
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

    // Big golden popup
    const comboLabel = this.pickupCombo > 1 ? ` x${multiplier.toFixed(1)}` : '';
    const popup = this.add.text(sprite.x, sprite.y - 20, `+${points}${comboLabel} TYSKIE!`, {
      fontSize: '28px',
      fontFamily: 'monospace',
      color: '#ffdd00',
      stroke: '#000000',
      strokeThickness: 4,
    });
    popup.setOrigin(0.5);
    popup.setDepth(999);
    this.tweens.add({
      targets: popup,
      y: popup.y - 50,
      alpha: 0,
      scale: 1.5,
      duration: 1000,
      ease: 'Power2',
      onComplete: () => popup.destroy(),
    });
    this.updateScoreText();
  }

  private collectPill(
    _cockroach: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    pill: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    const sprite = pill as Phaser.Physics.Arcade.Sprite;
    const px = sprite.x;
    const py = sprite.y;

    // Kill the glow tween if it exists
    const glowTween = sprite.getData('glowTween');
    if (glowTween) glowTween.destroy();
    sprite.destroy();

    // Audio
    this.audio.playPill();

    // Score with combo
    this.pickupCombo++;
    const multiplier = this.getComboMultiplier();
    const pillPoints = Math.round(PILL_SCORE * multiplier);
    this.score += pillPoints;
    this.updateScoreText();

    // If pill already active, refresh the duration (pillStartTime will be reset below)

    // Activate pill mode
    this.isPillActive = true;
    this.pillSpeedBoost = PILL_SPEED_MULTIPLIER;
    this.isInvulnerable = true;

    // --- "PIGULKA!" floating text ---
    const pillText = this.add.text(px, py - 30, 'PIGULKA!', {
      fontSize: '32px',
      fontFamily: 'Georgia, serif',
      color: '#ff00ff',
      stroke: '#000000',
      strokeThickness: 5,
      shadow: {
        offsetX: 2,
        offsetY: 2,
        color: '#00ffff',
        blur: 10,
        fill: true,
        stroke: true,
      },
    });
    pillText.setOrigin(0.5);
    pillText.setDepth(999);
    this.tweens.add({
      targets: pillText,
      y: pillText.y - 60,
      alpha: 0,
      scale: 2,
      duration: 1200,
      ease: 'Power2',
      onComplete: () => pillText.destroy(),
    });

    // --- Score popup ---
    const scorePopup = this.add.text(px, py, `+${PILL_SCORE}`, {
      fontSize: '24px',
      fontFamily: 'monospace',
      color: '#00ffff',
      stroke: '#000000',
      strokeThickness: 3,
    });
    scorePopup.setOrigin(0.5);
    scorePopup.setDepth(999);
    this.tweens.add({
      targets: scorePopup,
      y: scorePopup.y - 40,
      alpha: 0,
      duration: 800,
      ease: 'Power2',
      onComplete: () => scorePopup.destroy(),
    });

    // --- Screen flash (white -> neon) ---
    this.vfx.appleCollectEffect(px, py);
    this.cameras.main.flash(300, 180, 0, 255);

    // --- Rainbow blink on cockroach ---
    if (this.pillRainbowTimer) this.pillRainbowTimer.destroy();
    this.pillRainbowTimer = this.time.addEvent({
      delay: 60,
      repeat: -1,
      callback: () => {
        if (!this.isPillActive || this.isDead) return;
        const hue = (this.time.now * 0.5) % 360;
        const color = Phaser.Display.Color.HSLToColor(hue / 360, 1, 0.6);
        this.cockroach.setTint(color.color);
        // Rainbow alpha blink
        this.cockroach.setAlpha(0.7 + Math.sin(this.time.now * 0.02) * 0.3);
      },
    });

    // --- Rainbow afterimage trail ---
    if (this.pillTrailTimer) this.pillTrailTimer.destroy();
    this.pillTrailTimer = this.time.addEvent({
      delay: 40,
      repeat: -1,
      callback: () => {
        if (!this.isPillActive || this.isDead) return;
        this.spawnPillAfterimage();
      },
    });

    // --- Speed lines (streaking from right to left) ---
    this.startPillSpeedLines();

    // --- Pill overlay activation ---
    this.pillOverlay.setFillStyle(0xff00ff, 0.1);

    // --- Track pill start time for update-loop-based duration ---
    this.isPillWarning = false;
    this.pillStartTime = this.time.now;
  }

  private spawnPillAfterimage(): void {
    const afterimage = this.add.sprite(
      this.cockroach.x,
      this.cockroach.y,
      this.cockroach.texture.key,
      this.cockroach.frame.name,
    );
    afterimage.setScale(this.cockroach.scaleX, this.cockroach.scaleY);
    afterimage.setAlpha(0.5);
    afterimage.setFlipY(this.cockroach.flipY);

    // Rainbow color for each afterimage
    const rainbowColors = [0xff0000, 0xff8800, 0xffff00, 0x00ff00, 0x00ffff, 0x0088ff, 0xff00ff];
    const colorIdx = Math.floor(this.time.now / 60) % rainbowColors.length;
    afterimage.setTint(rainbowColors[colorIdx]);

    this.tweens.add({
      targets: afterimage,
      alpha: 0,
      scaleX: afterimage.scaleX * 1.3,
      scaleY: afterimage.scaleY * 1.3,
      duration: 300,
      onComplete: () => afterimage.destroy(),
    });
  }

  private startPillSpeedLines(): void {
    // Clear any existing speed lines
    this.pillSpeedLines.forEach(l => l.destroy());
    this.pillSpeedLines = [];

    // Spawn speed lines periodically
    const spawnLine = () => {
      if (!this.isPillActive || this.isDead) return;
      const lineY = Phaser.Math.Between(0, GAME_HEIGHT);
      const lineWidth = Phaser.Math.Between(40, 120);
      const lineColors = [0xff00ff, 0x00ffff, 0xffff00, 0xff0088, 0x00ff88];
      const color = lineColors[Math.floor(Math.random() * lineColors.length)];
      const line = this.add.rectangle(
        GAME_WIDTH + lineWidth, lineY,
        lineWidth, 2, color, 0.6,
      );
      line.setScrollFactor(0);
      line.setDepth(988);
      line.setBlendMode(Phaser.BlendModes.ADD);
      this.pillSpeedLines.push(line);

      this.tweens.add({
        targets: line,
        x: -lineWidth,
        alpha: 0,
        duration: 200 + Math.random() * 200,
        ease: 'Linear',
        onComplete: () => {
          const idx = this.pillSpeedLines.indexOf(line);
          if (idx >= 0) this.pillSpeedLines.splice(idx, 1);
          line.destroy();
        },
      });
    };

    // Spawn lines rapidly
    this.time.addEvent({
      delay: 30,
      repeat: Math.floor(PILL_DURATION / 30),
      callback: spawnLine,
    });
  }

  private endPillEffect(): void {
    this.isPillActive = false;
    this.isPillWarning = false;
    this.pillSpeedBoost = 1;
    this.isInvulnerable = false;
    this.pillStartTime = 0;

    // Stop rainbow blink
    if (this.pillRainbowTimer) {
      this.pillRainbowTimer.destroy();
      this.pillRainbowTimer = null;
    }

    // Stop trail
    if (this.pillTrailTimer) {
      this.pillTrailTimer.destroy();
      this.pillTrailTimer = null;
    }

    // Reset cockroach visuals
    this.cockroach.clearTint();
    this.cockroach.setAlpha(1);
    this.cockroach.setScale(0.15);

    // Hide pill overlay
    this.pillOverlay.setFillStyle(0x000000, 0);

    // Clean up remaining speed lines
    this.pillSpeedLines.forEach(l => l.destroy());
    this.pillSpeedLines = [];

    // Flash effect on end
    this.cameras.main.flash(200, 255, 255, 255);

    // "KONIEC JAZDY!" text popup
    const endText = this.add.text(
      GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20,
      'KONIEC JAZDY!', {
        fontSize: '36px',
        fontFamily: 'Georgia, serif',
        color: '#ffff00',
        stroke: '#000000',
        strokeThickness: 5,
      },
    );
    endText.setOrigin(0.5);
    endText.setScrollFactor(0);
    endText.setDepth(999);
    this.tweens.add({
      targets: endText,
      y: endText.y - 50,
      alpha: 0,
      scale: 1.5,
      duration: 1500,
      ease: 'Power2',
      onComplete: () => endText.destroy(),
    });
  }

  private switchLevel(config: LevelConfig): void {
    // Swap textures (tileSprites use setTexture)
    this.skyBg.setTexture(config.skyKey);
    this.midBg.setTexture(config.bgKey);
    this.fgBg.setTexture(config.fgKey);

    // FG depth depends on level
    this.fgBg.setDepth(config.fgAboveFloors ? 5 : 2);

    // Floor tiles — same texture for both
    this.floorTopTile.setTexture(config.floorKey);
    this.floorBottomTile.setTexture(config.floorKey);

    // BGM crossfade
    this.audio.switchBGM(config.bgmKey);

    // Level announcement text
    this.showLevelAnnouncement(config);
  }

  private showLevelAnnouncement(config: LevelConfig): void {
    const levelLabel = `POZIOM ${config.level}`;
    const nameLabel = config.name.toUpperCase();

    const levelText = this.add.text(GAME_WIDTH / 2, 60, levelLabel, {
      fontSize: '24px',
      fontFamily: 'Georgia, serif',
      color: '#ffff00',
      stroke: '#000000',
      strokeThickness: 4,
    });
    levelText.setOrigin(0.5);
    levelText.setScrollFactor(0);
    levelText.setDepth(1000);
    levelText.setScale(0.5);
    levelText.setAlpha(0);

    const nameText = this.add.text(GAME_WIDTH / 2, 95, nameLabel, {
      fontSize: '36px',
      fontFamily: 'Georgia, serif',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 6,
      shadow: {
        offsetX: 2,
        offsetY: 2,
        color: '#ff6600',
        blur: 8,
        fill: true,
        stroke: true,
      },
    });
    nameText.setOrigin(0.5);
    nameText.setScrollFactor(0);
    nameText.setDepth(1000);
    nameText.setScale(0.5);
    nameText.setAlpha(0);

    this.tweens.add({
      targets: [levelText, nameText],
      scale: 1,
      alpha: 1,
      duration: 300,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: [levelText, nameText],
          alpha: 0,
          scale: 1.3,
          duration: 500,
          delay: 1500,
          ease: 'Power2',
          onComplete: () => {
            levelText.destroy();
            nameText.destroy();
          },
        });
      },
    });

    this.cameras.main.shake(200, 0.01);
  }

  private hitObstacle(
    _cockroach: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    obstacle: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    const obstacleType = (obstacle as Phaser.Physics.Arcade.Sprite).getData('type') || null;
    this.die(obstacleType);
  }

  private die(obstacleType?: string | null): void {
    if (this.isDead) return;
    this.isDead = true;

    // Reset dash state on death
    if (this.dashTrailTimer) {
      this.dashTrailTimer.destroy();
      this.dashTrailTimer = null;
    }
    this.isDashing = false;
    this.dashReady = true;

    // Reset pill state on death
    if (this.isPillActive) {
      this.isPillActive = false;
      this.isPillWarning = false;
      this.pillSpeedBoost = 1;
      if (this.pillRainbowTimer) { this.pillRainbowTimer.destroy(); this.pillRainbowTimer = null; }
      if (this.pillTrailTimer) { this.pillTrailTimer.destroy(); this.pillTrailTimer = null; }
      this.pillStartTime = 0;
      this.pillOverlay.setFillStyle(0x000000, 0);
      this.pillSpeedLines.forEach(l => l.destroy());
      this.pillSpeedLines = [];
    }

    document.title = `ZGNIOTŁEŚ SIĘ! | ${this.score} pkt`;
    this.cameras.main.shake(300, 0.02);

    this.cockroach.setTint(0x444444);
    this.sound.play('cockroach-hiss', { volume: 0.7 });
    this.cockroach.setVelocity(-50, -300);
    (this.cockroach.body as Phaser.Physics.Arcade.Body).allowGravity = true;

    // Spin while falling
    this.tweens.add({
      targets: this.cockroach,
      angle: 720,
      duration: 1000,
      ease: 'Linear',
    });

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
        topSpeed: this.speedMultiplier,
        distance: Math.floor((this.cockroach.x - COCKROACH_START_X) / 50),
        obstacleType: obstacleType || null,
        level: this.currentLevel,
      });
    });
  }

  /** Combo multiplier: 10 combo = 1.5x, 20 combo = 2.0x, etc. */
  private getComboMultiplier(): number {
    return 1 + this.pickupCombo * 0.025;
  }

  private updateScoreText(): void {
    this.scoreText.setText(`Punktówy: ${this.score}`);
  }

  private spawnBirdOverlook(): void {
    const corners = [
      { x: 60, y: GAME_HEIGHT - 60, flipX: false, flipY: false },   // bottom-left (original)
      { x: GAME_WIDTH - 60, y: GAME_HEIGHT - 60, flipX: true, flipY: false },  // bottom-right
      { x: 60, y: 60, flipX: false, flipY: true },                   // top-left
      { x: GAME_WIDTH - 60, y: 60, flipX: true, flipY: true },      // top-right
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

    // Fade in, hold, fade out
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
    const cameraRight = this.cameras.main.scrollX + GAME_WIDTH;
    const warningZoneStart = cameraRight - 50;
    const warningZoneEnd = cameraRight + 300;

    this.obstacles.getChildren().forEach((obj) => {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      if (sprite.x > warningZoneStart && sprite.x < warningZoneEnd && !sprite.getData('warned')) {
        sprite.setData('warned', true);
        const obstacleFloor = sprite.getData('floor');
        if (obstacleFloor && obstacleFloor !== this.currentFloor) return;

        const warningY = sprite.y < GAME_HEIGHT / 2 ? 30 : GAME_HEIGHT - 30;
        const warning = this.add.text(GAME_WIDTH - 30, warningY, '!', {
          fontSize: '24px',
          fontFamily: 'monospace',
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
