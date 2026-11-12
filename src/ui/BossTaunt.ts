/**
 * A boss mocking the roach: its portrait, cropped to a bust in a bevelled frame in the boss's colour, slides in from
 * the right under the pause button with a speech panel beside it, and says a line in its gibberish voice while the
 * text is typed out in step with the syllables. The portrait talks, bobbing a pixel or two per syllable. After the
 * line it holds a moment and slides out again.
 *
 * It only draws and talks: no input, no physics, nothing in the run waits for it. It sits in the top-right under the
 * pause button, clear of the score (top-centre), the ability strip (top-left), the lanes and the touch buttons.
 */
import Phaser from 'phaser';
import { BossVoice, type VoiceId } from '../audio/gibberish';
import { DEPTH } from '../config/constants';
import { BossDef } from '../systems/boss/bosses';
import { portraitKey } from '../systems/boss/portraits';
import { bodyStyle } from '../utils/TextStyles';

const MARGIN = 12;
/** Under the pause button (its plate ends at 60). */
const TOP = 64;
const BUST = 48;
/** Source texels per bust pixel: the portraits are drawn at exactly half size, so each pixel is the average of a 2x2. */
const BUST_SHRINK = 2;
const BOX_PAD = 2;
const BEVEL = 3;
const BOX = BUST + BOX_PAD * 2 + BEVEL * 2;
const GAP = 9;
const PAD_X = 9;
const PAD_Y = 7;
const SLAB = 0x16101a;
const BONE = '#f1e3c6';

const IN_MS = 300;
const OUT_MS = 240;
const HOLD_MS = 1000;
/** The voice starts once the panel is mostly in. */
const SPEAK_AT_MS = 170;
const TALK_DECAY_MS = 110;
const MAX_FRAME_MS = 50;

/** Where the bust is cut from each portrait: the top-left corner of the 96-texel window. */
const BUST_CROP: Record<string, { x: number; y: number }> = {
  lodzia: { x: 0, y: 0 },
  bigos: { x: 8, y: 0 },
  zlewiatan: { x: 10, y: 0 },
  eksterminator: { x: 4, y: 0 },
};

type Rgb = [number, number, number];
const rgb = (c: number): Rgb => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const mix = (a: Rgb, b: Rgb, t: number): number => {
  const m = (i: number): number => Math.round(a[i] + (b[i] - a[i]) * t);
  return (m(0) << 16) | (m(1) << 8) | m(2);
};
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

/** Bust textures drawn as a plain silhouette because their portrait had not loaded. */
const silhouettes = new Set<string>();

const easeOutBack = (p: number, s = 1.5): number => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2);
const easeInBack = (p: number, s = 1.2): number => (s + 1) * p * p * p - s * p * p;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

type Phase = 'idle' | 'talk' | 'hold' | 'out';

export interface TauntPlacement {
  /** Top edge, in screen px. */
  top: number;
  /** The panel keeps this far left of the middle of the screen's right half: more makes it narrower. */
  centreClear: number;
}

/** Mid-run: under the pause button, the panel as wide as the screen's right half allows. */
export const RUN_PLACEMENT: TauntPlacement = { top: TOP, centreClear: 92 };

export interface ShowOptions {
  /** Called when the widget is gone again, after its line or after being cut. */
  onDone?: () => void;
}

/**
 * The bust texture for a boss: its portrait's top-left 96-texel window drawn at half size, made once and kept. A
 * portrait that did not load is a plain silhouette in the boss's colour, so a missing file never crashes anything.
 */
