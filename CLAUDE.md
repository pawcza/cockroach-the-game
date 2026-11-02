# Cockroach the Game

2D side-scrolling Phaser 3 game with socket.io multiplayer. A cockroach runs, dodges obstacles, collects pickups.

## Stack

- **Frontend**: TypeScript, Phaser 3.90, Vite
- **Server**: TypeScript, Express, socket.io, better-sqlite3
- **Deploy**: Docker, single container serves both

## Commands

- `npm run dev` — Vite dev server + game server (concurrently)
- `npx tsc --noEmit` — Type-check (run after changes)
- `npm run build` — Production build
- `npm test` — Unit tests

## Structure

```
src/
  scenes/          # Phaser scenes (Menu, Game, Lobby, GameOver, etc.)
  objects/         # Player, ObstacleSpawner
  multiplayer/     # MultiplayerClient, GhostPlayer, GhostManager, SeededRNG
  ui/              # GameHUD, TouchControls, shared button utilities
  config/          # constants, levels
  effects/         # VisualEffects
  audio/           # AudioManager
  utils/           # TextStyles, TweenPatterns, SceneTransition
server/
  app.ts           # Express routes and the socket server, built without listening so tests can run it
  index.ts         # Starts the server, handles shutdown
  multiplayer.ts   # Socket.io game logic
  lobby.ts         # Lobby state. Also imported by the client for PLAYER_COLORS, so no Node imports here
  validate.ts      # Parsers for everything a client sends
  net.ts           # Real client IP, origin check, token bucket
tests/
  support/         # Runs the real server for the socket and API tests
public/
  assets/          # Sprites, backgrounds
  audio/           # Sound effects and music (.ogg)
  levels/          # Per-level floor tiles and soundtracks
```

## Key Conventions

- UI text is in **Polish** (game targets Polish audience).
- All UI buttons use `createButton()` from `src/ui/shared.ts`.
- Depth constants live in `DEPTH` enum in `src/config/constants.ts`. Never hardcode depth numbers.
- Text styles use factories from `src/utils/TextStyles.ts` (`neonStyle`, `bodyStyle`, `smallStyle`, `popupStyle`, `buttonStyle`).
- Audio files are `.ogg` format.

## Multiplayer

- Seeded RNG (`SeededRNG` / Mulberry32) ensures deterministic obstacle/pickup spawning across clients.
- **Never use seeded RNG for cosmetic effects** (particles, stink waves, tears, dust). Use `Math.random()` or `Phaser.Math.Between()` instead — seeded RNG calls must stay in sync across clients.
- Ghost players simulate movement locally using the same speed formula as Player.
- Socket events: `game:swap`, `game:position`, `game:dash-start/end`, `game:pill-start/end`, `game:pickup`, `game:death`, `game:player-left`, `game:over`, `game:boss-*`.
- Every socket handler goes through `on()` in `server/multiplayer.ts`, which contains exceptions, and every payload through `server/validate.ts`. An uncaught throw in a handler kills the process for everyone.
- The server owns run state: boss HP, who is alive, who hosts the boss, when the game is over. Clients only report.
- A dropped socket loses its lobby (`mpClient.onDrop` sends the scene back to the menu). Rejoin needs a stable player identity, which arrives with accounts.
- Lobby list uses socket.io room push (`lobbies:updated`), not polling.
