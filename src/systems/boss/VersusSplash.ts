/**
 * The versus splash that opens every boss fight: the screen is cut on a diagonal slash, the roach's portrait slams in
 * from the left and the boss's from the right, then VS, then the boss's name, alone for a beat, and its epithet typed
 * under it. Solo, it then holds on the finished picture, alive, until the player presses a key or taps; in a match it
 * cannot wait (the server's fight is already running under it) and goes after a short hold. It then wipes away.
 * The entrance is the same full length every time and nothing during it dismisses it. Everything comes from the boss's registry entry (name, epithet, accent) and its portrait texture, so a new boss
 * needs nothing here.
 *
 * It is drawn on a canvas one texel per art pixel (PIXEL_BLOCK world px, as the portraits are) and shown at that
 * scale, so stripes, streaks and the slash stay on the game's grid. Text is the game's pixel font at whole multiples
 * of its grid. The timeline is its own clock, driven by the scene's update event, so it runs the same whether the
 * world under it is frozen (solo) or already running the fight's intro (a match).
 */
import Phaser from 'phaser';
import { AudioManager, VOL } from '../../audio/AudioManager';
import { bossVoiceFor } from '../../audio/gibberish';
import { DEPTH, PIXEL_BLOCK } from '../../config/constants';
import { FONT_GRID, bodyStyle, titleStyle } from '../../utils/TextStyles';
import { BossDef } from './bosses';
import { HERO_PORTRAIT, portraitKey } from './portraits';
import { BOSS_SHOUTS } from './tauntLines';

/** The roach's side: warm. */
const HERO_ACCENT = 0xe8892b;

/** A press this soon after the hold begins still counts as part of the mash that was ignored during the entrance. */
export const PRESS_GUARD_MS = 150;

/**
 * The "press to go on" line under a held screen (this splash, and the reward beat after a boss): its look and words,
 * and how it fades in and blinks gently once the hold has begun (`sinceMs` into it).
 */
export const PRESS_PROMPT_STYLE = { color: '#f1e3c6', strokeThickness: 5 } as const;
export const PRESS_PROMPT_SIZE = 3 * FONT_GRID;
export const pressPromptText = (touch: boolean, touchLine: string): string => (touch ? touchLine : 'Naciśnij dowolny klawisz');
export const pressPromptAlpha = (sinceMs: number): number =>
  Math.min(1, Math.max(0, sinceMs / 250)) * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(sinceMs * 0.004)));
/** In a match, how long the finished picture stays before it goes by itself. */
const MATCH_HOLD_MS = 800;
const WIPE_MS = 220;
/** The epithet types out at a readable pace. */
const EPITHET_CHAR_MS = 40;
/** A frame that took longer than this (a hitch, a hidden tab) counts as this much. */
const MAX_FRAME_MS = 50;

interface Profile {
  /** The world stands still and nothing is drawn yet. */
  hitStop: number;
  slashAt: number;
  slashMs: number;
  panelsAt: number;
  panelsMs: number;
  heroAt: number;
  bossAt: number;
  slamMs: number;
  vsAt: number;
  nameAt: number;
  epithetAt: number;
  epithetMs: number;
  /** Everything has landed: from here it holds. */
  holdAt: number;
}

/**
 * The beats of the entrance, each slam snappy and the pauses between them what make it readable: panels, the roach,
 * the boss, VS, the name alone for most of a second, then the epithet. About 3.4 s for a typical epithet.
 */
const BEATS = {
  hitStop: 80, slashAt: 80, slashMs: 80, panelsAt: 170, panelsMs: 220,
  heroAt: 480, bossAt: 880, slamMs: 200, vsAt: 1380, nameAt: 1950,
  epithetAt: 2650,
};

function profileFor(boss: BossDef): Profile {
  const epithetMs = boss.epithet.length * EPITHET_CHAR_MS;
  return { ...BEATS, epithetMs, holdAt: BEATS.epithetAt + epithetMs + 100 };
}

// The slash leans like "/": its top is this many texels right of its foot for each row of height
const SLOPE = 0.16;
const GAP = 2;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const OUTLINE_PAD = 5;
/** How far the name plate covers the portraits' feet, in texels. */
const PLATE_OVERLAP = 22;

type Rgb = [number, number, number];

const rgb = (c: number): Rgb => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const BLACK: Rgb = [10, 5, 8];
const WHITE: Rgb = [255, 250, 235];
const css = (c: Rgb): string => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
const pack = (c: Rgb, alpha = 255): number =>
  ((alpha << 24) | (Math.round(c[2]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[0])) >>> 0;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const easeOutExpo = (p: number): number => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));
const easeOutBack = (p: number, s = 1.2): number => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2);
const easeInCubic = (p: number): number => p * p * p;

