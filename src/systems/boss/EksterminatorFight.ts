/**
 * The Eksterminator, the last boss: everything the roach has learnt, at once. He stands at the right of the screen
 * with his sprayer; the roach stands armed at its spot. He sprays a lane (be on the other), lobs gas canisters (shoot
 * them down, or leave the lane to the cloud, or dash through it), and later mixes the two and sweeps both lanes after a
 * pump. Bullets only hurt him while his tank is under pressure, after a pump and during and just after a spray; the
 * rest of the time they ping off the suit. Each third of his tank gone, he staggers and the next, faster phase starts;
 * empty, it bursts. The attacks are in eksterminatorPatterns, his frames in eksterminatorConfig, the stream, canister
 * and cloud in eksterminatorHazards.
 */
import Phaser from 'phaser';
import { DASH_DURATION, DEPTH } from '../../config/constants';
import { SPRITE_SCALE } from '../../config/sprites';
import { getFx } from '../../effects/Fx';
import { gunfire } from '../../effects/Gunfire';
import { popup } from '../../effects/Popup';
import { popupStyle } from '../../utils/TextStyles';
import { NEAR_MISS_SCORE } from '../RiskBonus';
import { BossFight, BossFightContext } from './BossFight';
import {
  BOTTOM_STREAM_Y, createEksAnimations, EKS_POINTS, EKS_REACH, EKS_TEXTURE, EksAnim, eksAnimKey, eksFrame,
  RELEASE_FRAME,
} from './eksterminatorConfig';
import { Canister, GasCloud, SprayStream } from './eksterminatorHazards';
import { glint, Halo, sparkBurst } from './bossTelegraph';
import {
  Attack, buildPhases, CLOUD_HIT_PX, CLOUD_LAND_AHEAD, CLOUD_ROLL_SPEED, CLOUD_SIT_MS, comboSpray, DOUBLE_LOB_GAP_MS, Lane,
  Phase, PUMP_HOLD_MS, SWEEP_FIRST_HOLD_MS, SWEEP_SPRAY_MS, SWEEP_SWITCH_HOLD_MS,
} from './eksterminatorPatterns';
import { fightRandom } from './lodziaPatterns';

const S = SPRITE_SCALE;
const windupOf = (lane: Lane): EksAnim => (lane === 'top' ? 'spray-top-windup' : 'spray-bottom-windup');
const sprayOf = (lane: Lane): EksAnim => (lane === 'top' ? 'spray-top' : 'spray-bottom');
const releaseOf = (lane: Lane): EksAnim => (lane === 'top' ? 'spray-top-release' : 'spray-bottom-release');

// ── Numbers ─────────────────────────────────────────────────────────
/** His tank: one bullet that finds it under pressure takes one. At two thirds and one third the next phase starts. */
const TANK_HP = 36;
const VICTORY_BONUS = 800;
/** A spray or a cloud got past without touching the roach. */
const DODGE_SCORE = 15;
/** Dashed through a cloud. */
const DASH_THROUGH_SCORE = 20;
/** A canister shot out of the air. */
const CANISTER_SCORE = 25;
/** Every bullet in his tank. */
const TANK_HIT_SCORE = 5;
/** Out of the sprayed lane this close before the stream reaches the roach: "NA STYK!", as in the run. */
const CLOSE_CALL_MS = 250;

/** The tank stays under pressure this long after a spray ends. */
const EXPOSED_AFTER_MS = 650;
/** The stream races from the nozzle to the screen's left edge in this long. */
const STREAM_GROW_MS = 160;
/** How high the canister's arc peaks above the higher of its ends. */
const CANISTER_PEAK_PX = 60;
/** A bullet meets a canister in its lane this close. */
const INTERCEPT_PX = 30;

/** A lethal hit holds the frame this long, what hit the roach blinking, before game over; an absorbed one blinks
 * this long. */
const HIT_SHOW_MS = 420;
const MOULT_FLASH_MS = 240;
const FLASH_BLINK_MS = 70;
/** He walks in from past the right edge while the roach brakes. */
const WALK_MS = 2200;
const SETTLE_MS = 600;
/** Staggered at a third: the breather before the next phase. */
const PHASE_BREATHER_MS = 1300;
const DEFEAT_HOLD_MS = 1400;
const FADE_MS = 400;
/** His sprayer reaching back stays this far inside the right edge. */
const EDGE_MARGIN = 6;
/** The roach rears and draws the pistol before he arrives. */
const DRAW_MS = 500;

/** The dash, in the fight: the roach lunges this far ahead and back, and nothing hurts it while it does. */
const LUNGE_PX = 70;
/** A dash goes through a cloud rolling in on its lane while it is this close, px. */
const DASH_THROUGH_REACH = 200;
const SHOOT_COOLDOWN = 250;
const BULLET_SPEED = 600;
const RECOIL_PX = 4;
const RECOIL_MS = 120;
/** Half the width of his body that bullets meet, from his middle. */
const BODY_HIT_PX = 70;

