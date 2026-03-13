import Phaser from 'phaser';
import { GAME_WIDTH, DEPTH } from '../config/constants';

/**
 * Properties we need from GameScene without importing it directly.
 */
export interface GameSceneAccessor extends Phaser.Scene {
  floorTopY: number;
  floorBottomY: number;
  cockroach: Phaser.Physics.Arcade.Sprite;
  isDead: boolean;
}

export type Floor = 'top' | 'bottom';
export type RNGSource = import('../multiplayer/SeededRNG').SeededRNG | null;

/** Vertical offset from floor Y to center obstacles on the running lane. */
export const OBSTACLE_OFFSET = 25;

/** Default hitbox ratios used by most obstacles. */
const DEFAULT_HITBOX = { w: 0.6, h: 0.7 };

// ── RNG helpers ────────────────────────────────────────────────────────

function rngBetween(rng: RNGSource, min: number, max: number): number {
  return rng ? rng.between(min, max) : Phaser.Math.Between(min, max);
}
function rngRandom(rng: RNGSource): number {
  return rng ? rng.next() : Math.random();
}

// ── Context passed to every spawn function ─────────────────────────────

export interface SpawnContext {
  scene: GameSceneAccessor;
  obstacles: Phaser.Physics.Arcade.Group;
  rng: RNGSource;
  randomFloor: () => Floor;
  getFloorY: (floor: Floor) => number;
  getCenterY: (floor: Floor) => number;
  floorTopY: number;
  floorBottomY: number;
}

// ── Shared helpers (used by multiple obstacle types) ───────────────────

function playSoundOnVisible(
  ctx: SpawnContext,
  sprite: Phaser.Physics.Arcade.Sprite,
  key: string,
  volume: number,
): void {
  const check = ctx.scene.time.addEvent({
    delay: 100,
    loop: true,
    callback: () => {
      if (!sprite.active) { check.destroy(); return; }
      const cameraRight = ctx.scene.cameras.main.scrollX + GAME_WIDTH;
      if (sprite.x <= cameraRight) {
        ctx.scene.sound.play(key, { volume });
        check.destroy();
      }
    },
  });
}

function createSprite(
  ctx: SpawnContext,
  x: number,
  y: number,
  texture: string,
  type: string,
  floor: Floor | null,
  opts?: { scale?: number; hitbox?: { w: number; h: number } },
): Phaser.Physics.Arcade.Sprite {
  const scale = opts?.scale ?? 0.2;
  const hitbox = opts?.hitbox ?? DEFAULT_HITBOX;

  const sprite = ctx.obstacles.create(x, y, texture) as Phaser.Physics.Arcade.Sprite;
  sprite.setOrigin(0.5, 0.5);
  sprite.setScale(scale);
  sprite.setDepth(DEPTH.OBSTACLES);
  sprite.setImmovable(true);
  sprite.setData('floor', floor);
  sprite.setData('type', type);
  (sprite.body as Phaser.Physics.Arcade.Body).allowGravity = false;
  sprite.body!.setSize(sprite.width * hitbox.w, sprite.height * hitbox.h);

  return sprite;
}

function trackOnSprite(
  ctx: SpawnContext,
  sprite: Phaser.Physics.Arcade.Sprite,
  tweens: Phaser.Tweens.Tween[],
  timers: Phaser.Time.TimerEvent[],
  updateFns: (() => void)[],
): void {
  sprite.on('destroy', () => {
    tweens.forEach(t => t.destroy());
    timers.forEach(t => t.destroy());
    updateFns.forEach(fn => ctx.scene.events.off('update', fn));
  });
}

