import Phaser from 'phaser';
import { COMBO_TIERS, DEPTH } from '../config/constants';
import { popupStyle } from '../utils/TextStyles';

export class ComboFeedback {
  private scene: Phaser.Scene;
  private lastTier = -1;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  onPickup(combo: number): typeof COMBO_TIERS[number] | null {
    const tier = this.getCurrentTier(combo);
    if (tier === null || tier === this.lastTier) return null;
    this.lastTier = tier;
    this.showTierPopup(COMBO_TIERS[tier]);
    return COMBO_TIERS[tier];
  }

  onComboLost(): void {
    this.lastTier = -1;
  }

  private getCurrentTier(combo: number): number | null {
    for (let i = COMBO_TIERS.length - 1; i >= 0; i--) {
      if (combo >= COMBO_TIERS[i].threshold) return i;
    }
    return null;
  }

  private showTierPopup(tier: typeof COMBO_TIERS[number]): void {
    const cam = this.scene.cameras.main;
    const text = this.scene.add.text(
      cam.width / 2, cam.height * 0.35,
      `x${tier.threshold} ${tier.label}`,
      popupStyle({ fontSize: '14px', color: '#' + tier.color.toString(16).padStart(6, '0') }),
    ).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.POPUP);

    this.scene.tweens.add({
      targets: text,
      y: text.y - 30,
      alpha: 0,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 1200,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });
  }
}
