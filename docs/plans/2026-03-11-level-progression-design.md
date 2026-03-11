# Level Progression System Design

## Overview
Every 1000 points, the game level changes. Each level swaps backgrounds, floor tiles, and BGM. 10 levels total, level 10 is permanent after 9000 points.

## Level Data

| Lv | Name | Points | FG Depth |
|----|------|--------|----------|
| 1 | Zwykła Kuchnia | 0-999 | Below floors |
| 2 | Klatka Schodowa | 1000-1999 | Below floors |
| 3 | Bazar na Stadionie | 2000-2999 | Below floors |
| 4 | Las Grochodrzew | 3000-3999 | Above floors |
| 5 | Wigilia u Babci | 4000-4999 | Below floors |
| 6 | Dyskoteka w Remizie | 5000-5999 | Below floors |
| 7 | Morze Bałtyckie | 6000-6999 | Above floors |
| 8 | Papież na Księżycu | 7000-7999 | Above floors |
| 9 | Wymiar Żubrówki | 8000-8999 | Above floors |
| 10 | KARALUCH WIDZI WSZYSTKO | 9000+ | Above floors |

## Asset Structure
- `public/new/sky/lv{1-10}.png` — 1024x512, deepest parallax layer
- `public/new/mid/lv{1-10}.png` — 1024x512, SOFT_LIGHT blend mode
- `public/new/fg/lv{1-10}.png` — 1024x512, depth varies per level
- `public/new/floor/lv{1-10}.png` — 32x16, single tile for both top and bottom floor
- `public/new/soundtracks/lv{1-10}.mp3` — per-level BGM

## Parallax Speeds
- Sky (deepest): `scrollX * 0.1`
- BG/Mid: `scrollX * 0.4`, blend mode SOFT_LIGHT
- FG: `scrollX * 0.7`, dynamic movement

## Layer Ordering
- Sky: depth 0 (always deepest)
- BG/Mid: depth 1
- FG below floors: depth 2 (lv 1,2,3,5,6)
- Floor tiles: depth 3
- FG above floors: depth 5 (lv 4,7,8,9,10)
- Game objects: depth 5+

## Level Transition
- Hard-cut: instant texture swap
- Text announcement: "POZIOM X: [LEVEL NAME]!" with scale-in, hold, fade-out
- BGM crossfade: fade out old over ~1s, start new

## Architecture

### New file: `src/config/levels.ts`
Level config array with per-level data: name, asset keys, FG depth, BGM key.

### Changes to `BootScene.ts`
Load all 50 textures + 10 BGM tracks. Old background/floor assets removed.

### Changes to `GameScene.ts`
- Track `currentLevel` (1-10)
- On score change, check `Math.min(Math.floor(score / 1000) + 1, 10)`
- When level changes: swap tileSprite textures, change floor tile, crossfade BGM, show announcement
- FG depth changes per level config

### Changes to `AudioManager.ts`
- `switchBGM(key)` method: fade out current, start new track
- Pitch scaling continues to work on the new track

### Old assets to delete
- `public/backgrounds/` (sky.png, midground.png, floor-top.png, floor-bottom.png, foreground.png)
- References in BootScene replaced with new level assets
