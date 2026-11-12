/**
 * Everything flying in the fight: the player's bullets and the boss's shots, and how those get harder over time.
 * The bullets serve every gun fight; the shots are Zlewiatan's: each head spits what it is (a slab of prefab wall, a
 * burst of skwarki, fishbones), the tower's radiator is the shot no bullet stops, and solo the pierog lobs sour cream
 * and the carp blows a bubble that changes lane.
 */
import Phaser from 'phaser';
import { AudioManager, VOL } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { SPRITE_SCALE } from '../../config/sprites';
import { BossProjectileData, GameEventBridge } from '../../multiplayer/GameEventBridge';
import { OBSTACLE_OFFSET } from './bossConfig';
import { glint, sparkBurst, Trail } from './bossTelegraph';
import {
  Head, HEADS, Lane, RADIATOR_SPEED, SHOT_LOOK, ShotKind, SKWARKA_GAP, SKWARKI, ZLEWIATAN_TEXTURE, zlewiatanAnimKey,
  zlewiatanFrame,
} from './zlewiatanConfig';
import { ZLEWIATAN_ANIMS } from './zlewiatanFrames';

const BULLET_SPEED = 600;
/** The spent casing lands this long after the shot. */
const CASING_DELAY_MS = 260;

export const FIRE_RATE_START = 1200;
const FIRE_RATE_MIN = 350;
const PROJECTILE_SPEED_START = 300;
const PROJECTILE_SPEED_MAX = 500;
const DIFFICULTY_RAMP_TIME = 60000; // 60 seconds to reach max difficulty

// Indestructible projectile chance during normal phase (increases with time)
const INDESTRUCTIBLE_BASE_CHANCE = 0.03;
const INDESTRUCTIBLE_MAX_CHANCE = 0.12;

// A third skwarka in the pierog's burst: its chance grows with time
const VOLLEY_BASE_CHANCE = 0;
const VOLLEY_MAX_CHANCE = 0.35;

/** A shot settles onto its lane's line this far along from the mouth, world px; the tower's slab arcs up first. */
const SETTLE_PX = 70;
const SLAB_LIFT = 55;
/** The bubble: slow, and it rises from the bottom lane to the top one over this stretch, world px. */
const BUBBLE_SPEED = 0.55;
const BUBBLE_RISE_PX = 110;
/** Sour cream: in the air this long, then a puddle this long. */
const SMIETANA_FLIGHT_MS = 1100;
const SMIETANA_ARC = 120;
const PUDDLE_MS = 2000;
export const PUDDLE_HALF_WIDTH = 32;

/** A shot decided on: which head, what, where. pieces: how many leave the mouth together (skwarki). */
export interface Shot {
  faceIdx: number;
  head: Head;
  kind: ShotKind;
  lane: Lane;
  speed: number;
  pieces: number;
  indestructible: boolean;
}

