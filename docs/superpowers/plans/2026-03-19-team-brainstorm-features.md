# Team Brainstorm Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 5 features from the team brainstorm session — lazy asset loading, combo audio/visual feedback tiers, level transition glitch effect, weather system, and death replay.

**Architecture:** Each feature is independent and can be built/tested in isolation. All features integrate into the existing scene/system architecture — no new scenes, no new dependencies. Weather uses SeededRNG for multiplayer determinism. Death replay buffers input locally and renders via a lightweight replay system on the GameOverScene.

**Tech Stack:** Phaser 3.90, TypeScript, existing AudioManager/VisualEffects/SceneManager/GameEventBridge systems.

---

## File Structure

```
src/
  scenes/BootScene.ts          — modify: split into essential + deferred asset groups
  scenes/GameScene.ts           — modify: combo tier events, weather init, input recording
  scenes/GameOverScene.ts       — modify: replay button, replay playback
  scenes/MultiplayerGameOverScene.ts — modify: replay button
  systems/ComboFeedback.ts      — CREATE: combo tier thresholds, visual+audio escalation
  systems/WeatherSystem.ts      — CREATE: rain/fog/wind modifiers, particle emitters
  systems/DeathReplay.ts        — CREATE: input buffer, replay renderer
  effects/LevelTransitionFX.ts  — CREATE: glitch/dissolution shader-like effect between levels
  effects/VisualEffects.ts      — modify: combo glow helper
  audio/AudioManager.ts         — modify: combo chime methods, weather audio filter helpers
  config/constants.ts           — modify: combo tier thresholds, weather constants
  config/levels.ts              — modify: weather chance per level
```

---

## Task 1: Lazy Asset Loading

Split BootScene into essential assets (menu, UI, lv1-3) loaded on boot, and deferred assets (lv4-10, boss) loaded in background during gameplay.

**Files:**
- Modify: `src/scenes/BootScene.ts`
- Modify: `src/scenes/GameScene.ts`

### Steps

- [ ] **Step 1: Split BootScene preload into essential + deferred groups**

In `BootScene.ts`, keep loading: all sprites, UI, menu backgrounds, audio SFX, menu/gameover BGMs, and levels 1-3 (images + BGMs). Move levels 4-10 images, BGMs, and ALL boss assets into a new method `loadDeferred()`.

```typescript
// BootScene.ts — add after preload()
private deferredLoaded = false;

loadDeferred(): void {
  if (this.deferredLoaded) return;
  this.deferredLoaded = true;

  // Levels 4-10 backgrounds
  for (let i = 4; i <= 10; i++) {
    for (const [prefix, dir] of [['sky', 'sky'], ['bg', 'mid'], ['fg', 'fg'], ['floor', 'floor']] as const) {
      this.load.image(`lv${i}-${prefix}`, `levels/${dir}/lv${i}.webp`);
    }
    this.load.audio(`bgm-lv${i}`, `levels/soundtracks/lv${i}.ogg`);
  }

  // Boss fight assets
  const bossImages = [ /* existing boss image array */ ];
  for (const [key, path] of bossImages) this.load.image(key, path);
  const bossAudio = [ /* existing boss audio array */ ];
  for (const [key, path] of bossAudio) this.load.audio(key, path);
  for (let i = 1; i <= 6; i++) this.load.audio(`boss-hurt-${i}`, `boss/hurt-${i}.ogg`);
  for (let i = 1; i <= 7; i++) this.load.audio(`boss-cue-${i}`, `boss/boss-cue-${i}.ogg`);

  this.load.start();
}
```

Modify `preload()` to only load levels 1-3 in the loop (`for (let i = 1; i <= 3; i++)`). Remove boss assets from preload entirely.

- [ ] **Step 2: Trigger deferred loading from GameScene**

In `GameScene.ts` `create()`, after HUD setup, call:

```typescript
// Start loading deferred assets in background
const boot = this.scene.get('BootScene') as BootScene;
boot.loadDeferred();
```

Export `BootScene` class and the `loadDeferred` method. The `load.start()` call runs asynchronously — Phaser continues gameplay while assets download in background.

- [ ] **Step 3: Guard level transitions against missing assets**

In `GameScene.ts` `switchLevel()`, before setting textures, check if the assets exist:

