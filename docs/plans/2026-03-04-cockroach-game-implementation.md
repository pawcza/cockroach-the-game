# Cockroach the Game - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an endless sidescroller game where a cockroach auto-runs, collects apples, and avoids traps across two floors with no speed cap.

**Architecture:** Phaser 3 with arcade physics, 4 scenes (Boot, Menu, Game, GameOver), procedural obstacle/apple spawning, two-floor lane system, localStorage high scores. Vite + TypeScript for dev tooling.

**Tech Stack:** Phaser 3, Vite, TypeScript

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `.gitignore`

**Step 1: Initialize the project**

```bash
cd /home/pawcza/dev/personal/cockroach-the-game
npm init -y
npm install phaser
npm install -D typescript vite
```

**Step 2: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
  },
});
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "sourceMap": true
  },
  "include": ["src/**/*"]
}
```

**Step 4: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cockroach the Game</title>
  <style>
    * { margin: 0; padding: 0; }
    body { background: #000; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; }
  </style>
</head>
<body>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

**Step 5: Create src/main.ts with minimal Phaser config**

```typescript
import Phaser from 'phaser';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 400,
  backgroundColor: '#1a0a2e',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 800 },
      debug: false,
    },
  },
  scene: [],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

new Phaser.Game(config);
```

**Step 6: Add scripts to package.json**

Add to package.json scripts:
```json
{
  "dev": "vite",
  "build": "tsc && vite build",
  "preview": "vite preview"
}
```

**Step 7: Create .gitignore**

```
node_modules/
dist/
.DS_Store
```

**Step 8: Verify it runs**

Run: `npm run dev`
Expected: Vite dev server starts, browser shows a dark purple canvas (800x400)

**Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html src/main.ts .gitignore
git commit -m "feat: scaffold Phaser 3 + Vite + TypeScript project"
```

---

### Task 2: Generate Placeholder Assets

**Files:**
- Create: `public/sprites/cockroach-run.png` (sprite sheet: 6 frames, 64x64 each)
- Create: `public/sprites/cockroach-jump.png` (single frame, 64x64)
- Create: `public/sprites/cockroach-dead.png` (single frame, 64x64)
- Create: `public/sprites/apple.png` (32x32)
- Create: `public/sprites/pest-spray.png` (64x96)
- Create: `public/sprites/newspaper.png` (96x64)
- Create: `public/sprites/onion.png` (48x48)
- Create: `public/sprites/flipper.png` (80x32)
- Create: `public/sprites/bird.png` (48x48)
- Create: `public/sprites/cat-paw.png` (64x64)
- Create: `public/backgrounds/sky.png` (800x400, tileable)
- Create: `public/backgrounds/midground.png` (800x400, tileable, transparent)
- Create: `public/backgrounds/floor-top.png` (800x64, tileable)
- Create: `public/backgrounds/floor-bottom.png` (800x64, tileable)

**Step 1: Create asset directories**

```bash
mkdir -p public/sprites public/backgrounds public/audio
```

**Step 2: Generate placeholder pixel art**

Generate simple colored rectangle/shape sprites as placeholders using a canvas-based Node script or manually create minimal pixel art PNGs. Each sprite should be identifiable by color/shape:

- Cockroach: brown rectangle with legs (sprite sheet)
- Apple: red circle with green leaf
- Pest spray: green rectangle with mist
- Newspaper: gray rolled cylinder
- Onion: purple circle
- Flipper: beige elongated shape
- Bird: dark silhouette
- Cat paw: orange with claws
- Backgrounds: gradient purples/crimsons with silhouettes

Use any pixel art tool or generate programmatically. The key is having assets to load — they'll be replaced with proper art later.

**Step 3: Commit**

```bash
git add public/
git commit -m "feat: add placeholder sprite and background assets"
```

---

### Task 3: BootScene - Asset Loading

**Files:**
- Create: `src/scenes/BootScene.ts`
- Modify: `src/main.ts` (add scene to config)

**Step 1: Create BootScene**

