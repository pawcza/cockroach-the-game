# Multiplayer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time multiplayer to Cockroach the Game — lobby system, synced gameplay via seeded RNG, ghost players, spectating, and post-game rankings.

**Architecture:** Socket.IO server manages lobbies and relays player events (lane swap, dash, pill, death). All clients use the same RNG seed for identical obstacle/pickup spawning. Players see others as 20% opacity colored ghosts or off-screen arrows. After death, players spectate alive players with smooth camera transitions.

**Tech Stack:** Socket.IO (server + client), Express.js (existing), SQLite (existing), Phaser 3 (existing), seeded PRNG (mulberry32)

---

## File Structure

### New Server Files
- `server/multiplayer.ts` — Socket.IO event handlers, lobby state machine, game session management
- `server/lobby.ts` — Lobby data structures, create/join/leave/list/start logic

### New Client Files
- `src/multiplayer/MultiplayerClient.ts` — Socket.IO client wrapper, event emitter for game integration
- `src/multiplayer/SeededRNG.ts` — Deterministic PRNG (mulberry32) replacing Math.random for spawning
- `src/multiplayer/GhostPlayer.ts` — Renders a ghost cockroach (tinted, 20% opacity) for a remote player
- `src/multiplayer/GhostManager.ts` — Manages all ghost players, off-screen arrows, spectating
- `src/scenes/MultiplayerMenuScene.ts` — Nickname input, lobby list, create/join lobby
- `src/scenes/LobbyScene.ts` — Players list with colors, start button (host), waiting state
- `src/scenes/MultiplayerGameOverScene.ts` — Rankings table, rematch/leave buttons, auto-save highscores

### Modified Files
- `server/index.ts` — Attach Socket.IO to HTTP server
- `server/db.ts` — Add batch score insert for multiplayer results
- `src/main.ts` — Register new scenes
- `src/scenes/MenuScene.ts` — Split GRAJ into solo/multiplayer buttons
- `src/scenes/GameScene.ts` — Accept multiplayer config, use seeded RNG, integrate ghost manager, spectating mode, emit player events
- `src/objects/ObstacleSpawner.ts` — Accept RNG function parameter instead of using Phaser.Math.Between / Math.random
- `src/objects/Player.ts` — Expose state for sync (lane, dash, pill, alive)
- `package.json` — Add socket.io + socket.io-client dependencies
- `Dockerfile` — No changes needed (socket.io is pure JS)

---

## Chunk 1: Seeded RNG + Spawner Refactor

### Task 1: Seeded RNG Module

**Files:**
- Create: `src/multiplayer/SeededRNG.ts`

- [ ] **Step 1: Create SeededRNG class**

```typescript
// src/multiplayer/SeededRNG.ts

/**
 * Mulberry32 — fast, deterministic 32-bit PRNG.
 * Given the same seed, produces identical sequence on every client.
 */
export class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  /** Returns float in [0, 1) — drop-in for Math.random() */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns integer in [min, max] inclusive — replaces Phaser.Math.Between */
  between(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Returns true with given probability [0, 1] */
  chance(probability: number): boolean {
    return this.next() < probability;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/multiplayer/SeededRNG.ts
git commit -m "feat(mp): add deterministic seeded RNG (mulberry32)"
```

### Task 2: Refactor ObstacleSpawner to Accept RNG

**Files:**
- Modify: `src/objects/ObstacleSpawner.ts`

- [ ] **Step 3: Add RNG parameter to ObstacleSpawner.spawn()**

Change `spawn()` to accept an optional RNG object. When provided, use `rng.between()` and `rng.next()` instead of `Phaser.Math.Between()` and `Math.random()`. When not provided (solo mode), fall back to the originals.

```typescript
// Add to top of file
import { SeededRNG } from '../multiplayer/SeededRNG';

// Add type for RNG-or-default
type RNGSource = SeededRNG | null;

// Helper that works with either source
function between(rng: RNGSource, min: number, max: number): number {
  return rng ? rng.between(min, max) : Phaser.Math.Between(min, max);
}
function random(rng: RNGSource): number {
  return rng ? rng.next() : Math.random();
}
```

Update `spawn()` signature:
```typescript
spawn(x: number, currentLevel: number, floorTopY: number, floorBottomY: number, rng: RNGSource = null): Phaser.Physics.Arcade.Sprite {
```

Replace ALL instances of `Phaser.Math.Between(...)` with `between(rng, ...)` and `Math.random()` with `random(rng)` inside `spawn()`.

- [ ] **Step 4: Refactor GameScene spawning to pass RNG**

In `GameScene.ts`, the `handleSpawning()` method calls `this.spawner.spawn(...)`. Add a class property `private rng: SeededRNG | null = null;` and pass it through:

```typescript
// In handleSpawning(), where spawner.spawn is called:
this.spawner.spawn(spawnX, this.currentLevel, this.floorTopY, this.floorBottomY, this.rng);
```

Also replace the pickup spawn chance checks (`Math.random() < PILL_SPAWN_CHANCE` etc.) to use `this.rng?.next() ?? Math.random()`.

- [ ] **Step 5: Verify solo mode still works identically**

Run the game in solo mode. RNG is null, so all original Math.random/Phaser.Math.Between calls are used. No behavior change.

- [ ] **Step 6: Commit**

```bash
git add src/objects/ObstacleSpawner.ts src/scenes/GameScene.ts
git commit -m "feat(mp): refactor spawner to accept seeded RNG, solo mode unchanged"
```

---

## Chunk 2: Socket.IO Server — Lobby System

### Task 3: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 7: Install socket.io and socket.io-client**

```bash
npm install socket.io socket.io-client
npm install -D @types/socket.io
```

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add socket.io dependencies"
```

### Task 4: Lobby Data Structures

**Files:**
- Create: `server/lobby.ts`

- [ ] **Step 9: Implement lobby state management**

```typescript
// server/lobby.ts

