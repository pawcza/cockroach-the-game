import Phaser from 'phaser';
import { popup } from '../effects/Popup';
import { popupStyle } from '../utils/TextStyles';

interface ActiveNotification {
  objects: Phaser.GameObjects.GameObject[];
  startTime: number;
  duration: number;
  slot: number;
  /** Pushed down below a score milestone that is up. */
  shift: number;
}

const SLOT_Y_START = 55;
const SLOT_HEIGHT = 30;
const MAX_SLOTS = 3;
const MILESTONE_GAP = 18;

export class NotificationManager {
  private scene: Phaser.Scene;
  private active: ActiveNotification[] = [];
  private milestoneShift = 0;
  private milestoneUntil = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    // A score milestone owns the band under the score for as long as it shows: notices below it, new or already up
    const onMilestone = (bottom: number, duration: number): void => {
      this.milestoneShift = bottom + MILESTONE_GAP - SLOT_Y_START;
      this.milestoneUntil = scene.time.now + duration;
      for (const notif of this.active) {
        // Already up: move it now (a hold between the rise and the exit has nothing running to do it)
        const delta = this.milestoneShift - notif.shift;
        notif.shift = this.milestoneShift;
        for (const part of notif.objects) (part as Phaser.GameObjects.Image).y += delta;
      }
    };
    scene.events.on('score-milestone', onMilestone);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off('score-milestone', onMilestone));
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

  /** A new combo tier on its slab at the top of the screen, a light sweeping across it. */
  showComboTier(threshold: number, label: string, color: number): void {
    const w = this.scene.cameras.main.width;
    const slot = this.getNextSlot();
    const colorStr = '#' + color.toString(16).padStart(6, '0');

    const notif: ActiveNotification = {
      objects: [], startTime: this.scene.time.now, duration: 1200, slot,
      shift: this.scene.time.now < this.milestoneUntil ? this.milestoneShift : 0,
    };
    const parts = popup(this.scene, w / 2, this.slotY(slot), `x${threshold} ${label}`,
      popupStyle({ fontSize: '12px', color: colorStr }), { scrollFactor: 0, hold: 800, shine: true, yOffset: () => notif.shift });
    notif.objects = parts;
    this.active.push(notif);
    parts[parts.length - 1].once(Phaser.GameObjects.Events.DESTROY, () => this.removeNotification(notif));
  }

  private removeNotification(notif: ActiveNotification): void {
    const idx = this.active.indexOf(notif);
    if (idx !== -1) this.active.splice(idx, 1);
  }
}
