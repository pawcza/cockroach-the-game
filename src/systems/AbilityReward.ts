/**
 * The "new ability" beat after a boss falls, before the run picks up: the power's icon rises out of the dark with rays
 * behind it, "NOWA MOC: ..." slams in, and one line says how to use it. About a second and a half, and any key or tap
 * skips it. Its timeline is its own clock, driven by the scene's update event, so it plays over a frozen world (like the
 * versus splash). The icon is the touch button's own art for the dash and the gun; the wylinka's is a pale shell.
 */
import Phaser from 'phaser';
import { AudioManager, VOL } from '../audio/AudioManager';
import { DEPTH, PIXEL_BLOCK } from '../config/constants';
import { ATLAS, SPRITE_SCALE, frameOf } from '../config/sprites';
import { VFX_ATLAS, vfxFrame } from '../effects/Fx';
import { ICON_BITMAPS, drawBitmap } from '../ui/AbilityStrip';
import { bodyStyle, titleStyle, UI_TEXT } from '../utils/TextStyles';
import { ABILITY_TEXT, type AbilityId } from './abilities';

const TOTAL_MS = 1500;
const FADE_OUT_MS = 200;
const SKIP_LOCKOUT_MS = 500;
const SKIP_FADE_MS = 140;
/** A frame that took longer than this (a hitch, a hidden tab) counts as this much. */
const MAX_FRAME_MS = 50;

/** The baked rays turn a step this often, the halo breathes at its own pace. */
const RAY_FPS = 10;
const HALO_FPS = 4;
const SHELL_BLOCK = 8;
/** The button art's scale, and the drawn shell's: both end up a plate about 180 px across. */
const ICON_SCALE = { image: 3, shell: 2 };

/** Each power's colour: its glow and rays (baked in the effects atlas), and its name. */
const ACCENT: Record<AbilityId, { glow: string; name: string }> = {
  dash: { glow: 'teal', name: '#8ff0e0' },
  gun: { glow: 'red', name: '#ff9a82' },
  moult: { glow: 'cream', name: '#f1e3c6' },
};

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const easeOutBack = (p: number, s = 1.4): number => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2);
const easeOutCubic = (p: number): number => 1 - Math.pow(1 - p, 3);

export interface AbilityRewardDeps {
  scene: Phaser.Scene;
  audio: AudioManager;
  ability: AbilityId;
  /** The beat is over, played out or skipped. */
  onDone: () => void;
}

export class AbilityReward {
  private deps: AbilityRewardDeps;
  private t = 0;
  private endAt = TOTAL_MS;
  private fadeMs = FADE_OUT_MS;
  private ended = false;
  private landed = false;
  private slammed = false;

  private dim: Phaser.GameObjects.Rectangle;
  private flash: Phaser.GameObjects.Rectangle;
  private rays: Phaser.GameObjects.Image;
  private glow: Phaser.GameObjects.Image;
  private icon: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
  private title: Phaser.GameObjects.Text;
  private how: Phaser.GameObjects.Text;

  private onKey = (event: KeyboardEvent): void => {
    if (event.keyCode !== Phaser.Input.Keyboard.KeyCodes.ESC) this.skip();
  };
  private onPointer = (): void => this.skip();

  constructor(deps: AbilityRewardDeps) {
    this.deps = deps;
    const { scene, ability } = deps;
    const { width, height } = scene.cameras.main;
    const touch = !scene.sys.game.device.os.desktop;
    const text = ABILITY_TEXT[ability];

    const fixed = <T extends Phaser.GameObjects.GameObject>(o: T, depth: number): T => {
      (o as unknown as Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth).setScrollFactor(0).setDepth(depth);
      return o;
    };

    this.dim = fixed(scene.add.rectangle(width / 2, height / 2, width, height, 0x07050a, 0), DEPTH.REWARD);
    // Pixel rays and a stepped halo from the effects atlas, light on the dark: each rotation and band is drawn
    const accent = ACCENT[ability].glow;
    this.rays = fixed(scene.add.image(width / 2, height / 2, VFX_ATLAS, vfxFrame(`rays-${accent}`)), DEPTH.REWARD)
      .setScale(SPRITE_SCALE).setBlendMode(Phaser.BlendModes.ADD);
    this.glow = fixed(scene.add.image(width / 2, height / 2, VFX_ATLAS, vfxFrame(`halo-${accent}`)), DEPTH.REWARD)
      .setScale(SPRITE_SCALE).setBlendMode(Phaser.BlendModes.ADD);
    this.icon = ability === 'moult' ? this.shellIcon() : scene.add.image(0, 0, ATLAS, frameOf(`btn-${ability}`, 0));
    fixed(this.icon, DEPTH.REWARD + 0.5);
    this.title = fixed(scene.add.text(width / 2, height * 0.66, `NOWA MOC: ${text.name}`, titleStyle({
      fontSize: '32px', color: ACCENT[ability].name, strokeThickness: 8,
    })).setOrigin(0.5), DEPTH.REWARD_TEXT);
    this.how = fixed(scene.add.text(width / 2, height * 0.66 + 70, touch ? text.how.touch : text.how.keyboard, bodyStyle({
      fontSize: '16px', color: UI_TEXT.bone, strokeThickness: 4, align: 'center', wordWrap: { width: Math.min(width - 60, 620) },
    })).setOrigin(0.5, 0), DEPTH.REWARD_TEXT);
    this.flash = fixed(scene.add.rectangle(width / 2, height / 2, width, height, 0xffffff, 0), DEPTH.REWARD_TEXT + 1);

    this.render(0);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    scene.input.keyboard?.on('keydown', this.onKey);
    scene.input.on('pointerdown', this.onPointer);
  }

