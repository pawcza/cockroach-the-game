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
  SPAWN_DISTANCE_AHEAD,
  MIN_OBSTACLE_SPACING,
  APPLE_SPAWN_CHANCE,
  DASH_DURATION,
  DASH_COOLDOWN,
  DASH_SPEED_MULTIPLIER,
} from '../config/constants';

const TYSKIE_SPAWN_CHANCE = 0.05; // 5% of slots get a Tyskie
const TYSKIE_SCORE = APPLE_SCORE * 10; // 100 points
import { ObstacleSpawner } from '../objects/ObstacleSpawner';
import { VisualEffects } from '../effects/VisualEffects';
import { AudioManager } from '../audio/AudioManager';

type Floor = 'top' | 'bottom';

export class GameScene extends Phaser.Scene {
  // Player
  private cockroach!: Phaser.Physics.Arcade.Sprite;
  private cockroachOffset = 24;
  private currentFloor: Floor = 'bottom';
  private isDead = false;

  // Speed multiplier (updated each frame, used by handleSpawning)
  private speedMultiplier = 1;

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

  // Systems
  private obstacleSpawner!: ObstacleSpawner;
  private vfx!: VisualEffects;
  private audio!: AudioManager;

  // Scoring
  private score = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;
  private floorIndicator!: Phaser.GameObjects.Text;
  private startTime = 0;
  private lastScoreTime = 0;

  // Speed
  private currentSpeed = COCKROACH_BASE_SPEED;
  private lastMilestone = 1;

  // Spawning (slot-based)
  private nextSlotIndex = 0;

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

  // Apple combo
  private appleCombo = 0;
  private lastTimeMilestone = 0;

  // Dash UI
  private dashBarBg!: Phaser.GameObjects.Rectangle;
  private dashBarFill!: Phaser.GameObjects.Rectangle;
  private dashStartTime = 0;

  private distanceText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;

  // Touch UI
  private isMobile = false;
  private safeTop = 0;
  private safeBottom = 0;
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
    this.nextSlotIndex = 0;
    this.startTime = this.time.now;
    this.lastScoreTime = this.time.now;
    this.lastMilestone = 1;
    this.isDashing = false;
    this.dashCooldown = 0;
    this.dashReady = true;
    this.dashTrailTimer = null;
    this.isInvulnerable = true;
    this.isCountingDown = true;
    this.dustTimer = 0;
    this.birdOverlookTimer = 0;
    this.nextBirdOverlookTime = 15000 + Math.random() * 10000;
    this.cockroachNoiseTimer = 0;
    this.nextNoiseTime = 20000 + Math.random() * 15000;
    this.appleCombo = 0;
    this.lastTimeMilestone = 0;
    this.dashStartTime = 0;
    this.isPaused = false;

    // Calculate ENVELOP safe area — how much the top/bottom get cropped
    const gameAspect = GAME_WIDTH / GAME_HEIGHT;
    const screenAspect = window.innerWidth / window.innerHeight;
    if (screenAspect < gameAspect) {
      const visibleH = GAME_HEIGHT * screenAspect / gameAspect;
      this.safeTop = (GAME_HEIGHT - visibleH) / 2;
      this.safeBottom = this.safeTop;
    } else {
      this.safeTop = 0;
      this.safeBottom = 0;
    }

