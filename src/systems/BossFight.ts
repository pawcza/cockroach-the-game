import Phaser from 'phaser';
import { DEPTH } from '../config/constants';
import { popupStyle } from '../utils/TextStyles';
import { Player } from '../objects/Player';
import { AudioManager } from '../audio/AudioManager';
import { VisualEffects } from '../effects/VisualEffects';
import { GameHUD } from '../ui/GameHUD';
import { GameEventBridge, BossProjectileData } from '../multiplayer/GameEventBridge';

type BossState = 'intro' | 'fighting' | 'victory' | 'resuming' | 'done';

export type BossFightRole = 'host' | 'client' | 'solo';

export const BOSS_MAX_HP = 50;
const BULLET_SPEED = 600;
const SHOOT_COOLDOWN = 250;
const OBSTACLE_OFFSET = 25;
const VICTORY_BONUS = 500;
const PROJECTILE_SCORE = 5;

// Time-based difficulty constants
const FIRE_RATE_START = 1200;
const FIRE_RATE_MIN = 350;
const PROJECTILE_SPEED_START = 300;
const PROJECTILE_SPEED_MAX = 500;
const DIFFICULTY_RAMP_TIME = 60000; // 60 seconds to reach max difficulty

// Rage phase constants
const RAGE_HP_PERCENTAGES = [0.5, 0.25]; // 50% and 25% HP
const RAGE_SHOT_COUNT = 6;
const RAGE_SHOT_DELAY = 550; // ms between rage shots — dodgeable
const RAGE_WINDUP_DELAY = 800; // delay before rage shots start

// Indestructible projectile chance during normal phase (increases with time)
const INDESTRUCTIBLE_BASE_CHANCE = 0.03;
const INDESTRUCTIBLE_MAX_CHANCE = 0.12;

// Boss charge constants
const CHARGE_HP_THRESHOLD = 8; // last ~15% of 50
const CHARGE_SPEED = 15; // px/s advance toward player
const CHARGE_TIME_THRESHOLD = 60000; // also start charging after 60s

// Multi-volley: chance increases with time
const VOLLEY_BASE_CHANCE = 0;
const VOLLEY_MAX_CHANCE = 0.35;
const VOLLEY_OFFSET_X = 60; // px gap between paired projectiles

interface FaceConfig {
  key: string;
  projectileKey: string;
  shotSound: string;
  offsetX: number;
  offsetY: number;
  scale: number;
  lane: 'top' | 'bottom' | 'both';
}

const FACES: FaceConfig[] = [
  { key: 'boss-face1', projectileKey: 'boss-bomb', shotSound: 'boss-bomb-shot', offsetX: -40, offsetY: -75, scale: 0.35, lane: 'top' },
  { key: 'boss-face2', projectileKey: 'boss-creamcake', shotSound: 'boss-creamcake-shot', offsetX: 30, offsetY: 0, scale: 0.30, lane: 'both' },
  { key: 'boss-face3', projectileKey: 'boss-dollar', shotSound: 'boss-dollar-shot', offsetX: -20, offsetY: 70, scale: 0.32, lane: 'bottom' },
];

export class BossFight {
  private scene: Phaser.Scene;
  private player: Player;
  private audio: AudioManager;
  private vfx: VisualEffects;
  private hud: GameHUD;
  private floorTopY: number;
  private floorBottomY: number;
  private onComplete: () => void;
  private onDie: (type: string) => void;
  private clearScreen: () => void;
  private addScore: (points: number) => void;

  private state: BossState = 'intro';
  private stateTime = 0;
  private fightTime = 0; // time spent in fighting state

  // Boss
  private bossContainer!: Phaser.GameObjects.Container;
  private faceSprites: Phaser.GameObjects.Image[] = [];
  private bossHP = BOSS_MAX_HP;
  private bossX = 0;
  private bossY = 0;

  // Glock
  private glockSprite!: Phaser.GameObjects.Image;
  private godrayGraphics!: Phaser.GameObjects.Graphics;

  // Combat
  private bullets!: Phaser.Physics.Arcade.Group;
  private projectiles!: Phaser.Physics.Arcade.Group;
  private shootCooldown = 0;
  private fireTimer = 0;
  private nextFireInterval = FIRE_RATE_START;

