import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, FLOOR_TOP_Y, FLOOR_BOTTOM_Y } from '../config/constants';
import { POINTS_PER_LEVEL } from '../config/levels';

type Floor = 'top' | 'bottom';
type SpawnFn = (x: number) => void;

// Vertical offset from floor Y to center obstacles on the running lane
const OBSTACLE_OFFSET = 45;

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

  spawn(x: number, score: number = 0): void {
    const lvl = Math.floor(score / POINTS_PER_LEVEL) + 1;

    // Lv1: onion only
    const types: SpawnFn[] = [this.spawnOnion];

    // Lv2: +spray, +flipper
    if (lvl >= 2) {
      types.push(this.spawnPestSpray, this.spawnFlipper);
    }
    // Lv3: +newspaper
    if (lvl >= 3) {
      types.push(this.spawnNewspaper);
    }
    // Lv4: +bird
    if (lvl >= 4) {
      types.push(this.spawnBird);
    }
    // Lv5: +cat
    if (lvl >= 5) {
      types.push(this.spawnCatPaw);
    }
    // Lv6: +disco ball
    if (lvl >= 6) {
      types.push(this.spawnDiscoBall);
    }
    // Lv7: +jellyfish
    if (lvl >= 7) {
      types.push(this.spawnJellyfish);
    }
    // Lv8: +pope
    if (lvl >= 8) {
      types.push(this.spawnPope);
    }
    // Lv9: +bison
    if (lvl >= 9) {
      types.push(this.spawnBison);
    }
    // Lv10: +black hole
    if (lvl >= 10) {
      types.push(this.spawnBlackHole);
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

  private getCenterY(floor: Floor): number {
    return this.getFloorY(floor) - OBSTACLE_OFFSET;
  }

  // ── 1. ONION (Lv1) ────────────────────────────────────────────────
  // Sits and stinks.

  private spawnOnion(x: number): void {
    const floor = this.randomFloor();
    const centerY = this.getCenterY(floor);

    const onion = this.obstacles.create(x, centerY, 'onion') as Phaser.Physics.Arcade.Sprite;
    onion.setOrigin(0.5, 0.5);
    onion.setScale(0.2);
    onion.setDepth(10);
    onion.setImmovable(true);
    onion.setData('floor', floor);
    onion.setData('type', 'onion');
    (onion.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    onion.body!.setSize(onion.width * 0.6, onion.height * 0.7);

    // Gentle wobble
    this.scene.tweens.add({
      targets: onion,
      angle: { from: -3, to: 3 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Stink waves
    const stinkStartY = centerY - onion.displayHeight * 0.3;
    for (let i = 0; i < 3; i++) {
      const offsetX = Phaser.Math.Between(-8, 8);
      const stink = this.scene.add.circle(x + offsetX, stinkStartY, 4, 0x99cc33, 0.6);
      stink.setScale(0.5 + i * 0.15);
      stink.setDepth(10);

      this.scene.tweens.add({
        targets: stink,
        y: stinkStartY - 50 - i * 15,
        alpha: 0,
        duration: 1500 + i * 300,
        delay: i * 400,
        repeat: -1,
        ease: 'Sine.easeOut',
        onRepeat: () => {
          stink.y = stinkStartY;
          stink.alpha = 0.6;
        },
      });
    }

    // Tears
    const tearStartY = centerY - onion.displayHeight * 0.2;
    const tearEndY = centerY + onion.displayHeight * 0.4;
    this.scene.time.addEvent({
      delay: 800,
      loop: true,
      callback: () => {
        if (!onion.active) return;
        const side = Phaser.Math.Between(0, 1) === 0 ? -1 : 1;
        const tear = this.scene.add.circle(
          x + side * Phaser.Math.Between(4, 10),
          tearStartY,
          Phaser.Math.Between(1, 3),
          0x4488ff,
          0.7,
        );
        tear.setDepth(10);
        this.scene.tweens.add({
          targets: tear,
          y: tearEndY,
          alpha: 0,
          scaleY: 1.8,
          duration: Phaser.Math.Between(600, 1000),
          ease: 'Quad.easeIn',
          onComplete: () => tear.destroy(),
        });
      },
    });
  }

  // ── 2. PEST SPRAY (Lv2) ───────────────────────────────────────────
  // Sits on the floor and vibrates. Emits mist from the nozzle.

  private spawnPestSpray(x: number): void {
    const floor = this.randomFloor();
    const centerY = this.getCenterY(floor);

    const spray = this.obstacles.create(x, centerY, 'pest-spray') as Phaser.Physics.Arcade.Sprite;
    spray.setOrigin(0.5, 0.5);
    spray.setScale(0.2);
    spray.setDepth(10);
    spray.setImmovable(true);
    spray.setData('floor', floor);
    spray.setData('type', 'spray');
    (spray.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    spray.body!.setSize(spray.width * 0.6, spray.height * 0.7);
    this.playSoundOnVisible(spray, 'spray-sfx', 0.3);

    // Vibration
    this.scene.tweens.add({
      targets: spray,
      x: spray.x + 1.5,
      duration: 50,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Mist from nozzle
    const nozzleY = centerY - spray.displayHeight * 0.45;
    const sprayMist = (): void => {
      if (!spray.active) return;
      for (let i = 0; i < 4; i++) {
        const radius = Phaser.Math.Between(2, 5);
        const droplet = this.scene.add.circle(
          spray.x + Phaser.Math.Between(-3, 3),
          nozzleY + Phaser.Math.Between(-2, 2),
          radius,
          0x88dd44,
          Phaser.Math.FloatBetween(0.15, 0.35),
        );
        droplet.setDepth(10);
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
    this.scene.time.addEvent({ delay: 300, callback: sprayMist, loop: true });
  }

  // ── 3. FLIPPER (Lv2) ──────────────────────────────────────────────
  // Swings pendulum on the floor.

  private spawnFlipper(x: number): void {
    const floor = this.randomFloor();
    const centerY = this.getCenterY(floor);

    const flipper = this.obstacles.create(x, centerY, 'flipper') as Phaser.Physics.Arcade.Sprite;
    flipper.setOrigin(0.5, 0.5);
    flipper.setScale(0.2);
    flipper.setDepth(10);
    flipper.setImmovable(true);
    flipper.setData('floor', floor);
    flipper.setData('type', 'flipper');
    (flipper.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    flipper.body!.setSize(flipper.width * 0.6, flipper.height * 0.7);
    this.playSoundOnVisible(flipper, 'flipper-sfx', 0.3);

    this.scene.tweens.add({
      targets: flipper,
      angle: { from: -40, to: 40 },
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Whoosh arc
    const whooshGfx = this.scene.add.graphics();
    whooshGfx.setDepth(9);
    const arcRadius = flipper.displayHeight * 0.8;
    this.scene.events.on('update', () => {
      if (!flipper.active) { whooshGfx.destroy(); return; }
      whooshGfx.clear();
      const currentAngle = flipper.angle;
      const arcSpan = 25;
      const startRad = Phaser.Math.DegToRad(currentAngle - 90 - arcSpan);
      const endRad = Phaser.Math.DegToRad(currentAngle - 90);
      whooshGfx.lineStyle(3, 0xffffff, 0.25);
      whooshGfx.beginPath();
      whooshGfx.arc(x, centerY, arcRadius, startRad, endRad, false);
      whooshGfx.strokePath();
      whooshGfx.lineStyle(1.5, 0xffffff, 0.12);
      whooshGfx.beginPath();
      whooshGfx.arc(x, centerY, arcRadius * 0.7, startRad, endRad, false);
      whooshGfx.strokePath();
    });
  }

  // ── 4. NEWSPAPER (Lv3) ────────────────────────────────────────────
  // Travels between floors, slower than bird.

  private spawnNewspaper(x: number): void {
    const topY = FLOOR_TOP_Y - OBSTACLE_OFFSET;
    const bottomY = FLOOR_BOTTOM_Y - OBSTACLE_OFFSET;
    const startTop = Math.random() > 0.5;

    const newspaper = this.obstacles.create(x, startTop ? topY : bottomY, 'newspaper') as Phaser.Physics.Arcade.Sprite;
    newspaper.setOrigin(0.5, 0.5);
    newspaper.setScale(0.2);
    newspaper.setDepth(10);
    newspaper.setImmovable(true);
    newspaper.setData('floor', null);
    newspaper.setData('type', 'newspaper');
    (newspaper.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    newspaper.body!.setSize(newspaper.width * 0.6, newspaper.height * 0.7);
    this.playSoundOnVisible(newspaper, 'newspaper-sfx', 0.4);
    newspaper.setAngle(-8);

    this.scene.tweens.add({
      targets: newspaper,
      y: startTop ? bottomY : topY,
      duration: 2000,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  // ── 5. BIRD (Lv4) ─────────────────────────────────────────────────
  // Swoops between floors, faster than newspaper.

  private spawnBird(x: number): void {
    const topY = FLOOR_TOP_Y - OBSTACLE_OFFSET;
    const bottomY = FLOOR_BOTTOM_Y - OBSTACLE_OFFSET;
    const startTop = Math.random() > 0.5;

    const bird = this.obstacles.create(x, startTop ? topY : bottomY, 'bird') as Phaser.Physics.Arcade.Sprite;
    bird.setOrigin(0.5, 0.5);
    bird.setScale(0.2);
    bird.setDepth(10);
    bird.setImmovable(true);
    bird.setData('floor', null);
    bird.setData('type', 'bird');
    (bird.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    bird.body!.setSize(bird.width * 0.6, bird.height * 0.5);
    this.playSoundOnVisible(bird, 'bird-sfx', 0.4);

    this.scene.tweens.add({
      targets: bird,
      y: startTop ? bottomY : topY,
      duration: 1200,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    // Ground shadow
    const shadow = this.scene.add.ellipse(x, FLOOR_BOTTOM_Y - 2, 30, 8, 0x000000, 0.25);
    shadow.setDepth(0);
    this.scene.events.on('update', () => {
      if (!bird.active) { shadow.destroy(); return; }
      const totalDrop = bottomY - topY;
      const progress = (bird.y - topY) / totalDrop;
      const shadowScale = 0.5 + progress * 1.0;
      shadow.setScale(shadowScale, shadowScale * 0.5);
      shadow.setAlpha(0.1 + progress * 0.3);
    });
  }

  // ── 6. CAT PAW (Lv5) ──────────────────────────────────────────────
  // Patrols left-right ~200px on its floor.

  private spawnCatPaw(x: number): void {
    const floor = this.randomFloor();
    const centerY = this.getCenterY(floor);

    const paw = this.obstacles.create(x, centerY, 'cat-paw') as Phaser.Physics.Arcade.Sprite;
    paw.setOrigin(0.5, 0.5);
    paw.setScale(0.2);
    paw.setDepth(10);
    paw.setImmovable(true);
    paw.setData('floor', floor);
    paw.setData('type', 'cat');
    (paw.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    paw.body!.setSize(paw.width * 0.5, paw.height * 0.5);
    this.playSoundOnVisible(paw, 'cat-sfx', 0.5);

    // Patrol 200px
    paw.x = x - 100;
    this.scene.tweens.add({
      targets: paw,
      x: x + 100,
      duration: 1500,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    this.scene.events.on('update', () => {
      if (!paw.active) return;
      paw.setFlipX(paw.x > x);
    });
  }

  // ── 7. DISCO BALL (Lv6) ───────────────────────────────────────────
  // Sits on floor, spins. Strobe flash when cockroach is nearby.

  private spawnDiscoBall(x: number): void {
    const floor = this.randomFloor();
    const centerY = this.getCenterY(floor);

    const disco = this.obstacles.create(x, centerY, 'disco-ball') as Phaser.Physics.Arcade.Sprite;
    disco.setOrigin(0.5, 0.5);
    disco.setScale(0.2);
    disco.setDepth(10);
    disco.setImmovable(true);
    disco.setData('floor', floor);
    disco.setData('type', 'disco');
    (disco.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    disco.body!.setSize(disco.width * 0.6, disco.height * 0.6);
    this.playSoundOnVisible(disco, 'disco-sfx', 0.4);

    // Constant spin
    this.scene.tweens.add({
      targets: disco,
      angle: 360,
      duration: 2000,
      repeat: -1,
      ease: 'Linear',
    });

    // Pulsing scale
    this.scene.tweens.add({
      targets: disco,
      scaleX: 0.23,
      scaleY: 0.23,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Rainbow light ray particles radiating outward
    const rayColors = [0xff00ff, 0x00ffff, 0xffff00, 0x00ff66, 0xff6600, 0x8800ff];
    this.scene.time.addEvent({
      delay: 150,
      loop: true,
      callback: () => {
        if (!disco.active) return;
        const angle = Math.random() * Math.PI * 2;
        const color = Phaser.Utils.Array.GetRandom(rayColors);
        const ray = this.scene.add.rectangle(
          disco.x, disco.y,
          Phaser.Math.Between(2, 4), Phaser.Math.Between(8, 20),
          color, 0.6,
        );
        ray.setDepth(9);
        ray.setRotation(angle);
        const dist = 40 + Math.random() * 30;
        this.scene.tweens.add({
          targets: ray,
          x: disco.x + Math.cos(angle) * dist,
          y: disco.y + Math.sin(angle) * dist,
          alpha: 0,
          duration: 400,
          ease: 'Sine.easeOut',
          onComplete: () => ray.destroy(),
        });
      },
    });

    // Strobe flash when cockroach is within ~250px
    const strobeOverlay = this.scene.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT,
      0xffffff, 0,
    ).setScrollFactor(0).setDepth(90);

    let strobePhase = 0;
    this.scene.events.on('update', () => {
      if (!disco.active) { strobeOverlay.destroy(); return; }
      const cockroach = (this.scene as any).cockroach as Phaser.Physics.Arcade.Sprite;
      if (!cockroach) return;
      const dist = Phaser.Math.Distance.Between(cockroach.x, cockroach.y, disco.x, disco.y);
      if (dist < 250) {
        strobePhase += 0.25;
        const intensity = Math.max(0, (1 - dist / 250)) * 0.6;
        strobeOverlay.setAlpha(Math.abs(Math.sin(strobePhase)) * intensity);
      } else {
        strobeOverlay.setAlpha(0);
      }
    });
  }

  // ── 8. JELLYFISH (Lv7) ────────────────────────────────────────────
  // Floats between floors with wider hitbox, slower than bird.

  private spawnJellyfish(x: number): void {
    const topY = FLOOR_TOP_Y - OBSTACLE_OFFSET;
    const bottomY = FLOOR_BOTTOM_Y - OBSTACLE_OFFSET;
    const startTop = Math.random() > 0.5;

    const jelly = this.obstacles.create(x, startTop ? topY : bottomY, 'jellyfish') as Phaser.Physics.Arcade.Sprite;
    jelly.setOrigin(0.5, 0.5);
    jelly.setScale(0.2);
    jelly.setDepth(10);
    jelly.setImmovable(true);
    jelly.setData('floor', null);
    jelly.setData('type', 'jellyfish');
    (jelly.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    // Wider hitbox for tentacles
    jelly.body!.setSize(jelly.width * 0.7, jelly.height * 0.85);
    this.playSoundOnVisible(jelly, 'jellyfish-sfx', 0.4);

    // Slow drift between floors
    this.scene.tweens.add({
      targets: jelly,
      y: startTop ? bottomY : topY,
      duration: 2500,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    // Pulsing transparency — jellyfish glow
    this.scene.tweens.add({
      targets: jelly,
      alpha: { from: 0.6, to: 1.0 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Trailing tentacle particles
    this.scene.time.addEvent({
      delay: 200,
      loop: true,
      callback: () => {
        if (!jelly.active) return;
        const particle = this.scene.add.circle(
          jelly.x + Phaser.Math.Between(-10, 10),
          jelly.y + jelly.displayHeight * 0.3,
          Phaser.Math.Between(1, 3),
          0x8844ff,
          0.5,
        );
        particle.setDepth(9);
        this.scene.tweens.add({
          targets: particle,
          y: particle.y + 20,
          alpha: 0,
          duration: 600,
          ease: 'Sine.easeOut',
          onComplete: () => particle.destroy(),
        });
      },
    });
  }

  // ── 9. POPE (Lv8) ─────────────────────────────────────────────────
  // Swings between floors like a censer. Leaves lingering smoke trail.

  private spawnPope(x: number): void {
    const topY = FLOOR_TOP_Y - OBSTACLE_OFFSET;
    const bottomY = FLOOR_BOTTOM_Y - OBSTACLE_OFFSET;
    const startTop = Math.random() > 0.5;

    const pope = this.obstacles.create(x, startTop ? topY : bottomY, 'pope') as Phaser.Physics.Arcade.Sprite;
    pope.setOrigin(0.5, 0.5);
    pope.setScale(0.2);
    pope.setDepth(10);
    pope.setImmovable(true);
    pope.setData('floor', null);
    pope.setData('type', 'pope');
    (pope.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    pope.body!.setSize(pope.width * 0.6, pope.height * 0.7);
    this.playSoundOnVisible(pope, 'pope-sfx', 0.4);

    // Pendulum swing between floors
    this.scene.tweens.add({
      targets: pope,
      y: startTop ? bottomY : topY,
      duration: 1800,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    // Slight rotation while swinging
    this.scene.tweens.add({
      targets: pope,
      angle: { from: -15, to: 15 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Smoke trail — lingering hazard circles
    this.scene.time.addEvent({
      delay: 150,
      loop: true,
      callback: () => {
        if (!pope.active) return;
        const smoke = this.scene.add.circle(
          pope.x + Phaser.Math.Between(-5, 5),
          pope.y + Phaser.Math.Between(-5, 5),
          Phaser.Math.Between(4, 8),
          0x888888,
          0.4,
        );
        smoke.setDepth(9);
        // Smoke lingers then fades
        this.scene.tweens.add({
          targets: smoke,
          alpha: 0,
          scale: 2,
          duration: 2000,
          ease: 'Sine.easeOut',
          onComplete: () => smoke.destroy(),
        });
      },
    });
  }

  // ── 10. BISON (Lv9) ───────────────────────────────────────────────
  // Fast charge patrol ~400px. The Żubrówka Dimension's mascot gone mad.

  private spawnBison(x: number): void {
    const floor = this.randomFloor();
    const centerY = this.getCenterY(floor);

    const bison = this.obstacles.create(x, centerY, 'bison') as Phaser.Physics.Arcade.Sprite;
    bison.setOrigin(0.5, 0.5);
    bison.setScale(0.2);
    bison.setDepth(10);
    bison.setImmovable(true);
    bison.setData('floor', floor);
    bison.setData('type', 'bison');
    (bison.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    bison.body!.setSize(bison.width * 0.7, bison.height * 0.6);
    this.playSoundOnVisible(bison, 'bison-sfx', 0.5);

    // Fast charge patrol — 400px range (200 each way), faster than cat
    bison.x = x - 200;
    this.scene.tweens.add({
      targets: bison,
      x: x + 200,
      duration: 1000,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    // Flip based on direction
    this.scene.events.on('update', () => {
      if (!bison.active) return;
      bison.setFlipX(bison.x > x);
    });

    // Dust clouds behind the charge
    this.scene.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => {
        if (!bison.active) return;
        const dust = this.scene.add.circle(
          bison.x + (bison.flipX ? 15 : -15),
          centerY + 10,
          Phaser.Math.Between(2, 4),
          0x997744,
          0.4,
        );
        dust.setDepth(9);
        this.scene.tweens.add({
          targets: dust,
          alpha: 0,
          scale: 2,
          y: dust.y - 10,
          duration: 400,
          ease: 'Sine.easeOut',
          onComplete: () => dust.destroy(),
        });
      },
    });
  }

  // ── 11. BLACK HOLE (Lv10) ──────────────────────────────────────────
  // Sits between floors. Constantly pulls the cockroach toward it.

  private spawnBlackHole(x: number): void {
    const centerY = (FLOOR_TOP_Y + FLOOR_BOTTOM_Y) / 2 - OBSTACLE_OFFSET;

    const hole = this.obstacles.create(x, centerY, 'black-hole') as Phaser.Physics.Arcade.Sprite;
    hole.setOrigin(0.5, 0.5);
    hole.setScale(0.25);
    hole.setDepth(10);
    hole.setImmovable(true);
    hole.setData('floor', null);
    hole.setData('type', 'blackhole');
    (hole.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    hole.body!.setSize(hole.width * 0.5, hole.height * 0.5);
    this.playSoundOnVisible(hole, 'blackhole-sfx', 0.5);

    // Constant slow rotation
    this.scene.tweens.add({
      targets: hole,
      angle: 360,
      duration: 3000,
      repeat: -1,
      ease: 'Linear',
    });

    // Pulsing scale — the void breathes
    this.scene.tweens.add({
      targets: hole,
      scaleX: 0.3,
      scaleY: 0.3,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Gravitational pull on cockroach
    const PULL_RADIUS = 250;
    const PULL_STRENGTH = 80;
    this.scene.events.on('update', () => {
      if (!hole.active) return;
      const cockroach = (this.scene as any).cockroach as Phaser.Physics.Arcade.Sprite;
      if (!cockroach || (this.scene as any).isDead) return;
      const dist = Phaser.Math.Distance.Between(cockroach.x, cockroach.y, hole.x, hole.y);
      if (dist < PULL_RADIUS && dist > 0) {
        const force = PULL_STRENGTH * (1 - dist / PULL_RADIUS);
        const angle = Phaser.Math.Angle.Between(cockroach.x, cockroach.y, hole.x, hole.y);
        const body = cockroach.body as Phaser.Physics.Arcade.Body;
        body.velocity.x += Math.cos(angle) * force;
        body.velocity.y += Math.sin(angle) * force;
      }
    });

    // Particle swirl — matter being sucked in
    this.scene.time.addEvent({
      delay: 80,
      loop: true,
      callback: () => {
        if (!hole.active) return;
        const angle = Math.random() * Math.PI * 2;
        const dist = 30 + Math.random() * 40;
        const px = hole.x + Math.cos(angle) * dist;
        const py = hole.y + Math.sin(angle) * dist;
        const particle = this.scene.add.circle(px, py, Phaser.Math.Between(1, 3), 0x6600cc, 0.7);
        particle.setDepth(9);
        this.scene.tweens.add({
          targets: particle,
          x: hole.x,
          y: hole.y,
          alpha: 0,
          scale: 0.1,
          duration: 500,
          ease: 'Cubic.easeIn',
          onComplete: () => particle.destroy(),
        });
      },
    });
  }
}