```typescript
const skyKey = `lv${config.level}-sky`;
if (!this.textures.exists(skyKey)) {
  // Assets still loading — skip visual transition, keep current backgrounds
  // Audio may also be missing — only switch if available
  if (this.cache.audio.exists(config.bgmKey)) {
    this.audio.switchBGM(config.bgmKey);
  }
  return;
}
```

This gracefully handles the rare case where a player reaches level 4+ before deferred loading completes (extremely unlikely on anything better than 2G).

- [ ] **Step 4: Type-check and commit**

Run: `npx tsc --noEmit`

```bash
git add src/scenes/BootScene.ts src/scenes/GameScene.ts
git commit -m "perf: lazy-load levels 4-10 and boss assets during gameplay

Essential assets (menu, UI, lv1-3) load at boot for fast first paint.
Remaining levels and boss fight assets load asynchronously once gameplay
starts. Graceful fallback if assets aren't ready during level transition."
```

---

## Task 2: Combo Audio/Visual Feedback Tiers

Add escalating audio pings and visual intensity as combo grows. Tiers: 5, 10, 25, 50, 100, 150. Keep it tasteful — the game already has a lot going on.

**Files:**
- Create: `src/systems/ComboFeedback.ts`
- Modify: `src/config/constants.ts`
- Modify: `src/scenes/GameScene.ts`
- Modify: `src/effects/VisualEffects.ts`
- Modify: `src/audio/AudioManager.ts`

### Steps

- [ ] **Step 1: Define combo tier constants**

In `constants.ts`, add:

```typescript
export const COMBO_TIERS = [
  { threshold: 5,   color: 0x44ff44, label: 'NIEZŁE!', audioTier: 1 },
  { threshold: 10,  color: 0xffff00, label: 'MASAKRA!', audioTier: 2 },
  { threshold: 25,  color: 0xff6600, label: 'SZALEŃSTWO!', audioTier: 3 },
  { threshold: 50,  color: 0xff00ff, label: 'TURBOKOMPOT!', audioTier: 4 },
  { threshold: 100, color: 0x00ffff, label: 'ULTRA KARALUCH!', audioTier: 5 },
  { threshold: 150, color: 0xff0000, label: 'NIEMOŻLIWE!!!', audioTier: 6 },
] as const;
```

- [ ] **Step 2: Create ComboFeedback system**

Create `src/systems/ComboFeedback.ts`:

```typescript
import Phaser from 'phaser';
import { COMBO_TIERS } from '../config/constants';
import { popupStyle } from '../utils/TextStyles';

export class ComboFeedback {
  private scene: Phaser.Scene;
  private lastTier = -1;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Called on every pickup. Returns the tier that was just crossed, or null. */
  onPickup(combo: number): typeof COMBO_TIERS[number] | null {
    const tier = this.getCurrentTier(combo);
    if (tier === null || tier === this.lastTier) return null;
    this.lastTier = tier;
    this.showTierPopup(COMBO_TIERS[tier]);
    return COMBO_TIERS[tier];
  }

  /** Called when combo resets. */
  onComboLost(): void {
    this.lastTier = -1;
  }

  private getCurrentTier(combo: number): number | null {
    for (let i = COMBO_TIERS.length - 1; i >= 0; i--) {
      if (combo >= COMBO_TIERS[i].threshold) return i;
    }
    return null;
  }

  private showTierPopup(tier: typeof COMBO_TIERS[number]): void {
    const cam = this.scene.cameras.main;
    const text = this.scene.add.text(
      cam.width / 2, cam.height * 0.35,
      `x${tier.threshold} ${tier.label}`,
      popupStyle({ fontSize: '14px', color: '#' + tier.color.toString(16).padStart(6, '0') }),
    ).setOrigin(0.5).setScrollFactor(0).setDepth(500);

    this.scene.tweens.add({
      targets: text,
      y: text.y - 30,
      alpha: 0,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 1200,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });
  }
}
```

- [ ] **Step 3: Add combo chime to AudioManager**

In `AudioManager.ts`, add a method that plays a pickup sound with pitch scaling:

```typescript
playComboChime(tier: number): void {
  // Tier 1-6: pitch rises with tier
  const rate = 1.0 + tier * 0.15;
  this.scene.sound.play('apple', { volume: 0.4 + tier * 0.05, rate });
}
```

This reuses the existing `apple` sound at higher pitches — no new audio assets needed.

- [ ] **Step 4: Add screen edge glow for high combos to VisualEffects**

In `VisualEffects.ts`, add a method for a brief edge flash when a tier is crossed:

