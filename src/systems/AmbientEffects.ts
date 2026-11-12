/** Cosmetic life around the cockroach: dust, the bird cameo and ambient noise. */
import Phaser from 'phaser';
import { AudioManager, VOL } from '../audio/AudioManager';
import { DEPTH } from '../config/constants';
import { ROACH_FEET_OFFSET } from '../config/sprites';
import { getFx } from '../effects/Fx';
import { Player } from '../objects/Player';

export class AmbientEffects {
  private scene: Phaser.Scene;
  private player!: Player;
  private audio!: AudioManager;

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
  }

  updateDust(): void {
    this.dustTimer += this.scene.game.loop.delta;
    // A puff every few strides, not a stream: quicker as the legs speed up
    const dustInterval = Math.max(170, 380 / this.player.speedMultiplier);
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
        this.noiseSound = this.audio.addSfx('cockroach-noise', VOL.ambient);
        this.noiseSound?.play();
      }
    }

  }

  /** A kick of dust off the back feet, left behind on the ledge as the roach runs on. */
  private spawnDustParticle(): void {
    getFx(this.scene).play('dust', this.player.x - 34, this.player.y + ROACH_FEET_OFFSET, {
      depth: DEPTH.PICKUPS - 0.5, vx: -30 - Math.random() * 30,
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
