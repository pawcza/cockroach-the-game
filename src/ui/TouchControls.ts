import Phaser from 'phaser';

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
    const btnRadius = 25;
    const btnMargin = 11;
    const btnCenterY = sh - btnMargin - btnRadius;

    // SWAP button -- bottom-left circle
    this.touchSwapBtn = this.scene.add.circle(
      btnMargin + btnRadius, btnCenterY, btnRadius, 0xff6600, 0.5,
    )
      .setScrollFactor(0)
      .setDepth(3000)
      .setInteractive();

    this.touchSwapLabel = this.scene.add.text(
      btnMargin + btnRadius, btnCenterY, '\u21c5', {
        fontSize: '14px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#ff6600',
        stroke: '#000000',
        strokeThickness: 3,
      },
    )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(3001);

    this.touchSwapBtn.on('pointerdown', () => {
      if (this.callbacks.isDisabled()) return;
      this.callbacks.onSwap();
    });

    // DASH button -- bottom-right circle
    this.dashCircle = this.scene.add.circle(
      sw - btnMargin - btnRadius, btnCenterY, btnRadius, 0x00ffff, 0.5,
    )
      .setScrollFactor(0)
      .setDepth(3000)
      .setInteractive();

    // Invisible rectangle just to satisfy type for touchDashBtn (used in update loop)
    this.touchDashBtn = this.scene.add.rectangle(0, 0, 1, 1, 0x000000, 0)
      .setVisible(false);

    this.touchDashLabel = this.scene.add.text(
      sw - btnMargin - btnRadius, btnCenterY, '\u25b6', {
        fontSize: '14px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#00ffff',
        stroke: '#000000',
        strokeThickness: 3,
      },
    )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(3001);

    // Store circle ref for color updates
    this.touchDashBtn.setData('circle', this.dashCircle);

    this.dashCircle.on('pointerdown', () => {
      if (this.callbacks.isDisabled()) return;
      if (this.callbacks.isDashAllowed()) {
        this.callbacks.onDash();
      }
    });
  }

  private createDesktopUI(sw: number, sh: number): void {
    this.touchSwapBtn = this.scene.add.circle(0, 0, 1, 0x000000, 0).setVisible(false) as Phaser.GameObjects.Arc;
    this.touchSwapLabel = this.scene.add.text(0, 0, '').setVisible(false);

    this.touchDashBtn = this.scene.add.rectangle(
      sw - 44, sh - 44, 56, 56, 0x00ffff, 0.4,
    )
      .setScrollFactor(0)
      .setDepth(3000)
      .setAlpha(0.3)
      .setInteractive();

    this.touchDashLabel = this.scene.add.text(
      sw - 44, sh - 44, 'DASH', {
        fontSize: '8px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#00ffff',
        stroke: '#000000',
        strokeThickness: 2,
      },
    )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(3001)
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
