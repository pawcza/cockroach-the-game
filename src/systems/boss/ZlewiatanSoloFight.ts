/**
 * Zlewiatan, Bestia spod Zlewu, in a solo run: the third boss, fought with the hop, the dash and the gun. (A match plays
 * ZlewiatanFight, whose HP the server owns.)
 *
 * Three heads on drain pipes, each with its own part of the bar. Bullets fly along the roach's lane into the first head
 * drawn on it: the pierog on the top lane (the tower block behind it), the carp on the bottom. The block shoves a slab
 * down the top lane (hop, shoot it to pieces, or dash into it and it smashes back into the block); the carp spits
 * fishbones down the bottom lane a beat apart; the pierog lobs cracklings onto the roach's spot (the landing shadow says
 * where) and later sour cream that leaves a puddle. A head that runs out falls off, the others duck into the drain, and
 * it rolls at the roach pass after pass until it is shot down or smashed with a dash; then the heads left rise again,
 * angrier. The last one throws radiators down both lanes at once: only a dash gets through, and sends one back.
 *
 * Nothing that only passes along a lane marks the lane: a throw's warning is on the head (it glows, rears, glints) and
 * on the thing itself; what lands on a spot has its landing shadow; the puddle is shown as what it is, a stretch that
 * hurts. What comes when, and what a hit does, is zlewiatanPatterns (and its tests); this plays it on its own clock.
 */
import Phaser from 'phaser';
import { VOL } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { SPRITE_SCALE } from '../../config/sprites';
import { getFx } from '../../effects/Fx';
import { gunfire } from '../../effects/Gunfire';
import { KillZone } from '../../effects/KillZone';
import { LandingShadow, Spot } from '../../effects/LandingShadow';
import { addArrowKeycap, addKeycap, keycapBob } from '../../ui/Keycap';
import type { BossSegment } from '../../ui/GameHUD';
import { popupStyle } from '../../utils/TextStyles';
import { NEAR_MISS_SCORE } from '../RiskBonus';
import { OBSTACLE_OFFSET } from './bossConfig';
import { BossFight, BossFightContext } from './BossFight';
import { glint, Halo, sparkBurst, Trail } from './bossTelegraph';
import { BossVisuals } from './BossVisuals';
import {
  BULLET_DAMAGE, BULLET_SPEED, DASH_MS, fightRandom, flyX, Hazard, Head, HEAD_HP, HEADS, Lane, LOOSE_HP, LUNGE_REACH,
  lungeOffset, Prompt, promptFor, PromptKey, REF, rollStart, SHOT_MS, SMASH_BACK_MS, SMASH_DAMAGE, SMACK_DAMAGE, Step,
  ZlewiatanDirector,
} from './zlewiatanPatterns';
import { createZlewiatanAnimations, SHOT_LOOK, ZLEWIATAN_TEXTURE, zlewiatanFrame } from './zlewiatanConfig';
import {
  FRONT_TOP, SET_FRONT, SET_HEADS, ZLEWIATAN_ANIMS, ZlewiatanAnim,
} from './zlewiatanFrames';

const VICTORY_BONUS = 600;
const DODGE_SCORE = 10;
/** Times the combo's multiplier: a bullet into a head, something shot down, sent back, a loose head smashed. */
const HIT_SCORE = 5;
const SHOT_DOWN_SCORE = 10;
const PARRY_SCORE = 40;
const SMASH_SCORE = 60;
const FALL_SCORE = 100;
const GONE_SCORE = 150;
const CLOSE_CALL_MS = 250;
/** Every this many hits in a row without being touched, the multiplier goes up one, to the most. */
const COMBO_STEP = 6;
const COMBO_MAX_MULT = 4;

/** The fight holds still on its own big moments (the player's): a thing sent back, a smash, a head off, one gone. */
const FREEZE_PARRY_MS = 110;
const FREEZE_SMASH_MS = 140;
const FREEZE_FALL_MS = 280;
/** The roach is hit: the world holds this long on the impact (a moult's shorter), then the death plays at once, what
 * hit it flashing over it for a moment so the cause reads. */
const DEATH_HOLD_MS = 120;
const MOULT_HOLD_MS = 90;
const CULPRIT_FLASH_MS = 480;
/** A thing sent back reaches its thrower in this long. */
const RETURN_MS = 170;
/** The shot leaves the mouth and settles onto its lane's line in this long; the slab arcs up this high first. */
const SETTLE_MS = 220;
const SLAB_LIFT = 55;
/** A lob's arc over the lane, px. */
const LOB_ARC = 130;
/** A shadow's footprint, px: a crackling, a loose head, the settle of a pass (wider). */
const LOB_SPOT = 44;
const HEAD_SPOT = 64;
const SETTLE_SPOT = 92;
/** The puddle hurts over this stretch round the roach's spot. */
const PUDDLE_HALF = 56;
/** A loose head's middle sits this far above its floor; it bounces this high, lower each leap. */
const LOOSE_HALF = 22 * SPRITE_SCALE;
const BOUNCE = [60, 40, 26, 16];
/** A hit flashes the creature pale this long. */
const FLASH_MS = 70;
/** A spit lets its shot go on this frame, at 12 fps. */
const RELEASE_MS = (2 * 1000) / 12;
/** The duck into the drain and the rise out of it: the rise animation, backwards and forwards. */
const RISE_MS = (ZLEWIATAN_ANIMS['rise-bc'].frames * 1000) / ZLEWIATAN_ANIMS['rise-bc'].fps;
const DEFEAT_HOLD_MS = 1600;
const MAX_STEP_MS = 250;
const SHAKE_MS = 140;
const SHAKE = 0.01;
/** Each shot nudges the roach back a few px, and it eases back in. */
const RECOIL_PX = 4;
const RECOIL_MS = 120;
const KEYCAP_ABOVE_PX = 96;

/** Each head's colour: its glow before it throws, its sparks. */
const HEAD_COLOR: Record<Head, number> = { block: 0xc9c5b8, pierog: 0xffa23c, carp: 0xf6f2e2 };
const HOT = 0xff6a3c;
const LABEL: Record<Head, string> = { block: 'BLOK', pierog: 'PIERÓG', carp: 'KARP' };
/** What flies along a lane: its frames and how it reads in flight (the glint and trail colour, the trail). */
type FlyKind = 'slab' | 'bone' | 'radiator' | 'skwarka' | 'pierogi';
const LOOK: Record<FlyKind, { color: number; trailMs: number; trailSize: number }> = {
  slab: SHOT_LOOK.slab, bone: SHOT_LOOK.bone, radiator: SHOT_LOOK.radiator, skwarka: SHOT_LOOK.skwarka,
  pierogi: { color: 0xffa23c, trailMs: 320, trailSize: 10 },
};
const flyKind = (h: Hazard): FlyKind => (h.kind === 'crackling' ? 'skwarka' : h.kind as FlyKind);
/** A bounced crackling's leaps over its lane, px: each lower than the last, like the curler's. */
const CRACKLING_ARCS = [70, 44, 26];

const SFX = {
  slab: 'zl-slab-launch',
  slabLand: 'zl-slab-impact',
  bone: 'zl-fishbone',
  lob: 'zl-spit',
  splat: 'zl-splat',
  radiator: 'zl-radiator',
  roar: 'zl-roar',
  gurgle: 'zl-gurgle',
  creak: 'zl-creak',
  drain: 'zl-drain-away',
  pop: 'zl-bubble-pop',
  pistol: 'boss-pistol',
  casing: 'shell-casing',
  hit: 'bullet-hit',
  glance: 'bullet-ricochet',
  shotDown: 'shot-down',
  parry: 'przebicie',
  smash: 'vs-slam-2',
  struck: 'vs-slam-1',
  closeCall: 'na-styk',
  defeat: 'boss-defeat',
  victory: 'boss-victory',
};
const BGM = 'boss-bgm';

type Mover = {
  kind: 'mover';
  h: Hazard;
  /** The hazard's times, absolute on the fight's clock. */
  tell: number; cue: number; fire: number; t: number;
  sprite: Phaser.GameObjects.Sprite | null;
  trail: Trail | null;
  mouth: { x: number; y: number };
  taken: number;
  resolved: boolean;
  /** Sent back: from where, when. */
  back: { x: number; y: number; t0: number } | null;
  /** The block alone: this slab's return, if it has one. */
  partner: Mover | null;
  landed: boolean;
  /** A bounced crackling's landings so far. */
  hops: number;
  /** In front of the muzzle when each bullet left: what it may meet. */
  step: number;
};

type Lob = {
  kind: 'lob';
  h: Hazard;
  tell: number; cue: number; fire: number; t: number;
  globs: { sprite: Phaser.GameObjects.Sprite; trail: Trail; land: number; x: number; done: boolean }[];
  mouth: { x: number; y: number };
  resolved: boolean;
  puddle: Phaser.GameObjects.Sprite | null;
  until: number;
  step: number;
};

type Loose = {
  kind: 'loose';
  h: Hazard;
  head: Head;
  tell: number; cue: number; t: number; start: number;
  roll: number;
  /** Landings already thudded. */
  landed: number;
  from: { x: number; y: number };
  resolved: boolean;
  step: number;
};

type Live = Mover | Lob | Loose;

/** What the scripted driver reads: each thing coming, from the fight's numbers, on the fight's clock. */
export interface ZlewiatanThreat {
  kind: string;
  lane: Lane;
  cue: number;
  fire: number;
  t: number;
  lasts: number;
  parry: boolean;
  shootable: boolean;
  loose: boolean;
  /** World x where it is now, if it is on the lane. */
  x: number | null;
}