```typescript
comboTierFlash(color: number): void {
  const { width, height } = this.scene.cameras.main;
  const flash = this.scene.add.rectangle(width / 2, height / 2, width, height, color, 0.15)
    .setScrollFactor(0).setDepth(DEPTH.VFX_VIGNETTE).setBlendMode(Phaser.BlendModes.ADD);
  this.scene.tweens.add({
    targets: flash,
    alpha: 0,
    duration: 400,
    ease: 'Power2',
    onComplete: () => flash.destroy(),
  });
}
```

- [ ] **Step 5: Wire ComboFeedback into GameScene**

In `GameScene.ts`:
- Create `ComboFeedback` instance in `create()` alongside other systems
- In the `incrementCombo` callback, after incrementing, call `comboFeedback.onPickup(this.pickupCombo)`. If it returns a tier, call `this.audio.playComboChime(tier.audioTier)` and `this.vfx.comboTierFlash(tier.color)`
- In the combo-lost handler, call `comboFeedback.onComboLost()`

- [ ] **Step 6: Type-check and commit**

Run: `npx tsc --noEmit`

```bash
git add src/systems/ComboFeedback.ts src/config/constants.ts src/scenes/GameScene.ts src/effects/VisualEffects.ts src/audio/AudioManager.ts
git commit -m "feat: combo tier feedback — escalating chimes and screen flashes

Six combo tiers (5/10/25/50/100/150) with rising pitch chimes reusing
the apple SFX, floating tier label popups, and brief screen edge flashes.
Resets on combo loss. No new audio assets — pitch-shifts existing sounds."
```

---

## Task 3: Level Transition Glitch Effect

A brief visual "reality break" when crossing level boundaries — chromatic aberration burst, screen shake, and audio bitcrush snap.

**Files:**
- Create: `src/effects/LevelTransitionFX.ts`
- Modify: `src/scenes/GameScene.ts`
- Modify: `src/audio/AudioManager.ts`

### Steps

- [ ] **Step 1: Create LevelTransitionFX**

Create `src/effects/LevelTransitionFX.ts`. Since Phaser 3 doesn't have built-in post-processing shaders easily, simulate chromatic aberration by briefly splitting the camera into RGB-tinted overlays:

```typescript
import Phaser from 'phaser';
import { DEPTH } from '../config/constants';

export function playLevelGlitch(scene: Phaser.Scene): void {
  const { width, height } = scene.cameras.main;
  const duration = 300;

  // Screen flash — white snap
  scene.cameras.main.flash(100, 255, 255, 255, true);

  // Chromatic aberration — red and cyan offset rectangles
  const red = scene.add.rectangle(width / 2 - 3, height / 2, width, height, 0xff0000, 0.12)
    .setScrollFactor(0).setDepth(DEPTH.VFX_VIGNETTE).setBlendMode(Phaser.BlendModes.ADD);
  const cyan = scene.add.rectangle(width / 2 + 3, height / 2, width, height, 0x00ffff, 0.12)
    .setScrollFactor(0).setDepth(DEPTH.VFX_VIGNETTE).setBlendMode(Phaser.BlendModes.ADD);

  // Scanline flicker
  const scanlines = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.VFX_VIGNETTE);
  for (let y = 0; y < height; y += 4) {
    scanlines.fillStyle(0x000000, 0.15);
    scanlines.fillRect(0, y, width, 2);
  }

  // Shake
  scene.cameras.main.shake(duration, 0.008);

  // Cleanup
  scene.tweens.add({
    targets: [red, cyan, scanlines],
    alpha: 0,
    duration,
    ease: 'Power2',
    onComplete: () => {
      red.destroy();
      cyan.destroy();
      scanlines.destroy();
    },
  });
}
```

- [ ] **Step 2: Add brief audio glitch to AudioManager**

In `AudioManager.ts` add a method that briefly drops the BGM rate and restores it:

```typescript
glitchBGM(): void {
  if (!this.bgm || !('setRate' in this.bgm)) return;
  const sound = this.bgm as Phaser.Sound.WebAudioSound;
  const originalRate = sound.rate;
  sound.setRate(0.5);
  // Restore after 150ms
  this.scene.time.delayedCall(150, () => {
    if (this.bgm && this.bgm.isPlaying) {
      (this.bgm as Phaser.Sound.WebAudioSound).setRate(originalRate);
    }
  });
}
```

- [ ] **Step 3: Wire into level transition**

In `GameScene.ts` `switchLevel()`, at the start of the method (before the crossfade), call:

```typescript
playLevelGlitch(this);
this.audio.glitchBGM();
```

Import `playLevelGlitch` from the new file.

- [ ] **Step 4: Type-check and commit**

Run: `npx tsc --noEmit`

```bash
git add src/effects/LevelTransitionFX.ts src/scenes/GameScene.ts src/audio/AudioManager.ts
git commit -m "feat: glitch effect on level transitions

Brief chromatic aberration, scanline flicker, camera shake, and BGM
rate-drop when crossing level boundaries. Simulates breaking through
a 'reality wall' between environments."
```

---

## Task 4: Weather System

Gentle weather modifiers per level — rain (visual + slight floor slipperiness), fog (reduced visibility), wind (pickup drift). Seeded for multiplayer determinism. Keep it light.

**Files:**
- Create: `src/systems/WeatherSystem.ts`
- Modify: `src/config/levels.ts`
- Modify: `src/config/constants.ts`
- Modify: `src/scenes/GameScene.ts`

### Steps

- [ ] **Step 1: Add weather config to levels**

In `levels.ts`, add an optional `weather` field to `LevelConfig`:

```typescript
export type WeatherType = 'clear' | 'rain' | 'fog' | 'wind';
```

In the levels array, add weather chances. Only a few levels get weather to keep it gentle:

```typescript
// Level 3: 40% rain, 60% clear
// Level 5: 50% fog, 50% clear
// Level 7: 40% wind, 60% clear
// Level 9: 30% rain, 30% fog, 40% clear
// All others: always clear
```

Store as `weatherChances?: { type: WeatherType; weight: number }[]` on `LevelConfig`.

- [ ] **Step 2: Create WeatherSystem**

Create `src/systems/WeatherSystem.ts`:

```typescript
import Phaser from 'phaser';
import { WeatherType } from '../config/levels';
import { SeededRNG } from '../multiplayer/SeededRNG';
import { DEPTH } from '../config/constants';

export class WeatherSystem {
  private scene: Phaser.Scene;
  private currentWeather: WeatherType = 'clear';
  private rainEmitters: Phaser.GameObjects.Rectangle[] = [];
  private fogOverlay: Phaser.GameObjects.Graphics | null = null;
  private windDrift = 0; // px/s applied to pickups

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  get drift(): number { return this.windDrift; }
  get isRaining(): boolean { return this.currentWeather === 'rain'; }
  get isFoggy(): boolean { return this.currentWeather === 'fog'; }

  /** Roll weather for a level. Uses SeededRNG if multiplayer. */
  setWeather(weather: WeatherType): void {
    this.clear();
    this.currentWeather = weather;
    if (weather === 'rain') this.startRain();
    if (weather === 'fog') this.startFog();
    if (weather === 'wind') this.startWind();
  }

  static rollWeather(
    chances: { type: WeatherType; weight: number }[] | undefined,
    rng: SeededRNG | null,
  ): WeatherType {
    if (!chances || chances.length === 0) return 'clear';
    const total = chances.reduce((s, c) => s + c.weight, 0);
    const roll = (rng?.next() ?? Math.random()) * total;
    let acc = 0;
    for (const c of chances) {
      acc += c.weight;
      if (roll < acc) return c.type;
    }
    return 'clear';
  }

  private startRain(): void {
    // Spawn rain particles continuously using a timer
    // Light diagonal streaks falling from top
    this.scene.time.addEvent({
      delay: 30,
      loop: true,
      callback: () => {
        if (this.currentWeather !== 'rain') return;
        const cam = this.scene.cameras.main;
        const x = cam.scrollX + Math.random() * cam.width;
        const y = cam.scrollY - 10;
        const drop = this.scene.add.rectangle(x, y, 1, Phaser.Math.Between(8, 16), 0x8888cc, 0.3)
          .setDepth(DEPTH.VFX_VIGNETTE);
        this.scene.tweens.add({
          targets: drop,
          x: x - 30,
          y: y + cam.height + 20,
          duration: Phaser.Math.Between(300, 600),
          onComplete: () => drop.destroy(),
        });
      },
    });
  }

  private startFog(): void {
    // Right-side gradient fog — reduces visibility of approaching obstacles
    const cam = this.scene.cameras.main;
    this.fogOverlay = this.scene.add.graphics()
      .setScrollFactor(0).setDepth(DEPTH.VFX_VIGNETTE);
    const fogWidth = cam.width * 0.4;
    for (let i = 0; i < 20; i++) {
      const alpha = (i / 20) * 0.5;
      const x = cam.width - fogWidth + (fogWidth / 20) * i;
      this.fogOverlay.fillStyle(0x222233, alpha);
      this.fogOverlay.fillRect(x, 0, fogWidth / 20, cam.height);
    }
    // Pulse fog density
    this.scene.tweens.add({
      targets: this.fogOverlay,
      alpha: { from: 0.7, to: 1 },
      duration: 3000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private startWind(): void {
    this.windDrift = -30; // pickups drift left slightly (against player)
  }

  clear(): void {
    this.currentWeather = 'clear';
    this.windDrift = 0;
    if (this.fogOverlay) {
      this.fogOverlay.destroy();
      this.fogOverlay = null;
    }
  }

  destroy(): void {
    this.clear();
  }
}
```