export interface LobbyPlayer {
  id: string;          // socket.id
  name: string;
  color: number;       // index into PLAYER_COLORS array
  isHost: boolean;
}

export type LobbyStatus = 'waiting' | 'ingame' | 'postgame';

export interface Lobby {
  id: string;
  hostId: string;
  players: Map<string, LobbyPlayer>;
  status: LobbyStatus;
  seed: number | null;
  maxPlayers: number;
}

// 16 distinct colors for players
export const PLAYER_COLORS = [
  0xff0000, 0x00ff00, 0x0000ff, 0xffff00,
  0xff00ff, 0x00ffff, 0xff6600, 0x6600ff,
  0x00ff66, 0xff0066, 0x66ff00, 0x0066ff,
  0xff3399, 0x33ff99, 0x9933ff, 0x99ff33,
];

export class LobbyManager {
  private lobbies = new Map<string, Lobby>();
  private playerLobby = new Map<string, string>(); // socketId -> lobbyId

  createLobby(hostId: string, hostName: string): Lobby {
    const id = Math.random().toString(36).slice(2, 8);
    const color = 0; // first color
    const lobby: Lobby = {
      id,
      hostId,
      players: new Map([[hostId, { id: hostId, name: hostName, color, isHost: true }]]),
      status: 'waiting',
      seed: null,
      maxPlayers: 16,
    };
    this.lobbies.set(id, lobby);
    this.playerLobby.set(hostId, id);
    return lobby;
  }

  joinLobby(lobbyId: string, playerId: string, playerName: string): { lobby: Lobby; player: LobbyPlayer } | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return null;
    if (lobby.status === 'ingame') return null;
    if (lobby.players.size >= lobby.maxPlayers) return null;

    // Pick first available color
    const usedColors = new Set([...lobby.players.values()].map(p => p.color));
    let color = 0;
    for (let i = 0; i < PLAYER_COLORS.length; i++) {
      if (!usedColors.has(i)) { color = i; break; }
    }

    const player: LobbyPlayer = { id: playerId, name: playerName, color, isHost: false };
    lobby.players.set(playerId, player);
    this.playerLobby.set(playerId, lobbyId);
    return { lobby, player };
  }

  leaveLobby(playerId: string): { lobby: Lobby; disbanded: boolean } | null {
    const lobbyId = this.playerLobby.get(playerId);
    if (!lobbyId) return null;
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return null;

    lobby.players.delete(playerId);
    this.playerLobby.delete(playerId);

    if (lobby.players.size === 0) {
      this.lobbies.delete(lobbyId);
      return { lobby, disbanded: true };
    }

    // Transfer host if host left
    if (lobby.hostId === playerId) {
      const newHost = lobby.players.values().next().value!;
      newHost.isHost = true;
      lobby.hostId = newHost.id;
    }

    return { lobby, disbanded: false };
  }

  changeColor(playerId: string, colorIndex: number): Lobby | null {
    const lobbyId = this.playerLobby.get(playerId);
    if (!lobbyId) return null;
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return null;

    const usedColors = new Set<number>();
    for (const [id, p] of lobby.players) {
      if (id !== playerId) usedColors.add(p.color);
    }
    if (usedColors.has(colorIndex)) return null;

    const player = lobby.players.get(playerId);
    if (player) player.color = colorIndex;
    return lobby;
  }

  startGame(hostId: string): Lobby | null {
    const lobbyId = this.playerLobby.get(hostId);
    if (!lobbyId) return null;
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.hostId !== hostId) return null;
    if (lobby.players.size < 2) return null;

    lobby.status = 'ingame';
    lobby.seed = Date.now();
    return lobby;
  }

  endGame(lobbyId: string): Lobby | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return null;
    lobby.status = 'postgame';
    return lobby;
  }

  restartLobby(hostId: string): Lobby | null {
    const lobbyId = this.playerLobby.get(hostId);
    if (!lobbyId) return null;
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.hostId !== hostId) return null;
    lobby.status = 'waiting';
    lobby.seed = null;
    return lobby;
  }

  getLobby(lobbyId: string): Lobby | undefined {
    return this.lobbies.get(lobbyId);
  }

  getPlayerLobbyId(playerId: string): string | undefined {
    return this.playerLobby.get(playerId);
  }

  listLobbies(): Array<{ id: string; host: string; playerCount: number; status: LobbyStatus }> {
    const list: Array<{ id: string; host: string; playerCount: number; status: LobbyStatus }> = [];
    for (const lobby of this.lobbies.values()) {
      const host = lobby.players.get(lobby.hostId);
      list.push({
        id: lobby.id,
        host: host?.name ?? '???',
        playerCount: lobby.players.size,
        status: lobby.status,
      });
    }
    return list;
  }

  /** Serialize lobby players for socket emission */
  serializePlayers(lobby: Lobby): Array<{ id: string; name: string; color: number; isHost: boolean }> {
    return [...lobby.players.values()];
  }
}
```

- [ ] **Step 10: Commit**

```bash
git add server/lobby.ts
git commit -m "feat(mp): lobby data structures and manager"
```

### Task 5: Socket.IO Event Handlers

**Files:**
- Create: `server/multiplayer.ts`
- Modify: `server/index.ts`

- [ ] **Step 11: Create multiplayer socket handler**

```typescript
// server/multiplayer.ts
import { Server, Socket } from 'socket.io';
import { LobbyManager } from './lobby';

