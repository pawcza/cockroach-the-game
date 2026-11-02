/** Cosmetic life around the cockroach: dust, its light, the bird cameo and ambient noise. */
import Phaser from 'phaser';
import { AudioManager } from '../audio/AudioManager';
import { DEPTH } from '../config/constants';
import { Player } from '../objects/Player';

export class AmbientEffects {
  private scene: Phaser.Scene;
  private player!: Player;
  private audio!: AudioManager;
  private light: Phaser.GameObjects.Light | null = null;

  private dustTimer = 0;
  private birdOverlookTimer = 0;
  private nextBirdOverlookTime = 0;
  private noiseTimer = 0;
  private nextNoiseTime = 0;
  // Kept across restarts so a noise still playing from the last run isn't doubled.
  private noiseSound: Phaser.Sound.BaseSound | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  reset(): void {
    this.dustTimer = 0;
    this.birdOverlookTimer = 0;
    this.nextBirdOverlookTime = 15000 + Math.random() * 10000;
    this.noiseTimer = 0;
    this.nextNoiseTime = 20000 + Math.random() * 15000;
  }

  attachTo(player: Player, audio: AudioManager): void {
    this.player = player;
    this.audio = audio;
    // Warm white glow
    this.light = this.scene.lights.addLight(player.x, player.y, 300, 0xfff0dd, 1.5);
  }

  updateDust(): void {
    this.dustTimer += this.scene.game.loop.delta;
    const dustInterval = Math.max(100, 300 / this.player.speedMultiplier);
    const body = this.player.sprite.body!;
    const onGround = body.touching.down || body.blocked.down;
    if (this.dustTimer >= dustInterval) {
      this.dustTimer = 0;
      if (onGround) this.spawnDustParticle();
    }
  }

  update(): void {
    const delta = this.scene.game.loop.delta;

    this.birdOverlookTimer += delta;
    if (this.birdOverlookTimer >= this.nextBirdOverlookTime) {
      this.birdOverlookTimer = 0;
      this.nextBirdOverlookTime = 15000 + Math.random() * 10000;
      this.spawnBirdOverlook();
    }

    this.noiseTimer += delta;
    if (this.noiseTimer >= this.nextNoiseTime) {
      this.noiseTimer = 0;
      this.nextNoiseTime = 20000 + Math.random() * 15000;
      if (!this.noiseSound || !this.noiseSound.isPlaying) {
        this.noiseSound = this.audio.addSfx('cockroach-noise', 0.3);
        this.noiseSound.play();
      }
    }

    if (this.light) {
      this.light.x = this.player.x;
      this.light.y = this.player.y;
    }
  }

  private spawnDustParticle(): void {
    const dust = this.scene.add.circle(
      this.player.x - 20,
      this.player.y + 10,
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
      onComplete: () => { dust.destroy(); },
    });
  }

  private spawnBirdOverlook(): void {
    const camera = this.scene.cameras.main;
    const corners = [
      { x: 60, y: camera.height - 60, flipX: false, flipY: false },
      { x: camera.width - 60, y: camera.height - 60, flipX: true, flipY: false },
      { x: 60, y: 60, flipX: false, flipY: true },
      { x: camera.width - 60, y: 60, flipX: true, flipY: true },
    ];
    const corner = corners[Math.floor(Math.random() * corners.length)];

    const birdImg = this.scene.add.image(corner.x, corner.y, 'bird-overlook');
    birdImg.setScrollFactor(0).setDepth(DEPTH.BIRD_OVERLOOK).setScale(0.4).setAlpha(0);
    birdImg.setFlipX(corner.flipX).setFlipY(corner.flipY);

    this.audio.playSfx('huh', 0.5);

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