- [ ] **Step 3: Wire WeatherSystem into GameScene**

In `GameScene.ts`:
- Create `WeatherSystem` instance in `create()`
- In `switchLevel()`, roll weather and apply:
  ```typescript
  const weather = WeatherSystem.rollWeather(config.weatherChances, this.rng);
  this.weather.setWeather(weather);
  ```
- In the pickup vacuum/movement code, add `this.weather.drift * delta` to pickup X positions if wind is active
- On scene shutdown, call `this.weather.destroy()`

- [ ] **Step 4: Type-check and commit**

Run: `npx tsc --noEmit`

```bash
git add src/systems/WeatherSystem.ts src/config/levels.ts src/config/constants.ts src/scenes/GameScene.ts
git commit -m "feat: weather system — rain, fog, wind on select levels

Weather rolled per level using SeededRNG for multiplayer determinism.
Rain: diagonal particle streaks. Fog: right-side visibility gradient.
Wind: pickup drift against player. Only levels 3/5/7/9 have weather
chances. Clear weather remains dominant."
```

---

## Task 5: Death Replay

Record the last 3 seconds of input before death. Add a "Powtórka" button on GameOverScene that plays back the final moments as a ghost, then returns to the score screen.

**Files:**
- Create: `src/systems/DeathReplay.ts`
- Modify: `src/scenes/GameScene.ts`
- Modify: `src/scenes/GameOverScene.ts`
- Modify: `src/scenes/MultiplayerGameOverScene.ts`

### Steps

- [ ] **Step 1: Create DeathReplay input buffer**

Create `src/systems/DeathReplay.ts`:

```typescript
export interface ReplayFrame {
  /** ms since game start */
  time: number;
  x: number;
  y: number;
  floor: 'top' | 'bottom';
  isDashing: boolean;
  isPillActive: boolean;
  speedMultiplier: number;
  texture: string;
}

export interface ReplayData {
  frames: ReplayFrame[];
  deathTime: number;
  obstacleType: string | null;
  /** Camera scrollX at death for positioning */
  cameraScrollX: number;
}

const BUFFER_DURATION = 3000; // 3 seconds
const SAMPLE_INTERVAL = 50;  // 20fps recording

export class DeathReplayRecorder {
  private frames: ReplayFrame[] = [];
  private startTime = 0;

  start(time: number): void {
    this.startTime = time;
    this.frames = [];
  }

  /** Call every frame from GameScene update. */
  sample(time: number, x: number, y: number, floor: 'top' | 'bottom',
         isDashing: boolean, isPillActive: boolean, speedMultiplier: number,
         texture: string): void {
    // Throttle to SAMPLE_INTERVAL
    const last = this.frames[this.frames.length - 1];
    if (last && time - last.time < SAMPLE_INTERVAL) return;

    this.frames.push({ time, x, y, floor, isDashing, isPillActive, speedMultiplier, texture });

    // Trim to buffer duration
    const cutoff = time - BUFFER_DURATION;
    while (this.frames.length > 0 && this.frames[0].time < cutoff) {
      this.frames.shift();
    }
  }

  getReplayData(cameraScrollX: number, obstacleType: string | null): ReplayData {
    return {
      frames: [...this.frames],
      deathTime: this.frames.length > 0 ? this.frames[this.frames.length - 1].time : 0,
      obstacleType,
      cameraScrollX,
    };
  }
}
```

- [ ] **Step 2: Record frames in GameScene**

