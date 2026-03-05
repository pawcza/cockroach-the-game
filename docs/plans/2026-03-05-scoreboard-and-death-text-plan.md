# Scoreboard & Custom Death Text Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add custom death messages per obstacle type (with obstacle image on death screen) and a global scoreboard backed by Express + SQLite, deployed via Docker.

**Architecture:** Express.js serves the static Vite build and a `/api/scores` REST API. SQLite stores all scoreboard entries. The game client posts scores on new high scores and fetches the leaderboard. Each obstacle carries a `type` data field that flows through to the death screen.

**Tech Stack:** Phaser 3, TypeScript, Express.js, better-sqlite3, Docker

---

### Task 1: Add obstacle type data to ObstacleSpawner

**Files:**
- Modify: `src/objects/ObstacleSpawner.ts`

**Step 1: Add `setData('type', ...)` to each spawn method**

In each of the 6 spawn methods, add a single line right after `setData('floor', ...)`:

```typescript
// In spawnPestSpray, after line 53:
spray.setData('type', 'spray');

// In spawnNewspaper, after line 139:
newspaper.setData('type', 'newspaper');

// In spawnOnion, after line 215:
onion.setData('type', 'onion');

// In spawnFlipper, after line 289:
flipper.setData('type', 'flipper');

// In spawnBird, after line 348:
bird.setData('type', 'bird');

// In spawnCatPaw, after line 391:
paw.setData('type', 'cat');
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/objects/ObstacleSpawner.ts
git commit -m "feat: add type data to each obstacle for death cause tracking"
```

---

### Task 2: Pass obstacle type through death flow

**Files:**
- Modify: `src/scenes/GameScene.ts:954-999`

**Step 1: Update hitObstacle to read obstacle type**

Replace the current `hitObstacle` method (line 954-956):

```typescript
private hitObstacle(
  _cockroach: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  obstacle: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
): void {
  const obstacleType = (obstacle as Phaser.Physics.Arcade.Sprite).getData('type') || null;
  this.die(obstacleType);
}
```

**Step 2: Update die() to accept and pass obstacle type**

Change `die()` signature and scene transition (lines 958-1001):

```typescript
private die(obstacleType?: string): void {
```

And update the `scene.start` call inside the `delayedCall` (line 993-999) to include `obstacleType`:

```typescript
this.scene.start('GameOverScene', {
  score: this.score,
  timeSurvived: Math.floor((this.time.now - this.startTime) / 1000),
  applesCollected: Math.floor((this.score - Math.floor((this.time.now - this.startTime) / 1000)) / 10),
  topSpeed: this.speedMultiplier,
  distance: Math.floor((this.cockroach.x - COCKROACH_START_X) / 50),
  obstacleType: obstacleType || null,
});
```

**Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: pass obstacle type from hit detection through to game over scene"
```

---

### Task 3: Custom death text and obstacle image in GameOverScene

**Files:**
- Modify: `src/scenes/GameOverScene.ts`

**Step 1: Add death text and texture mappings**

At the top of the file (after the class opening), add:

```typescript
private static readonly DEATH_TEXT: Record<string, string> = {
  bird: 'SRAK CIĘ OPTAKAŁ',
  cat: 'Rozkotowany',
  flipper: 'Kubota Ci w ryj!',
  newspaper: 'Naleszało Ci siem',
  onion: 'Smrót Cię zmiótł',
  spray: 'MUGA!',
};

private static readonly OBSTACLE_TEXTURE: Record<string, string> = {
  bird: 'bird',
  cat: 'cat-paw',
  flipper: 'flipper',
  newspaper: 'newspaper',
  onion: 'onion',
  spray: 'pest-spray',
};
```

**Step 2: Update create() data type and title text**

Update the `create` method signature to include `obstacleType`:

```typescript
create(data: { score: number; timeSurvived?: number; applesCollected?: number; topSpeed?: number; distance?: number; obstacleType?: string | null }): void {
```

Replace the "ZGNIOTŁEŚ SIĘ!" title text creation (around line 46-55) with:

```typescript
const deathMessage = data?.obstacleType
  ? GameOverScene.DEATH_TEXT[data.obstacleType] || 'ZGNIOTŁEŚ SIĘ!'
  : 'ZGNIOTŁEŚ SIĘ!';

const titleText = this.add
  .text(width / 2, height / 3 - 20, deathMessage, {
    fontSize: deathMessage.length > 15 ? '36px' : '56px',
    color: '#8b0000',
    fontFamily: 'Georgia, serif',
    fontStyle: 'bold',
    stroke: '#000000',
    strokeThickness: 6,
  })
  .setOrigin(0.5);
```

**Step 3: Add obstacle image display**

Right after the title text shake timer (after line 66), add:

```typescript
// Display the obstacle that killed the player
if (data?.obstacleType && GameOverScene.OBSTACLE_TEXTURE[data.obstacleType]) {
  const textureKey = GameOverScene.OBSTACLE_TEXTURE[data.obstacleType];
  const obstacleImg = this.add.image(width / 2, titleText.y - 60, textureKey);
  obstacleImg.setScale(0.3);
  obstacleImg.setOrigin(0.5, 1);

  // Gentle float animation
  this.tweens.add({
    targets: obstacleImg,
    y: obstacleImg.y - 5,
    duration: 1000,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
}
```

**Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add src/scenes/GameOverScene.ts
git commit -m "feat: custom death text and obstacle image on game over screen"
```

---

### Task 4: Set up Express server with SQLite

**Files:**
- Create: `server/index.ts`
- Create: `server/db.ts`
- Create: `server/tsconfig.json`
- Modify: `package.json`

**Step 1: Install server dependencies**

```bash
npm install express better-sqlite3 express-rate-limit
npm install -D @types/express @types/better-sqlite3 tsx
```

**Step 2: Create server/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "../dist-server",
    "rootDir": ".",
    "sourceMap": true
  },
  "include": ["./**/*"]
}
```

**Step 3: Create server/db.ts**

```typescript
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'scores.db');

