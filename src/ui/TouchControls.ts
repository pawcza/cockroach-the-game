import Phaser from 'phaser';
import { DEPTH } from '../config/constants';
import { popupStyle } from '../utils/TextStyles';

export interface TouchControlCallbacks {
  onSwap: () => void;
  onDash: () => void;
  isDisabled: () => boolean;
  isDashAllowed: () => boolean;
}

const BTN_RADIUS = 50;
const BTN_MARGIN = 16;

export class TouchControls {
  private scene: Phaser.Scene;
  private isMobile: boolean;
  private callbacks: TouchControlCallbacks;

  // Mobile only
  private swapZone: Phaser.GameObjects.Rectangle | null = null;
  private dashZone: Phaser.GameObjects.Rectangle | null = null;
  private dashCircle: Phaser.GameObjects.Arc | null = null;
  private dashLabel: Phaser.GameObjects.Text | null = null;

  constructor(scene: Phaser.Scene, isMobile: boolean, callbacks: TouchControlCallbacks) {
    this.scene = scene;
    this.isMobile = isMobile;
    this.callbacks = callbacks;
  }

  create(): void {
    if (!this.isMobile) return;

    const { width: sw, height: sh } = this.scene.cameras.main;

    // SWAP: invisible zone covering left 50% of screen
    this.swapZone = this.scene.add.rectangle(0, 0, sw / 2, sh, 0x000000, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.TOUCH_ZONE)
      .setInteractive();

    this.swapZone.on('pointerdown', () => {
      if (this.callbacks.isDisabled()) return;
      this.callbacks.onSwap();
    });

    // SWAP button -- bottom-left circle (visual only)
    this.scene.add.circle(BTN_MARGIN + BTN_RADIUS, sh - BTN_MARGIN - BTN_RADIUS, BTN_RADIUS, 0xff6600, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.TOUCH_BUTTON);

    this.scene.add.text(
      BTN_MARGIN + BTN_RADIUS, sh - BTN_MARGIN - BTN_RADIUS, '\u21c5',
      popupStyle({ fontSize: '28px', color: '#ff6600', strokeThickness: 4 }),
    )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.TOUCH_LABEL);

    // DASH: invisible zone covering right 50% of screen
    this.dashZone = this.scene.add.rectangle(sw / 2, 0, sw / 2, sh, 0x000000, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.TOUCH_ZONE)
      .setInteractive();

    this.dashZone.on('pointerdown', () => {
      if (this.callbacks.isDisabled()) return;
      if (this.callbacks.isDashAllowed()) {
        this.callbacks.onDash();
      }
    });

    // DASH button -- bottom-right circle (visual only)
    this.dashCircle = this.scene.add.circle(sw - BTN_MARGIN - BTN_RADIUS, sh - BTN_MARGIN - BTN_RADIUS, BTN_RADIUS, 0x00ffff, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.TOUCH_BUTTON);

    this.dashLabel = this.scene.add.text(
      sw - BTN_MARGIN - BTN_RADIUS, sh - BTN_MARGIN - BTN_RADIUS, '\u25b6',
      popupStyle({ fontSize: '28px', color: '#00ffff', strokeThickness: 4 }),
    )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.TOUCH_LABEL);
  }

  layout(width: number, height: number): void {
    if (!this.swapZone || !this.dashZone) return;
    for (const zone of [this.swapZone, this.dashZone]) {
      zone.setSize(width / 2, height);
      (zone.input!.hitArea as Phaser.Geom.Rectangle).setSize(width / 2, height);
    }
    this.dashZone.x = width / 2;
    const dashX = width - BTN_MARGIN - BTN_RADIUS;
    this.dashCircle?.setX(dashX);
    this.dashLabel?.setX(dashX);
  }
}
