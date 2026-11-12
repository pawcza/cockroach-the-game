import Phaser from 'phaser';
import { DEPTH } from '../config/constants';
import { ATLAS, SPRITE_SCALE, frameOf } from '../config/sprites';

export interface TouchControlCallbacks {
  onSwap: () => void;
  onDash: () => void;
  onShoot: () => void;
  isDisabled: () => boolean;
  isDashAllowed: () => boolean;
}

/** The plate is 60 texels across (tools/art/buttons.py), drawn at SPRITE_SCALE. */
const BTN_RADIUS = 30 * SPRITE_SCALE;
const BTN_MARGIN = 12;
const BTN_GAP = 14;
/** A thumb lands a little off the plate; hit areas reach this far past it (less than half the gap, so neighbours never overlap). */
const HIT_PAD = 6;
/** Frame rows the plate fills (the rest holds its shadow): the dash's fill sweeps through them. */
const PLATE_TOP = 1;
const PLATE_ROWS = 60;
/** Slightly see-through, so a button never hides the world under it completely; a pressed one is solid. */
const IDLE_ALPHA = 0.88;
const FLASH_MS = 160;

/** Where the lane button stands on a screen this tall: bottom-left, the corner the left thumb rests in. */
export function laneButtonCentre(screenHeight: number): { x: number; y: number; r: number } {
  return { x: BTN_MARGIN + BTN_RADIUS, y: screenHeight - BTN_MARGIN - BTN_RADIUS, r: BTN_RADIUS };
}

type Name = 'lane' | 'gun' | 'dash';
type Face = 'up' | 'down' | 'cool' | 'flash';
const FACE_INDEX: Record<Face, number> = { up: 0, down: 1, cool: 2, flash: 3 };

interface Button {
  name: Name;
  image: Phaser.GameObjects.Image;
  /** The dash only: its lit face over the grey one, cropped from the bottom up as it charges. */
  fill: Phaser.GameObjects.Image | null;
  shown: boolean;
  held: boolean;
  flashing: boolean;
}

export class TouchControls {
  private scene: Phaser.Scene;
  private isMobile: boolean;
  private callbacks: TouchControlCallbacks;

  // Mobile only
  private swapZone: Phaser.GameObjects.Rectangle | null = null;
  private lane: Button | null = null;
  private dash: Button | null = null;
  private gun: Button | null = null;
  private charge = 1;
  private width = 0;

  constructor(scene: Phaser.Scene, isMobile: boolean, callbacks: TouchControlCallbacks) {
    this.scene = scene;
    this.isMobile = isMobile;
    this.callbacks = callbacks;
  }

  create(): void {
    if (!this.isMobile) return;

    const { width: sw, height: sh } = this.scene.cameras.main;
    this.width = sw;
    const cy = sh - BTN_MARGIN - BTN_RADIUS;

    // LANE: invisible zone covering left 50% of screen
    this.swapZone = this.scene.add.rectangle(0, 0, sw / 2, sh, 0x000000, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.TOUCH_ZONE)
      .setInteractive();

    // LANE button -- bottom-left (visual only: the whole zone takes the tap, and any tap in it sinks the button)
    const laneAt = laneButtonCentre(sh);
    this.lane = this.createButton('lane', laneAt.x, laneAt.y, false);
    this.lane.shown = true;
    this.swapZone.on('pointerdown', () => {
      if (this.callbacks.isDisabled()) return;
      this.press(this.lane!);
      this.callbacks.onSwap();
    });
    this.swapZone.on('pointerup', () => this.release(this.lane!));
    this.swapZone.on('pointerupoutside', () => this.release(this.lane!));

    // DASH and GUN: bottom-right, each its own hit area. Hidden until something shows them.
    this.dash = this.createButton('dash', 0, cy, true, () => {
      if (this.callbacks.isDashAllowed()) this.callbacks.onDash();
    });
    this.gun = this.createButton('gun', 0, cy, false, () => this.callbacks.onShoot());

    this.place();
  }

  layout(width: number, height: number): void {
    if (!this.swapZone) return;
    this.width = width;
    this.swapZone.setSize(width / 2, height);
    (this.swapZone.input!.hitArea as Phaser.Geom.Rectangle).setSize(width / 2, height);
    this.place();
  }

  setDashVisible(visible: boolean): void {
    this.setShown(this.dash, visible);
  }

  setGunVisible(visible: boolean): void {
    this.setShown(this.gun, visible);
  }

  /** A button that has just been earned: it grows into place from nothing, with an overshoot. */
  popIn(name: 'dash' | 'gun'): void {
    const button = name === 'dash' ? this.dash : this.gun;
    if (!button) return;
    const parts = this.parts(button);
    this.scene.tweens.killTweensOf(parts);
    for (const part of parts) part.setScale(0);
    this.scene.tweens.add({ targets: parts, scale: SPRITE_SCALE, duration: 320, ease: 'Back.easeOut' });
  }

