import Phaser from 'phaser';

export class PauseOverlay {
  private scene: Phaser.Scene;
  private isMobile: boolean;
  private onTogglePause: () => void;

  private overlay!: Phaser.GameObjects.Rectangle;
  private pauseText!: Phaser.GameObjects.Text;
  private pauseSubtext!: Phaser.GameObjects.Text;
  private touchPauseBtn!: Phaser.GameObjects.Arc;
  private touchPauseBtnLabel!: Phaser.GameObjects.Text;
  private cricketSound: Phaser.Sound.BaseSound | null = null;
  private pauseTweens: Phaser.Tweens.Tween[] = [];

  constructor(scene: Phaser.Scene, isMobile: boolean, onTogglePause: () => void) {
    this.scene = scene;
    this.isMobile = isMobile;
    this.onTogglePause = onTogglePause;
  }

  get pauseButton(): Phaser.GameObjects.Arc {
    return this.touchPauseBtn;
  }

  create(): void {
    const w = this.scene.cameras.main.width;
    const h = this.scene.cameras.main.height;
    const m = this.isMobile;

    // Pause UI — depth above touch controls (3000) so overlay covers buttons
    this.overlay = this.scene.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.6)
      .setScrollFactor(0).setDepth(4001).setVisible(false)
      .setInteractive();
    this.overlay.on('pointerdown', () => {
      this.onTogglePause();
    });
    this.pauseText = this.scene.add.text(w / 2, h / 2 - 15, 'PAUZKA!', {
      fontSize: m ? '28px' : '24px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(4002).setVisible(false);
    this.pauseSubtext = this.scene.add.text(w / 2, h / 2 + 20, 'Wciśnij cokolwiek, po to by grać dalej', {
      fontSize: m ? '9px' : '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#aaaaaa',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(4002).setVisible(false);

    // Pause button -- circular, top-right
    const pauseR = m ? 30 : 18;
    const pauseX = w - pauseR - 12;
    const pauseY = pauseR + 12;
    this.touchPauseBtn = this.scene.add.circle(pauseX, pauseY, pauseR, 0x888888, m ? 0.35 : 0.2)
      .setScrollFactor(0)
      .setDepth(5000)
      .setInteractive();

    this.touchPauseBtnLabel = this.scene.add.text(pauseX, pauseY, '\u23f8', {
      fontSize: m ? '18px' : '12px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(5001)
      .setAlpha(m ? 0.7 : 0.4);

    this.touchPauseBtn.on('pointerdown', () => {
      this.onTogglePause();
    });
  }

  show(): void {
    const h = this.scene.cameras.main.height;

    this.overlay.setVisible(true);
    this.pauseText.setVisible(true);
    this.pauseSubtext.setVisible(true);

    // Animate title: scale in from 0 + floating bob
    this.pauseText.setScale(0);
    this.pauseText.setAlpha(0);
    this.pauseTweens.push(
      this.scene.tweens.add({
        targets: this.pauseText,
        scale: 1,
        alpha: 1,
        duration: 300,
        ease: 'Back.easeOut',
        onComplete: () => {
          // Floating bob like menu title
          this.pauseTweens.push(
            this.scene.tweens.add({
              targets: this.pauseText,
              y: h / 2 - 25,
              duration: 1500,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeInOut',
            }),
          );
        },
      }),
    );

    // Animate subtext: fade in with slight delay + pulsing alpha
    this.pauseSubtext.setAlpha(0);
    this.pauseTweens.push(
      this.scene.tweens.add({
        targets: this.pauseSubtext,
        alpha: 1,
        duration: 400,
        delay: 200,
        ease: 'Power2',
        onComplete: () => {
          this.pauseTweens.push(
            this.scene.tweens.add({
              targets: this.pauseSubtext,
              alpha: 0.4,
              duration: 800,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeInOut',
            }),
          );
          // Gentle rotation oscillation like menu subtitle
          this.pauseSubtext.setAngle(-2);
          this.pauseTweens.push(
            this.scene.tweens.add({
              targets: this.pauseSubtext,
              angle: 2,
              duration: 2000,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeInOut',
            }),
          );
        },
      }),
    );

    // Cricket ambient sound
    if (!this.cricketSound) {
      this.cricketSound = this.scene.sound.add('cricket', { volume: 0.4, loop: true });
    }
    this.cricketSound.play();
  }

  hide(): void {
    const h = this.scene.cameras.main.height;

    // Kill all pause tweens and reset positions
    for (const tween of this.pauseTweens) {
      tween.destroy();
    }
    this.pauseTweens = [];

    this.overlay.setVisible(false);
    this.pauseText.setVisible(false).setY(h / 2 - 15).setScale(1).setAlpha(1);
    this.pauseSubtext.setVisible(false).setAngle(0).setAlpha(1);

    if (this.cricketSound) {
      this.cricketSound.stop();
    }
  }
}