// Ensure data directory exists
import fs from 'fs';
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    score INTEGER NOT NULL,
    death_cause TEXT,
    distance INTEGER,
    time_survived INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_scores_score ON scores(score DESC);
`);

export interface ScoreEntry {
  id: number;
  name: string;
  score: number;
  death_cause: string | null;
  distance: number | null;
  time_survived: number | null;
  created_at: string;
}

export function getTopScores(limit: number = 100): ScoreEntry[] {
  const stmt = db.prepare('SELECT * FROM scores ORDER BY score DESC LIMIT ?');
  return stmt.all(limit) as ScoreEntry[];
}

export function getPlayerBest(name: string): { entry: ScoreEntry | null; rank: number | null } {
  const entryStmt = db.prepare('SELECT * FROM scores WHERE name = ? ORDER BY score DESC LIMIT 1');
  const entry = entryStmt.get(name) as ScoreEntry | undefined;
  if (!entry) return { entry: null, rank: null };

  const rankStmt = db.prepare('SELECT COUNT(*) as rank FROM scores WHERE score > ?');
  const result = rankStmt.get(entry.score) as { rank: number };
  return { entry, rank: result.rank + 1 };
}

export function insertScore(
  name: string,
  score: number,
  deathCause: string | null,
  distance: number | null,
  timeSurvived: number | null,
): ScoreEntry {
  const stmt = db.prepare(
    'INSERT INTO scores (name, score, death_cause, distance, time_survived) VALUES (?, ?, ?, ?, ?)',
  );
  const info = stmt.run(name, score, deathCause, distance, timeSurvived);
  const inserted = db.prepare('SELECT * FROM scores WHERE id = ?').get(info.lastInsertRowid) as ScoreEntry;
  return inserted;
}

export default db;
```

**Step 4: Create server/index.ts**

```typescript
import express from 'express';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { getTopScores, getPlayerBest, insertScore } from './db';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve static files from Vite build
app.use(express.static(path.join(__dirname, '..', 'dist')));

// Rate limit score submissions: 1 per 5 seconds per IP
const submitLimiter = rateLimit({
  windowMs: 5000,
  max: 1,
  message: { error: 'Too many submissions, wait a moment' },
});

// GET /api/scores?limit=100
app.get('/api/scores', (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 100);
  const scores = getTopScores(limit);
  res.json(scores);
});

// GET /api/scores/:playerName
app.get('/api/scores/:playerName', (req, res) => {
  const result = getPlayerBest(req.params.playerName);
  res.json(result);
});

// POST /api/scores
app.post('/api/scores', submitLimiter, (req, res) => {
  const { name, score, deathCause, distance, timeSurvived } = req.body;

  // Validation
  if (!name || typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 20) {
    res.status(400).json({ error: 'Name must be 1-20 characters' });
    return;
  }
  if (typeof score !== 'number' || score < 0 || !Number.isInteger(score)) {
    res.status(400).json({ error: 'Score must be a non-negative integer' });
    return;
  }

  const entry = insertScore(
    name.trim(),
    score,
    deathCause || null,
    typeof distance === 'number' ? distance : null,
    typeof timeSurvived === 'number' ? timeSurvived : null,
  );

  res.status(201).json(entry);
});

// SPA fallback — serve index.html for non-API routes
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Cockroach server running on port ${PORT}`);
});
```

**Step 5: Update package.json scripts**

Add these scripts to package.json:

```json
"server:dev": "tsx server/index.ts",
"server:build": "npx tsc -p server/tsconfig.json",
"start": "node dist-server/index.js"
```

**Step 6: Verify server compiles and starts**

Run: `npx tsc -p server/tsconfig.json`
Expected: No errors

Run: `npm run server:dev` (kill after confirming it starts)
Expected: "Cockroach server running on port 3000"

**Step 7: Commit**

```bash
git add server/ package.json package-lock.json
git commit -m "feat: add Express + SQLite server for scoreboard API"
```

---

### Task 5: Add scoreboard UI to GameOverScene

**Files:**
- Modify: `src/scenes/GameOverScene.ts`

**Step 1: Add API helper methods**

Add these methods to GameOverScene:

```typescript
private async submitScore(name: string, data: {
  score: number;
  obstacleType?: string | null;
  distance?: number;
  timeSurvived?: number;
}): Promise<void> {
  try {
    await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        score: data.score,
        deathCause: data.obstacleType || null,
        distance: data.distance || null,
        timeSurvived: data.timeSurvived || null,
      }),
    });
  } catch {
    // Silently fail — game works offline too
  }
}