function createFloater(
  ctx: SpawnContext,
  x: number,
  texture: string,
  type: string,
  duration: number,
  soundKey: string,
  soundVolume: number,
  opts?: { hitbox?: { w: number; h: number } },
): [Phaser.Physics.Arcade.Sprite, Phaser.Tweens.Tween] {
  const topY = ctx.floorTopY - OBSTACLE_OFFSET;
  const bottomY = ctx.floorBottomY - OBSTACLE_OFFSET;
  const startTop = rngRandom(ctx.rng) > 0.5;

  const sprite = createSprite(ctx, x, startTop ? topY : bottomY, texture, type, null, opts);
  playSoundOnVisible(ctx, sprite, soundKey, soundVolume);

  const floatTween = ctx.scene.tweens.add({
    targets: sprite,
    y: startTop ? bottomY : topY,
    duration,
    ease: 'Sine.easeInOut',
    yoyo: true,
    repeat: -1,
  });

  return [sprite, floatTween];
}

// ── Obstacle type definition ───────────────────────────────────────────

export interface ObstacleTypeDef {
  name: string;
  minLevel: number;
  spawn: (ctx: SpawnContext, x: number) => void;
}

// ── Individual obstacle spawn functions ────────────────────────────────

function spawnOnion(ctx: SpawnContext, x: number): void {
  const floor = ctx.randomFloor();
  const centerY = ctx.getCenterY(floor);

  const onion = createSprite(ctx, x, centerY, 'onion', 'onion', floor);

  const tweens: Phaser.Tweens.Tween[] = [];

  // Gentle wobble
  tweens.push(ctx.scene.tweens.add({
    targets: onion,
    angle: { from: -3, to: 3 },
    duration: 1200,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  }));

  // Stink waves
  const stinkStartY = centerY - onion.displayHeight * 0.3;
  for (let i = 0; i < 3; i++) {
    const offsetX = rngBetween(ctx.rng, -8, 8);
    const stink = ctx.scene.add.circle(x + offsetX, stinkStartY, 4, 0x99cc33, 0.6);
    stink.setScale(0.5 + i * 0.15);
    stink.setDepth(DEPTH.OBSTACLES);

    tweens.push(ctx.scene.tweens.add({
      targets: stink,
      y: stinkStartY - 50 - i * 15,
      alpha: 0,
      duration: 1500 + i * 300,
      delay: i * 400,
      repeat: -1,
      ease: 'Sine.easeOut',
      onRepeat: () => {
        stink.y = stinkStartY;
        stink.alpha = 0.6;
      },
    }));
  }

  // Tears (cosmetic — use Math.random to avoid desyncing seeded RNG)
  const tearStartY = centerY - onion.displayHeight * 0.2;
  const tearEndY = centerY + onion.displayHeight * 0.4;
  const tearTimer = ctx.scene.time.addEvent({
    delay: 800,
    loop: true,
    callback: () => {
      if (!onion.active) return;
      const side = Phaser.Math.Between(0, 1) === 0 ? -1 : 1;
      const tear = ctx.scene.add.circle(
        x + side * Phaser.Math.Between(4, 10),
        tearStartY,
        Phaser.Math.Between(1, 3),
        0x4488ff,
        0.7,
      );
      tear.setDepth(DEPTH.OBSTACLES);
      ctx.scene.tweens.add({
        targets: tear,
        y: tearEndY,
        alpha: 0,
        scaleY: 1.8,
        duration: Phaser.Math.Between(600, 1000),
        ease: 'Quad.easeIn',
        onComplete: () => tear.destroy(),
      });
    },
  });

  trackOnSprite(ctx, onion, tweens, [tearTimer], []);
}

