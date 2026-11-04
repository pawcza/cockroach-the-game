/** The 3-2-1 countdown that opens every run; measured in real time, not game time. */
import Phaser from 'phaser';
import { DEPTH } from '../config/constants';
import { popupStyle } from '../utils/TextStyles';

const STEP_MS = 600;

const STEPS = ['3', '2', '1', 'JAZDA!'];
/** A retry already knows the drill. */
const QUICK_STEPS = ['JAZDA!'];

export class RunCountdown {
  private scene: Phaser.Scene;
  private onFinished: () => void;
  private startReal: number;
  private lastShown = -1;
  private steps: string[];

  /** `endsAt` (Date.now time) pins when it finishes; a client that gets here late joins it partway. */
  constructor(scene: Phaser.Scene, onFinished: () => void, quick = false, endsAt?: number) {
    this.scene = scene;
    this.onFinished = onFinished;
    this.steps = quick ? QUICK_STEPS : STEPS;
    this.startReal = endsAt !== undefined ? endsAt - this.steps.length * STEP_MS : Date.now();
  }

  /** When it finishes, in Date.now time. */
  get endsAt(): number {
    return this.startReal + this.steps.length * STEP_MS;
  }

  update(): void {
    const elapsed = Date.now() - this.startReal;
    const step = Math.floor(elapsed / STEP_MS);

    if (step < this.steps.length && step > this.lastShown) {
      this.lastShown = step;
      this.showStep(this.steps[step]);
    }

    if (elapsed >= this.steps.length * STEP_MS) {
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
