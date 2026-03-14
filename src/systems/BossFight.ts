import Phaser from 'phaser';
import { DEPTH } from '../config/constants';
import { Player } from '../objects/Player';
import { AudioManager } from '../audio/AudioManager';
import { VisualEffects } from '../effects/VisualEffects';
import { GameHUD } from '../ui/GameHUD';

type BossState = 'intro' | 'fighting' | 'victory' | 'resuming' | 'done';

const BOSS_MAX_HP = 50;
const BULLET_SPEED = 600;
const PROJECTILE_SPEED = 300;
const SHOOT_COOLDOWN = 200;
const FIRE_RATE_MAX = 1200;
const FIRE_RATE_MIN = 400;
const OBSTACLE_OFFSET = 25;
const VICTORY_BONUS = 500;

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

  private state: BossState = 'intro';
  private stateTime = 0;

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
  private nextFireInterval = FIRE_RATE_MAX;

  // Boss cue easter egg
  private cueTimer = 0;
  private nextCueTime = 0;

  // Tracked sounds and timers for cleanup
  private beastAmbientSound: Phaser.Sound.BaseSound | null = null;
  private pendingTimeoutIds: number[] = [];

  // Player fixed position during fight
  private playerFixedX = 0;

  constructor(
    scene: Phaser.Scene,
    player: Player,
    audio: AudioManager,
    vfx: VisualEffects,
    hud: GameHUD,
    floorTopY: number,
    floorBottomY: number,
    callbacks: { onComplete: () => void; onDie: (type: string) => void; clearScreen: () => void },
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

    this.playerFixedX = player.x;
    this.bossX = this.scene.cameras.main.scrollX + this.scene.cameras.main.width - 80;
    this.bossY = (floorTopY + floorBottomY) / 2 - OBSTACLE_OFFSET;

    this.bullets = this.scene.physics.add.group();
    this.projectiles = this.scene.physics.add.group();

    this.nextCueTime = 5000 + Math.random() * 5000;

    this.startIntro();
  }

  get isDone(): boolean { return this.state === 'done'; }
  get victoryBonus(): number { return VICTORY_BONUS; }

  // ── Intro ─────────────────────────────────────────────────────────

  private startIntro(): void {
    this.state = 'intro';
    this.stateTime = 0;

    // Explode all visible obstacles and pickups
    this.clearScreen();

    const sprite = this.player.sprite;

    // Decelerate cockroach
    this.scene.tweens.add({
      targets: sprite.body!.velocity,
      x: 0,
      duration: 1000,
      ease: 'Power2',
      onComplete: () => {
        (sprite.body as Phaser.Physics.Arcade.Body).allowGravity = false;
        sprite.setVelocity(0, 0);
        this.playerFixedX = sprite.x; // capture position after deceleration
        this.scene.cameras.main.stopFollow();

        // Rotate cockroach (stand up), then switch to standing sprite
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

    // Godray effect
    this.godrayGraphics = this.scene.add.graphics();
    this.godrayGraphics.setScrollFactor(0);
    this.godrayGraphics.setDepth(DEPTH.GODRAY);
    this.godrayGraphics.setAlpha(0);

    const glockScreenX = sprite.x - cam.scrollX + 10;
    const glockScreenY = sprite.y;

    this.glockSprite = this.scene.add.image(glockScreenX, -50, 'boss-gun');
    this.glockSprite.setScale(0.3).setDepth(DEPTH.OBSTACLES - 1).setScrollFactor(0);
    this.glockSprite.setOrigin(0, 0.5); // left-center origin for recoil rotation

    this.scene.sound.play('boss-choir', { volume: 0.7 });

    // Fade in godray
    this.scene.tweens.add({
      targets: this.godrayGraphics,
      alpha: 0.6,
      duration: 500,
    });

    // Descend glock
    this.scene.tweens.add({
      targets: this.glockSprite,
      y: glockScreenY,
      duration: 1500,
      ease: 'Sine.easeOut',
      onComplete: () => {
        // Gun cock sound
        this.scene.sound.play('dash-ready', { volume: 0.7 });

        // Flash on cockroach
        sprite.setTint(0xffffff);
        this.delay(150, () => sprite.clearTint());

        // Fade out godray
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

    this.bossContainer = this.scene.add.container(
      cam.scrollX + cam.width + 100,
      this.bossY,
    );
    this.bossContainer.setDepth(DEPTH.OBSTACLES);

    for (const face of FACES) {
      const img = this.scene.add.image(face.offsetX, face.offsetY, face.key);
      img.setScale(face.scale);
      this.faceSprites.push(img);
      this.bossContainer.add(img);
    }

    this.beastAmbientSound = this.scene.sound.add('boss-beast-ambient', { volume: 0.5, loop: true });
    this.beastAmbientSound.play();

    // Slide boss in
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
    this.fireTimer = 0;
    this.nextFireInterval = FIRE_RATE_MAX;

    // Stop beast ambient entrance sound
    if (this.beastAmbientSound) {
      this.beastAmbientSound.stop();
      this.beastAmbientSound.destroy();
      this.beastAmbientSound = null;
    }

    this.audio.switchBGM('boss-bgm');
    this.hud.showBossHP('Bestia z Wadowic', this.bossHP, BOSS_MAX_HP);

    // Collisions handled manually in updateFighting()
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

  private updateFighting(delta: number): void {
    // Keep player at fixed X
    this.player.sprite.x = this.playerFixedX;
    this.player.sprite.setVelocityX(0);

    // Glock follows cockroach Y
    const cam = this.scene.cameras.main;
    this.glockSprite.y = this.player.sprite.y;

    // Wobble boss faces
    const time = this.scene.time.now;
    for (let i = 0; i < this.faceSprites.length; i++) {
      const face = this.faceSprites[i];
      const freq = 1.5 + i * 0.3;
      face.setAngle(Math.sin(time * 0.002 * freq) * 3);
      face.y = FACES[i].offsetY + Math.sin(time * 0.003 * freq) * 5;
    }

    // Shoot cooldown
    if (this.shootCooldown > 0) this.shootCooldown -= delta;

    // Boss fire timer
    this.fireTimer += delta;
    if (this.fireTimer >= this.nextFireInterval) {
      this.fireTimer = 0;
      this.bossFireProjectile();
      this.nextFireInterval = FIRE_RATE_MIN + (FIRE_RATE_MAX - FIRE_RATE_MIN) * (this.bossHP / BOSS_MAX_HP);
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
    this.bullets.getChildren().forEach((obj) => {
      const s = obj as Phaser.Physics.Arcade.Sprite;
      if (s.x > camRight) s.destroy();
    });
    this.projectiles.getChildren().forEach((obj) => {
      const s = obj as Phaser.Physics.Arcade.Sprite;
      if (s.x < camLeft) s.destroy();
    });

    // Bullet-projectile collision (manual check)
    const bulletsArr = this.bullets.getChildren().slice();
    const projsArr = this.projectiles.getChildren().slice();
    for (const bObj of bulletsArr) {
      const bullet = bObj as Phaser.Physics.Arcade.Sprite;
      if (!bullet.active) continue;
      for (const pObj of projsArr) {
        const proj = pObj as Phaser.Physics.Arcade.Sprite;
        if (!proj.active) continue;
        const dist = Phaser.Math.Distance.Between(bullet.x, bullet.y, proj.x, proj.y);
        if (dist < 30) {
          const px = proj.x;
          const py = proj.y;
          bullet.destroy();
          proj.destroy();
          this.spawnExplosion(px, py);
          break;
        }
      }
    }

    // Projectile-cockroach collision (manual check)
    const cockroach = this.player.sprite;
    this.projectiles.getChildren().forEach((obj) => {
      const proj = obj as Phaser.Physics.Arcade.Sprite;
      if (!proj.active) return;
      const dist = Phaser.Math.Distance.Between(cockroach.x, cockroach.y, proj.x, proj.y);
      if (dist < 25) {
        this.onProjectileHitsPlayer();
      }
    });

    // Bullet-boss collision (manual since container isn't a physics body)
    this.bullets.getChildren().forEach((obj) => {
      const bullet = obj as Phaser.Physics.Arcade.Sprite;
      if (!bullet.active) return;
      if (bullet.x >= this.bossContainer.x - 60 && bullet.x <= this.bossContainer.x + 60 &&
          bullet.y >= this.bossContainer.y - 80 && bullet.y <= this.bossContainer.y + 80) {
        bullet.destroy();
        this.onBulletHitsBoss();
      }
    });
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

    // Spawn bullet at the glock's world position (glock is scrollFactor 0, so convert)
    const cam = this.scene.cameras.main;
    const gunWorldX = this.glockSprite.x + cam.scrollX + this.glockSprite.displayWidth * 0.8;
    const gunWorldY = this.glockSprite.y + cam.scrollY - this.glockSprite.displayHeight / 2 + 28;
    const bullet = this.bullets.create(gunWorldX, gunWorldY, 'boss-shell') as Phaser.Physics.Arcade.Sprite;
    bullet.setScale(0.4);
    bullet.setDepth(DEPTH.GODRAY);
    (bullet.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    bullet.setVelocityX(BULLET_SPEED);

    this.scene.sound.play('boss-pistol', { volume: 0.5 });

    // Gun recoil — quick rotate up and back
    this.scene.tweens.add({
      targets: this.glockSprite,
      angle: -15,
      duration: 50,
      ease: 'Power2',
      yoyo: true,
    });
  }

  private bossFireProjectile(): void {
    const faceIdx = Phaser.Math.Between(0, 2);
    const face = FACES[faceIdx];
    const lane = face.lane === 'both'
      ? (Math.random() < 0.5 ? 'top' : 'bottom')
      : face.lane;
    const y = (lane === 'top' ? this.floorTopY : this.floorBottomY) - OBSTACLE_OFFSET;

    const proj = this.projectiles.create(this.bossContainer.x, y, face.projectileKey) as Phaser.Physics.Arcade.Sprite;
    proj.setScale(0.3);
    proj.setDepth(DEPTH.GODRAY);
    (proj.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    proj.setVelocityX(-PROJECTILE_SPEED);

    this.scene.sound.play(face.shotSound, { volume: 0.4 });
  }

  // ── Collisions ────────────────────────────────────────────────────

  private onBulletHitsProjectile(
    bulletObj: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    projObj: Phaser.Types.Physics.Arcade.GameObjectWithBody,
  ): void {
    const bullet = bulletObj as Phaser.Physics.Arcade.Sprite;
    const proj = projObj as Phaser.Physics.Arcade.Sprite;
    const x = proj.x;
    const y = proj.y;
    bullet.destroy();
    proj.destroy();
    this.spawnExplosion(x, y);
  }

  private onBulletHitsBoss(): void {
    this.bossHP--;
    this.hud.updateBossHP(this.bossHP);

    // Hurt sound
    const hurtIdx = Phaser.Math.Between(1, 6);
    this.scene.sound.play(`boss-hurt-${hurtIdx}`, { volume: 0.5 });

    // Flash boss white
    this.faceSprites.forEach(f => f.setTint(0xffffff));
    this.delay(100, () => {
      this.faceSprites.forEach(f => f.clearTint());
    });

    // Small explosion on boss
    this.spawnExplosion(
      this.bossContainer.x + Phaser.Math.Between(-40, 40),
      this.bossContainer.y + Phaser.Math.Between(-40, 40),
    );

    if (this.bossHP <= 0) {
      this.startVictory();
    }
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

  // ── Victory ───────────────────────────────────────────────────────

  /** Schedule a delayed call using real time (immune to timeScale). */
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

    // Destroy remaining combat objects
    this.projectiles.clear(true, true);
    this.bullets.clear(true, true);

    // Heavy screen shake
    this.scene.cameras.main.shake(500, 0.04);

    // Explosion chain on boss
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

    // Boss fade out after explosions
    this.delay(1500, () => {
      if (this.bossContainer && this.bossContainer.active) {
        this.scene.tweens.add({
          targets: this.bossContainer,
          alpha: 0,
          duration: 400,
          onComplete: () => { this.bossContainer.destroy(); },
        });
      }

      // Victory fanfare
      this.scene.sound.play('boss-victory', { volume: 0.7 });

      // +2137 score text
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

      // Glock flies away spinning
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

      // Resume after short fanfare
      this.delay(1500, () => this.startResume());
    });
  }

  private startResume(): void {
    this.state = 'resuming';

    this.hud.hideBossHP();

    // Switch back to running sprite and reset angle
    this.player.sprite.setTexture('cockroach-idle');
    this.player.sprite.setAngle(0);

    // Restore player physics
    (this.player.sprite.body as Phaser.Physics.Arcade.Body).allowGravity = true;

    // Resume camera follow
    this.scene.cameras.main.startFollow(this.player.sprite, true, 1, 0);
    this.scene.cameras.main.setFollowOffset(-200, 0);

    this.state = 'done';
    this.onComplete();
  }

  // ── Cleanup ───────────────────────────────────────────────────────

  private cleanup(): void {
    // Cancel all pending timers
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

  destroy(): void {
    this.cleanup();
  }
}