export function setupMultiplayer(io: Server): void {
  const lobbies = new LobbyManager();

  io.on('connection', (socket: Socket) => {
    let playerName = '';

    socket.on('set-name', (name: string) => {
      playerName = String(name).slice(0, 20).trim() || 'Karaluch';
    });

    socket.on('lobby:list', (callback: Function) => {
      callback(lobbies.listLobbies());
    });

    socket.on('lobby:create', (callback: Function) => {
      if (!playerName) return callback({ error: 'No name set' });
      const lobby = lobbies.createLobby(socket.id, playerName);
      socket.join(lobby.id);
      callback({ lobby: { id: lobby.id, players: lobbies.serializePlayers(lobby), status: lobby.status } });
    });

    socket.on('lobby:join', (lobbyId: string, callback: Function) => {
      if (!playerName) return callback({ error: 'No name set' });
      const result = lobbies.joinLobby(lobbyId, socket.id, playerName);
      if (!result) return callback({ error: 'Cannot join lobby' });
      socket.join(lobbyId);
      const data = { id: result.lobby.id, players: lobbies.serializePlayers(result.lobby), status: result.lobby.status };
      callback({ lobby: data });
      socket.to(lobbyId).emit('lobby:updated', data);
    });

    socket.on('lobby:leave', () => {
      const result = lobbies.leaveLobby(socket.id);
      if (!result) return;
      socket.leave(result.lobby.id);
      if (!result.disbanded) {
        socket.to(result.lobby.id).emit('lobby:updated', {
          id: result.lobby.id,
          players: lobbies.serializePlayers(result.lobby),
          status: result.lobby.status,
        });
      }
    });

    socket.on('lobby:color', (colorIndex: number, callback: Function) => {
      const lobby = lobbies.changeColor(socket.id, colorIndex);
      if (!lobby) return callback({ error: 'Color taken' });
      const data = { id: lobby.id, players: lobbies.serializePlayers(lobby), status: lobby.status };
      callback({ lobby: data });
      socket.to(lobby.id).emit('lobby:updated', data);
    });

    socket.on('lobby:start', (callback: Function) => {
      const lobby = lobbies.startGame(socket.id);
      if (!lobby) return callback({ error: 'Cannot start' });
      io.to(lobby.id).emit('game:start', {
        seed: lobby.seed,
        players: lobbies.serializePlayers(lobby),
      });
      callback({ ok: true });
    });

    // --- In-game events (relay to other players in same lobby) ---

    socket.on('game:swap', (lane: string) => {
      const lobbyId = lobbies.getPlayerLobbyId(socket.id);
      if (lobbyId) socket.to(lobbyId).emit('game:player-swap', { id: socket.id, lane });
    });

    socket.on('game:dash-start', () => {
      const lobbyId = lobbies.getPlayerLobbyId(socket.id);
      if (lobbyId) socket.to(lobbyId).emit('game:player-dash-start', { id: socket.id });
    });

    socket.on('game:dash-end', () => {
      const lobbyId = lobbies.getPlayerLobbyId(socket.id);
      if (lobbyId) socket.to(lobbyId).emit('game:player-dash-end', { id: socket.id });
    });

    socket.on('game:pill-start', () => {
      const lobbyId = lobbies.getPlayerLobbyId(socket.id);
      if (lobbyId) socket.to(lobbyId).emit('game:player-pill-start', { id: socket.id });
    });

    socket.on('game:pill-end', () => {
      const lobbyId = lobbies.getPlayerLobbyId(socket.id);
      if (lobbyId) socket.to(lobbyId).emit('game:player-pill-end', { id: socket.id });
    });

    socket.on('game:position', (data: { x: number; lane: string }) => {
      const lobbyId = lobbies.getPlayerLobbyId(socket.id);
      if (lobbyId) socket.to(lobbyId).emit('game:player-position', { id: socket.id, ...data });
    });

    socket.on('game:death', (data: { score: number; stats: Record<string, unknown> }) => {
      const lobbyId = lobbies.getPlayerLobbyId(socket.id);
      if (lobbyId) {
        socket.to(lobbyId).emit('game:player-death', { id: socket.id, ...data });

        // Check if all players are dead
        const lobby = lobbies.getLobby(lobbyId);
        if (lobby) {
          // The death data is collected client-side; server just checks if game should end
          // Client sends game:all-dead when it detects all ghosts are dead
        }
      }
    });

    socket.on('game:all-dead', (rankings: Array<{ id: string; name: string; score: number; stats: Record<string, unknown> }>) => {
      const lobbyId = lobbies.getPlayerLobbyId(socket.id);
      if (!lobbyId) return;
      const lobby = lobbies.endGame(lobbyId);
      if (lobby) {
        io.to(lobbyId).emit('game:over', { rankings });
      }
    });

    socket.on('lobby:restart', (callback: Function) => {
      const lobby = lobbies.restartLobby(socket.id);
      if (!lobby) return callback({ error: 'Cannot restart' });
      const data = { id: lobby.id, players: lobbies.serializePlayers(lobby), status: lobby.status };
      io.to(lobby.id).emit('lobby:updated', data);
      callback({ ok: true });
    });

    socket.on('disconnect', () => {
      const result = lobbies.leaveLobby(socket.id);
      if (result && !result.disbanded) {
        socket.to(result.lobby.id).emit('lobby:updated', {
          id: result.lobby.id,
          players: lobbies.serializePlayers(result.lobby),
          status: result.lobby.status,
        });
      }
    });
  });
}
```

- [ ] **Step 12: Attach Socket.IO to Express server**

In `server/index.ts`, add:

```typescript
import http from 'http';
import { Server } from 'socket.io';
import { setupMultiplayer } from './multiplayer';

// Replace app.listen with:
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }, // dev only; nginx handles CORS in prod
});
setupMultiplayer(io);

