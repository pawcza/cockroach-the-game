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
    return floor === 'top' ? FLOOR_TOP_Y : FLOOR_BOTTOM_Y;
  }

  // ── 1. PEST SPRAY ──────────────────────────────────────────────────
  // Menacing. Industrial. A can of death that BREATHES poison.

  private spawnPestSpray(x: number): void {
    const floor = this.randomFloor();
    const floorY = this.getFloorY(floor);

    const spray = this.obstacles.create(x, floorY, 'pest-spray') as Phaser.Physics.Arcade.Sprite;
    spray.setOrigin(0.5, 1);
    spray.setImmovable(true);
    spray.setData('floor', floor);
    (spray.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    spray.body!.setSize(spray.width * 0.6, spray.height * 0.7);

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
      alpha: { from: 0.7, to: 1.0 },
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

    // SPRAY MIST — a cloud of drifting poison droplets, non-collidable
    // The nozzle is near the top of the can
    const nozzleY = floorY - spray.height * 0.85;
    const sprayMist = (): void => {
      for (let i = 0; i < 4; i++) {
        const radius = Phaser.Math.Between(2, 5);
        const droplet = this.scene.add.circle(
          x + Phaser.Math.Between(-3, 3),
          nozzleY + Phaser.Math.Between(-2, 2),
          radius,
          0x88dd44,
          Phaser.Math.FloatBetween(0.15, 0.35),
        );
        droplet.setDepth(spray.depth - 1);

        const driftX = Phaser.Math.Between(-30, 30);
        const driftY = Phaser.Math.Between(-35, -15);
        this.scene.tweens.add({
          targets: droplet,
          x: droplet.x + driftX,
          y: droplet.y + driftY,
          alpha: 0,
          scale: Phaser.Math.FloatBetween(1.5, 2.5),
          duration: Phaser.Math.Between(800, 1400),
          ease: 'Sine.easeOut',
          onComplete: () => droplet.destroy(),
        });
      }
    };
    // Emit mist repeatedly
    this.scene.time.addEvent({
      delay: 300,
      callback: sprayMist,
      loop: true,
    });
  }

  // ── 2. NEWSPAPER ──────────────────────────────────────────────────
  // The slam heard round the kitchen.

  private spawnNewspaper(x: number): void {
    const floor = this.randomFloor();
    const floorY = this.getFloorY(floor);
    const startY = floorY - 120;

    const newspaper = this.obstacles.create(x, startY, 'newspaper') as Phaser.Physics.Arcade.Sprite;
    newspaper.setOrigin(0.5, 1);
    newspaper.setImmovable(true);
    newspaper.setData('floor', floor);
    (newspaper.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    newspaper.body!.setSize(newspaper.width * 0.7, newspaper.height * 0.6);

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

    // IMPACT BURST — scale punch and debris on each slam
    // The slam duration is 350ms, repeats every (350 + 1200 hold + 350 yoyo + 600 delay)
    const slamCycle = 350 + 1200 + 350 + 600;
    this.scene.time.addEvent({
      delay: slamCycle,
      startAt: slamCycle - 350, // first trigger after the first slam lands (350ms)
      loop: true,
      callback: () => {
        // Scale punch — newspaper briefly swells on impact
        this.scene.tweens.add({
          targets: newspaper,
          scaleX: 1.3,
          scaleY: 1.3,
          duration: 80,
          yoyo: true,
          ease: 'Cubic.easeOut',
        });

        // Debris particles — tiny paper bits fly out
        for (let i = 0; i < 6; i++) {
          const debris = this.scene.add.rectangle(
            x + Phaser.Math.Between(-15, 15),
            floorY - Phaser.Math.Between(2, 8),
            Phaser.Math.Between(2, 4),
            Phaser.Math.Between(1, 3),
            0xddccaa,
            0.8,
          );
          const flyX = Phaser.Math.Between(-40, 40);
          const flyY = Phaser.Math.Between(-30, -10);
          this.scene.tweens.add({
            targets: debris,
            x: debris.x + flyX,
            y: debris.y + flyY,
            alpha: 0,
            angle: Phaser.Math.Between(-180, 180),
            duration: Phaser.Math.Between(400, 700),
            ease: 'Cubic.easeOut',
            onComplete: () => debris.destroy(),
          });
        }
      },
    });
  }

  // ── 3. ONION ──────────────────────────────────────────────────────
  // Sits there. Innocent looking. But the STINK.

  private spawnOnion(x: number): void {
    const floor = this.randomFloor();
    const floorY = this.getFloorY(floor);

    const onion = this.obstacles.create(x, floorY, 'onion') as Phaser.Physics.Arcade.Sprite;
    onion.setOrigin(0.5, 1);
    onion.setImmovable(true);
    onion.setData('floor', floor);
    (onion.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    onion.body!.setSize(onion.width * 0.6, onion.height * 0.7);

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

    // TEARS — the onion is so stinky it makes ITSELF cry
    this.scene.time.addEvent({
      delay: 800,
      loop: true,
      callback: () => {
        const side = Phaser.Math.Between(0, 1) === 0 ? -1 : 1;
        const tear = this.scene.add.circle(
          x + side * Phaser.Math.Between(4, 10),
          floorY - onion.height * 0.55,
          Phaser.Math.Between(1, 3),
          0x4488ff,
          0.7,
        );
        this.scene.tweens.add({
          targets: tear,
          y: floorY - 2,
          alpha: 0,
          scaleY: 1.8,
          duration: Phaser.Math.Between(600, 1000),
          ease: 'Quad.easeIn',
          onComplete: () => tear.destroy(),
        });
      },
    });
  }

  // ── 4. FLIPPER / SANDAL ──────────────────────────────────────────
  // Wielded by an UNSEEN ANGRY PERSON.

  private spawnFlipper(x: number): void {
    const floor = this.randomFloor();
    const floorY = this.getFloorY(floor);
    const pivotY = floorY - 40;

    const flipper = this.obstacles.create(x, pivotY, 'flipper') as Phaser.Physics.Arcade.Sprite;
    flipper.setOrigin(0.5, 1);
    flipper.setImmovable(true);
    flipper.setData('floor', floor);
    (flipper.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    flipper.body!.setSize(flipper.width * 0.6, flipper.height * 0.7);

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

    // WHOOSH ARC — a semi-transparent trailing arc that follows the swing
    const whooshGfx = this.scene.add.graphics();
    whooshGfx.setDepth(flipper.depth - 1);
    const arcRadius = flipper.height * 0.7;
    this.scene.events.on('update', () => {
      if (!flipper.active) {
        whooshGfx.destroy();
        return;
      }
      whooshGfx.clear();
      // Draw a fading arc behind the current angle
      const currentAngle = flipper.angle;
      const arcSpan = 25; // degrees of trail
      const startAngleDeg = currentAngle - 90 - arcSpan;
      const endAngleDeg = currentAngle - 90;
      const startRad = Phaser.Math.DegToRad(startAngleDeg);
      const endRad = Phaser.Math.DegToRad(endAngleDeg);

      whooshGfx.lineStyle(3, 0xffffff, 0.25);
      whooshGfx.beginPath();
      whooshGfx.arc(x, pivotY, arcRadius, startRad, endRad, false);
      whooshGfx.strokePath();

      // Inner thinner arc for depth
      whooshGfx.lineStyle(1.5, 0xffffff, 0.12);
      whooshGfx.beginPath();
      whooshGfx.arc(x, pivotY, arcRadius * 0.7, startRad, endRad, false);
      whooshGfx.strokePath();
    });
  }

  // ── 5. BIRD ──────────────────────────────────────────────────────
  // Predatory. Sudden.

  private spawnBird(x: number): void {
    const floor = this.randomFloor();
    const floorY = this.getFloorY(floor);
    const startY = 50;

    const bird = this.obstacles.create(x, startY, 'bird') as Phaser.Physics.Arcade.Sprite;
    bird.setOrigin(0.5, 1);
    bird.setImmovable(true);
    bird.setData('floor', floor);
    (bird.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    bird.body!.setSize(bird.width * 0.6, bird.height * 0.5);

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

    // Horizontal drift — predatory angle, WIDER and more ERRATIC
    this.scene.tweens.add({
      targets: bird,
      x: x - 70,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Secondary erratic jitter layered on top
    this.scene.tweens.add({
      targets: bird,
      x: '+=' + 20,
      duration: 250,
      yoyo: true,
      repeat: -1,
      ease: 'Stepped',
    });

    // GROUND SHADOW — dark ellipse at floor level that tracks the bird
    const shadow = this.scene.add.ellipse(x, floorY - 2, 30, 8, 0x000000, 0.25);
    shadow.setDepth(0);
    this.scene.events.on('update', () => {
      if (!bird.active) {
        shadow.destroy();
        return;
      }
      shadow.x = bird.x;
      // Shadow scales based on bird height — closer = bigger shadow
      const totalDrop = floorY - startY;
      const progress = (bird.y - startY) / totalDrop;
      const shadowScale = 0.5 + progress * 1.0;
      shadow.setScale(shadowScale, shadowScale * 0.5);
      shadow.setAlpha(0.1 + progress * 0.3);
    });
  }

  // ── 6. CAT PAW ──────────────────────────────────────────────────
  // Jump scare territory. The most Courage-the-Cowardly-Dog obstacle.

  private spawnCatPaw(x: number): void {
    const floor = this.randomFloor();
    const floorY = this.getFloorY(floor);

    const paw = this.obstacles.create(x, floorY, 'cat-paw') as Phaser.Physics.Arcade.Sprite;
    paw.setOrigin(0.5, 1);
    paw.setImmovable(true);
    paw.setData('floor', floor);
    (paw.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    paw.body!.setSize(paw.width * 0.5, paw.height * 0.5);
    paw.setAlpha(0.3);
    paw.setScale(1);

    const spawnClawMarks = (): void => {
      const scratchGfx = this.scene.add.graphics();
      scratchGfx.setDepth(paw.depth - 1);
      // Draw 3 diagonal claw scratch lines
      for (let i = 0; i < 3; i++) {
        const startX = x - 12 + i * 10;
        const startY = floorY - paw.height * 0.6;
        scratchGfx.lineStyle(2, 0xff3333, 0.8);
        scratchGfx.beginPath();
        scratchGfx.moveTo(startX, startY);
        scratchGfx.lineTo(startX + 8, startY + 20);
        scratchGfx.strokePath();
      }
      // Fade out and destroy
      this.scene.tweens.add({
        targets: scratchGfx,
        alpha: 0,
        duration: 600,
        delay: 150,
        ease: 'Sine.easeIn',
        onComplete: () => scratchGfx.destroy(),
      });
    };

    const playStrikeSequence = (): void => {
      this.scene.tweens.chain({
        targets: paw,
        tweens: [
          // Warning phase — the shadow darkens
          { alpha: 0.7, duration: 800, ease: 'Sine.easeIn' },
          // STRIKE — fast, violent, fully visible
          {
            scale: 1.3,
            alpha: 1.0,
            duration: 200,
            ease: 'Back.easeOut',
            onComplete: () => spawnClawMarks(),
          },
          // Hold the strike
          { scale: 1.3, duration: 150 },
          // Retract — slink back into the shadows
          { scale: 1, alpha: 0.3, duration: 400, ease: 'Sine.easeIn' },
          // Pause in the shadows
          { alpha: 0.3, duration: 1500 },
        ],
        onComplete: () => {
          playStrikeSequence();
        },
      });
    };

    playStrikeSequence();
  }
}
