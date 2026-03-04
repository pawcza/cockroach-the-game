# Cockroach the Game - Design Document

## Overview

An endless sidescroller where you play as a cockroach auto-running left to right. Collect apples, avoid traps, survive as long as possible. One-hit death. No speed cap — the game gets absurdly fast and that's the fun.

**Stack:** Phaser 3 + Vite + TypeScript

## Game Architecture

### Scenes

- **BootScene** — Load all assets (sprites, audio, backgrounds)
- **MenuScene** — Title screen with "Press Space to Start", high score display, dramatic background
- **GameScene** — Main gameplay loop
- **GameOverScene** — Score display, high score update, "Press Space to Restart"

### Core Loop (GameScene)

1. Cockroach auto-runs right at `speed = 200 + (timeAlive * 2)` px/s — no speed cap
2. Camera follows cockroach, world scrolls
3. Two floors: top and bottom (kitchen counter + floor, or two shelves)
4. Ground tiles repeat infinitely (procedural tiling on both floors)
5. Obstacles and apples spawn ahead of camera, off-screen right, on either floor
6. Collision with apple -> score++, apple disappears
7. Collision with trap -> death animation -> GameOverScene

### Controls

- **Space / Arrow Up** — Jump (bottom floor: jump to top floor; top floor: hop to clear ground obstacles)
- **Ctrl / Arrow Down** — Drop from top floor to bottom floor

## Visual Design

### Aesthetic

Dark, dramatic, slightly surreal — Courage the Cowardly Dog meets Icy Tower. Deep purples, sickly greens, warm oranges, blood reds.

### Background (3-layer parallax)

1. **Far:** Dark purple/crimson sky, oversized eerie moon, wispy clouds
2. **Mid:** Silhouetted decrepit houses/dead trees (Nowhere aesthetic)
3. **Near:** Ground — cracked kitchen floor tiles (everything oversized from cockroach POV)

### Sprites

**Cockroach:**
- Running animation (4-6 frames), antennae bobbing
- Jump frame (legs tucked)
- Death frame (flipped on back)

**Obstacles (all oversized from cockroach perspective):**
- **Pest spray** — Can spraying downward, green mist cloud = hitbox
- **Newspaper smash** — Rolled newspaper slamming down periodically
- **Onion** — Sitting on ground, emitting wavy stink lines
- **Flipper hit** — Sandal/flipper swinging from above
- **Bird** — Swooping down from top of screen
- **Cat paw** — Swiping from behind furniture

**Apples:** Red apple sprites, slightly glowing, sparkle effect on collect.

### Art Style

AI-generated pixel art. Placeholder assets initially, replaceable later.

## Gameplay Mechanics

### Movement

- Auto-run at `speed = 200 + (timeAlive * 2)` px/s
- No speed cap — it accelerates forever
- Two-floor lane system

### Jump Physics

- Arcade physics gravity: ~800
- Jump velocity: ~-400
- Single jump only (no double jump)
- Slight hang time at apex for dramatic feel

### Obstacle Behavior

- **Pest spray:** Static position, sprays periodically — hitbox is the mist
- **Newspaper:** Slams down from above on timer — run past or jump over shadow
- **Onion:** Static ground obstacle — jump over it
- **Flipper:** Swings from above in an arc — timing-based
- **Bird:** Flies in from the right at varying heights
- **Cat paw:** Swipes from behind objects — visual tell before hitbox activates
- Some obstacles can span both floors (e.g., pest spray mist)
- Trap spawn frequency stays constant — speed increase alone raises difficulty

### Scoring

- +10 per apple collected
- +1 per second survived (distance bonus)
- High score saved to localStorage

### Death

- One-hit kill on any trap contact
- Screen flash, cockroach flips on back, brief pause, then GameOver scene

## Audio

### Background Music

- Eerie, slightly comedic loop (Courage the Cowardly Dog tension vibe)
- Tempo/pitch subtly increases with speed

### Sound Effects

- **Jump:** Whoosh/spring boing
- **Apple collect:** Crunch/sparkle
- **Death:** Splat + comedic "wa wa waa" trombone
- **Newspaper slam:** Heavy thwack
- **Pest spray:** Hissing psssst
- **Bird swoop:** Quick screech
- **Cat paw:** Aggressive meow/hiss
- **Flipper:** Whoosh-slap
- **Onion:** Subtle sizzle/stink
- **Floor switch:** Light thud on landing

Placeholder generated audio initially, replaceable later.