server.listen(PORT, () => {
  console.log(`Cockroach server running on port ${PORT}`);
});
```

- [ ] **Step 13: Commit**

```bash
git add server/multiplayer.ts server/index.ts
git commit -m "feat(mp): socket.io server with lobby and game event relay"
```

---

## Chunk 3: Client — Multiplayer Menu + Lobby Scenes

### Task 6: MultiplayerClient

**Files:**
- Create: `src/multiplayer/MultiplayerClient.ts`

- [ ] **Step 14: Create Socket.IO client wrapper**

```typescript
// src/multiplayer/MultiplayerClient.ts
import { io, Socket } from 'socket.io-client';

export interface MPPlayer {
  id: string;
  name: string;
  color: number;
  isHost: boolean;
}

export interface MPLobbyData {
  id: string;
  players: MPPlayer[];
  status: string;
}

export interface MPLobbyListEntry {
  id: string;
  host: string;
  playerCount: number;
  status: string;
}

class MultiplayerClient {
  private socket: Socket | null = null;
  private _myId = '';

  get myId(): string { return this._myId; }
  get connected(): boolean { return this.socket?.connected ?? false; }

  connect(): void {
    if (this.socket) return;
    // In production, connect to same origin. In dev, vite proxy handles it.
    this.socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
    this.socket.on('connect', () => {
      this._myId = this.socket!.id!;
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  setName(name: string): void {
    this.socket?.emit('set-name', name);
  }

  listLobbies(): Promise<MPLobbyListEntry[]> {
    return new Promise((resolve) => {
      this.socket?.emit('lobby:list', (list: MPLobbyListEntry[]) => resolve(list));
    });
  }

  createLobby(): Promise<MPLobbyData> {
    return new Promise((resolve, reject) => {
      this.socket?.emit('lobby:create', (res: { lobby?: MPLobbyData; error?: string }) => {
        if (res.error) reject(new Error(res.error));
        else resolve(res.lobby!);
      });
    });
  }

  joinLobby(lobbyId: string): Promise<MPLobbyData> {
    return new Promise((resolve, reject) => {
      this.socket?.emit('lobby:join', lobbyId, (res: { lobby?: MPLobbyData; error?: string }) => {
        if (res.error) reject(new Error(res.error));
        else resolve(res.lobby!);
      });
    });
  }

  leaveLobby(): void {
    this.socket?.emit('lobby:leave');
  }

  changeColor(colorIndex: number): Promise<MPLobbyData> {
    return new Promise((resolve, reject) => {
      this.socket?.emit('lobby:color', colorIndex, (res: { lobby?: MPLobbyData; error?: string }) => {
        if (res.error) reject(new Error(res.error));
        else resolve(res.lobby!);
      });
    });
  }

  startGame(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket?.emit('lobby:start', (res: { ok?: boolean; error?: string }) => {
        if (res.error) reject(new Error(res.error));
        else resolve();
      });
    });
  }

  restartLobby(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket?.emit('lobby:restart', (res: { ok?: boolean; error?: string }) => {
        if (res.error) reject(new Error(res.error));
        else resolve();
      });
    });
  }

  // Game events — send
  sendSwap(lane: string): void { this.socket?.emit('game:swap', lane); }
  sendDashStart(): void { this.socket?.emit('game:dash-start'); }
  sendDashEnd(): void { this.socket?.emit('game:dash-end'); }
  sendPillStart(): void { this.socket?.emit('game:pill-start'); }
  sendPillEnd(): void { this.socket?.emit('game:pill-end'); }
  sendPosition(x: number, lane: string): void { this.socket?.emit('game:position', { x, lane }); }
  sendDeath(score: number, stats: Record<string, unknown>): void { this.socket?.emit('game:death', { score, stats }); }
  sendAllDead(rankings: Array<Record<string, unknown>>): void { this.socket?.emit('game:all-dead', rankings); }

  // Event listeners — receive
  on(event: string, handler: (...args: unknown[]) => void): void {
    this.socket?.on(event, handler);
  }

  off(event: string, handler?: (...args: unknown[]) => void): void {
    if (handler) this.socket?.off(event, handler);
    else this.socket?.removeAllListeners(event);
  }
}

// Singleton
export const mpClient = new MultiplayerClient();
```

- [ ] **Step 15: Commit**

```bash
git add src/multiplayer/MultiplayerClient.ts
git commit -m "feat(mp): socket.io client wrapper singleton"
```

### Task 7: MultiplayerMenuScene

**Files:**
- Create: `src/scenes/MultiplayerMenuScene.ts`
- Modify: `src/scenes/MenuScene.ts`
- Modify: `src/main.ts`

- [ ] **Step 16: Create MultiplayerMenuScene**

This scene shows:
1. Current nickname (from localStorage) with a "change" button
2. A scrollable list of active lobbies (refreshed every 3s)
3. Each lobby entry shows: "{host}'s Lobby — {n}/16 players" + status badge
4. Tapping a lobby in "waiting" or "postgame" state joins it
5. "Stwórz Lobby" (Create Lobby) button at bottom
6. "← Powrót" back button

Use the same visual style as existing menu scenes (Press Start 2P font, dark backgrounds, neon colors).

Key implementation details:
- On `create()`: connect to socket, set name from localStorage, refresh lobby list
- Nickname stored in `localStorage['cockroach-mp-name']`
- Change nickname: HTML input overlay (same pattern as score save in GameOverScene)
- Join lobby → `scene.start('LobbyScene', { lobbyData })`
- Create lobby → `mpClient.createLobby()` then `scene.start('LobbyScene', { lobbyData })`
- Back → `mpClient.disconnect()`, `scene.start('MenuScene')`

- [ ] **Step 17: Update MenuScene — split GRAJ into two buttons**

Replace the single GRAJ button with two buttons stacked:
- "Jeden Karaluch" (0x880000) → `startGame()` (existing solo flow)
- "Zjazd Karaluchów" (0x006688) → prompt for nickname if not set, then `scene.start('MultiplayerMenuScene')`

Keep "Bycze Karaluchy" and "O co chodzi?" buttons below, adjust spacing.

- [ ] **Step 18: Register new scenes in main.ts**

```typescript
import { MultiplayerMenuScene } from './scenes/MultiplayerMenuScene';
import { LobbyScene } from './scenes/LobbyScene';
import { MultiplayerGameOverScene } from './scenes/MultiplayerGameOverScene';

