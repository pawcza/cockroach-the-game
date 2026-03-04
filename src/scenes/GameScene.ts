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
  COCKROACH_JUMP_VELOCITY,
  APPLE_SCORE,
  SPAWN_DISTANCE_AHEAD,
  MIN_OBSTACLE_SPACING,
  APPLE_SPAWN_CHANCE,
  DASH_DURATION,
  DASH_COOLDOWN,
  DASH_SPEED_MULTIPLIER,
} from '../config/constants';
import { ObstacleSpawner } from '../objects/ObstacleSpawner';
import { VisualEffects } from '../effects/VisualEffects';
import { AudioManager } from '../audio/AudioManager';

type Floor = 'top' | 'bottom';

export class GameScene extends Phaser.Scene {
  // Player
  private cockroach!: Phaser.Physics.Arcade.Sprite;
  private currentFloor: Floor = 'bottom';
  private isDead = false;

  // Speed multiplier (updated each frame, used by handleSpawning)
  private speedMultiplier = 1;

  // Backgrounds
  private skyBg!: Phaser.GameObjects.TileSprite;
  private midBg!: Phaser.GameObjects.TileSprite;

  // Floors
  private floorTopTile!: Phaser.GameObjects.TileSprite;
  private floorBottomTile!: Phaser.GameObjects.TileSprite;

  // Groups
  private obstacles!: Phaser.Physics.Arcade.Group;
  private apples!: Phaser.Physics.Arcade.Group;

  // Systems
  private obstacleSpawner!: ObstacleSpawner;
  private vfx!: VisualEffects;
  private audio!: AudioManager;

  // Scoring
  private score = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;
  private startTime = 0;
  private lastScoreTime = 0;

  // Speed
  private currentSpeed = COCKROACH_BASE_SPEED;
  private lastMilestone = 1;

  // Spawning
  private lastSpawnX = 0;

  // Input
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private ctrlKey!: Phaser.Input.Keyboard.Key;
  private shiftKey!: Phaser.Input.Keyboard.Key;
  private rightKey!: Phaser.Input.Keyboard.Key;

  // Dash
  private isDashing = false;
  private dashCooldown = 0;
  private dashReady = true;
  private dashTrailTimer: Phaser.Time.TimerEvent | null = null;

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
    this.lastSpawnX = COCKROACH_START_X + 400;
    this.startTime = this.time.now;
    this.lastScoreTime = this.time.now;
    this.lastMilestone = 1;
    this.isDashing = false;
    this.dashCooldown = 0;
    this.dashReady = true;
    this.dashTrailTimer = null;

