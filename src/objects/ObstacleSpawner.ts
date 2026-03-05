import Phaser from 'phaser';
import { GAME_WIDTH, FLOOR_TOP_Y, FLOOR_BOTTOM_Y } from '../config/constants';

type Floor = 'top' | 'bottom';

export class ObstacleSpawner {
  private scene: Phaser.Scene;
  private obstacles: Phaser.Physics.Arcade.Group;
  private forcedFloor: Floor | null = null;

  constructor(scene: Phaser.Scene, obstacles: Phaser.Physics.Arcade.Group) {
    this.scene = scene;
    this.obstacles = obstacles;
  }

  /** Play a sound only when the sprite scrolls into view. */
  private playSoundOnVisible(sprite: Phaser.Physics.Arcade.Sprite, key: string, volume: number): void {
    const check = this.scene.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => {
        if (!sprite.active) { check.destroy(); return; }
        const cameraRight = this.scene.cameras.main.scrollX + GAME_WIDTH;
        if (sprite.x <= cameraRight) {
          this.scene.sound.play(key, { volume });
          check.destroy();
        }
      },
    });
  }

  spawn(x: number, speedMultiplier: number = 1): void {
    const types = [
      this.spawnPestSpray,
      this.spawnNewspaper,
      this.spawnOnion,
    ];
    if (speedMultiplier >= 1.5) {
      types.push(this.spawnFlipper);
    }
    if (speedMultiplier >= 2.5) {
      types.push(this.spawnBird);
      types.push(this.spawnCatPaw);
    }
    const pick = Phaser.Math.Between(0, types.length - 1);
    types[pick].call(this, x);
  }

  private randomFloor(): Floor {
    if (this.forcedFloor !== null) return this.forcedFloor;
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
    spray.setScale(0.2);
    spray.setImmovable(true);
    spray.setData('floor', floor);
    spray.setData('type', 'spray');
    (spray.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    spray.body!.setSize(spray.width * 0.6, spray.height * 0.7);
    this.playSoundOnVisible(spray, 'spray-sfx', 0.3);

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

    // Gentle scale pulse — subtle breathing, not threatening
    this.scene.tweens.add({
      targets: spray,
      scaleX: 0.216,
      scaleY: 0.216,
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
    const startY = floorY - 40;

    const newspaper = this.obstacles.create(x, startY, 'newspaper') as Phaser.Physics.Arcade.Sprite;
    newspaper.setOrigin(0.5, 1);
    newspaper.setScale(0.2);
    newspaper.setImmovable(true);
    newspaper.setData('floor', floor);
    newspaper.setData('type', 'newspaper');
    (newspaper.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    newspaper.body!.setSize(newspaper.width * 0.6, newspaper.height * 0.7);

    // THE SLAM — predictable rhythm: down 400ms, hold 800ms, up 400ms, wait 800ms
    this.scene.tweens.add({
      targets: newspaper,
      y: floorY,
      duration: 400,
      ease: 'Cubic.easeIn',
      hold: 800,
      yoyo: true,
      repeat: -1,
      repeatDelay: 800,
    });

    // Slight tilt — stays tilted, no rotation animation
    newspaper.setAngle(-8);

    // IMPACT BURST — scale punch and debris on each slam
    // The slam duration is 400ms, repeats every (400 + 800 hold + 400 yoyo + 800 delay)
    const slamCycle = 400 + 800 + 400 + 800;
    this.scene.time.addEvent({
      delay: slamCycle,
      startAt: slamCycle - 400, // first trigger after the first slam lands (400ms)
      loop: true,
      callback: () => {
        const cameraLeft = this.scene.cameras.main.scrollX;
        const cameraRight = cameraLeft + GAME_WIDTH;
        if (newspaper.x >= cameraLeft && newspaper.x <= cameraRight) {
          this.scene.sound.play('newspaper-sfx', { volume: 0.4 });
        }
        // Scale punch — newspaper briefly swells on impact
        this.scene.tweens.add({
          targets: newspaper,
          scaleX: 0.26,
          scaleY: 0.26,
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
    onion.setScale(0.2);
    onion.setImmovable(true);
    onion.setData('floor', floor);
    onion.setData('type', 'onion');
    (onion.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    onion.body!.setSize(onion.width * 0.6, onion.height * 0.7);
    // No dedicated sound for onion

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
    const pivotY = floorY - 20;

    const flipper = this.obstacles.create(x, pivotY, 'flipper') as Phaser.Physics.Arcade.Sprite;
    flipper.setOrigin(0.5, 1);
    flipper.setScale(0.2);
    flipper.setImmovable(true);
    flipper.setData('floor', floor);
    flipper.setData('type', 'flipper');
    (flipper.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    flipper.body!.setSize(flipper.width * 0.6, flipper.height * 0.7);
    this.playSoundOnVisible(flipper, 'flipper-sfx', 0.3);

    // THE SWING — predictable pendulum, narrower arc
    this.scene.tweens.add({
      targets: flipper,
      angle: { from: -40, to: 40 },
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
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
    // Bird swoops between the two floors — stays in the playable area
    const topY = FLOOR_TOP_Y - 20; // just above top floor
    const bottomY = FLOOR_BOTTOM_Y - 5; // just above bottom floor

    const bird = this.obstacles.create(x, topY, 'bird') as Phaser.Physics.Arcade.Sprite;
    bird.setOrigin(0.5, 1);
    bird.setScale(0.2);
    bird.setImmovable(true);
    // Bird can hit on either floor since it travels between them
    bird.setData('floor', null);
    bird.setData('type', 'bird');
    (bird.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    bird.body!.setSize(bird.width * 0.6, bird.height * 0.5);
    this.playSoundOnVisible(bird, 'bird-sfx', 0.4);

    // PREDICTABLE SWOOP — smooth sine wave between top and bottom floors
    this.scene.tweens.add({
      targets: bird,
      y: bottomY,
      duration: 1200,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    // GROUND SHADOW — tracks bird on bottom floor
    const shadow = this.scene.add.ellipse(x, FLOOR_BOTTOM_Y - 2, 30, 8, 0x000000, 0.25);
    shadow.setDepth(0);
    this.scene.events.on('update', () => {
      if (!bird.active) {
        shadow.destroy();
        return;
      }
      // Shadow scales based on bird height — closer to bottom = bigger shadow
      const totalDrop = bottomY - topY;
      const progress = (bird.y - topY) / totalDrop;
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
    paw.setScale(0.2);
    paw.setImmovable(true);
    paw.setData('floor', floor);
    paw.setData('type', 'cat');
    (paw.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    paw.body!.setSize(paw.width * 0.5, paw.height * 0.5);
    paw.setAlpha(0.7);

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
          // Warning phase — the paw tenses
          { alpha: 0.85, duration: 800, ease: 'Sine.easeIn' },
          // STRIKE — fast, violent, fully visible
          {
            scale: 0.26,
            alpha: 1.0,
            duration: 200,
            ease: 'Back.easeOut',
            onComplete: () => {
              const cameraLeft = this.scene.cameras.main.scrollX;
              const cameraRight = cameraLeft + GAME_WIDTH;
              if (paw.x >= cameraLeft && paw.x <= cameraRight) {
                this.scene.sound.play('cat-sfx', { volume: 0.5 });
              }
              spawnClawMarks();
            },
          },
          // Hold the strike
          { scale: 0.26, duration: 150 },
          // Retract — slink back
          { scale: 0.2, alpha: 0.7, duration: 400, ease: 'Sine.easeIn' },
          // Pause before next strike
          { alpha: 0.7, duration: 1500 },
        ],
        onComplete: () => {
          playStrikeSequence();
        },
      });
    };

    playStrikeSequence();
  }
}
