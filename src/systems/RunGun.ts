/**
 * The pistol in the run (cockroach#100; the rules are gunRules.ts): Space or the gun button fires along the roach's
 * lane, a bullet downs the first enemy it meets there (each enemy's sprite carries how: ObstacleKit's Shootable), walls
 * and a hanging cloud stop it. An aerosol can's blast (blast) downs what is round it, the roach too if it is that close.
 * Local to this client and drawing nothing from the seed: shots never change the course.
 */
import Phaser from 'phaser';
import { AudioManager, VOL } from '../audio/AudioManager';
import { DEPTH } from '../config/constants';
import { gunfire } from '../effects/Gunfire';
import { getFx } from '../effects/Fx';
import { Player } from '../objects/Player';
import type { Lane } from '../objects/obstacles/behaviours';
import type { Shootable } from '../objects/obstacles/ObstacleKit';
import { ENEMIES, EnemyId, enemyState } from '../objects/obstacles/cast';
import { Ammo, BULLET_SPEED, SHOT_COOLDOWN_MS, Target, caughtInBlast, firstHit } from './gunRules';

/** A wall's half width for a bullet (the plank wall's body, obstacles/wall.ts). */
const WALL_HALF = 15;
/** The casing lands this long after the shot. */
const CASING_DELAY_MS = 260;
/** The magazine's pips flash this long after a dry click. */
const DRY_FLASH_MS = 500;

interface Bullet {
  image: Phaser.GameObjects.Image;
  lane: Lane;
}

export interface RunGunCallbacks {
  /** An enemy went down: score it (base points, the popup's word) and count it. */
  onKill: (sprite: Phaser.Physics.Arcade.Sprite, base: number, label: string) => void;
  /** The roach was caught in a blast. */
  killRoach: (cause: string, culprit: Phaser.Physics.Arcade.Sprite) => void;
}

export class RunGun {
  readonly ammo = new Ammo();
  private bullets: Bullet[] = [];
  private readyAt = 0;
  /** Until when the HUD's pips flash: the last shot found the magazine empty. */
  dryUntil = 0;

