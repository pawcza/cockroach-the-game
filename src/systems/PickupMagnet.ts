/** Vacuums pickups toward the player while the pill effect is active, and once more, all of them, as it ends. */
import Phaser from 'phaser';
import { Player } from '../objects/Player';

const MAGNET_RANGE = 600;

/**
 * When the pill wears off, every pickup on screen flies into the roach over this long, so the pill ends on a feast
 * rather than leaving apples stuck behind obstacles at top speed. It lands inside the post-pill invulnerability.
 */
const FINAL_SWEEP_MS = 300;

export class PickupMagnet {
  private scene: Phaser.Scene;
  private player: Player;
  private groups: Phaser.Physics.Arcade.Group[];
  private wasPillActive = false;
  private sweepEndsAt = 0;
  private swept = new Set<Phaser.Physics.Arcade.Sprite>();

  constructor(scene: Phaser.Scene, player: Player, groups: Phaser.Physics.Arcade.Group[]) {
    this.scene = scene;
    this.player = player;
    this.groups = groups;
  }

  update(): void {
    const pillActive = this.player.isPillActive;
    if (this.wasPillActive && !pillActive && !this.player.isDead) this.startFinalSweep();
    this.wasPillActive = pillActive;

    if (pillActive) this.pullNearby();
    if (this.swept.size > 0) this.sweep();
  }

  private pickups(): Phaser.Physics.Arcade.Sprite[] {
    return this.groups.flatMap(group => group.getChildren() as Phaser.Physics.Arcade.Sprite[]);
  }

  /** Moves a pickup and its body together, so overlap collection still works. Its float tween would fight the move. */
  private moveTo(pickup: Phaser.Physics.Arcade.Sprite, x: number, y: number): void {
    if (!pickup.getData('_vacuumed')) {
      pickup.setData('_vacuumed', true);
      this.scene.tweens.killTweensOf(pickup);
    }
    pickup.setPosition(x, y);
    (pickup.body as Phaser.Physics.Arcade.Body).reset(x, y);
  }

  private pullNearby(): void {
    const playerSpeed = this.player.sprite.body!.velocity.x;
    const pullSpeed = Math.max(200, playerSpeed * 0.8);
    const delta = this.scene.game.loop.delta / 1000;
    const px = this.player.x;
    const py = this.player.y;
    for (const pickup of this.pickups()) {
      const dx = px - pickup.x;
      const dy = py - pickup.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < MAGNET_RANGE && dist > 1) {
        const strength = pullSpeed * (1 + (MAGNET_RANGE - dist) / MAGNET_RANGE) * delta;
        this.moveTo(pickup, pickup.x + (dx / dist) * strength, pickup.y + (dy / dist) * strength);
      }
    }
  }

  private startFinalSweep(): void {
    const camera = this.scene.cameras.main;
    const left = camera.scrollX;
    const right = camera.scrollX + camera.width;
    for (const pickup of this.pickups()) {
      if (pickup.x >= left && pickup.x <= right) this.swept.add(pickup);
    }
    this.sweepEndsAt = this.scene.time.now + FINAL_SWEEP_MS;
  }

  /** Each swept pickup closes the rest of its gap in the time left, so all of them arrive together. */
  private sweep(): void {
    const remaining = Math.max(this.sweepEndsAt - this.scene.time.now, 1);
    const step = Math.min(1, this.scene.game.loop.delta / remaining);
    const px = this.player.x;
    const py = this.player.y;
    for (const pickup of this.swept) {
      if (!pickup.active || this.player.isDead) {
        this.swept.delete(pickup);
        continue;
      }
      this.moveTo(pickup, pickup.x + (px - pickup.x) * step, pickup.y + (py - pickup.y) * step);
      if (step >= 1) this.swept.delete(pickup);
    }
  }
}