const WARN_SPRAY = 0xff3b2f;
/** The canister's green: its landing mark, the glow on it in his fist, the burst as it leaves, its trail. */
const GAS_GLOW = 0x9be04a;
const STREAM_LOOP = 0.45;
const GAS_LOOP = 0.4;
const WARN_PX = 8;
const WARN_GLOW_PX = 26;
const WARN_PULSE_MS = 160;
const TANK_RING = 0xffe14a;

const SFX = {
  spray: 'ex-pressure',
  throw: 'ex-lob',
  splat: 'ex-canister-pop',
  pop: 'shot-down',
  ping: 'bullet-ricochet',
  tankHit: 'ex-tank-ping',
  vent: 'ex-tank-vent',
  pump: 'ex-pump',
  closeCall: 'na-styk',
  defeatBurst: 'ex-tank-burst',
  lastPuff: 'ex-mask',
  victory: 'boss-victory',
  shot: 'boss-pistol',
};
const BGM = 'boss-bgm';

export class EksterminatorFight extends BossFight {
  readonly victoryBonus = VICTORY_BONUS;

  private readonly boss: Phaser.GameObjects.Sprite;
  private readonly phases: Phase[];
  /** The roach's shots in flight, each remembering the lane it was fired from. */
  private readonly bullets: Phaser.Physics.Arcade.Group;
  private phaseIndex = 0;
  private step = 0;
  /** Bumped when a phase ends: callbacks of the attack it cut short see a stale token and stop. */
  private token = 0;
  private hp = TANK_HP;

  private stopped = false;
  private walkX: number | null;
  private stream: SprayStream | null = null;
  /** The stream has reached the roach's spot. */
  private streamArrived = false;
  private canisters: Canister[] = [];
  private clouds: GasCloud[] = [];
  /** Under pressure until then (scene time): bullets hurt. A pump holds it open with no end until its sweep is over. */
  private exposedUntil = 0;
  private pumped = false;
  private staggeredThisWindow = false;

  /**
   * Each lane's mark, while one is up: the red strip for a stream (it holds the whole lane), or, for a canister, only
   * the spot it will land on (a thrown thing marks no lane: its warning is his lob).
   */
  private warnings = new Map<Lane, { g: Phaser.GameObjects.Graphics; pulse: Phaser.Tweens.Tween; kind: 'spray' | 'gas' }>();
  /** The canister in his fist through the lob's wind-up, and the glow on it. */
  private heldCanister: Phaser.GameObjects.Sprite | null = null;
  private readonly heldHalo: Halo;
  private streamLoop: Phaser.Sound.BaseSound | null = null;
  private gasLoop: Phaser.Sound.BaseSound | null = null;
  private ring: Phaser.GameObjects.Graphics;
  private effects: Phaser.GameObjects.GameObject[] = [];
  private shootCooldown = 0;
  private recoil = 0;
  private lungeStart = -1;

