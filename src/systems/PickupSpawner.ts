import Phaser from 'phaser';
import {
  APPLE_SPAWN_CHANCE,
  PILL_SPAWN_CHANCE,
  TYSKIE_SPAWN_CHANCE,
} from '../config/constants';
import { SeededRNG } from '../multiplayer/SeededRNG';
import { Floor } from '../objects/Player';

/**
 * Handles spawning of apple, tyskie, and pill pickups.
 */
export class PickupSpawner {
  private scene: Phaser.Scene;
  private apples: Phaser.Physics.Arcade.Group;
  private tyskies: Phaser.Physics.Arcade.Group;
  private pills: Phaser.Physics.Arcade.Group;
  private floorTopY: number;
  private floorBottomY: number;
  private rng: SeededRNG | null;

  constructor(
    scene: Phaser.Scene,
    apples: Phaser.Physics.Arcade.Group,
    tyskies: Phaser.Physics.Arcade.Group,
    pills: Phaser.Physics.Arcade.Group,
    floorTopY: number,
    floorBottomY: number,
    rng: SeededRNG | null,
  ) {
    this.scene = scene;
    this.apples = apples;
    this.tyskies = tyskies;
    this.pills = pills;
    this.floorTopY = floorTopY;
    this.floorBottomY = floorBottomY;
    this.rng = rng;
  }

  /**
   * Try to spawn a pickup at the given slot position.
   * Returns true if a pickup was spawned (so the caller knows not to spawn an obstacle).
   */
  trySpawn(slotX: number, roll: number): boolean {
    if (roll < PILL_SPAWN_CHANCE) {
      this.spawnPill(slotX);
      return true;
    } else if (roll < PILL_SPAWN_CHANCE + TYSKIE_SPAWN_CHANCE) {
      this.spawnTyskie(slotX);
      return true;
    } else if (roll < PILL_SPAWN_CHANCE + TYSKIE_SPAWN_CHANCE + APPLE_SPAWN_CHANCE) {
      this.spawnApple(slotX);
      return true;
    }
    return false;
  }

  cleanup(cameraLeft: number, onMissed: () => void): void {
    const groups = [this.apples, this.tyskies, this.pills];
    for (const group of groups) {
      group.getChildren().forEach((obj) => {
        const sprite = obj as Phaser.Physics.Arcade.Sprite;
        if (sprite.x < cameraLeft) {
          onMissed();
          sprite.destroy();
        }
      });
    }
  }

  destroyPickupNear(x: number): boolean {
    const tolerance = 30;
    const groups = [this.apples, this.tyskies, this.pills];
    for (const group of groups) {
      for (const obj of group.getChildren()) {
        const sprite = obj as Phaser.Physics.Arcade.Sprite;
        if (Math.abs(sprite.x - x) < tolerance) {
          sprite.destroy();
          return true;
        }
      }
    }
    return false;
  }

  private spawnPill(slotX: number): void {
    const pFloor: Floor = (this.rng?.next() ?? Math.random()) > 0.5 ? 'top' : 'bottom';
    const pY = (pFloor === 'top' ? this.floorTopY : this.floorBottomY) - 30;
    const pill = this.pills.create(slotX, pY, 'pill') as Phaser.Physics.Arcade.Sprite;
    pill.setScale(0.15);
    pill.setDepth(10);
    (pill.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    pill.setImmovable(true);
    this.scene.tweens.add({
      targets: pill,
      y: pY - 10,
      duration: 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    const pillGlowTween = this.scene.tweens.addCounter({
      from: 0,
      to: 360,
      duration: 1500,
      repeat: -1,
      onUpdate: (tween) => {
        if (pill.active) {
          const hue = tween.getValue() ?? 0;
          const color = Phaser.Display.Color.HSLToColor(hue / 360, 1, 0.5);
          pill.setTint(color.color);
        }
      },
    });
    pill.setData('glowTween', pillGlowTween);
    // Pulsing pink glow
    const pGlow = this.scene.add.circle(slotX, pY, 20, 0xff00ff, 0.3).setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: pGlow, alpha: 0.1, scale: 1.3, duration: 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    pill.on('destroy', () => { this.scene.tweens.killTweensOf(pill); this.scene.tweens.killTweensOf(pGlow); pGlow.destroy(); });
    this.scene.tweens.add({
      targets: pill,
      scaleX: 0.18,
      scaleY: 0.18,
      duration: 300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private spawnTyskie(slotX: number): void {
    const tFloor: Floor = (this.rng?.next() ?? Math.random()) > 0.5 ? 'top' : 'bottom';
    const tY = (tFloor === 'top' ? this.floorTopY : this.floorBottomY) - 30;
    const tyskie = this.tyskies.create(slotX, tY, 'tyskie') as Phaser.Physics.Arcade.Sprite;
    tyskie.setScale(0.18);
    tyskie.setDepth(10);
    (tyskie.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    tyskie.setImmovable(true);
    this.scene.tweens.add({
      targets: tyskie,
      y: tY - 8,
      duration: 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.scene.tweens.add({
      targets: tyskie,
      scale: 0.22,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    tyskie.setTint(0xffdd00);
    // Golden glow
    const tGlow = this.scene.add.circle(slotX, tY, 18, 0xffdd00, 0.25).setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: tGlow, alpha: 0.1, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    tyskie.on('destroy', () => { this.scene.tweens.killTweensOf(tyskie); this.scene.tweens.killTweensOf(tGlow); tGlow.destroy(); });
  }

  private spawnApple(slotX: number): void {
    const appleFloor: Floor = (this.rng?.next() ?? Math.random()) > 0.5 ? 'top' : 'bottom';
    const appleY = (appleFloor === 'top' ? this.floorTopY : this.floorBottomY) - 30;
    const apple = this.apples.create(slotX, appleY, 'apple') as Phaser.Physics.Arcade.Sprite;
    apple.setScale(0.15);
    apple.setDepth(10);
    (apple.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    apple.setImmovable(true);
    this.scene.tweens.add({
      targets: apple,
      y: appleY - 8,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    // Green glow
    const aGlow = this.scene.add.circle(slotX, appleY, 16, 0x00ff44, 0.2).setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: aGlow, alpha: 0.08, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    apple.on('destroy', () => { this.scene.tweens.killTweensOf(apple); this.scene.tweens.killTweensOf(aGlow); aGlow.destroy(); });
  }
}
