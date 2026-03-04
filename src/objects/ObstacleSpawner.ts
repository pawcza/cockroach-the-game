import Phaser from 'phaser';
import { FLOOR_TOP_Y, FLOOR_BOTTOM_Y } from '../config/constants';

type Floor = 'top' | 'bottom';

export class ObstacleSpawner {
  private scene: Phaser.Scene;
  private obstacles: Phaser.Physics.Arcade.Group;

  constructor(scene: Phaser.Scene, obstacles: Phaser.Physics.Arcade.Group) {
    this.scene = scene;
    this.obstacles = obstacles;
  }

  spawn(x: number): void {
    const types = [
      this.spawnPestSpray,
      this.spawnNewspaper,
      this.spawnOnion,
      this.spawnFlipper,
      this.spawnBird,
      this.spawnCatPaw,
    ];
    const pick = Phaser.Math.Between(0, types.length - 1);
    types[pick].call(this, x);
  }

  private randomFloor(): Floor {
    return Math.random() < 0.5 ? 'top' : 'bottom';
  }

  private getFloorY(floor: Floor): number {
    const floorY = floor === 'top' ? FLOOR_TOP_Y : FLOOR_BOTTOM_Y;
    return floorY - 40;
  }

  // ── 1. PEST SPRAY ──────────────────────────────────────────────────
  // Menacing. Industrial. A can of death that BREATHES poison.

  private spawnPestSpray(x: number): void {
    const floor = this.randomFloor();
    const floorY = this.getFloorY(floor);

    const spray = this.obstacles.create(x, floorY, 'pest-spray') as Phaser.Physics.Arcade.Sprite;
    spray.setImmovable(true);
    (spray.body as Phaser.Physics.Arcade.Body).allowGravity = false;

    // Can vibration — a nervous, industrial rattle
    this.scene.tweens.add({
      targets: spray,
      x: spray.x + 1.5,
      y: spray.y + 0.8,
      duration: 50,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Alpha pulse — the mist is ALIVE
    this.scene.tweens.add({
      targets: spray,
      alpha: { from: 0.4, to: 1.0 },
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Scale pulse — it swells, it recedes
    this.scene.tweens.add({
      targets: spray,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // ── 2. NEWSPAPER ──────────────────────────────────────────────────
  // The slam heard round the kitchen.

  private spawnNewspaper(x: number): void {
    const floor = this.randomFloor();
    const floorY = this.getFloorY(floor);
    const startY = floorY - 200;

    const newspaper = this.obstacles.create(x, startY, 'newspaper') as Phaser.Physics.Arcade.Sprite;
    newspaper.setImmovable(true);
    (newspaper.body as Phaser.Physics.Arcade.Body).allowGravity = false;

    // THE SLAM
    this.scene.tweens.add({
      targets: newspaper,
      y: floorY,
      duration: 350,
      ease: 'Bounce.easeOut',
      hold: 1200,
      yoyo: true,
      repeat: -1,
      repeatDelay: 600,
    });

    // Rotation on impact
    this.scene.tweens.add({
      targets: newspaper,
      angle: { from: -5, to: 5 },
      duration: 350,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // ── 3. ONION ──────────────────────────────────────────────────────
  // Sits there. Innocent looking. But the STINK.

  private spawnOnion(x: number): void {
    const floor = this.randomFloor();
    const floorY = this.getFloorY(floor);

    const onion = this.obstacles.create(x, floorY, 'onion') as Phaser.Physics.Arcade.Sprite;
    onion.setImmovable(true);
    (onion.body as Phaser.Physics.Arcade.Body).allowGravity = false;

    // The wobble
    this.scene.tweens.add({
      targets: onion,
      angle: { from: -3, to: 3 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Stink waves — non-collidable decoration using graphics circles
    for (let i = 0; i < 3; i++) {
      const offsetX = Phaser.Math.Between(-8, 8);
      const stink = this.scene.add.circle(x + offsetX, floorY - 10, 4, 0x99cc33, 0.6);
      stink.setScale(0.5 + i * 0.15);

      this.scene.tweens.add({
        targets: stink,
        y: floorY - 60 - i * 15,
        alpha: 0,
        duration: 1500 + i * 300,
        delay: i * 400,
        repeat: -1,
        ease: 'Sine.easeOut',
        onRepeat: () => {
          stink.y = floorY - 10;
          stink.alpha = 0.6;
        },
      });
    }
  }

  // ── 4. FLIPPER / SANDAL ──────────────────────────────────────────
  // Wielded by an UNSEEN ANGRY PERSON.

  private spawnFlipper(x: number): void {
    const floor = this.randomFloor();
    const floorY = this.getFloorY(floor);
    const pivotY = floorY - 80;

    const flipper = this.obstacles.create(x, pivotY, 'flipper') as Phaser.Physics.Arcade.Sprite;
    flipper.setImmovable(true);
    (flipper.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    flipper.setOrigin(0.5, 0);

    // THE SWING — Sine easing accelerates through the middle
    this.scene.tweens.add({
      targets: flipper,
      angle: { from: -60, to: 60 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      hold: 200,
    });
  }

  // ── 5. BIRD ──────────────────────────────────────────────────────
  // Predatory. Sudden.

  private spawnBird(x: number): void {
    const floor = this.randomFloor();
    const floorY = this.getFloorY(floor);
    const startY = -60;

    const bird = this.obstacles.create(x, startY, 'bird') as Phaser.Physics.Arcade.Sprite;
    bird.setImmovable(true);
    (bird.body as Phaser.Physics.Arcade.Body).allowGravity = false;

    // THE SWOOP
    this.scene.tweens.add({
      targets: bird,
      y: floorY,
      duration: 700,
      ease: 'Sine.easeOut',
      yoyo: true,
      repeat: -1,
      hold: 300,
      repeatDelay: 500,
    });

    // Horizontal drift — predatory angle
    this.scene.tweens.add({
      targets: bird,
      x: x - 40,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // ── 6. CAT PAW ──────────────────────────────────────────────────
  // Jump scare territory. The most Courage-the-Cowardly-Dog obstacle.

  private spawnCatPaw(x: number): void {
    const floor = this.randomFloor();
    const floorY = this.getFloorY(floor);

    const paw = this.obstacles.create(x, floorY, 'cat-paw') as Phaser.Physics.Arcade.Sprite;
    paw.setImmovable(true);
    (paw.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    paw.setAlpha(0.15);
    paw.setScale(1);

    const playStrikeSequence = (): void => {
      this.scene.tweens.chain({
        targets: paw,
        tweens: [
          // Warning phase — the shadow darkens
          { alpha: 0.6, duration: 800, ease: 'Sine.easeIn' },
          // STRIKE — fast, violent, fully visible
          { scale: 1.8, alpha: 1.0, duration: 200, ease: 'Back.easeOut' },
          // Hold the strike
          { scale: 1.8, duration: 150 },
          // Retract — slink back into the shadows
          { scale: 1, alpha: 0.15, duration: 400, ease: 'Sine.easeIn' },
          // Pause in the shadows
          { alpha: 0.15, duration: 1500 },
        ],
        onComplete: () => {
          playStrikeSequence();
        },
      });
    };

    playStrikeSequence();
  }
}