export interface Puddle {
  lane: Lane;
  x: number;
  sprite: Phaser.GameObjects.Sprite;
  until: number;
}

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
  /** Sour cream lying on a lane: standing in it is a hit. */
  readonly puddles: Puddle[] = [];
  private lobs: Phaser.GameObjects.GameObject[] = [];
  private lobTweens: Phaser.Tweens.Tween[] = [];

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

  laneY(lane: Lane): number {
    return (lane === 'top' ? this.floorTopY : this.floorBottomY) - OBSTACLE_OFFSET;
  }

  floorY(lane: Lane): number {
    return lane === 'top' ? this.floorTopY : this.floorBottomY;
  }

  /** A shot from the roach's pistol, remembering the lane it was fired from: it meets that lane's projectiles. */
  fireBullet(x: number, y: number, lane: Lane): void {
    const bullet = this.bullets.create(x, y, 'boss-shell') as Phaser.Physics.Arcade.Sprite;
    bullet.setData('lane', lane);
    bullet.setScale(0.4);
    bullet.setDepth(DEPTH.GODRAY);
    (bullet.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    bullet.setVelocityX(BULLET_SPEED);
    this.audio.playSfx('boss-pistol', VOL.gameplay);
    this.scene.time.delayedCall(CASING_DELAY_MS, () => this.audio.playSfx('shell-casing', VOL.pickup));
  }

  /** The host's (or solo) next ordinary shot: a random head, its lane, now and then the radiator instead. */
  planShot(fightTime: number): Shot {
    const faceIdx = Phaser.Math.Between(0, HEADS.length - 1);
    const def = HEADS[faceIdx];
    const lane: Lane = def.lane === 'both' ? (Math.random() < 0.5 ? 'top' : 'bottom') : def.lane;
    const progress = this.difficulty(fightTime);
    const speed = this.speedAt(fightTime);
    const indestructibleChance = INDESTRUCTIBLE_BASE_CHANCE + (INDESTRUCTIBLE_MAX_CHANCE - INDESTRUCTIBLE_BASE_CHANCE) * progress;
    if (Math.random() < indestructibleChance) return this.radiatorShot(fightTime, lane);
    const volleyChance = VOLLEY_BASE_CHANCE + (VOLLEY_MAX_CHANCE - VOLLEY_BASE_CHANCE) * progress;
    const pieces = def.kind === 'skwarka' ? SKWARKI + (Math.random() < volleyChance ? 1 : 0) : 1;
    return { faceIdx, head: def.head, kind: def.kind, lane, speed: speed * def.speed, pieces, indestructible: false };
  }

  /** The radiator: the tower throws it, onto either lane. */
  radiatorShot(fightTime: number, lane: Lane): Shot {
    return {
      faceIdx: -1, head: 'block', kind: 'radiator', lane, speed: this.speedAt(fightTime) * RADIATOR_SPEED, pieces: 1,
      indestructible: true,
    };
  }

  /** A shot as the host announced it (one message per piece: the extra skwarki come flagged as a volley). */
  shotFromAnnouncement(data: BossProjectileData): Shot {
    if (data.indestructible || data.faceIdx < 0) {
      return { faceIdx: -1, head: 'block', kind: 'radiator', lane: data.lane, speed: data.speed, pieces: 1, indestructible: true };
    }
    const def = HEADS[Math.min(data.faceIdx, HEADS.length - 1)];
    return { faceIdx: data.faceIdx, head: def.head, kind: def.kind, lane: data.lane, speed: data.speed, pieces: 1, indestructible: false };
  }

  /** Tells the other players about a shot, as it is decided: they see the same head rear up and let go. */
  announce(shot: Shot): void {
    if (!this.isHost) return;
    for (let k = 0; k < shot.pieces; k++) {
      this.eventBridge?.onBossProjectile({
        lane: shot.lane, speed: shot.speed, faceIdx: shot.faceIdx, indestructible: shot.indestructible, volley: k > 0,
      });
    }
  }

  /**
   * The shot leaves the mouth at `from` (world px) and settles onto its lane's line: quickly, or for the tower's slab
   * in an arc over the pierog, landing on the line by `settleX`. `first`: the index of its first piece (a late volley
   * piece announced on its own).
   */
  fire(shot: Shot, from: { x: number; y: number }, settleX: number, first = 0): void {
    this.flash(shot.kind, from);
    for (let k = first; k < first + shot.pieces; k++) {
      const x = from.x + k * SKWARKA_GAP;
      const slab = shot.kind === 'slab';
      this.spawn(shot.kind, x, from.y, shot.lane, shot.speed, slab ? Math.min(settleX, x - SETTLE_PX) : x - SETTLE_PX,
        slab ? SLAB_LIFT : 0, shot.indestructible);
    }
    const sound = shot.indestructible ? 'zl-radiator' : HEADS[shot.faceIdx].sound;
    this.audio.playSfx(sound, shot.kind === 'bone' ? VOL.pickup : VOL.boss);
  }

  /** The glint and burst at the mouth, in the colour of what leaves it. */
  private flash(kind: ShotKind, at: { x: number; y: number }): void {
    const { color } = SHOT_LOOK[kind];
    glint(this.scene, at.x, at.y, color, 22, 300);
    sparkBurst(this.scene, at.x, at.y, color, 10, -1, 44);
  }

  /** The trail a shot leaves in its own colour, under it; it goes when the shot does. */
  private trail(kind: ShotKind, owner: Phaser.GameObjects.GameObject): Trail {
    const look = SHOT_LOOK[kind];
    const trail = new Trail(this.scene, look.color, look.trailMs, look.trailSize, DEPTH.PICKUPS);
    owner.once(Phaser.GameObjects.Events.DESTROY, () => trail.destroy());
    return trail;
  }

  private spawn(kind: ShotKind, x: number, y: number, lane: Lane, speed: number, settleX: number, lift: number,
                indestructible: boolean): Phaser.Physics.Arcade.Sprite {
    const proj = this.projectiles.create(x, y, ZLEWIATAN_TEXTURE, zlewiatanFrame(kind)) as Phaser.Physics.Arcade.Sprite;
    // Over the creature and over its own trail
    proj.setScale(SPRITE_SCALE).setDepth(DEPTH.PICKUPS + 1);
    proj.play({ key: zlewiatanAnimKey(kind), startFrame: Phaser.Math.Between(0, ZLEWIATAN_ANIMS[kind].frames - 1) });
    proj.setData({ lane, kind, indestructible, fromX: x, fromY: y, settleX, lift, trail: this.trail(kind, proj) });
    (proj.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    proj.setVelocityX(-speed);
    return proj;
  }

  /**
   * Solo, the carp's bubble: slow, along the bottom lane, then halfway to the roach it drifts up to the top lane. It
   * counts as being on whichever lane it is nearer.
   */
  blowBubble(from: { x: number; y: number }, targetX: number, fightTime: number): void {
    const proj = this.spawn('bubble', from.x, from.y, 'bottom', this.speedAt(fightTime) * BUBBLE_SPEED, from.x - SETTLE_PX, 0,
      false);
    proj.setData('riseAt', (from.x + targetX) / 2 + BUBBLE_RISE_PX / 2);
    this.flash('bubble', from);
    this.audio.playSfx('zl-bubble-blow', VOL.boss);
  }

  /**
   * Solo, the pierog's sour cream: a glob lobbed in a high arc onto `lane` at `x`, the spot marked from the start; it
   * leaves a puddle there.
   */
  lobSmietana(from: { x: number; y: number }, x: number, lane: Lane): void {
    const floor = this.floorY(lane);
    const mark = this.scene.add.sprite(x, floor, ZLEWIATAN_TEXTURE, zlewiatanFrame('mark'));
    mark.setScale(SPRITE_SCALE).setDepth(DEPTH.CONTACT_SHADOW).play(zlewiatanAnimKey('mark'));
    const glob = this.scene.add.sprite(from.x, from.y, ZLEWIATAN_TEXTURE, zlewiatanFrame('smietana'));
    glob.setScale(SPRITE_SCALE).setDepth(DEPTH.PICKUPS + 1).play(zlewiatanAnimKey('smietana'));
    const trail = this.trail('smietana', glob);
    this.flash('smietana', from);
    this.lobs.push(mark, glob);
    const landY = floor - 6;
    const state = { t: 0 };
    const tween = this.scene.tweens.add({
      targets: state,
      t: 1,
      duration: SMIETANA_FLIGHT_MS,
      onUpdate: () => {
        glob.x = Phaser.Math.Linear(from.x, x, state.t);
        glob.y = Phaser.Math.Linear(from.y, landY, state.t) - Math.sin(state.t * Math.PI) * SMIETANA_ARC;
        trail.push(glob.x, glob.y);
      },
      onComplete: () => {
        glob.destroy();
        mark.destroy();
        this.lobs = this.lobs.filter(o => o !== glob && o !== mark);
        this.lobTweens = this.lobTweens.filter(t => t !== tween);
        const sprite = this.scene.add.sprite(x, floor, ZLEWIATAN_TEXTURE, zlewiatanFrame('puddle'));
        sprite.setScale(SPRITE_SCALE).setDepth(DEPTH.OBSTACLES).play(zlewiatanAnimKey('puddle'));
        this.puddles.push({ lane, x, sprite, until: this.scene.time.now + PUDDLE_MS });
        this.audio.playSfx('zl-splat', VOL.boss);
      },
    });
    this.lobTweens.push(tween);
    this.audio.playSfx('zl-spit', VOL.boss * 0.8);
  }

  /** Each shot's height this frame: settling onto its lane, the slab's arc, the bubble's drift up; old puddles go. */
  update(): void {
    for (const obj of this.projectiles.getChildren()) {
      const proj = obj as Phaser.Physics.Arcade.Sprite;
      const riseAt = proj.getData('riseAt') as number | undefined;
      if (riseAt !== undefined) {
        const rise = Phaser.Math.Clamp((riseAt - proj.x) / BUBBLE_RISE_PX, 0, 1);
        const eased = rise * rise * (3 - 2 * rise);
        const base = this.settled(proj, this.laneY('bottom'));
        proj.y = Phaser.Math.Linear(base, this.laneY('top'), eased);
        proj.setData('lane', eased < 0.5 ? 'bottom' : 'top');
        (proj.getData('trail') as Trail | undefined)?.push(proj.x, proj.y);
        continue;
      }
      proj.y = this.settled(proj, this.laneY(proj.getData('lane') as Lane));
      (proj.getData('trail') as Trail | undefined)?.push(proj.x, proj.y);
      if (proj.getData('kind') === 'slab' && !proj.getData('landed') && proj.x <= (proj.getData('settleX') as number)) {
        proj.setData('landed', true);
        this.audio.playSfx('zl-slab-impact', VOL.big);
      }
    }
    const now = this.scene.time.now;
    for (const puddle of this.puddles.slice()) {
      if (now >= puddle.until) this.removePuddle(puddle);
    }
  }

  private settled(proj: Phaser.Physics.Arcade.Sprite, laneY: number): number {
    const fromX = proj.getData('fromX') as number;
    const settleX = proj.getData('settleX') as number;
    const t = Phaser.Math.Clamp((fromX - proj.x) / Math.max(1, fromX - settleX), 0, 1);
    const eased = 1 - (1 - t) * (1 - t);
    const fromY = proj.getData('fromY') as number;
    return Phaser.Math.Linear(fromY, laneY, eased) - Math.sin(t * Math.PI) * (proj.getData('lift') as number);
  }

  removePuddle(puddle: Puddle): void {
    const i = this.puddles.indexOf(puddle);
    if (i >= 0) this.puddles.splice(i, 1);
    const sprite = puddle.sprite;
    this.scene.tweens.add({ targets: sprite, alpha: 0, duration: 200, onComplete: () => sprite.destroy() });
  }

  /** A shot popped or shot down, where it was: the bubble bursts, a bullet glances off the radiator. */
  burst(kind: 'bubble-pop' | 'spark', x: number, y: number): void {
    const fx = this.scene.add.sprite(x, y, ZLEWIATAN_TEXTURE, zlewiatanFrame(kind));
    fx.setScale(SPRITE_SCALE).setDepth(DEPTH.VFX_TEXT);
    fx.play(zlewiatanAnimKey(kind));
    fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
    this.audio.playSfx(kind === 'bubble-pop' ? 'zl-bubble-pop' : 'bullet-ricochet', VOL.boss);
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
    for (const tween of this.lobTweens) tween.stop();
    this.lobTweens = [];
    for (const obj of this.lobs) obj.destroy();
    this.lobs = [];
    for (const puddle of this.puddles) puddle.sprite.destroy();
    this.puddles.length = 0;
    // On scene shutdown the physics world has already destroyed both groups, and their sprites with them
    if (!this.projectiles.children) return;
    this.projectiles.clear(true, true);
    this.bullets.clear(true, true);
  }
}
