/**
 * The Eksterminator, the last boss: a tradesman on a job, and the roach's final exam. Every tool has a job at once.
 *
 * The gun is the main verb, and every bullet that reaches him counts at once: the bar moves, his tank sparks, a number
 * pops. While the tank is under pressure (during and just after a spray, through a pump's sweep, after the wand is
 * knocked aside) it swells and whistles with a glow round it and every bullet counts triple. Each of his attacks can be
 * turned back on him. A canister coming down on the roach's lane can be shot out of the air: it bursts on him in his
 * own gas and he reels. Its cloud, left to land, boils ahead of the roach and rolls at it: hop it, or dash through it
 * and it is blown back into him. A spray holds a whole lane (marked as a kill zone, the only thing here that is): hop,
 * and shoot him from the safe lane while he is rooted. From the second phase he walks in between attacks; close, a dash
 * reaches him and shoves him home. In the third he pumps (dash into him then, close, and the wand flies: the sweep is
 * off) and lobs mines onto the roach's spot, which hold that stretch of lane until dashed away. Nearly empty, the tank
 * leaks; he backs off out of reach and sprays lane after lane on the count until a bullet bursts it.
 *
 * He answers aggression: hit hard in one pressure window he vents it at the roach's lane; shot a lot between attacks he
 * drops a canister at his own feet and sends its cloud down the lane. A thrown thing never marks the lane: its warning is
 * on him (the canister glowing in his fist), on itself (its trail) and the landing shadow where it will come down.
 *
 * What comes when, what a hit does and where he stands are eksterminatorPatterns (and its tests), played here on the
 * fight's own clock, which a hit-stop holds; his frames are eksterminatorConfig, the stream eksterminatorHazards.
 */
import Phaser from 'phaser';
import { DEPTH } from '../../config/constants';
import { SPRITE_SCALE } from '../../config/sprites';
import { getFx } from '../../effects/Fx';
import { gunfire } from '../../effects/Gunfire';
import { KillZone } from '../../effects/KillZone';
import { LandingShadow, type Spot } from '../../effects/LandingShadow';
import { addArrowKeycap, addKeycap, keycapBob } from '../../ui/Keycap';
import { popupStyle } from '../../utils/TextStyles';
import { NEAR_MISS_SCORE } from '../RiskBonus';
import { BossFight, BossFightContext } from './BossFight';
import { glint, Halo, sparkBurst, Trail } from './bossTelegraph';
import {
  BOTTOM_STREAM_Y, createEksAnimations, EKS_ANIMS, EKS_POINTS, EKS_REACH, EKS_TEXTURE, EksAnim, eksFrame,
} from './eksterminatorConfig';
import { frameAt, SprayStream } from './eksterminatorHazards';
import {
  Attack, BODY_PX, bodyX, buildPhases, canisterAt, chainAt, chargeAt, CLOUD_HIT_PX, CLOUD_ROLL,
  cloudPrompt, DASH_MS, DIST, EksDirector, FAR, inLine, LOB_RELEASE_MS, MEET_MS, Timed,
  fightRandom, HazardKind, HitSource, KNOCK_OPEN_MS, landX, Lane, LANE_Y, LUNGE_OUT_MS, LUNGE_REACH, lungeOffset,
  MINE_AT, MINE_HALF_PX, MUZZLE_DX, NEAR, PHASE_BREATHER_MS, Pos, Prompt, promptFor, releasePoint,
  resolve, RETURN_MS, SHOOT_MS, SHOVE_MS, SHOVE_PROMPT, STAGGER_MS, Step, stepLength, STREAM_REACH_MS, Throw,
  timeAttack, BULLET_SPEED, INTERCEPT_PX, TANK_HP, WALK_STEP_MS,
} from './eksterminatorPatterns';

const S = SPRITE_SCALE;

// ── Score ───────────────────────────────────────────────────────────
const VICTORY_BONUS = 800;
/** A spray or a cloud gone past on the other lane. */
const DODGE_SCORE = 10;
/** Per bullet in his tank, a canister shot down, a cloud or mine sent back, a shove, a knock: times the combo's multiplier. */
const SCORE: Record<HitSource, number> = { bullet: 1, parry: 40, blowback: 30, shove: 20, knock: 80, crash: 80 };
/** Out of the sprayed lane this close before the stream reaches the roach: "NA STYK!", as in the run. */
const CLOSE_CALL_MS = 250;
/** Every this many hits in a row without being touched, the score multiplier goes up one, to the most. */
const COMBO_STEP = 8;
const COMBO_MAX_MULT = 4;

// ── Feel ────────────────────────────────────────────────────────────
/** The fight holds still a moment on the hits that matter: a bullet under pressure, a canister, a knock, a third gone. */
const FREEZE_PRESSURE_MS = 30;
const FREEZE_PARRY_MS = 120;
const FREEZE_BLOWBACK_MS = 80;
const FREEZE_SHOVE_MS = 90;
const FREEZE_KNOCK_MS = 160;
const FREEZE_PHASE_MS = 280;
/** A killing hit holds the world this long on the impact, a moulted one this long; then the death plays at once, what hit
 * the roach flashing over it this long. */
const KILL_STOP_MS = 110;
const MOULT_STOP_MS = 90;
const CULPRIT_FLASH_MS = 500;
const BLINK_MS = 70;
/** The longest a single frame moves the fight's clock: a pause doesn't count, a hitch only this much. */
const MAX_STEP_MS = 250;
const SHAKE_MS = 140;
const SHAKE = 0.01;

// ── Looks ───────────────────────────────────────────────────────────
/** He walks in from past the right edge while the roach brakes and draws. */
const WALK_IN_MS = 2200;
const SETTLE_MS = 500;
const DRAW_MS = 500;
const DEFEAT_HOLD_MS = 1400;
const FADE_MS = 400;
/** The lunge stops this far short of what it meets. */
const LUNGE_SHORT = 6;
const RECOIL_PX = 4;
const RECOIL_MS = 120;
const GAS_GLOW = 0x9be04a;
const PRESSURE_GLOW = 0xffe14a;
const KEYCAP_ABOVE_PX = 96;
/** A canister in his fist from the lob's second frame (the cock) to its release. */
const HOLD_FROM_MS = 100;
/** His own gas over him when a canister bursts on him, this long. */
const OWN_GAS_MS = 700;
/** The landing shadow's footprint for a cloud, and for a mine its stretch. */
const CLOUD_FOOT_PX = 60;
const BULLET_SCALE = 0.4;

const SFX = {
  spray: 'ex-pressure', throw: 'ex-lob', land: 'ex-canister-pop', shotDown: 'shot-down', parry: 'boss-parry',
  tank: 'ex-tank-ping', tankHot: 'bullet-hit', vent: 'ex-tank-vent', pump: 'ex-pump', closeCall: 'na-styk',
  burst: 'ex-tank-burst', mask: 'ex-mask', victory: 'boss-victory', shot: 'boss-pistol', knock: 'ex-knock',
  shove: 'ex-shove', whiff: 'ex-whiff', struck: 'ex-struck', mineArm: 'ex-mine-arm', leak: 'ex-leak', charge: 'ex-charge',
  rush: 'ex-rush', bounce: 'ex-grenade-bounce',
};

interface Can {
  release: number; flight: number; lane: Lane; land: Throw['land']; from: { x: number; y: number };
  to: { x: number; y: number }; th: Throw; cue: number; canShoot: boolean;
  shot: boolean; landed: boolean; sprite: Phaser.GameObjects.Sprite | null; trail: Trail | null; threat: Threat;
}

/** One thing coming at the roach: the same record the simulation keeps, with what draws it. */
interface Threat {
  kind: HazardKind; lane: Lane; cue: number; at: number; lasts: number; fire: number; until: number;
  step: number; gone: boolean; passed: boolean; windup: number;
  /** A stream has reached the roach's spot (a hop just before it is a close call). */
  reached: boolean;
  can: Can | null;
  stream: SprayStream | null;
  sprite: Phaser.GameObjects.Sprite | null;
  /** Gas over a mine once it is armed. */
  gas: Phaser.GameObjects.Sprite | null;
}

interface Bullet { sprite: Phaser.GameObjects.Image; t0: number; lane: Lane; y0: number; pressured: boolean; lastX?: number }

/** Something sent back into him: from where, since when; it hits on arriving. */
interface Flyer { sprite: Phaser.GameObjects.Sprite; x: number; y: number; t0: number; ms: number; source: HitSource }

type Anim = { anim: EksAnim; start: number; then: EksAnim | 'rest' | null };

export class EksterminatorFight extends BossFight {
  readonly victoryBonus = VICTORY_BONUS;

  private readonly director: EksDirector;
  private readonly boss: Phaser.GameObjects.Sprite;
  private clock = 0;
  private lastNow: number | null = null;
  private events: { at: number; fn: () => void }[] = [];
  /** Bumped when a step is cut short (a phase over, the wand knocked): what it still had scheduled is dropped. */
  private gen = 0;
  private freezeUntil = 0;
  private stopped = false;

  /** His middle, px along the lane from the roach's spot; walking or shoved, from where to where. */
  private bx: number = DIST[FAR];
  private move: { from: number; to: number; t0: number; ms: number; pos: Pos | null } | null = null;
  /** Before the roach has stopped he walks in on the screen. */
  private walkScreenX: number | null;
  private anim: Anim = { anim: 'walk', start: 0, then: null };
  private reelUntil = -1;
  private reelStart = -1;
  /** What he reels in: the stagger, his knocked or shoved frames. */
  private reelAnim: EksAnim = 'stagger';