  get blocking(): boolean { return !this.ended; }

  /** A pale shell on a dark plate, like the touch buttons', for the power that has no button. */
  private shellIcon(): Phaser.GameObjects.Graphics {
    const g = this.deps.scene.add.graphics();
    g.fillStyle(0x1a1219, 1).fillCircle(0, 0, 44);
    g.lineStyle(4, 0x4b5160, 1).strokeCircle(0, 0, 44);
    const rows = ICON_BITMAPS.moult;
    drawBitmap(
      g, rows, SHELL_BLOCK,
      { '#': 0xf1e3c6, o: 0xf1e3c6, '+': 0xb8a888 },
      -(rows[0].length * SHELL_BLOCK) / 2, -(rows.length * SHELL_BLOCK) / 2, rows[0].length * SHELL_BLOCK,
    );
    return g;
  }

  /** Cuts the beat short, once the first moment has landed. */
  skip(): void {
    if (this.ended || this.t < SKIP_LOCKOUT_MS || this.t >= this.endAt - SKIP_FADE_MS) return;
    this.endAt = this.t + SKIP_FADE_MS;
    this.fadeMs = SKIP_FADE_MS;
  }

  private update(_time: number, delta: number): void {
    if (this.ended) return;
    this.t += Math.min(delta, MAX_FRAME_MS);
    this.render(this.t);
    if (this.t >= this.endAt) this.finish();
  }

  private render(t: number): void {
    const { scene, ability } = this.deps;
    const { width, height } = scene.cameras.main;
    const out = 1 - clamp01((t - (this.endAt - this.fadeMs)) / this.fadeMs);
    const cx = width / 2;
    const accent = ACCENT[ability].glow;

    this.dim.setFillStyle(0x07050a, 0.62 * clamp01(t / 140) * out);
    this.flash.setFillStyle(0xffffff, 0.8 * (1 - clamp01(t / 160)) * out);

    // The icon rises from below and settles a little above the middle
    const rise = clamp01(t / 440);
    const iconY = Phaser.Math.Linear(height * 0.78, height * 0.38, easeOutCubic(rise)) + Math.sin(t / 260) * 3 * rise;
    const full = this.deps.ability === 'moult' ? ICON_SCALE.shell : ICON_SCALE.image;
    const scale = Phaser.Math.Linear(0.2, full, easeOutBack(rise));
    this.icon.setPosition(Math.round(cx), Math.round(iconY)).setScale(scale).setAlpha(out * clamp01(t / 120));
    if (!this.landed && rise >= 1) {
      this.landed = true;
      this.deps.audio.playSfx('ability-reward', VOL.stinger);
    }

    // The halo behind it, breathing a texel, and the rays turning a drawn step at a time; both on the grid
    const at = (o: Phaser.GameObjects.Image): Phaser.GameObjects.Image => o.setPosition(
      Math.round(cx / PIXEL_BLOCK) * PIXEL_BLOCK, Math.round(iconY / PIXEL_BLOCK) * PIXEL_BLOCK);
    at(this.glow).setFrame(vfxFrame(`halo-${accent}`, Math.floor(t * HALO_FPS / 1000) % 2))
      .setAlpha(0.55 * out * clamp01(t / 200) * Math.min(1, scale / full + 0.2));
    at(this.rays).setFrame(vfxFrame(`rays-${accent}`, Math.floor(t * RAY_FPS / 1000) % 6))
      .setAlpha(0.45 * clamp01((t - 60) / 300) * out);

    // The title slams in once the icon has landed, and the line under it follows
    const slam = clamp01((t - 420) / 180);
    this.title.setAlpha(clamp01(slam * 3) * out).setScale(Phaser.Math.Linear(2.2, 1, easeOutBack(slam)));
    if (!this.slammed && t >= 420) {
      this.slammed = true;
      scene.cameras.main.shake(220, 0.006);
    }
    const line = clamp01((t - 800) / 240);
    this.how.setAlpha(line * out).setY(height * 0.66 + 70 + (1 - line) * 10);
  }

  private finish(): void {
    if (this.ended) return;
    this.destroy();
    this.deps.onDone();
  }

  destroy(): void {
    if (this.ended) return;
    this.ended = true;
    const { scene } = this.deps;
    scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
    scene.input.keyboard?.off('keydown', this.onKey);
    scene.input.off('pointerdown', this.onPointer);
    for (const o of [this.dim, this.flash, this.rays, this.glow, this.icon, this.title, this.how]) o.destroy();
  }
}