In `GameScene.ts`:
- Create `DeathReplayRecorder` instance in `create()`, call `recorder.start(this.time.now)`
- In the main `update()` loop (active play section), call:
  ```typescript
  this.replayRecorder.sample(
    this.time.now, this.player.x, this.player.y,
    this.player.currentFloor, this.player.isDashing,
    this.player.isPillActive, this.player.speedMultiplier,
    this.player.sprite.texture.key,
  );
  ```
- In `GameOverHandler.die()`, before transitioning, attach replay data to the scene data:
  ```typescript
  const replayData = this.replayRecorder.getReplayData(
    this.cameras.main.scrollX,
    obstacleType,
  );
  // Add to the data passed to GameOverScene
  ```

- [ ] **Step 3: Add replay playback to GameOverScene**

In `GameOverScene.ts`:
- Store `replayData` from scene init data
- Add a "Powtórka" button next to the existing buttons (only if replayData has frames)
- On click, overlay a replay view:
  - Create a semi-transparent black overlay
  - Create a ghost sprite that follows the recorded frames (interpolating between samples)
  - Camera scrolls to match the recorded positions
  - Show a "3s do śmierci..." countdown label
  - The obstacle that killed the player flashes red (use obstacleType to show the icon)
  - Heartbeat sound effect (reuse existing death SFX at low volume, looped)
  - After replay completes (all frames played + 0.5s pause): destroy overlay, return to score screen
  - No input during replay except ESC to skip

```typescript
private playReplay(data: ReplayData): void {
  const { width, height } = this.cameras.main;

  // Dark overlay
  const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8)
    .setScrollFactor(0).setDepth(1000);

  // Ghost cockroach
  const ghost = this.add.sprite(data.frames[0].x, data.frames[0].y, 'cockroach-idle')
    .setScale(0.30).setAlpha(0.7).setTint(0x8888ff).setDepth(1001);

  // Countdown label
  const label = this.add.text(width / 2, 30, '', popupStyle({ fontSize: '10px', color: '#ff4444' }))
    .setOrigin(0.5).setScrollFactor(0).setDepth(1002);

  let frameIndex = 0;
  const startTime = this.time.now;
  const replayDuration = data.frames[data.frames.length - 1].time - data.frames[0].time;
  const baseTime = data.frames[0].time;

  const replayUpdate = (): void => {
    const elapsed = this.time.now - startTime;
    const replayTime = baseTime + elapsed;

    // Advance frames
    while (frameIndex < data.frames.length - 1 && data.frames[frameIndex + 1].time <= replayTime) {
      frameIndex++;
    }

    const frame = data.frames[frameIndex];
    ghost.setPosition(frame.x, frame.y);
    ghost.setTexture(frame.texture);
    if (frame.isDashing) ghost.setTint(0xffffff);
    else if (frame.isPillActive) ghost.setTint(0xff00ff);
    else ghost.setTint(0x8888ff);

    // Countdown
    const remaining = Math.ceil((replayDuration - elapsed) / 1000);
    if (remaining > 0) label.setText(`${remaining}...`);
    else label.setText('');

    // Camera follows ghost
    this.cameras.main.scrollX = frame.x - 200;

    // End of replay
    if (elapsed >= replayDuration + 500) {
      this.events.off('update', replayUpdate);
      overlay.destroy();
      ghost.destroy();
      label.destroy();
      this.cameras.main.scrollX = 0;
    }
  };

  this.events.on('update', replayUpdate);
}
```

- [ ] **Step 4: Add replay button to MultiplayerGameOverScene too**

Same pattern — store replayData, add "Powtórka" button. After replay finishes, return to the multiplayer results screen.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit`

```bash
git add src/systems/DeathReplay.ts src/scenes/GameScene.ts src/scenes/GameOverScene.ts src/scenes/MultiplayerGameOverScene.ts
git commit -m "feat: death replay — watch your last 3 seconds before dying

Records player position/state at 20fps in a rolling 3-second buffer.
Powtórka button on game over screen plays back as a ghostly cockroach
with countdown timer. Works in both singleplayer and multiplayer.
Returns to score screen after replay."
```

---

## Integration Notes

- **No new dependencies** — all features use existing Phaser APIs
- **No new audio assets** — combo chimes reuse apple SFX with pitch shifting, weather uses no audio (just visual), replay uses existing death SFX
- **Multiplayer safe** — weather uses SeededRNG, combo feedback is cosmetic-only, replay is client-local, lazy loading doesn't affect sync
- **Order independence** — all 5 tasks can be implemented in any order, though the plan order reflects priority