  // Rage phase
  private rageTriggered: boolean[] = [];
  private isRaging = false;
  private isCharging = false;
  private rageShots = 0;
  private rageLastLane: 'top' | 'bottom' = 'top';

  // Boss cue easter egg
  private cueTimer = 0;
  private nextCueTime = 0;

  // Tracked sounds and timers for cleanup
  private beastAmbientSound: Phaser.Sound.BaseSound | null = null;
  private pendingTimeoutIds: number[] = [];

  // Player fixed position during fight
  private playerFixedX = 0;

  // Multiplayer role
  private role: BossFightRole;
  private eventBridge: GameEventBridge | null;

  constructor(
    scene: Phaser.Scene,
    player: Player,
    audio: AudioManager,
    vfx: VisualEffects,
    hud: GameHUD,
    floorTopY: number,
    floorBottomY: number,
    callbacks: {
      onComplete: () => void;
      onDie: (type: string) => void;
      clearScreen: () => void;
      addScore: (points: number) => void;
    },
    role: BossFightRole = 'solo',
    eventBridge?: GameEventBridge,
  ) {
    this.scene = scene;
    this.player = player;
    this.audio = audio;
    this.vfx = vfx;
    this.hud = hud;
    this.floorTopY = floorTopY;
    this.floorBottomY = floorBottomY;
    this.onComplete = callbacks.onComplete;
    this.onDie = callbacks.onDie;
    this.clearScreen = callbacks.clearScreen;
    this.addScore = callbacks.addScore;
    this.role = role;
    this.eventBridge = eventBridge ?? null;

    this.playerFixedX = player.x;
    const cam = this.scene.cameras.main;
    this.bossX = cam.scrollX + cam.width - 95;
    this.bossY = (floorTopY + floorBottomY) / 2 - OBSTACLE_OFFSET;

    this.bullets = this.scene.physics.add.group();
    this.projectiles = this.scene.physics.add.group();

    this.nextCueTime = 5000 + Math.random() * 5000;
    this.rageTriggered = RAGE_HP_PERCENTAGES.map(() => false);

    this.startIntro();
  }

  get isDone(): boolean { return this.state === 'done'; }
  get victoryBonus(): number { return VICTORY_BONUS; }

  // ── Intro ─────────────────────────────────────────────────────────

  private startIntro(): void {
    this.state = 'intro';
    this.stateTime = 0;
    this.clearScreen();

    // Force-end any active pill/dash effects
    this.player.forceEndEffects();

    const sprite = this.player.sprite;

    this.scene.tweens.add({
      targets: sprite.body!.velocity,
      x: 0,
      duration: 1000,
      ease: 'Power2',
      onComplete: () => {
        sprite.setVelocity(0, 0);
        this.playerFixedX = sprite.x;
        this.scene.cameras.main.stopFollow();

        this.scene.tweens.add({
          targets: sprite,
          angle: -90,
          duration: 500,
          ease: 'Power2',
          onComplete: () => {
            sprite.setTexture('cockroach-standing');
            this.startGlockDescent();
          },
        });
      },
    });
  }

