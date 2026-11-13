/**
 * Plays the baked pixel-art effects (public/assets/vfx.*, drawn by tools/art/vfx.py) as pooled images.
 *
 * Every effect is a short run of frames on the game's texel grid; this adds what only the runtime can: where it is, how
 * it moves (a velocity, gravity, drag, or riding on something), how long it stays, and whether it is light (additive).
 * Frames are stepped here rather than by Phaser's animations, so an effect can choose its clock: by default it lives in
 * the world and stops with it (the pause, a boss's freeze, the moult's hit-stop) and slows with the death slow-motion;
 * `ui` effects run on real time and keep moving over a frozen world, like the versus splash and the reward beat.
 * Never rotated, never scaled by anything but whole numbers, never tinted: colour variants are their own frames.
 * Cosmetic only, so Math.random throughout, never the seeded RNG.
 */
import Phaser from 'phaser';
import { PIXEL_BLOCK } from '../config/constants';
import { SPRITE_SCALE } from '../config/sprites';

export const VFX_ATLAS = 'vfx';

interface AnimInfo { frames: number; fps: number; loop: boolean; light: boolean }

/** A position to ride on: a sprite, or anything with x and y. Gone when it reports active false. */
type Target = { x: number; y: number; active?: boolean };

export interface FxOpts {
  /** Whole multiples of the art's own size (1 is one texel to a world block). */
  scale?: number;
  flipX?: boolean;
  flipY?: boolean;
  depth?: number;
  /** 0 pins it to the screen. */
  scrollFactor?: number;
  /** Rides on this, offset by the x and y given to play. */
  follow?: Target;
  /** Shows only this frame, held for `life` (an afterimage, a flash). */
  frame?: number;
  /** Overrides the effect's own looping. */
  loop?: boolean;
  /** Overrides the effect's own frame rate, to fit it to a duration. */
  fps?: number;
  /** How long it lives, in ms. Looping effects need it; a one-shot ends with its last frame when left out. */
  life?: number;
  /** The last part of its life, in ms, during which it steps down to nothing in three steps. */
  fadeOut?: number;
  alpha?: number;
  /** Overrides whether it is drawn additively. */
  light?: boolean;
  /** Real time: animates through world freezes and pauses. For UI layers. */
  ui?: boolean;
  delay?: number;
  /** Velocity and gravity in px/s and px/s². */
  vx?: number;
  vy?: number;
  gravity?: number;
  /** Share of the velocity lost per second. */
  drag?: number;
  onComplete?: () => void;
}

export interface BurstOpts extends FxOpts {
  /** Speed range in px/s. */
  speed?: [number, number];
  /** Direction range in degrees, 0 to the right, 90 down. */
  angle?: [number, number];
}

export interface FxHandle {
  readonly image: Phaser.GameObjects.Image;
  stop(): void;
  readonly alive: boolean;
}

export interface TrailHandle { stop(): void }

interface Live {
  image: Phaser.GameObjects.Image;
  name: string;
  info: AnimInfo;
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  follow?: Target;
  frame?: number;
  loop: boolean;
  life: number;
  fadeOut: number;
  alpha: number;
  ui: boolean;
  delay: number;
  onComplete?: () => void;
  done: boolean;
}

interface Trail {
  target: Target;
  pick: () => { name: string; frame?: number } | null;
  every: number;
  t: number;
  opts: FxOpts;
  stopped: boolean;
}

/** Past this many at once new ones are dropped: a frame-time guard, never reached in play. */
const MAX_LIVE = 220;
/** A frame that took longer than this (a hitch, a hidden tab) counts as this much. */
const MAX_STEP_MS = 50;

const instances = new WeakMap<Phaser.Scene, Fx>();

/** The scene's effect player, made on first use and gone with the scene. */
export function getFx(scene: Phaser.Scene): Fx {
  let fx = instances.get(scene);
  if (!fx) {
    fx = new Fx(scene);
    instances.set(scene, fx);
  }
  return fx;
}

/** The name of an effect's frame in the atlas. */
export const vfxFrame = (name: string, index = 0): string => `${name}_${index}`;