    // Parallax backgrounds
    this.skyBg = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'sky')
      .setOrigin(0, 0)
      .setScrollFactor(0);

    this.midBg = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'midground')
      .setOrigin(0, 0)
      .setScrollFactor(0);

    this.fgBg = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'foreground')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(5);

    // Floor platforms — use screen-width tiles that follow the camera
    // (avoids 50000px WebGL texture errors)
    const FLOOR_WIDTH = GAME_WIDTH + 200; // slight overscan

    this.floorTopTile = this.add
      .tileSprite(0, FLOOR_TOP_Y, FLOOR_WIDTH, FLOOR_HEIGHT, 'floor-top')
      .setOrigin(0, 0);
    this.physics.add.existing(this.floorTopTile, true);

    this.floorBottomTile = this.add
      .tileSprite(0, FLOOR_BOTTOM_Y, FLOOR_WIDTH, FLOOR_HEIGHT, 'floor-bottom')
      .setOrigin(0, 0);
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
    this.cockroach.body!.setSize(400, 200);
    this.cockroachOffset = this.cockroach.displayHeight / 2;

    // Groups
    this.obstacles = this.physics.add.group();
    this.apples = this.physics.add.group();
    this.tyskies = this.physics.add.group();

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

    // Camera
    this.cameras.main.startFollow(this.cockroach, true, 1, 0);
    this.cameras.main.setFollowOffset(-200, 0);

    // Score UI (offset by safeTop so ENVELOP doesn't crop it)
    const st = this.safeTop;
    this.scoreText = this.add
      .text(16, 16 + st, 'Punktówy: 0', {
        fontSize: '20px',
        color: '#ffffff',
        fontFamily: 'monospace',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setScrollFactor(0);

    this.speedText = this.add
      .text(16, 44 + st, 'Szybkóść: 1.0x', {
        fontSize: '14px',
        color: '#ff6600',
        fontFamily: 'monospace',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setScrollFactor(0);

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
    this.dashBarBg = this.add.rectangle(16, 68 + st, 100, 8, 0x333333, 0.8).setOrigin(0, 0).setScrollFactor(0).setDepth(100);
    this.dashBarFill = this.add.rectangle(16, 68 + st, 100, 8, 0x00ffff, 1).setOrigin(0, 0).setScrollFactor(0).setDepth(101);

    this.distanceText = this.add
      .text(16, 84 + st, 'Dystansik: 0m', {
        fontSize: '12px',
        color: '#aaaaaa',
        fontFamily: 'monospace',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setScrollFactor(0);

    this.comboText = this.add
      .text(GAME_WIDTH - 16, 44 + st, '', {
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

      // Ignore taps on the dash button or pause button area
      const dashBounds = this.touchDashBtn.getBounds();
      const pauseBounds = this.touchPauseBtn.getBounds();
      if (dashBounds.contains(pointer.x, pointer.y)) return;
      if (pauseBounds.contains(pointer.x, pointer.y)) return;

      this.swapLane();
    });

    // Audio
    this.audio = new AudioManager(this);
    this.audio.startBGM();

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
    if (this.isPaused) return;

    // Speed: accelerate forever, NO cap
    const elapsedSeconds = (this.time.now - this.startTime) / 1000;
    this.currentSpeed = COCKROACH_BASE_SPEED + elapsedSeconds * COCKROACH_ACCELERATION;
    this.speedMultiplier = this.currentSpeed / COCKROACH_BASE_SPEED;

    // Auto-run (dash multiplier applied if active)
    const dashMultiplier = this.isDashing ? DASH_SPEED_MULTIPLIER : 1;
    this.cockroach.setVelocityX(this.currentSpeed * dashMultiplier);

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

    // Slight zoom out at higher speeds for better visibility
    const targetZoom = Math.max(0.85, 1 - (this.speedMultiplier - 1) * 0.03);
    this.cameras.main.zoom = Phaser.Math.Linear(this.cameras.main.zoom, targetZoom, 0.02);

    // Progressive sky darkening with speed
    const darkening = Math.min((this.speedMultiplier - 1) * 0.15, 0.7);
    if (darkening > 0) {
      this.skyBg.setTint(
        Phaser.Display.Color.GetColor(
          Math.floor(255 * (1 - darkening)),
          Math.floor(255 * (1 - darkening * 0.8)),
          Math.floor(255 * (1 - darkening * 0.3)),
        ),
      );
    }

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

    // Speed UI
    this.speedText.setText(`Szybkóść: ${this.speedMultiplier.toFixed(1)}x`);
    // Speed text color: orange → red → magenta
    if (this.speedMultiplier >= 5) {
      this.speedText.setColor('#ff00ff');
    } else if (this.speedMultiplier >= 3) {
      this.speedText.setColor('#ff3300');
    } else if (this.speedMultiplier >= 2) {
      this.speedText.setColor('#ff6600');
    }

    // Dynamic page title
    document.title = `KARALUCH | ${this.score} pkt | ${this.speedMultiplier.toFixed(1)}x`;

    const distance = Math.floor((this.cockroach.x - COCKROACH_START_X) / 50);
    this.distanceText.setText(`Dystansik: ${distance}m`);

    // Combo display (persists until an apple is missed)
    if (this.appleCombo > 1) {
      this.comboText.setText(`KOMBÓŚ x${this.appleCombo}`);
      this.comboText.setVisible(true);
    } else {
      this.comboText.setVisible(false);
    }

    // Cockroach glow at high speeds
    if (this.speedMultiplier >= 3 && !this.isDashing && !this.isInvulnerable) {
      const glowIntensity = Math.min((this.speedMultiplier - 3) / 5, 1);
      const r = Math.floor(255 * glowIntensity);
      const g = Math.floor(100 + 155 * (1 - glowIntensity));
      this.cockroach.setTint(Phaser.Display.Color.GetColor(r, g, 50));
    } else if (!this.isDashing && !this.isInvulnerable && this.dashReady) {
      this.cockroach.clearTint();
    }

    // Speed milestones
    const currentMilestone = Math.floor(this.speedMultiplier);
    if (currentMilestone > this.lastMilestone && currentMilestone >= 2) {
      this.lastMilestone = currentMilestone;
      this.vfx.speedMilestoneEffect(this.speedMultiplier);
    }

    // Dash cooldown bar + touch button
    if (this.dashReady) {
      this.dashBarFill.width = 100;
      this.dashBarFill.setFillStyle(0x00ffff);
      this.touchDashBtn.setFillStyle(0x00ffff, 0.4);
      this.touchDashLabel.setColor('#00ffff');
    } else if (this.isDashing) {
      this.dashBarFill.width = 100;
      this.dashBarFill.setFillStyle(0xffffff);
      this.touchDashBtn.setFillStyle(0xffffff, 0.4);
      this.touchDashLabel.setColor('#ffffff');
    } else {
      const elapsed = this.time.now - this.dashStartTime;
      const progress = Math.min(elapsed / DASH_COOLDOWN, 1);
      this.dashBarFill.width = 100 * progress;
      this.dashBarFill.setFillStyle(0xff6600);
      this.touchDashBtn.setFillStyle(0xff6600, 0.4);
      this.touchDashLabel.setColor('#ff6600');
    }

    // Spawning
    this.handleSpawning();

    // Cleanup
    this.showObstacleWarnings();
    this.cleanupOffscreen();

    // Visual effects update
    this.vfx.update(this.speedMultiplier);

    // Audio pitch update
    this.audio.updatePitch(this.speedMultiplier);

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

    // End dash after DASH_DURATION, then start cooldown
    this.time.delayedCall(DASH_DURATION, () => {
      this.endDash();
      // Cooldown starts NOW (after dash ends)
      this.dashStartTime = this.time.now;
      this.time.delayedCall(DASH_COOLDOWN, () => {
        this.dashReady = true;
        this.playDashReadyEffect();
      });
    });
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
      this.cameras.main.shake(100, 0.008);
      this.floorTopTile.setTint(0x88ccff);
      this.time.delayedCall(150, () => this.floorTopTile.clearTint());
    } else {
      this.cockroach.y = FLOOR_BOTTOM_Y - this.cockroachOffset;
      this.cockroach.setVelocityY(0);
      this.currentFloor = 'bottom';
      this.audio.playFloorSwitch();
      this.cameras.main.shake(100, 0.008);
      this.floorBottomTile.setTint(0xffcc88);
      this.time.delayedCall(150, () => this.floorBottomTile.clearTint());
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
    const sb = this.safeBottom;
    const st = this.safeTop;

    // Dash button — bottom-right
    this.touchDashBtn = this.add.rectangle(
      GAME_WIDTH - 44, GAME_HEIGHT - 44 - sb, 56, 56, 0x00ffff, 0.4,
    )
      .setScrollFactor(0)
      .setDepth(3000)
      .setAlpha(btnAlpha)
      .setInteractive();

    this.touchDashLabel = this.add.text(
      GAME_WIDTH - 44, GAME_HEIGHT - 44 - sb, 'DASH', {
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
      .setAlpha(btnAlpha);

    this.touchDashBtn.on('pointerdown', () => {
      if (this.isDead || this.isPaused || this.isCountingDown) return;
      if (this.dashReady && !this.isDashing) {
        this.startDash();
      }
    });

    // Pause button — top-right
    this.touchPauseBtn = this.add.text(
      GAME_WIDTH - 20, 12 + st, '\u23f8', {
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
    // Slot-based spawning: the world is divided into equal-width slots.
    // Each slot gets exactly ONE thing: obstacle, apple, or nothing.
    // Slot width grows with speed so everything stays dodgeable.
    const slotWidth = MIN_OBSTACLE_SPACING * Math.max(1, this.speedMultiplier * 0.3);
    const slotOrigin = COCKROACH_START_X + 400; // first slot starts ahead of start position
    const cameraRight = this.cameras.main.scrollX + GAME_WIDTH;
    const spawnHorizon = cameraRight + SPAWN_DISTANCE_AHEAD;

    // Fill slots up to the spawn horizon
    while (true) {
      const slotX = slotOrigin + this.nextSlotIndex * slotWidth;
      if (slotX > spawnHorizon) break;

      this.nextSlotIndex++;

      // Decide what goes in this slot
      const roll = Math.random();
      if (roll < TYSKIE_SPAWN_CHANCE) {
        // Tyskie slot (rare!)
        const tFloor: Floor = Math.random() > 0.5 ? 'top' : 'bottom';
        const tY = (tFloor === 'top' ? FLOOR_TOP_Y : FLOOR_BOTTOM_Y) - 30;
        const tyskie = this.tyskies.create(slotX, tY, 'tyskie') as Phaser.Physics.Arcade.Sprite;
        tyskie.setScale(0.15);
        (tyskie.body as Phaser.Physics.Arcade.Body).allowGravity = false;
        tyskie.setImmovable(true);
        // Gentle bobbing
        this.tweens.add({
          targets: tyskie,
          y: tY - 6,
          duration: 500,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        // Golden glow
        tyskie.setTint(0xffdd00);
      } else if (roll < TYSKIE_SPAWN_CHANCE + APPLE_SPAWN_CHANCE) {
        // Apple slot
        const appleFloor: Floor = Math.random() > 0.5 ? 'top' : 'bottom';
        const appleY = (appleFloor === 'top' ? FLOOR_TOP_Y : FLOOR_BOTTOM_Y) - 30;
        const apple = this.apples.create(slotX, appleY, 'apple-spin') as Phaser.Physics.Arcade.Sprite;
        apple.play('apple-spin');
        apple.setScale(0.3);
        (apple.body as Phaser.Physics.Arcade.Body).allowGravity = false;
        apple.setImmovable(true);
      } else {
        // Obstacle slot
        this.obstacleSpawner.spawn(slotX, this.speedMultiplier);
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
        this.appleCombo = 0;
        sprite.destroy();
      }
    });

    this.tyskies.getChildren().forEach((obj) => {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      if (sprite.x < cameraLeft) {
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

    // Combo: keeps growing until an apple is missed (goes offscreen)
    this.appleCombo++;

    const comboMultiplier = Math.min(this.appleCombo, 5);
    const points = APPLE_SCORE * comboMultiplier;
    this.score += points;

    // Floating score popup with combo
    const comboText = this.appleCombo > 1 ? ` x${this.appleCombo} KOMBÓŚ!` : '';
    const comboColor = this.appleCombo >= 5 ? '#ff00ff' : this.appleCombo >= 3 ? '#ffff00' : '#00ff00';
    const comboSize = Math.min(18 + this.appleCombo * 3, 32);
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

    const points = TYSKIE_SCORE;
    this.score += points;

    // Big golden popup
    const popup = this.add.text(sprite.x, sprite.y - 20, `+${points} TYSKIE!`, {
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
        timeSurvived: Math.floor((this.time.now - this.startTime) / 1000),
        applesCollected: Math.floor((this.score - Math.floor((this.time.now - this.startTime) / 1000)) / 10),
        topSpeed: this.speedMultiplier,
        distance: Math.floor((this.cockroach.x - COCKROACH_START_X) / 50),
        obstacleType: obstacleType || null,
      });
    });
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