  private current: Step | null = null;
  private lobsSeen = 0;
  /** His charge in progress: from when, its timings, the lanes out and back. */
  private charge: { t0: number; c: NonNullable<Timed['charge']>; out: Lane; back: Lane } | null = null;
  /** The bouncing grenade and the chained canister in play: what draws them and their timings. */
  private grenade: { sprite: Phaser.GameObjects.Sprite; t0: number; bounces: NonNullable<Timed['bounces']>; lanes: Lane[]; threat: Threat } | null = null;
  private chain: { sprite: Phaser.GameObjects.Sprite; trail: Trail; t0: number; c: NonNullable<Timed['chain']>; out: Lane; back: Lane } | null = null;
  private stageFree = Infinity;
  private threats: Threat[] = [];
  private cans: Can[] = [];
  private pressure: { from: number; to: number }[] = [];
  private knock: { from: number; to: number; done: boolean; step: number } | null = null;
  private bullets: Bullet[] = [];
  private flyers: Flyer[] = [];
  private ownGas: { sprite: Phaser.GameObjects.Sprite; until: number } | null = null;
  private shotAt = -Infinity;
  private recoil = 0;
  private lunge: { t0: number; reach: number; hitsHim: boolean; arrived: boolean } | null = null;
  private combo = 0;

  private readonly zones: Record<Lane, KillZone>;
  private readonly mineZones: Record<Lane, KillZone>;
  private readonly shadow: LandingShadow;
  private readonly tankHalo: Halo;
  private readonly heldHalo: Halo;
  private held: Phaser.GameObjects.Sprite | null = null;
  private readonly hotText: Phaser.GameObjects.Text;
  private readonly comboText: Phaser.GameObjects.Text;
  private effects: Phaser.GameObjects.GameObject[] = [];
  private streamLoop: Phaser.Sound.BaseSound | null = null;
  private gasLoop: Phaser.Sound.BaseSound | null = null;
  private wispAt = 0;

  private prompted = new Set<Prompt['key']>();
  private prompt: { key: Prompt['key']; from: number; to: number; lane: Lane | null } | null = null;
  private keycap: Phaser.GameObjects.Text | Phaser.GameObjects.Image | null = null;
  /** A killing hit: what hit the roach, flashed over its death even after the fight is taken down. */
  private culprit: Phaser.GameObjects.Components.Alpha[] | null = null;
  private hitStop: { until: number; culprit: Phaser.GameObjects.Components.Alpha[]; deadly: boolean } | null = null;

  constructor(ctx: BossFightContext) {
    super(ctx);
    const { scene, player, abilities } = ctx;
    createEksAnimations(scene);
    const rand = fightRandom(ctx.seed, ctx.boss.id);
    this.director = new EksDirector(buildPhases(rand), rand);
    this.zones = { top: new KillZone(scene), bottom: new KillZone(scene) };
    this.mineZones = { top: new KillZone(scene), bottom: new KillZone(scene) };
    this.shadow = new LandingShadow(scene);
    this.tankHalo = new Halo(scene, PRESSURE_GLOW, DEPTH.OBSTACLES + 0.5);
    this.heldHalo = new Halo(scene, GAS_GLOW, DEPTH.OBSTACLES + 1);
    this.hotText = scene.add.text(0, 0, 'x3', popupStyle({ fontSize: '12px', color: '#ffe14a' }))
      .setOrigin(0.5).setDepth(DEPTH.POPUP - 1).setVisible(false);
    this.comboText = scene.add.text(0, 0, '', popupStyle({ fontSize: '12px', color: '#ffd36a' }))
      .setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.HUD).setVisible(false);

    const cam = scene.cameras.main;
    this.walkScreenX = cam.width + EKS_REACH.left * S;
    this.boss = scene.add.sprite(cam.scrollX + this.walkScreenX, ctx.floorBottomY, EKS_TEXTURE, eksFrame('walk'))
      .setScale(S).setDepth(DEPTH.OBSTACLES);

    // The pistol: owned by now in any real run; a dev shortcut that reached him without it is handed it here
    if (!abilities.canShoot) abilities.grant('gun');

