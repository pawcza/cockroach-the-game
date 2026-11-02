/** Vacuums pickups toward the player while the pill effect is active. */
import Phaser from 'phaser';
import { Player } from '../objects/Player';

const MAGNET_RANGE = 600;

export class PickupMagnet {
  private scene: Phaser.Scene;
  private player: Player;
  private groups: Phaser.Physics.Arcade.Group[];

  constructor(scene: Phaser.Scene, player: Player, groups: Phaser.Physics.Arcade.Group[]) {
    this.scene = scene;
    this.player = player;
    this.groups = groups;
  }

  update(): void {
    if (!this.player.isPillActive) return;

    const playerSpeed = this.player.sprite.body!.velocity.x;
    const pullSpeed = Math.max(200, playerSpeed * 0.8);
    const delta = this.scene.game.loop.delta / 1000;
    const px = this.player.x;
    const py = this.player.y;
    for (const group of this.groups) {
      group.getChildren().slice().forEach((obj) => {
        const pickup = obj as Phaser.Physics.Arcade.Sprite;
        const dx = px - pickup.x;
        const dy = py - pickup.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MAGNET_RANGE && dist > 1) {
          // First time vacuuming this pickup — kill float tween so it doesn't fight Y
          if (!pickup.getData('_vacuumed')) {
            pickup.setData('_vacuumed', true);
            this.scene.tweens.killTweensOf(pickup);
          }
          const strength = pullSpeed * (1 + (MAGNET_RANGE - dist) / MAGNET_RANGE) * delta;
          pickup.x += (dx / dist) * strength;
          pickup.y += (dy / dist) * strength;
          // Sync physics body so overlap collection still works
          const body = pickup.body as Phaser.Physics.Arcade.Body;
          body.reset(pickup.x, pickup.y);
        }
      });
    }
  }
}
