/** Zlewiatan's gun fight: its rules and state machine. Shots live in BossGunnery, everything visual in BossVisuals. */
import Phaser from 'phaser';
import { VOL } from '../../audio/AudioManager';
import { gunfire } from '../../effects/Gunfire';
import { BossProjectileData } from '../../multiplayer/GameEventBridge';
import { BOSS_MAX_HP } from './bossConfig';
import { BossFight, BossFightContext } from './BossFight';
import { BossGunnery, FIRE_RATE_START, PUDDLE_HALF_WIDTH, Shot } from './BossGunnery';
import { BossVisuals, FRONT_GAP } from './BossVisuals';
import { ShotKind, shotHalfWidth, shotHitRadius } from './zlewiatanConfig';

// A bullet meets a projectile of its own lane this close, along the lane, or at the shot's drawn edge if it is wider
const INTERCEPT_PX = 30;

const SHOOT_COOLDOWN = 250;
// Each shot nudges the roach back a few px, and it eases back in
const RECOIL_PX = 4;
const RECOIL_MS = 120;
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

// Solo only, for now: the pierog's sour cream and the carp's bubble, now and then in place of their usual shot
const SMIETANA_CHANCE = 0.3;
const SMIETANA_FROM_MS = 12000;
const SMIETANA_COOLDOWN_MS = 7000;
const BUBBLE_CHANCE = 0.3;
const BUBBLE_FROM_MS = 8000;
const BUBBLE_COOLDOWN_MS = 6000;
// A shot is on its lane's line by the time it's this far past the creature's front, world px
const SETTLE_PAST_FRONT = 30;

export class ZlewiatanFight extends BossFight {
  readonly victoryBonus = VICTORY_BONUS;

  private visuals: BossVisuals;
  private gunnery: BossGunnery;

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

  /** A spit under way whose shot hasn't left yet: an announced extra skwarka joins it. */
  private pending: Shot | null = null;
  private lastSmietana = -Infinity;
  private lastBubble = -Infinity;

  // Boss cue easter egg
  private cueTimer = 0;
  private nextCueTime = 5000 + Math.random() * 5000;

  // How far the last shot has pushed the roach back of where it stands
  private recoil = 0;

  constructor(ctx: BossFightContext) {
    super(ctx);
    const { scene, player, audio, floorTopY, floorBottomY, eventBridge, role } = ctx;

    this.visuals = new BossVisuals(scene, player, audio, floorTopY, floorBottomY);
    this.gunnery = new BossGunnery(scene, audio, floorTopY, floorBottomY, eventBridge);
    this.gunnery.isHost = role === 'host';

    this.brake(() => this.visuals.playIntro(
      () => this.startFighting(),
      ctx.abilities.canShoot,
      () => ctx.abilities.grant('gun'),
    ));
  }

  private startFighting(): void {
    this.state = 'fighting';
    this.fightTime = 0;
    this.fireTimer = 0;
    this.nextFireInterval = FIRE_RATE_START;

    this.bossStartHP = this.bossHP;
    this.ctx.audio.switchBGM('boss-bgm');
    this.ctx.showBar(this.bossHP, this.bossStartHP);
  }

  // ── Update ────────────────────────────────────────────────────────

  update(delta: number): void {
    switch (this.state) {
      case 'intro':
        this.visuals.updateGodray();
        break;
      case 'fighting':
        this.updateFighting(delta);
        break;
      case 'done':
        // Multiplayer spectators still watch the host's shots fly onto their lanes
        if (this.visuals.bossAlive) {
          this.gunnery.update();
          const projectiles = this.gunnery.projectiles.getChildren().slice() as Phaser.Physics.Arcade.Sprite[];
          this.gunnery.removeOffScreen([], projectiles);
        }
        break;
    }
  }