  constructor(ctx: BossFightContext) {
    super(ctx);
    const { scene, player, abilities } = ctx;
    createEksAnimations(scene);
    this.phases = buildPhases(fightRandom(ctx.seed, ctx.boss.id), player.currentFloor);
    this.bullets = scene.physics.add.group();
    this.ring = scene.add.graphics().setDepth(DEPTH.OBSTACLES + 1);
    this.heldHalo = new Halo(scene, GAS_GLOW, DEPTH.OBSTACLES + 1);

    const cam = scene.cameras.main;
    this.walkX = cam.width + EKS_REACH.left * S;
    this.boss = scene.add.sprite(cam.scrollX + this.walkX, ctx.floorBottomY, EKS_TEXTURE, eksFrame('walk'));
    this.boss.setScale(S).setDepth(DEPTH.OBSTACLES);
    this.play('walk');

    // The pistol: owned by now in any real run, drawn as the roach rears. A run that reached him without it (a dev
    // shortcut before DJ Bigos had his fight) is handed it here, so the fight can always be played
    if (!abilities.canShoot) abilities.grant('gun');

    let ready = 0;
    const both = () => { if (++ready === 2) this.delay(SETTLE_MS, () => this.startFighting()); };
    scene.tweens.add({
      targets: this,
      walkX: cam.width - this.standFromRight,
      duration: WALK_MS,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.boss.x = cam.scrollX + this.walkX!;
        this.walkX = null;
        this.play('idle');
        both();
      },
    });
    this.brake(() => {
      this.stopped = true;
      player.enterBossStance();
      this.delay(DRAW_MS, () => {
        player.catchPistol();
        both();
      });
    });
  }

  /** His middle, this far in from the right edge: as close to it as keeps the sprayer on his back on screen. */
  private get standFromRight(): number {
    return EKS_REACH.right * S + EDGE_MARGIN;
  }

  private startFighting(): void {
    this.state = 'fighting';
    // The boss music loads after boot with his frames; a fight reached before it has (a cold dev start) goes on without it
    try {
      if (this.ctx.scene.cache.audio.exists(BGM)) this.ctx.audio.switchBGM(BGM);
    } catch {
      // the fight goes on without its music
    }
    this.ctx.showBar(this.hp, TANK_HP);
    this.next();
  }

  // ── Frame ─────────────────────────────────────────────────────────

  update(delta: number): void {
    if (this.state === 'done') return;
    if (this.walkX !== null) this.boss.x = this.ctx.scene.cameras.main.scrollX + this.walkX;
    if (!this.stopped) return;
    const { player } = this.ctx;
    player.updateDash();
    this.recoil = Math.max(0, this.recoil - (RECOIL_PX * delta) / RECOIL_MS);
    this.holdPlayer(Math.round(this.recoil - this.lunge()));
    if (this.shootCooldown > 0) this.shootCooldown -= delta;
    this.drawTankRing();
    this.syncLoops();
    if (this.state !== 'fighting') return;

    this.stream?.update();
    for (const can of this.canisters) if (can.update()) this.land(can);
    this.canisters = this.canisters.filter(can => !can.landed);
    for (const cloud of this.clouds) cloud.update(delta);
    // Each of these can end the fight (the last bullet in his tank, a hit on the roach): nothing after it works on a fight
    // that is over, and a hit must not be judged twice
    this.resolveBullets();
    if (this.inFight()) this.checkStream();
    if (this.inFight()) this.checkClouds();
    if (!this.inFight()) return;
    for (const cloud of this.clouds.filter(c => c.done)) cloud.destroy();
    this.clouds = this.clouds.filter(c => !c.done);
  }

  /** Still fighting: nothing has just won or lost the fight in this frame. */
  private inFight(): boolean { return this.state === 'fighting'; }

  /** How far ahead of its spot the dash has carried the roach right now. */
  private lunge(): number {
    if (this.lungeStart < 0) return 0;
    const t = (this.ctx.scene.time.now - this.lungeStart) / DASH_DURATION;
    if (t >= 1) {
      this.lungeStart = -1;
      return 0;
    }
    return LUNGE_PX * Math.sin(Math.PI * t);
  }

  // ── Attacks ───────────────────────────────────────────────────────

  private get stage(): Phase { return this.phases[this.phaseIndex]; }

  /** Whether an attack started under this token may still go on. */
  private live(token: number): boolean {
    return token === this.token && this.state === 'fighting';
  }

  private next(): void {
    if (this.state !== 'fighting') return;
    const { opening, loop } = this.stage;
    const attack = this.step < opening.length ? opening[this.step] : loop[(this.step - opening.length) % loop.length];
    this.step++;
    const token = this.token;
    this.run(attack, token, () => this.delay(this.stage.gap, () => { if (this.live(token)) this.next(); }));
  }

  private run(attack: Attack, token: number, done: () => void): void {
    const other = (lane: Lane): Lane => (lane === 'top' ? 'bottom' : 'top');
    switch (attack.kind) {
      case 'spray':
        this.spray(attack.lane, this.stage.hold, this.stage.spray, token, done);
        break;
      case 'lob':
        this.lob(attack.lane, token, () => {}, done);
        break;
      case 'doubleLob': {
        let left = 2;
        const one = () => { if (--left === 0) done(); };
        this.lob(attack.first, token, () => this.delay(DOUBLE_LOB_GAP_MS, () => {
          if (this.live(token)) this.lob(other(attack.first), token, () => {}, one);
        }), one);
        break;
      }
      case 'cloudSpray': {
        let left = 2;
        const one = () => { if (--left === 0) done(); };
        const sprayLane = other(attack.cloud);
        // The stream holds the other lane from a little before the cloud reaches the roach until a little after
        const { start, length } = comboSpray(this.stage);
        this.lob(attack.cloud, token, () => this.delay(start, () => {
          if (this.live(token)) this.spray(sprayLane, this.stage.hold, length, token, one);
        }), one);
        break;
      }
      case 'sweep':
        this.sweep(attack.first, token, done);
        break;
    }
  }

  /** The wind-up for a lane, held, then the stream down it; then the release. */
  private spray(lane: Lane, hold: number, length: number, token: number, done: () => void, skipWindup = false): void {
    this.warn(lane);
    const fire = () => this.delay(hold, () => {
      if (!this.live(token)) return;
      this.startStream(lane);
      this.play(sprayOf(lane));
      this.delay(length, () => {
        if (!this.live(token)) return;
        this.endStream(true);
        this.play(releaseOf(lane), () => { if (this.live(token)) this.play('idle'); });
        done();
      });
    });
    if (skipWindup) fire();
    else this.play(windupOf(lane), () => { if (this.live(token)) fire(); });
  }

  private startStream(lane: Lane): void {
    const { scene, floorBottomY } = this.ctx;
    this.unwarn(lane);
    const nozzle = lane === 'top' ? EKS_POINTS.nozzleTop : EKS_POINTS.nozzleBottom;
    const x = this.boss.x + nozzle.x * S;
    const y = this.boss.y + nozzle.y * S;
    this.stream = new SprayStream(scene, {
      lane,
      nozzleX: x,
      nozzleY: y,
      laneY: lane === 'top' ? y : floorBottomY + BOTTOM_STREAM_Y * S,
      growMs: STREAM_GROW_MS,
    });
    this.streamArrived = false;
    this.exposedUntil = Number.POSITIVE_INFINITY;
    this.staggeredThisWindow = false;
    this.sfx(SFX.spray, 0.7);
    scene.cameras.main.shake(120, 0.004);
  }

  /** The stream stops; dodged, it scores. The tank stays open a moment after. */
  private endStream(dodged: boolean): void {
    if (!this.stream) return;
    const lane = this.stream.lane;
    this.stream.destroy();
    this.stream = null;
    if (!this.pumped) this.exposedUntil = this.ctx.scene.time.now + EXPOSED_AFTER_MS;
    if (dodged && this.streamArrived) this.dodged(lane);
  }

  /** The pump, the glint, then the stream down one lane and straight on to the other. The tank is open throughout. */
  private sweep(first: Lane, token: number, done: () => void): void {
    this.pumped = true;
    this.exposedUntil = Number.POSITIVE_INFINITY;
    this.staggeredThisWindow = false;
    for (let i = 0; i < 4; i++) this.delay(i * 200, () => { if (this.live(token)) this.sfx(SFX.pump, 0.6); });
    const secondLane: Lane = first === 'top' ? 'bottom' : 'top';
    this.play('pump', () => this.delay(PUMP_HOLD_MS, () => {
      if (!this.live(token)) return;
      this.spray(first, Math.min(this.stage.hold, SWEEP_FIRST_HOLD_MS), SWEEP_SPRAY_MS, token, () => {
        this.spray(secondLane, SWEEP_SWITCH_HOLD_MS, SWEEP_SPRAY_MS, token, () => {
          this.pumped = false;
          this.exposedUntil = this.ctx.scene.time.now + EXPOSED_AFTER_MS;
          done();
        });
      });
    }));
  }

  /**
   * A canister onto a lane: the landing spot marked, the lob, and the canister in the air from the release frame.
   * thrown fires as it leaves his hand; resolved once it is shot down or its cloud is past the roach.
   */
  private lob(lane: Lane, token: number, thrown: () => void, resolved: () => void): void {
    const { scene } = this.ctx;
    const to = { x: this.holdX + CLOUD_LAND_AHEAD, y: this.laneY(lane) };
    this.markLanding(lane, to.x);
    const releaseFrame = eksFrame('lob', RELEASE_FRAME);
    let released = false;
    const release = () => {
      if (released || !this.live(token)) return;
      released = true;
      this.boss.off(Phaser.Animations.Events.ANIMATION_UPDATE, onFrame);
      this.sfx(SFX.throw, 0.5);
      const from = { x: this.boss.x + EKS_POINTS.release.x * S, y: this.boss.y + EKS_POINTS.release.y * S };
      this.dropHeld();
      glint(scene, from.x, from.y, GAS_GLOW, 24, 300);
      sparkBurst(scene, from.x, from.y, GAS_GLOW, 10, -1, 48);
      const can = new Canister(scene, {
        from, to, flightMs: this.stage.flight, peakPx: CANISTER_PEAK_PX, lands: lane,
      });
      can.onResolved = resolved;
      this.canisters.push(can);
      thrown();
    };
    const onFrame = (_a: Phaser.Animations.Animation, frame: Phaser.Animations.AnimationFrame) => {
      if (frame.textureFrame === releaseFrame) release();
      else if (frame.textureFrame === eksFrame('lob', 1)) this.holdCanister(EKS_POINTS.cocked, 0, true);
      else if (frame.textureFrame === eksFrame('lob', 2)) this.holdCanister(EKS_POINTS.whip, 1, false);
    };
    this.boss.on(Phaser.Animations.Events.ANIMATION_UPDATE, onFrame);
    this.play('lob', () => {
      release();
      if (this.live(token)) this.play('idle');
    });
  }

  /**
   * His telegraph for the lob: the canister is in his fist from the cocked frame, glowing, and flares as it is drawn
   * back and again as he whips it over (frames 1 and 2; frame 3 lets it go).
   */
  private holdCanister(at: { x: number; y: number }, frame: number, first: boolean): void {
    const { scene } = this.ctx;
    const x = this.boss.x + at.x * S;
    const y = this.boss.y + at.y * S;
    if (!this.heldCanister) {
      this.heldCanister = scene.add.sprite(x, y, EKS_TEXTURE, eksFrame('canister', frame))
        .setScale(S).setDepth(DEPTH.OBSTACLES + 2);
    }
    this.heldCanister.setFrame(eksFrame('canister', frame)).setPosition(x, y - 4 * S);
    this.heldHalo.show(x, y - 4 * S, first ? 24 : 32, first ? 0.8 : 1);
    glint(scene, x, y - 4 * S, GAS_GLOW, first ? 18 : 30, first ? 280 : 340);
  }

  private dropHeld(): void {
    this.heldCanister?.destroy();
    this.heldCanister = null;
    this.heldHalo.hide();
  }

  /** The canister comes down: a splat, and its cloud on the lane. */
  private land(can: Canister): void {
    const { scene } = this.ctx;
    can.destroy();
    this.unwarn(can.lands);
    this.sfx(SFX.splat, 0.8);
    scene.cameras.main.shake(100, 0.005);
    this.puff(can.target.x, can.target.y - 10, 10, 30);
    const cloud = new GasCloud(scene, {
      lane: can.lands, x: can.target.x, laneY: can.target.y, sitMs: CLOUD_SIT_MS, rollSpeed: CLOUD_ROLL_SPEED,
    });
    cloud.onResolved = can.onResolved;
    this.clouds.push(cloud);
  }

  // ── Hits ──────────────────────────────────────────────────────────

  /** The stream gets the roach in its lane once its front has reached it. */
  private checkStream(): void {
    const stream = this.stream;
    if (!stream) return;
    const { player, scene } = this.ctx;
    if (stream.frontX > player.x) return;
    if (!this.streamArrived) {
      this.streamArrived = true;
      const hop = player.lastHop;
      if (player.currentFloor !== stream.lane && hop && hop.from === stream.lane && scene.time.now - hop.at <= CLOSE_CALL_MS) {
        this.sfx(SFX.closeCall, 0.6);
        this.ctx.addScore(NEAR_MISS_SCORE);
        this.popup(`NA STYK! +${NEAR_MISS_SCORE}`, '#7fe0ff');
      }
    }
    if (player.currentFloor === stream.lane) this.hit(stream.parts);
  }

  /** A cloud gets the roach in its lane as it rolls over it, unless it dashes through. */
  private checkClouds(): void {
    const { player } = this.ctx;
    for (const cloud of this.clouds) {
      if (cloud.resolved) continue;
      const gap = cloud.x - player.x;
      if (gap < -CLOUD_HIT_PX) {
        cloud.resolved = true;
        if (cloud.dashedThrough) {
          this.ctx.addScore(DASH_THROUGH_SCORE);
          this.popup(`PRZEZ GAZ! +${DASH_THROUGH_SCORE}`, '#c8ff7a');
        } else {
          this.dodged(cloud.lane);
        }
        cloud.onResolved?.();
        continue;
      }
      // Dashed into it: it is through, and the rest of the cloud can't touch it
      if (cloud.dashedThrough || Math.abs(gap) > CLOUD_HIT_PX || player.currentFloor !== cloud.lane) continue;
      if (player.isDashing) {
        cloud.dashedThrough = true;
        continue;
      }
      this.hit([cloud.sprite]);
    }
  }

  /**
   * Something got the roach: the moult takes it, once, or it is over. Either way what hit it flashes; a lethal hit
   * holds the frame a moment first, so you see what it was. Returns true when the roach lives on.
   */
  private hit(culprit: Phaser.GameObjects.Components.Tint[]): boolean {
    const { player } = this.ctx;
    // Dashing nothing touches it; just out of its shell, hits pass through
    if (player.isDashing || player.inMoultGrace) return true;
    if (this.ctx.survivesHit()) {
      this.flash(culprit, MOULT_FLASH_MS);
      return true;
    }
    this.killedBy(culprit);
    return false;
  }

  /** The hit-stop: everything holds, what hit the roach flashes, then the run is over. Nothing here can stall that. */
  private killedBy(culprit: Phaser.GameObjects.Components.Tint[]): void {
    if (this.state !== 'fighting') return;
    this.state = 'victory';                    // no more attacks, no input; update() stops moving the lanes
    this.token++;
    const finish = () => { if (this.state !== 'done') this.lose('eksterminator'); };
    this.ctx.scene.time.delayedCall(HIT_SHOW_MS, finish);
    // And on the wall clock, should the scene's ever stand still
    window.setTimeout(finish, HIT_SHOW_MS + 500);
    try {
      this.unwarn();
      this.dropHeld();
      this.boss.anims.pause();
      this.ctx.player.sprite.anims.pause();
      this.ctx.scene.cameras.main.shake(HIT_SHOW_MS / 2, 0.01);
      this.flash(culprit, HIT_SHOW_MS);
    } catch {
      // the looks are extra: the timers above end the run regardless
    }
  }

  /** What hit the roach blinks white for a moment. */
  private flash(culprit: Phaser.GameObjects.Components.Tint[], ms: number): void {
    const blinks = Math.max(1, Math.round(ms / FLASH_BLINK_MS));
    for (let i = 0; i <= blinks; i++) {
      this.ctx.scene.time.delayedCall(i * FLASH_BLINK_MS, () => {
        // Inside the scene's clock: a throw here would stall every timer after it, the fight's own included
        try {
          for (const obj of culprit) {
            if (!(obj as unknown as Phaser.GameObjects.GameObject).active) continue;
            // White where tints draw (WebGL), and a blink of its alpha everywhere (the canvas renderer ignores tints)
            const lit = i % 2 === 0 && i < blinks;
            if (lit) obj.setTintFill(0xffffff);
            else obj.clearTint();
            (obj as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(lit || i === blinks ? 1 : 0.3);
          }
        } catch {
          // a blink lost is nothing
        }
      });
    }
  }

  private dodged(lane: Lane): void {
    if (this.ctx.player.currentFloor === lane) return;
    this.ctx.addScore(DODGE_SCORE);
    this.popup(`+${DODGE_SCORE}`, '#ffdd00');
  }

  private get exposed(): boolean {
    return this.ctx.scene.time.now < this.exposedUntil;
  }

  /** Bullets: a canister in their lane pops; whatever reaches him hits the tank if it is open, or pings off the suit. */
  private resolveBullets(): void {
    const bullets = this.bullets.getChildren().slice() as Phaser.Physics.Arcade.Sprite[];
    const right = this.ctx.scene.cameras.main.scrollX + this.ctx.scene.cameras.main.width + 50;
    for (const bullet of bullets) {
      if (!bullet.active) continue;
      if (bullet.x > right) {
        bullet.destroy();
        continue;
      }
      const lane = bullet.getData('lane') as Lane;
      // Where it was last frame too: a slow frame must not carry a bullet clean past a canister
      const from = (bullet.getData('lastX') as number | undefined) ?? bullet.x;
      bullet.setData('lastX', bullet.x);
      const can = this.canisters.find(c => !c.landed && c.lane === lane
        && c.x > from - INTERCEPT_PX && c.x < bullet.x + INTERCEPT_PX);
      if (can) {
        bullet.destroy();
        this.shootDown(can);
        continue;
      }
      if (bullet.x >= this.boss.x - BODY_HIT_PX) {
        bullet.destroy();
        if (this.exposed) this.tankHit();
        else this.ping(bullet.x, bullet.y);
      }
    }
  }

  private shootDown(can: Canister): void {
    this.canisters = this.canisters.filter(c => c !== can);
    can.destroy();
    this.unwarn(can.lands);
    this.sfx(SFX.pop, 0.35);
    this.puff(can.x, can.y, 8, 22);
    this.ctx.addScore(CANISTER_SCORE);
    this.popup(`ZESTRZELONY! +${CANISTER_SCORE}`, '#ffdd00');
    can.onResolved?.();
  }

  private tankHit(): void {
    if (this.state !== 'fighting') return;
    const tank = this.tankPoint;
    this.sfx(SFX.tankHit, 0.55);
    this.puff(tank.x + 6, tank.y - 10, 5, 16);
    this.sparks(tank.x - 10, tank.y, 4);
    this.ctx.addScore(TANK_HIT_SCORE);
    this.hp--;
    this.ctx.updateBar(this.hp);
    const third = TANK_HP / 3;
    if (this.hp <= 0) {
      this.defeat();
    } else if (this.phaseIndex < 2 && this.hp <= TANK_HP - third * (this.phaseIndex + 1)) {
      this.nextPhase();
    } else if (!this.staggeredThisWindow && !this.stream && !this.pumped) {
      // Caught between attacks, he reels
      this.staggeredThisWindow = true;
      const anim = this.boss.anims.getName();
      if (anim === eksAnimKey('idle')) this.play('stagger', () => { if (this.state === 'fighting') this.play('idle'); });
    }
  }

  /** A third of his tank gone: whatever he was doing stops, he staggers, and a faster phase begins after a breather. */
  private nextPhase(): void {
    this.token++;
    this.unwarn();
    this.dropHeld();
    this.endStream(false);
    this.pumped = false;
    this.exposedUntil = 0;
    this.phaseIndex++;
    this.step = 0;
    // What is still in the air or on a lane goes up in a harmless puff: the new phase starts on clean lanes
    for (const can of this.canisters) {
      this.puff(can.x, can.y, 6, 18);
      can.destroy();
    }
    this.canisters = [];
    for (const cloud of this.clouds) {
      this.puff(cloud.x, cloud.sprite.y - 30, 8, 40);
      cloud.destroy();
    }
    this.clouds = [];
    this.sfx(SFX.vent, 0.6);
    this.ctx.scene.cameras.main.shake(220, 0.01);
    const token = this.token;
    this.play('stagger', () => {
      if (!this.live(token)) return;
      this.play('idle');
      this.delay(PHASE_BREATHER_MS, () => { if (this.live(token)) this.next(); });
    });
  }

  private defeat(): void {
    const { scene } = this.ctx;
    this.state = 'victory';
    this.token++;
    this.unwarn();
    this.dropHeld();
    this.endStream(false);
    for (const can of this.canisters) can.destroy();
    this.canisters = [];
    for (const cloud of this.clouds) {
      cloud.resolved = true;
      scene.tweens.add({ targets: cloud.sprite, alpha: 0, duration: FADE_MS });
    }
    this.clearBullets();
    this.exposedUntil = 0;
    scene.cameras.main.shake(400, 0.02);
    this.sfx(SFX.defeatBurst, 0.6);
    const tank = this.tankPoint;
    this.puff(tank.x, tank.y, 18, 60);
    this.play('defeat', () => {
      this.sfx(SFX.lastPuff, 0.6);
      this.sfx(SFX.victory, 0.7);
      this.delay(DEFEAT_HOLD_MS, () => {
        this.ctx.player.celebrate();
        scene.tweens.add({ targets: this.boss, alpha: 0, duration: FADE_MS, onComplete: () => this.win() });
      });
    });
  }

  // ── The roach ─────────────────────────────────────────────────────

  shoot(): void {
    if (this.state !== 'fighting' || this.shootCooldown > 0) return;
    this.shootCooldown = SHOOT_COOLDOWN;
    const { scene, player } = this.ctx;
    const muzzle = player.shoot();
    // The pistol's shot, as in Zlewiatan's fight: the same shell, speed and sound
    const bullet = this.bullets.create(muzzle.x, muzzle.y, 'boss-shell') as Phaser.Physics.Arcade.Sprite;
    bullet.setData('lane', player.currentFloor).setScale(0.4).setDepth(DEPTH.GODRAY);
    (bullet.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    bullet.setVelocityX(BULLET_SPEED);
    this.sfx(SFX.shot, 0.5);
    gunfire(scene, muzzle, player.sprite.depth);
    this.recoil = RECOIL_PX;
  }

  /** The dash: a lunge ahead and back, untouchable while it lasts; the run's cooldown and the button's sweep. */
  dash(): void {
    if (this.state !== 'fighting') return;
    const { player } = this.ctx;
    if (!player.dashReady || player.isDashing) return;
    player.startDash();
    this.lungeStart = this.ctx.scene.time.now;
    // A dash at a cloud rolling in on its lane goes through it, even pressed a beat early: the lunge carries the roach
    // into it, and it is behind the roach before the roach is back
    for (const cloud of this.clouds) {
      const gap = cloud.x - player.x;
      if (cloud.lane === player.currentFloor && !cloud.resolved && gap > -CLOUD_HIT_PX && gap < DASH_THROUGH_REACH) {
        cloud.dashedThrough = true;
      }
    }
  }

  // ── Looks ─────────────────────────────────────────────────────────

  /** A sound, never in the way: one that fails to play must not stop the fight, least of all the way to game over. */
  private sfx(key: string, volume: number): void {
    try {
      this.ctx.audio.playSfx(key, volume);
    } catch {
      // a missing or undecodable sound: play on in silence
    }
  }

  private play(anim: EksAnim, then?: () => void): void {
    const key = eksAnimKey(anim);
    this.boss.play(key);
    if (then) this.boss.once(`${Phaser.Animations.Events.ANIMATION_COMPLETE_KEY}${key}`, () => {
      if (this.state !== 'done') then();
    });
  }

  private laneY(lane: Lane): number { return lane === 'top' ? this.ctx.floorTopY : this.ctx.floorBottomY; }

  private get tankPoint(): { x: number; y: number } {
    return { x: this.boss.x + EKS_POINTS.tank.x * S, y: this.boss.y + EKS_POINTS.tank.y * S };
  }

  /** While the tank is under pressure, a ring pulses round it and it leaks: shoot now. */
  private drawTankRing(): void {
    const g = this.ring;
    g.clear();
    if (!this.exposed || this.state !== 'fighting') return;
    const { x, y } = this.tankPoint;
    const t = this.ctx.scene.time.now;
    const pulse = (Math.sin(t / 90) + 1) / 2;
    g.lineStyle(2, TANK_RING, 0.45 + 0.45 * pulse).strokeCircle(x, y, 34 + 4 * pulse);
    g.lineStyle(2, TANK_RING, 0.25 * pulse).strokeCircle(x, y, 44 + 6 * pulse);
    if (Math.random() < 0.25) this.puff(x + 8, y - 44, 1, 8);
  }

  /** The lane the stream is about to hold glows red along its edge: all of it is closed. */
  private warn(lane: Lane): void {
    this.unwarn(lane);
    const { scene } = this.ctx;
    const cam = scene.cameras.main;
    const y = this.laneY(lane);
    const g = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.CONTACT_SHADOW);
    g.fillStyle(WARN_SPRAY, 0.3).fillRect(0, y - WARN_GLOW_PX, cam.width, WARN_GLOW_PX);
    g.fillStyle(WARN_SPRAY, 1).fillRect(0, y - 2, cam.width, WARN_PX);
    g.setAlpha(0.4);
    const pulse = scene.tweens.add({ targets: g, alpha: 0.85, duration: WARN_PULSE_MS, yoyo: true, repeat: -1 });
    this.warnings.set(lane, { g, pulse, kind: 'spray' });
  }

  /** Where a canister will land: its shadow on the lane and a green ring round it (a spot, not the lane). */
  private markLanding(lane: Lane, landingX: number): void {
    this.unwarn(lane);
    const { scene } = this.ctx;
    const y = this.laneY(lane);
    const g = scene.add.graphics().setDepth(DEPTH.CONTACT_SHADOW);
    g.fillStyle(0x000000, 0.55).fillEllipse(landingX, y + 1, 84, 10);
    g.lineStyle(2, GAS_GLOW, 1).strokeEllipse(landingX, y + 1, 84, 10);
    g.setAlpha(0.5);
    const pulse = scene.tweens.add({ targets: g, alpha: 1, duration: WARN_PULSE_MS, yoyo: true, repeat: -1 });
    this.warnings.set(lane, { g, pulse, kind: 'gas' });
  }

  /** The stream roars while it runs and the gas hisses while any cloud lies on a lane; silent otherwise. */
  private syncLoops(): void {
    const { audio } = this.ctx;
    const fighting = this.state === 'fighting';
    if (fighting && this.stream && !this.streamLoop) this.streamLoop = audio.startLoop('ex-stream', STREAM_LOOP);
    else if ((!fighting || !this.stream) && this.streamLoop) {
      audio.stopLoop(this.streamLoop);
      this.streamLoop = null;
    }
    if (fighting && this.clouds.length > 0 && !this.gasLoop) this.gasLoop = audio.startLoop('ex-gas', GAS_LOOP);
    else if ((!fighting || this.clouds.length === 0) && this.gasLoop) {
      audio.stopLoop(this.gasLoop);
      this.gasLoop = null;
    }
  }

  /** Takes a lane's warning down, or every lane's. */
  private unwarn(lane?: Lane): void {
    for (const [key, { g, pulse }] of [...this.warnings]) {
      if (lane && key !== lane) continue;
      pulse.remove();
      g.destroy();
      this.warnings.delete(key);
    }
  }

  /** Gas squirting out: curls of his green, drifting up and coming apart. */
  private puff(x: number, y: number, count: number, spread: number): void {
    getFx(this.ctx.scene).burst('wisp', x, y, Math.ceil(count / 2), spread / 2, {
      depth: DEPTH.PICKUPS + 2, speed: [10, 40], angle: [240, 300],
    });
  }

  /** A bullet pinging off the suit: a few sparks, no harm done. */
  private ping(x: number, y: number): void {
    this.sfx(SFX.ping, 0.5);
    this.sparks(x, y, 5);
  }

  /** A white-hot spark where it struck, bits thrown back off it. */
  private sparks(x: number, y: number, count: number): void {
    const fx = getFx(this.ctx.scene);
    fx.play('spark', x, y, { depth: DEPTH.POPUP - 1 });
    fx.burst('bit-white', x, y, count, 2, { depth: DEPTH.POPUP - 1, speed: [60, 130], angle: [150, 220], drag: 3, life: 300 });
  }

  private popup(text: string, color: string): void {
    const { scene, player } = this.ctx;
    popup(scene, player.x, player.y - 46, text, popupStyle({ fontSize: '10px', color }), { hold: 300 });
  }

  private clearBullets(): void {
    // On scene shutdown the physics world has already destroyed the group, and its sprites with it
    if (this.bullets.children) this.bullets.clear(true, true);
  }

  private track(obj: Phaser.GameObjects.GameObject): void {
    this.effects.push(obj);
  }

  private untrack(obj: Phaser.GameObjects.GameObject): void {
    this.effects = this.effects.filter(o => o !== obj);
    obj.destroy();
  }

  protected teardown(): void {
    this.unwarn();
    this.dropHeld();
    this.heldHalo.destroy();
    this.ctx.audio.stopLoop(this.streamLoop);
    this.ctx.audio.stopLoop(this.gasLoop);
    this.streamLoop = this.gasLoop = null;
    this.stream?.destroy();
    this.stream = null;
    for (const can of this.canisters) can.destroy();
    this.canisters = [];
    for (const cloud of this.clouds) cloud.destroy();
    this.clouds = [];
    this.clearBullets();
    this.ring.destroy();
    for (const obj of this.effects) obj.destroy();
    this.effects = [];
    const boss = this.boss;
    if (!boss.active) return;
    boss.anims.stop();
    this.ctx.scene.tweens.add({ targets: boss, alpha: 0, duration: FADE_MS, delay: 300, onComplete: () => boss.destroy() });
  }

  // ── For tests driving the fight ───────────────────────────────────

  /** What is coming at the roach right now, for a script to dodge (or walk into). */
  get threat(): {
    phase: number; hp: number; exposed: boolean; streamLane: Lane | null;
    canisters: { lane: Lane | null; lands: Lane; x: number }[]; clouds: { lane: Lane; gap: number; rolling: boolean }[];
    /** The lanes marked right now: red for a stream coming, green under a canister. */
    warned: { top: 'spray' | 'gas' | null; bottom: 'spray' | 'gas' | null };
  } {
    const px = this.ctx.player.x;
    return {
      phase: this.phaseIndex,
      hp: this.hp,
      exposed: this.exposed,
      streamLane: this.stream?.lane ?? null,
      canisters: this.canisters.map(c => ({ lane: c.lane, lands: c.lands, x: c.x - px })),
      clouds: this.clouds.filter(c => !c.resolved).map(c => ({ lane: c.lane, gap: c.x - px, rolling: c.rolling })),
      warned: { top: this.warnings.get('top')?.kind ?? null, bottom: this.warnings.get('bottom')?.kind ?? null },
    };
  }
}