export class ZlewiatanSoloFight extends BossFight {
  readonly victoryBonus = VICTORY_BONUS;

  private readonly director: ZlewiatanDirector;
  private gen = 0;
  private clock = 0;
  private lastNow: number | null = null;
  private events: { at: number; fn: () => void }[] = [];
  private freezeUntil = 0;
  private stopped = false;

  private body: Phaser.GameObjects.Sprite | null = null;
  private bossX = 0;
  private readonly bossY: number;
  private bodyAnim: { anim: ZlewiatanAnim; start: number; reverse: boolean; then: ZlewiatanAnim | null } =
    { anim: 'idle', start: 0, reverse: false, then: null };
  private flashUntil = -1;
  private visuals: BossVisuals | null;

  private live: Live[] = [];
  private bullets: { sprite: Phaser.GameObjects.Image; lane: Lane; inFront: Set<Live> }[] = [];
  private looseSprite: Phaser.GameObjects.Sprite | null = null;
  /** The loose head knocked back by a smash, flying off: from where, when. */
  private knocked: { x: number; y: number; t0: number } | null = null;
  /** Where the loose head lies between its fall and its first pass. */
  private looseRest: { x: number; y: number } | null = null;
  private readonly halos: Record<Head, Halo>;
  private readonly shadow: LandingShadow;
  private readonly puddleZone: KillZone;
  private gunReadyAt = 0;
  private lunge: { t0: number } | null = null;
  private recoil = 0;
  private combo = 0;
  private comboText: Phaser.GameObjects.Text;
  private countText: Phaser.GameObjects.Text;
  private prompted = new Set<PromptKey>();
  private prompt: { key: PromptKey; from: number; to: number; lane: Lane | null } | null = null;
  private keycap: Phaser.GameObjects.Text | Phaser.GameObjects.Image | null = null;
  private hitStop: { until: number; culprit: Phaser.GameObjects.Components.Alpha[]; deadly: boolean } | null = null;
  /** What killed the roach: it keeps flashing over the death after the fight is taken down. */
  private culprit: Phaser.GameObjects.Sprite[] = [];
  private effects: Phaser.GameObjects.GameObject[] = [];
  /** The world px a ref px is on this screen. */
  private scale = 1;
  private step: Step | null = null;
  private stepStart = 0;
  /** The heads on the body before the last hit: where a head that just fell or died was. */
  private keyBefore = 'bpc';

  constructor(ctx: BossFightContext) {
    super(ctx);
    const { scene, floorTopY, floorBottomY } = ctx;
    createZlewiatanAnimations(scene);
    this.director = new ZlewiatanDirector(fightRandom(ctx.seed, ctx.boss.id));
    this.bossY = (floorTopY + floorBottomY) / 2 - OBSTACLE_OFFSET;
    this.halos = {
      block: new Halo(scene, HEAD_COLOR.block, DEPTH.OBSTACLES + 0.6),
      pierog: new Halo(scene, HEAD_COLOR.pierog, DEPTH.OBSTACLES + 0.6),
      carp: new Halo(scene, HEAD_COLOR.carp, DEPTH.OBSTACLES + 0.6),
    };
    this.shadow = new LandingShadow(scene);
    this.puddleZone = new KillZone(scene);
    this.comboText = scene.add.text(0, 0, '', popupStyle({ fontSize: '12px', color: '#ffd36a' }))
      .setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.HUD).setVisible(false);
    this.countText = scene.add.text(0, 0, '', popupStyle({ fontSize: '16px', color: '#ff8a5a' }))
      .setOrigin(0.5).setDepth(DEPTH.POPUP).setVisible(false);