interface Fighter {
  layer: HTMLCanvasElement;
  /** The portrait itself, inside the layer's outline margin. */
  w: number;
  h: number;
}

interface Debris { angle: number; speed: number; size: number; lift: number }

interface Streak { y: number; start: number; len: number; speed: number; thick: number }

/** The boss's bark, as its name lands: its name shouted in its own gibberish voice (see audio/gibberish.ts). */
export function playBossBark(scene: Phaser.Scene, _audio: AudioManager, boss: BossDef): void {
  bossVoiceFor(scene).speak(boss.id, BOSS_SHOUTS[boss.id]);
}

function playIfLoaded(scene: Phaser.Scene, audio: AudioManager, key: string, volume: number): void {
  if (scene.cache.audio.exists(key)) audio.playSfx(key, volume);
}

export interface VersusSplashDeps {
  scene: Phaser.Scene;
  audio: AudioManager;
  boss: BossDef;
  /** Solo: hold on the finished splash until a key or tap. A match cannot wait, and dismisses it after a short hold. */
  waitForPress: boolean;
  /** The wipe is starting: from here the fight (or the run) is on screen again under it. */
  onWipe: () => void;
  /** The splash is over and gone. */
  onEnd: () => void;
}

export class VersusSplash {
  private scene: Phaser.Scene;
  private audio: AudioManager;
  private boss: BossDef;
  private deps: VersusSplashDeps;

  private profile: Profile;
  private t = 0;
  /** When the wipe starts: not until the player presses, solo. */
  private wipeAt: number;
  private wipeMs = WIPE_MS;
  private wiping = false;
  private ended = false;
  private played = new Set<string>();

  // Layer
  private cw = 0;
  private ch = 0;
  private texKey = '';
  private tex!: Phaser.Textures.CanvasTexture;
  private ctx!: CanvasRenderingContext2D;
  private frame!: ImageData;
  private pixels!: Uint32Array;
  private burst!: HTMLCanvasElement;
  private image!: Phaser.GameObjects.Image;
  private flash!: Phaser.GameObjects.Rectangle;

  // Art
  private hero!: Fighter;
  private foe!: Fighter;
  private heroColors!: { a: Rgb; b: Rgb; glow: Rgb; streak: Rgb; band: Rgb; rim: Rgb };
  private foeColors!: { a: Rgb; b: Rgb; glow: Rgb; streak: Rgb; band: Rgb; rim: Rgb };
  private debris: Debris[] = [];
  private heroStreaks: Streak[] = [];
  private foeStreaks: Streak[] = [];
  private heroEnd: Int32Array = new Int32Array(0);
  private foeStart: Int32Array = new Int32Array(0);

  // Text
  private vs!: Phaser.GameObjects.Text;
  private vsShadow!: Phaser.GameObjects.Text;
  private nameLines: Phaser.GameObjects.Text[] = [];
  private nameShadows: Phaser.GameObjects.Text[] = [];
  private epithet!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;
  private epithetWidth = 0;
  private nameCells = 8;
  private lines: string[] = [];
  private layout = { bandTop: 0, bandH: 0, portraitTop: 0, vsY: 0, promptY: 0 };

  private pendingSounds: { key: string; volume: number; at: number }[] = [];
  private shakes: { at: number; ms: number; amp: number }[] = [];
  private flashes: { at: number; ms: number; strength: number }[] = [];

  // Esc stays the pause key, and a held key repeating is not a new press
  private onKey = (event: KeyboardEvent): void => {
    if (event.keyCode !== Phaser.Input.Keyboard.KeyCodes.ESC && !event.repeat) this.press();
  };
  private onPointer = (): void => this.press();
  private onResize = (): void => this.build();

