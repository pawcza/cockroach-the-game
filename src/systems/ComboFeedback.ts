import { COMBO_TIERS } from '../config/constants';
import { NotificationManager } from './NotificationManager';

export class ComboFeedback {
  private notifications: NotificationManager;
  private lastTier = -1;

  constructor(notifications: NotificationManager) {
    this.notifications = notifications;
  }

  onPickup(combo: number): typeof COMBO_TIERS[number] | null {
    const tier = this.getCurrentTier(combo);
    if (tier === null || tier === this.lastTier) return null;
    this.lastTier = tier;
    this.notifications.showComboTier(COMBO_TIERS[tier].threshold, COMBO_TIERS[tier].label, COMBO_TIERS[tier].color);
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
}
