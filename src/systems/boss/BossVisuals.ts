/** What the fight looks like: the glock's descent, the three faces, explosions and popups. Holds no fight state. */
import Phaser from 'phaser';
import { AudioManager } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { Player } from '../../objects/Player';
import { popupStyle } from '../../utils/TextStyles';
import { FACES, OBSTACLE_OFFSET } from './bossConfig';

export class BossVisuals {
  private scene: Phaser.Scene;
  private player: Player;
  private audio: AudioManager;
  private bossY: number;

  private container!: Phaser.GameObjects.Container;
  private faceSprites: Phaser.GameObjects.Image[] = [];
  private beastAmbientSound: Phaser.Sound.BaseSound | null = null;
  private godray!: Phaser.GameObjects.Graphics;
  glock!: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, player: Player, audio: AudioManager, floorTopY: number, floorBottomY: number) {
    this.scene = scene;
    this.player = player;
    this.audio = audio;
    this.bossY = (floorTopY + floorBottomY) / 2 - OBSTACLE_OFFSET;
  }

  get bossAlive(): boolean { return this.container?.active ?? false; }
  get bossContainer(): Phaser.GameObjects.Container { return this.container; }

  /** The cockroach brakes, stands up and sees the glock descend; the boss then slides in. */
  playIntro(onStopped: () => void, onArrived: () => void): void {
    const sprite = this.player.sprite;

    this.scene.tweens.add({
      targets: sprite.body!.velocity,
      x: 0,
      duration: 1000,
      ease: 'Power2',
      onComplete: () => {
        sprite.setVelocity(0, 0);
        onStopped();
        this.scene.cameras.main.stopFollow();

        this.scene.tweens.add({
          targets: sprite,
          angle: -90,
          duration: 500,
          ease: 'Power2',
          onComplete: () => {
            sprite.setTexture('cockroach-standing');
            this.descendGlock(onArrived);
          },
        });
      },
    });
  }

  private descendGlock(onArrived: () => void): void {
    const sprite = this.player.sprite;
    const cam = this.scene.cameras.main;

    this.godray = this.scene.add.graphics();
    this.godray.setScrollFactor(0);
    this.godray.setDepth(DEPTH.GODRAY);
    this.godray.setAlpha(0);

    this.glock = this.scene.add.image(sprite.x - cam.scrollX + 10, -50, 'boss-gun');
    this.glock.setScale(0.3).setDepth(DEPTH.OBSTACLES - 1).setScrollFactor(0);
    this.glock.setOrigin(0, 0.5);

    this.audio.playSfx('boss-choir', 0.7);

    this.scene.tweens.add({ targets: this.godray, alpha: 0.6, duration: 500 });

    this.scene.tweens.add({
      targets: this.glock,
      y: sprite.y,
      duration: 1500,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.audio.playSfx('dash-ready', 0.7);
        sprite.setTint(0xffffff);
        this.scene.time.delayedCall(150, () => sprite.clearTint());

        this.scene.tweens.add({
          targets: this.godray,
          alpha: 0,
          duration: 500,
          onComplete: () => this.godray.destroy(),
        });

        this.enterBoss(onArrived);
      },
    });
  }

  private enterBoss(onArrived: () => void): void {
    const cam = this.scene.cameras.main;

    this.container = this.scene.add.container(cam.scrollX + cam.width + 100, this.bossY);
    this.container.setDepth(DEPTH.OBSTACLES);

    for (const face of FACES) {
      const img = this.scene.add.image(face.offsetX, face.offsetY, face.key);
      img.setScale(face.scale);
      this.faceSprites.push(img);
      this.container.add(img);
    }

    this.beastAmbientSound = this.audio.addSfx('boss-beast-ambient', 0.5, true);
    this.beastAmbientSound.play();

    this.scene.tweens.add({
      targets: this.container,
      x: cam.scrollX + cam.width - 95,
      duration: 1000,
      ease: 'Power2',
      onComplete: () => {
        this.stopAmbient();
        onArrived();
      },
    });
  }

  stopAmbient(): void {
    if (this.beastAmbientSound) {
      this.beastAmbientSound.stop();
      this.beastAmbientSound.destroy();
      this.beastAmbientSound = null;
    }
  }

  followPlayerWithGlock(): void {
    if (this.glock?.active) this.glock.y = this.player.sprite.y;
  }

  updateGodray(): void {
    if (!this.godray || !this.godray.active) return;
    const cx = this.glock?.x ?? this.scene.cameras.main.width / 2;
    const cy = this.glock?.y ?? this.scene.cameras.main.height / 2;
    const time = this.scene.time.now;

    this.godray.clear();
    const rayCount = 12;
    for (let i = 0; i < rayCount; i++) {
      const angle = (i / rayCount) * Math.PI * 2 + time * 0.0005;
      this.godray.lineStyle(3, 0xffff88, 0.3);
      this.godray.lineBetween(cx, cy, cx + Math.cos(angle) * 200, cy + Math.sin(angle) * 200);
    }
  }

  wobbleFaces(wobbleMult = 1): void {
    const time = this.scene.time.now;
    for (let i = 0; i < this.faceSprites.length; i++) {
      const face = this.faceSprites[i];
      const freq = 1.5 + i * 0.3;
      face.setAngle(Math.sin(time * 0.002 * freq * wobbleMult) * 3 * wobbleMult);
      face.y = FACES[i].offsetY + Math.sin(time * 0.003 * freq * wobbleMult) * 5 * wobbleMult;
    }
  }

  tintFaces(color: number): void {
    this.faceSprites.forEach(f => f.setTint(color));
  }

  clearFaceTint(): void {
    this.faceSprites.forEach(f => f.clearTint());
  }

  kickGlock(): void {
    this.scene.tweens.add({
      targets: this.glock,
      angle: -15,
      duration: 50,
      ease: 'Power2',
      yoyo: true,
    });
  }

  spawnExplosion(x: number, y: number): void {
    const exp = this.scene.add.image(x, y, `boss-explosion${Phaser.Math.Between(1, 3)}`);
    exp.setScale(0.3).setDepth(DEPTH.VFX_TEXT);
    this.scene.tweens.add({
      targets: exp,
      alpha: 0,
      scale: 0.6,
      duration: 300,
      onComplete: () => exp.destroy(),
    });
  }

  explodeAroundBoss(spread: number): void {
    this.spawnExplosion(
      this.container.x + Phaser.Math.Between(-spread, spread),
      this.container.y + Phaser.Math.Between(-spread, spread),
    );
  }

  showProjectileScore(x: number, y: number, points: number): void {
    const popup = this.scene.add.text(x, y - 15, `+${points}`, popupStyle({
      fontSize: '8px',
      color: '#ffdd00',
    }));
    popup.setOrigin(0.5).setDepth(DEPTH.POPUP);
    this.scene.tweens.add({
      targets: popup,
      y: popup.y - 20,
      alpha: { from: 1, to: 0 },
      duration: 600,
      ease: 'Power2',
      onComplete: () => popup.destroy(),
    });
  }

  /** Boss fades, the bonus flies up and the glock is thrown away. */
  playDefeat(bonus: number): void {
    if (this.bossAlive) {
      this.scene.tweens.add({
        targets: this.container,
        alpha: 0,
        duration: 400,
        onComplete: () => { this.container.destroy(); },
      });
    }

    this.audio.playSfx('boss-victory', 0.7);

    const cam = this.scene.cameras.main;
    const bonusText = this.scene.add.text(cam.width / 2, cam.height / 2, `+${bonus}`, popupStyle({
      fontSize: '32px',
      color: '#ffff00',
      strokeThickness: 6,
    })).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.POPUP);

    this.scene.tweens.add({
      targets: bonusText,
      y: bonusText.y - 60,
      alpha: { from: 1, to: 0 },
      scale: { from: 1, to: 1.5 },
      duration: 1500,
      ease: 'Power2',
      onComplete: () => bonusText.destroy(),
    });

    this.scene.tweens.add({
      targets: this.glock,
      x: this.glock.x + 200,
      y: this.glock.y - 300,
      angle: 720,
      alpha: 0,
      duration: 1000,
      ease: 'Power2',
      onComplete: () => { if (this.glock?.active) this.glock.destroy(); },
    });
  }

  destroyGlock(): void {
    if (this.glock?.active) this.glock.destroy();
  }

  destroy(): void {
    if (this.container?.active) this.container.destroy();
    this.destroyGlock();
    if (this.godray?.active) this.godray.destroy();
    this.stopAmbient();
  }
}