  private startGlockDescent(): void {
    const sprite = this.player.sprite;
    const cam = this.scene.cameras.main;

    this.godrayGraphics = this.scene.add.graphics();
    this.godrayGraphics.setScrollFactor(0);
    this.godrayGraphics.setDepth(DEPTH.GODRAY);
    this.godrayGraphics.setAlpha(0);

    const glockScreenX = sprite.x - cam.scrollX + 10;
    const glockScreenY = sprite.y;

    this.glockSprite = this.scene.add.image(glockScreenX, -50, 'boss-gun');
    this.glockSprite.setScale(0.3).setDepth(DEPTH.OBSTACLES - 1).setScrollFactor(0);
    this.glockSprite.setOrigin(0, 0.5);

    this.scene.sound.play('boss-choir', { volume: 0.7 });

    this.scene.tweens.add({ targets: this.godrayGraphics, alpha: 0.6, duration: 500 });

    this.scene.tweens.add({
      targets: this.glockSprite,
      y: glockScreenY,
      duration: 1500,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.scene.sound.play('dash-ready', { volume: 0.7 });
        sprite.setTint(0xffffff);
        this.delay(150, () => sprite.clearTint());

        this.scene.tweens.add({
          targets: this.godrayGraphics,
          alpha: 0,
          duration: 500,
          onComplete: () => this.godrayGraphics.destroy(),
        });

        this.startBossEntrance();
      },
    });
  }

  private startBossEntrance(): void {
    const cam = this.scene.cameras.main;

    this.bossContainer = this.scene.add.container(cam.scrollX + cam.width + 100, this.bossY);
    this.bossContainer.setDepth(DEPTH.OBSTACLES);

    for (const face of FACES) {
      const img = this.scene.add.image(face.offsetX, face.offsetY, face.key);
      img.setScale(face.scale);
      this.faceSprites.push(img);
      this.bossContainer.add(img);
    }

    this.beastAmbientSound = this.scene.sound.add('boss-beast-ambient', { volume: 0.5, loop: true });
    this.beastAmbientSound.play();

    this.scene.tweens.add({
      targets: this.bossContainer,
      x: this.bossX,
      duration: 1000,
      ease: 'Power2',
      onComplete: () => this.startFighting(),
    });
  }

  private startFighting(): void {
    this.state = 'fighting';
    this.stateTime = 0;
    this.fightTime = 0;
    this.fireTimer = 0;
    this.nextFireInterval = FIRE_RATE_START;

    if (this.beastAmbientSound) {
      this.beastAmbientSound.stop();
      this.beastAmbientSound.destroy();
      this.beastAmbientSound = null;
    }

    this.audio.switchBGM('boss-bgm');
    this.hud.showBossHP('Bestia z Wadowic', this.bossHP, this.bossHP);
  }

  // ── Update ────────────────────────────────────────────────────────

  update(delta: number): void {
    this.stateTime += delta;

    switch (this.state) {
      case 'intro':
        this.updateGodray();
        break;
      case 'fighting':
        this.updateFighting(delta);
        break;
    }
  }

  private getDifficultyProgress(): number {
    return Math.min(this.fightTime / DIFFICULTY_RAMP_TIME, 1);
  }

  private getCurrentFireRate(): number {
    const t = this.getDifficultyProgress();
    return FIRE_RATE_START - (FIRE_RATE_START - FIRE_RATE_MIN) * t;
  }

  private getCurrentProjectileSpeed(): number {
    const t = this.getDifficultyProgress();
    return PROJECTILE_SPEED_START + (PROJECTILE_SPEED_MAX - PROJECTILE_SPEED_START) * t;
  }

  private getVolleyChance(): number {
    const t = this.getDifficultyProgress();
    return VOLLEY_BASE_CHANCE + (VOLLEY_MAX_CHANCE - VOLLEY_BASE_CHANCE) * t;
  }

  private updateFighting(delta: number): void {
    this.fightTime += delta;

    // Keep player at fixed X
    this.player.sprite.x = this.playerFixedX;
    this.player.sprite.setVelocityX(0);

    // Glock follows cockroach Y
    this.glockSprite.y = this.player.sprite.y;

    // Wobble boss faces — more intense during charge
    const time = this.scene.time.now;
    const wobbleMult = this.isCharging ? 3 : 1;
    for (let i = 0; i < this.faceSprites.length; i++) {
      const face = this.faceSprites[i];
      const freq = 1.5 + i * 0.3;
      face.setAngle(Math.sin(time * 0.002 * freq * wobbleMult) * 3 * wobbleMult);
      face.y = FACES[i].offsetY + Math.sin(time * 0.003 * freq * wobbleMult) * 5 * wobbleMult;
    }

    // Shoot cooldown
    if (this.shootCooldown > 0) this.shootCooldown -= delta;

    // Rage phase check
    if (this.role !== 'client') {
      if (!this.isRaging) {
        for (let i = 0; i < RAGE_HP_PERCENTAGES.length; i++) {
          const threshold = Math.floor(BOSS_MAX_HP * RAGE_HP_PERCENTAGES[i]);
          if (!this.rageTriggered[i] && this.bossHP <= threshold) {
            this.rageTriggered[i] = true;
            this.startRagePhase();
            break;
          }
        }
      }
    }

    // Boss fire timer (skip during rage — rage has its own firing)
    if (this.role !== 'client') {
      if (!this.isRaging) {
        this.fireTimer += delta;
        if (this.fireTimer >= this.nextFireInterval) {
          this.fireTimer = 0;
          this.bossFireProjectile();
          this.nextFireInterval = this.getCurrentFireRate();
        }
      }
    }

    // Boss charge — at low HP or after 60s (anti-farming)
    const shouldCharge = (this.bossHP <= CHARGE_HP_THRESHOLD || this.fightTime >= CHARGE_TIME_THRESHOLD) && this.bossContainer.active;
    if (shouldCharge) {
      if (!this.isCharging) {
        this.isCharging = true;
        this.scene.cameras.main.shake(400, 0.03);
        this.faceSprites.forEach(f => f.setTint(0xff0000));
        this.delay(300, () => {
          if (!this.isRaging) this.faceSprites.forEach(f => f.clearTint());
        });
      }
      const minBossX = this.playerFixedX + 200;
      this.bossContainer.x = Math.max(minBossX, this.bossContainer.x - CHARGE_SPEED * (delta / 1000));
    }

    // Boss cue sounds
    this.cueTimer += delta;
    if (this.cueTimer >= this.nextCueTime) {
      this.cueTimer = 0;
      this.nextCueTime = 5000 + Math.random() * 5000;
      const cueIdx = Phaser.Math.Between(1, 7);
      this.scene.sound.play(`boss-cue-${cueIdx}`, { volume: 0.5 });
    }

    // Cleanup off-screen
    const camLeft = this.scene.cameras.main.scrollX - 50;
    const camRight = this.scene.cameras.main.scrollX + this.scene.cameras.main.width + 50;
    this.bullets.getChildren().slice().forEach((obj) => {
      const s = obj as Phaser.Physics.Arcade.Sprite;
      if (s.x > camRight) s.destroy();
    });
    this.projectiles.getChildren().slice().forEach((obj) => {
      const s = obj as Phaser.Physics.Arcade.Sprite;
      if (s.x < camLeft) s.destroy();
    });

    // Bullet-projectile collision
    const bulletsArr = this.bullets.getChildren().slice();
    const projsArr = this.projectiles.getChildren().slice();
    for (const bObj of bulletsArr) {
      const bullet = bObj as Phaser.Physics.Arcade.Sprite;
      if (!bullet.active) continue;
      for (const pObj of projsArr) {
        const proj = pObj as Phaser.Physics.Arcade.Sprite;
        if (!proj.active) continue;
        // Skip indestructible projectiles
        if (proj.getData('indestructible')) continue;
        const dist = Phaser.Math.Distance.Between(bullet.x, bullet.y, proj.x, proj.y);
        if (dist < 30) {
          const px = proj.x;
          const py = proj.y;
          bullet.destroy();
          proj.destroy();
          this.spawnExplosion(px, py);
          this.showProjectileScore(px, py);
          break;
        }
      }
    }

    // Projectile-cockroach collision
    const cockroach = this.player.sprite;
    this.projectiles.getChildren().slice().forEach((obj) => {
      const proj = obj as Phaser.Physics.Arcade.Sprite;
      if (!proj.active) return;
      const dist = Phaser.Math.Distance.Between(cockroach.x, cockroach.y, proj.x, proj.y);
      if (dist < 25) {
        this.onProjectileHitsPlayer();
      }
    });

    // Bullet-boss collision (skip during rage — boss is invulnerable)
    if (!this.isRaging) {
      this.bullets.getChildren().slice().forEach((obj) => {
        const bullet = obj as Phaser.Physics.Arcade.Sprite;
        if (!bullet.active) return;
        if (bullet.x >= this.bossContainer.x - 60 && bullet.x <= this.bossContainer.x + 60 &&
            bullet.y >= this.bossContainer.y - 80 && bullet.y <= this.bossContainer.y + 80) {
          bullet.destroy();
          this.onBulletHitsBoss();
        }
      });
    }
  }

  private updateGodray(): void {
    if (!this.godrayGraphics || !this.godrayGraphics.active) return;
    const cx = this.glockSprite?.x ?? this.scene.cameras.main.width / 2;
    const cy = this.glockSprite?.y ?? this.scene.cameras.main.height / 2;
    const time = this.scene.time.now;

    this.godrayGraphics.clear();
    const rayCount = 12;
    for (let i = 0; i < rayCount; i++) {
      const angle = (i / rayCount) * Math.PI * 2 + time * 0.0005;
      const length = 200;
      const x2 = cx + Math.cos(angle) * length;
      const y2 = cy + Math.sin(angle) * length;
      this.godrayGraphics.lineStyle(3, 0xffff88, 0.3);
      this.godrayGraphics.lineBetween(cx, cy, x2, y2);
    }
  }

  // ── Shooting ──────────────────────────────────────────────────────

  shoot(): void {
    if (this.state !== 'fighting') return;
    if (this.shootCooldown > 0) return;

    this.shootCooldown = SHOOT_COOLDOWN;

    const cam = this.scene.cameras.main;
    const gunWorldX = this.glockSprite.x + cam.scrollX + this.glockSprite.displayWidth * 0.8;
    const gunWorldY = this.glockSprite.y + cam.scrollY - this.glockSprite.displayHeight / 2 + 28;
    const bullet = this.bullets.create(gunWorldX, gunWorldY, 'boss-shell') as Phaser.Physics.Arcade.Sprite;
    bullet.setScale(0.4);
    bullet.setDepth(DEPTH.GODRAY);
    (bullet.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    bullet.setVelocityX(BULLET_SPEED);

    this.scene.sound.play('boss-pistol', { volume: 0.5 });
    this.eventBridge?.onBossShoot();

    this.scene.tweens.add({
      targets: this.glockSprite,
      angle: -15,
      duration: 50,
      ease: 'Power2',
      yoyo: true,
    });
  }

  private bossFireProjectile(overrideLane?: 'top' | 'bottom'): void {
    const faceIdx = Phaser.Math.Between(0, 2);
    const face = FACES[faceIdx];
    const lane = overrideLane ?? (face.lane === 'both'
      ? (Math.random() < 0.5 ? 'top' : 'bottom')
      : face.lane);

    // Chance to fire indestructible projectile instead
    const indestructibleChance = INDESTRUCTIBLE_BASE_CHANCE + (INDESTRUCTIBLE_MAX_CHANCE - INDESTRUCTIBLE_BASE_CHANCE) * this.getDifficultyProgress();
    if (!overrideLane && Math.random() < indestructibleChance) {
      this.fireIndestructible(lane);
      return;
    }

    const y = (lane === 'top' ? this.floorTopY : this.floorBottomY) - OBSTACLE_OFFSET;
    const speed = this.getCurrentProjectileSpeed();

    const proj = this.projectiles.create(this.bossContainer.x, y, face.projectileKey) as Phaser.Physics.Arcade.Sprite;
    proj.setScale(0.3);
    proj.setDepth(DEPTH.GODRAY);
    (proj.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    proj.setVelocityX(-speed);

    if (this.role === 'host') {
      this.eventBridge?.onBossProjectile({ lane: lane as 'top' | 'bottom', speed, faceIdx, indestructible: false, volley: false });
    }

    this.scene.sound.play(face.shotSound, { volume: 0.4 });

    // Multi-volley: chance to fire a second projectile on same lane
    if (!overrideLane && Math.random() < this.getVolleyChance()) {
      const proj2 = this.projectiles.create(this.bossContainer.x + VOLLEY_OFFSET_X, y, face.projectileKey) as Phaser.Physics.Arcade.Sprite;
      proj2.setScale(0.3);
      proj2.setDepth(DEPTH.GODRAY);
      (proj2.body as Phaser.Physics.Arcade.Body).allowGravity = false;
      proj2.setVelocityX(-speed);

      if (this.role === 'host') {
        this.eventBridge?.onBossProjectile({ lane: lane as 'top' | 'bottom', speed, faceIdx, indestructible: false, volley: true });
      }
    }
  }

  private fireIndestructible(lane: 'top' | 'bottom'): void {
    const y = (lane === 'top' ? this.floorTopY : this.floorBottomY) - OBSTACLE_OFFSET;
    const speed = this.getCurrentProjectileSpeed() * 0.8;

    const container = this.scene.add.container(this.bossContainer.x, y);
    container.setDepth(DEPTH.OBSTACLES);
    for (const face of FACES) {
      const img = this.scene.add.image(0, 0, face.projectileKey);
      img.setScale(0.6);
      container.add(img);
    }
    // Rotate
    this.scene.tweens.add({ targets: container, angle: 360, duration: 1000, repeat: -1, ease: 'Linear' });
    // Wobble Y
    this.scene.tweens.add({ targets: container, y: y - 8, duration: 200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const hitbox = this.projectiles.create(this.bossContainer.x, y, FACES[0].projectileKey) as Phaser.Physics.Arcade.Sprite;
    hitbox.setAlpha(0).setScale(0.6);
    hitbox.setData('indestructible', true);
    (hitbox.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    hitbox.setVelocityX(-speed);

    if (this.role === 'host') {
      this.eventBridge?.onBossProjectile({ lane, speed, faceIdx: -1, indestructible: true, volley: false });
    }

    const updateFn = (): void => {
      if (!hitbox.active) { container.destroy(); this.scene.events.off('update', updateFn); return; }
      container.x = hitbox.x;
      container.y = hitbox.y;
    };
    this.scene.events.on('update', updateFn);

    // Play all 3 shot sounds at once
    for (const face of FACES) {
      this.scene.sound.play(face.shotSound, { volume: 0.3 });
    }
  }

  // ── Rage Phase ────────────────────────────────────────────────────

  private startRagePhase(): void {
    if (this.role === 'host') {
      this.eventBridge?.onBossRage();
    }

    this.isRaging = true;
    this.rageShots = 0;
    this.rageLastLane = Math.random() < 0.5 ? 'top' : 'bottom';

    // Flash boss red + shake as warning
    this.faceSprites.forEach(f => f.setTint(0xff0000));
    this.scene.cameras.main.shake(300, 0.02);

    // Windup delay before rage shots begin
    this.delay(RAGE_WINDUP_DELAY, () => this.fireRageShot());
  }

  private fireRageShot(): void {
    if (this.state !== 'fighting' || this.rageShots >= RAGE_SHOT_COUNT) {
      this.endRagePhase();
      return;
    }

    // Strong bias to alternate lanes (80% chance to switch)
    const switchLane = Math.random() < 0.8;
    const lane: 'top' | 'bottom' = switchLane
      ? (this.rageLastLane === 'top' ? 'bottom' : 'top')
      : this.rageLastLane;
    this.rageLastLane = lane;

    this.fireIndestructible(lane);

    this.rageShots++;
    this.delay(RAGE_SHOT_DELAY, () => this.fireRageShot());
  }

  private endRagePhase(): void {
    this.isRaging = false;
    this.faceSprites.forEach(f => f.clearTint());
  }

  // ── Collisions ────────────────────────────────────────────────────

  private onBulletHitsBoss(): void {
    if (this.role === 'solo') {
      this.bossHP--;
      this.hud.updateBossHP(this.bossHP);
      if (this.bossHP <= 0) {
        this.startVictory();
      }
    } else {
      this.eventBridge?.onBossHit();
    }

    const hurtIdx = Phaser.Math.Between(1, 6);
    this.scene.sound.play(`boss-hurt-${hurtIdx}`, { volume: 0.5 });

    this.faceSprites.forEach(f => f.setTint(this.isRaging ? 0xff0000 : 0xffffff));
    this.delay(100, () => {
      if (!this.isRaging) this.faceSprites.forEach(f => f.clearTint());
      else this.faceSprites.forEach(f => f.setTint(0xff0000));
    });

    this.spawnExplosion(
      this.bossContainer.x + Phaser.Math.Between(-40, 40),
      this.bossContainer.y + Phaser.Math.Between(-40, 40),
    );
  }

  private onProjectileHitsPlayer(): void {
    this.state = 'done';
    this.cleanup();
    this.onDie('boss');
  }

  private spawnExplosion(x: number, y: number): void {
    const key = `boss-explosion${Phaser.Math.Between(1, 3)}`;
    const exp = this.scene.add.image(x, y, key);
    exp.setScale(0.3).setDepth(DEPTH.VFX_TEXT);
    this.scene.tweens.add({
      targets: exp,
      alpha: 0,
      scale: 0.6,
      duration: 300,
      onComplete: () => exp.destroy(),
    });
  }

  private showProjectileScore(x: number, y: number): void {
    this.addScore(PROJECTILE_SCORE);
    const popup = this.scene.add.text(x, y - 15, `+${PROJECTILE_SCORE}`, popupStyle({
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

  // ── Victory ───────────────────────────────────────────────────────

  private delay(ms: number, fn: () => void): void {
    const id = window.setTimeout(() => {
      const idx = this.pendingTimeoutIds.indexOf(id);
      if (idx !== -1) this.pendingTimeoutIds.splice(idx, 1);
      if (this.state !== 'done') fn();
    }, ms);
    this.pendingTimeoutIds.push(id);
  }

  private startVictory(): void {
    this.state = 'victory';
    this.stateTime = 0;

    this.projectiles.clear(true, true);
    this.bullets.clear(true, true);

    this.scene.cameras.main.shake(500, 0.04);

    this.scene.sound.play('boss-explosion', { volume: 0.7 });
    for (let i = 0; i < 10; i++) {
      this.delay(i * 150, () => {
        if (!this.bossContainer || !this.bossContainer.active) return;
        this.spawnExplosion(
          this.bossContainer.x + Phaser.Math.Between(-60, 60),
          this.bossContainer.y + Phaser.Math.Between(-60, 60),
        );
      });
    }

    this.delay(1500, () => {
      if (this.bossContainer && this.bossContainer.active) {
        this.scene.tweens.add({
          targets: this.bossContainer,
          alpha: 0,
          duration: 400,
          onComplete: () => { this.bossContainer.destroy(); },
        });
      }

      this.scene.sound.play('boss-victory', { volume: 0.7 });

      const cam = this.scene.cameras.main;
      const bonusText = this.scene.add.text(cam.width / 2, cam.height / 2, `+${VICTORY_BONUS}`, {
        fontSize: '32px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#ffff00',
        stroke: '#000000',
        strokeThickness: 6,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.POPUP);

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
        targets: this.glockSprite,
        x: this.glockSprite.x + 200,
        y: this.glockSprite.y - 300,
        angle: 720,
        alpha: 0,
        duration: 1000,
        ease: 'Power2',
        onComplete: () => { if (this.glockSprite?.active) this.glockSprite.destroy(); },
      });

      this.delay(1500, () => this.startResume());
    });
  }

  private startResume(): void {
    this.state = 'resuming';

    this.hud.hideBossHP();

    // Fully reset cockroach state — handles texture, angle, physics body, floor position
    this.player.resumeAfterBossFight();

    this.scene.cameras.main.startFollow(this.player.sprite, true, 1, 0);
    this.scene.cameras.main.setFollowOffset(-200, 0);

    this.state = 'done';
    this.onComplete();
  }

  // ── Cleanup ───────────────────────────────────────────────────────

  private cleanup(): void {
    for (const id of this.pendingTimeoutIds) window.clearTimeout(id);
    this.pendingTimeoutIds = [];

    this.projectiles?.clear(true, true);
    this.bullets?.clear(true, true);
    if (this.bossContainer?.active) this.bossContainer.destroy();
    if (this.glockSprite?.active) this.glockSprite.destroy();
    if (this.godrayGraphics?.active) this.godrayGraphics.destroy();
    if (this.beastAmbientSound) {
      this.beastAmbientSound.stop();
      this.beastAmbientSound.destroy();
      this.beastAmbientSound = null;
    }
    this.hud.hideBossHP();
  }

  spawnExternalProjectile(data: BossProjectileData): void {
    if (!data.indestructible && this.isRaging) {
      this.isRaging = false;
      this.faceSprites.forEach(f => f.clearTint());
    }
    if (data.indestructible) {
      this.fireIndestructible(data.lane);
    } else {
      this.bossFireProjectile(data.lane);
    }
  }

  updateHP(hp: number): void {
    this.bossHP = hp;
    this.hud.updateBossHP(this.bossHP);
    if (this.bossHP <= 0) {
      this.startVictory();
    }
  }

  triggerExternalRage(): void {
    if (this.isRaging) return;
    this.isRaging = true;
    this.faceSprites.forEach(f => f.setTint(0xff0000));
    this.scene.cameras.main.shake(300, 0.02);
  }

  promoteToHost(): void {
    this.role = 'host';
  }

  destroy(): void {
    this.cleanup();
  }
}
