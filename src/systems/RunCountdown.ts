/** The 3-2-1 countdown that opens every run; measured in real time, not game time. */
import Phaser from 'phaser';
import { DEPTH } from '../config/constants';
import { popupStyle } from '../utils/TextStyles';

const STEP_MS = 600;
const STEPS = ['3', '2', '1', 'JAZDA!'];

export class RunCountdown {
  private scene: Phaser.Scene;
  private onFinished: () => void;
  private startReal = performance.now();
  private lastShown = -1;

  constructor(scene: Phaser.Scene, onFinished: () => void) {
    this.scene = scene;
    this.onFinished = onFinished;
  }

  update(): void {
    const elapsed = performance.now() - this.startReal;
    const step = Math.floor(elapsed / STEP_MS);

    if (step < STEPS.length && step > this.lastShown) {
      this.lastShown = step;
      this.showStep(STEPS[step]);
    }

    if (elapsed >= STEPS.length * STEP_MS) {
      this.onFinished();
    }
  }

  private showStep(text: string): void {
    const camera = this.scene.cameras.main;
    const isGo = text === 'JAZDA!';
    const countText = this.scene.add.text(camera.width / 2, camera.height / 2 - 30, text,
      popupStyle({ fontSize: isGo ? '24px' : '32px', color: isGo ? '#00ff00' : '#ffffff', strokeThickness: 6 }),
    );
    countText.setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.COUNTDOWN);
    this.scene.tweens.add({
      targets: countText,
      scale: { from: 2, to: 0.5 },
      alpha: { from: 1, to: 0 },
      duration: 500,
      ease: 'Power2',
      onComplete: () => countText.destroy(),
    });
  }
}