    // The pistol and the rise out of the drain are the old fight's intro, shared; then this fight takes the creature over
    this.visuals = new BossVisuals(scene, ctx.player, ctx.audio, floorTopY, floorBottomY);
    this.brake(() => {
      this.stopped = true;
      this.visuals!.playIntro(() => this.arrived(), ctx.abilities.canShoot, () => ctx.abilities.grant('gun'));
    });
  }

  get inputLive(): boolean { return super.inputLive && !this.hitStop; }

  private arrived(): void {
    const visuals = this.visuals!;
    this.bossX = visuals.bossX;
    visuals.destroy();
    this.visuals = null;
    this.body = this.ctx.scene.add.sprite(this.bossX, this.bossY, ZLEWIATAN_TEXTURE, zlewiatanFrame('idle'))
      .setScale(SPRITE_SCALE).setDepth(DEPTH.OBSTACLES);
    const carpFront = this.headFrontX('carp', this.flyY('bottom'));
    this.scale = Math.max(0.5, (carpFront - this.holdX) / REF.front.carp);
    this.state = 'fighting';
    this.ctx.audio.switchBGM(BGM);
    this.showBars();
    this.advance();
  }

  // ── The clock ─────────────────────────────────────────────────────

  private atMs(t: number, fn: () => void): void {
    let i = this.events.length;
    while (i > 0 && this.events[i - 1].at > t) i--;
    this.events.splice(i, 0, { at: t, fn });
  }

  /** Part of the step in progress: dropped if a head falls or goes first. */
  private stepAt(t: number, fn: () => void): void {
    const gen = this.gen;
    this.atMs(t, () => { if (gen === this.gen && this.state === 'fighting') fn(); });
  }

  private freeze(ms: number): void {
    this.freezeUntil = Math.max(this.freezeUntil, this.ctx.scene.time.now + ms);
  }

  // ── Steps ─────────────────────────────────────────────────────────

  /** The stage is free: the next thing the director has, aimed at the roach's lane. */
  private advance(): void {
    if (this.state !== 'fighting') return;
    const roachLane = this.ctx.player.currentFloor;
    const step = this.director.next(roachLane);
    const t0 = this.clock;
    this.step = step;
    this.stepStart = t0;
    const prompt = promptFor(step);
    if (prompt && !this.prompted.has(prompt.key)) {
      this.prompted.add(prompt.key);
      this.showPrompt(prompt, t0, step);
    }
    switch (step.kind) {
      case 'rest':
        if (step.index > 0 && this.bodyAnim.anim.startsWith('rise') && this.bodyAnim.reverse) this.rise();
        break;
      case 'fall':
        this.fallStep(step.head!, t0);
        break;
      default:
        for (const h of step.hazards) this.spawn(h, t0, step);
    }
    this.scheduleEnd(t0 + step.ms);
  }

  /** The next step once the stage time is up and nothing of this one is still coming. */
  private scheduleEnd(at: number): void {
    this.stepAt(at, () => {
      if (this.live.some(l => !l.resolved)) this.scheduleEnd(this.clock + 50);
      else this.advance();
    });
  }

  private spawn(h: Hazard, t0: number, step: Step): void {
    const abs = { tell: t0 + h.tell, cue: t0 + h.cue, fire: t0 + h.fire, t: t0 + h.t };
    if (h.loose) {
      const l: Loose = {
        kind: 'loose', h, head: h.head, tell: abs.tell, cue: abs.cue, t: abs.t, start: t0, roll: t0 + rollStart(h), landed: 0,
        from: this.looseRest ?? { x: this.bossX - 40, y: this.ctx.scene.cameras.main.scrollY - 60 }, resolved: false, step: step.index,
      };
      this.looseRest = null;
      this.knocked = null;
      this.live.push(l);
      this.showLoose(true);
      return;
    }
    if (h.kind === 'cream') {
      const lob: Lob = { kind: 'lob', h, ...abs, globs: [], mouth: this.mouth('pierog'), resolved: false, puddle: null, until: 0, step: step.index };
      this.live.push(lob);
      this.telegraph(h.head, abs.tell, abs.fire);
      this.stepAt(abs.fire, () => this.lobNow(lob, t0));
      return;
    }
    const m: Mover = {
      kind: 'mover', h, ...abs, sprite: null, trail: null, mouth: this.mouth(h.head), taken: 0, resolved: false, back: null,
      partner: null, landed: false, hops: 0, step: step.index,
    };
    if (h.returning) {
      // A boomerang coming back pairs with the one that went out in the same step
      const out = this.live.find(l => l.kind === 'mover' && l.step === step.index && l.h.kind === h.kind && !l.h.returning) as Mover | undefined;
      if (out) out.partner = m;
      this.live.push(m);
      return;
    }
    this.live.push(m);
    // The two radiators of a pair leave one mouth together: one wind-up
    const twin = h.kind === 'radiator' && h.lane === 'bottom';
    if (!twin) this.telegraph(h.head, abs.tell, abs.fire);
    this.stepAt(abs.fire, () => this.fireMover(m));
    if (h.kind === 'radiator' && !twin) this.radiatorCount(step, abs);
    if (h.count) this.runCount(h, abs.tell, step);
  }

  /** A counted run: each throw's number over the head as it winds up, 1 to 5. */
  private runCount(h: Hazard, tell: number, step: Step): void {
    this.stepAt(tell, () => {
      const at = this.headPoint(h.head);
      this.countText.setText(`${h.count}`).setPosition(Math.round(at.x), Math.round(at.y - 64)).setVisible(true);
      this.ctx.audio.playSfx(SFX.creak, 0.3 + 0.1 * (h.count ?? 1));
    });
    if (h.count === step.count) this.stepAt(this.stepStart + h.fire + 300, () => this.countText.setVisible(false));
  }

  /**
   * The head's tell: it glows from its wind-up, brighter until it lets go, a glint as it starts; the spit is timed so
   * its release frame comes as the thing leaves.
   */
  private telegraph(head: Head, tell: number, fire: number): void {
    this.stepAt(tell, () => {
      const at = this.mouth(head);
      glint(this.ctx.scene, at.x, at.y, HEAD_COLOR[head], 18, 280);
      this.ctx.audio.playSfx(SFX.creak, 0.35);
    });
    this.stepAt(Math.max(tell, fire - RELEASE_MS), () => this.playBody(this.spitAnim(head), this.clock, false, this.idleAnim()));
  }

  /** Radiators: the count over the head, going down as each pair leaves. */
  private radiatorCount(step: Step, abs: { tell: number; fire: number }): void {
    const pairs = step.hazards.filter(h => h.kind === 'radiator' && h.lane === 'top');
    const index = pairs.findIndex(h => this.stepStart + h.fire === abs.fire);
    const left = pairs.length - index;
    this.stepAt(abs.tell, () => {
      const at = this.headPoint(step.head ?? this.director.bodyHeads[0]);
      this.countText.setText(`${left}`).setPosition(Math.round(at.x), Math.round(at.y - 70)).setVisible(true);
      this.ctx.audio.playSfx(SFX.roar, index === 0 ? VOL.big : 0.35);
      if (index === 0) this.ctx.scene.cameras.main.shake(300, 0.008);
    });
    this.stepAt(abs.fire, () => { if (left === 1) this.countText.setVisible(false); });
  }

  private fireMover(m: Mover): void {
    const { scene, audio } = this.ctx;
    const kind = flyKind(m.h);
    m.mouth = this.mouth(m.h.head);
    const look = LOOK[kind];
    m.sprite = scene.add.sprite(m.mouth.x, m.mouth.y, ZLEWIATAN_TEXTURE, zlewiatanFrame(kind)).setScale(SPRITE_SCALE)
      .setDepth(DEPTH.PICKUPS + 1);
    m.trail = new Trail(scene, look.color, look.trailMs, look.trailSize, DEPTH.PICKUPS);
    glint(scene, m.mouth.x, m.mouth.y, kind === 'radiator' ? HOT : look.color, 22, 300);
    sparkBurst(scene, m.mouth.x, m.mouth.y, kind === 'radiator' ? HOT : look.color, 10, -1, 44);
    audio.playSfx(kind === 'slab' ? SFX.slab : kind === 'bone' ? SFX.bone : kind === 'radiator' ? SFX.radiator : SFX.lob,
      kind === 'bone' ? VOL.pickup : VOL.boss);
  }

  private lobNow(lob: Lob, t0: number): void {
    const { scene, audio } = this.ctx;
    lob.mouth = this.mouth('pierog');
    const lands = lob.h.landings ?? [{ at: lob.h.t, lane: lob.h.lane, x: 0 }];
    const frame: ZlewiatanAnim = lob.h.kind === 'cream' ? 'smietana' : 'skwarka';
    for (const l of lands) {
      const sprite = scene.add.sprite(lob.mouth.x, lob.mouth.y, ZLEWIATAN_TEXTURE, zlewiatanFrame(frame)).setScale(SPRITE_SCALE)
        .setDepth(DEPTH.PICKUPS + 1);
      const look = SHOT_LOOK[lob.h.kind === 'cream' ? 'smietana' : 'skwarka'];
      lob.globs.push({ sprite, trail: new Trail(scene, look.color, look.trailMs, look.trailSize, DEPTH.PICKUPS), land: t0 + l.at, x: this.worldX(l.x), done: false });
    }
    glint(scene, lob.mouth.x, lob.mouth.y, HEAD_COLOR.pierog, 22, 300);
    sparkBurst(scene, lob.mouth.x, lob.mouth.y, HEAD_COLOR.pierog, 8, -1, 40);
    audio.playSfx(SFX.lob, VOL.boss * 0.8);
  }

  // ── Every frame ───────────────────────────────────────────────────

  private get over(): boolean { return this.state === 'done'; }

  update(): void {
    if (this.over) return;
    if (this.holdHitStop()) return;
    const now = this.ctx.scene.time.now;
    const dt = this.lastNow === null ? 0 : Math.min(MAX_STEP_MS, Math.max(0, now - this.lastNow));
    this.lastNow = now;
    if (!this.stopped) return;
    if (now < this.freezeUntil) {
      this.ctx.player.adjustTimersForPause(dt);
      return;
    }
    if (this.state === 'intro') {
      this.visuals?.updateGodray();
      this.holdPlayer();
      return;
    }
    this.clock += dt;
    while (this.events.length && this.events[0].at <= this.clock && !this.over && !this.hitStop) this.events.shift()!.fn();
    if (this.over || this.hitStop) return;
    if (this.state === 'fighting') this.ctx.player.updateDash();
    this.recoil = Math.max(0, this.recoil - (RECOIL_PX * dt) / RECOIL_MS);
    const forward = this.updateLunge();
    this.holdPlayer(Math.round(this.recoil) - forward);
    this.updateBullets(dt);
    if (this.over || this.hitStop) return;
    for (const l of this.live.slice()) {
      if (l.kind === 'mover') this.updateMover(l);
      else if (l.kind === 'lob') this.updateLob(l);
      else this.updateLoose(l);
      if (this.over || this.hitStop) return;
    }
    this.live = this.live.filter(l => !(l.resolved && this.finished(l)));
    this.drawBody();
    this.drawHalos();
    this.drawShadows();
    this.drawLooseIdle();
    this.drawHud();
  }

  /** Done with, sprites and all. */
  private finished(l: Live): boolean {
    if (l.kind === 'mover') return l.sprite === null && !l.back;
    if (l.kind === 'lob') return l.globs.every(g => g.done) && (l.puddle === null || this.clock > l.until);
    // A loose head that went past rolls on off the screen
    return !this.looseSprite || !this.looseSprite.visible || this.looseSprite.x < this.ctx.scene.cameras.main.scrollX - 60;
  }

  // ── Things flying along a lane ────────────────────────────────────

  /** Where it is along the lane, world x, on the fight's numbers: the same as the patterns say, on this screen. */
  private moverX(m: Mover): number {
    if (m.h.bounce) return this.holdX + flyX(m.h.from, this.stepStartOf(m) + rollStart(m.h), m.t, this.clock) * this.scale;
    return this.holdX + flyX(m.h.from, m.fire, m.t, this.clock) * this.scale;
  }

  /** When the step a hazard belongs to started: its times are from there. */
  private stepStartOf(m: Mover): number { return m.t - m.h.t; }

  /** A bounced crackling before it settles: leaping from the mouth to each landing on a steady beat, each leap lower. */
  private bouncePos(m: Mover): { x: number; y: number; rolling: boolean } {
    const t0 = this.stepStartOf(m);
    const lands = m.h.landings!;
    const at = (i: number) => t0 + lands[i].at;
    const fy = (i: number) => this.flyY(lands[i].lane) + 8;
    if (this.clock >= at(lands.length - 1)) return { x: this.moverX(m), y: this.flyY(m.h.lane) + 8, rolling: true };
    let i = 0;
    while (i < lands.length && this.clock >= at(i)) i++;
    const a = i === 0 ? m.mouth : { x: this.worldX(lands[i - 1].x), y: fy(i - 1) };
    const from = i === 0 ? m.fire : at(i - 1);
    const u = Phaser.Math.Clamp((this.clock - from) / Math.max(1, at(i) - from), 0, 1);
    return {
      x: Phaser.Math.Linear(a.x, this.worldX(lands[i].x), u),
      y: Phaser.Math.Linear(a.y, fy(i), u) - Math.sin(u * Math.PI) * CRACKLING_ARCS[Math.min(i, CRACKLING_ARCS.length - 1)],
      rolling: false,
    };
  }

  private updateMover(m: Mover): void {
    if (m.back) {
      this.flyBack(m);
      return;
    }
    if (m.h.returning) {
      this.updateReturn(m);
      return;
    }
    if (!m.sprite) return;
    const lane = m.h.lane;
    const age = this.clock - m.fire;
    const k = Math.min(1, age / SETTLE_MS);
    let x = this.moverX(m);
    if (m.h.bounce) {
      const pos = this.bouncePos(m);
      m.sprite.setPosition(Math.round(pos.x), Math.round(pos.y));
      // Each landing clicks and sparks; the settle lands harder
      const lands = m.h.landings!;
      while (m.hops < lands.length && this.clock >= this.stepStartOf(m) + lands[m.hops].at) {
        const land = lands[m.hops++];
        const settled = m.hops === lands.length;
        sparkBurst(this.ctx.scene, this.worldX(land.x), this.floorY(land.lane) - 2, HEAD_COLOR.pierog, settled ? 10 : 6, -1, settled ? 40 : 26);
        this.ctx.audio.playSfx(SFX.splat, settled ? VOL.boss * 0.8 : VOL.boss * 0.4);
        if (settled) glint(this.ctx.scene, this.worldX(land.x), this.flyY(land.lane), HEAD_COLOR.pierog, 30, 340);
      }
      if (!pos.rolling) x = Infinity;
    } else {
      const e = 1 - (1 - k) * (1 - k);
      const y = Phaser.Math.Linear(m.mouth.y, this.flyY(lane), e) - (m.h.kind === 'slab' ? Math.sin(k * Math.PI) * SLAB_LIFT : 0);
      m.sprite.setPosition(Math.round(Phaser.Math.Linear(m.mouth.x, x, e)), Math.round(y));
    }
    const kind = flyKind(m.h) as ZlewiatanAnim;
    const spec = ZLEWIATAN_ANIMS[kind];
    m.sprite.setFrame(zlewiatanFrame(kind, Math.floor((age * spec.fps) / 1000) % spec.frames));
    m.trail?.push(m.sprite.x, m.sprite.y);
    if (m.h.kind === 'slab' && !m.landed && k >= 1) {
      m.landed = true;
      this.ctx.audio.playSfx(SFX.slabLand, VOL.big * 0.7);
    }
    if (!m.resolved) {
      const reach = this.ctx.player.isDashing && this.lunge ? lungeOffset(this.clock - this.lunge.t0, LUNGE_REACH * this.scale) : 0;
      if (x - this.holdX <= reach) {
        m.resolved = true;
        this.reachRoach(m);
        if (this.over || this.hitStop || m.back) return;
      }
    }
    if (m.sprite && m.sprite.x < this.ctx.scene.cameras.main.scrollX - 60) this.endMover(m);
  }

  /** It got to the roach: past it on the other lane, through a dash, sent back by one, or a hit. */
  private reachRoach(m: Mover): void {
    const { player } = this.ctx;
    if (!this.onLane(m.h.lane)) {
      this.dodged(m.h.lane);
      return;
    }
    if (!player.isDashing) {
      this.struck(m.sprite ? [m.sprite] : []);
      return;
    }
    if (m.h.parry > 0) this.sendBack(m);
  }

  private sendBack(m: Mover): void {
    const { scene, audio } = this.ctx;
    m.trail?.destroy();
    m.trail = new Trail(scene, 0x7fe0ff, 220, 12, DEPTH.PICKUPS);
    m.back = { x: m.sprite?.x ?? this.holdX, y: m.sprite?.y ?? this.flyY(m.h.lane), t0: this.clock };
    if (m.partner) this.dropMover(m.partner);
    glint(scene, m.back.x, m.back.y - 10, 0x7fe0ff, 26, 260);
    audio.playSfx(SFX.parry, 0.7);
  }

  private flyBack(m: Mover): void {
    const back = m.back!;
    const k = Math.min(1, (this.clock - back.t0) / RETURN_MS);
    const to = this.headPoint(m.h.head);
    m.sprite?.setPosition(Math.round(Phaser.Math.Linear(back.x, to.x, k)), Math.round(Phaser.Math.Linear(back.y, to.y, k)));
    if (m.sprite) m.trail?.push(m.sprite.x, m.sprite.y);
    if (k < 1) return;
    m.back = null;
    this.burst(to.x, to.y, HOT, true);
    this.endMover(m);
    this.damage(m.h.head, m.h.parry, 'parry');
  }

  /** A boomerang (a pieróg, the lone block's slab) comes back from the left along the other lane, and into its face. */
  private updateReturn(m: Mover): void {
    if (m.resolved && !m.sprite) return;
    const cam = this.ctx.scene.cameras.main;
    const head = m.h.head;
    const kind = flyKind(m.h) as 'slab' | 'pierogi';
    const blockX = this.headPoint(head).x;
    const smackAt = m.t + (m.h.smackAt ?? 0);
    const speed = (blockX - this.holdX) / Math.max(1, smackAt - m.t);
    const x = this.holdX + (this.clock - m.t) * speed;
    if (x < cam.scrollX - 60) return;
    if (!m.sprite) {
      m.sprite = this.ctx.scene.add.sprite(x, this.flyY(m.h.lane), ZLEWIATAN_TEXTURE, zlewiatanFrame(kind)).setScale(SPRITE_SCALE)
        .setDepth(DEPTH.PICKUPS + 1);
      m.trail = new Trail(this.ctx.scene, LOOK[kind].color, LOOK[kind].trailMs, LOOK[kind].trailSize, DEPTH.PICKUPS);
      this.ctx.audio.playSfx(SFX.slabLand, 0.4);
    }
    const spec = ZLEWIATAN_ANIMS[kind];
    m.sprite.setPosition(Math.round(x), this.flyY(m.h.lane))
      .setFrame(zlewiatanFrame(kind, (spec.frames - 1) - (Math.floor((this.clock * spec.fps) / 1000) % spec.frames)));
    m.trail?.push(m.sprite.x, m.sprite.y);
    if (!m.resolved && this.clock >= m.t) {
      m.resolved = true;
      if (this.onLane(m.h.lane) && !this.ctx.player.isDashing) {
        this.struck([m.sprite]);
        return;
      }
      this.dodged(m.h.lane);
    }
    if (this.clock >= smackAt) {
      const at = this.headPoint(head);
      this.endMover(m);
      if (!this.director.onBody(head) || this.director.ducked) return;
      this.burst(at.x, at.y, HOT, true);
      this.ctx.audio.playSfx(SFX.smash, 0.8);
      this.popupAt(at.x, at.y - 46, 'AUĆ!', '#ffb070', 14);
      this.damage(head, SMACK_DAMAGE, 'smack');
    }
  }

  private endMover(m: Mover): void {
    m.sprite?.destroy();
    m.trail?.destroy();
    m.sprite = null;
    m.trail = null;
    m.resolved = true;
  }

  /** A slab broken or sent back never comes back. */
  private dropMover(m: Mover): void {
    this.endMover(m);
  }

  // ── Lobs ──────────────────────────────────────────────────────────

  private updateLob(lob: Lob): void {
    const lane = lob.h.lane;
    for (const g of lob.globs) {
      if (g.done) continue;
      const k = Phaser.Math.Clamp((this.clock - lob.fire) / Math.max(1, g.land - lob.fire), 0, 1);
      const floor = this.floorY(lane);
      g.sprite.setPosition(Math.round(Phaser.Math.Linear(lob.mouth.x, g.x, k)),
        Math.round(Phaser.Math.Linear(lob.mouth.y, floor - 8, k) - Math.sin(k * Math.PI) * LOB_ARC));
      const spec = ZLEWIATAN_ANIMS[lob.h.kind === 'cream' ? 'smietana' : 'skwarka'];
      g.sprite.setFrame(zlewiatanFrame(lob.h.kind === 'cream' ? 'smietana' : 'skwarka', Math.floor((this.clock * spec.fps) / 1000) % spec.frames));
      g.trail.push(g.sprite.x, g.sprite.y);
      if (k >= 1) this.land(lob, g);
    }
    if (lob.h.kind === 'cream' && lob.puddle && !lob.resolved) {
      // The puddle hurts the whole time it lies there
      if (this.clock > lob.until) {
        lob.resolved = true;
        this.puddleZone.hide();
        const p = lob.puddle;
        this.ctx.scene.tweens.add({ targets: p, alpha: 0, duration: 200, onComplete: () => p.destroy() });
        return;
      }
      this.puddleZone.show(this.floorY(lane), this.holdX - PUDDLE_HALF, this.holdX + PUDDLE_HALF, 'kill');
      if (this.onLane(lane) && !this.ctx.player.isDashing && !this.ctx.player.isHopping) this.struck([lob.puddle]);
    } else if (lob.h.kind === 'crackling' && !lob.resolved && this.clock >= lob.t) {
      if (this.onLane(lane) && !this.ctx.player.isDashing) {
        this.struck(lob.puddle ? [lob.puddle] : []);
        return;
      }
      if (this.clock >= lob.t + lob.h.lasts) {
        lob.resolved = true;
        lob.puddle?.destroy();
        lob.puddle = null;
        this.dodged(lane);
      }
    }
  }

  private land(lob: Lob, g: Lob['globs'][number]): void {
    const { scene, audio } = this.ctx;
    g.done = true;
    g.sprite.destroy();
    g.trail.destroy();
    const floor = this.floorY(lob.h.lane);
    const atRoach = Math.abs(g.x - this.holdX) < 4;
    if (lob.h.kind === 'cream') {
      lob.puddle = scene.add.sprite(g.x, floor, ZLEWIATAN_TEXTURE, zlewiatanFrame('puddle')).setScale(SPRITE_SCALE).setDepth(DEPTH.OBSTACLES);
      lob.puddle.play({ key: 'zlewiatan-puddle' });
      lob.until = lob.t + lob.h.lasts;
      audio.playSfx(SFX.splat, VOL.boss);
      return;
    }
    getFx(scene).play('dust-land', g.x, floor, { depth: DEPTH.PICKUPS + 1 });
    sparkBurst(scene, g.x, floor - 6, HEAD_COLOR.pierog, atRoach ? 12 : 6, -1, atRoach ? 44 : 28);
    if (atRoach) {
      // It bursts on the spot for its moment
      lob.puddle = scene.add.sprite(g.x, floor - 10, ZLEWIATAN_TEXTURE, zlewiatanFrame('skwarka')).setScale(SPRITE_SCALE).setDepth(DEPTH.PICKUPS + 1);
      lob.until = lob.t + lob.h.lasts;
    }
    audio.playSfx(SFX.splat, atRoach ? VOL.boss * 0.8 : VOL.boss * 0.4);
  }

  // ── The loose head ────────────────────────────────────────────────

  private looseAnim(head: Head): ZlewiatanAnim {
    return head === 'block' ? 'roll-block' : head === 'pierog' ? 'roll-pierog' : 'flop-carp';
  }

  private showLoose(on: boolean): void {
    const loose = this.director.loose;
    if (!on || !loose) {
      this.looseSprite?.setVisible(false);
      return;
    }
    if (!this.looseSprite) {
      this.looseSprite = this.ctx.scene.add.sprite(0, 0, ZLEWIATAN_TEXTURE, zlewiatanFrame(this.looseAnim(loose.head)))
        .setScale(SPRITE_SCALE).setDepth(DEPTH.PICKUPS + 1);
    }
    this.looseSprite.setVisible(true);
  }

  /** Where the loose head is on its pass now, and on which lane it is rolling (null in the air). */
  private loosePos(l: Loose): { x: number; y: number; rolling: Lane | null } {
    const lands = l.h.landings!;
    const lx = (i: number) => this.worldX(lands[i].x);
    const ly = (i: number) => this.floorY(lands[i].lane) - LOOSE_HALF;
    const at = (i: number) => l.start + lands[i].at;
    if (this.clock >= l.roll) {
      const x = this.holdX + flyX(l.h.from, l.roll, l.t, this.clock) * this.scale;
      return { x, y: this.floorY(l.h.lane) - LOOSE_HALF, rolling: l.h.lane };
    }
    let i = 0;
    while (i < lands.length && this.clock >= at(i)) i++;
    const a = i === 0 ? l.from : { x: lx(i - 1), y: ly(i - 1) };
    const t0 = i === 0 ? l.start : at(i - 1);
    const u = Phaser.Math.Clamp((this.clock - t0) / Math.max(1, at(i) - t0), 0, 1);
    const arc = i === 0 ? 80 : BOUNCE[Math.min(BOUNCE.length - 1, i - 1)];
    return {
      x: Phaser.Math.Linear(a.x, lx(i), u),
      y: Phaser.Math.Linear(a.y, ly(i), u) - Math.sin(u * Math.PI) * arc,
      rolling: null,
    };
  }

  private updateLoose(l: Loose): void {
    const sprite = this.looseSprite;
    if (!sprite) return;
    const anim = this.looseAnim(l.head);
    const spec = ZLEWIATAN_ANIMS[anim];
    const pos = this.loosePos(l);
    sprite.setVisible(true).setPosition(Math.round(pos.x), Math.round(pos.y))
      .setFrame(zlewiatanFrame(anim, Math.floor((this.clock * spec.fps) / 1000) % spec.frames));
    // Each landing thuds, sparks, and shows where the next comes down
    const lands = l.h.landings!;
    while (l.landed < lands.length && this.clock >= l.start + lands[l.landed].at) {
      const land = lands[l.landed++];
      getFx(this.ctx.scene).play('dust-land', this.worldX(land.x), this.floorY(land.lane), { depth: DEPTH.PICKUPS + 1 });
      this.ctx.audio.playSfx(SFX.slabLand, 0.35);
    }
    if (l.resolved) return;
    if (pos.rolling !== null) {
      const reach = this.ctx.player.isDashing && this.lunge ? lungeOffset(this.clock - this.lunge.t0, LUNGE_REACH * this.scale) : 0;
      if (pos.x - this.holdX <= reach) {
        if (this.onLane(l.h.lane)) {
          if (this.ctx.player.isDashing) {
            this.smash(l, pos);
            return;
          }
          l.resolved = true;
          this.struck([sprite]);
          return;
        }
        l.resolved = true;
        this.dodged(l.h.lane);
      }
    }
  }

  /** Between passes the loose head is off the screen; after the fall it lies on the floor in front of the drain. */
  private drawLooseIdle(): void {
    const sprite = this.looseSprite;
    if (!sprite) return;
    if (this.knocked) {
      const k = Math.min(1, (this.clock - this.knocked.t0) / 500);
      sprite.setPosition(Math.round(this.knocked.x + k * 380), Math.round(this.knocked.y - Math.sin(k * Math.PI * 0.6) * 220 - k * 120));
      if (k >= 1) { this.knocked = null; sprite.setVisible(false); }
      return;
    }
    if (this.live.some(l => l.kind === 'loose')) {
      if (sprite.x < this.ctx.scene.cameras.main.scrollX - 60) sprite.setVisible(false);
      return;
    }
    if (this.looseRest) sprite.setVisible(true).setPosition(Math.round(this.looseRest.x), Math.round(this.looseRest.y));
  }

  private smash(l: Loose, pos: { x: number; y: number }): void {
    const { scene, audio } = this.ctx;
    l.resolved = true;
    audio.playSfx(SFX.smash, 0.9);
    scene.cameras.main.shake(SHAKE_MS * 1.5, SHAKE * 1.6);
    glint(scene, pos.x, pos.y, 0x7fe0ff, 34, 300);
    this.freeze(FREEZE_SMASH_MS);
    this.popupAt(pos.x, pos.y - 40, `ROZBITA! -${SMASH_DAMAGE}`, '#7fe0ff', 14);
    const destroyed = this.damage('loose', SMASH_DAMAGE, 'smash', pos);
    if (destroyed || this.over) return;
    // Knocked back: up and away over the drain; the next pass after it lands back
    this.knocked = { x: pos.x, y: pos.y, t0: this.clock };
    this.live = this.live.filter(x => x !== l);
    this.gen++;
    this.scheduleEnd(this.clock + SMASH_BACK_MS);
  }

  // ── A head falls off, a loose head goes ───────────────────────────

  /** The head pops off in a puff; the others duck into the drain; it drops to the floor in front and lies there. */
  private fallStep(head: Head, t0: number): void {
    const { scene, audio } = this.ctx;
    const from = this.headPoint(head);
    const restX = this.bossX - 170;
    const restY = this.floorY('bottom') - LOOSE_HALF;
    this.showLoose(true);
    const sprite = this.looseSprite!;
    sprite.setFrame(zlewiatanFrame(this.looseAnim(head))).setPosition(from.x, from.y).setVisible(true);
    this.looseRest = null;
    getFx(scene).burst('smoke', from.x, from.y, 6, 26, { depth: DEPTH.PICKUPS + 2, speed: [30, 90], life: 700 });
    this.explosion(from.x, from.y);
    audio.playSfx(SFX.pop, VOL.boss);
    audio.playSfx(SFX.roar, VOL.big * 0.7);
    // The heads left duck
    if (this.director.bodyHeads.length) this.playBody(this.riseAnim(), this.clock, true, null);
    else this.playBody('drain', this.clock, false, null);
    const fall = 700;
    const tick = () => {
      const k = Math.min(1, (this.clock - t0) / fall);
      sprite.setPosition(Math.round(Phaser.Math.Linear(from.x, restX, k)), Math.round(Phaser.Math.Linear(from.y, restY, k) - Math.sin(k * Math.PI) * 90));
      if (k < 1) this.stepAt(this.clock + 16, tick);
      else {
        this.looseRest = { x: restX, y: restY };
        getFx(scene).play('dust-land', restX, this.floorY('bottom'), { depth: DEPTH.PICKUPS + 1 });
        audio.playSfx(SFX.slabLand, 0.6);
        scene.cameras.main.shake(SHAKE_MS, SHAKE);
      }
    };
    tick();
  }

  /** The heads left surge back up out of the drain. */
  private rise(): void {
    if (!this.director.bodyHeads.length) return;
    this.playBody(this.riseAnim(), this.clock, false, this.idleAnim());
    this.ctx.audio.playSfx(SFX.gurgle, VOL.boss);
    this.ctx.audio.playSfx(SFX.roar, VOL.big * 0.6);
  }

  // ── Damage ────────────────────────────────────────────────────────

  /** A hit lands: the bar, the popup, the combo. Returns whether a loose head went for good. */
  private damage(target: Head | 'loose', amount: number, source: 'bullet' | 'parry' | 'smash' | 'smack',
                 at?: { x: number; y: number }): boolean {
    if (this.state !== 'fighting') return false;
    this.keyBefore = this.setKey || this.keyBefore;
    const looseHead = this.director.loose?.head ?? null;
    const r = this.director.hit(target, amount);
    if (r.dealt <= 0) return false;
    const { scene, audio } = this.ctx;
    this.combo++;
    const point = at ?? (target === 'loose' ? { x: this.holdX, y: this.flyY('bottom') } : this.headPoint(target));
    if (source === 'parry') {
      this.popupAt(point.x, point.y - 40, `ODBITY! -${r.dealt}`, '#7fe0ff', 16);
      this.score(PARRY_SCORE);
      audio.playSfx(`boss-hurt-${Phaser.Math.Between(1, 6)}`, 0.6);
      scene.cameras.main.shake(SHAKE_MS, SHAKE);
      this.freeze(FREEZE_PARRY_MS);
      this.flashBody();
    } else if (source === 'smash') {
      this.score(SMASH_SCORE);
    } else if (source === 'smack') {
      this.score(PARRY_SCORE);
      this.flashBody();
    } else {
      this.popupAt(point.x + Phaser.Math.Between(-8, 8), point.y - 30, `-${r.dealt}`, '#ffb070', 10);
      this.score(HIT_SCORE);
    }
    this.showBars();
    if (r.fell) this.fell(r.fell, r.cranked ?? []);
    if (r.destroyed) {
      this.gone(r.destroyed ?? looseHead!, point, r.won);
      return true;
    }
    return false;
  }

  private fell(head: Head, cranked: Head[]): void {
    const { scene, audio } = this.ctx;
    const at = this.headPoint(head);
    this.freeze(FREEZE_FALL_MS);
    scene.cameras.main.shake(SHAKE_MS * 3, SHAKE * 2.5);
    audio.playSfx(SFX.smash, 0.9);
    sparkBurst(scene, at.x, at.y, HEAD_COLOR[head], 16, -1, 80);
    this.popupAt(at.x, at.y - 60, `${LABEL[head]} ODPADA!`, '#ff9a3c', 16);
    this.score(FALL_SCORE);
    for (const c of cranked) {
      const p = this.headPoint(c);
      glint(scene, p.x, p.y, HOT, 30, 360);
      this.popupAt(p.x, p.y - 40, 'WŚCIEKŁY!', '#ff6a3c', 12);
    }
    // A loose head already rolling keeps the stage: this one waits for its turn
    if (this.director.loose && this.director.loose.head !== head) return;
    this.gen++;
    this.clearHazards();
    this.scheduleEnd(this.clock + 50);
  }

  private gone(head: Head, at: { x: number; y: number }, won: boolean): void {
    const { scene, audio } = this.ctx;
    this.gen++;
    this.clearHazards();
    this.freeze(FREEZE_FALL_MS);
    this.explosion(at.x, at.y);
    getFx(scene).burst('smoke', at.x, at.y, 6, 24, { depth: DEPTH.PICKUPS + 2, speed: [30, 90], life: 800 });
    sparkBurst(scene, at.x, at.y, HEAD_COLOR[head], 18, 1, 80);
    scene.cameras.main.shake(SHAKE_MS * 3, SHAKE * 2.5);
    audio.playSfx(SFX.shotDown, VOL.big);
    this.popupAt(at.x, at.y - 50, 'PO GŁOWIE!', '#ff9a3c', 18);
    this.score(GONE_SCORE);
    this.looseSprite?.destroy();
    this.looseSprite = null;
    this.knocked = null;
    if (won) {
      this.defeat(head);
      return;
    }
    this.scheduleEnd(this.clock + 50);
  }

  /**
   * The last head knocked off its last health: the creature dies with it, its death played out (the shriek, the neck
   * giving out, the joints bursting, sucked down the drain spinning, bubbles and a pop), bursts round it as the old
   * fight's victory had, then the bonus and the run.
   */
  private defeat(head: Head): void {
    const { scene, audio, player } = this.ctx;
    this.state = 'victory';
    const anim = `defeat-${head[0]}` as ZlewiatanAnim;
    this.playBody(anim, this.clock, false, null);
    audio.playSfx(SFX.defeat, VOL.big);
    scene.cameras.main.shake(500, 0.04);
    const at = this.headPoint(head);
    for (let i = 0; i < 5; i++) {
      this.atMs(this.clock + i * 120, () => this.explosion(at.x + Phaser.Math.Between(-60, 60), at.y + Phaser.Math.Between(-60, 60)));
    }
    this.atMs(this.clock + 400, () => audio.playSfx(SFX.drain, VOL.boss));
    const spec = ZLEWIATAN_ANIMS[anim];
    const death = (spec.frames * 1000) / spec.fps;
    this.atMs(this.clock + death, () => {
      audio.playSfx(SFX.victory, VOL.stinger);
      player.celebrate();
      const cam = scene.cameras.main;
      const text = scene.add.text(cam.width / 2, cam.height / 2, `+${VICTORY_BONUS}`, popupStyle({ fontSize: '32px', color: '#ffff00', strokeThickness: 6 }))
        .setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.POPUP);
      this.effects.push(text);
      scene.tweens.add({ targets: text, y: text.y - 60, alpha: { from: 1, to: 0 }, duration: 1500, ease: 'Power2' });
    });
    this.atMs(this.clock + death + DEFEAT_HOLD_MS, () => {
      const body = this.body;
      if (body) scene.tweens.add({ targets: body, alpha: 0, duration: 300 });
      this.atMs(this.clock + 320, () => this.win());
    });
  }

  private clearHazards(): void {
    for (const l of this.live) {
      if (l.kind === 'mover') {
        if (l.back) continue;
        if (l.sprite) this.puff(l.sprite.x, l.sprite.y);
        this.endMover(l);
      } else if (l.kind === 'lob') {
        for (const g of l.globs) { if (!g.done) { g.sprite.destroy(); g.trail.destroy(); g.done = true; } }
        l.puddle?.destroy();
        l.puddle = null;
        l.resolved = true;
      } else l.resolved = true;
    }
    this.live = this.live.filter(l => l.kind === 'mover' && l.back);
    this.puddleZone.hide();
    this.shadow.hide();
    for (const h of HEADS) this.halos[h].hide();
    this.countText.setVisible(false);
    this.prompt = null;
    this.hideKeycap();
  }

  // ── The roach is hit ──────────────────────────────────────────────

  private struck(culprit: Phaser.GameObjects.Sprite[]): void {
    const { player, scene, audio } = this.ctx;
    if (player.inMoultGrace) return;
    const moulted = this.ctx.survivesHit();
    this.combo = 0;
    audio.playSfx(SFX.struck, 0.8);
    scene.cameras.main.shake(SHAKE_MS * 2, SHAKE * 2);
    this.hideKeycap();
    this.hitStop = { until: scene.time.now + (moulted ? MOULT_HOLD_MS : DEATH_HOLD_MS), culprit, deadly: !moulted };
    if (!moulted) this.culprit = culprit;
  }

  /** Runs the hit's hold out: true while it holds the fight. */
  private holdHitStop(): boolean {
    const stop = this.hitStop;
    if (!stop) return false;
    const now = this.ctx.scene.time.now;
    const on = Math.floor(now / 60) % 2 === 0;
    for (const c of stop.culprit) c.setAlpha(on ? 1 : 0.15);
    if (now < stop.until) return true;
    for (const c of stop.culprit) c.setAlpha(1);
    this.hitStop = null;
    if (stop.deadly) {
      this.lose('boss');
      return true;
    }
    this.lastNow = now;
    return false;
  }

  // ── The player's tools ────────────────────────────────────────────

  shoot(): void {
    if (this.state !== 'fighting' || this.hitStop) return;
    const { scene, player, audio } = this.ctx;
    if (this.clock < this.gunReadyAt) return;
    this.gunReadyAt = this.clock + SHOT_MS;
    const muzzle = player.shoot();
    gunfire(scene, muzzle, player.sprite.depth);
    this.recoil = RECOIL_PX;
    audio.playSfx(SFX.pistol, VOL.gameplay);
    this.atMs(this.clock + 260, () => audio.playSfx(SFX.casing, VOL.pickup));
    const sprite = scene.add.image(muzzle.x, muzzle.y, 'boss-shell').setScale(0.4).setDepth(DEPTH.PICKUPS + 2);
    const inFront = new Set(this.live.filter(l => {
      const x = this.liveX(l);
      return x === null || x > muzzle.x;
    }));
    this.bullets.push({ sprite, lane: player.currentFloor, inFront });
    if (this.prompt?.key === 'shoot') { this.prompt = null; this.hideKeycap(); }
  }

  /** Where something is along the lane for a bullet now (world x), or null when it is not there to meet. */
  private liveX(l: Live): number | null {
    if (l.kind === 'mover') {
      if (l.h.returning || l.back || !l.sprite || l.resolved) return null;
      if (l.h.bounce && this.clock < this.stepStartOf(l) + rollStart(l.h)) return null;
      return this.moverX(l);
    }
    if (l.kind === 'loose') {
      if (l.resolved || this.clock < l.roll) return null;
      return this.loosePos(l).x;
    }
    return null;
  }

  private updateBullets(dt: number): void {
    const speed = BULLET_SPEED * this.scale;
    const cam = this.ctx.scene.cameras.main;
    for (const b of this.bullets.slice()) {
      b.sprite.x += speed * dt;
      const x = b.sprite.x;
      let hit: Live | null = null;
      let hitX = Infinity;
      for (const l of this.live) {
        if (!b.inFront.has(l)) continue;
        const lane = l.kind === 'loose' ? l.h.lane : l.h.lane;
        if (lane !== b.lane) continue;
        if (l.kind === 'mover' && l.h.hp === 0) continue;
        const lx = this.liveX(l);
        if (lx !== null && lx <= x && lx < hitX) { hit = l; hitX = lx; }
      }
      let spent = false;
      if (hit) {
        spent = true;
        this.bulletMeets(hit, b.sprite.x, b.sprite.y);
      } else {
        const head = this.director.frontTarget(b.lane);
        if (head && x >= this.headFrontX(head, b.sprite.y)) {
          spent = true;
          sparkBurst(this.ctx.scene, x, b.sprite.y, HEAD_COLOR[head], 6, -1, 30);
          this.ctx.audio.playSfx(SFX.hit, VOL.boss * 0.7);
          this.flashBody();
          this.damage(head, BULLET_DAMAGE, 'bullet', { x, y: b.sprite.y });
        } else if (!head && !this.director.ducked && this.director.bodyHeads.length) {
          const pipes = this.setFrontX(b.sprite.y);
          if (pipes !== null && x >= pipes) {
            spent = true;
            this.spark(x, b.sprite.y);
          }
        }
      }
      if (spent || x > cam.scrollX + cam.width + 40) {
        b.sprite.destroy();
        this.bullets = this.bullets.filter(o => o !== b);
      }
      if (this.over || this.hitStop) return;
    }
  }

  private bulletMeets(l: Live, x: number, y: number): void {
    if (l.kind === 'loose') {
      sparkBurst(this.ctx.scene, x, y, HEAD_COLOR[l.head], 8, 1, 36);
      this.ctx.audio.playSfx(SFX.hit, VOL.boss);
      this.damage('loose', BULLET_DAMAGE, 'bullet', { x, y });
      return;
    }
    if (l.kind !== 'mover') return;
    if (l.h.hp === Infinity) {
      this.spark(x, y);
      return;
    }
    l.taken++;
    if (l.taken < l.h.hp) {
      sparkBurst(this.ctx.scene, x, y, SHOT_LOOK.slab.color, 6, 1, 26);
      this.ctx.audio.playSfx(SFX.hit, VOL.boss * 0.6);
      return;
    }
    // Shot down
    const sx = l.sprite?.x ?? x;
    const sy = l.sprite?.y ?? y;
    this.explosion(sx, sy);
    this.ctx.audio.playSfx(SFX.shotDown, VOL.boss);
    this.combo++;
    this.score(SHOT_DOWN_SCORE);
    if (l.partner) this.dropMover(l.partner);
    this.endMover(l);
  }

  dash(): void {
    const { player } = this.ctx;
    if (this.state !== 'fighting' || this.lunge || this.hitStop || !player.dashReady || player.isDashing) return;
    player.startDash();
    this.lunge = { t0: this.clock };
    if (this.prompt && this.prompt.key !== 'shoot') { this.prompt = null; this.hideKeycap(); }
  }

  /** The roach's offset along its lunge: out and back inside the dash. */
  private updateLunge(): number {
    const lunge = this.lunge;
    if (!lunge) return 0;
    const t = this.clock - lunge.t0;
    if (t >= DASH_MS) {
      this.lunge = null;
      return 0;
    }
    return lungeOffset(t, LUNGE_REACH * this.scale);
  }

  // ── Looks ─────────────────────────────────────────────────────────

  private get setKey(): string {
    const key = this.director.bodyHeads.map(h => h[0]).join('');
    return key.length === 3 ? 'bpc' : key;
  }

  private idleAnim(): ZlewiatanAnim {
    const key = this.setKey;
    return (key === 'bpc' ? 'idle' : `idle-${key}`) as ZlewiatanAnim;
  }

  private spitAnim(head: Head): ZlewiatanAnim {
    const key = this.setKey;
    if (!key.includes(head[0])) return this.idleAnim();
    return (key === 'bpc' ? `spit-${head}` : `spit-${head}-${key}`) as ZlewiatanAnim;
  }

  private riseAnim(): ZlewiatanAnim {
    return `rise-${this.setKey}` as ZlewiatanAnim;
  }

  private playBody(anim: ZlewiatanAnim, start: number, reverse: boolean, then: ZlewiatanAnim | null): void {
    if (this.state === 'victory' && !anim.startsWith('defeat')) return;
    this.bodyAnim = { anim, start, reverse, then };
  }

  private flashBody(): void {
    if (this.bodyAnim.anim.startsWith('idle')) this.flashUntil = this.clock + FLASH_MS;
  }

  private drawBody(): void {
    const body = this.body;
    if (!body) return;
    const { anim, start, reverse, then } = this.bodyAnim;
    const spec = ZLEWIATAN_ANIMS[anim];
    let index: number;
    if (spec.loop) index = Math.floor((this.clock * spec.fps) / 1000) % spec.frames;
    else {
      index = Math.floor(((this.clock - start) * spec.fps) / 1000);
      if (index >= spec.frames && then) {
        this.bodyAnim = { anim: then, start: this.clock, reverse: false, then: null };
        this.drawBody();
        return;
      }
      index = Math.max(0, Math.min(index, spec.frames - 1));
      if (reverse) index = spec.frames - 1 - index;
    }
    if (this.clock < this.flashUntil && anim.startsWith('idle')) {
      const key = this.setKey;
      body.setFrame(zlewiatanFrame(`flash-${key}` as ZlewiatanAnim, 0));
      return;
    }
    body.setFrame(zlewiatanFrame(anim, index));
  }

  /** Each head glows from its wind-up until what it throws leaves: bigger and brighter toward the moment. */
  private drawHalos(): void {
    for (const head of HEADS) {
      let k = -1;
      let hot = false;
      for (const l of this.live) {
        if (l.kind === 'loose' || l.h.head !== head || l.resolved) continue;
        if (l.kind === 'mover' && l.h.returning) continue;
        if (this.clock >= l.tell && this.clock < l.fire) {
          k = Math.max(k, (this.clock - l.tell) / Math.max(1, l.fire - l.tell));
          hot ||= l.h.kind === 'radiator';
        }
      }
      const halo = this.halos[head];
      if (k < 0 || !this.director.onBody(head)) { halo.hide(); continue; }
      halo.color = hot ? HOT : HEAD_COLOR[head];
      const at = this.mouth(head);
      halo.show(at.x, at.y, 16 + 22 * k + 2 * Math.sin(this.clock / 45), 0.5 + 0.5 * k);
    }
  }

  /** The landing shadows: where each lob comes down, from the moment it leaves; where the loose head lands next. */
  private drawShadows(): void {
    const spots: Spot[] = [];
    let pink = false;
    for (const l of this.live) {
      if (l.kind === 'lob' && !l.resolved && this.clock >= l.fire) {
        for (const g of l.globs) {
          if (g.done) continue;
          const half = LOB_SPOT / 2;
          spots.push({ x0: g.x - half, x1: g.x + half, y: this.floorY(l.h.lane) + 1, progress: (this.clock - l.fire) / Math.max(1, g.land - l.fire) });
        }
      } else if (l.kind === 'mover' && l.h.bounce && !l.resolved && l.sprite) {
        const lands = l.h.landings!;
        const t0 = this.stepStartOf(l);
        const next = lands.findIndex(x => t0 + x.at > this.clock);
        if (next < 0) continue;
        const last = next === lands.length - 1;
        const half = (last ? SETTLE_SPOT : LOB_SPOT) / 2;
        const x = this.worldX(lands[next].x);
        const from = next === 0 ? l.fire : t0 + lands[next - 1].at;
        spots.push({ x0: x - half, x1: x + half, y: this.floorY(lands[next].lane) + 1, progress: (this.clock - from) / Math.max(1, t0 + lands[next].at - from) });
        pink ||= last;
      } else if (l.kind === 'loose' && !l.resolved) {
        const lands = l.h.landings!;
        const next = lands.findIndex(x => l.start + x.at > this.clock);
        if (next < 0) continue;
        const last = next === lands.length - 1;
        const half = (last ? SETTLE_SPOT : HEAD_SPOT) / 2;
        const x = this.worldX(lands[next].x);
        const from = next === 0 ? l.start : l.start + lands[next - 1].at;
        spots.push({ x0: x - half, x1: x + half, y: this.floorY(lands[next].lane) + 1, progress: (this.clock - from) / Math.max(1, l.start + lands[next].at - from) });
        pink ||= last;
      }
    }
    if (spots.length) this.shadow.showSpots(spots, pink ? 'pink' : 'warm');
    else this.shadow.hide();
  }

  private showBars(): void {
    const segments: BossSegment[] = HEADS.map(head => {
      const loose = this.director.loose;
      if (this.director.isGone(head)) return { label: LABEL[head], value: 0, max: 1, state: 'gone' };
      if (loose && loose.head === head) return { label: LABEL[head], value: loose.hp, max: LOOSE_HP[head], state: 'loose' };
      if (!this.director.onBody(head)) return { label: LABEL[head], value: LOOSE_HP[head], max: LOOSE_HP[head], state: 'loose' };
      return { label: LABEL[head], value: this.director.hp[head], max: HEAD_HP[head], state: 'on' };
    });
    if (this.ctx.showSegments) this.ctx.showSegments(segments);
    else this.ctx.showBar(segments.reduce((s, x) => s + (x.state === 'gone' ? 0 : x.value), 0), HEAD_HP.block + HEAD_HP.pierog + HEAD_HP.carp);
  }

  private get multiplier(): number { return Math.min(COMBO_MAX_MULT, 1 + Math.floor(this.combo / COMBO_STEP)); }

  private drawHud(): void {
    const cam = this.ctx.scene.cameras.main;
    const mult = this.multiplier;
    this.comboText.setVisible(this.state === 'fighting' && this.combo >= 3).setPosition(cam.width / 2, cam.height - 60)
      .setText(mult > 1 ? `COMBO ${this.combo}  x${mult}` : `COMBO ${this.combo}`);
    this.drawKeycap();
  }

  private showPrompt(p: Prompt, t0: number, step: Step): void {
    const target = p.key === 'shoot' ? null : step.hazards.find(h => h.kind === 'slab' || h.kind === 'head' || h.kind === 'radiator');
    this.prompt = { key: p.key, from: t0 + p.from, to: t0 + p.to, lane: target && target.kind !== 'radiator' ? target.lane : null };
  }

  /**
   * The keycap, the first time something asks for a tool, only while pressing it then is right: the gun with a head in
   * front of it on the roach's lane, the dash ready and what it must meet on the roach's lane.
   */
  private drawKeycap(): void {
    const prompt = this.prompt;
    if (!prompt || this.state !== 'fighting' || this.clock > prompt.to) {
      if (prompt && this.clock > prompt.to) this.prompt = null;
      this.hideKeycap();
      return;
    }
    const { player, scene } = this.ctx;
    const gun = prompt.key === 'shoot';
    const honest = this.clock >= prompt.from && (gun
      ? this.director.frontTarget(player.currentFloor) !== null && this.ctx.abilities.canShoot
      : player.dashReady && !player.isDashing && (prompt.lane === null || player.currentFloor === prompt.lane));
    if (!honest) {
      this.hideKeycap();
      return;
    }
    if (!this.keycap) {
      const touch = !scene.sys.game.device.os.desktop;
      this.keycap = gun ? addKeycap(scene, touch ? 'STRZAŁ' : 'SPACJA', '16px') : (touch ? addKeycap(scene, 'DASH') : addArrowKeycap(scene, 'right'));
    }
    this.keycap.setPosition(Math.round(player.sprite.x), Math.round(player.sprite.y - KEYCAP_ABOVE_PX + keycapBob(scene.time.now)));
  }

  private hideKeycap(): void {
    this.keycap?.destroy();
    this.keycap = null;
  }

  private dodged(lane: Lane): void {
    const { scene, audio, player } = this.ctx;
    if (lane === player.currentFloor) return;
    const hop = player.lastHop;
    const close = hop !== null && hop.from === lane && scene.time.now - hop.at <= CLOSE_CALL_MS;
    if (close) audio.playSfx(SFX.closeCall, 0.6);
    const points = close ? DODGE_SCORE + NEAR_MISS_SCORE : DODGE_SCORE;
    this.ctx.addScore(points);
    this.popupAt(player.x, player.y - 40, close ? `NA STYK! +${points}` : `+${points}`, close ? '#7fe0ff' : '#ffdd00', 10);
  }

  private score(points: number): void {
    this.ctx.addScore(points * this.multiplier);
  }

  private burst(x: number, y: number, color: number, big: boolean): void {
    glint(this.ctx.scene, x, y, color, big ? 34 : 22, 300);
    sparkBurst(this.ctx.scene, x, y, color, big ? 14 : 8, 1, big ? 60 : 40);
  }

  private explosion(x: number, y: number): void {
    const exp = this.ctx.scene.add.image(x, y, `boss-explosion${Phaser.Math.Between(1, 3)}`).setScale(0.3).setDepth(DEPTH.VFX_TEXT);
    this.effects.push(exp);
    this.ctx.scene.tweens.add({ targets: exp, alpha: 0, scale: 0.6, duration: 300, onComplete: () => exp.destroy() });
  }

  private puff(x: number, y: number): void {
    getFx(this.ctx.scene).play('poof', x, y, { depth: DEPTH.PICKUPS + 2 });
  }

  /** A bullet glancing off a radiator or the pipes. */
  private spark(x: number, y: number): void {
    const fx = this.ctx.scene.add.sprite(x, y, ZLEWIATAN_TEXTURE, zlewiatanFrame('spark')).setScale(SPRITE_SCALE).setDepth(DEPTH.VFX_TEXT);
    fx.play('zlewiatan-spark');
    fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
    this.ctx.audio.playSfx(SFX.glance, VOL.boss * 0.6);
  }

  private popupAt(x: number, y: number, text: string, color: string, size: number): void {
    const { scene } = this.ctx;
    const label = scene.add.text(Math.round(x), Math.round(y), text, popupStyle({ fontSize: `${size}px`, color })).setOrigin(0.5).setDepth(DEPTH.POPUP);
    this.effects.push(label);
    scene.tweens.add({
      targets: label, y: label.y - 24, alpha: { from: 1, to: 0 }, duration: 700, ease: 'Power2',
      onComplete: () => { this.effects = this.effects.filter(o => o !== label); label.destroy(); },
    });
  }

  // ── Geometry ──────────────────────────────────────────────────────

  private floorY(lane: Lane): number { return lane === 'top' ? this.ctx.floorTopY : this.ctx.floorBottomY; }
  private flyY(lane: Lane): number { return this.floorY(lane) - OBSTACLE_OFFSET; }
  private worldX(refX: number): number { return this.holdX + refX * this.scale; }

  /** Whether the roach is on this lane: pressed for it and drawn on it, so a hit is never on a lane it visibly left. */
  private onLane(lane: Lane): boolean {
    const { player, floorTopY, floorBottomY } = this.ctx;
    const drawn: Lane = player.sprite.y < (floorTopY + floorBottomY) / 2 ? 'top' : 'bottom';
    return player.currentFloor === lane && drawn === lane;
  }

  /** Where this head sits with the heads left now (the pierog drops into the carp's place; the last moves to the middle). */
  private headInfo(head: Head) {
    return SET_HEADS[this.setKey]?.[head] ?? SET_HEADS[this.keyBefore]?.[head] ?? SET_HEADS.bpc[head]!;
  }

  /** A head's mouth as it lets go, world. */
  private mouth(head: Head): { x: number; y: number } {
    const r = this.headInfo(head).mouth;
    return { x: this.bossX + r.x * SPRITE_SCALE, y: this.bossY + r.y * SPRITE_SCALE };
  }

  private headPoint(head: Head): { x: number; y: number } {
    const m = this.headInfo(head).mid;
    return { x: this.bossX + m.x * SPRITE_SCALE, y: this.bossY + m.y * SPRITE_SCALE };
  }

  /** Where a bullet at world y stops on this head: its front on the rows round the bullet's. */
  private headFrontX(head: Head, y: number): number {
    const rows = this.headInfo(head).front;
    const row = Math.round((y - this.bossY) / SPRITE_SCALE) + FRONT_TOP;
    let best: number | null = null;
    for (let r = row - 6; r <= row + 6; r++) {
      const v = rows[r];
      if (v !== null && v !== undefined) best = best === null ? v : Math.min(best, v);
    }
    return this.bossX + (best ?? this.headInfo(head).mid.x) * SPRITE_SCALE;
  }

  /** Where a bullet glances off what is left of the creature on its row (the pipes), or null if nothing is there. */
  private setFrontX(y: number): number | null {
    const key = this.setKey as keyof typeof SET_FRONT;
    const rows = SET_FRONT[key];
    if (!rows) return null;
    const v = rows[Math.round((y - this.bossY) / SPRITE_SCALE) + FRONT_TOP];
    return v === null || v === undefined ? null : this.bossX + v * SPRITE_SCALE;
  }

  // ── Taking it down ────────────────────────────────────────────────

  protected teardown(): void {
    this.visuals?.destroy();
    this.visuals = null;
    const keep = new Set<Phaser.GameObjects.GameObject>(this.culprit);
    for (const l of this.live) {
      if (l.kind === 'mover') {
        if (l.sprite && !keep.has(l.sprite)) l.sprite.destroy();
        l.trail?.destroy();
      } else if (l.kind === 'lob') {
        for (const g of l.globs) { if (!g.done) { g.sprite.destroy(); g.trail.destroy(); } }
        if (l.puddle && !keep.has(l.puddle)) l.puddle.destroy();
      }
    }
    this.live = [];
    for (const b of this.bullets) b.sprite.destroy();
    this.bullets = [];
    if (this.looseSprite && !keep.has(this.looseSprite)) this.looseSprite.destroy();
    for (const h of HEADS) this.halos[h].destroy();
    this.shadow.destroy();
    this.puddleZone.destroy();
    this.comboText.destroy();
    this.countText.destroy();
    this.hideKeycap();
    for (const obj of this.effects) obj.destroy();
    this.effects = [];
    this.events = [];
    // What killed the roach flashes over its death a moment longer, so the cause reads
    for (const c of this.culprit) {
      if (!c.active) continue;
      this.ctx.scene.tweens.add({
        targets: c, alpha: { from: 1, to: 0.15 }, duration: CULPRIT_FLASH_MS / 8, yoyo: true, repeat: 3,
        onComplete: () => c.destroy(),
      });
    }
    this.culprit = [];
    // Lost, it stays a moment where it was
    const body = this.body;
    if (body?.active) this.ctx.scene.tweens.add({ targets: body, alpha: 0, duration: 400, delay: 300, onComplete: () => body.destroy() });
  }

  /** For scripted runs: what is coming, on the fight's clock, and where things stand. */
  get script(): {
    clock: number; holdX: number; scale: number; threats: ZlewiatanThreat[]; phase: number; stopped: boolean;
    fighting: boolean; front: Record<Lane, Head | null>; ducked: boolean; hp: Record<Head, number>; loose: Head | null;
    gunReady: boolean; closed: Lane | null;
  } {
    const threats: ZlewiatanThreat[] = [];
    for (const l of this.live) {
      if (l.resolved) continue;
      if (l.kind === 'loose') {
        threats.push({ kind: 'head', lane: l.h.lane, cue: l.cue, fire: l.roll, t: l.t, lasts: 0, parry: true, shootable: true, loose: true, x: this.liveX(l) });
      } else if (l.kind === 'lob') {
        threats.push({ kind: l.h.kind, lane: l.h.lane, cue: l.cue, fire: l.fire, t: l.t, lasts: l.h.lasts, parry: false, shootable: false, loose: false, x: null });
      } else {
        threats.push({
          kind: l.h.returning ? 'return' : l.h.kind, lane: l.h.lane, cue: l.cue, fire: l.fire, t: l.t, lasts: 0, parry: l.h.parry > 0,
          shootable: l.h.hp > 0 && l.h.hp !== Infinity, loose: false, x: this.liveX(l),
        });
      }
    }
    const puddle = this.live.find(l => l.kind === 'lob' && l.h.kind === 'cream' && l.puddle && !l.resolved);
    return {
      clock: this.clock, holdX: this.holdX, scale: this.scale, threats, phase: this.director.phase, stopped: this.stopped,
      fighting: this.state === 'fighting', front: { top: this.director.frontTarget('top'), bottom: this.director.frontTarget('bottom') },
      ducked: this.director.ducked, hp: { ...this.director.hp }, loose: this.director.loose?.head ?? null,
      gunReady: this.clock >= this.gunReadyAt, closed: puddle ? puddle.h.lane : null,
    };
  }
}