function spawnPestSpray(ctx: SpawnContext, x: number): void {
  const floor = ctx.randomFloor();
  const centerY = ctx.getCenterY(floor);

  const spray = createSprite(ctx, x, centerY, 'pest-spray', 'spray', floor);
  playSoundOnVisible(ctx, spray, 'spray-sfx', 0.3);

  // Vibration
  const vibrationTween = ctx.scene.tweens.add({
    targets: spray,
    x: spray.x + 1.5,
    duration: 50,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // Mist from nozzle (cosmetic — use Math.random to avoid desyncing seeded RNG)
  const nozzleY = centerY - spray.displayHeight * 0.45;
  const sprayMist = (): void => {
    if (!spray.active) return;
    for (let i = 0; i < 4; i++) {
      const radius = Phaser.Math.Between(2, 5);
      const droplet = ctx.scene.add.circle(
        spray.x + Phaser.Math.Between(-3, 3),
        nozzleY + Phaser.Math.Between(-2, 2),
        radius,
        0x88dd44,
        Math.random() * (0.35 - 0.15) + 0.15,
      );
      droplet.setDepth(DEPTH.OBSTACLES);
      const driftX = Phaser.Math.Between(-30, 30);
      const driftY = Phaser.Math.Between(-35, -15);
      ctx.scene.tweens.add({
        targets: droplet,
        x: droplet.x + driftX,
        y: droplet.y + driftY,
        alpha: 0,
        scale: Math.random() * (2.5 - 1.5) + 1.5,
        duration: Phaser.Math.Between(800, 1400),
        ease: 'Sine.easeOut',
        onComplete: () => droplet.destroy(),
      });
    }
  };
  const mistTimer = ctx.scene.time.addEvent({ delay: 300, callback: sprayMist, loop: true });

  trackOnSprite(ctx, spray, [vibrationTween], [mistTimer], []);
}

function spawnFlipper(ctx: SpawnContext, x: number): void {
  const floor = ctx.randomFloor();
  const centerY = ctx.getCenterY(floor);

  const flipper = createSprite(ctx, x, centerY, 'flipper', 'flipper', floor);
  playSoundOnVisible(ctx, flipper, 'flipper-sfx', 0.3);

  const rotationTween = ctx.scene.tweens.add({
    targets: flipper,
    angle: { from: -40, to: 40 },
    duration: 1000,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // Whoosh arc
  const whooshGfx = ctx.scene.add.graphics();
  whooshGfx.setDepth(9);
  const arcRadius = flipper.displayHeight * 0.8;
  const whooshUpdate = (): void => {
    if (!flipper.active) { whooshGfx.destroy(); return; }
    whooshGfx.clear();
    const currentAngle = flipper.angle;
    const arcSpan = 25;
    const startRad = Phaser.Math.DegToRad(currentAngle - 90 - arcSpan);
    const endRad = Phaser.Math.DegToRad(currentAngle - 90);
    whooshGfx.lineStyle(3, 0xffffff, 0.25);
    whooshGfx.beginPath();
    whooshGfx.arc(x, centerY, arcRadius, startRad, endRad, false);
    whooshGfx.strokePath();
    whooshGfx.lineStyle(1.5, 0xffffff, 0.12);
    whooshGfx.beginPath();
    whooshGfx.arc(x, centerY, arcRadius * 0.7, startRad, endRad, false);
    whooshGfx.strokePath();
  };
  ctx.scene.events.on('update', whooshUpdate);

  trackOnSprite(ctx, flipper, [rotationTween], [], [whooshUpdate]);
}

function spawnNewspaper(ctx: SpawnContext, x: number): void {
  const [newspaper, floatTween] = createFloater(ctx, x, 'newspaper', 'newspaper', 2000, 'newspaper-sfx', 0.4);
  newspaper.setAngle(-8);

  trackOnSprite(ctx, newspaper, [floatTween], [], []);
}

function spawnBird(ctx: SpawnContext, x: number): void {
  const topY = ctx.floorTopY - OBSTACLE_OFFSET;
  const bottomY = ctx.floorBottomY - OBSTACLE_OFFSET;

  const [bird, floatTween] = createFloater(ctx, x, 'bird', 'bird', 1200, 'bird-sfx', 0.4, {
    hitbox: { w: 0.6, h: 0.5 },
  });

  // Ground shadow
  const shadow = ctx.scene.add.ellipse(x, ctx.floorBottomY - 2, 30, 8, 0x000000, 0.25);
  shadow.setDepth(0);
  const shadowUpdate = (): void => {
    if (!bird.active) { shadow.destroy(); return; }
    const totalDrop = bottomY - topY;
    const progress = (bird.y - topY) / totalDrop;
    const shadowScale = 0.5 + progress * 1.0;
    shadow.setScale(shadowScale, shadowScale * 0.5);
    shadow.setAlpha(0.1 + progress * 0.3);
  };
  ctx.scene.events.on('update', shadowUpdate);

  trackOnSprite(ctx, bird, [floatTween], [], [shadowUpdate]);
}

function spawnCatPaw(ctx: SpawnContext, x: number): void {
  const floor = ctx.randomFloor();
  const centerY = ctx.getCenterY(floor);

  const paw = createSprite(ctx, x, centerY, 'cat-paw', 'cat', floor, {
    hitbox: { w: 0.5, h: 0.5 },
  });
  playSoundOnVisible(ctx, paw, 'cat-sfx', 0.5);

  // Patrol 200px
  paw.x = x - 100;
  const patrolTween = ctx.scene.tweens.add({
    targets: paw,
    x: x + 100,
    duration: 1500,
    ease: 'Sine.easeInOut',
    yoyo: true,
    repeat: -1,
  });

  const flipUpdate = (): void => {
    if (!paw.active) return;
    paw.setFlipX(paw.x > x);
  };
  ctx.scene.events.on('update', flipUpdate);

  trackOnSprite(ctx, paw, [patrolTween], [], [flipUpdate]);
}

function spawnDiscoBall(ctx: SpawnContext, x: number): void {
  const floor = ctx.randomFloor();
  const centerY = ctx.getCenterY(floor);

  const disco = createSprite(ctx, x, centerY, 'disco-ball', 'disco', floor, {
    hitbox: { w: 0.6, h: 0.6 },
  });
  playSoundOnVisible(ctx, disco, 'disco-sfx', 0.4);

  // Constant spin
  const spinTween = ctx.scene.tweens.add({
    targets: disco,
    angle: 360,
    duration: 2000,
    repeat: -1,
    ease: 'Linear',
  });

  // Pulsing scale
  const pulseTween = ctx.scene.tweens.add({
    targets: disco,
    scaleX: 0.23,
    scaleY: 0.23,
    duration: 500,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // Rainbow light ray particles (cosmetic — use Math.random to avoid desyncing seeded RNG)
  const rayColors = [0xff00ff, 0x00ffff, 0xffff00, 0x00ff66, 0xff6600, 0x8800ff];
  const raysTimer = ctx.scene.time.addEvent({
    delay: 150,
    loop: true,
    callback: () => {
      if (!disco.active) return;
      const angle = Math.random() * Math.PI * 2;
      const color = rayColors[Phaser.Math.Between(0, rayColors.length - 1)];
      const ray = ctx.scene.add.rectangle(
        disco.x, disco.y,
        Phaser.Math.Between(2, 4), Phaser.Math.Between(8, 20),
        color, 0.6,
      );
      ray.setDepth(9);
      ray.setRotation(angle);
      const dist = 40 + Math.random() * 30;
      ctx.scene.tweens.add({
        targets: ray,
        x: disco.x + Math.cos(angle) * dist,
        y: disco.y + Math.sin(angle) * dist,
        alpha: 0,
        duration: 400,
        ease: 'Sine.easeOut',
        onComplete: () => ray.destroy(),
      });
    },
  });

  // Strobe flash when cockroach is within ~250px
  const strobeOverlay = ctx.scene.add
    .rectangle(GAME_WIDTH / 2, ctx.scene.cameras.main.height / 2, GAME_WIDTH, ctx.scene.cameras.main.height, 0xffffff, 0)
    .setScrollFactor(0)
    .setDepth(DEPTH.DISCO_STROBE);

  let strobePhase = 0;
  const strobeUpdate = (): void => {
    if (!disco.active) { strobeOverlay.destroy(); return; }
    const cockroach = ctx.scene.cockroach;
    if (!cockroach) return;
    const dist = Phaser.Math.Distance.Between(cockroach.x, cockroach.y, disco.x, disco.y);
    if (dist < 250) {
      strobePhase += 0.25;
      const intensity = Math.max(0, (1 - dist / 250)) * 0.6;
      strobeOverlay.setAlpha(Math.abs(Math.sin(strobePhase)) * intensity);
    } else {
      strobeOverlay.setAlpha(0);
    }
  };
  ctx.scene.events.on('update', strobeUpdate);

  trackOnSprite(ctx, disco, [spinTween, pulseTween], [raysTimer], [strobeUpdate]);
}

function spawnJellyfish(ctx: SpawnContext, x: number): void {
  const [jelly, floatTween] = createFloater(ctx, x, 'jellyfish', 'jellyfish', 2500, 'jellyfish-sfx', 0.4, {
    hitbox: { w: 0.7, h: 0.85 },
  });

  // Pulsing transparency
  const pulseTween = ctx.scene.tweens.add({
    targets: jelly,
    alpha: { from: 0.6, to: 1.0 },
    duration: 800,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // Trailing tentacle particles (cosmetic — use Math.random to avoid desyncing seeded RNG)
  const particlesTimer = ctx.scene.time.addEvent({
    delay: 200,
    loop: true,
    callback: () => {
      if (!jelly.active) return;
      const particle = ctx.scene.add.circle(
        jelly.x + Phaser.Math.Between(-10, 10),
        jelly.y + jelly.displayHeight * 0.3,
        Phaser.Math.Between(1, 3),
        0x8844ff,
        0.5,
      );
      particle.setDepth(9);
      ctx.scene.tweens.add({
        targets: particle,
        y: particle.y + 20,
        alpha: 0,
        duration: 600,
        ease: 'Sine.easeOut',
        onComplete: () => particle.destroy(),
      });
    },
  });

  trackOnSprite(ctx, jelly, [floatTween, pulseTween], [particlesTimer], []);
}

function spawnPope(ctx: SpawnContext, x: number): void {
  const [pope, floatTween] = createFloater(ctx, x, 'pope', 'pope', 1800, 'pope-sfx', 0.4);

  // Slight rotation while swinging
  const angleTween = ctx.scene.tweens.add({
    targets: pope,
    angle: { from: -15, to: 15 },
    duration: 900,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // Smoke trail (cosmetic — use Math.random to avoid desyncing seeded RNG)
  const smokeTimer = ctx.scene.time.addEvent({
    delay: 150,
    loop: true,
    callback: () => {
      if (!pope.active) return;
      const smoke = ctx.scene.add.circle(
        pope.x + Phaser.Math.Between(-5, 5),
        pope.y + Phaser.Math.Between(-5, 5),
        Phaser.Math.Between(4, 8),
        0x888888,
        0.4,
      );
      smoke.setDepth(9);
      ctx.scene.tweens.add({
        targets: smoke,
        alpha: 0,
        scale: 2,
        duration: 2000,
        ease: 'Sine.easeOut',
        onComplete: () => smoke.destroy(),
      });
    },
  });

  trackOnSprite(ctx, pope, [floatTween, angleTween], [smokeTimer], []);
}

function spawnBison(ctx: SpawnContext, x: number): void {
  const floor = ctx.randomFloor();
  const centerY = ctx.getCenterY(floor);

  const bison = createSprite(ctx, x, centerY, 'bison', 'bison', floor, {
    hitbox: { w: 0.7, h: 0.6 },
  });
  playSoundOnVisible(ctx, bison, 'bison-sfx', 0.5);

  // Fast charge patrol — 400px range
  bison.x = x - 200;
  const chargeTween = ctx.scene.tweens.add({
    targets: bison,
    x: x + 200,
    duration: 1000,
    ease: 'Sine.easeInOut',
    yoyo: true,
    repeat: -1,
  });

  // Flip based on direction
  const flipUpdate = (): void => {
    if (!bison.active) return;
    bison.setFlipX(bison.x > x);
  };
  ctx.scene.events.on('update', flipUpdate);

  // Dust clouds (cosmetic — use Math.random to avoid desyncing seeded RNG)
  const dustTimer = ctx.scene.time.addEvent({
    delay: 100,
    loop: true,
    callback: () => {
      if (!bison.active) return;
      const dust = ctx.scene.add.circle(
        bison.x + (bison.flipX ? 15 : -15),
        centerY + 10,
        Phaser.Math.Between(2, 4),
        0x997744,
        0.4,
      );
      dust.setDepth(9);
      ctx.scene.tweens.add({
        targets: dust,
        alpha: 0,
        scale: 2,
        y: dust.y - 10,
        duration: 400,
        ease: 'Sine.easeOut',
        onComplete: () => dust.destroy(),
      });
    },
  });

  trackOnSprite(ctx, bison, [chargeTween], [dustTimer], [flipUpdate]);
}

function spawnBlackHole(ctx: SpawnContext, x: number): void {
  const centerY = (ctx.floorTopY + ctx.floorBottomY) / 2 - OBSTACLE_OFFSET;

  const hole = createSprite(ctx, x, centerY, 'black-hole', 'blackhole', null, {
    scale: 0.25,
    hitbox: { w: 0.5, h: 0.5 },
  });
  playSoundOnVisible(ctx, hole, 'blackhole-sfx', 0.5);

  // Constant slow rotation
  const spinTween = ctx.scene.tweens.add({
    targets: hole,
    angle: 360,
    duration: 3000,
    repeat: -1,
    ease: 'Linear',
  });

  // Pulsing scale
  const pulseTween = ctx.scene.tweens.add({
    targets: hole,
    scaleX: 0.3,
    scaleY: 0.3,
    duration: 1500,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // Gravitational pull on cockroach
  const PULL_RADIUS = 250;
  const PULL_STRENGTH = 80;
  const gravityUpdate = (): void => {
    if (!hole.active) return;
    const cockroach = ctx.scene.cockroach;
    if (!cockroach || ctx.scene.isDead) return;
    const dist = Phaser.Math.Distance.Between(cockroach.x, cockroach.y, hole.x, hole.y);
    if (dist < PULL_RADIUS && dist > 0) {
      const force = PULL_STRENGTH * (1 - dist / PULL_RADIUS);
      const angle = Phaser.Math.Angle.Between(cockroach.x, cockroach.y, hole.x, hole.y);
      const body = cockroach.body as Phaser.Physics.Arcade.Body;
      body.velocity.x += Math.cos(angle) * force;
      body.velocity.y += Math.sin(angle) * force;
    }
  };
  ctx.scene.events.on('update', gravityUpdate);

  // Particle swirl (cosmetic — use Math.random to avoid desyncing seeded RNG)
  const particlesTimer = ctx.scene.time.addEvent({
    delay: 80,
    loop: true,
    callback: () => {
      if (!hole.active) return;
      const angle = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 40;
      const px = hole.x + Math.cos(angle) * dist;
      const py = hole.y + Math.sin(angle) * dist;
      const particle = ctx.scene.add.circle(px, py, Phaser.Math.Between(1, 3), 0x6600cc, 0.7);
      particle.setDepth(9);
      ctx.scene.tweens.add({
        targets: particle,
        x: hole.x,
        y: hole.y,
        alpha: 0,
        scale: 0.1,
        duration: 500,
        ease: 'Cubic.easeIn',
        onComplete: () => particle.destroy(),
      });
    },
  });

  trackOnSprite(ctx, hole, [spinTween, pulseTween], [particlesTimer], [gravityUpdate]);
}

// ── The registry ───────────────────────────────────────────────────────

export const obstacleRegistry: ObstacleTypeDef[] = [
  { name: 'onion',      minLevel: 1,  spawn: spawnOnion },
  { name: 'pestSpray',  minLevel: 2,  spawn: spawnPestSpray },
  { name: 'flipper',    minLevel: 2,  spawn: spawnFlipper },
  { name: 'newspaper',  minLevel: 3,  spawn: spawnNewspaper },
  { name: 'bird',       minLevel: 4,  spawn: spawnBird },
  { name: 'catPaw',     minLevel: 5,  spawn: spawnCatPaw },
  { name: 'discoBall',  minLevel: 6,  spawn: spawnDiscoBall },
  { name: 'jellyfish',  minLevel: 7,  spawn: spawnJellyfish },
  { name: 'pope',       minLevel: 8,  spawn: spawnPope },
  { name: 'bison',      minLevel: 9,  spawn: spawnBison },
  { name: 'blackHole',  minLevel: 10, spawn: spawnBlackHole },
];
