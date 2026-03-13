import Phaser from 'phaser';

/**
 * Manages the pre-game countdown (3, 2, 1, JAZDA!) and the
 * unpause countdown display.
 */
export class CountdownManager {
  private scene: Phaser.Scene;

  // Pre-game countdown
  private countdownStartReal = 0;
  private countdownLastShown = -1;

  // Unpause countdown
  private unpauseCountdownStart = 0;
  private unpauseCountdownLastShown = -1;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  startCountdown(): void {
    this.countdownStartReal = performance.now();
    this.countdownLastShown = -1;
  }

  /** Returns true when the countdown has finished. */
  updateCountdown(): boolean {
    const elapsed = performance.now() - this.countdownStartReal;
    const countdownTexts = ['3', '2', '1', 'JAZDA!'];
    const step = Math.floor(elapsed / 600);

    if (step < countdownTexts.length && step > this.countdownLastShown) {
      this.countdownLastShown = step;
      const text = countdownTexts[step];
      const countText = this.scene.add.text(this.scene.cameras.main.width / 2, this.scene.cameras.main.height / 2 - 30, text, {
        fontSize: text === 'JAZDA!' ? '24px' : '32px',
        fontFamily: '"Press Start 2P", monospace',
        color: text === 'JAZDA!' ? '#00ff00' : '#ffffff',
        stroke: '#000000',
        strokeThickness: 6,
      });
      countText.setOrigin(0.5);
      countText.setScrollFactor(0);
      countText.setDepth(1000);
      this.scene.tweens.add({
        targets: countText,
        scale: { from: 2, to: 0.5 },
        alpha: { from: 1, to: 0 },
        duration: 500,
        ease: 'Power2',
        onComplete: () => countText.destroy(),
      });
    }

    return elapsed >= countdownTexts.length * 600;
  }

  startUnpauseCountdown(): void {
    this.unpauseCountdownStart = performance.now();
    this.unpauseCountdownLastShown = -1;
  }

  /** Returns true when the unpause countdown has finished. */
  updateUnpauseCountdown(): boolean {
    const elapsed = performance.now() - this.unpauseCountdownStart;
    const steps = ['3', '2', '1', 'JAZDA!'];
    const step = Math.floor(elapsed / 600);

    if (step < steps.length && step > this.unpauseCountdownLastShown) {
      this.unpauseCountdownLastShown = step;
      const text = steps[step];
      const countText = this.scene.add.text(
        this.scene.cameras.main.width / 2, this.scene.cameras.main.height / 2 - 30, text, {
          fontSize: text === 'JAZDA!' ? '24px' : '32px',
          fontFamily: '"Press Start 2P", monospace',
          color: text === 'JAZDA!' ? '#00ff00' : '#ffffff',
          stroke: '#000000',
          strokeThickness: 6,
        },
      );
      countText.setOrigin(0.5).setScrollFactor(0).setDepth(4003);
      this.scene.tweens.add({
        targets: countText,
        scale: { from: 2, to: 0.5 },
        alpha: { from: 1, to: 0 },
        duration: 500,
        ease: 'Power2',
        onComplete: () => countText.destroy(),
      });
    }

    return elapsed >= steps.length * 600;
  }
}
