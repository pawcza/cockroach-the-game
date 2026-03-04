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
} from '../config/constants';
import { ObstacleSpawner } from '../objects/ObstacleSpawner';
import { VisualEffects } from '../effects/VisualEffects';
import { AudioManager } from '../audio/AudioManager';

type Floor = 'top' | 'bottom';

export class GameScene extends Phaser.Scene {
  // Player
  private cockroach!: Phaser.Physics.Arcade.Sprite;
  private currentFloor: Floor = 'bottom';
  private targetFloor: Floor = 'bottom';
  private isDead = false;

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

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    // Reset ALL state
    this.score = 0;
    this.isDead = false;
    this.currentFloor = 'bottom';
    this.targetFloor = 'bottom';
    this.currentSpeed = COCKROACH_BASE_SPEED;
    this.lastSpawnX = COCKROACH_START_X + 400;
    this.startTime = this.time.now;
    this.lastScoreTime = this.time.now;
    this.lastMilestone = 1;

    // Parallax backgrounds
    this.skyBg = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'sky')
      .setOrigin(0, 0)
      .setScrollFactor(0);

    this.midBg = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'midground')
      .setOrigin(0, 0)
      .setScrollFactor(0);

    // Floor platforms
    const FLOOR_WIDTH = 50000;

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
      FLOOR_BOTTOM_Y - 32,
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
      undefined,
      this,
    );

    // Camera
    this.cameras.main.startFollow(this.cockroach, true, 1, 0);
    this.cameras.main.setFollowOffset(-200, 0);

    // Score UI
    this.scoreText = this.add
      .text(16, 16, 'Score: 0', {
        fontSize: '20px',
        color: '#ffffff',
        fontFamily: 'monospace',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setScrollFactor(0);

    this.speedText = this.add
      .text(16, 44, 'Speed: 1.0x', {
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
    const speedMultiplier = this.currentSpeed / COCKROACH_BASE_SPEED;

    // Auto-run
    this.cockroach.setVelocityX(this.currentSpeed);

    // Parallax scrolling (with breathe factor from VFX)
    const breatheFactor = this.data.get('breatheFactor') ?? 1.0;
    this.skyBg.tilePositionX = this.cameras.main.scrollX * 0.1 * breatheFactor;
    this.midBg.tilePositionX = this.cameras.main.scrollX * 0.4 * breatheFactor;

    // --- Floor transition logic ---
    // When jumping from bottom to top: cockroach needs to rise above top floor
    // before the top floor collider activates
    if (this.targetFloor === 'top' && this.currentFloor === 'bottom') {
      const cockroachBottom = this.cockroach.y + this.cockroach.height / 2;
      // Once cockroach is above the top floor, switch active floor
      if (cockroachBottom <= FLOOR_TOP_Y) {
        this.currentFloor = 'top';
      }
    }

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

    const onGround = this.cockroach.body!.touching.down || this.cockroach.body!.blocked.down;

    if (jumpPressed && onGround) {
      if (this.currentFloor === 'bottom') {
        // Jump to top floor — DON'T switch currentFloor yet!
        // Set targetFloor, apply velocity. currentFloor switches in the
        // transition logic above once cockroach clears the top platform.
        this.cockroach.setVelocityY(COCKROACH_JUMP_VELOCITY);
        this.targetFloor = 'top';
        this.audio.playJump();
      } else {
        // Small hop on top floor
        this.cockroach.setVelocityY(COCKROACH_JUMP_VELOCITY * 0.5);
        this.audio.playJump();
      }
    }

    if (dropPressed && this.currentFloor === 'top') {
      // Drop to bottom floor — switch immediately so we fall through top floor
      this.currentFloor = 'bottom';
      this.targetFloor = 'bottom';
      this.cockroach.setVelocityY(300);
      this.audio.playFloorSwitch();
    }

    // Animation state
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
    this.speedText.setText(`Speed: ${speedMultiplier.toFixed(1)}x`);

    // Speed milestones
    const currentMilestone = Math.floor(speedMultiplier);
    if (currentMilestone > this.lastMilestone && currentMilestone >= 2) {
      this.lastMilestone = currentMilestone;
      this.vfx.speedMilestoneEffect(speedMultiplier);
    }

    // Spawning
    this.handleSpawning();

    // Cleanup
    this.cleanupOffscreen();

    // Visual effects update
    this.vfx.update(speedMultiplier);

    // Audio pitch update
    this.audio.updatePitch(speedMultiplier);
  }

  private handleSpawning(): void {
    const cameraRight = this.cameras.main.scrollX + GAME_WIDTH;
    const spawnX = cameraRight + SPAWN_DISTANCE_AHEAD;

    if (spawnX - this.lastSpawnX < MIN_OBSTACLE_SPACING) return;
    this.lastSpawnX = spawnX;

    // Obstacle
    this.obstacleSpawner.spawn(spawnX);

    // Apple (maybe)
    if (Math.random() < APPLE_SPAWN_CHANCE) {
      const appleFloor: Floor = Math.random() > 0.5 ? 'top' : 'bottom';
      const appleY = (appleFloor === 'top' ? FLOOR_TOP_Y : FLOOR_BOTTOM_Y) - 30;
      const appleX = spawnX + 100 + Math.random() * 150;

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
    this.scoreText.setText(`Score: ${this.score}`);
  }
}