export class Fx {
  /** The player asked the system for less motion: bursts are halved and trails thinned. */
  readonly reduced: boolean;
  private scene: Phaser.Scene;
  private live: Live[] = [];
  private pool: Phaser.GameObjects.Image[] = [];
  private trails: Trail[] = [];
  private anims: Record<string, AnimInfo>;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const texture = scene.textures.exists(VFX_ATLAS) ? scene.textures.get(VFX_ATLAS) : null;
    this.anims = ((texture?.customData as { anims?: Record<string, AnimInfo> } | undefined)?.anims) ?? {};
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.update, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  has(name: string): boolean {
    return name in this.anims;
  }

  /** Plays an effect at x, y (or offset by x, y from what it follows). Null when the effect or the atlas is missing. */
  play(name: string, x: number, y: number, opts: FxOpts = {}): FxHandle | null {
    let info = this.anims[name];
    if (!info || this.live.length >= MAX_LIVE) return null;
    const image = this.take(name, opts.frame ?? 0);
    if (opts.fps) info = { ...info, fps: opts.fps };
    const scale = SPRITE_SCALE * Math.max(1, Math.round(opts.scale ?? 1));
    image.setScale(scale)
      .setFlip(!!opts.flipX, !!opts.flipY)
      .setDepth(opts.depth ?? 0)
      .setScrollFactor(opts.scrollFactor ?? 1)
      .setBlendMode((opts.light ?? info.light) ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
      .setAlpha(opts.alpha ?? 1);
    const entry: Live = {
      image, name, info, t: 0, x, y,
      vx: opts.vx ?? 0, vy: opts.vy ?? 0, gravity: opts.gravity ?? 0, drag: opts.drag ?? 0,
      follow: opts.follow, frame: opts.frame,
      loop: opts.loop ?? info.loop,
      life: opts.life ?? (opts.frame !== undefined || (opts.loop ?? info.loop) ? Infinity : (info.frames * 1000) / info.fps),
      fadeOut: opts.fadeOut ?? 0,
      alpha: opts.alpha ?? 1,
      ui: !!opts.ui,
      delay: opts.delay ?? 0,
      onComplete: opts.onComplete,
      done: false,
    };
    this.live.push(entry);
    this.place(entry);
    image.setVisible(entry.delay <= 0);
    return {
      image,
      stop: () => this.finish(entry, false),
      get alive() { return !entry.done; },
    };
  }

  /** count copies scattered within spread px of x, y, each thrown at a random speed and direction. */
  burst(name: string, x: number, y: number, count: number, spread: number, opts: BurstOpts = {}): void {
    const n = this.reduced ? Math.ceil(count / 2) : count;
    const [s0, s1] = opts.speed ?? [0, 0];
    const [a0, a1] = opts.angle ?? [0, 360];
    for (let i = 0; i < n; i++) {
      const angle = Phaser.Math.DegToRad(a0 + Math.random() * (a1 - a0));
      const speed = s0 + Math.random() * (s1 - s0);
      const r = Math.sqrt(Math.random()) * spread;
      const at = Math.random() * Math.PI * 2;
      this.play(name, x + Math.cos(at) * r, y + Math.sin(at) * r, {
        ...opts,
        vx: (opts.vx ?? 0) + Math.cos(angle) * speed,
        vy: (opts.vy ?? 0) + Math.sin(angle) * speed,
        flipX: opts.flipX ?? Math.random() < .5,
      });
    }
  }

  /**
   * Drops an effect where target is every everyMs, until stopped. pick may choose the effect and frame each time (an
   * afterimage of whatever frame the roach shows), or return null to skip one.
   */
  trail(target: Target, pick: string | (() => { name: string; frame?: number } | null), everyMs: number, opts: FxOpts = {}): TrailHandle {
    const trail: Trail = {
      target,
      pick: typeof pick === 'string' ? () => ({ name: pick }) : pick,
      every: everyMs * (this.reduced ? 2 : 1),
      t: everyMs,
      opts,
      stopped: false,
    };
    this.trails.push(trail);
    return { stop: () => { trail.stopped = true; } };
  }

  /** The world moved back by `dx` (the tutorial's hand-off): what stands in it moves with it; riders and UI stay. */
  rebase(dx: number): void {
    for (const entry of this.live) {
      if (entry.follow || entry.image.scrollFactorX !== 1) continue;
      entry.x -= dx;
      this.place(entry);
    }
  }

  /** Ends everything at once, as when the run ends. */
  clear(): void {
    for (const entry of this.live.slice()) this.finish(entry, false);
    this.trails = [];
  }

  private take(name: string, frame: number): Phaser.GameObjects.Image {
    const key = vfxFrame(name, frame);
    const image = this.pool.pop();
    // A pooled image may come back from a tinted use (a match's ghosts, in the player's colour)
    if (image) return image.setFrame(key).setActive(true).clearTint();
    return this.scene.add.image(0, 0, VFX_ATLAS, key);
  }

  /** The world stands still for a pause, a boss's freeze and the moult's hit-stop. */
  private worldFrozen(): boolean {
    return this.scene.anims.paused || !!this.scene.physics?.world?.isPaused;
  }

  private update(_time: number, delta: number): void {
    const real = Math.min(delta, MAX_STEP_MS);
    const world = this.worldFrozen() ? 0 : real * this.scene.time.timeScale;

    for (const trail of this.trails) {
      if (trail.stopped || trail.target.active === false) { trail.stopped = true; continue; }
      trail.t += trail.opts.ui ? real : world;
      if (trail.t < trail.every) continue;
      trail.t = 0;
      const chosen = trail.pick();
      if (chosen) this.play(chosen.name, trail.target.x, trail.target.y, { ...trail.opts, frame: chosen.frame ?? trail.opts.frame });
    }
    this.trails = this.trails.filter(trail => !trail.stopped);

    for (const entry of this.live.slice()) {
      const dt = entry.ui ? real : world;
      if (dt === 0) continue;
      if (entry.delay > 0) {
        entry.delay -= dt;
        if (entry.delay > 0) continue;
        entry.image.setVisible(true);
      }
      if (entry.follow && entry.follow.active === false) { this.finish(entry, true); continue; }
      entry.t += dt;
      const s = dt / 1000;
      entry.vy += entry.gravity * s;
      if (entry.drag) {
        const keep = Math.max(0, 1 - entry.drag * s);
        entry.vx *= keep;
        entry.vy *= keep;
      }
      entry.x += entry.vx * s;
      entry.y += entry.vy * s;

      if (entry.t >= entry.life) { this.finish(entry, true); continue; }
      if (entry.frame === undefined) {
        const step = Math.floor((entry.t * entry.info.fps) / 1000);
        if (!entry.loop && step >= entry.info.frames) { this.finish(entry, true); continue; }
        const index = entry.loop ? step % entry.info.frames : step;
        const key = vfxFrame(entry.name, index);
        if (entry.image.frame.name !== key) entry.image.setFrame(key);
      }
      if (entry.fadeOut > 0) {
        const left = entry.life - entry.t;
        if (left < entry.fadeOut) entry.image.setAlpha(entry.alpha * Math.ceil((left / entry.fadeOut) * 3) / 3);
      }
      this.place(entry);
    }
  }

  /** On the grid: the image's left and top edges land on whole world blocks, whatever its pivot. */
  private place(entry: Live): void {
    const { image } = entry;
    const x = entry.follow ? entry.follow.x + entry.x : entry.x;
    const y = entry.follow ? entry.follow.y + entry.y : entry.y;
    const ox = image.displayOriginX * image.scaleX;
    const oy = image.displayOriginY * image.scaleY;
    image.setPosition(Math.round((x - ox) / PIXEL_BLOCK) * PIXEL_BLOCK + ox, Math.round((y - oy) / PIXEL_BLOCK) * PIXEL_BLOCK + oy);
  }

  private finish(entry: Live, completed: boolean): void {
    if (entry.done) return;
    entry.done = true;
    const i = this.live.indexOf(entry);
    if (i >= 0) this.live.splice(i, 1);
    if (entry.image.scene) {
      entry.image.setVisible(false).setActive(false);
      this.pool.push(entry.image);
    }
    if (completed) entry.onComplete?.();
  }

  private destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.update, this);
    this.live = [];
    this.pool = [];
    this.trails = [];
    instances.delete(this.scene);
  }
}

const GHOST_FRAME = /^roach-(?:[a-z]+-)?(run|dash|hop)_(\d+)$/;

/**
 * The baked one-colour silhouette matching the roach's frame (any skin: they share the rig), for afterimages and
 * flashes. Null for frames that have none (the boss fight's armed ones).
 */
export function roachGhost(frameName: string, colour: 'teal' | 'pink' | 'cyan' | 'white' | 'tint'): { name: string; frame: number } | null {
  const match = GHOST_FRAME.exec(frameName);
  return match ? { name: `ghost-${colour}-${match[1]}`, frame: Number(match[2]) } : null;
}