    let ready = 0;
    const both = () => { if (++ready === 2) this.delay(SETTLE_MS, () => this.startFighting()); };
    // He walks to his spot on the screen: as far from the roach's spot (the camera keeps it 200 px in) as the set says
    const roachScreenX = player.x - cam.scrollX;
    scene.tweens.add({
      targets: this,
      walkScreenX: Math.min(cam.width - EKS_REACH.right * S - 6, roachScreenX + DIST[FAR]),
      duration: WALK_IN_MS,
      ease: 'Sine.easeOut',
      onComplete: () => both(),
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

  get inputLive(): boolean { return super.inputLive && !this.hitStop; }

  private startFighting(): void {
    const cam = this.ctx.scene.cameras.main;
    this.bx = cam.scrollX + this.walkScreenX! - this.holdX;
    this.walkScreenX = null;
    this.play('idle', null);
    this.state = 'fighting';
    try {
      if (this.ctx.scene.cache.audio.exists(this.ctx.boss.music)) this.ctx.audio.switchBGM(this.ctx.boss.music);
    } catch {
      // the fight goes on without its music
    }
    this.ctx.showBar(TANK_HP, TANK_HP);
    this.stageFree = this.clock;
  }

  // ── The clock ─────────────────────────────────────────────────────

  private atMs(t: number, fn: () => void): void {
    let i = this.events.length;
    while (i > 0 && this.events[i - 1].at > t) i--;
    this.events.splice(i, 0, { at: t, fn });
  }

  /** Part of the step in progress: dropped if it is cut short first. */
  private stepAt(t: number, fn: () => void): void {
    const gen = this.gen;
    this.atMs(t, () => { if (gen === this.gen && this.state === 'fighting') fn(); });
  }

  private freeze(ms: number): void {
    this.freezeUntil = Math.max(this.freezeUntil, this.ctx.scene.time.now + ms);
  }

  private pressured(t = this.clock): boolean {
    return this.pressure.some(w => t >= w.from && t < w.to);
  }

  /** The bar's hp, and what the fight shows of it. */
  private get over(): boolean { return this.state === 'done'; }
  private get fighting(): boolean { return this.state === 'fighting'; }

  // ── Every frame ───────────────────────────────────────────────────

  update(delta: number): void {
    if (this.over) return;
    if (this.holdHitStop()) return;
    const { scene, player } = this.ctx;
    const now = scene.time.now;
    const step = this.lastNow === null ? 0 : Math.min(MAX_STEP_MS, Math.max(0, now - this.lastNow));
    this.lastNow = now;
    if (this.walkScreenX !== null) this.boss.x = scene.cameras.main.scrollX + this.walkScreenX;
    if (now < this.freezeUntil) {
      // Held on a hit: the dash's own timer waits too, so the lunge and its protection stay together
      player.adjustTimersForPause(step);
      return;
    }
    this.clock += step;
    while (this.events.length && this.events[0].at <= this.clock && !this.over && !this.hitStop) this.events.shift()!.fn();
    if (this.over || this.hitStop) return;
    if (this.stopped) {
      player.updateDash();
      this.recoil = Math.max(0, this.recoil - (RECOIL_PX * delta) / RECOIL_MS);
      const forward = this.updateLunge();
      if (this.over) return;
      this.holdPlayer(Math.round(this.recoil - forward));
    }
    if (this.walkScreenX === null) this.updateMove();
    if (this.fighting) {
      const pending = this.threats.some(t => !t.gone && !t.passed && t.kind !== 'mine' && this.clock < t.at + t.lasts);
      if (this.clock >= this.stageFree && !pending && !this.flyers.length) this.advance();
      this.updateCans();
      this.updateBullets();
      if (this.over || this.hitStop) return;
      this.updateFlyers();
      if (this.over || this.hitStop) return;
      this.reachRoach();
      if (this.over || this.hitStop) return;
    }
    this.draw();
  }

  // ── Steps ─────────────────────────────────────────────────────────

  /** The stage is free: the next thing the job has. */
  private advance(): void {
    const { player } = this.ctx;
    // A mine he left lying on the lane the roach is not on: the next attack is one it can answer without that lane
    const mine = this.threats.find(t => t.kind === 'mine' && !t.gone && this.clock < t.until);
    if (mine && this.current?.kind === 'attack' && this.current.attack.kind === 'mine' && mine.lane !== player.currentFloor) {
      this.director.mineStays();
    }
    this.threats = this.threats.filter(t => !t.gone && !(t.passed && t.kind !== 'mine'));
    const step = this.director.next();
    const at = this.clock;
    this.current = step;
    this.stageFree = at + stepLength(step);
    if (step.kind === 'walk') {
      this.walkTo((step.pos + 1) as Pos, at, Math.round(WALK_STEP_MS * step.tempo));
      if ((step.pos + 1) === NEAR && !this.prompted.has('dash-shove')) {
        this.prompted.add('dash-shove');
        this.prompt = { key: 'dash-shove', from: at + SHOVE_PROMPT.from, to: at + SHOVE_PROMPT.to, lane: null };
      }
      return;
    }
    this.playAttack(step.attack, step, at, player.currentFloor);
  }

  private playAttack(attack: Attack, step: Extract<Step, { kind: 'attack' }>, at: number, roachLane: Lane): void {
    const timed = timeAttack(attack, step.pos, step.tempo);
    if (timed.approach > 0) this.walkTo(NEAR, at, timed.approach);
    for (const w of timed.pressure) {
      if (!this.pressured(at + w.from)) this.director.pressureOpened();
      this.pressure.push({ from: at + w.from, to: at + w.to });
    }
    this.knock = timed.knock ? { from: at + timed.knock.from, to: at + timed.knock.to, done: false, step: step.index } : null;
    const made: Threat[] = timed.hazards.map(h => ({
      kind: h.kind, lane: resolve(h.lane, roachLane), cue: at + h.cue, at: at + h.t, lasts: h.lasts, fire: at + h.fire,
      until: h.kind === 'mine' ? at + h.t + h.lasts : at + h.t + h.lasts, step: step.index, gone: false, passed: false,
      windup: at + (h.windup ?? h.cue), reached: false, can: null, stream: null, sprite: null, gas: null,
    }));
    timed.throws.forEach((th, i) => {
      const threat = made[timed.hazards.findIndex(h => h.from === i)];
      const lane = resolve(th.lane, roachLane);
      const from = releasePoint(step.pos);
      const to = { x: landX(th.land, step.pos), y: LANE_Y[lane] };
      const can: Can = {
        release: at + th.release, flight: th.flight, lane, land: th.land, from, to, th, cue: at, canShoot: th.glide > 0,
        shot: false, landed: false, sprite: null, trail: null, threat,
      };
      threat.can = can;
      this.cans.push(can);
      this.lob(can);
    });
    this.threats.push(...made);
    for (const t of made) if (t.kind === 'stream') this.spray(t, attack);
    if (attack.kind === 'pump') this.pump(at + timed.approach);
    if (attack.kind === 'charge') this.startCharge(timed, at, made);
    if (attack.kind === 'bounce') this.startBounce(timed, at, made, roachLane);
    if (attack.kind === 'chain') this.startChain(timed, at, roachLane);
    if (attack.kind === 'vent') {
      this.sfx(SFX.vent, 0.7);
      this.popupAt(this.tank.x, this.tank.y - 40, 'SPUST!', '#ffe14a', 14);
      // Venting, the tank lets go: the pressure window he was in is over
      this.pressure = this.pressure.map(w => ({ from: w.from, to: Math.min(w.to, at) }));
    }
    if (attack.kind === 'smoke') this.popupAt(this.boss.x, this.ctx.floorBottomY - 150, 'ZASŁONA!', '#c8ff7a', 12);
    // The first of each kind that teaches something carries its prompt
    const prompt = promptFor(attack, step.pos) ?? cloudPrompt(attack, step.pos);
    if (prompt && !this.prompted.has(prompt.key)) {
      this.prompted.add(prompt.key);
      this.prompt = { key: prompt.key, from: at + prompt.from, to: at + prompt.to, lane: resolve(prompt.lane, roachLane) };
    } else if (attack.kind === 'lob' && !this.prompted.has('dash-cloud') && this.lobsSeen++ >= 1) {
      // The canister's lesson came first; the next one teaches the dash through its cloud
      const cloud = cloudPrompt(attack, step.pos)!;
      this.prompted.add('dash-cloud');
      this.prompt = { key: 'dash-cloud', from: at + cloud.from, to: at + cloud.to, lane: roachLane };
    }
  }

  /** A walk step in, or the pump's walk in: his walk, and his place moving with it. */
  private walkTo(pos: Pos, at: number, ms: number): void {
    this.stepAt(at, () => {
      this.move = { from: this.bx, to: DIST[pos], t0: this.clock, ms, pos };
      this.play('walk', null);
    });
  }

  private updateMove(): void {
    const m = this.move;
    if (!m) return;
    const k = Phaser.Math.Clamp((this.clock - m.t0) / m.ms, 0, 1);
    this.bx = Phaser.Math.Linear(m.from, m.to, k);
    if (k < 1) return;
    this.move = null;
    if (m.pos !== null) this.director.moved(m.pos);
    if (this.anim.anim === 'walk') this.play('idle', null);
  }

  // ── The spray ─────────────────────────────────────────────────────

  /** From its wind-up the lane is marked (the stream will hold all of it), then the stream, then his release. */
  private spray(t: Threat, attack: Attack): void {
    const lane = t.lane;
    const length = t.lasts;
    this.stepAt(t.windup, () => this.play(lane === 'top' ? 'spray-top-windup' : 'spray-bottom-windup', null));
    this.stepAt(t.fire, () => {
      const { scene, floorBottomY } = this.ctx;
      const nozzle = lane === 'top' ? EKS_POINTS.nozzleTop : EKS_POINTS.nozzleBottom;
      const x = this.boss.x + nozzle.x * S;
      const y = floorBottomY + nozzle.y * S;
      const cam = scene.cameras.main;
      // Its front reaches the roach STREAM_REACH_MS after it leaves, as the set says, and races on to the edge
      const toRoach = Math.max(1, x - this.holdX);
      const growMs = STREAM_REACH_MS * (x - cam.scrollX + 20) / toRoach;
      t.stream = new SprayStream(scene, {
        lane, nozzleX: x, nozzleY: y, laneY: lane === 'top' ? y : floorBottomY + BOTTOM_STREAM_Y * S, startedAt: this.clock, growMs,
      });
      this.play(lane === 'top' ? 'spray-top' : 'spray-bottom', null);
      this.sfx(SFX.spray, attack.kind === 'jets' ? 0.45 : 0.7);
      scene.cameras.main.shake(SHAKE_MS, attack.kind === 'vent' ? SHAKE * 0.6 : SHAKE * 0.4);
    });
    this.stepAt(t.fire + length, () => {
      t.stream?.destroy();
      t.stream = null;
      if (attack.kind !== 'jets') this.play(lane === 'top' ? 'spray-top-release' : 'spray-bottom-release', 'rest');
    });
  }

  // ── The pump ──────────────────────────────────────────────────────

  /** He pumps twice, the tank swelling and hissing harder each stroke, then braces, the nozzle glinting: dash now. */
  private pump(start: number): void {
    this.stepAt(start, () => {
      this.play('pump', null);
      for (let i = 0; i < 4; i++) this.stepAt(this.clock + i * 150, () => this.sfx(SFX.pump, 0.6));
    });
  }

  // ── Canisters ─────────────────────────────────────────────────────

  /**
   * A canister: in his fist, glowing, from the lob's cock; its landing spot shadowed from the start (a spot, not the
   * lane); out of his hand on the release frame, trailing green, to its spot, where it is a cloud or a mine.
   */
  private lob(can: Can): void {
    this.stepAt(can.cue, () => this.play('lob', 'rest'));
    this.stepAt(can.cue + HOLD_FROM_MS, () => {
      const at = this.handAt(EKS_POINTS.cocked);
      this.held?.destroy();
      this.held = this.ctx.scene.add.sprite(at.x, at.y, EKS_TEXTURE, eksFrame(can.land === 'spot' ? 'mine' : 'canister'))
        .setScale(S).setDepth(DEPTH.OBSTACLES + 2);
      glint(this.ctx.scene, at.x, at.y, GAS_GLOW, 18, 280);
    });
    this.stepAt(can.release, () => {
      this.dropHeld();
      const { scene } = this.ctx;
      const p = this.world(can.from);
      glint(scene, p.x, p.y, GAS_GLOW, 24, 300);
      sparkBurst(scene, p.x, p.y, GAS_GLOW, 10, -1, 48);
      can.sprite = scene.add.sprite(p.x, p.y, EKS_TEXTURE, eksFrame(can.land === 'spot' ? 'mine' : 'canister'))
        .setScale(S).setDepth(DEPTH.PICKUPS + 2);
      can.trail = new Trail(scene, GAS_GLOW, 340, 10, DEPTH.PICKUPS + 1);
      this.sfx(SFX.throw, 0.5);
    });
  }

  private world(p: { x: number; y: number }): { x: number; y: number } {
    return { x: this.holdX + p.x, y: this.ctx.floorBottomY + p.y };
  }

  private handAt(point: { x: number; y: number }): { x: number; y: number } {
    return { x: this.boss.x + point.x * S, y: this.ctx.floorBottomY + point.y * S - 4 * S };
  }

  private dropHeld(): void {
    this.held?.destroy();
    this.held = null;
    this.heldHalo.hide();
  }

  private updateCans(): void {
    for (const can of this.cans) {
      if (can.shot || can.landed || this.clock < can.release || !can.sprite) continue;
      const elapsed = this.clock - can.release;
      if (elapsed >= can.flight) {
        this.landCan(can);
        continue;
      }
      const p = this.world(canisterAt(elapsed, can.th, can.from, can.to));
      can.sprite.setPosition(p.x, p.y);
      const anim = can.land === 'spot' ? 'mine' : 'canister';
      can.sprite.setFrame(eksFrame(anim, frameAt(anim, this.clock)));
      // In the pistol's line (its glide): it flashes, the moment a shot meets it
      if (inLine(elapsed, can.th) && Math.floor(this.clock / 40) % 2 === 0) can.sprite.setTintFill(0xffffff);
      else can.sprite.clearTint();
      can.trail?.push(p.x, p.y);
    }
    this.cans = this.cans.filter(c => !c.shot && !c.landed);
  }

  /** Down: a splat, and its cloud boiling on the spot, or a mine lying on the roach's. */
  private landCan(can: Can): void {
    const { scene } = this.ctx;
    can.landed = true;
    can.trail?.destroy();
    can.trail = null;
    const t = can.threat;
    const p = this.world(can.to);
    if (t.gone) {
      can.sprite?.destroy();
      can.sprite = null;
      return;
    }
    this.sfx(SFX.land, can.land === 'spot' ? 0.6 : 0.8);
    scene.cameras.main.shake(100, 0.005);
    this.puff(p.x, p.y - 10, 10, 30);
    if (can.land === 'spot') {
      can.sprite!.setFrame(eksFrame('mine', 0)).setPosition(p.x, p.y).setDepth(DEPTH.PICKUPS + 1);
      t.sprite = can.sprite;
      can.sprite = null;
      this.stepAt(t.at, () => {
        if (t.gone) return;
        this.sfx(SFX.mineArm, 0.5);
        t.gas = scene.add.sprite(p.x, p.y, EKS_TEXTURE, eksFrame('cloud')).setScale(S).setDepth(DEPTH.PICKUPS + 1);
      });
      return;
    }
    can.sprite?.destroy();
    can.sprite = null;
    t.sprite = scene.add.sprite(p.x, p.y, EKS_TEXTURE, eksFrame('cloud')).setScale(S).setDepth(DEPTH.PICKUPS + 1);
  }

  /** Where a cloud is along its lane now, px from the roach's spot (null before it lands). */
  private cloudX(t: Threat): number | null {
    if (!t.can || this.clock < t.fire) return null;
    const x0 = t.can.to.x;
    const sit = t.at - t.fire - ((x0 - CLOUD_HIT_PX) / CLOUD_ROLL) * 1000;
    return this.clock < t.fire + sit ? x0 : x0 - ((this.clock - t.fire - sit) * CLOUD_ROLL) / 1000;
  }

  // ── The roach's gun ───────────────────────────────────────────────

  shoot(): void {
    if (!this.fighting || this.hitStop || this.clock - this.shotAt < SHOOT_MS) return;
    this.shotAt = this.clock;
    const { scene, player } = this.ctx;
    const muzzle = player.shoot();
    const sprite = scene.add.image(muzzle.x, muzzle.y, 'boss-shell').setScale(BULLET_SCALE).setDepth(DEPTH.GODRAY);
    this.bullets.push({ sprite, t0: this.clock, lane: player.currentFloor, y0: muzzle.y, pressured: this.pressured() });
    this.sfx(SFX.shot, 0.5);
    gunfire(scene, muzzle, player.sprite.depth);
    this.recoil = RECOIL_PX;
  }

  /** Bullets: a canister coming down on their lane is met (they curve up into it), else his tank. */
  private updateBullets(): void {
    const right = this.ctx.scene.cameras.main.scrollX + this.ctx.scene.cameras.main.width + 50;
    for (const b of this.bullets) {
      const x = MUZZLE_DX + ((this.clock - b.t0) * BULLET_SPEED) / 1000;
      const prevX = b.lastX ?? x;
      b.lastX = x;
      // Flat along its lane at the pistol's height: it meets a canister only while that glides in the same line, as
      // it crosses it (one high in its arc it passes under)
      const can = this.cans.find(c => c.canShoot && !c.shot && !c.landed && c.lane === b.lane
        && inLine(this.clock - c.release, c.th) && (cx => x >= cx - INTERCEPT_PX && prevX <= cx + INTERCEPT_PX)(
          canisterAt(this.clock - c.release, c.th, c.from, c.to).x));
      if (can) {
        b.t0 = -Infinity;
        this.shootDown(can);
        if (this.over || this.hitStop) return;
        continue;
      }
      b.sprite.setPosition(this.holdX + x, b.y0);
      const hx = this.himX;
      if (hx - BODY_PX > MUZZLE_DX && x >= hx - BODY_PX) {
        b.t0 = -Infinity;
        this.hit('bullet', b.pressured || this.pressured(), b.sprite.x, b.sprite.y);
        if (this.over || this.hitStop) return;
      } else if (b.sprite.x > right) b.t0 = -Infinity;
    }
    for (const b of this.bullets.filter(b => b.t0 === -Infinity)) b.sprite.destroy();
    this.bullets = this.bullets.filter(b => b.t0 !== -Infinity);
  }

  /** A canister shot out of the air: it pops, and its gas bursts over him. */
  private shootDown(can: Can): void {
    const { scene } = this.ctx;
    can.shot = true;
    can.threat.gone = true;
    const at = can.sprite ? { x: can.sprite.x, y: can.sprite.y } : this.world(can.to);
    can.sprite?.destroy();
    can.sprite = null;
    can.trail?.destroy();
    can.trail = null;
    this.sfx(SFX.shotDown, 0.5);
    this.sfx(SFX.parry, 0.7);
    glint(scene, at.x, at.y, 0xffffff, 30, 260);
    this.puff(at.x, at.y, 8, 22);
    this.streak(at, this.tank, GAS_GLOW);
    this.gasOverHim();
    this.reel();
    this.hit('parry', false, this.tank.x, this.tank.y);
  }

  /** His own gas bursting over him, a moment. */
  private gasOverHim(): void {
    const { scene } = this.ctx;
    this.ownGas?.sprite.destroy();
    const sprite = scene.add.sprite(this.boss.x - 10, this.ctx.floorBottomY - 60, EKS_TEXTURE, eksFrame('cloud'))
      .setScale(S).setDepth(DEPTH.OBSTACLES + 1.5);
    this.ownGas = { sprite, until: this.clock + OWN_GAS_MS };
    this.puff(this.tank.x, this.tank.y, 12, 50);
  }

  // ── The roach's dash ──────────────────────────────────────────────

  dash(): void {
    const { player, scene } = this.ctx;
    if (!this.fighting || this.lunge || this.hitStop || !player.dashReady || player.isDashing) return;
    player.startDash();
    this.prompt = null;
    this.hideKeycap();
    const lane = player.currentFloor;
    // Him charging, the chain or the grenade, met as they come at the roach: the lunge runs into them
    const passing = (t: Threat) => (t.kind === 'roller' || t.kind === 'chain' || t.kind === 'him')
      && this.clock >= t.fire && this.clock >= t.at - MEET_MS && this.clock <= t.at + t.lasts;
    const meet = this.threats.filter(t => !t.gone && !t.passed && t.lane === lane && passing(t)).sort((a, b) => a.at - b.at)[0];
    if (meet) {
      this.lunge = { t0: this.clock, reach: 40, hitsHim: false, arrived: false };
      if (meet.kind === 'him') {
        this.stepAt(this.clock + LUNGE_OUT_MS, () => this.crash());
      } else {
        meet.gone = true;
        const sprite = meet.kind === 'roller' ? this.grenade?.sprite : this.chain?.sprite;
        if (meet.kind === 'roller') this.grenade = null;
        if (meet.kind === 'chain' && this.chain) {
          for (const t of this.threats) if (t.kind === 'chain') t.gone = true;
          this.chain.trail.destroy();
          this.chain = null;
        }
        if (sprite) this.flyers.push({ sprite, x: sprite.x, y: sprite.y, t0: this.clock + LUNGE_OUT_MS, ms: RETURN_MS, source: meet.kind === 'chain' ? 'parry' : 'blowback' });
      }
      this.sfx(SFX.parry, 0.7);
      return;
    }
    // The first thing in reach on its lane takes the lunge: a cloud or a mine, blown back into him
    const met = this.threats.filter(t => !t.gone && !t.passed && t.lane === lane && (
      (t.kind === 'mine' && this.clock >= t.fire && this.clock < t.until)
      || (t.kind === 'cloud' && (x => x !== null && x > -CLOUD_HIT_PX && x <= LUNGE_REACH)(this.cloudX(t)))));
    if (met.length) {
      const near = Math.min(...met.map(t => (t.kind === 'mine' ? MINE_AT : this.cloudX(t)!)));
      this.lunge = { t0: this.clock, reach: Math.max(20, near), hitsHim: false, arrived: false };
      for (const t of met) {
        t.gone = true;
        if (t.kind === 'mine') this.director.mineGone();
        const sprite = t.sprite;
        t.sprite = null;
        t.gas?.destroy();
        t.gas = null;
        if (sprite) this.flyers.push({ sprite, x: sprite.x, y: sprite.y, t0: this.clock + LUNGE_OUT_MS, ms: RETURN_MS, source: 'blowback' });
      }
      this.sfx(SFX.parry, 0.6);
      return;
    }
    const reaches = bodyX(this.director.pos) <= LUNGE_REACH && !this.director.finale && !this.charge;
    const reach = reaches ? this.bx - BODY_PX - LUNGE_SHORT : LUNGE_REACH;
    this.lunge = { t0: this.clock, reach, hitsHim: reaches, arrived: false };
    if (!reaches) scene.cameras.main.shake(SHAKE_MS / 3, SHAKE / 4);
  }

  /** The roach's offset along its lunge; on arriving, a knock, a shove or nothing. */
  private updateLunge(): number {
    const lunge = this.lunge;
    if (!lunge) return 0;
    const t = this.clock - lunge.t0;
    if (t >= LUNGE_OUT_MS && !lunge.arrived) {
      lunge.arrived = true;
      this.arrive(lunge);
      if (this.over) return 0;
    }
    if (t >= DASH_MS) {
      this.lunge = null;
      return 0;
    }
    return lungeOffset(t, lunge.reach);
  }

  private arrive(lunge: { hitsHim: boolean; reach: number }): void {
    const { scene } = this.ctx;
    if (!lunge.hitsHim) {
      // A lunge into empty air (a cloud or mine it met is sent back on its own)
      if (lunge.reach >= LUNGE_REACH) {
        this.sfx(SFX.whiff, 0.3);
        this.combo = 0;
      }
      return;
    }
    const knock = this.knock;
    if (knock && !knock.done && this.clock >= knock.from && this.clock < knock.to) {
      knock.done = true;
      // The wand flies aside: the sweep is off, he reels, the tank hisses open
      this.gen++;
      for (const t of this.threats) {
        if (t.step !== knock.step || t.kind !== 'stream') continue;
        t.gone = true;
        t.stream?.destroy();
        t.stream = null;
      }
      if (!this.pressured()) this.director.pressureOpened();
      this.pressure = [{ from: this.clock, to: this.clock + KNOCK_OPEN_MS }];
      this.stageFree = this.clock + STAGGER_MS + KNOCK_OPEN_MS;
      this.play('idle', null);
      this.reel(STAGGER_MS + 300, 'knocked');
      glint(scene, this.boss.x + EKS_POINTS.nozzleTop.x * S, this.ctx.floorBottomY + EKS_POINTS.nozzleTop.y * S, 0xffffff, 34, 320);
      this.popupAt(this.boss.x, this.ctx.floorBottomY - 170, 'WYTRĄCONY!', '#7fe0ff', 16);
      this.sfx(SFX.knock, 0.8);
      this.sfx(SFX.vent, 0.6);
      this.hit('knock', false, this.tank.x, this.tank.y);
      return;
    }
    // A shove: he is sent reeling back home
    this.move = { from: this.bx, to: DIST[FAR], t0: this.clock, ms: SHOVE_MS, pos: null };
    this.director.moved(FAR);
    this.reel(SHOVE_MS, 'shoved');
    this.popupAt(this.boss.x, this.ctx.floorBottomY - 170, 'ODEPCHNIĘTY!', '#ffb070', 12);
    this.sfx(SFX.shove, 0.7);
    this.hit('shove', false, this.boss.x - 60, this.ctx.floorBottomY - 60);
  }

  /** Clouds and mines sent back fly into his tank, and hit on arriving. */
  private updateFlyers(): void {
    for (const f of this.flyers) {
      const k = Phaser.Math.Clamp((this.clock - f.t0) / f.ms, 0, 1);
      const to = this.tank;
      f.sprite.setPosition(Phaser.Math.Linear(f.x, to.x, k), Phaser.Math.Linear(f.y, to.y, k * k));
      if (k < 1) continue;
      f.sprite.destroy();
      f.ms = -1;
      this.gasOverHim();
      this.reel();
      this.popupAt(this.tank.x, this.tank.y - 40, f.source === 'parry' ? 'ODDANY!' : 'Z POWROTEM!', '#c8ff7a', 12);
      this.hit(f.source, false, to.x, to.y);
      if (this.over || this.hitStop) return;
    }
    this.flyers = this.flyers.filter(f => f.ms >= 0);
  }

  /** His middle along the lane from the roach's spot, wherever he is (charging, walking, home). */
  private get himX(): number { return this.bx; }

  // ── His charge ────────────────────────────────────────────────────

  /**
   * He braces (crouched, on the lane he will charge: up onto the top ledge if that one), charges along it past the
   * roach and off the screen, turns onto the other lane and charges home along it. A dash into him as he passes sends
   * him reeling home, the tank open.
   */
  private startCharge(timed: Timed, at: number, made: Threat[]): void {
    const c = timed.charge!;
    const out = made[0].lane;
    this.stepAt(at, () => {
      this.charge = { t0: this.clock, c, out, back: out === 'top' ? 'bottom' : 'top' };
      this.play('brace', null);
      this.sfx(SFX.charge, 0.6);
      glint(this.ctx.scene, this.boss.x, this.laneY(out) - 120, 0xff5a3c, 26, 320);
    });
    this.stepAt(at + c.go, () => {
      this.play('charge', null);
      this.sfx(SFX.rush, 0.6);
    });
    this.stepAt(at + c.back, () => this.sfx(SFX.rush, 0.6));
  }

  private drawCharge(): void {
    const ch = this.charge;
    if (!ch) return;
    const ms = this.clock - ch.t0;
    if (ms >= ch.c.home) {
      this.endCharge();
      return;
    }
    const at = chargeAt(ms, ch.c);
    this.bx = at.x;
    const lane = at.leg === 'back' ? ch.back : ch.out;
    const k = at.leg === 'brace' ? Phaser.Math.Clamp(ms / 300, 0, 1) : 1;
    this.boss.y = Phaser.Math.Linear(this.ctx.floorBottomY, this.laneY(lane), k);
    this.boss.setFlipX(at.leg === 'back');
  }

  private endCharge(): void {
    this.charge = null;
    this.boss.setFlipX(false);
    this.boss.y = this.ctx.floorBottomY;
    this.bx = DIST[FAR];
    this.director.moved(FAR);
    this.play('idle', null);
  }

  /** A dash into him as he charges past: he is thrown home reeling, the rest of the charge is off, the tank open. */
  private crash(): void {
    if (!this.charge) return;
    for (const t of this.threats) if (t.kind === 'him') t.gone = true;
    this.charge = null;
    this.boss.setFlipX(false);
    this.boss.y = this.ctx.floorBottomY;
    this.move = { from: Math.max(this.bx, 60), to: DIST[FAR], t0: this.clock, ms: SHOVE_MS * 2, pos: null };
    this.director.moved(FAR);
    if (!this.pressured()) this.director.pressureOpened();
    this.pressure = [{ from: this.clock, to: this.clock + KNOCK_OPEN_MS }];
    this.stageFree = this.clock + STAGGER_MS + KNOCK_OPEN_MS;
    this.play('idle', null);
    this.reel(STAGGER_MS + 300, 'shoved');
    glint(this.ctx.scene, this.ctx.player.x + 40, this.ctx.player.y - 30, 0xffffff, 34, 320);
    this.popupAt(this.holdX + 120, this.ctx.floorBottomY - 170, 'ZDERZENIE!', '#7fe0ff', 16);
    this.sfx(SFX.shove, 0.9);
    this.hit('crash', false, this.ctx.player.x + 40, this.ctx.player.y - 30);
  }

  // ── The bouncing grenade ──────────────────────────────────────────

  /** Like Pani Lodzia's curler: three landings on a steady beat, each shadowed ahead; the third settles it, with a
   * flash and a bigger puff, on the roach's lane, and it rolls at the roach. */
  private startBounce(timed: Timed, at: number, made: Threat[], roachLane: Lane): void {
    const bounces = timed.bounces!;
    const threat = made.find(t => t.kind === 'roller')!;
    this.stepAt(at, () => this.play('lob', 'rest'));
    this.stepAt(at + LOB_RELEASE_MS, () => {
      const p = this.world(releasePoint(this.director.pos));
      const sprite = this.ctx.scene.add.sprite(p.x, p.y, EKS_TEXTURE, eksFrame('grenade')).setScale(S).setDepth(DEPTH.PICKUPS + 2);
      this.grenade = { sprite, t0: at, bounces, lanes: bounces.map(b => resolve(b.lane, roachLane)), threat };
      this.sfx(SFX.throw, 0.5);
    });
    bounces.forEach((b, k) => this.stepAt(at + b.at, () => {
      const g = this.grenade;
      if (!g) return;
      const last = k === bounces.length - 1;
      this.sfx(SFX.bounce, last ? 0.8 : 0.5);
      const w = this.world({ x: b.x, y: LANE_Y[g.lanes[k]] });
      this.puff(w.x, w.y - 6, last ? 8 : 4, last ? 26 : 14);
      if (last) glint(this.ctx.scene, w.x, w.y - 12, GAS_GLOW, 22, 260);
    }));
  }

  private drawGrenade(): void {
    const g = this.grenade;
    if (!g) return;
    if (g.threat.gone && !this.flyers.some(f => f.sprite === g.sprite)) {
      g.sprite.destroy();
      this.grenade = null;
      return;
    }
    const ms = this.clock - g.t0;
    const b = g.bounces;
    const last = b.length - 1;
    const pt = (k: number) => ({ x: b[k].x, y: LANE_Y[g.lanes[k]] - 6 });
    let pos: { x: number; y: number };
    if (ms < b[0].at) {
      pos = canisterAt(ms - LOB_RELEASE_MS, { flight: b[0].at - LOB_RELEASE_MS, glide: 0, land: 'ahead' }, releasePoint(this.director.pos), pt(0));
    } else if (ms < b[last].at) {
      const k = b.findIndex(x => ms < x.at) - 1;
      const f = (ms - b[k].at) / (b[k + 1].at - b[k].at);
      const a = pt(k);
      const z = pt(k + 1);
      pos = { x: Phaser.Math.Linear(a.x, z.x, f), y: Phaser.Math.Linear(a.y, z.y, f) - 50 * Math.sin(Math.PI * f) };
    } else {
      // Settled: rolling at the roach, reaching it in the middle of its touch, and on off the screen
      const t = g.threat;
      const settle = b[last].at + g.t0;
      const f = (this.clock - settle) / Math.max(1, t.at + t.lasts / 2 - settle);
      pos = { x: b[last].x * (1 - f), y: LANE_Y[g.lanes[last]] - 6 };
    }
    const w = this.world(pos);
    g.sprite.setPosition(w.x, w.y).setFrame(eksFrame('grenade', frameAt('grenade', this.clock)));
    if (pos.x < -400) {
      g.sprite.destroy();
      this.grenade = null;
    }
  }

  /** The grenade's next landing, shadowed on its spot from the bounce before. */
  private grenadeSpot(): Spot | null {
    const g = this.grenade;
    if (!g) return null;
    const ms = this.clock - g.t0;
    const k = g.bounces.findIndex(b => ms < b.at);
    if (k < 0) return null;
    const from = k === 0 ? LOB_RELEASE_MS : g.bounces[k - 1].at;
    const x = this.holdX + g.bounces[k].x;
    return { x0: x - 20, x1: x + 20, y: this.laneY(g.lanes[k]) - 1, progress: (ms - from) / (g.bounces[k].at - from) };
  }

  // ── The chained canister ──────────────────────────────────────────

  /** Swung off his hand along the roach's lane, under the pistol's line, round the far end and back along the other. */
  private startChain(timed: Timed, at: number, roachLane: Lane): void {
    const c = timed.chain!;
    this.stepAt(at, () => this.play('lob', 'rest'));
    this.stepAt(at + c.go, () => {
      const sprite = this.ctx.scene.add.sprite(0, 0, EKS_TEXTURE, eksFrame('chain')).setScale(S).setDepth(DEPTH.PICKUPS + 2);
      this.chain = {
        sprite, trail: new Trail(this.ctx.scene, GAS_GLOW, 260, 8, DEPTH.PICKUPS + 1), t0: at, c, out: roachLane,
        back: roachLane === 'top' ? 'bottom' : 'top',
      };
      this.sfx(SFX.throw, 0.6);
    });
  }

  private drawChain(): void {
    const ch = this.chain;
    if (!ch) return;
    const at = chainAt(this.clock - ch.t0, ch.c);
    if (!at) {
      ch.sprite.destroy();
      ch.trail.destroy();
      this.chain = null;
      return;
    }
    const w = this.world({ x: at.x, y: LANE_Y[at.out ? ch.out : ch.back] - 10 });
    // Its chain trails behind it: to the right on the way out, to the left on the way back
    ch.sprite.setPosition(w.x, w.y).setFrame(eksFrame('chain', frameAt('chain', this.clock))).setFlipX(!at.out);
    ch.trail.push(w.x, w.y);
  }

  // ── Hits on him ───────────────────────────────────────────────────

  private get tank(): { x: number; y: number } {
    return { x: this.boss.x + EKS_POINTS.tank.x * S, y: this.ctx.floorBottomY + EKS_POINTS.tank.y * S };
  }

  /** He reels: his stagger (or the knock's or the shove's own frames) over whatever he is doing, which goes on
   * underneath. A knock or a shove takes over a stagger already playing. */
  private reel(ms = STAGGER_MS, anim: EksAnim = 'stagger'): void {
    if (this.clock >= this.reelUntil || (anim !== 'stagger' && anim !== this.reelAnim)) {
      this.reelStart = this.clock;
      this.reelAnim = anim;
    }
    this.reelUntil = Math.max(this.reelUntil, this.clock + ms);
  }

  /** A hit lands: the bar, a number, sparks, the combo, a hit-stop for the big ones; and what it did to the fight. */
  private hit(source: HitSource, pressured: boolean, x: number, y: number): void {
    if (!this.fighting) return;
    const r = this.director.hit(source, pressured);
    if (r.dealt <= 0) return;
    const { scene } = this.ctx;
    this.ctx.updateBar(this.director.hp);
    this.combo++;
    const hot = r.mult > 1;
    const big = source !== 'bullet';
    this.popupAt(x, y - 24, hot ? `-${r.dealt} x${r.mult}` : `-${r.dealt}`, big ? '#7fe0ff' : hot ? '#ffe14a' : '#ffb070', big ? 16 : hot ? 12 : 9);
    this.score(SCORE[source]);
    getFx(scene).play('spark', x, y, { depth: DEPTH.POPUP - 1 });
    if (source === 'bullet') {
      this.sfx(hot ? SFX.tankHot : SFX.tank, hot ? 0.6 : 0.45);
      if (hot) {
        sparkBurst(scene, x, y, PRESSURE_GLOW, 6, 1, 30);
        this.puff(x + 6, y - 10, 3, 12);
        this.freeze(FREEZE_PRESSURE_MS);
      }
    } else {
      sparkBurst(scene, x, y, GAS_GLOW, 14, 1, 60);
      scene.cameras.main.shake(SHAKE_MS, SHAKE);
      this.freeze({ parry: FREEZE_PARRY_MS, blowback: FREEZE_BLOWBACK_MS, shove: FREEZE_SHOVE_MS, knock: FREEZE_KNOCK_MS, crash: FREEZE_KNOCK_MS, bullet: 0 }[source]);
    }
    if (r.rage !== null && !r.won) {
      // Rage: a step faster, the tank whistling higher each time
      this.popupAt(this.boss.x, this.ctx.floorBottomY - 200, 'SZYBCIEJ!', '#ff5a3c', 16);
      this.sfx(SFX.leak, 0.8, 1 + (1 - r.rage) * 2.5);
      this.puff(this.tank.x, this.tank.y - 20, 10, 40);
    }
    if (r.won) this.defeat();
    else if (r.phaseStarted !== null || r.finale) this.nextStage(r.finale);
    else if (r.vents) this.pressure = this.pressure.map(w => ({ from: w.from, to: Math.min(w.to, this.clock) }));
  }

  /** A third of his tank gone, or the leak: the stage clears, he reels, and what comes next is new. */
  private nextStage(finale: boolean): void {
    const { scene } = this.ctx;
    this.clearStage();
    this.freeze(FREEZE_PHASE_MS);
    this.stageFree = this.clock + PHASE_BREATHER_MS;
    this.reel(STAGGER_MS * 2);
    scene.cameras.main.shake(SHAKE_MS * 2, SHAKE * 1.5);
    this.sfx(SFX.vent, 0.8);
    this.puff(this.tank.x, this.tank.y, 16, 50);
    const word = finale ? 'CIEKNIE!' : this.director.phase === 1 ? 'PODCHODZI!' : 'POMPUJE!';
    this.popupAt(this.boss.x, this.ctx.floorBottomY - 190, word, '#ff9a3c', 18);
    // Leaking, he backs off out of reach
    if (finale) this.move = { from: this.bx, to: DIST[FAR], t0: this.clock, ms: SHOVE_MS * 2, pos: null };
  }

  /** Everything he had going goes up in a harmless puff: the next stage starts on clean lanes. */
  private clearStage(): void {
    this.gen++;
    for (const t of this.threats) {
      if (!t.gone && !t.passed) {
        const s = t.sprite ?? t.can?.sprite;
        if (s) this.puff(s.x, s.y - 20, 6, 24);
      }
      this.dropThreat(t);
    }
    this.threats = [];
    for (const c of this.cans) this.dropCan(c);
    this.cans = [];
    this.pressure = [];
    this.knock = null;
    this.dropHeld();
    this.prompt = null;
    this.hideKeycap();
    for (const lane of ['top', 'bottom'] as Lane[]) {
      this.zones[lane].hide();
      this.mineZones[lane].hide();
    }
    this.shadow.hide();
    if (this.charge) this.endCharge();
    this.grenade?.sprite.destroy();
    this.grenade = null;
    if (this.chain) {
      this.chain.sprite.destroy();
      this.chain.trail.destroy();
      this.chain = null;
    }
    if (this.move?.pos !== null && this.move?.pos !== undefined) this.director.moved(this.move.pos);
    if (this.anim.anim !== 'walk') this.play('idle', null);
  }

  private dropThreat(t: Threat): void {
    t.gone = true;
    t.stream?.destroy();
    t.stream = null;
    t.sprite?.destroy();
    t.sprite = null;
    t.gas?.destroy();
    t.gas = null;
  }

  private dropCan(c: Can): void {
    c.shot = true;
    c.sprite?.destroy();
    c.sprite = null;
    c.trail?.destroy();
    c.trail = null;
  }

  private defeat(): void {
    const { scene } = this.ctx;
    this.state = 'victory';
    this.ctx.audio.fadeOutBGM();
    this.clearStage();
    for (const b of this.bullets) b.sprite.destroy();
    this.bullets = [];
    this.freeze(FREEZE_PHASE_MS);
    scene.cameras.main.shake(400, 0.02);
    this.sfx(SFX.burst, 0.7);
    this.puff(this.tank.x, this.tank.y, 18, 60);
    this.popupAt(this.boss.x, this.ctx.floorBottomY - 190, 'PĘKŁ!', '#ff9a3c', 20);
    this.reelUntil = -1;
    this.play('defeat', null);
    const ms = (EKS_ANIMS.defeat.frames * 1000) / EKS_ANIMS.defeat.fps;
    this.atMs(this.clock + ms, () => {
      this.sfx(SFX.mask, 0.6);
      this.sfx(SFX.victory, 0.7);
    });
    this.atMs(this.clock + ms + DEFEAT_HOLD_MS, () => {
      this.ctx.player.celebrate();
      scene.tweens.add({ targets: this.boss, alpha: 0, duration: FADE_MS, onComplete: () => this.win() });
    });
  }

  // ── What reaches the roach ────────────────────────────────────────

  /** Whether the roach is on this lane: pressed for it and drawn on it, so a hit is never on a lane it visibly left. */
  private onLane(lane: Lane): boolean {
    const { player, floorTopY, floorBottomY } = this.ctx;
    const drawn: Lane = player.sprite.y < (floorTopY + floorBottomY) / 2 ? 'top' : 'bottom';
    return player.currentFloor === lane && drawn === lane;
  }

  private reachRoach(): void {
    const { player } = this.ctx;
    for (const t of this.threats) {
      if (t.gone || t.passed) continue;
      if (t.kind === 'mine') {
        if (this.clock >= t.until) {
          t.passed = true;
          this.fizzle(t);
          continue;
        }
        if (this.clock >= t.at && this.onLane(t.lane) && !player.isDashing && !player.inMoultGrace) {
          this.struck([t.gas, t.sprite].filter((s): s is Phaser.GameObjects.Sprite => !!s));
          return;
        }
        continue;
      }
      if (this.clock < t.at) continue;
      if (!t.reached) {
        t.reached = true;
        this.closeCall(t);
      }
      if (this.clock >= t.at + t.lasts) {
        t.passed = true;
        if (t.kind === 'cloud' && t.sprite) this.rollOff(t);
        this.dodged(t);
        continue;
      }
      if (this.onLane(t.lane) && !player.isDashing && !player.inMoultGrace) {
        const culprit = t.stream ? t.stream.parts : t.kind === 'him' ? [this.boss]
          : t.kind === 'roller' ? [this.grenade?.sprite] : t.kind === 'chain' ? [this.chain?.sprite] : [t.sprite];
        this.struck(culprit.filter((o): o is Phaser.GameObjects.Sprite | Phaser.GameObjects.Image => !!o));
        return;
      }
    }
  }

  /** A mine's gas thins out and it is gone. */
  private fizzle(t: Threat): void {
    const objs = [t.sprite, t.gas].filter((s): s is Phaser.GameObjects.Sprite => !!s);
    t.sprite = t.gas = null;
    for (const s of objs) this.ctx.scene.tweens.add({ targets: s, alpha: 0, duration: 300, onComplete: () => s.destroy() });
  }

  /** A cloud past the roach rolls on off the screen, harmless now. */
  private rollOff(t: Threat): void {
    const s = t.sprite!;
    t.sprite = null;
    this.effects.push(s);
    this.ctx.scene.tweens.add({ targets: s, x: s.x - 260, alpha: 0, duration: 1100, onComplete: () => {
      this.effects = this.effects.filter(o => o !== s);
      s.destroy();
    } });
  }

  private dodged(t: Threat): void {
    if (this.ctx.player.currentFloor !== t.lane) this.ctx.addScore(DODGE_SCORE);
  }

  /** Out of a lane just before its stream got there: "NA STYK!", as in the run. */
  private closeCall(t: Threat): void {
    const { player, scene } = this.ctx;
    const hop = player.lastHop;
    if (t.kind !== 'stream' || player.currentFloor === t.lane || !hop || hop.from !== t.lane) return;
    if (scene.time.now - hop.at > CLOSE_CALL_MS) return;
    this.sfx(SFX.closeCall, 0.6);
    this.ctx.addScore(NEAR_MISS_SCORE);
    this.popup(`NA STYK! +${NEAR_MISS_SCORE}`, '#7fe0ff');
  }

  /**
   * Something got the roach. The moult takes it: the world holds a blink and the fight goes on. Otherwise the world
   * holds only on the impact, then the death plays at once, what hit it still flashing over it.
   */
  private struck(culprit: Phaser.GameObjects.Components.Alpha[]): void {
    const { scene } = this.ctx;
    const moulted = this.ctx.survivesHit();
    this.combo = 0;
    this.sfx(SFX.struck, 0.8);
    scene.cameras.main.shake(SHAKE_MS * 2, SHAKE * 2);
    this.hideKeycap();
    this.hitStop = { until: scene.time.now + (moulted ? MOULT_STOP_MS : KILL_STOP_MS), culprit, deadly: !moulted };
    if (!moulted) this.culprit = culprit;
  }

  private holdHitStop(): boolean {
    const stop = this.hitStop;
    if (!stop) return false;
    const now = this.ctx.scene.time.now;
    this.blink(stop.culprit, now);
    if (now < stop.until) return true;
    this.hitStop = null;
    if (stop.deadly) {
      this.lose('eksterminator');
      return true;
    }
    for (const c of stop.culprit) c.setAlpha(1);
    this.lastNow = now;
    return false;
  }

  private blink(objs: Phaser.GameObjects.Components.Alpha[], now: number): void {
    const on = Math.floor(now / BLINK_MS) % 2 === 0;
    for (const c of objs) {
      if ((c as unknown as Phaser.GameObjects.GameObject).active) c.setAlpha(on ? 1 : 0.15);
    }
  }

  // ── Drawing ───────────────────────────────────────────────────────

  private play(anim: EksAnim, then: Anim['then']): void {
    if (this.state === 'victory' && anim !== 'defeat') return;
    this.anim = { anim, start: this.clock, then };
  }

  private draw(): void {
    const { scene, floorBottomY } = this.ctx;
    this.drawCharge();
    if (this.walkScreenX === null) this.boss.x = this.holdX + this.bx;
    if (!this.charge) this.boss.y = floorBottomY;
    this.drawGrenade();
    this.drawChain();
    this.drawBoss();
    // The streams, the clouds rolling, the mines and their stretch, the landing shadows
    const cam = scene.cameras.main;
    const zone: Record<Lane, 'warn' | 'kill' | null> = { top: null, bottom: null };
    for (const t of this.threats) {
      if (t.gone) continue;
      if (t.kind === 'stream') {
        t.stream?.update(this.clock);
        if (this.clock >= Math.min(t.windup, t.cue) && this.clock < t.fire + t.lasts) {
          zone[t.lane] = this.clock >= t.fire ? 'kill' : zone[t.lane] ?? 'warn';
        }
      } else if (t.kind === 'him' && !t.passed) {
        // His charge runs the whole lane: marked from its read until he is past
        if (this.clock >= t.cue && this.clock < t.at + t.lasts) zone[t.lane] = this.clock >= t.at ? 'kill' : zone[t.lane] ?? 'warn';
      } else if (t.kind === 'cloud' && t.sprite && !t.passed) {
        const x = this.cloudX(t);
        if (x !== null) t.sprite.x = this.holdX + x;
        t.sprite.setFrame(eksFrame('cloud', frameAt('cloud', this.clock)));
      }
    }
    for (const lane of ['top', 'bottom'] as Lane[]) {
      const state = zone[lane];
      const nozzle = this.boss.x + (lane === 'top' ? EKS_POINTS.nozzleTop.x : EKS_POINTS.nozzleBottom.x) * S;
      if (state) this.zones[lane].show(this.laneY(lane), cam.scrollX, nozzle, state);
      else this.zones[lane].hide();
      const mine = this.threats.find(t => t.kind === 'mine' && t.lane === lane && !t.gone && !t.passed && this.clock >= t.fire);
      if (mine) {
        const x = this.holdX + MINE_AT;
        this.mineZones[lane].show(this.laneY(lane), x - MINE_HALF_PX, x + MINE_HALF_PX, this.clock >= mine.at ? 'kill' : 'warn');
        mine.sprite?.setFrame(eksFrame('mine', frameAt('mine', this.clock)));
        mine.gas?.setFrame(eksFrame('cloud', frameAt('cloud', this.clock)));
      } else this.mineZones[lane].hide();
    }
    const spots: Spot[] = [];
    for (const c of this.cans) {
      if (c.landed || c.shot) continue;
      const half = c.land === 'spot' ? MINE_HALF_PX : CLOUD_FOOT_PX / 2;
      const x = this.holdX + c.to.x;
      spots.push({ x0: x - half, x1: x + half, y: this.laneY(c.lane) - 1, progress: (this.clock - c.cue) / (c.release + c.flight - c.cue) });
    }
    const next = this.grenadeSpot();
    if (next) spots.push(next);
    this.shadow.showSpots(spots);
    // The canister in his fist through the lob's cock and whip, glowing brighter
    if (this.held) {
      const k = Phaser.Math.Clamp((this.clock - this.anim.start - HOLD_FROM_MS) / 200, 0, 1);
      const at = this.handAt(k < 0.5 ? EKS_POINTS.cocked : EKS_POINTS.whip);
      this.held.setPosition(at.x, at.y);
      this.heldHalo.show(at.x, at.y, 22 + 12 * k, 0.7 + 0.3 * k);
    }
    if (this.ownGas) {
      this.ownGas.sprite.setPosition(this.boss.x - 10, floorBottomY - 60)
        .setFrame(eksFrame('cloud', frameAt('cloud', this.clock)))
        .setAlpha(Phaser.Math.Clamp((this.ownGas.until - this.clock) / 300, 0, 1));
      if (this.clock >= this.ownGas.until) {
        this.ownGas.sprite.destroy();
        this.ownGas = null;
      }
    }
    this.drawPressure();
    this.drawCombo();
    this.drawKeycap();
    this.syncLoops();
  }

  private drawBoss(): void {
    let { anim, start } = this.anim;
    if (this.clock < this.reelUntil && this.state !== 'victory') {
      // Reeling: its frames, played through once and held on the last
      anim = this.reelAnim;
      start = this.reelStart;
    }
    const spec = EKS_ANIMS[anim];
    let index: number;
    if (spec.loop) {
      index = Math.floor((this.clock * spec.fps) / 1000) % spec.frames;
    } else {
      index = Math.floor(((this.clock - start) * spec.fps) / 1000);
      if (index >= spec.frames && anim === this.anim.anim && this.anim.then) {
        this.play(this.anim.then === 'rest' ? 'idle' : this.anim.then, null);
        this.drawBoss();
        return;
      }
      index = Phaser.Math.Clamp(index, 0, spec.frames - 1);
    }
    // At rest leaking, in the finale, he panics; under pressure he breathes with the tank swollen and whistling
    if (anim === 'idle' && this.fighting && this.director.finale) {
      anim = 'panic';
      index = Math.floor((this.clock * EKS_ANIMS.panic.fps) / 1000) % EKS_ANIMS.panic.frames;
    } else if (anim === 'idle' && (this.pressured() || this.director.tempo < 1) && this.fighting) {
      anim = 'idle-hot';
      index = Math.floor((this.clock * EKS_ANIMS['idle-hot'].fps) / 1000) % EKS_ANIMS['idle-hot'].frames;
    }
    this.boss.setFrame(eksFrame(anim, index));
  }

  /** Under pressure: a glow round the tank, gas curling off it, and "x3" over it. In the finale it leaks all the time. */
  private drawPressure(): void {
    const hot = this.fighting && this.pressured();
    const tank = this.tank;
    if (hot) {
      const pulse = (Math.sin(this.clock / 90) + 1) / 2;
      this.tankHalo.show(tank.x, tank.y, 30 + 6 * pulse, 0.55 + 0.35 * pulse);
      this.hotText.setVisible(true).setPosition(Math.round(tank.x + 6), Math.round(tank.y - 58 + keycapBob(this.clock) / 2));
    } else {
      this.tankHalo.hide();
      this.hotText.setVisible(false);
    }
    const leaking = this.fighting && this.director.finale;
    if ((hot || leaking) && this.clock > this.wispAt) {
      this.wispAt = this.clock + (leaking ? 90 : 160);
      this.puff(tank.x + 8, tank.y - 30, 2, 10);
    }
  }

  private get multiplier(): number { return Math.min(COMBO_MAX_MULT, 1 + Math.floor(this.combo / COMBO_STEP)); }

  private drawCombo(): void {
    const cam = this.ctx.scene.cameras.main;
    const mult = this.multiplier;
    this.comboText.setVisible(this.fighting && this.combo >= 3).setPosition(cam.width / 2, cam.height - 68)
      .setText(mult > 1 ? `COMBO ${this.combo}  x${mult}` : `COMBO ${this.combo}`);
  }

  /**
   * The first time something asks for a tool: the keycap over the roach, only while pressing then is right (on the
   * canister's lane, on the safe lane under pressure, the dash ready with him in reach or the cloud in reach).
   */
  private drawKeycap(): void {
    const prompt = this.prompt;
    const { player, scene } = this.ctx;
    if (!prompt || !this.fighting || this.clock > prompt.to) {
      if (prompt && this.clock > prompt.to) this.prompt = null;
      this.hideKeycap();
      return;
    }
    const dash = prompt.key.startsWith('dash');
    const near = this.director.pos === NEAR && !this.move;
    const honest = this.clock >= prompt.from
      && (prompt.lane === null || player.currentFloor === prompt.lane)
      && (!dash || (player.dashReady && !player.isDashing))
      && (prompt.key !== 'dash-knock' && prompt.key !== 'dash-shove' || near)
      && (prompt.key !== 'dash-shove' || !this.threats.some(t => !t.gone && !t.passed));
    if (!honest) {
      this.hideKeycap();
      return;
    }
    if (!this.keycap) {
      const touch = !scene.sys.game.device.os.desktop;
      this.keycap = dash
        ? (touch ? addKeycap(scene, 'DASH') : addArrowKeycap(scene, 'right'))
        : addKeycap(scene, touch ? 'STRZAŁ' : 'SPACJA');
    }
    this.keycap.setPosition(Math.round(player.sprite.x), Math.round(player.sprite.y - KEYCAP_ABOVE_PX + keycapBob(scene.time.now)));
  }

  private hideKeycap(): void {
    this.keycap?.destroy();
    this.keycap = null;
  }

  /** The stream roars while one runs and the gas hisses while any cloud or mine lies on a lane. */
  private syncLoops(): void {
    const { audio } = this.ctx;
    const live = this.fighting;
    const streaming = live && this.threats.some(t => t.stream);
    const gassy = live && this.threats.some(t => !t.gone && (t.gas || (t.kind === 'cloud' && t.sprite)));
    if (streaming && !this.streamLoop) this.streamLoop = audio.startLoop('ex-stream', 0.45);
    else if (!streaming && this.streamLoop) {
      audio.stopLoop(this.streamLoop);
      this.streamLoop = null;
    }
    if (gassy && !this.gasLoop) this.gasLoop = audio.startLoop('ex-gas', 0.4);
    else if (!gassy && this.gasLoop) {
      audio.stopLoop(this.gasLoop);
      this.gasLoop = null;
    }
  }

  private laneY(lane: Lane): number { return lane === 'top' ? this.ctx.floorTopY : this.ctx.floorBottomY; }

  /** A sound, never in the way: one that fails to play must not stop the fight. */
  private sfx(key: string, volume: number, rate = 1): void {
    try {
      this.ctx.audio.playSfx(key, volume, rate);
    } catch {
      // play on in silence
    }
  }

  /** Gas squirting out: curls of his green, drifting up and coming apart. */
  private puff(x: number, y: number, count: number, spread: number): void {
    getFx(this.ctx.scene).burst('wisp', x, y, Math.ceil(count / 2), spread / 2, {
      depth: DEPTH.PICKUPS + 2, speed: [10, 40], angle: [240, 300],
    });
  }

  /** A quick line of blocks from one point to another, fading: something sent back, seen. */
  private streak(from: { x: number; y: number }, to: { x: number; y: number }, color: number): void {
    const { scene } = this.ctx;
    const g = scene.add.graphics().setDepth(DEPTH.PICKUPS + 1);
    const steps = Math.max(2, Math.floor(Math.hypot(to.x - from.x, to.y - from.y) / 8));
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const size = Math.round(Phaser.Math.Linear(8, 4, f) / S) * S;
      g.fillStyle(color, 0.5 + 0.4 * (1 - f)).fillRect(
        Math.round(Phaser.Math.Linear(from.x, to.x, f) / S) * S - size / 2,
        Math.round(Phaser.Math.Linear(from.y, to.y, f) / S) * S - size / 2, size, size);
    }
    this.effects.push(g);
    scene.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => {
      this.effects = this.effects.filter(o => o !== g);
      g.destroy();
    } });
  }

  /** Points times the combo's multiplier. */
  private score(points: number): void {
    this.ctx.addScore(points * this.multiplier);
  }

  private popup(text: string, color: string, size = 10): void {
    const { player } = this.ctx;
    this.popupAt(player.x, player.y - 46, text, color, size);
  }

  private popupAt(x: number, y: number, text: string, color: string, size = 10): void {
    const { scene } = this.ctx;
    const label = scene.add.text(x, y, text, popupStyle({ fontSize: `${size}px`, color })).setOrigin(0.5).setDepth(DEPTH.POPUP);
    this.effects.push(label);
    scene.tweens.add({
      targets: label, y: label.y - 24, alpha: { from: 1, to: 0 }, duration: 700, ease: 'Power2',
      onComplete: () => {
        this.effects = this.effects.filter(o => o !== label);
        label.destroy();
      },
    });
  }

  protected teardown(): void {
    const keep = new Set<unknown>(this.culprit ?? []);
    this.clearStageForTeardown(keep);
    if (this.grenade && !keep.has(this.grenade.sprite)) this.grenade.sprite.destroy();
    if (this.chain) {
      if (!keep.has(this.chain.sprite)) this.chain.sprite.destroy();
      this.chain.trail.destroy();
    }
    this.grenade = this.chain = null;
    this.charge = null;
    this.ctx.audio.stopLoop(this.streamLoop);
    this.ctx.audio.stopLoop(this.gasLoop);
    this.streamLoop = this.gasLoop = null;
    for (const b of this.bullets) b.sprite.destroy();
    this.bullets = [];
    for (const f of this.flyers) f.sprite.destroy();
    this.flyers = [];
    this.ownGas?.sprite.destroy();
    this.ownGas = null;
    this.hideKeycap();
    for (const obj of [this.zones.top, this.zones.bottom, this.mineZones.top, this.mineZones.bottom, this.shadow,
      this.tankHalo, this.heldHalo, this.hotText, this.comboText]) obj.destroy();
    for (const obj of this.effects) obj.destroy();
    this.effects = [];
    this.events = [];
    if (this.culprit) this.flashOverDeath(this.culprit);
    const boss = this.boss;
    if (!boss.active) return;
    this.ctx.scene.tweens.add({ targets: boss, alpha: 0, duration: FADE_MS, delay: 300, onComplete: () => boss.destroy() });
  }

  /** Everything still up comes down, but what killed the roach, which flashes on over its death a moment. */
  private clearStageForTeardown(keep: Set<unknown>): void {
    for (const t of this.threats) {
      const objs: { destroy(): void }[] = [];
      if (t.stream) {
        if (t.stream.parts.some(p => keep.has(p))) continue;
        objs.push(t.stream);
      }
      for (const s of [t.sprite, t.gas]) if (s && !keep.has(s)) objs.push(s);
      for (const o of objs) o.destroy();
    }
    this.threats = [];
    for (const c of this.cans) this.dropCan(c);
    this.cans = [];
    this.dropHeld();
  }

  /** The killing hit's culprit blinks over the death, on the wall clock (the scene's may be stopping), then goes. */
  private flashOverDeath(culprit: Phaser.GameObjects.Components.Alpha[]): void {
    const started = Date.now();
    const objs = culprit as unknown as Phaser.GameObjects.GameObject[];
    const tick = window.setInterval(() => {
      const t = Date.now() - started;
      try {
        if (t < CULPRIT_FLASH_MS) {
          this.blink(culprit, t);
          return;
        }
        for (const o of objs) if (o.active && o !== this.boss) o.destroy();
      } catch {
        // a blink lost is nothing
      }
      window.clearInterval(tick);
    }, BLINK_MS / 2);
  }

  // ── For scripted runs ─────────────────────────────────────────────

  /** What is coming, from the set's own numbers, on the fight's clock: a script plays the fight from this. */
  get script(): {
    clock: number; stopped: boolean; phase: number; finale: boolean; hp: number; pos: Pos; dashReady: boolean;
    pressured: boolean; knock: { from: number; to: number; done: boolean } | null;
    threats: {
      kind: HazardKind; lane: Lane; cue: number; at: number; lasts: number; fire: number; until: number; windup: number;
      /** A cloud: where it is along its lane, px from the roach's spot. */
      x: number | null; canShoot: boolean; landed: boolean;
    }[];
    cans: { lane: Lane; release: number; flight: number; glide: number; canShoot: boolean; shot: boolean; landed: boolean }[];
    current: string | null;
  } {
    return {
      clock: this.clock, stopped: this.stopped && this.fighting, phase: this.director.phase, finale: this.director.finale,
      hp: this.director.hp, pos: this.director.pos, dashReady: this.ctx.player.dashReady, pressured: this.pressured(),
      knock: this.knock && { from: this.knock.from, to: this.knock.to, done: this.knock.done },
      threats: this.threats.filter(t => !t.gone && !t.passed).map(t => ({
        kind: t.kind, lane: t.lane, cue: t.cue, at: t.at, lasts: t.lasts, fire: t.fire, until: t.until, windup: t.windup,
        x: t.kind === 'cloud' ? this.cloudX(t) : t.kind === 'mine' ? MINE_AT : null, canShoot: t.can?.canShoot ?? false,
        landed: this.clock >= t.fire,
      })),
      cans: this.cans.map(c => ({ lane: c.lane, release: c.release, flight: c.flight, glide: c.th.glide, canShoot: c.canShoot, shot: c.shot, landed: c.landed })),
      current: this.current ? (this.current.kind === 'walk' ? 'walk' : this.current.attack.kind) : null,
    };
  }
}
