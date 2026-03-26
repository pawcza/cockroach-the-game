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
- `./deploy.sh` — Pull, rebuild Docker, restart

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
  multiplayer.ts   # Socket.io game logic
  index.ts         # Express + Vite middleware
public/
  assets/          # Sprites, backgrounds
  audio/           # Sound effects and music (.ogg)
  levels/          # Per-level floor tiles and soundtracks
```

## Key Conventions

- UI text is in **Polish** (game targets Polish audience).
- All UI buttons use `createButton()` from `src/ui/shared.ts`. DOM overlays use `createHtmlButton()`.
- Depth constants live in `DEPTH` enum in `src/config/constants.ts`. Never hardcode depth numbers.
- Text styles use factories from `src/utils/TextStyles.ts` (`neonStyle`, `bodyStyle`, `smallStyle`, `popupStyle`, `buttonStyle`).
- Audio files are `.ogg` format.

## Multiplayer

- Seeded RNG (`SeededRNG` / Mulberry32) ensures deterministic obstacle/pickup spawning across clients.
- **Never use seeded RNG for cosmetic effects** (particles, stink waves, tears, dust). Use `Math.random()` or `Phaser.Math.Between()` instead — seeded RNG calls must stay in sync across clients.
- Ghost players simulate movement locally using the same speed formula as Player.
- Socket events: `game:swap`, `game:dash-start/end`, `game:pill-start/end`, `game:pickup`, `game:death`, `game:over`.
- Lobby list uses socket.io room push (`lobbies:updated`), not polling.
