/** The fight's rules and state machine. Shots live in BossGunnery, everything visual in BossVisuals. */
import Phaser from 'phaser';
import { AudioManager } from '../audio/AudioManager';
import { BossProjectileData, GameEventBridge } from '../multiplayer/GameEventBridge';
import { Player } from '../objects/Player';
import { GameHUD } from '../ui/GameHUD';
import { BOSS_MAX_HP } from './boss/bossConfig';
import { BossGunnery, FIRE_RATE_START } from './boss/BossGunnery';
import { BossVisuals } from './boss/BossVisuals';

type BossState = 'intro' | 'fighting' | 'victory' | 'done';

export type BossFightRole = 'host' | 'client' | 'solo';

const SHOOT_COOLDOWN = 250;
const VICTORY_BONUS = 500;
const PROJECTILE_SCORE = 5;

// Rage phase constants
const RAGE_HP_PERCENTAGES = [0.5, 0.25]; // 50% and 25% HP
const RAGE_SHOT_COUNT = 6;
const RAGE_SHOT_DELAY = 550; // ms between rage shots — dodgeable
const RAGE_WINDUP_DELAY = 800; // delay before rage shots start

// Boss charge constants
const CHARGE_HP_SHARE = 0.16;
const CHARGE_SPEED = 15; // px/s advance toward player
const CHARGE_TIME_THRESHOLD = 60000; // also start charging after 60s

export class BossFight {
  private scene: Phaser.Scene;
  private player: Player;
  private audio: AudioManager;
  private hud: GameHUD;
  private onComplete: () => void;
  private onDie: (type: string) => void;
  private addScore: (points: number) => void;

  private visuals: BossVisuals;
  private gunnery: BossGunnery;

  private state: BossState = 'intro';
  private fightTime = 0; // time spent in fighting state

  private bossHP = BOSS_MAX_HP;
  private bossStartHP = BOSS_MAX_HP;

  private shootCooldown = 0;
  private fireTimer = 0;
  private nextFireInterval = FIRE_RATE_START;

  // Rage phase
  private rageTriggered: boolean[] = RAGE_HP_PERCENTAGES.map(() => false);
  private isRaging = false;
  private isCharging = false;
  private rageShots = 0;
  private rageLastLane: 'top' | 'bottom' = 'top';

  // Boss cue easter egg
  private cueTimer = 0;
  private nextCueTime = 5000 + Math.random() * 5000;

  private pendingTimers: Phaser.Time.TimerEvent[] = [];

  // Player fixed position during fight
  private playerFixedX = 0;

  // Multiplayer role
  private role: BossFightRole;
  private eventBridge: GameEventBridge | null;

  constructor(
    scene: Phaser.Scene,
    player: Player,
    audio: AudioManager,
    hud: GameHUD,
    floorTopY: number,
    floorBottomY: number,
    callbacks: {
      onComplete: () => void;
      onDie: (type: string) => void;
      addScore: (points: number) => void;
    },
    role: BossFightRole = 'solo',
    eventBridge?: GameEventBridge,
  ) {
    this.scene = scene;
    this.player = player;
    this.audio = audio;
    this.hud = hud;
    this.onComplete = callbacks.onComplete;
    this.onDie = callbacks.onDie;
    this.addScore = callbacks.addScore;
    this.role = role;
    this.eventBridge = eventBridge ?? null;
    this.playerFixedX = player.x;

    this.visuals = new BossVisuals(scene, player, audio, floorTopY, floorBottomY);
    this.gunnery = new BossGunnery(scene, audio, floorTopY, floorBottomY, this.eventBridge);
    this.gunnery.isHost = role === 'host';

    // Force-end any active pill/dash effects
    this.player.forceEndEffects();
    this.visuals.playIntro(
      () => { this.playerFixedX = player.sprite.x; },
      () => this.startFighting(),
    );
  }

  get isFighting(): boolean { return this.state === 'fighting'; }
  get victoryBonus(): number { return VICTORY_BONUS; }

  private startFighting(): void {
    this.state = 'fighting';
    this.fightTime = 0;
    this.fireTimer = 0;
    this.nextFireInterval = FIRE_RATE_START;

    this.bossStartHP = this.bossHP;
    this.audio.switchBGM('boss-bgm');
    this.hud.showBossHP('Bestia spod Zlewu', this.bossHP, this.bossStartHP);
  }

  // ── Update ────────────────────────────────────────────────────────