  private updateFighting(delta: number): void {
    this.fightTime += delta;

    // Keep player at fixed X, but for a shot's recoil
    this.recoil = Math.max(0, this.recoil - (RECOIL_PX * delta) / RECOIL_MS);
    this.holdPlayer(Math.round(this.recoil));

    if (this.shootCooldown > 0) this.shootCooldown -= delta;

    if (this.ctx.role !== 'client' && !this.isRaging) {
      this.checkRage();
      this.updateFireTimer(delta);
    }

    this.updateCharge(delta);
    this.updateCues(delta);
    this.gunnery.update();

    // Sliced because destroy() modifies the underlying arrays
    const bullets = this.gunnery.bullets.getChildren().slice() as Phaser.Physics.Arcade.Sprite[];
    const projectiles = this.gunnery.projectiles.getChildren().slice() as Phaser.Physics.Arcade.Sprite[];
    this.gunnery.removeOffScreen(bullets, projectiles);
    this.resolveCollisions(bullets, projectiles);
    // A hit or the last bullet may have ended the fight just now: nothing more to check on this frame
    if (this.state !== 'fighting') return;
    this.checkPuddles();
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
      const interval = this.nextFireInterval;
      const shot = this.gunnery.planShot(this.fightTime);
      if (!this.trySpecial(shot, interval)) {
        this.gunnery.announce(shot);
        this.launch(shot, interval);
      }
      this.nextFireInterval = this.gunnery.fireRateAt(this.fightTime);
    }
  }

  /**
   * The head rears back and spits; its shot leaves the mouth on the release frame and settles onto its lane by the
   * time it's past the creature's front. The radiator is the tower's throw.
   */
  private launch(shot: Shot, interval: number): void {
    this.pending = shot;
    this.visuals.spit(shot.head, interval, () => {
      if (this.pending === shot) this.pending = null;
      this.gunnery.fire(shot, this.visuals.mouth(`spit-${shot.head}`), this.settleX());
    });
  }

  private settleX(): number {
    const front = this.visuals.frontX(this.gunnery.laneY('top'), this.isCharging) ?? this.visuals.bossX;
    return front - SETTLE_PAST_FRONT;
  }

  /** Solo, now and then: the pierog lobs sour cream at where the roach stands, the carp blows a bubble. */
  private trySpecial(shot: Shot, interval: number): boolean {
    if (this.ctx.role !== 'solo' || shot.indestructible) return false;
    const now = this.fightTime;
    if (shot.head === 'pierog' && now >= SMIETANA_FROM_MS && now - this.lastSmietana >= SMIETANA_COOLDOWN_MS
      && Math.random() < SMIETANA_CHANCE) {
      this.lastSmietana = now;
      const lane = this.ctx.player.currentFloor;
      this.visuals.spit('pierog', interval, () => {
        this.gunnery.lobSmietana(this.visuals.mouth('spit-pierog'), this.holdX, lane);
      });
      return true;
    }
    if (shot.head === 'carp' && now >= BUBBLE_FROM_MS && now - this.lastBubble >= BUBBLE_COOLDOWN_MS
      && Math.random() < BUBBLE_CHANCE) {
      this.lastBubble = now;
      this.visuals.spit('carp', interval, () => {
        this.gunnery.blowBubble(this.visuals.mouth('spit-carp'), this.holdX, this.fightTime);
      });
      return true;
    }
    return false;
  }

  /** The boss creeps forward at low HP or after 60s, so a fight can't be farmed. */
  private updateCharge(delta: number): void {
    const chargeHpThreshold = Math.floor(this.bossStartHP * CHARGE_HP_SHARE);
    const shouldCharge = (this.bossHP <= chargeHpThreshold || this.fightTime >= CHARGE_TIME_THRESHOLD) && this.visuals.bossAlive;
    if (!shouldCharge) return;

    if (!this.isCharging) {
      this.isCharging = true;
      this.ctx.scene.cameras.main.shake(400, 0.03);
      this.visuals.startCharge();
    }
    // It stops with its front, leaning in, this far short of the roach; where it already stands closer, it stays put
    const stop = this.holdX + FRONT_GAP - this.visuals.reach(true);
    const x = this.visuals.bossX;
    this.visuals.bossX = Math.min(x, Math.max(stop, x - CHARGE_SPEED * (delta / 1000)));
  }

  private updateCues(delta: number): void {
    this.cueTimer += delta;
    if (this.cueTimer >= this.nextCueTime) {
      this.cueTimer = 0;
      this.nextCueTime = 5000 + Math.random() * 5000;
      this.ctx.audio.playSfx(`boss-cue-${Phaser.Math.Between(1, 7)}`, 0.5);
    }
  }

  private resolveCollisions(bullets: Phaser.Physics.Arcade.Sprite[], projectiles: Phaser.Physics.Arcade.Sprite[]): void {
    // Bullet-projectile: by lane, as the pistol is held well above the lane's projectiles. The bubble counts on the lane
    // it is on now; a bullet glances off the radiator
    for (const bullet of bullets) {
      if (!bullet.active) continue;
      for (const proj of projectiles) {
        if (!proj.active) continue;
        const reach = Math.max(INTERCEPT_PX, shotHalfWidth(proj.getData('kind') as ShotKind));
        if (proj.getData('lane') !== bullet.getData('lane') || Math.abs(bullet.x - proj.x) >= reach) continue;
        if (proj.getData('indestructible')) {
          this.gunnery.burst('spark', bullet.x, bullet.y);
          bullet.destroy();
          break;
        }
        const px = proj.x;
        const py = proj.y;
        const bubble = proj.getData('kind') === 'bubble';
        bullet.destroy();
        proj.destroy();
        if (bubble) this.gunnery.burst('bubble-pop', px, py);
        else {
          this.visuals.spawnExplosion(px, py);
          this.ctx.audio.playSfx('shot-down', VOL.boss);
        }
        this.ctx.addScore(PROJECTILE_SCORE);
        this.visuals.showProjectileScore(px, py, PROJECTILE_SCORE);
        break;
      }
    }

    // Projectile-cockroach
    const { player } = this.ctx;
    const cockroach = player.sprite;
    for (const proj of projectiles) {
      if (!proj.active) continue;
      // The old 25 px rule, grown by however much wider the shot is drawn: it hits where they touch on screen
      if (Phaser.Math.Distance.Between(cockroach.x, cockroach.y, proj.x, proj.y) < shotHitRadius(proj.getData('kind') as ShotKind)) {
        // Just out of its shell: shots pass through. A shot that finds the shell on takes it off, and is gone
        if (player.inMoultGrace) continue;
        if (this.ctx.survivesHit()) {
          this.visuals.spawnExplosion(proj.x, proj.y);
          proj.destroy();
          continue;
        }
        this.onProjectileHitsPlayer();
        // The fight is over (and in a solo run torn down with its shots): don't judge the rest against the roach
        return;
      }
    }

    // Bullet-boss (the boss is invulnerable during rage). A bullet stops where the creature is drawn on its row
    if (this.isRaging) return;
    for (const bullet of bullets) {
      if (!bullet.active) continue;
      const front = this.visuals.frontX(bullet.y, this.isCharging);
      if (front !== null && bullet.x >= front) {
        this.visuals.spawnExplosion(bullet.x, bullet.y);
        bullet.destroy();
        this.onBulletHitsBoss();
      }
    }
  }

  /** Sour cream on the lane the roach stands on, under it: a hit, unless it is up in a hop. */
  private checkPuddles(): void {
    const { player } = this.ctx;
    if (player.isHopping || player.isDead) return;
    for (const puddle of this.gunnery.puddles.slice()) {
      if (puddle.lane !== player.currentFloor || Math.abs(player.sprite.x - puddle.x) >= PUDDLE_HALF_WIDTH) continue;
      if (player.inMoultGrace) continue;
      if (this.ctx.survivesHit()) {
        this.gunnery.removePuddle(puddle);
        continue;
      }
      this.onProjectileHitsPlayer();
      return;
    }
  }

  // ── Shooting ──────────────────────────────────────────────────────

  shoot(): void {
    if (this.state !== 'fighting') return;
    if (this.shootCooldown > 0) return;

    this.shootCooldown = SHOOT_COOLDOWN;

    const { scene, player, eventBridge } = this.ctx;
    const muzzle = player.shoot();
    this.gunnery.fireBullet(muzzle.x, muzzle.y, player.currentFloor);
    gunfire(scene, muzzle, player.sprite.depth);
    this.recoil = RECOIL_PX;
    eventBridge?.onBossShoot();
  }

  // ── Rage Phase ────────────────────────────────────────────────────

  private startRagePhase(): void {
    if (this.ctx.role === 'host') {
      this.ctx.eventBridge?.onBossRage();
    }

    this.isRaging = true;
    this.rageShots = 0;
    this.rageLastLane = Math.random() < 0.5 ? 'top' : 'bottom';

    // It goes red-hot and roars, the camera shakes: the warning
    this.visuals.enterRage();
    this.ctx.scene.cameras.main.shake(300, 0.02);

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

    const shot = this.gunnery.radiatorShot(this.fightTime, lane);
    this.gunnery.announce(shot);
    this.rageSpit(shot);

    this.rageShots++;
    this.delay(RAGE_SHOT_DELAY, () => this.fireRageShot());
  }

  /** All three roar and the tower hurls a radiator. */
  private rageSpit(shot: Shot): void {
    this.visuals.rageSpit(RAGE_SHOT_DELAY, () => {
      this.gunnery.fire(shot, this.visuals.mouth('rage-spit'), this.settleX());
    });
  }

  private endRagePhase(): void {
    this.isRaging = false;
    this.visuals.leaveRage(this.isCharging);
  }

  // ── Collisions ────────────────────────────────────────────────────

  private onBulletHitsBoss(): void {
    if (this.ctx.role === 'solo') {
      this.bossHP--;
      this.ctx.updateBar(this.bossHP);
      if (this.bossHP <= 0) {
        this.startVictory();
        return;
      }
    } else {
      this.ctx.eventBridge?.onBossHit();
    }

    this.ctx.audio.playSfx('bullet-hit', VOL.boss);
    this.ctx.audio.playSfx(`boss-hurt-${Phaser.Math.Between(1, 6)}`, 0.5);
    this.visuals.hurt();
  }

  private onProjectileHitsPlayer(): void {
    // Solo, the encounter takes the fight down; in multiplayer the boss stays on screen for spectators
    if (this.ctx.role !== 'solo') this.gunnery.bullets.clear(true, true);
    this.lose('boss');
  }

  // ── Victory ───────────────────────────────────────────────────────

  private startVictory(): void {
    this.state = 'victory';
    this.pending = null;
    this.gunnery.clear();

    this.ctx.scene.cameras.main.shake(500, 0.04);

    this.ctx.audio.playSfx('boss-defeat', VOL.big);
    for (let i = 0; i < 5; i++) {
      this.delay(i * 120, () => {
        if (this.visuals.bossAlive) this.visuals.explodeAroundBoss(60);
      });
    }

    // Then its joints burst and it drains away down the drain it came out of
    this.delay(400, () => this.visuals.drainAway(() => {
      if (this.state === 'done') return;
      this.visuals.playDefeat(VICTORY_BONUS);
      this.delay(1500, () => this.win());
    }));
  }

  protected teardown(): void {
    this.gunnery.clear();
    this.visuals.destroy();
  }

  // ── Multiplayer ───────────────────────────────────────────────────

  /**
   * A shot the host decided on: the same head rears up and spits it here. An extra skwarka comes as its own message,
   * flagged as a volley: it joins the burst still in the pierog's mouth, or follows it out.
   */
  spawnExternalProjectile(data: BossProjectileData): void {
    if (!data.indestructible && this.isRaging) {
      this.isRaging = false;
      this.visuals.leaveRage(this.isCharging);
    }
    if (!this.visuals.bossAlive) return;
    const shot = this.gunnery.shotFromAnnouncement(data);
    if (data.volley) {
      if (this.pending && this.pending.kind === shot.kind) {
        this.pending.pieces++;
      } else {
        this.gunnery.fire(shot, this.visuals.mouth(`spit-${shot.head}`), this.settleX(), 1);
      }
      return;
    }
    if (shot.indestructible && this.isRaging) {
      this.rageSpit(shot);
      return;
    }
    this.launch(shot, this.gunnery.fireRateAt(this.fightTime));
  }

  updateHP(hp: number): void {
    if (hp > this.bossStartHP) {
      this.bossStartHP = hp;
    }
    const hit = hp < this.bossHP;
    this.bossHP = hp;
    this.ctx.updateBar(this.bossHP);
    if (this.bossHP <= 0) {
      if (this.state !== 'victory' && this.state !== 'done') this.startVictory();
      return;
    }
    if (hit) this.visuals.hurt();
  }

  triggerExternalRage(): void {
    if (this.isRaging) return;
    this.isRaging = true;
    this.visuals.enterRage();
    this.ctx.scene.cameras.main.shake(300, 0.02);
  }

  promoteToHost(): void {
    this.ctx.role = 'host';
    this.gunnery.isHost = true;
  }
}