private async fetchScoreboard(): Promise<Array<{
  name: string;
  score: number;
  death_cause: string | null;
}>> {
  try {
    const res = await fetch('/api/scores?limit=100');
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

private async fetchPlayerRank(name: string): Promise<number | null> {
  try {
    const res = await fetch(`/api/scores/${encodeURIComponent(name)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.rank;
  } catch {
    return null;
  }
}
```

**Step 2: Add name input UI for new high scores**

After the high score text (around line 105), add the name input flow. Replace the existing restart prompt section (lines 153-169) with a conditional flow:

```typescript
if (isNewRecord) {
  this.showNameInput(width, height, data);
} else {
  this.showRestartPrompt(width, height);
  this.showScoreboardButton(width, height);
}
```

**Step 3: Implement showNameInput method**

```typescript
private showNameInput(width: number, height: number, data: {
  score: number;
  obstacleType?: string | null;
  distance?: number;
  timeSurvived?: number;
}): void {
  const promptText = this.add
    .text(width / 2, height - 100, 'Wpisz swoje imię:', {
      fontSize: '18px',
      color: '#ffff00',
      fontFamily: 'monospace',
    })
    .setOrigin(0.5);

  let playerName = '';
  const nameText = this.add
    .text(width / 2, height - 70, '_', {
      fontSize: '24px',
      color: '#ffffff',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 3,
    })
    .setOrigin(0.5);

  // Blinking cursor
  this.tweens.add({
    targets: nameText,
    alpha: { from: 1, to: 0.5 },
    duration: 500,
    yoyo: true,
    repeat: -1,
  });

  const handleKey = (event: KeyboardEvent): void => {
    if (event.key === 'Enter' && playerName.length > 0) {
      // Submit
      this.input.keyboard!.off('keydown');
      promptText.destroy();
      nameText.setText(playerName);
      nameText.setColor('#00ff00');
      this.tweens.killTweensOf(nameText);
      nameText.setAlpha(1);

      this.submitScore(playerName, data).then(() => {
        this.showScoreboard(width, height, playerName);
      });
      this.showRestartPrompt(width, height);
    } else if (event.key === 'Backspace') {
      playerName = playerName.slice(0, -1);
      nameText.setText(playerName.length > 0 ? playerName : '_');
    } else if (event.key === 'Escape') {
      // Skip submission
      this.input.keyboard!.off('keydown');
      promptText.destroy();
      nameText.destroy();
      this.showRestartPrompt(width, height);
      this.showScoreboardButton(width, height);
    } else if (event.key.length === 1 && playerName.length < 20) {
      playerName += event.key;
      nameText.setText(playerName);
    }
  };

  this.input.keyboard!.on('keydown', handleKey);
}
```

**Step 4: Implement showRestartPrompt method**

Extract the existing restart prompt logic into its own method:

```typescript
private showRestartPrompt(width: number, height: number): void {
  const restartText = this.add
    .text(width / 2, height - 30, 'SPACJA / R — Jeszcze Raz!', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'monospace',
    })
    .setOrigin(0.5);

  this.tweens.add({
    targets: restartText,
    alpha: 0,
    duration: 500,
    ease: 'Power2',
    yoyo: true,
    repeat: -1,
  });

  this.input.keyboard!.once('keydown-SPACE', () => this.restartGame());
  this.input.keyboard!.once('keydown-R', () => this.restartGame());
}

private restartGame(): void {
  if (this.gameoverBgm) {
    this.gameoverBgm.stop();
    this.gameoverBgm.destroy();
    this.gameoverBgm = null;
  }
  this.scene.start('GameScene');
}
```

**Step 5: Implement showScoreboardButton method**

```typescript
private showScoreboardButton(width: number, height: number): void {
  const btnText = this.add
    .text(width / 2, height - 55, '[ T — Tablica Wyników ]', {
      fontSize: '14px',
      color: '#888888',
      fontFamily: 'monospace',
    })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });

  btnText.on('pointerover', () => btnText.setColor('#ffffff'));
  btnText.on('pointerout', () => btnText.setColor('#888888'));
  btnText.on('pointerdown', () => {
    btnText.destroy();
    this.showScoreboard(width, height, null);
  });

  this.input.keyboard!.once('keydown-T', () => {
    btnText.destroy();
    this.showScoreboard(width, height, null);
  });
}
```

**Step 6: Implement showScoreboard method**

```typescript
private async showScoreboard(
  width: number,
  height: number,
  highlightName: string | null,
): Promise<void> {
  const scores = await this.fetchScoreboard();
  if (scores.length === 0) return;

  // Semi-transparent overlay
  const overlay = this.add.rectangle(width / 2, height / 2, width - 40, height - 40, 0x000000, 0.85);
  overlay.setDepth(3000);

  const title = this.add.text(width / 2, 30, 'TABLICA WYNIKÓW', {
    fontSize: '20px',
    color: '#ffff00',
    fontFamily: 'monospace',
    stroke: '#000000',
    strokeThickness: 3,
  }).setOrigin(0.5).setDepth(3001);

  // Display top scores (fit as many as we can)
  const startY = 55;
  const lineHeight = 16;
  const maxVisible = Math.min(scores.length, Math.floor((height - 90) / lineHeight));

  for (let i = 0; i < maxVisible; i++) {
    const entry = scores[i];
    const rank = i + 1;
    const isHighlighted = highlightName && entry.name === highlightName;
    const color = isHighlighted ? '#00ff00' : rank <= 3 ? '#ffdd00' : '#cccccc';

    const line = `${String(rank).padStart(3, ' ')}. ${entry.name.padEnd(20, ' ')} ${String(entry.score).padStart(6, ' ')}`;
    this.add.text(width / 2, startY + i * lineHeight, line, {
      fontSize: '12px',
      color,
      fontFamily: 'monospace',
    }).setOrigin(0.5, 0).setDepth(3001);
  }

  // Show player's rank if they're not in top 100
  if (highlightName) {
    const rank = await this.fetchPlayerRank(highlightName);
    if (rank && rank > maxVisible) {
      this.add.text(width / 2, height - 35, `Twoja pozycja: #${rank}`, {
        fontSize: '14px',
        color: '#00ff00',
        fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(3001);
    }
  }
}
```

**Step 7: Clean up the create() method**

Remove the old inline restart key handlers (lines 176-193) and the old inline restart prompt text (lines 154-169) since they're now handled by `showRestartPrompt` and `restartGame`.

**Step 8: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 9: Commit**

```bash
git add src/scenes/GameOverScene.ts
git commit -m "feat: scoreboard UI with name input and leaderboard display"
```

---

### Task 6: Create Dockerfile

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

**Step 1: Create .dockerignore**

```
node_modules
data
.playwright-mcp
*.log
```

**Step 2: Create Dockerfile**

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY . .

# Build frontend
RUN npm run build

# Build server
RUN npx tsc -p server/tsconfig.json

# Create data directory for SQLite
RUN mkdir -p /data

ENV PORT=3000
ENV DB_PATH=/data/scores.db

EXPOSE 3000

CMD ["node", "dist-server/index.js"]
```

**Step 3: Verify Docker builds**

Run: `docker build -t cockroach-game .`
Expected: Build completes without errors

**Step 4: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "feat: add Dockerfile for containerized deployment"
```

---

### Task 7: Manual testing

**Step 1: Test death text feature**

Run: `npm run dev`
- Play the game, die to different obstacles
- Verify each obstacle shows its custom death text
- Verify the obstacle image appears above the death text
- Verify fallback "ZGNIOTŁEŚ SIĘ!" works for off-screen deaths

**Step 2: Test scoreboard feature**

Run: `npm run build && npm run server:dev`
Open: `http://localhost:3000`
- Play a game, get a new high score
- Verify name input appears
- Type a name, press Enter
- Verify scoreboard appears with the entry highlighted
- Play again without beating high score — verify "Tablica Wyników" button works
- Press T to open scoreboard

**Step 3: Test Docker**

```bash
docker build -t cockroach-game .
docker run -p 3000:3000 -v cockroach-data:/data cockroach-game
```
Open: `http://localhost:3000`
- Verify game loads
- Verify scores persist across container restarts

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete scoreboard and custom death text features"
```