export function bustTexture(scene: Phaser.Scene, boss: BossDef): string {
  const key = `taunt-bust-${boss.id}`;
  const loaded = scene.textures.exists(portraitKey(boss.id));
  if (scene.textures.exists(key)) {
    // A silhouette made before the portrait arrived (the art loads after boot) is made again once it has
    if (!(silhouettes.has(key) && loaded)) return key;
    scene.textures.remove(key);
  }
  if (loaded) silhouettes.delete(key);
  else silhouettes.add(key);
  const canvas = scene.textures.createCanvas(key, BUST, BUST);
  if (!canvas) return key;
  const ctx = canvas.getContext();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const source = portraitKey(boss.id);
  if (loaded) {
    const image = scene.textures.get(source).getSourceImage() as CanvasImageSource;
    const crop = BUST_CROP[boss.id] ?? { x: 0, y: 0 };
    const side = BUST * BUST_SHRINK;
    ctx.drawImage(image, crop.x, crop.y, side, side, 0, 0, BUST, BUST);
  } else {
    const [r, g, b] = rgb(boss.accent);
    ctx.fillStyle = `rgb(${r >> 1},${g >> 1},${b >> 1})`;
    ctx.fillRect(0, 0, BUST, BUST);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    ctx.arc(BUST / 2, BUST * 0.38, BUST * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(BUST * 0.18, BUST * 0.66, BUST * 0.64, BUST * 0.34);
  }
  canvas.refresh();
  return key;
}

export class BossTaunt {
  private scene: Phaser.Scene;
  private voice: BossVoice;
  private placement: TauntPlacement;

  private root: Phaser.GameObjects.Container;
  private panel: Phaser.GameObjects.Graphics;
  private box: Phaser.GameObjects.Graphics;
  private bust: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;

  private phase: Phase = 'idle';
  private t = 0;
  private holdT = 0;
  private speaking = false;
  private started = false;
  /** 1 on a syllable, falling to 0: drives the portrait's bob and squash. */
  private talk = 0;

  private boss: BossDef | null = null;
  private text = '';
  /** The line broken into the panel's lines, once, so typing it never re-wraps what is already on screen. */
  private wrapped: string[] = [];
  private panelW = 0;
  private panelH = BOX;
  private travel = 0;
  private onDone: (() => void) | null = null;

  constructor(scene: Phaser.Scene, voice: BossVoice, placement: TauntPlacement = RUN_PLACEMENT) {
    this.scene = scene;
    this.voice = voice;
    this.placement = placement;
    this.panel = scene.add.graphics();
    this.box = scene.add.graphics();
    this.bust = scene.add.image(0, 0, '__DEFAULT').setOrigin(0.5, 1).setVisible(false);
    this.label = scene.add.text(PAD_X, PAD_Y, '', bodyStyle({ fontSize: '12px', color: BONE, strokeThickness: 0 }));
    this.root = scene.add.container(0, placement.top, [this.panel, this.box, this.bust, this.label])
      .setScrollFactor(0).setDepth(DEPTH.TAUNT).setVisible(false);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.place, this);
  }

  get isShowing(): boolean { return this.phase !== 'idle'; }

  /** Slides in with this boss's portrait and says the line. Whatever was showing is cut. */
  show(boss: BossDef, text: string, opts: ShowOptions = {}): void {
    this.cancel();
    this.boss = boss;
    this.text = text;
    this.onDone = opts.onDone ?? null;
    this.layout(boss, text);
    this.label.setText('');
    this.phase = 'talk';
    this.t = 0;
    this.holdT = 0;
    this.speaking = false;
    this.started = false;
    this.talk = 0;
    this.root.setVisible(true);
    this.place();
  }

  /** Cuts the line and slides out, or with `now` vanishes at once (a pause, a fight, a death). */
  hide(now = false): void {
    if (this.phase === 'idle') return;
    this.voice.stop();
    this.speaking = false;
    if (now) {
      this.finish();
      return;
    }
    if (this.phase !== 'out') {
      this.phase = 'out';
      this.t = 0;
    }
  }

  destroy(): void {
    this.cancel();
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.place, this);
    this.root.destroy();
  }

  // ── Drawing ──────────────────────────────────────────────────────

  private layout(boss: BossDef, text: string): void {
    const width = this.scene.cameras.main.width;
    // The panel stays right of the middle of the screen, so the score above it is never under it
    this.panelW = Math.round(Phaser.Math.Clamp(width / 2 - this.placement.centreClear, 160, 288));
    this.label.setWordWrapWidth(this.panelW - PAD_X * 2, true);
    this.wrapped = this.label.getWrappedText(text);
    this.label.setText(this.wrapped.join('\n'));
    const textH = this.label.height;
    this.panelH = Math.max(BOX, Math.ceil(textH + PAD_Y * 2));

    const accent = rgb(boss.accent);
    const light = mix(accent, WHITE, 0.5);
    const dark = mix(accent, BLACK, 0.55);
    const base = boss.accent;
    const inner = mix(accent, BLACK, 0.72);

    // The speech panel: a dark slab with the accent for its rim, and a stepped tail toward the portrait
    const p = this.panel.clear();
    const pw = this.panelW;
    const ph = this.panelH;
    p.fillStyle(dark, 1).fillRect(0, 0, pw, ph);
    p.fillStyle(base, 1).fillRect(0, 0, pw, 2).fillRect(0, 0, 2, ph);
    p.fillStyle(light, 1).fillRect(0, 0, pw - 2, 1).fillRect(0, 0, 1, ph - 2);
    p.fillStyle(SLAB, 0.97).fillRect(3, 3, pw - 6, ph - 6);
    const tailY = Math.round(BOX / 2) - 6;
    p.fillStyle(dark, 1).fillRect(pw, tailY, 3, 12).fillRect(pw + 3, tailY + 3, 3, 6);
    p.fillStyle(SLAB, 0.97).fillRect(pw - 3, tailY + 1, 4, 10).fillRect(pw + 1, tailY + 2, 3, 8).fillRect(pw + 3, tailY + 4, 2, 4);

    // The portrait's frame, bevelled: light on its top and left, dark on its bottom and right
    const bx = pw + GAP;
    const b = this.box.clear();
    b.fillStyle(base, 1).fillRect(bx, 0, BOX, BOX);
    b.fillStyle(light, 1).fillRect(bx, 0, BOX, BEVEL - 1).fillRect(bx, 0, BEVEL - 1, BOX);
    b.fillStyle(dark, 1).fillRect(bx, BOX - BEVEL + 1, BOX, BEVEL - 1).fillRect(bx + BOX - BEVEL + 1, 0, BEVEL - 1, BOX);
    b.fillStyle(0x0a0508, 1).fillRect(bx + BEVEL - 1, BEVEL - 1, BOX - BEVEL * 2 + 2, BOX - BEVEL * 2 + 2);
    b.fillStyle(inner, 1).fillRect(bx + BEVEL, BEVEL, BOX - BEVEL * 2, BOX - BEVEL * 2);

    this.bust.setTexture(bustTexture(this.scene, boss)).setVisible(true);
    this.bust.setPosition(bx + BOX / 2, BOX - BEVEL - BOX_PAD);
    this.bust.setScale(1);
    this.label.setPosition(PAD_X, Math.round((ph - textH) / 2));
    this.label.setText('');
    this.travel = this.panelW + GAP + BOX + MARGIN + 24;
  }

  /** Anchors the whole thing to the top-right of the screen, on its slide. */
  private place(): void {
    if (this.phase === 'idle') return;
    const width = this.scene.cameras.main.width;
    const total = this.panelW + GAP + BOX;
    const home = width - MARGIN - total;
    let offset = 0;
    if (this.phase === 'talk') offset = (1 - easeOutBack(clamp01(this.t / IN_MS))) * this.travel;
    else if (this.phase === 'out') offset = easeInBack(clamp01(this.t / OUT_MS)) * this.travel;
    this.root.setPosition(Math.round(home + offset), this.placement.top);
  }

  // ── Per frame ────────────────────────────────────────────────────

  private update(_time: number, delta: number): void {
    if (this.phase === 'idle') return;
    const dt = Math.min(delta, MAX_FRAME_MS);
    this.t += dt;

    if (this.phase === 'talk') {
      if (!this.started && this.t >= SPEAK_AT_MS) this.startSpeaking();
      if (this.t >= IN_MS && !this.speaking && this.started) this.phase = 'hold';
    }
    if (this.phase === 'hold') {
      this.holdT += dt;
      if (this.holdT >= HOLD_MS) {
        this.phase = 'out';
        this.t = 0;
      }
    }
    if (this.phase === 'out' && this.t >= OUT_MS) {
      this.finish();
      return;
    }

    this.talk = Math.max(0, this.talk - dt / TALK_DECAY_MS);
    // A pixel or two up and a little squashed on each syllable, back to rest between them
    const bob = Math.round(this.talk * 2);
    this.bust.setY(BOX - BEVEL - BOX_PAD - bob);
    this.bust.setScale(1 + this.talk * 0.04, 1 - this.talk * 0.05);
    this.place();
  }

  private startSpeaking(): void {
    if (!this.boss) return;
    this.started = true;
    this.speaking = true;
    this.voice.speak(this.boss.id as VoiceId, this.text, {
      onChar: (index, _char, voiced) => {
        if (voiced) this.talk = 1;
        this.reveal(index);
      },
      onEnd: (completed) => {
        this.speaking = false;
        if (!completed) return;
        this.reveal(this.text.length - 1);
        // Slid in already: hold; still sliding: hold starts when it lands
        if (this.phase === 'talk' && this.t < IN_MS) return;
        this.phase = 'hold';
        this.holdT = 0;
      },
    });
  }

  /** Shows the text up to and including character `index`, on the lines it was wrapped into. */
  private reveal(index: number): void {
    const typed = Array.from(this.text).slice(0, index + 1).filter(c => !/\s/.test(c)).length;
    let left = typed;
    const lines: string[] = [];
    for (const line of this.wrapped) {
      let out = '';
      for (const ch of Array.from(line)) {
        if (/\s/.test(ch)) {
          if (left > 0) out += ch;
        } else if (left > 0) {
          out += ch;
          left--;
        }
      }
      lines.push(out.trimEnd());
      if (left <= 0) break;
    }
    this.label.setText(lines.join('\n'));
  }

  // ── End ──────────────────────────────────────────────────────────

  private cancel(): void {
    if (this.phase === 'idle') return;
    this.voice.stop();
    this.phase = 'idle';
    this.speaking = false;
    this.root.setVisible(false);
    this.onDone = null;
  }

  private finish(): void {
    const done = this.onDone;
    this.onDone = null;
    this.phase = 'idle';
    this.speaking = false;
    this.root.setVisible(false);
    done?.();
  }
}