```typescript
import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Show loading progress
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    const progressBar = this.add.graphics();
    const progressBox = this.add.graphics();
    progressBox.fillStyle(0x222222, 0.8);
    progressBox.fillRect(width / 2 - 160, height / 2 - 15, 320, 30);

    const loadingText = this.add.text(width / 2, height / 2 - 40, 'Loading...', {
      fontSize: '20px',
      color: '#ffffff',
    }).setOrigin(0.5);

    this.load.on('progress', (value: number) => {
      progressBar.clear();
      progressBar.fillStyle(0x8b0000, 1);
      progressBar.fillRect(width / 2 - 155, height / 2 - 10, 310 * value, 20);
    });

    this.load.on('complete', () => {
      progressBar.destroy();
      progressBox.destroy();
      loadingText.destroy();
    });

    // Sprites
    this.load.spritesheet('cockroach-run', 'sprites/cockroach-run.png', {
      frameWidth: 64,
      frameHeight: 64,
    });
    this.load.image('cockroach-jump', 'sprites/cockroach-jump.png');
    this.load.image('cockroach-dead', 'sprites/cockroach-dead.png');
    this.load.image('apple', 'sprites/apple.png');
    this.load.image('pest-spray', 'sprites/pest-spray.png');
    this.load.image('newspaper', 'sprites/newspaper.png');
    this.load.image('onion', 'sprites/onion.png');
    this.load.image('flipper', 'sprites/flipper.png');
    this.load.image('bird', 'sprites/bird.png');
    this.load.image('cat-paw', 'sprites/cat-paw.png');

    // Backgrounds
    this.load.image('sky', 'backgrounds/sky.png');
    this.load.image('midground', 'backgrounds/midground.png');
    this.load.image('floor-top', 'backgrounds/floor-top.png');
    this.load.image('floor-bottom', 'backgrounds/floor-bottom.png');

    // Audio (placeholder - add files later)
    // this.load.audio('bgm', 'audio/bgm.mp3');
    // this.load.audio('jump', 'audio/jump.mp3');
    // etc.
  }

  create(): void {
    // Create cockroach animations
    this.anims.create({
      key: 'cockroach-run',
      frames: this.anims.generateFrameNumbers('cockroach-run', { start: 0, end: 5 }),
      frameRate: 12,
      repeat: -1,
    });

    this.scene.start('MenuScene');
  }
}
```

**Step 2: Update main.ts to include BootScene**

```typescript
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 400,
  backgroundColor: '#1a0a2e',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 800 },
      debug: false,
    },
  },
  scene: [BootScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

new Phaser.Game(config);
```

**Step 3: Verify loading works**

