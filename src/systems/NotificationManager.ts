import Phaser from 'phaser';
import { DEPTH } from '../config/constants';
import { popupStyle } from '../utils/TextStyles';

interface ActiveNotification {
  objects: Phaser.GameObjects.GameObject[];
  startTime: number;
  duration: number;
  slot: number;
}

const SLOT_Y_START = 55;
const SLOT_HEIGHT = 30;
const MAX_SLOTS = 3;

export class NotificationManager {
  private scene: Phaser.Scene;
  private active: ActiveNotification[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  private getNextSlot(): number {
    const usedSlots = new Set(this.active.map(a => a.slot));
    for (let i = 0; i < MAX_SLOTS; i++) {
      if (!usedSlots.has(i)) return i;
    }
    return 0;
  }

  private slotY(slot: number): number {
    return SLOT_Y_START + slot * SLOT_HEIGHT;
  }

  showComboTier(threshold: number, label: string, color: number): void {
    const w = this.scene.cameras.main.width;
    const slot = this.getNextSlot();
    const y = this.slotY(slot);
    const colorStr = '#' + color.toString(16).padStart(6, '0');

    const text = this.scene.add.text(w / 2, y, `x${threshold} ${label}`,
      popupStyle({ fontSize: '12px', color: colorStr }),
    ).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.POPUP).setAlpha(0).setScale(0.5);

    const duration = 1200;

    this.scene.tweens.add({
      targets: text,
      alpha: 1,
      scale: 1,
      duration: 200,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: text,
          y: y - 15,
          alpha: 0,
          scale: 1.2,
          duration: duration - 200,
          delay: 300,
          ease: 'Power2',
          onComplete: () => {
            text.destroy();
            this.removeNotification(notif);
          },
        });
      },
    });

    const notif: ActiveNotification = { objects: [text], startTime: this.scene.time.now, duration, slot };
    this.active.push(notif);
  }

  private removeNotification(notif: ActiveNotification): void {
    const idx = this.active.indexOf(notif);
    if (idx !== -1) this.active.splice(idx, 1);
  }
}
