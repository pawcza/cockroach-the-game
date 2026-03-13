import Phaser from 'phaser';
import { Player } from '../objects/Player';

/**
 * Manages ambient visual/audio effects: dust trail, bird overlook,
 * and cockroach ambient noise.
 */
export class AmbientEffects {
  private scene: Phaser.Scene;

  // Dust trail
  private dustTimer = 0;

  // Bird overlook
  private birdOverlookTimer = 0;
  private nextBirdOverlookTime = 0;

  // Cockroach ambient noise
  private cockroachNoiseTimer = 0;
  private nextNoiseTime = 0;
  private cockroachNoiseSound: Phaser.Sound.BaseSound | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  reset(): void {
    this.dustTimer = 0;
    this.birdOverlookTimer = 0;
    this.nextBirdOverlookTime = 15000 + Math.random() * 10000;
    this.cockroachNoiseTimer = 0;
    this.nextNoiseTime = 20000 + Math.random() * 15000;
    this.cockroachNoiseSound = null;
  }

  update(player: Player): void {
    const delta = this.scene.game.loop.delta;

    // Dust trail particles
    this.dustTimer += delta;
    const dustInterval = Math.max(100, 300 / player.speedMultiplier);
    const onGroundForDust = player.sprite.body!.touching.down || player.sprite.body!.blocked.down;
    if (this.dustTimer >= dustInterval && onGroundForDust) {
      this.dustTimer = 0;
      const dust = this.scene.add.circle(
        player.x - 20,
        player.y + 10,
        2 + Math.random() * 2,
        0x8b7355,
        0.6,
      );
      this.scene.tweens.add({
        targets: dust,
        y: dust.y - 15,
        alpha: 0,
        scaleX: 0.3,
        scaleY: 0.3,
        duration: 400,
        onComplete: () => {
          dust.destroy();
        },
      });
    } else if (this.dustTimer >= dustInterval) {
      this.dustTimer = 0;
    }

    // Bird overlook
    this.birdOverlookTimer += delta;
    if (this.birdOverlookTimer >= this.nextBirdOverlookTime) {
      this.birdOverlookTimer = 0;
      this.nextBirdOverlookTime = 15000 + Math.random() * 10000;
      this.spawnBirdOverlook();
    }

    // Cockroach ambient noise
    this.cockroachNoiseTimer += delta;
    if (this.cockroachNoiseTimer >= this.nextNoiseTime) {
      this.cockroachNoiseTimer = 0;
      this.nextNoiseTime = 20000 + Math.random() * 15000;
      if (!this.cockroachNoiseSound || !this.cockroachNoiseSound.isPlaying) {
        this.cockroachNoiseSound = this.scene.sound.add('cockroach-noise', { volume: 0.3 });
        this.cockroachNoiseSound.play();
      }
    }
  }

  private spawnBirdOverlook(): void {
    const corners = [
      { x: 60, y: this.scene.cameras.main.height - 60, flipX: false, flipY: false },
      { x: this.scene.cameras.main.width - 60, y: this.scene.cameras.main.height - 60, flipX: true, flipY: false },
      { x: 60, y: 60, flipX: false, flipY: true },
      { x: this.scene.cameras.main.width - 60, y: 60, flipX: true, flipY: true },
    ];
    const corner = corners[Math.floor(Math.random() * corners.length)];

    const birdImg = this.scene.add.image(corner.x, corner.y, 'bird-overlook');
    birdImg.setScrollFactor(0);
    birdImg.setDepth(2000);
    birdImg.setScale(0.4);
    birdImg.setAlpha(0);
    birdImg.setFlipX(corner.flipX);
    birdImg.setFlipY(corner.flipY);

    this.scene.sound.play('huh', { volume: 0.5 });

    this.scene.tweens.add({
      targets: birdImg,
      alpha: 1,
      duration: 300,
      hold: 1500,
      yoyo: true,
      onComplete: () => birdImg.destroy(),
    });
  }
}