  update(delta: number): void {
    this.visuals.followPlayerWithGlock();

    switch (this.state) {
      case 'intro':
        this.visuals.updateGodray();
        break;
      case 'fighting':
        this.updateFighting(delta);
        break;
      case 'done':
        // Keep boss visuals alive for spectators
        if (this.visuals.bossAlive) this.visuals.wobbleFaces();
        break;
    }
  }

  private updateFighting(delta: number): void {
    this.fightTime += delta;

    // Keep player at fixed X
    this.player.sprite.x = this.playerFixedX;
    this.player.sprite.setVelocityX(0);

    this.visuals.wobbleFaces(this.isCharging ? 3 : 1);

    if (this.shootCooldown > 0) this.shootCooldown -= delta;

    if (this.role !== 'client' && !this.isRaging) {
      this.checkRage();
      this.updateFireTimer(delta);
    }

    this.updateCharge(delta);
    this.updateCues(delta);

    // Sliced because destroy() modifies the underlying arrays
    const bullets = this.gunnery.bullets.getChildren().slice() as Phaser.Physics.Arcade.Sprite[];
    const projectiles = this.gunnery.projectiles.getChildren().slice() as Phaser.Physics.Arcade.Sprite[];
    this.gunnery.removeOffScreen(bullets, projectiles);
    this.resolveCollisions(bullets, projectiles);
  }

  private checkRage(): void {
    for (let i = 0; i < RAGE_HP_PERCENTAGES.length; i++) {
      const threshold = Math.floor(this.bossStartHP * RAGE_HP_PERCENTAGES[i]);
      if (!this.rageTriggered[i] && this.bossHP <= threshold) {
        this.rageTriggered[i] = true;
        this.startRagePhase();
        return;
      }
    }
  }

  private updateFireTimer(delta: number): void {
    if (this.isRaging) return;
    this.fireTimer += delta;
    if (this.fireTimer >= this.nextFireInterval) {
      this.fireTimer = 0;
      this.gunnery.fireProjectile(this.visuals.bossContainer.x, this.fightTime);
      this.nextFireInterval = this.gunnery.fireRateAt(this.fightTime);
    }
  }

  /** The boss creeps forward at low HP or after 60s, so a fight can't be farmed. */
  private updateCharge(delta: number): void {
    const chargeHpThreshold = Math.floor(this.bossStartHP * CHARGE_HP_SHARE);
    const shouldCharge = (this.bossHP <= chargeHpThreshold || this.fightTime >= CHARGE_TIME_THRESHOLD) && this.visuals.bossAlive;
    if (!shouldCharge) return;

    if (!this.isCharging) {
      this.isCharging = true;
      this.scene.cameras.main.shake(400, 0.03);
      this.visuals.tintFaces(0xff0000);
      this.delay(300, () => {
        if (!this.isRaging) this.visuals.clearFaceTint();
      });
    }
    const boss = this.visuals.bossContainer;
    boss.x = Math.max(this.playerFixedX + 200, boss.x - CHARGE_SPEED * (delta / 1000));
  }

  private updateCues(delta: number): void {
    this.cueTimer += delta;
    if (this.cueTimer >= this.nextCueTime) {
      this.cueTimer = 0;
      this.nextCueTime = 5000 + Math.random() * 5000;
      this.audio.playSfx(`boss-cue-${Phaser.Math.Between(1, 7)}`, 0.5);
    }
  }

  private resolveCollisions(bullets: Phaser.Physics.Arcade.Sprite[], projectiles: Phaser.Physics.Arcade.Sprite[]): void {
    // Bullet-projectile
    for (const bullet of bullets) {
      if (!bullet.active) continue;
      for (const proj of projectiles) {
        if (!proj.active || proj.getData('indestructible')) continue;
        if (Phaser.Math.Distance.Between(bullet.x, bullet.y, proj.x, proj.y) < 30) {
          const px = proj.x;
          const py = proj.y;
          bullet.destroy();
          proj.destroy();
          this.visuals.spawnExplosion(px, py);
          this.addScore(PROJECTILE_SCORE);
          this.visuals.showProjectileScore(px, py, PROJECTILE_SCORE);
          break;
        }
      }
    }

    // Projectile-cockroach
    const cockroach = this.player.sprite;
    for (const proj of projectiles) {
      if (!proj.active) continue;
      if (Phaser.Math.Distance.Between(cockroach.x, cockroach.y, proj.x, proj.y) < 25) {
        this.onProjectileHitsPlayer();
      }
    }

    // Bullet-boss (the boss is invulnerable during rage)
    if (this.isRaging) return;
    const boss = this.visuals.bossContainer;
    for (const bullet of bullets) {
      if (!bullet.active) continue;
      if (bullet.x >= boss.x - 60 && bullet.x <= boss.x + 60 && bullet.y >= boss.y - 80 && bullet.y <= boss.y + 80) {
        bullet.destroy();
        this.onBulletHitsBoss();
      }
    }
  }