  constructor(
    private scene: Phaser.Scene & { runTime: number },
    private player: Player,
    private obstacles: Phaser.Physics.Arcade.Group,
    private audio: AudioManager,
    private callbacks: RunGunCallbacks,
    private killScore: number,
    private blastBonus: number,
  ) {
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.clear());
  }

  /** The trigger. Nothing between shots; a dry click with the magazine empty. */
  fire(): void {
    const now = this.scene.time.now;
    if (now < this.readyAt) return;
    this.readyAt = now + SHOT_COOLDOWN_MS;
    if (!this.ammo.take()) {
      this.dryUntil = now + DRY_FLASH_MS;
      this.audio.playSfx('ui-press', VOL.gameplay);
      return;
    }
    const muzzle = this.player.runShoot();
    gunfire(this.scene, muzzle, this.player.sprite.depth);
    const image = this.scene.add.image(muzzle.x, muzzle.y, 'boss-shell').setScale(0.4).setDepth(DEPTH.GODRAY);
    this.bullets.push({ image, lane: this.player.currentFloor });
    this.audio.playSfx('boss-pistol', VOL.gameplay);
    this.scene.time.delayedCall(CASING_DELAY_MS, () => this.audio.playSfx('shell-casing', VOL.pickup));
  }

  /** A box picked up. */
  reload(rounds: number): number {
    return this.ammo.add(rounds);
  }

  /** Every frame of the run: the bullets fly and meet what is in their lane. */
  update(deltaMs: number): void {
    const camera = this.scene.cameras.main;
    const right = camera.scrollX + camera.width + 50;
    const t = this.scene.runTime;
    this.bullets = this.bullets.filter((bullet) => {
      const from = bullet.image.x;
      const to = from + (BULLET_SPEED * Math.min(deltaMs, 50)) / 1000;
      bullet.image.x = to;
      const hit = this.meet(bullet.lane, from, to, t);
      if (hit === 'stop') {
        this.spark(bullet.image.x, bullet.image.y, true);
        bullet.image.destroy();
        return false;
      }
      if (hit) {
        // The spark where the bullet meets it: its body's edge, for one over the lane (the zapper) a little above
        const top = hit.body ? hit.body.top : bullet.image.y;
        const bottom = hit.body ? hit.body.bottom : bullet.image.y;
        this.spark(bullet.image.x, Phaser.Math.Clamp(bullet.image.y, top, bottom), false);
        bullet.image.destroy();
        this.hit(hit);
        return false;
      }
      if (to > right) {
        bullet.image.destroy();
        return false;
      }
      return true;
    });
  }

  /** What a bullet meets between from and to: an enemy, 'stop' for a wall or a hanging cloud, or nothing. */
  private meet(lane: Lane, from: number, to: number, t: number): Phaser.Physics.Arcade.Sprite | 'stop' | null {
    const targets: Target<Phaser.Physics.Arcade.Sprite | 'stop'>[] = [];
    for (const obj of this.obstacles.getChildren()) {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      if (!sprite.active || !sprite.body?.enable || sprite.getData('falling')) continue;
      if (sprite.getData('type') === 'wall') {
        targets.push({ what: 'stop', span: { x0: sprite.x - WALL_HALF, x1: sprite.x + WALL_HALF } });
        continue;
      }
      const plan = sprite.getData('plan');
      // The cloud wall is the dash's, like a wall: its hanging cloud stops a bullet
      if (plan && ENEMIES[plan.id as EnemyId]?.role === 'wall') {
        const zone = enemyState(plan, t).zones.find(z => z.lane === lane);
        if (zone) targets.push({ what: 'stop', span: zone });
        continue;
      }
      const shootable = sprite.getData('shootable') as Shootable | undefined;
      if (!shootable || shootable.hits <= 0) continue;
      targets.push({ what: sprite, span: shootable.span(lane, t) });
    }
    return firstHit(targets, from, to);
  }

  private hit(sprite: Phaser.Physics.Arcade.Sprite): void {
    const shootable = sprite.getData('shootable') as Shootable;
    shootable.hits--;
    if (shootable.hits > 0) {
      shootable.onHit?.(shootable.hits);
      this.audio.playSfx('bullet-hit', VOL.gameplay);
      return;
    }
    this.down(sprite, 'shot');
  }

  /** An enemy goes down: scored, and gone (or left to see to its own end). */
  private down(sprite: Phaser.Physics.Arcade.Sprite, by: 'shot' | 'blast'): void {
    const shootable = sprite.getData('shootable') as Shootable;
    shootable.hits = 0;
    this.callbacks.onKill(sprite, by === 'blast' ? this.blastBonus : this.killScore, by === 'blast' ? 'WYBUCH!' : 'TRAFIONY!');
    if (shootable.onDown?.(by)) return;
    const fx = getFx(this.scene);
    const { y } = sprite.getCenter();
    fx.play('poof', sprite.x, y, { depth: DEPTH.POPUP - 1 });
    fx.play('spark-big', sprite.x - 10, y, { depth: DEPTH.POPUP });
    fx.burst('chunk-shell', sprite.x, y, 5, 10, { depth: DEPTH.POPUP - 1, speed: [80, 200], gravity: 500 });
    this.audio.playSfx('shot-down', VOL.gameplay);
    sprite.destroy();
  }

  /**
   * Something went off: what is within the radius of it along both lanes goes down (a can among them goes off in
   * turn), and the roach with it unless it is dashing.
   */
  blast(source: Phaser.Physics.Arcade.Sprite, radius: number, cause: string): void {
    const { x } = source;
    for (const obj of this.obstacles.getChildren().slice()) {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      const shootable = sprite.getData('shootable') as Shootable | undefined;
      if (!sprite.active || !shootable || shootable.hits <= 0 || !caughtInBlast(x, sprite.x, radius)) continue;
      this.down(sprite, 'blast');
    }
    if (caughtInBlast(x, this.player.x, radius) && !this.player.isDashing) this.callbacks.killRoach(cause, source);
  }

  /** A bullet stopped: a white spark, and off a wall the ricochet. */
  private spark(x: number, y: number, ricochet: boolean): void {
    getFx(this.scene).play('spark', x, y, { depth: DEPTH.POPUP });
    if (ricochet) this.audio.playSfx('bullet-ricochet', VOL.gameplay * 0.8);
  }

  clear(): void {
    for (const bullet of this.bullets) bullet.image.destroy();
    this.bullets = [];
  }
}