// Add to scene array:
scene: [BootScene, MenuScene, MultiplayerMenuScene, LobbyScene, GameScene, MultiplayerGameOverScene, GameOverScene],
```

- [ ] **Step 19: Commit**

```bash
git add src/scenes/MultiplayerMenuScene.ts src/scenes/MenuScene.ts src/main.ts
git commit -m "feat(mp): multiplayer menu scene with lobby browser"
```

### Task 8: LobbyScene

**Files:**
- Create: `src/scenes/LobbyScene.ts`

- [ ] **Step 20: Create LobbyScene**

This scene shows:
1. Title: "{host}'s Lobby"
2. Player list — each row: color swatch (clickable to cycle for own player) + player name
3. Color swatch: rectangle filled with PLAYER_COLORS[player.color]. Tapping your own cycles to next available color.
4. "Rozpocznij Grę" (Start Game) button — only visible to host, only enabled when >= 2 players
5. "Opuść" (Leave) button — always visible
6. Listen for `lobby:updated` to refresh player list
7. Listen for `game:start` to transition to GameScene with multiplayer config

Data passed from MultiplayerMenuScene: `{ lobbyData: MPLobbyData }`

On `game:start` event received:
```typescript
this.scene.start('GameScene', {
  multiplayer: true,
  seed: data.seed,
  players: data.players, // includes self
  myId: mpClient.myId,
});
```

- [ ] **Step 21: Commit**

```bash
git add src/scenes/LobbyScene.ts
git commit -m "feat(mp): lobby scene with player list, colors, and start"
```

---

## Chunk 4: Ghost Players + Game Integration

### Task 9: GhostPlayer

**Files:**
- Create: `src/multiplayer/GhostPlayer.ts`

- [ ] **Step 22: Create GhostPlayer class**

```typescript
// src/multiplayer/GhostPlayer.ts
import Phaser from 'phaser';
import { PLAYER_COLORS } from '../../server/lobby';

// Re-export colors client-side to avoid importing server code
export const MP_PLAYER_COLORS = [
  0xff0000, 0x00ff00, 0x0000ff, 0xffff00,
  0xff00ff, 0x00ffff, 0xff6600, 0x6600ff,
  0x00ff66, 0xff0066, 0x66ff00, 0x0066ff,
  0xff3399, 0x33ff99, 0x9933ff, 0x99ff33,
];

export class GhostPlayer {
  readonly id: string;
  readonly name: string;
  readonly color: number; // hex color value
  readonly sprite: Phaser.GameObjects.Sprite;

  private scene: Phaser.Scene;
  private targetX: number;
  private targetLane: string = 'bottom';
  private _alive = true;
  private _score = 0;
  private _stats: Record<string, unknown> = {};

  // Animation
  private runFrames = ['cockroach-idle', 'cockroach-running'];
  private animFrame = 0;
  private animTimer = 0;

  get alive(): boolean { return this._alive; }
  get score(): number { return this._score; }
  get stats(): Record<string, unknown> { return this._stats; }
  get lane(): string { return this.targetLane; }

  constructor(scene: Phaser.Scene, id: string, name: string, colorIndex: number, startX: number, floorBottomY: number) {
    this.scene = scene;
    this.id = id;
    this.name = name;
    this.color = MP_PLAYER_COLORS[colorIndex] ?? 0xffffff;
    this.targetX = startX;

    this.sprite = scene.add.sprite(startX, floorBottomY - 20, 'cockroach-idle');
    this.sprite.setAlpha(0.2);
    this.sprite.setTint(this.color);
    this.sprite.setDepth(500); // below HUD, above background
  }

  setLane(lane: string, floorTopY: number, floorBottomY: number): void {
    this.targetLane = lane;
    this.sprite.y = (lane === 'top' ? floorTopY : floorBottomY) - 20;
  }

  setPosition(x: number, lane: string, floorTopY: number, floorBottomY: number): void {
    this.targetX = x;
    if (lane !== this.targetLane) {
      this.setLane(lane, floorTopY, floorBottomY);
    }
  }

  setDashing(active: boolean): void {
    this.sprite.setAlpha(active ? 0.35 : 0.2);
  }

  setPill(active: boolean): void {
    if (active) {
      this.sprite.setTint(0xff00ff); // pill visual
    } else {
      this.sprite.setTint(this.color);
    }
  }

  die(score: number, stats: Record<string, unknown>): void {
    this._alive = false;
    this._score = score;
    this._stats = stats;
    this.sprite.setAlpha(0.05);
    this.sprite.setTint(0x444444);
  }