    // Parallax backgrounds
    this.skyBg = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'sky')
      .setOrigin(0, 0)
      .setScrollFactor(0);

    this.midBg = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'midground')
      .setOrigin(0, 0)
      .setScrollFactor(0);

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
      FLOOR_BOTTOM_Y - 48,
      'cockroach-run',
    );
    this.cockroach.setCollideWorldBounds(false);
    this.cockroach.setFlipY(false);
    this.cockroach.play('cockroach-run');

    // Groups
    this.obstacles = this.physics.add.group();
    this.apples = this.physics.add.group();

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
      this.obstacles,
      this.hitObstacle as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      (_cockroach, obstacle) => {
        // Invulnerable during dash; only collide with obstacles on the same floor
        if (this.isDashing) return false;
        const obstacleFloor = (obstacle as Phaser.Physics.Arcade.Sprite).getData('floor');
        return !obstacleFloor || obstacleFloor === this.currentFloor;
      },
      this,
    );

    // Camera
    this.cameras.main.startFollow(this.cockroach, true, 1, 0);
    this.cameras.main.setFollowOffset(-200, 0);

    // Score UI
    this.scoreText = this.add
      .text(16, 16, 'Punktówy: 0', {
        fontSize: '20px',
        color: '#ffffff',
        fontFamily: 'monospace',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setScrollFactor(0);

    this.speedText = this.add
      .text(16, 44, 'Szybkóść: 1.0x', {
        fontSize: '14px',
        color: '#ff6600',
        fontFamily: 'monospace',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setScrollFactor(0);

    // Input
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.ctrlKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL);
    this.shiftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.rightKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);

    // Visual effects
    this.vfx = new VisualEffects(this);
    this.vfx.init();

    // Audio
    this.audio = new AudioManager(this);
    this.audio.startBGM();
  }

  update(): void {
    if (this.isDead) return;

    // Speed: accelerate forever, NO cap
    const elapsedSeconds = (this.time.now - this.startTime) / 1000;
    this.currentSpeed = COCKROACH_BASE_SPEED + elapsedSeconds * COCKROACH_ACCELERATION;
    this.speedMultiplier = this.currentSpeed / COCKROACH_BASE_SPEED;

    // Auto-run (dash multiplier applied if active)
    const dashMultiplier = this.isDashing ? DASH_SPEED_MULTIPLIER : 1;
    this.cockroach.setVelocityX(this.currentSpeed * dashMultiplier);

    // Parallax scrolling (with breathe factor from VFX)
    const breatheFactor = this.data.get('breatheFactor') ?? 1.0;
    this.skyBg.tilePositionX = this.cameras.main.scrollX * 0.1 * breatheFactor;
    this.midBg.tilePositionX = this.cameras.main.scrollX * 0.4 * breatheFactor;

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

    if (jumpPressed) {
      if (this.currentFloor === 'bottom') {
        // Instant teleport to top floor
        this.cockroach.y = FLOOR_TOP_Y - 48;
        this.cockroach.setVelocityY(0);
        this.currentFloor = 'top';
        this.audio.playJump();
      } else {
        // Small hop on top floor
        this.cockroach.setVelocityY(COCKROACH_JUMP_VELOCITY * 0.5);
        this.audio.playJump();
      }
    }

    if (dropPressed && this.currentFloor === 'top') {
      // Instant teleport to bottom floor
      this.cockroach.y = FLOOR_BOTTOM_Y - 48;
      this.cockroach.setVelocityY(0);
      this.currentFloor = 'bottom';
      this.audio.playFloorSwitch();
    }

    // Dash
    const dashPressed =
      Phaser.Input.Keyboard.JustDown(this.shiftKey) ||
      Phaser.Input.Keyboard.JustDown(this.rightKey);

    if (dashPressed && this.dashReady && !this.isDashing) {
      this.startDash();
    }

    // Animation state
    const onGround = this.cockroach.body!.touching.down || this.cockroach.body!.blocked.down;
    if (!onGround) {
      this.cockroach.setTexture('cockroach-jump');
    } else {
      if (this.cockroach.anims.currentAnim?.key !== 'cockroach-run') {
        this.cockroach.play('cockroach-run');
      }
    }

    // Survival score (+1 per second)
    if (this.time.now - this.lastScoreTime >= 1000) {
      this.score += 1;
      this.lastScoreTime = this.time.now;
      this.updateScoreText();
    }

    // Speed UI
    this.speedText.setText(`Szybkóść: ${this.speedMultiplier.toFixed(1)}x`);

    // Speed milestones
    const currentMilestone = Math.floor(this.speedMultiplier);
    if (currentMilestone > this.lastMilestone && currentMilestone >= 2) {
      this.lastMilestone = currentMilestone;
      this.vfx.speedMilestoneEffect(this.speedMultiplier);
    }

    // Spawning
    this.handleSpawning();

    // Cleanup
    this.cleanupOffscreen();

    // Visual effects update
    this.vfx.update(this.speedMultiplier);

    // Audio pitch update
    this.audio.updatePitch(this.speedMultiplier);
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

    // End dash after DASH_DURATION
    this.time.delayedCall(DASH_DURATION, () => {
      this.endDash();
    });

    // Cooldown: re-enable dash after DASH_COOLDOWN
    this.time.delayedCall(DASH_COOLDOWN, () => {
      this.dashReady = true;
      this.playDashReadyEffect();
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
  }

  private spawnAfterimage(): void {
    // Create a static copy of the cockroach at its current position
    const afterimage = this.add.sprite(
      this.cockroach.x,
      this.cockroach.y,
      this.cockroach.texture.key,
      this.cockroach.frame.name,
    );
    afterimage.setAlpha(0.4);
    afterimage.setTint(0xffff00);
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

  private handleSpawning(): void {
    const cameraRight = this.cameras.main.scrollX + GAME_WIDTH;
    const spawnX = cameraRight + SPAWN_DISTANCE_AHEAD;

    // Scale minimum spacing with speed so obstacles stay dodgeable
    const dynamicSpacing = MIN_OBSTACLE_SPACING * Math.max(1, this.speedMultiplier * 0.8);

    if (spawnX - this.lastSpawnX < dynamicSpacing) return;
    this.lastSpawnX = spawnX;

    // Obstacle
    this.obstacleSpawner.spawn(spawnX);

    // Apple (maybe)
    if (Math.random() < APPLE_SPAWN_CHANCE) {
      const appleFloor: Floor = Math.random() > 0.5 ? 'top' : 'bottom';
      const appleY = (appleFloor === 'top' ? FLOOR_TOP_Y : FLOOR_BOTTOM_Y) - 30;
      const appleOffset = 100 + Math.random() * 150 * Math.max(1, this.speedMultiplier * 0.5);
      const appleX = spawnX + appleOffset;

      const apple = this.apples.create(appleX, appleY, 'apple') as Phaser.Physics.Arcade.Sprite;
      (apple.body as Phaser.Physics.Arcade.Body).allowGravity = false;
      apple.setImmovable(true);
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
      if (sprite.x < cameraLeft) sprite.destroy();
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
    this.score += APPLE_SCORE;
    this.updateScoreText();
  }

  private hitObstacle(): void {
    this.die();
  }

  private die(): void {
    if (this.isDead) return;
    this.isDead = true;

    this.cockroach.setVelocity(0, 0);
    this.cockroach.setTexture('cockroach-dead');
    this.cockroach.setFlipY(true);

    this.vfx.deathEffect();
    this.audio.playDeath();

    // Persist high score
    const highScore = parseInt(localStorage.getItem('cockroach-highscore') || '0', 10);
    if (this.score > highScore) {
      localStorage.setItem('cockroach-highscore', this.score.toString());
    }

    this.time.delayedCall(1500, () => {
      this.vfx.destroy();
      this.audio.destroy();
      this.scene.start('GameOverScene', { score: this.score });
    });
  }

  private updateScoreText(): void {
    this.scoreText.setText(`Punktówy: ${this.score}`);
  }
}