  // ── Shooting ──────────────────────────────────────────────────────

  shoot(): void {
    if (this.state !== 'fighting') return;
    if (this.shootCooldown > 0) return;

    this.shootCooldown = SHOOT_COOLDOWN;

    const cam = this.scene.cameras.main;
    const glock = this.visuals.glock;
    this.gunnery.fireBullet(
      glock.x + cam.scrollX + glock.displayWidth * 0.8,
      glock.y + cam.scrollY - glock.displayHeight / 2 + 28,
    );
    this.eventBridge?.onBossShoot();
    this.visuals.kickGlock();
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
    this.visuals.tintFaces(0xff0000);
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

    this.gunnery.fireIndestructible(this.visuals.bossContainer.x, this.fightTime, lane);

    this.rageShots++;
    this.delay(RAGE_SHOT_DELAY, () => this.fireRageShot());
  }

  private endRagePhase(): void {
    this.isRaging = false;
    this.visuals.clearFaceTint();
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

    this.audio.playSfx(`boss-hurt-${Phaser.Math.Between(1, 6)}`, 0.5);

    this.visuals.tintFaces(this.isRaging ? 0xff0000 : 0xffffff);
    this.delay(100, () => {
      if (this.isRaging) this.visuals.tintFaces(0xff0000);
      else this.visuals.clearFaceTint();
    });

    this.visuals.explodeAroundBoss(40);
  }

  private onProjectileHitsPlayer(): void {
    this.state = 'done';
    if (this.role === 'solo') {
      this.cleanup();
    } else {
      // Multiplayer: keep boss visuals alive for spectators, just hide player's glock
      this.visuals.destroyGlock();
      this.gunnery.bullets.clear(true, true);
    }
    this.onDie('boss');
  }

  // ── Victory ───────────────────────────────────────────────────────

  private delay(ms: number, fn: () => void): void {
    const timer = this.scene.time.delayedCall(ms, () => {
      if (this.state !== 'done') fn();
    });
    this.pendingTimers.push(timer);
  }

  private startVictory(): void {
    this.state = 'victory';
    this.gunnery.clear();

    this.scene.cameras.main.shake(500, 0.04);

    this.audio.playSfx('boss-explosion', 0.7);
    for (let i = 0; i < 10; i++) {
      this.delay(i * 150, () => {
        if (this.visuals.bossAlive) this.visuals.explodeAroundBoss(60);
      });
    }

    this.delay(1500, () => {
      this.visuals.playDefeat(VICTORY_BONUS);
      this.delay(1500, () => this.startResume());
    });
  }

  private startResume(): void {
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
    for (const timer of this.pendingTimers) timer.destroy();
    this.pendingTimers = [];
    this.gunnery.clear();
    this.visuals.destroy();
    this.hud.hideBossHP();
  }

  // ── Multiplayer ───────────────────────────────────────────────────

  spawnExternalProjectile(data: BossProjectileData): void {
    if (!data.indestructible && this.isRaging) {
      this.isRaging = false;
      this.visuals.clearFaceTint();
    }
    const bossX = this.visuals.bossContainer.x;
    if (data.indestructible) {
      this.gunnery.fireIndestructible(bossX, this.fightTime, data.lane);
    } else {
      this.gunnery.fireProjectile(bossX, this.fightTime, data.lane);
    }
  }

  updateHP(hp: number): void {
    if (hp > this.bossStartHP) {
      this.bossStartHP = hp;
    }
    this.bossHP = hp;
    this.hud.updateBossHP(this.bossHP);
    if (this.bossHP <= 0) {
      this.startVictory();
    }
  }

  triggerExternalRage(): void {
    if (this.isRaging) return;
    this.isRaging = true;
    this.visuals.tintFaces(0xff0000);
    this.scene.cameras.main.shake(300, 0.02);
  }

  promoteToHost(): void {
    this.role = 'host';
    this.gunnery.isHost = true;
  }

  destroy(): void {
    this.cleanup();
  }
}