  /** How far the dash has recharged, 0 to 1: the grey cap fills from the bottom, and lights up once when it is ready. */
  setDashCharge(charge: number): void {
    const was = this.charge;
    this.charge = charge;
    const dash = this.dash;
    if (!dash || was === charge) return;
    if (charge >= 1 && was < 1) {
      dash.flashing = true;
      this.scene.time.delayedCall(FLASH_MS, () => { dash.flashing = false; this.refresh(dash); });
      for (const part of this.parts(dash)) part.setScale(SPRITE_SCALE * 1.1);
      this.pop(dash);
    }
    this.refresh(dash);
  }

  private setShown(button: Button | null, visible: boolean): void {
    if (!button || button.shown === visible) return;
    button.shown = visible;
    if (!visible) button.held = false;
    this.place();
    this.refresh(button);
  }

  private createButton(name: Name, x: number, y: number, withFill: boolean, onTap?: () => void): Button {
    const make = (face: Face): Phaser.GameObjects.Image => this.scene.add.image(x, y, ATLAS, frameOf(`btn-${name}`, FACE_INDEX[face]))
      .setScale(SPRITE_SCALE)
      .setScrollFactor(0)
      .setDepth(DEPTH.TOUCH_BUTTON)
      .setAlpha(IDLE_ALPHA);
    const image = make('up');
    const fill = withFill ? make('up').setVisible(false) : null;
    const button: Button = { name, image, fill, shown: false, held: false, flashing: false };
    if (onTap) {
      // Hit areas are in frame texels: the plate's middle is texel (32, 31)
      image.setInteractive(new Phaser.Geom.Circle(image.width / 2, PLATE_TOP + PLATE_ROWS / 2, PLATE_ROWS / 2 + HIT_PAD / SPRITE_SCALE), Phaser.Geom.Circle.Contains);
      image.on('pointerdown', () => {
        if (!button.shown || this.callbacks.isDisabled()) return;
        this.press(button);
        onTap();
      });
      image.on('pointerup', () => this.release(button));
      image.on('pointerupoutside', () => this.release(button));
    }
    return button;
  }

  private parts(button: Button): Phaser.GameObjects.Image[] {
    return button.fill ? [button.image, button.fill] : [button.image];
  }

  /** The cap sinks and the button shrinks a hair... */
  private press(button: Button): void {
    button.held = true;
    this.refresh(button);
    this.scene.tweens.killTweensOf(this.parts(button));
    this.scene.tweens.add({ targets: this.parts(button), scale: SPRITE_SCALE * 0.95, duration: 60, ease: 'Quad.easeOut' });
  }

  /** ...and comes back with a little overshoot. */
  private release(button: Button): void {
    if (!button.held) return;
    button.held = false;
    this.refresh(button);
    this.pop(button);
  }

  private pop(button: Button): void {
    this.scene.tweens.killTweensOf(this.parts(button));
    this.scene.tweens.add({ targets: this.parts(button), scale: SPRITE_SCALE, duration: 150, ease: 'Back.easeOut' });
  }

  /** Picks the face: the dash is grey while it recharges, lit for a moment when ready, otherwise up or down. */
  private refresh(button: Button): void {
    const cooling = button.name === 'dash' && this.charge < 1;
    const face: Face = cooling ? 'cool' : button.flashing ? 'flash' : button.held ? 'down' : 'up';
    button.image.setFrame(frameOf(`btn-${button.name}`, FACE_INDEX[face])).setAlpha(face === 'down' || face === 'flash' ? 1 : IDLE_ALPHA);
    const fill = button.fill;
    if (!fill) return;
    fill.setVisible(button.shown && cooling && this.charge > 0);
    if (cooling) {
      // Whole texel rows, from the plate's bottom up
      const rows = Math.max(1, Math.round(PLATE_ROWS * this.charge));
      fill.setCrop(0, PLATE_TOP + PLATE_ROWS - rows, fill.width, rows);
    }
  }

  /** Visible buttons stand in a row from the bottom-right corner; hidden ones leave no gap and take no taps. */
  private place(): void {
    for (const button of [this.lane, this.dash, this.gun]) {
      if (!button) continue;
      for (const part of this.parts(button)) part.setVisible(button.shown);
      this.refresh(button);
    }
    let slot = 0;
    for (const button of [this.dash, this.gun]) {
      if (!button?.shown) continue;
      const x = this.width - BTN_MARGIN - BTN_RADIUS - slot * (BTN_RADIUS * 2 + BTN_GAP);
      for (const part of this.parts(button)) part.setX(x);
      slot++;
    }
  }
}
