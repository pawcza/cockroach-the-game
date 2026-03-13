import Phaser from 'phaser';
import { DEPTH } from '../config/constants';
import { popupStyle } from '../utils/TextStyles';

export interface TouchControlCallbacks {
  onSwap: () => void;
  onDash: () => void;
  isDisabled: () => boolean;
  isDashAllowed: () => boolean;
}

export class TouchControls {
  private scene: Phaser.Scene;
  private isMobile: boolean;
  private callbacks: TouchControlCallbacks;

  private touchDashBtn!: Phaser.GameObjects.Rectangle;
  private touchDashLabel!: Phaser.GameObjects.Text;
  private touchSwapBtn!: Phaser.GameObjects.Arc;
  private touchSwapLabel!: Phaser.GameObjects.Text;

  // On mobile, the dash circle is separate from the invisible rect
  private dashCircle: Phaser.GameObjects.Arc | null = null;

  constructor(scene: Phaser.Scene, isMobile: boolean, callbacks: TouchControlCallbacks) {
    this.scene = scene;
    this.isMobile = isMobile;
    this.callbacks = callbacks;
  }

  get dashButton(): Phaser.GameObjects.Rectangle {
    return this.touchDashBtn;
  }

  get dashLabel(): Phaser.GameObjects.Text {
    return this.touchDashLabel;
  }

  get swapButton(): Phaser.GameObjects.Arc {
    return this.touchSwapBtn;
  }

  create(): void {
    const sw = this.scene.cameras.main.width;
    const sh = this.scene.cameras.main.height;

    if (this.isMobile) {
      this.createMobileUI(sw, sh);
    } else {
      this.createDesktopUI(sw, sh);
    }
  }

  private createMobileUI(sw: number, sh: number): void {
    const btnRadius = 50;
    const btnMargin = 16;
    const btnCenterY = sh - btnMargin - btnRadius;

    // SWAP: invisible zone covering left 50% of screen
    const swapZone = this.scene.add.rectangle(0, 0, sw / 2, sh, 0x000000, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.TOUCH_ZONE)
      .setInteractive();

    swapZone.on('pointerdown', () => {
      if (this.callbacks.isDisabled()) return;
      this.callbacks.onSwap();
    });

    // SWAP button -- bottom-left circle (visual only)
    this.touchSwapBtn = this.scene.add.circle(
      btnMargin + btnRadius, btnCenterY, btnRadius, 0xff6600, 0.5,
    )
      .setScrollFactor(0)
      .setDepth(DEPTH.TOUCH_BUTTON);

    this.touchSwapLabel = this.scene.add.text(
      btnMargin + btnRadius, btnCenterY, '\u21c5',
      popupStyle({ fontSize: '28px', color: '#ff6600', strokeThickness: 4 }),
    )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.TOUCH_LABEL);

    // DASH: invisible zone covering right 50% of screen
    const dashZone = this.scene.add.rectangle(sw / 2, 0, sw / 2, sh, 0x000000, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.TOUCH_ZONE)
      .setInteractive();

    dashZone.on('pointerdown', () => {
      if (this.callbacks.isDisabled()) return;
      if (this.callbacks.isDashAllowed()) {
        this.callbacks.onDash();
      }
    });

    // DASH button -- bottom-right circle (visual only)
    this.dashCircle = this.scene.add.circle(
      sw - btnMargin - btnRadius, btnCenterY, btnRadius, 0x00ffff, 0.5,
    )
      .setScrollFactor(0)
      .setDepth(DEPTH.TOUCH_BUTTON);

    // Invisible rectangle just to satisfy type for touchDashBtn (used in update loop)
    this.touchDashBtn = this.scene.add.rectangle(0, 0, 1, 1, 0x000000, 0)
      .setVisible(false);

    this.touchDashLabel = this.scene.add.text(
      sw - btnMargin - btnRadius, btnCenterY, '\u25b6',
      popupStyle({ fontSize: '28px', color: '#00ffff', strokeThickness: 4 }),
    )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.TOUCH_LABEL);

    // Store circle ref for color updates
    this.touchDashBtn.setData('circle', this.dashCircle);
  }

  private createDesktopUI(sw: number, sh: number): void {
    this.touchSwapBtn = this.scene.add.circle(0, 0, 1, 0x000000, 0).setVisible(false) as Phaser.GameObjects.Arc;
    this.touchSwapLabel = this.scene.add.text(0, 0, '').setVisible(false);

    this.touchDashBtn = this.scene.add.rectangle(
      sw - 44, sh - 44, 56, 56, 0x00ffff, 0.4,
    )
      .setScrollFactor(0)
      .setDepth(DEPTH.TOUCH_BUTTON)
      .setAlpha(0.3)
      .setInteractive();

    this.touchDashLabel = this.scene.add.text(
      sw - 44, sh - 44, 'DASH',
      popupStyle({ fontSize: '8px', color: '#00ffff', strokeThickness: 2 }),
    )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.TOUCH_LABEL)
      .setAlpha(0.3);

    this.touchDashBtn.on('pointerdown', () => {
      if (this.callbacks.isDisabled()) return;
      if (this.callbacks.isDashAllowed()) {
        this.callbacks.onDash();
      }
    });
  }

  updateDashState(dashReady: boolean, isDashing: boolean): void {
    const circle = this.touchDashBtn.getData('circle') as Phaser.GameObjects.Arc | null;
    if (dashReady) {
      this.touchDashBtn.setFillStyle(0x00ffff, 0.4);
      if (circle) circle.setFillStyle(0x00ffff, 0.5);
      this.touchDashLabel.setColor('#00ffff');
    } else if (isDashing) {
      this.touchDashBtn.setFillStyle(0xffffff, 0.4);
      if (circle) circle.setFillStyle(0xffffff, 0.5);
      this.touchDashLabel.setColor('#ffffff');
    } else {
      this.touchDashBtn.setFillStyle(0xff6600, 0.4);
      if (circle) circle.setFillStyle(0xff6600, 0.3);
      this.touchDashLabel.setColor('#ff6600');
    }
  }
}
