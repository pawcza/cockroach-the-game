/** Everything flying in the fight: the player's bullets and the boss's shots, and how those get harder over time. */
import Phaser from 'phaser';
import { AudioManager } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { BossProjectileData, GameEventBridge } from '../../multiplayer/GameEventBridge';
import { FACES, OBSTACLE_OFFSET } from './bossConfig';

const BULLET_SPEED = 600;

export const FIRE_RATE_START = 1200;
const FIRE_RATE_MIN = 350;
const PROJECTILE_SPEED_START = 300;
const PROJECTILE_SPEED_MAX = 500;
const DIFFICULTY_RAMP_TIME = 60000; // 60 seconds to reach max difficulty

// Indestructible projectile chance during normal phase (increases with time)
const INDESTRUCTIBLE_BASE_CHANCE = 0.03;
const INDESTRUCTIBLE_MAX_CHANCE = 0.12;

// Multi-volley: chance increases with time
const VOLLEY_BASE_CHANCE = 0;
const VOLLEY_MAX_CHANCE = 0.35;
const VOLLEY_OFFSET_X = 60; // px gap between paired projectiles

type Lane = 'top' | 'bottom';

export class BossGunnery {
  private scene: Phaser.Scene;
  private audio: AudioManager;
  private floorTopY: number;
  private floorBottomY: number;
  private eventBridge: GameEventBridge | null;
  /** Only the host announces shots: clients fire what it announced. */
  isHost = false;

  readonly bullets: Phaser.Physics.Arcade.Group;
  readonly projectiles: Phaser.Physics.Arcade.Group;

  constructor(
    scene: Phaser.Scene,
    audio: AudioManager,
    floorTopY: number,
    floorBottomY: number,
    eventBridge: GameEventBridge | null,
  ) {
    this.scene = scene;
    this.audio = audio;
    this.floorTopY = floorTopY;
    this.floorBottomY = floorBottomY;
    this.eventBridge = eventBridge;
    this.bullets = scene.physics.add.group();
    this.projectiles = scene.physics.add.group();
  }

  fireRateAt(fightTime: number): number {
    return FIRE_RATE_START - (FIRE_RATE_START - FIRE_RATE_MIN) * this.difficulty(fightTime);
  }

  private difficulty(fightTime: number): number {
    return Math.min(fightTime / DIFFICULTY_RAMP_TIME, 1);
  }

  private speedAt(fightTime: number): number {
    return PROJECTILE_SPEED_START + (PROJECTILE_SPEED_MAX - PROJECTILE_SPEED_START) * this.difficulty(fightTime);
  }

  private laneY(lane: Lane): number {
    return (lane === 'top' ? this.floorTopY : this.floorBottomY) - OBSTACLE_OFFSET;
  }

  fireBullet(x: number, y: number): void {
    const bullet = this.bullets.create(x, y, 'boss-shell') as Phaser.Physics.Arcade.Sprite;
    bullet.setScale(0.4);
    bullet.setDepth(DEPTH.GODRAY);
    (bullet.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    bullet.setVelocityX(BULLET_SPEED);
    this.audio.playSfx('boss-pistol', 0.5);
  }

  /** Normal shot from a random face. `overrideLane` replays a shot announced by the host. */
  fireProjectile(bossX: number, fightTime: number, overrideLane?: Lane): void {
    const faceIdx = Phaser.Math.Between(0, 2);
    const face = FACES[faceIdx];
    const lane = overrideLane ?? (face.lane === 'both'
      ? (Math.random() < 0.5 ? 'top' : 'bottom')
      : face.lane);

    const progress = this.difficulty(fightTime);
    const indestructibleChance = INDESTRUCTIBLE_BASE_CHANCE + (INDESTRUCTIBLE_MAX_CHANCE - INDESTRUCTIBLE_BASE_CHANCE) * progress;
    if (!overrideLane && Math.random() < indestructibleChance) {
      this.fireIndestructible(bossX, fightTime, lane);
      return;
    }

    const speed = this.speedAt(fightTime);
    this.spawnProjectile(bossX, lane, face.projectileKey, speed);
    this.announce({ lane, speed, faceIdx, indestructible: false, volley: false });

    this.audio.playSfx(face.shotSound, 0.4);

    // Multi-volley: chance to fire a second projectile on same lane
    const volleyChance = VOLLEY_BASE_CHANCE + (VOLLEY_MAX_CHANCE - VOLLEY_BASE_CHANCE) * progress;
    if (!overrideLane && Math.random() < volleyChance) {
      this.spawnProjectile(bossX + VOLLEY_OFFSET_X, lane, face.projectileKey, speed);
      this.announce({ lane, speed, faceIdx, indestructible: false, volley: true });
    }
  }

  fireIndestructible(bossX: number, fightTime: number, lane: Lane): void {
    const y = this.laneY(lane);
    const speed = this.speedAt(fightTime) * 0.8;

    const container = this.scene.add.container(bossX, y);
    container.setDepth(DEPTH.OBSTACLES);
    for (const face of FACES) {
      const img = this.scene.add.image(0, 0, face.projectileKey);
      img.setScale(0.6);
      container.add(img);
    }
    this.scene.tweens.add({ targets: container, angle: 360, duration: 1000, repeat: -1, ease: 'Linear' });

    const hitbox = this.projectiles.create(bossX, y, FACES[0].projectileKey) as Phaser.Physics.Arcade.Sprite;
    hitbox.setAlpha(0).setScale(0.6);
    hitbox.setData('indestructible', true);
    (hitbox.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    hitbox.setVelocityX(-speed);

    this.announce({ lane, speed, faceIdx: -1, indestructible: true, volley: false });

    // The visible stack rides the invisible hitbox and goes with it, however the hitbox is removed
    const follow = (): void => {
      container.x = hitbox.x;
      container.y = hitbox.y;
    };
    this.scene.events.on('update', follow);
    hitbox.once('destroy', () => {
      this.scene.events.off('update', follow);
      this.scene.tweens.killTweensOf(container);
      container.destroy();
    });

    // Play all 3 shot sounds at once
    for (const face of FACES) {
      this.audio.playSfx(face.shotSound, 0.3);
    }
  }

  private spawnProjectile(x: number, lane: Lane, key: string, speed: number): void {
    const proj = this.projectiles.create(x, this.laneY(lane), key) as Phaser.Physics.Arcade.Sprite;
    proj.setScale(0.3);
    proj.setDepth(DEPTH.GODRAY);
    (proj.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    proj.setVelocityX(-speed);
  }

  private announce(data: BossProjectileData): void {
    if (this.isHost) this.eventBridge?.onBossProjectile(data);
  }

  removeOffScreen(bullets: Phaser.Physics.Arcade.Sprite[], projectiles: Phaser.Physics.Arcade.Sprite[]): void {
    const camera = this.scene.cameras.main;
    const camLeft = camera.scrollX - 50;
    const camRight = camera.scrollX + camera.width + 50;
    for (const s of bullets) {
      if (s.x > camRight) s.destroy();
    }
    for (const s of projectiles) {
      if (s.x < camLeft) s.destroy();
    }
  }

  clear(): void {
    // On scene shutdown the physics world has already destroyed both groups, and their sprites with them
    if (!this.projectiles.children) return;
    this.projectiles.clear(true, true);
    this.bullets.clear(true, true);
  }
}