  update(delta: number): void {
    if (!this._alive) return;

    // Smooth interpolation toward target X
    this.sprite.x = Phaser.Math.Linear(this.sprite.x, this.targetX, 0.15);

    // Run animation
    this.animTimer += delta;
    if (this.animTimer >= 200) {
      this.animTimer = 0;
      this.animFrame = (this.animFrame + 1) % this.runFrames.length;
      this.sprite.setTexture(this.runFrames[this.animFrame]);
    }
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
```

- [ ] **Step 23: Commit**

```bash
git add src/multiplayer/GhostPlayer.ts
git commit -m "feat(mp): ghost player renderer with interpolation"
```

### Task 10: GhostManager

**Files:**
- Create: `src/multiplayer/GhostManager.ts`

- [ ] **Step 24: Create GhostManager**

Manages all ghost players, off-screen arrows, and spectator mode.

```typescript
// src/multiplayer/GhostManager.ts
import Phaser from 'phaser';
import { GhostPlayer, MP_PLAYER_COLORS } from './GhostPlayer';
import { mpClient, MPPlayer } from './MultiplayerClient';

export class GhostManager {
  private scene: Phaser.Scene;
  private ghosts = new Map<string, GhostPlayer>();
  private arrows: Phaser.GameObjects.Container[] = [];
  private floorTopY: number;
  private floorBottomY: number;
  private myId: string;

  // Spectator
  private spectating = false;
  private spectateTarget: GhostPlayer | null = null;
  private spectateOverlay: Phaser.GameObjects.Text | null = null;
  private spectateIndex = 0;

  // Position sync timer
  private positionTimer = 0;

  constructor(scene: Phaser.Scene, players: MPPlayer[], myId: string, floorTopY: number, floorBottomY: number, startX: number) {
    this.scene = scene;
    this.myId = myId;
    this.floorTopY = floorTopY;
    this.floorBottomY = floorBottomY;

    // Create ghosts for all OTHER players
    for (const p of players) {
      if (p.id === myId) continue;
      const ghost = new GhostPlayer(scene, p.id, p.name, p.color, startX, floorBottomY);
      this.ghosts.set(p.id, ghost);
    }

    this.setupListeners();
  }

  private setupListeners(): void {
    mpClient.on('game:player-swap', (data: any) => {
      const ghost = this.ghosts.get(data.id);
      ghost?.setLane(data.lane, this.floorTopY, this.floorBottomY);
    });

    mpClient.on('game:player-dash-start', (data: any) => {
      this.ghosts.get(data.id)?.setDashing(true);
    });

    mpClient.on('game:player-dash-end', (data: any) => {
      this.ghosts.get(data.id)?.setDashing(false);
    });

    mpClient.on('game:player-pill-start', (data: any) => {
      this.ghosts.get(data.id)?.setPill(true);
    });

    mpClient.on('game:player-pill-end', (data: any) => {
      this.ghosts.get(data.id)?.setPill(false);
    });

    mpClient.on('game:player-position', (data: any) => {
      const ghost = this.ghosts.get(data.id);
      ghost?.setPosition(data.x, data.lane, this.floorTopY, this.floorBottomY);
    });

    mpClient.on('game:player-death', (data: any) => {
      const ghost = this.ghosts.get(data.id);
      ghost?.die(data.score, data.stats);
    });
  }

  /** Called every frame from GameScene.update() */
  update(delta: number, playerX: number, cameraScrollX: number, cameraWidth: number): void {
    // Update ghost sprites
    for (const ghost of this.ghosts.values()) {
      ghost.update(delta);
    }

    // Send own position periodically
    this.positionTimer += delta;
    if (this.positionTimer >= 500) {
      this.positionTimer = 0;
      // Position is sent from GameScene which has access to player
    }

    // Update off-screen arrows
    this.updateArrows(cameraScrollX, cameraWidth);

    // If spectating, follow target
    if (this.spectating && this.spectateTarget?.alive) {
      // Camera follow is handled by GameScene
    }
  }

  private updateArrows(cameraScrollX: number, cameraWidth: number): void {
    // Clear old arrows
    this.arrows.forEach(a => a.destroy());
    this.arrows = [];

    const leftX = cameraScrollX;
    const rightX = cameraScrollX + cameraWidth;
    const leftPlayers: GhostPlayer[] = [];
    const rightPlayers: GhostPlayer[] = [];

    for (const ghost of this.ghosts.values()) {
      if (!ghost.alive) continue;
      if (ghost.sprite.x < leftX) leftPlayers.push(ghost);
      else if (ghost.sprite.x > rightX) rightPlayers.push(ghost);
    }

    // Left arrows
    leftPlayers.forEach((ghost, i) => {
      const y = 60 + i * 20;
      const arrow = this.scene.add.container(0, 0);
      const arrowText = this.scene.add.text(16, y, `◀ ${ghost.name}`, {
        fontSize: '8px',
        fontFamily: '"Press Start 2P", monospace',
        color: `#${ghost.color.toString(16).padStart(6, '0')}`,
        stroke: '#000000',
        strokeThickness: 2,
      }).setScrollFactor(0).setDepth(3500);
      arrow.add(arrowText);
      this.arrows.push(arrow);
    });

    // Right arrows
    rightPlayers.forEach((ghost, i) => {
      const y = 60 + i * 20;
      const arrow = this.scene.add.container(0, 0);
      const arrowText = this.scene.add.text(cameraWidth - 16, y, `${ghost.name} ▶`, {
        fontSize: '8px',
        fontFamily: '"Press Start 2P", monospace',
        color: `#${ghost.color.toString(16).padStart(6, '0')}`,
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(1, 0).setScrollFactor(0).setDepth(3500);
      arrow.add(arrowText);
      this.arrows.push(arrow);
    });
  }

  /** Start spectating after local player dies */
  startSpectating(): void {
    this.spectating = true;
    this.cycleSpectate(0);
  }

  /** Cycle to next/prev alive player. direction: 1 or -1 */
  cycleSpectate(direction: number): GhostPlayer | null {
    const alive = [...this.ghosts.values()]
      .filter(g => g.alive)
      .sort((a, b) => b.score - a.score); // highest score first

    if (alive.length === 0) {
      this.spectateTarget = null;
      return null;
    }

    this.spectateIndex = (this.spectateIndex + direction + alive.length) % alive.length;
    this.spectateTarget = alive[this.spectateIndex];

    // Update overlay
    this.spectateOverlay?.destroy();
    this.spectateOverlay = this.scene.add.text(
      this.scene.cameras.main.width / 2, 30,
      `Oglądanie: ${this.spectateTarget.name}`,
      {
        fontSize: '12px',
        fontFamily: '"Press Start 2P", monospace',
        color: `#${this.spectateTarget.color.toString(16).padStart(6, '0')}`,
        stroke: '#000000',
        strokeThickness: 4,
      },
    ).setOrigin(0.5).setScrollFactor(0).setDepth(4000);

    // Wobble
    this.scene.tweens.add({
      targets: this.spectateOverlay,
      angle: { from: -2, to: 2 },
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    return this.spectateTarget;
  }

  get isSpectating(): boolean { return this.spectating; }
  get spectateTargetPlayer(): GhostPlayer | null { return this.spectateTarget; }

  /** Check if all other players are dead */
  allDead(): boolean {
    for (const ghost of this.ghosts.values()) {
      if (ghost.alive) return false;
    }
    return true;
  }

  /** Get rankings for post-game */
  getRankings(myScore: number, myName: string, myStats: Record<string, unknown>): Array<Record<string, unknown>> {
    const rankings: Array<Record<string, unknown>> = [
      { id: this.myId, name: myName, score: myScore, stats: myStats },
    ];
    for (const ghost of this.ghosts.values()) {
      rankings.push({ id: ghost.id, name: ghost.name, score: ghost.score, stats: ghost.stats });
    }
    rankings.sort((a, b) => (b.score as number) - (a.score as number));
    return rankings;
  }

  destroy(): void {
    for (const ghost of this.ghosts.values()) ghost.destroy();
    this.ghosts.clear();
    this.arrows.forEach(a => a.destroy());
    this.spectateOverlay?.destroy();
    mpClient.off('game:player-swap');
    mpClient.off('game:player-dash-start');
    mpClient.off('game:player-dash-end');
    mpClient.off('game:player-pill-start');
    mpClient.off('game:player-pill-end');
    mpClient.off('game:player-position');
    mpClient.off('game:player-death');
  }
}
```

- [ ] **Step 25: Commit**

```bash
git add src/multiplayer/GhostManager.ts
git commit -m "feat(mp): ghost manager with arrows and spectating"
```

### Task 11: GameScene Multiplayer Integration

**Files:**
- Modify: `src/scenes/GameScene.ts`
- Modify: `src/objects/Player.ts`

- [ ] **Step 26: Accept multiplayer config in GameScene.create()**

GameScene.create() receives optional data:
```typescript
interface GameSceneData {
  multiplayer?: boolean;
  seed?: number;
  players?: MPPlayer[];
  myId?: string;
}
```

When `multiplayer` is true:
1. Create `SeededRNG` with the provided seed: `this.rng = new SeededRNG(data.seed!)`
2. Create `GhostManager` with the players list
3. Set `this.isMultiplayer = true`

- [ ] **Step 27: Emit player events from GameScene**

Add event emissions at the right places in GameScene:

- **Lane swap**: In the swap handler, after `player.swapLane()`:
  ```typescript
  if (this.isMultiplayer) {
    mpClient.sendSwap(this.player.currentFloor);
  }
  ```

- **Dash start/end**: In Player.ts `startDash()` and when dash ends:
  ```typescript
  // Add callback hooks to Player or emit from GameScene
  if (this.isMultiplayer) {
    mpClient.sendDashStart(); // or sendDashEnd()
  }
  ```

- **Pill start/end**: Similarly when pill is collected and when it expires
  ```typescript
  if (this.isMultiplayer) {
    mpClient.sendPillStart(); // or sendPillEnd()
  }
  ```

- **Position**: Every 500ms in update():
  ```typescript
  if (this.isMultiplayer) {
    this.mpPositionTimer += delta;
    if (this.mpPositionTimer >= 500) {
      this.mpPositionTimer = 0;
      mpClient.sendPosition(this.player.sprite.x, this.player.currentFloor);
    }
  }
  ```

- **Death**: In the death handler:
  ```typescript
  if (this.isMultiplayer) {
    mpClient.sendDeath(this.score, this.getStats());
    this.ghostManager!.startSpectating();
    // Don't transition to GameOverScene yet — wait for all players to die
  }
  ```

- [ ] **Step 28: Spectator mode in GameScene**

After local player dies in multiplayer:
1. Don't transition to GameOverScene
2. Start spectating via GhostManager
3. Camera smoothly pans to spectated player's X position
4. Left/right tap or A/D keys cycle between alive players (smooth camera transition using tween)
5. Listen for `game:over` event → transition to MultiplayerGameOverScene with rankings
6. If local player is last alive and dies, emit `game:all-dead` with full rankings

Camera follow for spectating:
```typescript
if (this.ghostManager?.isSpectating) {
  const target = this.ghostManager.spectateTargetPlayer;
  if (target) {
    // Smooth pan to target
    this.cameras.main.stopFollow();
    this.tweens.add({
      targets: this.cameras.main,
      scrollX: target.sprite.x - 200,
      duration: 400,
      ease: 'Power2',
    });
  }
}
```

- [ ] **Step 29: Commit**

```bash
git add src/scenes/GameScene.ts src/objects/Player.ts
git commit -m "feat(mp): game scene multiplayer integration with events and spectating"
```

---

## Chunk 5: MultiplayerGameOverScene + Polish

### Task 12: MultiplayerGameOverScene

**Files:**
- Create: `src/scenes/MultiplayerGameOverScene.ts`

- [ ] **Step 30: Create post-game rankings scene**

This scene receives `{ rankings, lobbyId, isHost, myId }` and displays:

1. Title: "WYNIKI ZJAZDU" (wobbly, trippy)
2. Rankings table — each row: rank, color swatch, player name, score
   - Columns for stats: Apples, Tyskie, Pills, Distance, Biggest Combo, Score
   - Top 3 get trippy effects (same as scoreboard)
   - If a player's score is a new personal highscore, auto-save it and show a "NOWY REKORD!" badge next to their name
3. For host: "Rewanżyk" (Rematch) button — locked for 10 seconds with visible countdown, then clickable
   - Triggers `mpClient.restartLobby()` which brings everyone back to LobbyScene
4. "Opuść" (Leave) button — always visible, goes to MultiplayerMenuScene
5. Non-host players see: "Oczekiwanie na karalucha gospodarza..." text instead of Rematch button

Auto-save highscore logic:
```typescript
const myRanking = rankings.find(r => r.id === myId);
if (myRanking) {
  const currentHigh = parseInt(localStorage.getItem('cockroach-highscore') || '0', 10);
  if (myRanking.score > currentHigh) {
    localStorage.setItem('cockroach-highscore', String(myRanking.score));
    // Show badge and auto-submit to leaderboard
    submitScore(localStorage.getItem('cockroach-mp-name') || 'Karaluch', myRanking);
  }
}
```

Listen for:
- `lobby:updated` with status 'waiting' → transition to LobbyScene (host pressed rematch)
- New player joining in postgame → update player list

- [ ] **Step 31: Commit**

```bash
git add src/scenes/MultiplayerGameOverScene.ts
git commit -m "feat(mp): multiplayer game over scene with rankings and rematch"
```

### Task 13: Vite Proxy for Socket.IO

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 32: Add Socket.IO proxy to dev server**

```typescript
server: {
  proxy: {
    '/api': {
      target: 'https://cockroach.wszystko.app',
      changeOrigin: true,
    },
    '/socket.io': {
      target: 'http://localhost:3000',
      ws: true,
    },
  },
},
```

- [ ] **Step 33: Commit**

```bash
git add vite.config.ts
git commit -m "feat(mp): add socket.io dev proxy"
```

### Task 14: Server DB — Batch Score Insert

**Files:**
- Modify: `server/db.ts`

- [ ] **Step 34: Add insertScores batch method**

```typescript
export function insertScores(entries: Array<{
  name: string;
  score: number;
  deathCause?: string | null;
  distance?: number | null;
  timeSurvived?: number | null;
}>): void {
  const stmt = db.prepare(
    'INSERT INTO scores (name, score, death_cause, distance, time_survived) VALUES (?, ?, ?, ?, ?)'
  );
  const insertMany = db.transaction((entries) => {
    for (const e of entries) {
      stmt.run(e.name, e.score, e.deathCause ?? null, e.distance ?? null, e.timeSurvived ?? null);
    }
  });
  insertMany(entries);
}
```

- [ ] **Step 35: Commit**

```bash
git add server/db.ts
git commit -m "feat(mp): batch score insert for multiplayer results"
```

---

## Chunk 6: Integration Testing + Final Polish

### Task 15: End-to-End Integration

- [ ] **Step 36: Test solo mode regression**

Play a full solo game. Verify:
- Menu shows two play buttons
- "Jeden Karaluch" starts solo game normally
- Obstacles, pickups, scoring, death, highscores all work unchanged
- Seeded RNG is NOT used (rng is null)

- [ ] **Step 37: Test multiplayer lobby flow**

1. Open two browser tabs
2. Tab 1: Click "Zjazd Karaluchów", set nickname, create lobby
3. Tab 2: Click "Zjazd Karaluchów", set nickname, see lobby in list, join
4. Both tabs see each other in lobby with color swatches
5. Tab 2 can change color, Tab 1 (host) sees update
6. Tab 1 clicks "Rozpocznij Grę"
7. Both transition to GameScene with 3-2-1 countdown

- [ ] **Step 38: Test multiplayer gameplay**

1. Both players see identical obstacle layout (same seed)
2. Each player sees the other as a colored ghost (20% opacity)
3. Off-screen arrows appear when other player is ahead/behind
4. Lane swaps, dashes, pill effects sync correctly
5. When one player dies, they start spectating the other
6. Spectating shows "Oglądanie: {name}" overlay
7. When last player dies, both see MultiplayerGameOverScene

- [ ] **Step 39: Test post-game flow**

1. Rankings table shows correct scores and stats
2. New highscores auto-save
3. Host sees 10s countdown → "Rewanżyk" button
4. Non-host sees "Oczekiwanie..." text
5. Host pressing Rewanżyk brings both back to lobby
6. "Opuść" brings player to lobby list

- [ ] **Step 40: Commit final polish**

```bash
git add -A
git commit -m "feat(mp): multiplayer implementation complete"
```

---

## Implementation Order + Parallelization

Tasks can be parallelized into these independent workstreams:

**Workstream A (Server):** Tasks 3 → 4 → 5 → 14
**Workstream B (Core Client):** Tasks 1 → 2 → 6
**Workstream C (Scenes):** Tasks 7 → 8 (depends on Task 6)
**Workstream D (Game Integration):** Tasks 9 → 10 → 11 (depends on Tasks 1, 2, 6)
**Workstream E (Post-Game):** Task 12 (depends on Task 6)
**Workstream F (Config):** Task 13

After all workstreams complete: Task 15 (integration testing)

**Recommended agent dispatch:**
1. Agent A: Server (Tasks 3-5, 14) — independent, no client deps
2. Agent B: SeededRNG + Spawner refactor (Tasks 1-2) — independent
3. Agent C: MultiplayerClient + Menu scenes (Tasks 6-8) — after Agent B seeds
4. Agent D: Ghost system + Game integration (Tasks 9-11) — after Agents B and C
5. Agent E: Post-game scene (Task 12) — after Agent C
6. Agent F: Config (Task 13) — independent, quick
