import Phaser from 'phaser';
import { LevelConfig } from '../config/levels';

export class MilestoneDisplay {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  showLevelAnnouncement(config: LevelConfig): void {
    const w = this.scene.cameras.main.width;

    const levelLabel = `POZIOM ${config.level}`;
    const nameLabel = config.name.toUpperCase();

    const levelText = this.scene.add.text(w / 2, 60, levelLabel, {
      fontSize: '12px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#ffff00',
      stroke: '#000000',
      strokeThickness: 4,
    });
    levelText.setOrigin(0.5);
    levelText.setScrollFactor(0);
    levelText.setDepth(1000);
    levelText.setScale(0.5);
    levelText.setAlpha(0);

    const nameText = this.scene.add.text(w / 2, 95, nameLabel, {
      fontSize: '18px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 6,
      shadow: {
        offsetX: 2,
        offsetY: 2,
        color: '#ff6600',
        blur: 8,
        fill: true,
        stroke: true,
      },
    });
    nameText.setOrigin(0.5);
    nameText.setScrollFactor(0);
    nameText.setDepth(1000);
    nameText.setScale(0.5);
    nameText.setAlpha(0);

    this.scene.tweens.add({
      targets: [levelText, nameText],
      scale: 1,
      alpha: 1,
      duration: 300,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: [levelText, nameText],
          alpha: 0,
          scale: 1.3,
          duration: 500,
          delay: 1500,
          ease: 'Power2',
          onComplete: () => {
            levelText.destroy();
            nameText.destroy();
          },
        });
      },
    });

    this.scene.cameras.main.shake(200, 0.01);
  }

  showScoreMilestone(text: string, tier: number, threshold: number): void {
    const w = this.scene.cameras.main.width;
    const h = this.scene.cameras.main.height;

    // Tier determines epicness: size, color, shake, duration
    const tierConfig = [
      { numSize: '24px', textSize: '10px', color: '#ffff00', stroke: 3, numStroke: 4, shake: 0.005, duration: 2000, scale: 1.3 },
      { numSize: '32px', textSize: '12px', color: '#ff8800', stroke: 4, numStroke: 5, shake: 0.008, duration: 2500, scale: 1.5 },
      { numSize: '40px', textSize: '14px', color: '#ff4400', stroke: 4, numStroke: 6, shake: 0.012, duration: 3000, scale: 1.6 },
      { numSize: '48px', textSize: '16px', color: '#ff00ff', stroke: 5, numStroke: 7, shake: 0.018, duration: 3500, scale: 1.8 },
      { numSize: '56px', textSize: '20px', color: '#ffffff', stroke: 6, numStroke: 8, shake: 0.025, duration: 4000, scale: 2.0 },
    ];
    const cfg = tierConfig[Math.min(tier - 1, tierConfig.length - 1)];

    // Big score number in the center
    const numText = this.scene.add.text(w / 2, h / 2 - 20, String(threshold), {
      fontSize: cfg.numSize,
      fontFamily: '"Press Start 2P", monospace',
      color: cfg.color,
      stroke: '#000000',
      strokeThickness: cfg.numStroke,
    });
    numText.setOrigin(0.5);
    numText.setScrollFactor(0);
    numText.setDepth(998);
    numText.setAlpha(0);
    numText.setScale(3);

    // Subtitle text below the number
    const milestone = this.scene.add.text(w / 2, h / 2 + 25, text, {
      fontSize: cfg.textSize,
      fontFamily: '"Press Start 2P", monospace',
      color: cfg.color,
      stroke: '#000000',
      strokeThickness: cfg.stroke,
    });
    milestone.setOrigin(0.5);
    milestone.setScrollFactor(0);
    milestone.setDepth(999);
    milestone.setAlpha(0);
    milestone.setScale(0.3);

    // Number slam in (big -> normal with overshoot)
    this.scene.tweens.add({
      targets: numText,
      alpha: { from: 0, to: 0.4 + tier * 0.12 },
      scale: 1,
      duration: 400,
      ease: 'Back.easeOut',
      onComplete: () => {
        // Pulse
        this.scene.tweens.add({
          targets: numText,
          scale: { from: 1, to: 1.05 + tier * 0.02 },
          duration: 300,
          yoyo: true,
          repeat: Math.floor(cfg.duration / 600) - 1,
          ease: 'Sine.easeInOut',
        });
        // Fade out
        this.scene.tweens.add({
          targets: numText,
          alpha: 0,
          scale: cfg.scale * 1.5,
          duration: 1000,
          delay: cfg.duration - 1000,
          ease: 'Power2',
          onComplete: () => numText.destroy(),
        });
      },
    });

    // Text slam in
    this.scene.tweens.add({
      targets: milestone,
      alpha: 1,
      scale: 1,
      duration: 300,
      delay: 150,
      ease: 'Back.easeOut',
      onComplete: () => {
        // Wobble hold
        this.scene.tweens.add({
          targets: milestone,
          angle: { from: -2 * tier, to: 2 * tier },
          duration: 100,
          yoyo: true,
          repeat: Math.floor(cfg.duration / 200) - 1,
          ease: 'Sine.easeInOut',
        });
        // Fade out
        this.scene.tweens.add({
          targets: milestone,
          alpha: 0,
          scale: cfg.scale,
          y: milestone.y - 30,
          duration: 800,
          delay: cfg.duration - 800,
          ease: 'Power2',
          onComplete: () => milestone.destroy(),
        });
      },
    });

    this.scene.cameras.main.shake(300, cfg.shake);
  }
}