Run: `npm run dev`
Expected: Loading bar appears, fills, then transitions (will error on MenuScene not existing yet — that's fine)

**Step 4: Commit**

```bash
git add src/scenes/BootScene.ts src/main.ts
git commit -m "feat: add BootScene with asset loading and progress bar"
```

---

### Task 4: MenuScene - Title Screen

**Files:**
- Create: `src/scenes/MenuScene.ts`
- Modify: `src/main.ts` (add MenuScene to config)

**Step 1: Create MenuScene**

```typescript
import Phaser from 'phaser';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Background
    this.add.tileSprite(0, 0, width, height, 'sky').setOrigin(0, 0);

    // Title
    this.add.text(width / 2, height / 3, 'COCKROACH', {
      fontSize: '64px',
      color: '#8b0000',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 3 + 60, 'THE GAME', {
      fontSize: '32px',
      color: '#ff6600',
      fontFamily: 'Georgia, serif',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    // High score
    const highScore = localStorage.getItem('cockroach-highscore') || '0';
    this.add.text(width / 2, height / 2 + 40, `High Score: ${highScore}`, {
      fontSize: '20px',
      color: '#cccccc',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Start prompt (blinking)
    const startText = this.add.text(width / 2, height - 80, 'Press SPACE to Start', {
      fontSize: '24px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: startText,
      alpha: 0,
      duration: 500,
      ease: 'Power2',
      yoyo: true,
      repeat: -1,
    });

    // Input
    this.input.keyboard!.once('keydown-SPACE', () => {
      this.scene.start('GameScene');
    });
  }
}
```

**Step 2: Add MenuScene to main.ts scene array**

```typescript
import { MenuScene } from './scenes/MenuScene';
// ...
scene: [BootScene, MenuScene],
```

**Step 3: Verify menu displays**

Run: `npm run dev`
Expected: Title screen with "COCKROACH THE GAME", high score, blinking start prompt

**Step 4: Commit**

```bash
git add src/scenes/MenuScene.ts src/main.ts
git commit -m "feat: add MenuScene with title, high score, and start prompt"
```

---

### Task 5: GameScene - Core Gameplay Loop

This is the largest task. It implements the cockroach, two-floor system, scrolling, and basic input.

**Files:**
- Create: `src/scenes/GameScene.ts`
- Create: `src/config/constants.ts`
- Modify: `src/main.ts` (add GameScene)

**Step 1: Create constants file**

```typescript
export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 400;

// Floor positions (Y coordinates)
export const FLOOR_BOTTOM_Y = 350;
export const FLOOR_TOP_Y = 220;
export const FLOOR_HEIGHT = 16;

// Cockroach
export const COCKROACH_START_X = 150;
export const COCKROACH_BASE_SPEED = 200;
export const COCKROACH_ACCELERATION = 2; // px/s per second
export const COCKROACH_JUMP_VELOCITY = -450;
export const COCKROACH_GRAVITY = 800;

// Spawning
export const SPAWN_DISTANCE_AHEAD = 900; // spawn obstacles this far ahead of camera
export const MIN_OBSTACLE_SPACING = 250; // minimum px between obstacles
export const APPLE_SPAWN_CHANCE = 0.4; // 40% chance per spawn interval
export const OBSTACLE_SPAWN_INTERVAL = 300; // every N pixels traveled

// Scoring
export const APPLE_SCORE = 10;
export const SURVIVAL_SCORE_INTERVAL = 1000; // +1 every second
```

**Step 2: Create GameScene**

```typescript
import Phaser from 'phaser';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  FLOOR_BOTTOM_Y,
  FLOOR_TOP_Y,
  COCKROACH_START_X,
  COCKROACH_BASE_SPEED,
  COCKROACH_ACCELERATION,
  COCKROACH_JUMP_VELOCITY,
  APPLE_SCORE,
  SPAWN_DISTANCE_AHEAD,
  MIN_OBSTACLE_SPACING,
  APPLE_SPAWN_CHANCE,
  OBSTACLE_SPAWN_INTERVAL,
} from '../config/constants';

type Floor = 'top' | 'bottom';

export class GameScene extends Phaser.Scene {
  private cockroach!: Phaser.Physics.Arcade.Sprite;
  private currentFloor: Floor = 'bottom';
  private isJumping = false;
  private isDead = false;

  private skyBg!: Phaser.GameObjects.TileSprite;
  private midBg!: Phaser.GameObjects.TileSprite;
  private floorTopTile!: Phaser.GameObjects.TileSprite;
  private floorBottomTile!: Phaser.GameObjects.TileSprite;
  private floorTopBody!: Phaser.Physics.Arcade.StaticBody;
  private floorBottomBody!: Phaser.Physics.Arcade.StaticBody;

  private obstacles!: Phaser.Physics.Arcade.Group;
  private apples!: Phaser.Physics.Arcade.Group;

  private score = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private startTime = 0;
  private lastScoreTime = 0;

  private currentSpeed = COCKROACH_BASE_SPEED;
  private lastSpawnX = 0;
  private distanceTraveled = 0;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private ctrlKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    this.score = 0;
    this.isDead = false;
    this.isJumping = false;
    this.currentFloor = 'bottom';
    this.currentSpeed = COCKROACH_BASE_SPEED;
    this.lastSpawnX = COCKROACH_START_X + 400;
    this.distanceTraveled = 0;
    this.startTime = this.time.now;
    this.lastScoreTime = this.time.now;

    // Parallax backgrounds
    this.skyBg = this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'sky')
      .setOrigin(0, 0).setScrollFactor(0);
    this.midBg = this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'midground')
      .setOrigin(0, 0).setScrollFactor(0);

    // Floor platforms (static physics bodies)
    const topFloor = this.add.tileSprite(0, FLOOR_TOP_Y, 10000, 16, 'floor-top').setOrigin(0, 0);
    this.physics.add.existing(topFloor, true);
    this.floorTopTile = topFloor;
    this.floorTopBody = topFloor.body as Phaser.Physics.Arcade.StaticBody;

    const bottomFloor = this.add.tileSprite(0, FLOOR_BOTTOM_Y, 10000, 16, 'floor-bottom').setOrigin(0, 0);
    this.physics.add.existing(bottomFloor, true);
    this.floorBottomTile = bottomFloor;
    this.floorBottomBody = bottomFloor.body as Phaser.Physics.Arcade.StaticBody;

    // Cockroach
    this.cockroach = this.physics.add.sprite(COCKROACH_START_X, FLOOR_BOTTOM_Y - 32, 'cockroach-run');
    this.cockroach.setCollideWorldBounds(false);
    this.cockroach.play('cockroach-run');

    // Collide cockroach with current floor
    this.physics.add.collider(this.cockroach, bottomFloor);

    // Groups
    this.obstacles = this.physics.add.group();
    this.apples = this.physics.add.group();

    // Collisions
    this.physics.add.overlap(this.cockroach, this.apples, this.collectApple, undefined, this);
    this.physics.add.overlap(this.cockroach, this.obstacles, this.hitObstacle, undefined, this);

    // Camera follows cockroach
    this.cameras.main.startFollow(this.cockroach, true, 1, 0);
    this.cameras.main.setFollowOffset(-200, 0);

    // UI (fixed to camera)
    this.scoreText = this.add.text(16, 16, 'Score: 0', {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 3,
    }).setScrollFactor(0);

    // Input
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.ctrlKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL);
  }

  update(_time: number, delta: number): void {
    if (this.isDead) return;

    const dt = delta / 1000;

    // Increase speed over time
    const elapsed = (this.time.now - this.startTime) / 1000;
    this.currentSpeed = COCKROACH_BASE_SPEED + elapsed * COCKROACH_ACCELERATION;

    // Auto-run
    this.cockroach.setVelocityX(this.currentSpeed);

    // Parallax scrolling
    this.skyBg.tilePositionX = this.cameras.main.scrollX * 0.1;
    this.midBg.tilePositionX = this.cameras.main.scrollX * 0.4;

    // Jump input
    const jumpPressed = Phaser.Input.Keyboard.JustDown(this.spaceKey) ||
                         Phaser.Input.Keyboard.JustDown(this.cursors.up);
    const dropPressed = Phaser.Input.Keyboard.JustDown(this.ctrlKey) ||
                         Phaser.Input.Keyboard.JustDown(this.cursors.down);

    if (jumpPressed && this.cockroach.body!.touching.down) {
      if (this.currentFloor === 'bottom') {
        // Jump to top floor
        this.cockroach.setVelocityY(COCKROACH_JUMP_VELOCITY);
        this.currentFloor = 'top';
        this.swapFloorCollider();
      } else {
        // Hop on top floor
        this.cockroach.setVelocityY(COCKROACH_JUMP_VELOCITY * 0.6);
      }
    }

    if (dropPressed && this.currentFloor === 'top') {
      this.currentFloor = 'bottom';
      this.swapFloorCollider();
      this.cockroach.setVelocityY(200); // Push down
    }

    // Animation state
    if (!this.cockroach.body!.touching.down) {
      this.cockroach.setTexture('cockroach-jump');
    } else {
      if (this.cockroach.anims.currentAnim?.key !== 'cockroach-run') {
        this.cockroach.play('cockroach-run');
      }
    }

    // Survival score
    if (this.time.now - this.lastScoreTime >= 1000) {
      this.score += 1;
      this.lastScoreTime = this.time.now;
      this.updateScoreText();
    }

    // Spawn obstacles/apples
    this.handleSpawning();

    // Cleanup off-screen objects
    this.cleanupOffscreen();
  }

  private swapFloorCollider(): void {
    // Remove all floor colliders and add the correct one
    this.physics.world.colliders.destroy();
    if (this.currentFloor === 'top') {
      this.physics.add.collider(this.cockroach, this.floorTopTile);
    } else {
      this.physics.add.collider(this.cockroach, this.floorBottomTile);
    }
    // Re-add overlap detectors
    this.physics.add.overlap(this.cockroach, this.apples, this.collectApple, undefined, this);
    this.physics.add.overlap(this.cockroach, this.obstacles, this.hitObstacle, undefined, this);
  }

  private handleSpawning(): void {
    const cameraRight = this.cameras.main.scrollX + GAME_WIDTH;
    const spawnX = cameraRight + SPAWN_DISTANCE_AHEAD;

    if (spawnX - this.lastSpawnX < MIN_OBSTACLE_SPACING) return;

    this.lastSpawnX = spawnX;

    // Spawn obstacle
    const obstacleTypes = ['pest-spray', 'newspaper', 'onion', 'flipper', 'bird', 'cat-paw'];
    const type = obstacleTypes[Math.floor(Math.random() * obstacleTypes.length)];
    const floor: Floor = Math.random() > 0.5 ? 'top' : 'bottom';
    const y = floor === 'top' ? FLOOR_TOP_Y - 40 : FLOOR_BOTTOM_Y - 40;

    const obstacle = this.obstacles.create(spawnX, y, type) as Phaser.Physics.Arcade.Sprite;
    obstacle.setImmovable(true);
    obstacle.body!.allowGravity = false;
    obstacle.setVelocityX(0);

    // Maybe spawn apple nearby
    if (Math.random() < APPLE_SPAWN_CHANCE) {
      const appleFloor: Floor = Math.random() > 0.5 ? 'top' : 'bottom';
      const appleY = appleFloor === 'top' ? FLOOR_TOP_Y - 30 : FLOOR_BOTTOM_Y - 30;
      const appleX = spawnX + 100 + Math.random() * 150;
      const apple = this.apples.create(appleX, appleY, 'apple') as Phaser.Physics.Arcade.Sprite;
      apple.body!.allowGravity = false;
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

  private collectApple(_cockroach: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile, apple: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile): void {
    (apple as Phaser.Physics.Arcade.Sprite).destroy();
    this.score += APPLE_SCORE;
    this.updateScoreText();
  }

  private hitObstacle(): void {
    if (this.isDead) return;
    this.isDead = true;

    this.cockroach.setVelocity(0, 0);
    this.cockroach.setTexture('cockroach-dead');
    this.cockroach.setFlipY(true);

    // Screen flash
    this.cameras.main.flash(300, 255, 0, 0);
    this.cameras.main.shake(200, 0.02);

    // Save high score
    const highScore = parseInt(localStorage.getItem('cockroach-highscore') || '0', 10);
    if (this.score > highScore) {
      localStorage.setItem('cockroach-highscore', this.score.toString());
    }

    this.time.delayedCall(1500, () => {
      this.scene.start('GameOverScene', { score: this.score });
    });
  }

  private updateScoreText(): void {
    this.scoreText.setText(`Score: ${this.score}`);
  }
}
```

**Step 3: Add GameScene to main.ts**

```typescript
import { GameScene } from './scenes/GameScene';
// ...
scene: [BootScene, MenuScene, GameScene],
```

**Step 4: Verify gameplay**

Run: `npm run dev`
Expected: Cockroach auto-runs, camera follows, floors visible, obstacles spawn, space jumps, ctrl drops, apples collectible, death on obstacle hit

**Step 5: Commit**

```bash
git add src/scenes/GameScene.ts src/config/constants.ts src/main.ts
git commit -m "feat: add GameScene with core gameplay loop, two-floor system, spawning"
```

---

### Task 6: GameOverScene

**Files:**
- Create: `src/scenes/GameOverScene.ts`
- Modify: `src/main.ts` (add GameOverScene)

**Step 1: Create GameOverScene**

```typescript
import Phaser from 'phaser';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' });
  }

  create(data: { score: number }): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    this.cameras.main.setBackgroundColor('#0a0a0a');

    // Game over text
    this.add.text(width / 2, height / 3 - 20, 'SQUISHED!', {
      fontSize: '56px',
      color: '#8b0000',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    // Score
    this.add.text(width / 2, height / 2, `Score: ${data.score}`, {
      fontSize: '32px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // High score
    const highScore = localStorage.getItem('cockroach-highscore') || '0';
    const isNewHigh = data.score.toString() === highScore;
    this.add.text(width / 2, height / 2 + 50, `High Score: ${highScore}${isNewHigh ? ' NEW!' : ''}`, {
      fontSize: '20px',
      color: isNewHigh ? '#ffff00' : '#999999',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Restart prompt
    const restartText = this.add.text(width / 2, height - 60, 'Press SPACE to Restart', {
      fontSize: '20px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: restartText,
      alpha: 0,
      duration: 500,
      ease: 'Power2',
      yoyo: true,
      repeat: -1,
    });

    this.input.keyboard!.once('keydown-SPACE', () => {
      this.scene.start('GameScene');
    });
  }
}
```

**Step 2: Add to main.ts**

```typescript
import { GameOverScene } from './scenes/GameOverScene';
// ...
scene: [BootScene, MenuScene, GameScene, GameOverScene],
```

**Step 3: Verify full game loop**

Run: `npm run dev`
Expected: Menu -> Game -> Die -> GameOver (shows score, high score) -> Space -> Game again

**Step 4: Commit**

```bash
git add src/scenes/GameOverScene.ts src/main.ts
git commit -m "feat: add GameOverScene with score display and restart"
```

---

### Task 7: Obstacle Behaviors

Add unique behaviors to each obstacle type instead of all being static.

**Files:**
- Create: `src/objects/ObstacleSpawner.ts`
- Modify: `src/scenes/GameScene.ts` (use spawner)

**Step 1: Create ObstacleSpawner**

```typescript
import Phaser from 'phaser';
import { FLOOR_TOP_Y, FLOOR_BOTTOM_Y } from '../config/constants';

type Floor = 'top' | 'bottom';

export class ObstacleSpawner {
  private scene: Phaser.Scene;
  private obstacles: Phaser.Physics.Arcade.Group;

  constructor(scene: Phaser.Scene, obstacles: Phaser.Physics.Arcade.Group) {
    this.scene = scene;
    this.obstacles = obstacles;
  }

  spawn(x: number): void {
    const types = ['pest-spray', 'newspaper', 'onion', 'flipper', 'bird', 'cat-paw'];
    const type = types[Math.floor(Math.random() * types.length)];

    switch (type) {
      case 'onion':
        this.spawnStatic(x, type);
        break;
      case 'pest-spray':
        this.spawnPestSpray(x);
        break;
      case 'newspaper':
        this.spawnNewspaper(x);
        break;
      case 'flipper':
        this.spawnFlipper(x);
        break;
      case 'bird':
        this.spawnBird(x);
        break;
      case 'cat-paw':
        this.spawnCatPaw(x);
        break;
    }
  }

  private getFloorY(floor: Floor): number {
    return floor === 'top' ? FLOOR_TOP_Y - 40 : FLOOR_BOTTOM_Y - 40;
  }

  private randomFloor(): Floor {
    return Math.random() > 0.5 ? 'top' : 'bottom';
  }

  private spawnStatic(x: number, texture: string): void {
    const floor = this.randomFloor();
    const y = this.getFloorY(floor);
    const obs = this.obstacles.create(x, y, texture) as Phaser.Physics.Arcade.Sprite;
    obs.setImmovable(true);
    obs.body!.allowGravity = false;
  }

  private spawnPestSpray(x: number): void {
    // Spray appears on one floor, mist extends to cover area
    const floor = this.randomFloor();
    const y = this.getFloorY(floor);
    const obs = this.obstacles.create(x, y, 'pest-spray') as Phaser.Physics.Arcade.Sprite;
    obs.setImmovable(true);
    obs.body!.allowGravity = false;

    // Pulsing alpha to simulate spraying
    this.scene.tweens.add({
      targets: obs,
      alpha: { from: 0.6, to: 1 },
      duration: 300,
      yoyo: true,
      repeat: -1,
    });
  }

  private spawnNewspaper(x: number): void {
    const floor = this.randomFloor();
    const startY = this.getFloorY(floor) - 150;
    const endY = this.getFloorY(floor);
    const obs = this.obstacles.create(x, startY, 'newspaper') as Phaser.Physics.Arcade.Sprite;
    obs.setImmovable(true);
    obs.body!.allowGravity = false;

    // Slam down animation
    this.scene.tweens.add({
      targets: obs,
      y: endY,
      duration: 400,
      ease: 'Bounce.easeOut',
      yoyo: true,
      repeat: -1,
      repeatDelay: 800,
    });
  }

  private spawnFlipper(x: number): void {
    const floor = this.randomFloor();
    const y = this.getFloorY(floor) - 20;
    const obs = this.obstacles.create(x, y, 'flipper') as Phaser.Physics.Arcade.Sprite;
    obs.setImmovable(true);
    obs.body!.allowGravity = false;

    // Swinging arc
    this.scene.tweens.add({
      targets: obs,
      angle: { from: -45, to: 45 },
      duration: 600,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  private spawnBird(x: number): void {
    // Bird comes from top, swoops to a random floor height
    const targetFloor = this.randomFloor();
    const targetY = this.getFloorY(targetFloor);
    const obs = this.obstacles.create(x + 200, -50, 'bird') as Phaser.Physics.Arcade.Sprite;
    obs.setImmovable(true);
    obs.body!.allowGravity = false;

    // Swoop down then back up
    this.scene.tweens.add({
      targets: obs,
      y: targetY,
      duration: 800,
      ease: 'Sine.easeOut',
      yoyo: true,
      repeat: -1,
      repeatDelay: 500,
    });
  }

  private spawnCatPaw(x: number): void {
    const floor = this.randomFloor();
    const y = this.getFloorY(floor);
    const obs = this.obstacles.create(x + 80, y, 'cat-paw') as Phaser.Physics.Arcade.Sprite;
    obs.setImmovable(true);
    obs.body!.allowGravity = false;
    obs.setAlpha(0.3); // Barely visible at first

    // Visual tell then swipe
    this.scene.tweens.add({
      targets: obs,
      alpha: 1,
      scaleX: 1.5,
      duration: 500,
      ease: 'Power2',
      yoyo: true,
      repeat: -1,
      repeatDelay: 1000,
    });
  }
}
```

**Step 2: Update GameScene to use ObstacleSpawner**

Replace the inline obstacle spawning in `handleSpawning()` with:

```typescript
import { ObstacleSpawner } from '../objects/ObstacleSpawner';
// In create():
this.obstacleSpawner = new ObstacleSpawner(this, this.obstacles);
// In handleSpawning():
this.obstacleSpawner.spawn(spawnX);
```

**Step 3: Verify obstacle behaviors**

Run: `npm run dev`
Expected: Each obstacle type has unique visual behavior (newspaper slams, bird swoops, etc.)

**Step 4: Commit**

```bash
git add src/objects/ObstacleSpawner.ts src/scenes/GameScene.ts
git commit -m "feat: add unique obstacle behaviors (spray, newspaper slam, bird swoop, etc.)"
```

---

### Task 8: Audio System

**Files:**
- Create: `src/audio/AudioManager.ts`
- Create placeholder audio files in `public/audio/`
- Modify: `src/scenes/BootScene.ts` (load audio)
- Modify: `src/scenes/GameScene.ts` (play audio)

**Step 1: Generate placeholder audio**

Use a Node script or web tool to generate simple .mp3/.ogg placeholder sounds:
- `public/audio/bgm.mp3` — looping eerie music
- `public/audio/jump.mp3` — spring boing
- `public/audio/apple.mp3` — crunch/sparkle
- `public/audio/death.mp3` — splat + trombone
- `public/audio/floor-switch.mp3` — thud

For initial development, these can be very short generated tones. Replace with proper audio later.

**Step 2: Create AudioManager**

```typescript
import Phaser from 'phaser';

export class AudioManager {
  private scene: Phaser.Scene;
  private bgm?: Phaser.Sound.BaseSound;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  startBGM(): void {
    if (this.scene.sound.get('bgm')) return;
    this.bgm = this.scene.sound.add('bgm', { loop: true, volume: 0.5 });
    this.bgm.play();
  }

  stopBGM(): void {
    this.bgm?.stop();
  }

  playJump(): void {
    this.scene.sound.play('jump', { volume: 0.6 });
  }

  playApple(): void {
    this.scene.sound.play('apple', { volume: 0.7 });
  }

  playDeath(): void {
    this.bgm?.stop();
    this.scene.sound.play('death', { volume: 0.8 });
  }

  playFloorSwitch(): void {
    this.scene.sound.play('floor-switch', { volume: 0.4 });
  }

  /** Slightly increase BGM pitch as speed increases */
  updatePitch(speedMultiplier: number): void {
    if (this.bgm && 'setRate' in this.bgm) {
      (this.bgm as Phaser.Sound.WebAudioSound).setRate(1 + (speedMultiplier - 1) * 0.3);
    }
  }
}
```

**Step 3: Add audio loading to BootScene**

```typescript
this.load.audio('bgm', 'audio/bgm.mp3');
this.load.audio('jump', 'audio/jump.mp3');
this.load.audio('apple', 'audio/apple.mp3');
this.load.audio('death', 'audio/death.mp3');
this.load.audio('floor-switch', 'audio/floor-switch.mp3');
```

**Step 4: Integrate AudioManager into GameScene**

In `create()`: `this.audio = new AudioManager(this); this.audio.startBGM();`
In jump: `this.audio.playJump();`
In collect: `this.audio.playApple();`
In death: `this.audio.playDeath();`
In floor switch: `this.audio.playFloorSwitch();`
In update: `this.audio.updatePitch(this.currentSpeed / COCKROACH_BASE_SPEED);`

**Step 5: Commit**

```bash
git add src/audio/AudioManager.ts src/scenes/BootScene.ts src/scenes/GameScene.ts public/audio/
git commit -m "feat: add audio system with BGM, SFX, and dynamic pitch"
```

---

### Task 9: Polish & Visual Effects

**Files:**
- Modify: `src/scenes/GameScene.ts` (add particles, screen effects)

**Step 1: Add apple collection particle effect**

In `collectApple()`:
```typescript
const sprite = apple as Phaser.Physics.Arcade.Sprite;
// Sparkle particles at apple position
const particles = this.add.particles(sprite.x, sprite.y, 'apple', {
  speed: { min: 50, max: 150 },
  scale: { start: 0.5, end: 0 },
  lifespan: 400,
  quantity: 5,
  emitting: false,
});
particles.explode();
this.time.delayedCall(500, () => particles.destroy());
```

**Step 2: Add speed indicator UI**

In `create()`:
```typescript
this.speedText = this.add.text(16, 44, 'Speed: 1.0x', {
  fontSize: '14px',
  color: '#ff6600',
  fontFamily: 'monospace',
  stroke: '#000000',
  strokeThickness: 2,
}).setScrollFactor(0);
```

In `update()`:
```typescript
const speedMultiplier = (this.currentSpeed / COCKROACH_BASE_SPEED).toFixed(1);
this.speedText.setText(`Speed: ${speedMultiplier}x`);
```

**Step 3: Add screen tint as speed increases**

In `update()`:
```typescript
// Gradually tint the camera red as speed increases
const intensity = Math.min((this.currentSpeed - COCKROACH_BASE_SPEED) / 800, 0.3);
this.cameras.main.setAlpha(1 - intensity * 0.2);
```

**Step 4: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: add visual polish - particles, speed indicator, camera effects"
```

---

### Task 10: Final Testing & Tuning

**Files:**
- Modify: `src/config/constants.ts` (tune values)
- Modify: `src/scenes/GameScene.ts` (bug fixes)

**Step 1: Playtest and tune constants**

Run the game and adjust:
- `COCKROACH_BASE_SPEED` — starting speed feel
- `COCKROACH_ACCELERATION` — how fast it ramps
- `COCKROACH_JUMP_VELOCITY` — jump height/feel
- `MIN_OBSTACLE_SPACING` — fairness at high speeds
- `APPLE_SPAWN_CHANCE` — reward frequency
- Floor Y positions — visual alignment

**Step 2: Fix any bugs found during playtesting**

Common issues to check:
- Floor collision when switching floors at high speed
- Obstacle hitboxes matching visuals
- Score display accuracy
- Memory leaks from uncleanerd sprites
- Input responsiveness at high frame rates

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: tune gameplay constants and fix playtesting bugs"
```

---

Plan complete and saved to `docs/plans/2026-03-04-cockroach-game-implementation.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?

<function_calls>
<invoke name="AskUserQuestion">
<parameter name="questions">[{"question": "How should we execute this implementation plan?", "header": "Execution", "options": [{"label": "Subagent-Driven (Recommended)", "description": "Execute tasks in this session using subagents. I review between tasks, fast iteration."}, {"label": "Parallel Session", "description": "Open a separate session to execute the plan. Batch execution with checkpoints."}], "multiSelect": false}]