  constructor(deps: VersusSplashDeps) {
    this.deps = deps;
    this.scene = deps.scene;
    this.audio = deps.audio;
    this.boss = deps.boss;
    this.profile = profileFor(deps.boss);
    this.wipeAt = deps.waitForPress ? Infinity : this.profile.holdAt + MATCH_HOLD_MS;

    this.setUpColors();
    this.setUpTimeline();
    this.build();

    const { scene } = this;
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    if (deps.waitForPress) {
      scene.input.keyboard?.on('keydown', this.onKey);
      scene.input.on('pointerdown', this.onPointer);
    }
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.onResize);
    this.sound('dash', 0.5, this.profile.slashAt);
  }

  /** True until the wipe starts: the splash owns the screen, and the run's input has no business reaching the game. */
  get blocking(): boolean { return !this.wiping && !this.ended; }

  destroy(): void {
    if (this.ended) return;
    this.ended = true;
    const { scene } = this;
    scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
    scene.input.keyboard?.off('keydown', this.onKey);
    scene.input.off('pointerdown', this.onPointer);
    scene.scale.off(Phaser.Scale.Events.RESIZE, this.onResize);
    this.image?.destroy();
    this.flash?.destroy();
    for (const text of [this.vs, this.vsShadow, this.epithet, this.prompt, ...this.nameLines, ...this.nameShadows]) text?.destroy();
    this.nameLines = [];
    this.nameShadows = [];
    if (this.texKey && scene.textures.exists(this.texKey)) scene.textures.remove(this.texKey);
  }

  /** The first press once the hold has begun (and its guard has passed) starts the wipe, and so the fight. */
  private press(): void {
    if (this.ended || this.t < this.profile.holdAt + PRESS_GUARD_MS || this.wipeAt !== Infinity) return;
    this.wipeAt = this.t;
  }

  // ── Set up ────────────────────────────────────────────────────────

  private setUpColors(): void {
    const dress = (accent: number, bright: boolean) => {
      const c = rgb(accent);
      return bright
        ? { a: mix(c, BLACK, 0.12), b: mix(c, WHITE, 0.1), glow: mix(c, WHITE, 0.5), streak: mix(c, WHITE, 0.72), band: mix(c, BLACK, 0.8), rim: mix(c, WHITE, 0.45) }
        : { a: mix(c, BLACK, 0.55), b: mix(c, BLACK, 0.4), glow: mix(c, WHITE, 0.42), streak: mix(c, WHITE, 0.7), band: mix(c, BLACK, 0.82), rim: mix(c, WHITE, 0.4) };
    };
    this.heroColors = dress(HERO_ACCENT, true);
    this.foeColors = dress(this.boss.accent, false);
  }

  private setUpTimeline(): void {
    const p = this.profile;
    this.shakes = [
      { at: p.heroAt + p.slamMs * 0.85, ms: 160, amp: 3 },
      { at: p.bossAt + p.slamMs * 0.85, ms: 180, amp: 4 },
      { at: p.vsAt + 90, ms: 260, amp: 7 },
      { at: p.nameAt + 100, ms: 300, amp: 9 },
    ];
    this.flashes = [
      { at: 0, ms: 70, strength: 0.55 },
      { at: p.heroAt + p.slamMs * 0.85, ms: 90, strength: 0.55 },
      { at: p.bossAt + p.slamMs * 0.85, ms: 100, strength: 0.65 },
      { at: p.vsAt + 90, ms: 140, strength: 0.9 },
      { at: p.nameAt + 100, ms: 170, strength: 1 },
    ];
    this.sound('vs-whoosh', VOL.boss, p.heroAt);
    this.sound('vs-slam-1', VOL.big, p.heroAt + p.slamMs * 0.85);
    this.sound('vs-slam-2', VOL.big, p.bossAt + p.slamMs * 0.85);
    this.sound('vs-burst', VOL.big, p.vsAt + 90);
    this.sound('vs-name', VOL.big, p.nameAt + 100);
  }

  /** Plays a sound once the timeline reaches `at`. */
  private sound(key: string, volume: number, at: number): void {
    this.pendingSounds.push({ key, volume, at });
  }
  /** (Re)builds everything that depends on the screen's size. */
  private build(): void {
    const { scene } = this;
    const width = scene.scale.width;
    const height = scene.scale.height;
    this.cw = Math.ceil(width / PIXEL_BLOCK);
    this.ch = Math.ceil(height / PIXEL_BLOCK);

    this.image?.destroy();
    this.flash?.destroy();
    if (this.texKey && scene.textures.exists(this.texKey)) scene.textures.remove(this.texKey);
    this.texKey = `versus-layer-${this.boss.id}`;
    if (scene.textures.exists(this.texKey)) scene.textures.remove(this.texKey);
    this.tex = scene.textures.createCanvas(this.texKey, this.cw, this.ch)!;
    this.ctx = this.tex.getContext();
    this.ctx.imageSmoothingEnabled = false;
    this.frame = this.ctx.createImageData(this.cw, this.ch);
    this.pixels = new Uint32Array(this.frame.data.buffer);
    this.heroEnd = new Int32Array(this.ch);
    this.foeStart = new Int32Array(this.ch);
    if (!this.burst) {
      this.burst = document.createElement('canvas');
      this.burst.width = 160;
      this.burst.height = 160;
    }

    this.image = scene.add.image(0, 0, this.texKey).setOrigin(0).setScale(PIXEL_BLOCK).setScrollFactor(0).setDepth(DEPTH.VERSUS);
    this.flash = scene.add.rectangle(width / 2, height / 2, width, height, 0xffffff, 0)
      .setScrollFactor(0).setDepth(DEPTH.VERSUS_FLASH);

    this.hero = this.bakeFighter(HERO_PORTRAIT, this.heroColors, HERO_ACCENT);
    this.foe = this.bakeFighter(this.boss.id, this.foeColors, this.boss.accent);
    this.debris = Array.from({ length: 26 }, () => ({
      angle: (Math.random() - 0.5) * 2.2,
      speed: 60 + Math.random() * 150,
      size: Math.random() < 0.4 ? 4 : 3,
      lift: 40 + Math.random() * 90,
    }));
    this.heroStreaks = this.makeStreaks();
    this.foeStreaks = this.makeStreaks();
    this.buildText();
    if (this.t > 0) this.render(this.t);
  }

  private makeStreaks(): Streak[] {
    const streaks: Streak[] = [];
    for (let i = 0; i < 44; i++) {
      streaks.push({
        y: 4 + Math.floor(Math.random() * (this.ch - 8)),
        start: Math.random() * (this.cw + 160),
        len: 16 + Math.floor(Math.random() * 64),
        speed: 260 + Math.random() * 520,
        thick: Math.random() < 0.35 ? 2 : 1,
      });
    }
    return streaks;
  }

  /**
   * A fighter's layer: the portrait, a one-texel dark outline and a one-texel rim in the side's colour, and a hard
   * drop shadow. A portrait that did not load is a plain bust silhouette in the side's colour.
   */
  private bakeFighter(id: string, colors: { a: Rgb; rim: Rgb }, accent: number): Fighter {
    const key = portraitKey(id);
    let source: HTMLCanvasElement;
    const loaded = this.scene.textures.exists(key) ? this.scene.textures.get(key).getSourceImage() : null;
    if (loaded && loaded.width > 0) {
      source = document.createElement('canvas');
      source.width = loaded.width;
      source.height = loaded.height;
      source.getContext('2d')!.drawImage(loaded as CanvasImageSource, 0, 0);
    } else {
      source = this.silhouette(mix(rgb(accent), BLACK, 0.5));
    }
    const w = source.width;
    const h = source.height;

    const tinted = (color: Rgb): HTMLCanvasElement => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d')!;
      g.drawImage(source, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = css(color);
      g.fillRect(0, 0, w, h);
      return c;
    };
    const stamp = (g: CanvasRenderingContext2D, image: HTMLCanvasElement, radius: number, dx = 0, dy = 0): void => {
      const r = Math.ceil(radius);
      for (let y = -r; y <= r; y++) {
        for (let x = -r; x <= r; x++) {
          if (x * x + y * y <= radius * radius) g.drawImage(image, OUTLINE_PAD + x + dx, OUTLINE_PAD + y + dy);
        }
      }
    };

    const layer = document.createElement('canvas');
    layer.width = w + OUTLINE_PAD * 2;
    layer.height = h + OUTLINE_PAD * 2;
    const g = layer.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    stamp(g, tinted([0, 0, 0]), 2.3, 3, 3);
    g.globalAlpha = 0.45;
    stamp(g, tinted([0, 0, 0]), 2.3, 3, 3);
    g.globalAlpha = 1;
    stamp(g, tinted(colors.rim), 2.3);
    stamp(g, tinted(BLACK), 1.1);
    g.drawImage(source, OUTLINE_PAD, OUTLINE_PAD);
    return { layer, w, h };
  }

  private silhouette(color: Rgb): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = 96;
    c.height = 116;
    const g = c.getContext('2d')!;
    g.fillStyle = css(color);
    g.beginPath();
    g.ellipse(48, 38, 24, 29, 0, 0, Math.PI * 2);
    g.fill();
    g.fillRect(36, 56, 24, 22);
    g.beginPath();
    g.ellipse(48, 118, 48, 44, 0, Math.PI, 0);
    g.fill();
    const data = g.getImageData(0, 0, c.width, c.height);
    for (let i = 3; i < data.data.length; i += 4) data.data[i] = data.data[i] > 127 ? 255 : 0;
    g.putImageData(data, 0, 0);
    return c;
  }

  // ── Text ──────────────────────────────────────────────────────────

  private makeText(style: Phaser.Types.GameObjects.Text.TextStyle, origin: [number, number]): Phaser.GameObjects.Text {
    const text = this.scene.add.text(0, 0, '', style).setOrigin(origin[0], origin[1]).setScrollFactor(0).setDepth(DEPTH.VERSUS_TEXT);
    text.setVisible(false);
    return text;
  }

  private buildText(): void {
    for (const text of [this.vs, this.vsShadow, this.epithet, this.prompt, ...this.nameLines, ...this.nameShadows]) text?.destroy();
    const { boss } = this;
    const maxWidth = this.scene.scale.width * 0.9;

    this.vsShadow = this.makeText(titleStyle({ color: css(mix(rgb(boss.accent), BLACK, 0.6)), strokeThickness: 12 }), [0.5, 0.5]).setText('VS');
    this.vs = this.makeText(titleStyle({ color: '#ffe14a', strokeThickness: 12 }), [0.5, 0.5]).setText('VS');

    // The name on one line at the largest size that fits, or split at a space when two lines read bigger
    const fits = (parts: string[], cells: number): boolean => {
      const probe = this.makeText(titleStyle({ strokeThickness: 8 }), [0.5, 0]);
      probe.setFontSize(cells * FONT_GRID);
      const widest = Math.max(...parts.map(part => probe.setText(part).width));
      probe.destroy();
      return widest <= maxWidth;
    };
    const split = (): string[] => {
      const words = boss.name.split(' ');
      let best = [boss.name];
      let gap = Infinity;
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(' ');
        const b = words.slice(i).join(' ');
        if (Math.abs(a.length - b.length) < gap) {
          gap = Math.abs(a.length - b.length);
          best = [a, b];
        }
      }
      return best;
    };
    const largest = (parts: string[], max: number): number => {
      for (let cells = max; cells > 1; cells--) if (fits(parts, cells)) return cells;
      return 2;
    };
    const oneLine = largest([boss.name], 10);
    const twoLines = boss.name.includes(' ') ? largest(split(), 6) : 0;
    this.lines = twoLines > oneLine ? split() : [boss.name];
    this.nameCells = twoLines > oneLine ? twoLines : oneLine;

    // Shadows first, so the lines draw over them
    this.nameShadows = this.lines.map(line => this.makeText(titleStyle({ color: css(mix(rgb(boss.accent), BLACK, 0.55)), strokeThickness: 8 }), [0.5, 0]).setText(line));
    this.nameLines = this.lines.map(line => this.makeText(titleStyle({ color: '#ffffff', strokeThickness: 8 }), [0.5, 0]).setText(line));
    this.epithet = this.makeText(bodyStyle({ color: css(this.foeColors.glow), strokeThickness: 5 }), [0, 0]);
    this.epithet.setFontSize(4 * FONT_GRID);

    for (const text of [...this.nameLines, ...this.nameShadows]) text.setFontSize(this.nameCells * FONT_GRID);
    const lineH = this.nameLines[0].height;
    const epithetH = this.epithet.setText(boss.epithet).height;
    const bandH = Math.ceil((16 + lineH * this.nameLines.length - 6 + epithetH + 12) / PIXEL_BLOCK);
    // Portraits and plate as one block, centred on the screen
    const portraitH = Math.max(this.hero.h, this.foe.h);
    const standing = portraitH - PLATE_OVERLAP;
    const portraitTop = Math.max(4, Math.round((this.ch - standing - bandH) / 2));
    const plateBottom = portraitTop + standing + bandH;
    this.layout = {
      bandTop: portraitTop + standing, bandH, portraitTop, vsY: portraitTop + Math.round(standing * 0.45),
      // Centred in what is left under the plate, and no higher than just under it
      promptY: Math.max(plateBottom + 10, Math.round((plateBottom + this.ch) / 2)),
    };
    this.epithet.setText('');
    this.epithetWidth = 0;

    const touch = !this.scene.sys.game.device.os.desktop;
    this.prompt = this.makeText(bodyStyle({ ...PRESS_PROMPT_STYLE }), [0.5, 0.5]);
    this.prompt.setFontSize(PRESS_PROMPT_SIZE);
    this.prompt.setText(pressPromptText(touch, 'Dotknij, aby walczyć'));
  }

  // ── Per frame ─────────────────────────────────────────────────────

  private update(_time: number, delta: number): void {
    if (this.ended) return;
    this.t += Math.min(delta, MAX_FRAME_MS);

    for (const s of this.pendingSounds) {
      if (!this.played.has(s.key + s.at) && this.t >= s.at) {
        this.played.add(s.key + s.at);
        playIfLoaded(this.scene, this.audio, s.key, s.volume);
      }
    }
    if (!this.played.has('bark') && this.t >= this.profile.nameAt) {
      this.played.add('bark');
      playBossBark(this.scene, this.audio, this.boss);
    }

    if (!this.wiping && this.t >= this.wipeAt) {
      this.wiping = true;
      this.deps.onWipe();
    }
    if (this.t >= this.wipeAt + this.wipeMs) {
      this.destroy();
      this.deps.onEnd();
      return;
    }
    this.render(this.t);
  }

  private render(t: number): void {
    const { cw, ch, pixels, profile: P } = this;
    const ct = t;
    const wipeP = easeInCubic(clamp01((t - this.wipeAt) / this.wipeMs));

    const slashP = clamp01((ct - P.slashAt) / P.slashMs);
    const panelP = easeOutExpo(clamp01((ct - P.panelsAt) / P.panelsMs));
    const scrim = ct < P.slashAt ? 0 : 0.55 * clamp01((ct - P.slashAt) / (P.panelsAt - P.slashAt + 60)) * (1 - wipeP);

    // Shake, in texels: whichever hit is freshest, dying away
    let amp = 0;
    for (const s of this.shakes) if (ct >= s.at && ct < s.at + s.ms) amp = Math.max(amp, s.amp * (1 - (ct - s.at) / s.ms));
    const ox = amp > 0.4 ? Math.round((Math.random() * 2 - 1) * amp) : 0;
    const oy = amp > 0.4 ? Math.round((Math.random() * 2 - 1) * amp * 0.7) : 0;

    const travel = cw / 2 + 70;
    const heroShift = -(1 - panelP) * travel - wipeP * travel;
    const foeShift = (1 - panelP) * travel + wipeP * travel;
    const cx = cw / 2;

    pixels.fill(scrim > 0 ? pack(BLACK, Math.round(scrim * 255)) : 0);

    // The slash, cut from the top down, before and between the two halves
    const slashColor = pack(wipeP > 0.1 || ct < P.slashAt ? BLACK : WHITE, 255);
    const flicker = Math.floor(ct / 70) % 2 === 0 ? pack(WHITE) : pack([255, 225, 120]);
    for (let y = 0; y < ch; y++) {
      const v = y - oy;
      const edge = cx + (ch / 2 - v) * SLOPE + ox;
      this.heroEnd[y] = Math.min(cw, Math.max(0, Math.floor(edge - GAP + heroShift)));
      this.foeStart[y] = Math.min(cw, Math.max(0, Math.ceil(edge + GAP + foeShift)));
      if (ct >= P.slashAt && wipeP <= 0.1 && y / ch <= slashP) {
        const from = Math.max(0, Math.floor(edge - GAP - 1));
        const to = Math.min(cw, Math.ceil(edge + GAP + 1));
        for (let x = from; x < to; x++) {
          const core = x >= edge - GAP && x < edge + GAP;
          pixels[y * cw + x] = core ? (slashP >= 1 ? flicker : slashColor) : pack(BLACK);
        }
      }
    }

    this.paintHalf(true, ct, ox, oy);
    this.paintHalf(false, ct, ox, oy);
    this.paintStreaks(ct);

    this.ctx.putImageData(this.frame, 0, 0);
    this.paintFighters(ct, ox, oy, wipeP);
    this.paintBand(ct, oy, wipeP);
    this.paintBurst(ct, ox, oy, wipeP);
    this.paintPromptPlate(ct, ox, oy);
    this.tex.refresh();

    this.placeText(ct, ox, oy, wipeP);

    let flash = 0;
    for (const f of this.flashes) if (ct >= f.at && ct < f.at + f.ms) flash = Math.max(flash, f.strength * (1 - (ct - f.at) / f.ms));
    this.flash.setAlpha(Math.round(flash * 4) / 4);
  }

  private paintHalf(hero: boolean, ct: number, ox: number, oy: number): void {
    const { cw, ch, pixels } = this;
    const c = hero ? this.heroColors : this.foeColors;
    const a = pack(c.a);
    const b = pack(c.b);
    const glow = pack(c.glow);
    const edgeLine = pack(BLACK);
    const dark = pack(BLACK);
    const scroll = Math.floor(ct * 0.07);
    for (let y = 0; y < ch; y++) {
      const from = hero ? 0 : this.foeStart[y];
      const to = hero ? this.heroEnd[y] : cw;
      if (to <= from) continue;
      const v = y - oy;
      // Dithered shade at the top and bottom of the screen
      const shade = Math.max(clamp01(1 - v / 36), clamp01((v - (ch - 40)) / 40));
      for (let x = from; x < to; x++) {
        const u = x - ox;
        const k = hero ? u - v + scroll : u + v - scroll;
        let color = (((k % 30) + 30) % 30) < 15 ? a : b;
        const d = hero ? to - 1 - x : x - from;
        const threshold = BAYER[(y & 3) * 4 + (x & 3)];
        if (d < 1) color = edgeLine;
        else if (d < 16 && 1 - d / 16 > threshold) color = glow;
        if (shade > threshold) color = dark;
        pixels[y * cw + x] = color;
      }
    }
  }

  private paintStreaks(ct: number): void {
    const { cw, pixels } = this;
    const period = cw + 160;
    for (const hero of [true, false]) {
      const streaks = hero ? this.heroStreaks : this.foeStreaks;
      const color = pack(hero ? this.heroColors.streak : this.foeColors.streak);
      for (const s of streaks) {
        const head = ((s.start + (s.speed * ct) / 1000) % period) - 80;
        for (let row = 0; row < s.thick; row++) {
          const y = s.y + row;
          const lo = hero ? 0 : this.foeStart[y];
          const hi = hero ? this.heroEnd[y] - 2 : cw;
          const from = hero ? head - s.len : cw - head;
          const x0 = Math.max(lo + (hero ? 0 : 2), Math.floor(from));
          const x1 = Math.min(hi, Math.floor(from + s.len));
          for (let x = x0; x < x1; x++) pixels[y * cw + x] = color;
        }
      }
    }
  }

  private paintFighters(ct: number, ox: number, oy: number, wipeP: number): void {
    const P = this.profile;
    const { ctx, cw } = this;
    const { bandTop } = this.layout;
    const wipeShift = wipeP * (cw / 2 + 70);
    const bob = Math.round(Math.sin(ct * 0.004));
    const draw = (f: Fighter, x: number, y: number): void => {
      ctx.drawImage(f.layer, Math.round(x) - OUTLINE_PAD + ox, Math.round(y) - OUTLINE_PAD + oy);
    };

    const heroP = clamp01((ct - P.heroAt) / P.slamMs);
    const foeP = clamp01((ct - P.bossAt) / P.slamMs);
    const heroRest = -14;
    const foeRest = cw - this.foe.w - 10;
    const heroY = bandTop + PLATE_OVERLAP - this.hero.h + (heroP >= 1 ? bob : 0);
    const foeY = bandTop + PLATE_OVERLAP - this.foe.h + (foeP >= 1 ? -bob : 0);
    if (ct >= P.heroAt) {
      const x = heroRest - (1 - easeOutBack(heroP, 0.9)) * (this.hero.w + 40 + heroRest) - wipeShift;
      draw(this.hero, x, heroY);
      this.paintDebris(ct - (P.heroAt + P.slamMs * 0.85), x + this.hero.w, heroY + this.hero.h * 0.55, 1, this.heroColors.streak, ox, oy);
    }
    if (ct >= P.bossAt) {
      const x = foeRest + (1 - easeOutBack(foeP, 0.9)) * (cw - foeRest + 20) + wipeShift;
      draw(this.foe, x, foeY);
      this.paintDebris(ct - (P.bossAt + P.slamMs * 0.85), x, foeY + this.foe.h * 0.55, -1, this.foeColors.streak, ox, oy);
    }
  }

  /** Chips knocked off the screen by a landing, flying out and falling. */
  private paintDebris(age: number, x: number, y: number, dir: number, color: Rgb, ox: number, oy: number): void {
    if (age < 0 || age > 300) return;
    const life = age / 1000;
    const fade = age > 200;
    for (const d of this.debris) {
      const px = x + dir * Math.cos(d.angle) * d.speed * life;
      const py = y + Math.sin(d.angle) * d.speed * life - d.lift * life + 260 * life * life;
      this.ctx.fillStyle = css(fade && d.size === 3 ? BLACK : color);
      this.ctx.fillRect(Math.round(px) + ox, Math.round(py) + oy, d.size, d.size);
    }
  }

  /** The dark strip the portraits stand on, which opens to hold the name. Its two halves ride on the two panels. */
  private paintBand(ct: number, oy: number, wipeP: number): void {
    const P = this.profile;
    const { ctx, cw } = this;
    if (ct < P.panelsAt) return;
    const { bandTop, bandH } = this.layout;
    const h = Math.max(0, Math.round(bandH * (1 - wipeP)));
    // The rim lights up white as the name lands
    const hit = ct >= P.nameAt + 100 && ct < P.nameAt + 220;
    for (let row = 0; row < h; row++) {
      const y = bandTop + row;
      if (y + oy < 0 || y >= this.ch) continue;
      const line = row < 2 || row >= h - 2;
      const hero = line ? (hit ? WHITE : this.heroColors.rim) : this.heroColors.band;
      const foe = line ? (hit ? WHITE : this.foeColors.rim) : this.foeColors.band;
      const heroEnd = this.heroEnd[Math.min(this.ch - 1, Math.max(0, y + oy))];
      const foeStart = this.foeStart[Math.min(this.ch - 1, Math.max(0, y + oy))];
      ctx.fillStyle = css(hero);
      ctx.fillRect(0, y + oy, heroEnd, 1);
      ctx.fillStyle = css(foe);
      ctx.fillRect(foeStart, y + oy, cw - foeStart, 1);
    }
  }

  /** The spiky flash behind VS. */
  private paintBurst(ct: number, ox: number, oy: number, wipeP: number): void {
    const P = this.profile;
    if (ct < P.vsAt || wipeP > 0.5) return;
    const p = clamp01((ct - P.vsAt) / 120);
    // Once it has settled it keeps breathing, slowly
    const pulse = ct > P.vsAt + 400 ? 0.07 * Math.sin(ct * 0.003) : 0;
    const radius = Math.round(64 * easeOutBack(p, 1.6) * (1 - wipeP * 2) * (1 + pulse));
    if (radius < 3) return;
    const size = 160;
    const g = this.burst.getContext('2d')!;
    const data = g.createImageData(size, size);
    const px = new Uint32Array(data.data.buffer);
    const spin = ct * 0.0007;
    const spikes = 12;
    const yellow = pack([255, 225, 70]);
    const hot = pack([255, 250, 225]);
    const inkd = pack(BLACK);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - size / 2 + 0.5;
        const dy = y - size / 2 + 0.5;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > radius) continue;
        const angle = (Math.atan2(dy, dx) + spin) / (Math.PI * 2 / spikes);
        const along = angle - Math.floor(angle);
        const reach = radius * (0.38 + 0.62 * (1 - Math.abs(along - 0.5) * 2));
        if (dist > reach) continue;
        px[y * size + x] = dist > reach - 2 ? inkd : dist < radius * 0.5 ? hot : yellow;
      }
    }
    g.putImageData(data, 0, 0);
    const cx = Math.round(this.cw / 2) - size / 2 + ox;
    const y = this.layout.vsY - size / 2 + oy;
    this.ctx.drawImage(this.burst, cx, y);
  }

  private placeText(ct: number, ox: number, oy: number, wipeP: number): void {
    const P = this.profile;
    const unit = PIXEL_BLOCK;
    const centerX = Math.round(this.cw / 2) * unit + ox * unit;
    const fade = wipeP < 0.5 ? 1 : 0;

    // VS: slams in huge and shrinks to size in whole font-pixel steps
    const vsP = clamp01((ct - P.vsAt) / 110);
    const vsShown = ct >= P.vsAt && fade === 1;
    const vsCells = 16 + Math.round(10 * Math.pow(1 - vsP, 2));
    for (const text of [this.vs, this.vsShadow]) {
      text.setVisible(vsShown);
      this.setCells(text, vsCells);
    }
    const vsY = this.layout.vsY * unit + oy * unit - 4;
    this.vs.setPosition(centerX, vsY);
    this.vsShadow.setPosition(centerX + 8, vsY + 8);

    // The name: the same drop, and the epithet typed under it
    const nameP = clamp01((ct - P.nameAt) / 130);
    const nameShown = ct >= P.nameAt && fade === 1;
    const cells = this.nameCells + Math.round(5 * Math.pow(1 - nameP, 2));
    const { bandTop } = this.layout;
    let top = (bandTop + 9) * unit + oy * unit;
    for (let i = 0; i < this.nameLines.length; i++) {
      const line = this.nameLines[i];
      const shadow = this.nameShadows[i];
      for (const text of [line, shadow]) {
        text.setVisible(nameShown);
        this.setCells(text, cells);
      }
      line.setPosition(centerX, top);
      shadow.setPosition(centerX + 6, top + 6);
      top += line.height - 6;
    }

    const typed = ct < P.epithetAt ? 0 : Math.ceil(clamp01((ct - P.epithetAt) / P.epithetMs) * this.boss.epithet.length);
    this.epithet.setVisible(typed > 0 && fade === 1);
    if (typed > 0) {
      if (this.epithetWidth === 0) this.epithetWidth = this.epithet.setText(this.boss.epithet).width;
      const shown = this.boss.epithet.slice(0, typed);
      if (this.epithet.text !== shown) this.epithet.setText(shown);
      this.epithet.setPosition(Math.round((centerX - this.epithetWidth / 2) / unit) * unit, Math.round(top / unit) * unit + 4);
    }

    // Solo, once everything has landed: the prompt fades in, then blinks gently until a press
    const waiting = this.isWaiting(ct);
    this.prompt.setVisible(waiting);
    if (waiting) {
      this.prompt.setAlpha(pressPromptAlpha(ct - P.holdAt));
      this.prompt.setPosition(centerX, this.layout.promptY * unit + oy * unit);
    }
  }

  /** Solo, once everything has landed and until the press. */
  private isWaiting(ct: number): boolean {
    return this.deps.waitForPress && this.wipeAt === Infinity && ct >= this.profile.holdAt;
  }

  /** A dark plate under the prompt, so the slash and the shade at the screen's foot do not cut into it. */
  private paintPromptPlate(ct: number, ox: number, oy: number): void {
    if (!this.isWaiting(ct)) return;
    const fade = clamp01((ct - this.profile.holdAt) / 250);
    const w = Math.ceil(this.prompt.width / PIXEL_BLOCK) + 20;
    const h = 15;
    const x = Math.round(this.cw / 2 - w / 2) + ox;
    const y = this.layout.promptY - Math.floor(h / 2) + oy;
    this.ctx.fillStyle = css(BLACK);
    this.ctx.globalAlpha = 0.82 * fade;
    this.ctx.fillRect(x, y, w, h);
    this.ctx.globalAlpha = 1;
  }

  private setCells(text: Phaser.GameObjects.Text, cells: number): void {
    const size = `${cells * FONT_GRID}px`;
    if (text.style.fontSize !== size) text.setFontSize(size);
  }
}
