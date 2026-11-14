/**
 * DJ Bigos, Król remizy. He stands at the right behind his booth with a speaker on each lane in front of him, and
 * everything happens on his beat: one clock at 120 BPM, kept on his own track's beat (beatLock.ts), drives his groove,
 * the speakers' thump, the beat pips under the bar and every attack, which lands on a beat the player can count to.
 *
 * He is the fight the dash was earned for. The dash is a lunge down the lane into whatever stands at its end: a speaker
 * takes a hit every time, cracks, sparks and drops his bar; a ring or a record met on the way is sent straight back
 * into it for three. He fires rings from the speakers (each speaker charges and glows first, he points at it), flings
 * records (one glows in his glove, his arm aimed at its lane), turns the ball's spotlight on a lane (the lane marked
 * as a lane is: the light covers all of it), and drops the bass: a build the whole scene plays, then a wave front a
 * few floor tiles wide leaves the speakers on both lanes at once and travels at the roach. Hopping is no escape; a dash
 * into it bounces it back like a ring (for more at the last moment, "NA STYK!"), its twin collapses, and his system
 * overloads for a few beats: lunges count double. From phase two the speakers recharge as the first wave arrives and a
 * second follows, timed to reach the roach just as a dash spent on the first comes back, so a lunge in between is the
 * greed that gets punished. Spend the dash at the wrong moment and the drop finds you without it. A speaker hit too often shrieks and blasts
 * its own lane three times; when one goes he cranks the other back up. Two speakers, then the ball over the top lane:
 * his sound system, one bar.
 *
 * Nothing that only passes along a lane marks the lane: its warning is on the speaker or on him, and on the thing
 * itself (a ring, a record, the drop's front). Only the light, which
 * covers a whole lane, marks one, with the run's own kill-zone look. What comes when, and what a hit does, is
 * bigosPatterns (and its tests); the frames are bigosConfig.
 */
import Phaser from 'phaser';
import { parseRoach } from '../../config/skins';
import { DEPTH } from '../../config/constants';
import { SPRITE_SCALE } from '../../config/sprites';
import { getFx } from '../../effects/Fx';
import { KillZone } from '../../effects/KillZone';
import { popupStyle } from '../../utils/TextStyles';
import { addArrowKeycap, addKeycap, keycapBob } from '../../ui/Keycap';
import { NEAR_MISS_SCORE } from '../RiskBonus';
import { BossFight, BossFightContext } from './BossFight';
import {
  BIGOS_ANIMS, BIGOS_CAUSE_KEY, BIGOS_GLOVE, BIGOS_HAND, BIGOS_HIT, BIGOS_LAYOUT as L, BIGOS_TEXTURE, BigosAnim,
  bigosBallFrame, BigosCause, bigosFrame,
} from './bigosConfig';
import { lockStep, startSeek } from './beatLock';
import { glint, Halo, sparkBurst, Trail } from './bossTelegraph';
import {
  Attack, BEAT_MS, BigosDirector, buildPhases, DASH_MS, DROP_GRACE_MS, DROP_TIGHT_BONUS, DROP_TIGHT_MS, DROP_WAVE_BREAK_MS,
  fightRandom, HIT_DAMAGE, Lane, LIGHT_MS,
  LUNGE_OUT_SHARE, lungeOffset, other, PARRY_DAMAGE, Prompt, promptFor, RECORD_WINDUP_BEATS, resolve, RING_CHARGE_BEATS,
  RING_TRAVEL_MS, SEGMENT_HP, stepBeats, Target, timeAttack, TOTAL_HP, WRECK_BEATS,
} from './bigosPatterns';

const VICTORY_BONUS = 400;
/** Every ring, record and flash dodged. */
const DODGE_SCORE = 10;
/** A lunge that lands, a thing sent back: times the combo's multiplier. */
const HIT_SCORE = 15;
const PARRY_SCORE = 40;
/** Each part of his sound system wrecked. */
const WRECK_SCORE = 150;
/** A hop out of a ring's or record's lane this close before it arrives is a close call: "NA STYK!". */
const CLOSE_CALL_MS = 250;
/** Every this many hits in a row without a miss or a hit taken, the score multiplier goes up one, to the most. */
const COMBO_STEP = 3;
const COMBO_MAX_MULT = 4;

/** His far hand stays this far inside the screen's right edge, screen px. */
const RIGHT_MARGIN = 64;
/** The speakers stand this far left of the booth, screen px. */
const SPEAKER_GAP = 16;
/** The speakers drop onto their lanes while the roach brakes. */
const DROP_IN_MS = 520;
const DROP_FROM = 260;
/** The roach brakes this quickly: the entrance is the speakers dropping in meanwhile. */
const BRAKE_MS = 800;
/** A record flies this high over its lane, screen px: through the roach's body. */
const RECORD_HEIGHT = 26;
/** The lunge stops this far short of what it hits, px: its head on the cabinet. */
const LUNGE_SHORT = 6;
/** A hit thing wobbles this long, this much. */
const WOBBLE_MS = 220;
const WOBBLE_PX = 6;
/** A hit flashes the speaker white this long (the first frame of its breaking). */
const FLASH_MS = 80;
/** The fight stops for a moment on every hit: a lunge, a thing sent back, a wreck. */
const FREEZE_HIT_MS = 55;
const FREEZE_PARRY_MS = 110;
const FREEZE_WRECK_MS = 280;
/** The drop's front: this wide (2.5 floor tiles), its leading edge a ring. */
const FRONT_PX = 170;
/** A thing sent back reaches what it hits in this long. */
const RETURN_MS = 170;
/** What hit the roach flashes this long, the fight stopped, before the game over. A moult's is shorter. */
const HIT_STOP_MS = 120;
const MOULT_STOP_MS = 90;
/** After the stop the death plays at once, and what hit the roach keeps flashing over it this long (real ms). */
const CULPRIT_BLINK_MS = 500;
const BLINK_STEP_MS = 80;
/** The drop's build darkens the screen to this, swells the speakers by this much and shakes them this many px. */
const DROP_DIM = 0.65;
const DROP_SWELL = 0.16;
const DROP_SHAKE_PX = 6;
/** The record he winds up with glows in this, flares as it appears, and bursts in it as it leaves. */
const RECORD_GLOW = 0xc89bff;
const RECORD_TRAIL = { color: 0xb08cff, ms: 360, size: 12 };
/** A speaker charging glows violet on its big cone; overloaded, or about to go, orange. */
const CHARGE_GLOW = 0xff6ad5;
const HOT_GLOW = 0xff8a2a;
/** The keycap prompt floats this far above the roach; the count-in ring closes from this radius to the keycap's. */
const KEYCAP_ABOVE_PX = 96;
const COUNT_RING_FROM = 46;
const COUNT_RING_TO = 16;
/** Sitting in the wreck of his booth before the run picks up again. */
const DEFEAT_HOLD_MS = 1300;
const FADE_MS = 400;
/** The longest a single frame moves the fight's clock: a pause doesn't count, a hitch only this much. */
const MAX_STEP_MS = 250;

const SHAKE_MS = 140;
const SHAKE = 0.01;
/** The beat pips under the bar. */
const PIP_PX = 10;
const PIP_GAP = 6;
const PIP_ON = 0xffd36a;
const PIP_OFF = 0x3a3450;
const PIP_DUE = 0xff3b6b;
/** Each part's health, a lamp a point. */
const LAMP_PX = 4;
const LAMP_GAP = 1;
const LAMP_ON = 0xff8a2a;
const LAMP_LOW = 0xff3b3b;
const LAMP_OFF = 0x2a2a38;
/** A speaker's lamps sit on its ledge's face, this far under its feet. */
const LAMP_BELOW_PX = 8;

const SFX = {
  point: 'bigos-scratch',
  blast: 'bigos-blast',
  beam: 'bigos-beam',
  bonk: 'bigos-bonk',
  overload: 'bigos-overload',
  shriek: 'bigos-shriek',
  wreck: 'bigos-wreck',
  closeCall: 'na-styk',
  land: 'bigos-thump',
  defeat: 'bigos-defeat',
  charge: 'bigos-charge',
  throw: 'bigos-scratch',
  parry: 'boss-parry',
  lunge: 'vs-slam-2',
  hurt: 'vs-slam-2',
  hit: 'vs-slam-1',
};

interface Speaker {
  sprite: Phaser.GameObjects.Sprite;
  lane: Lane;
  anim: BigosAnim;
  start: number;
  wrecked: boolean;
  wobbleAt: number;
  flashUntil: number;
  /** Charging (a ring on its way) until then; shrieking (a burst coming) until then. */
  chargeUntil: number;
  shriekUntil: number;
  glow: Halo;
}

/** A ring, a record or a drop's front on its way down a lane: it is decided when it reaches the roach. */
interface Mover {
  kind: 'ring' | 'record' | 'front';
  /** The ring, the record, or the front's leading ring. */
  sprite: Phaser.GameObjects.Sprite | null;
  /** A front's band of light behind its leading ring, and the crest that ends the band at its leading edge. */
  band?: Phaser.GameObjects.TileSprite;
  cap?: Phaser.GameObjects.Sprite;
  lane: Lane;
  x0: number;
  t0: number;
  speed: number;
  resolved: boolean;
  /** Gone: off the screen, or landed back where it was sent. */
  done: boolean;
  /** A drop's two fronts: bouncing one collapses the other. */
  twins?: Mover[];
  /** A front: when it reaches the roach's spot (the last-moment bonus is counted back from here). */
  arriveAt?: number;
  /** What it does when it lands back where it was sent. */
  damage?: number;
  trail?: Trail;
  /** Sent back: from where, to what, when. */
  back?: { x: number; y: number; t0: number; target: Target; to: { x: number; y: number } };
}

/** A spotlight's flash on a lane: dangerous from `at` for LIGHT_MS. */
interface Flash {
  lane: Lane;
  at: number;
  hit: boolean;
}

/** What the scripted driver reads: each thing coming, from the set's own numbers, on the fight's clock. */
export interface BigosThreat {
  kind: string;
  lane: Lane | 'both';
  cue: number;
  fire: number;
  at: number;
  lasts: number;
  parry: boolean;
}

export class BigosFight extends BossFight {
  readonly victoryBonus = VICTORY_BONUS;

  private readonly director: BigosDirector;
  /** Bumped by a wreck: what the step in progress still had scheduled is dropped. */
  private gen = 0;

  /** The fight's own clock, ms, every beat counted on it: scene time while the fight runs, stopped by the pause. */
  private clock = 0;
  private lastNow: number | null = null;
  private events: { at: number; fn: () => void }[] = [];
  private lastBeat = -1;
  /** The fight holds still on a hit until then (scene time). */
  private freezeUntil = 0;

  private readonly dj: Phaser.GameObjects.Sprite;
  private readonly light: Phaser.GameObjects.Sprite;
  /** The ball's cracks and missing tiles as the last target, laid over his frame. */
  private readonly ballDamage: Phaser.GameObjects.Sprite;
  private readonly strips: Record<Lane, Phaser.GameObjects.TileSprite>;
  private readonly zones: Record<Lane, KillZone>;
  /** The lane marked for each light coming: warned from `from`, killing from `kill` until `until`. */
  private zoneMarks: { lane: Lane; from: number; kill: number; until: number }[] = [];
  private djAnim: { anim: BigosAnim; start: number; then: BigosAnim | null } = { anim: 'groove', start: 0, then: null };
  private readonly speakers: Record<Lane, Speaker>;
  private movers: Mover[] = [];
  private flashes: Flash[] = [];
  private threats: BigosThreat[] = [];
  private prompted = new Set<string>();
  /** needsTarget: a lunge, so only where it hits something; lane: what it is for comes down this lane only. */
  private prompt: {
    key: Prompt['key']; countFrom: number; from: number; to: number; needsTarget: boolean; lane: Lane | null;
  } | null = null;
  private lunge: { t0: number; reach: number; arrived: boolean } | null = null;
  /** The hit-stop: what hit the roach flashes and the fight holds, until this (real ms), then the game over. */
  private hitStop: { until: number; culprit: Phaser.GameObjects.Components.Alpha[]; deadly: boolean } | null = null;
  private dropBuild: { from: number; to: number } | null = null;
  private dim: Phaser.GameObjects.Rectangle;
  /** The record he winds up with: glowing in his glove from a beat before it leaves. */
  private held: { sprite: Phaser.GameObjects.Sprite; halo: Halo; since: number } | null = null;
  private frameIndex = 0;
  private keycap: Phaser.GameObjects.Text | Phaser.GameObjects.Image | null = null;
  private countRing: Phaser.GameObjects.Graphics;
  private pips: Phaser.GameObjects.Graphics;
  private lamps: Phaser.GameObjects.Graphics;
  private comboText: Phaser.GameObjects.Text;
  private combo = 0;
  /** Beats something lands on, for the pips. */
  private dueBeats = new Set<number>();
  private effects: Phaser.GameObjects.GameObject[] = [];
  /** What killed the roach: kept past the teardown to flash over the death, then destroyed by itself. */
  private orphans = new Set<Phaser.GameObjects.GameObject>();
  private roachIdle: string | null = null;
  private stopped = false;
  private ballSmokeAt = 0;

  constructor(ctx: BossFightContext) {
    super(ctx);
    const { scene } = ctx;
    this.director = new BigosDirector(buildPhases(fightRandom(ctx.seed, ctx.boss.id)));
    scene.registry.remove(BIGOS_CAUSE_KEY);

    const strip = () => scene.add.tileSprite(0, 0, L.stripW * 4, L.stripH, BIGOS_TEXTURE, bigosFrame('strip'))
      .setOrigin(1, 0.5).setScale(SPRITE_SCALE).setDepth(DEPTH.PICKUPS + 1).setVisible(false);
    this.strips = { top: strip(), bottom: strip() };
    this.zones = { top: new KillZone(scene), bottom: new KillZone(scene) };
    this.dim = scene.add.rectangle(0, 0, 4000, 4000, 0x000000, 1).setOrigin(0).setScrollFactor(0)
      .setDepth(DEPTH.OBSTACLES - 0.5).setAlpha(0);
    this.dj = scene.add.sprite(0, ctx.floorBottomY, BIGOS_TEXTURE, bigosFrame('groove'))
      .setScale(SPRITE_SCALE).setDepth(DEPTH.OBSTACLES);
    this.light = scene.add.sprite(0, ctx.floorBottomY, BIGOS_TEXTURE, bigosFrame('light-top'))
      .setScale(SPRITE_SCALE).setDepth(DEPTH.PICKUPS + 1).setVisible(false);
    this.ballDamage = scene.add.sprite(0, ctx.floorBottomY, BIGOS_TEXTURE, bigosBallFrame(1, 'groove', 0))
      .setScale(SPRITE_SCALE).setDepth(DEPTH.OBSTACLES + 0.1).setVisible(false);
    const speaker = (lane: Lane): Speaker => ({
      sprite: scene.add.sprite(0, this.laneY(lane) - DROP_FROM, BIGOS_TEXTURE, bigosFrame('speaker-thump'))
        .setScale(SPRITE_SCALE).setDepth(DEPTH.OBSTACLES),
      lane, anim: 'speaker-thump', start: 0, wrecked: false, wobbleAt: -1e9, flashUntil: -1, chargeUntil: -1,
      shriekUntil: -1, glow: new Halo(scene, CHARGE_GLOW, DEPTH.OBSTACLES + 0.6),
    });
    this.speakers = { top: speaker('top'), bottom: speaker('bottom') };
    this.lamps = scene.add.graphics().setDepth(DEPTH.OBSTACLES + 0.5);
    this.pips = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.HUD);
    this.countRing = scene.add.graphics().setDepth(DEPTH.POPUP);
    this.comboText = scene.add.text(0, 0, '', popupStyle({ fontSize: '12px', color: '#ffd36a' }))
      .setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.HUD).setVisible(false);
    this.place();

    // The speakers drop in while the roach brakes; the first beat comes after it has stopped
    this.brake(() => {
      this.stopped = true;
      const beat = Math.ceil(this.beatNow) + 1;
      this.at(beat, () => this.startFighting(beat));
    }, BRAKE_MS);
  }

  get inputLive(): boolean { return super.inputLive && !this.hitStop; }

  // ── The beat ──────────────────────────────────────────────────────

  private beatTime(beat: number): number { return beat * BEAT_MS; }
  private get beatNow(): number { return this.clock / BEAT_MS; }

  private at(beat: number, fn: () => void): void { this.atMs(this.beatTime(beat), fn); }

  private atMs(t: number, fn: () => void): void {
    let i = this.events.length;
    while (i > 0 && this.events[i - 1].at > t) i--;
    this.events.splice(i, 0, { at: t, fn });
  }

  /** Part of the step in progress: dropped if a wreck ends it first. */
  private stepAtMs(t: number, fn: () => void): void {
    const gen = this.gen;
    this.atMs(t, () => { if (gen === this.gen && this.state === 'fighting') fn(); });
  }

  private stepAt(beat: number, fn: () => void): void { this.stepAtMs(this.beatTime(beat), fn); }

  /** When a one-shot must start so that its beat frame lands on this beat. */
  private hitStart(anim: BigosAnim, beat: number): number {
    return this.beatTime(beat) - (BIGOS_HIT[anim] ?? 0) * 1000 / BIGOS_ANIMS[anim].fps;
  }

  private onBeat(beat: number): void {
    this.dueBeats.forEach(b => { if (b < beat) this.dueBeats.delete(b); });
  }

  // ── Flow ──────────────────────────────────────────────────────────

  private startFighting(beat: number): void {
    this.state = 'fighting';
    const { audio, boss } = this.ctx;
    audio.switchBGM(boss.music);
    // His track carries the beat: one that only starts now (the pre-battle loop never ran) starts on the fight's bar
    const seekTo = startSeek(this.clock, audio.bgmPosition(boss.music));
    if (seekTo !== null) audio.seekBGM(boss.music, seekTo);
    this.ctx.showBar(TOTAL_HP, TOTAL_HP);
    this.advance(beat);
  }

  /** The stage is free on this beat: the next thing the set has. */
  private advance(beat: number): void {
    if (this.state !== 'fighting') return;
    const step = this.director.next();
    this.threats = this.threats.filter(t => t.at + t.lasts > this.clock - 1000);
    const prompt = promptFor(step);
    if (prompt && !this.prompted.has(prompt.key)) {
      this.prompted.add(prompt.key);
      const t0 = this.beatTime(beat);
      const first = step.kind === 'attack' ? timeAttack(step.attack).hazards[0] : null;
      this.prompt = {
        key: prompt.key, countFrom: t0 + prompt.countFrom, from: t0 + prompt.from, to: t0 + prompt.to,
        needsTarget: prompt.meet === null,
        lane: first && first.lane !== 'both' ? this.director.ringLane(first.lane, this.ctx.player.currentFloor) : null,
      };
    }
    if (step.kind === 'open') this.overload(beat, step.beats);
    else this.play(step.attack, beat, this.ctx.player.currentFloor);
    const next = beat + stepBeats(step);
    this.stepAt(next, () => this.advance(next));
  }

  private play(attack: Attack, b: number, roachLane: Lane): void {
    const t0 = this.beatTime(b);
    for (const h of timeAttack(attack).hazards) {
      const lane = h.lane === 'both' ? 'both' : this.director.ringLane(h.lane, roachLane);
      this.threats.push({ kind: h.kind, lane, cue: t0 + h.cue, fire: t0 + h.fire, at: t0 + h.t, lasts: h.lasts, parry: h.parry });
      const beat = b + h.t / BEAT_MS;
      if (Number.isInteger(beat)) this.dueBeats.add(beat);
    }
    switch (attack.kind) {
      case 'rest':
        break;
      case 'rings':
        attack.lanes.forEach((rel, i) => {
          const cue = b + i * attack.spacing;
          this.ring(this.director.ringLane(rel, roachLane), cue, cue + RING_CHARGE_BEATS);
        });
        break;
      case 'burst':
        this.shriek(attack.lane, b, b + RING_CHARGE_BEATS);
        for (let i = 0; i < attack.count; i++) this.ring(attack.lane, b, b + RING_CHARGE_BEATS + i);
        break;
      case 'records':
        attack.lanes.forEach((rel, i) => this.record(resolve(rel, roachLane), b + i * attack.spacing, attack.travel));
        break;
      case 'lights':
        attack.lanes.forEach((rel, i) => {
          const flash = b + (i + 1) * attack.beat;
          this.spot(resolve(rel, roachLane), flash, attack.beat, i, i === attack.lanes.length - 1);
        });
        break;
      case 'drop':
        this.drop(b, attack.travel, attack.build, attack.waves);
        break;
    }
  }

  // ── Rings ─────────────────────────────────────────────────────────

  /** From the cue its speaker charges, its cone glowing, and he points at it; on the fire beat it blasts the ring. */
  private ring(lane: Lane, cueBeat: number, fireBeat: number): void {
    const spk = this.speakers[lane];
    this.stepAt(cueBeat, () => {
      if (spk.wrecked) return;
      spk.chargeUntil = Math.max(spk.chargeUntil, this.beatTime(fireBeat));
      this.ctx.audio.playSfx(SFX.charge, 0.4);
      // His arm goes to the lane at the cue and holds there until it fires
      this.playDj(`point-${lane}`, this.clock, null);
    });
    const blastAt = this.hitStart('speaker-blast', fireBeat);
    this.stepAtMs(blastAt, () => { if (!spk.wrecked) this.setSpeaker(lane, 'speaker-blast', blastAt); });
    this.stepAt(fireBeat, () => {
      if (spk.wrecked) return;
      this.ctx.audio.playSfx(SFX.point, 0.3);
      if (this.djAnim.anim === `point-${lane}`) this.playDj('groove', this.clock, null);
      this.launchRing(lane, RING_TRAVEL_MS, this.beatTime(fireBeat));
    });
  }

  /** Timed from the beat it was due on (`t0`), not from when a frame got round to it: it arrives when the set says. */
  private launchRing(lane: Lane, travel: number, t0: number): void {
    const spk = this.speakers[lane];
    const x0 = spk.sprite.x - (L.speakerW / 2 + L.ringW - 4) * SPRITE_SCALE;
    const sprite = this.ctx.scene.add.sprite(x0, this.laneY(lane), BIGOS_TEXTURE, bigosFrame('ring'))
      .setScale(SPRITE_SCALE).setDepth(DEPTH.PICKUPS + 1);
    this.movers.push({ kind: 'ring', sprite, lane, x0, t0, speed: Math.max(1, x0 - this.holdX) / travel, resolved: false, done: false });
    this.ctx.scene.cameras.main.shake(SHAKE_MS, SHAKE);
    this.ctx.audio.playSfx(SFX.blast, 0.7);
  }

  /** A speaker hit too often shrieks (its own frames: juddering, glaring, squealing), a word over it, then three rings
   * down its lane. */
  private shriek(lane: Lane, cueBeat: number, fireBeat: number): void {
    const spk = this.speakers[lane];
    this.stepAt(cueBeat, () => {
      if (spk.wrecked) return;
      spk.shriekUntil = this.beatTime(fireBeat);
      this.ctx.audio.playSfx(SFX.shriek, 0.8, 1.6);
      this.popupAt(spk.sprite.x - L.speakerW * SPRITE_SCALE, this.laneY(lane) - (L.speakerH / 2) * SPRITE_SCALE, 'SPRZĘŻENIE!', '#ff6ad5', 12);
    });
  }

  // ── Records ───────────────────────────────────────────────────────

  /**
   * A record marks no lane: its warning is on him. A beat ahead it appears in his glove with a flare and glows, his arm
   * already aimed at its lane (up for the top, down low for the bottom); on the beat it leaves his hand in a burst and
   * a streak, and flies out of the lane's speaker front, trailing violet.
   */
  private record(lane: Lane, cueBeat: number, travel: number): void {
    const release = cueBeat + RECORD_WINDUP_BEATS;
    this.stepAt(cueBeat, () => {
      this.playDj(`point-${lane}`, this.clock, null);
      this.raiseRecord();
    });
    this.stepAt(release, () => {
      const hand = this.glove();
      this.dropRecord();
      this.playDj('groove', this.clock, null);
      glint(this.ctx.scene, hand.x, hand.y, RECORD_GLOW, 24, 300);
      sparkBurst(this.ctx.scene, hand.x, hand.y, RECORD_GLOW, 10, -1, 52);
      const x0 = this.speakers[lane].sprite.x - (L.speakerW / 2) * SPRITE_SCALE;
      const y0 = this.laneY(lane) - RECORD_HEIGHT;
      this.streak(hand, { x: x0, y: y0 });
      const sprite = this.ctx.scene.add.sprite(x0, y0, BIGOS_TEXTURE, bigosFrame('record'))
        .setScale(SPRITE_SCALE).setDepth(DEPTH.PICKUPS + 1);
      const trail = new Trail(this.ctx.scene, RECORD_TRAIL.color, RECORD_TRAIL.ms, RECORD_TRAIL.size, DEPTH.PICKUPS);
      this.movers.push({
        kind: 'record', sprite, lane, x0, t0: this.beatTime(release), speed: Math.max(1, x0 - this.holdX) / travel, resolved: false, done: false, trail,
      });
      this.ctx.audio.playSfx(SFX.throw, 0.5);
    });
  }

  /** Where his near glove is now, in the world: from the rig's wrist in the frame he is drawn in. */
  private glove(): { x: number; y: number } {
    const anim = this.djAnim.anim;
    const rows = anim in BIGOS_HAND ? BIGOS_HAND[anim as keyof typeof BIGOS_HAND] : BIGOS_HAND.groove;
    const wrist = rows[Math.min(this.frameIndex, rows.length - 1)];
    return {
      x: this.dj.x + (wrist.x + BIGOS_GLOVE.x) * SPRITE_SCALE,
      y: this.ctx.floorBottomY + (wrist.y + BIGOS_GLOVE.y) * SPRITE_SCALE,
    };
  }

  private raiseRecord(): void {
    this.dropRecord();
    const { scene } = this.ctx;
    const at = this.glove();
    const sprite = scene.add.sprite(at.x, at.y, BIGOS_TEXTURE, bigosFrame('record')).setScale(SPRITE_SCALE)
      .setDepth(DEPTH.OBSTACLES + 1);
    this.held = { sprite, halo: new Halo(scene, RECORD_GLOW, DEPTH.OBSTACLES + 0.8), since: this.clock };
    glint(scene, at.x, at.y, RECORD_GLOW, 20, 300);
    this.ctx.audio.playSfx(SFX.point, 0.25);
  }

  /** The record in his hand follows his glove, spins, swells and glows brighter as the beat to throw it comes. */
  private drawHeld(): void {
    const held = this.held;
    if (!held) return;
    const at = this.glove();
    const k = Phaser.Math.Clamp((this.clock - held.since) / BEAT_MS, 0, 1);
    const spin = BIGOS_ANIMS.record;
    held.sprite.setPosition(Math.round(at.x), Math.round(at.y))
      .setFrame(bigosFrame('record', Math.floor(this.clock * spin.fps / 1000) % spin.frames));
    held.sprite.setScale(SPRITE_SCALE * (1 + 0.25 * k));
    held.halo.show(at.x, at.y, 26 + 14 * k + 3 * Math.sin(this.clock / 45), 0.5 + 0.5 * k);
  }

  private dropRecord(): void {
    this.held?.sprite.destroy();
    this.held?.halo.destroy();
    this.held = null;
  }

  /** A quick line of blocks from his hand to where the record comes out, fading: the throw, seen. */
  private streak(from: { x: number; y: number }, to: { x: number; y: number }): void {
    const { scene } = this.ctx;
    const g = scene.add.graphics().setDepth(DEPTH.PICKUPS + 1);
    const steps = Math.max(2, Math.floor(Math.hypot(to.x - from.x, to.y - from.y) / 8));
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const size = Math.round(Phaser.Math.Linear(10, 4, f) / SPRITE_SCALE) * SPRITE_SCALE;
      g.fillStyle(RECORD_GLOW, 0.5 + 0.4 * (1 - f)).fillRect(
        Math.round(Phaser.Math.Linear(from.x, to.x, f) / SPRITE_SCALE) * SPRITE_SCALE - size / 2,
        Math.round(Phaser.Math.Linear(from.y, to.y, f) / SPRITE_SCALE) * SPRITE_SCALE - size / 2, size, size);
    }
    scene.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
  }

  // ── Lights ────────────────────────────────────────────────────────

  /** `cueBeats` ahead the ball turns to the lane and the lane is marked (the light covers all of it); then it flashes. */
  private spot(lane: Lane, flashBeat: number, cueBeats: number, index: number, last: boolean): void {
    const flashAt = this.beatTime(flashBeat);
    const cueAt = flashAt - cueBeats * BEAT_MS;
    this.stepAtMs(cueAt, () => {
      this.zoneMarks.push({ lane, from: cueAt, kill: flashAt, until: flashAt + LIGHT_MS });
      this.flashes.push({ lane, at: flashAt, hit: false });
    });
    // The ball turns to it once the light before has flashed (it is shown on the lane from the cue)
    const turnAt = cueAt + (index > 0 ? LIGHT_MS : 0);
    this.stepAtMs(turnAt, () => this.playDj(`beam-${lane}-windup`, turnAt, null));
    this.stepAtMs(flashAt, () => {
      this.playDj(`beam-${lane}-loop`, flashAt, null);
      this.ctx.audio.playSfx(SFX.beam, 0.35);
      this.ctx.scene.cameras.main.shake(SHAKE_MS / 2, SHAKE / 2);
    });
    if (last) {
      this.stepAtMs(flashAt + BEAT_MS, () => {
        if (this.djAnim.anim === `beam-${lane}-loop`) this.playDj(`beam-${lane}-release`, this.clock, 'groove');
      });
    }
  }

  // ── The bass drop ─────────────────────────────────────────────────

  /**
   * The build, played by the scene and not by words, two beats (three the first time): the speakers swell and shake
   * harder every beat with their cones glowing brighter, his arms go up, the screen dims, the pips fill toward it and a
   * riser climbs in pitch. Then a wave front leaves the speakers' line on both lanes at once, side by side (from a
   * wrecked speaker too: the drop is his whole system), and travels at the roach. No lane is marked: it closes only
   * where its front is. With more waves the build plays again, shorter, from the moment each one reaches the roach.
   */
  private drop(b: number, travel: number, build: number, waves: number): void {
    let from = this.beatTime(b);
    let fire = this.beatTime(b + build);
    for (let w = 0; w < waves; w++) {
      this.dropWave(from, fire, travel, w === 0);
      from = fire + travel;
      fire = from + DROP_WAVE_BREAK_MS;
    }
  }

  /** One wave: its build from `from` (the speakers charging, the riser on every beat of it), its fronts at `fire`. */
  private dropWave(from: number, fire: number, travel: number, first: boolean): void {
    this.stepAtMs(from, () => {
      this.dropBuild = { from, to: fire };
      this.playDj('drop-windup', from, null);
    });
    const beats = Math.max(1, Math.round((fire - from) / BEAT_MS));
    for (let k = 0; k < beats; k++) {
      this.stepAtMs(from + k * BEAT_MS, () => {
        const p = (k + 1) / beats;
        this.ctx.audio.playSfx(SFX.charge, 0.35 + 0.35 * p, (first ? 0.7 : 1) + 0.9 * p);
        this.ctx.scene.cameras.main.shake(140, 0.002 + 0.006 * p);
      });
    }
    const slam = fire - (BIGOS_HIT.drop ?? 0) * 1000 / BIGOS_ANIMS.drop.fps;
    this.stepAtMs(slam, () => this.playDj('drop', slam, 'groove'));
    for (const lane of ['top', 'bottom'] as Lane[]) {
      const spk = this.speakers[lane];
      const blastAt = fire - (BIGOS_HIT['speaker-blast'] ?? 0) * 1000 / BIGOS_ANIMS['speaker-blast'].fps;
      this.stepAtMs(blastAt, () => { if (!spk.wrecked) this.setSpeaker(lane, 'speaker-blast', blastAt); });
    }
    this.stepAtMs(fire, () => {
      this.dropBuild = null;
      this.ctx.scene.cameras.main.shake(SHAKE_MS * 2, SHAKE * 2);
      this.ctx.audio.playSfx(SFX.blast, 0.8);
      this.ctx.audio.playSfx(SFX.beam, 0.5);
      const twins: Mover[] = [];
      for (const lane of ['top', 'bottom'] as Lane[]) twins.push(this.launchFront(lane, travel, fire, twins));
    });
  }

  /** Where the speakers' fronts stand (wrecked or not): where a drop's fronts leave from. */
  private get speakerLine(): number {
    return this.dj.x + L.boothLeft * SPRITE_SCALE - SPEAKER_GAP - L.speakerW * SPRITE_SCALE;
  }

  /** A drop's front on one lane: a band of light FRONT_PX wide behind a leading ring, reaching the roach `travel` after
   * it leaves (timed from its beat, `t0`). */
  private launchFront(lane: Lane, travel: number, t0: number, twins: Mover[]): Mover {
    const { scene } = this.ctx;
    const x0 = this.speakerLine;
    const band = scene.add.tileSprite(x0, this.beamY(lane), 1, L.stripH, BIGOS_TEXTURE, bigosFrame('strip'))
      .setOrigin(0, 0.5).setScale(SPRITE_SCALE).setDepth(DEPTH.PICKUPS + 1);
    const cap = scene.add.sprite(x0, this.beamY(lane), BIGOS_TEXTURE, bigosFrame('front'))
      .setScale(SPRITE_SCALE).setDepth(DEPTH.PICKUPS + 1.25);
    const sprite = scene.add.sprite(x0, this.laneY(lane), BIGOS_TEXTURE, bigosFrame('ring'))
      .setScale(SPRITE_SCALE).setDepth(DEPTH.PICKUPS + 1.5);
    const m: Mover = {
      kind: 'front', sprite, band, cap, lane, x0, t0, speed: Math.max(1, x0 - this.holdX) / travel, resolved: false, done: false, twins,
      arriveAt: t0 + travel,
    };
    this.movers.push(m);
    sparkBurst(scene, x0, this.laneY(lane) - 20, 0x7fe0ff, 8, -1, 50);
    return m;
  }

  /** A front, drawn where it is: the band from its leading edge back FRONT_PX, never behind the speakers' line, its crest
   * on the leading edge. */
  private drawFront(m: Mover, lead: number): void {
    if (!m.band || !m.sprite) return;
    const tail = Math.min(lead + FRONT_PX, m.x0);
    const stripFrame = Math.floor(this.clock * BIGOS_ANIMS.strip.fps / 1000) % BIGOS_ANIMS.strip.frames;
    m.band.setPosition(lead, this.beamY(m.lane)).setSize(Math.max(1, Math.ceil((tail - lead) / SPRITE_SCALE)), L.stripH)
      .setFrame(bigosFrame('strip', stripFrame));
    m.cap?.setPosition(lead, this.beamY(m.lane)).setFrame(bigosFrame('front', stripFrame));
    m.sprite.setPosition(lead, this.laneY(m.lane))
      .setFrame(bigosFrame('ring', Math.floor(this.clock * BIGOS_ANIMS.ring.fps / 1000) % BIGOS_ANIMS.ring.frames));
  }

  /** The front's band runs at the roach's height, where the light strips do. */
  private beamY(lane: Lane): number {
    return this.ctx.floorBottomY + (lane === 'top' ? L.beamTop : L.beamBottom) * SPRITE_SCALE;
  }

  /** A front bounced: back it goes into what stands on its lane (or into him), its twin collapses, he overloads. */
  private bounce(m: Mover): void {
    const lane = this.ctx.player.currentFloor;
    for (const twin of m.twins ?? []) {
      if (twin === m || twin.done) continue;
      twin.resolved = true;
      if (twin.sprite) sparkBurst(this.ctx.scene, twin.sprite.x, twin.sprite.y - 20, 0x7fe0ff, 10, 1, 50);
      this.endMover(twin);
    }
    this.director.dropBounced();
    // Bounced at the last moment: worth more, and said so
    const late = m.arriveAt !== undefined && this.clock >= m.arriveAt - DROP_TIGHT_MS;
    m.damage = PARRY_DAMAGE + (late ? DROP_TIGHT_BONUS : 0);
    if (late) {
      this.ctx.audio.playSfx(SFX.closeCall, 0.6);
      this.popup('NA STYK!', '#7fe0ff', 14);
    }
    const target = this.director.parryTarget(lane);
    // Off a wrecked speaker's lane it flies into him: the speaker left takes it, it is his system
    const into = this.director.phase === 1 && this.director.wrecked(lane)
      ? { x: this.dj.x + (L.boothLeft * SPRITE_SCALE) / 2, y: this.laneY(lane) - (L.speakerH / 2) * SPRITE_SCALE }
      : undefined;
    this.sendBack(m, target, into);
  }

  // ── The overload ──────────────────────────────────────────────────

  /** A drop bounced back: his system overloads, red hot, and knocks him silly for a few beats; nothing comes. Lunges
   * count double. */
  private overload(b: number, beats: number): void {
    this.stepAt(b, () => {
      this.playDj('stunned', this.beatTime(b), null);
      for (const lane of ['top', 'bottom'] as Lane[]) this.setSpeaker(lane, 'speaker-overload');
      this.ctx.audio.playSfx(SFX.overload, 0.7);
      this.popupAt(this.stripLeft, this.ctx.floorBottomY + (L.ballY - L.ballR) * SPRITE_SCALE - 30, 'PRZECIĄŻENIE! x2', '#ff9a3c', 12);
    });
    this.stepAt(b + beats, () => {
      this.playDj('groove', this.clock, null);
      for (const lane of ['top', 'bottom'] as Lane[]) this.setSpeaker(lane, 'speaker-thump');
    });
  }

  // ── Every hazard reaching the roach ───────────────────────────────

  /** Whether the roach is on this lane: pressed for it and drawn on it, so a hit is never on a lane it visibly left. */
  private onLane(lane: Lane): boolean {
    const { player, floorTopY, floorBottomY } = this.ctx;
    const drawn: Lane = player.sprite.y < (floorTopY + floorBottomY) / 2 ? 'top' : 'bottom';
    return player.currentFloor === lane && drawn === lane;
  }

  private moverX(m: Mover): number { return m.x0 - (this.clock - m.t0) * m.speed; }

  private updateMovers(): void {
    const cam = this.ctx.scene.cameras.main;
    const roachX = this.ctx.player.sprite.x;
    for (const m of this.movers) {
      if (m.done) continue;
      if (m.back) {
        this.flyBack(m);
        continue;
      }
      const age = this.clock - m.t0;
      const x = this.moverX(m);
      if (m.kind === 'front') {
        this.drawFront(m, x);
        if (!m.resolved) {
          const { player } = this.ctx;
          // Both lanes carry one, so the lane pressed is the lane it meets; a dash touching it bounces it, and it only
          // hits once it has run DROP_GRACE_MS into a roach that is not dashing
          const here = player.currentFloor === m.lane;
          if (here && player.isDashing && x <= roachX) {
            m.resolved = true;
            this.bounce(m);
            continue;
          }
          if (x <= roachX - DROP_GRACE_MS * m.speed) {
            m.resolved = true;
            if (here && !player.isDashing) {
              this.struck('drop', m.cap ? [m.band!, m.cap, m.sprite!] : [m.band!, m.sprite!]);
              if (this.over || this.hitStop) return;
            }
          }
        }
        if (x + FRONT_PX < cam.scrollX - 20) this.endMover(m);
        continue;
      }
      if (m.sprite) {
        m.sprite.x = x;
        m.trail?.push(m.sprite.x, m.sprite.y);
        const anim: BigosAnim = m.kind === 'record' ? 'record' : 'ring';
        const spec = BIGOS_ANIMS[anim];
        m.sprite.setFrame(bigosFrame(anim, Math.floor(age * spec.fps / 1000) % spec.frames));
      }
      if (!m.resolved && x <= roachX) {
        m.resolved = true;
        this.reach(m);
        if (this.over || this.hitStop) return;
        if (m.back) continue;
      }
      if (x < cam.scrollX - 80) this.endMover(m);
    }
    this.movers = this.movers.filter(m => !m.done);
  }

  private endMover(m: Mover): void {
    m.sprite?.destroy();
    m.band?.destroy();
    m.band = undefined;
    m.cap?.destroy();
    m.cap = undefined;
    m.trail?.destroy();
    m.sprite = null;
    m.trail = undefined;
    m.done = true;
  }

  private reach(m: Mover): void {
    const { player } = this.ctx;
    const lane = player.currentFloor;
    if (!this.onLane(m.lane)) {
      this.dodged(m.lane);
      return;
    }
    if (!player.isDashing) {
      this.struck(m.kind === 'record' ? 'record' : 'ring', m.sprite ? [m.sprite] : []);
      return;
    }
    // Met on the lunge: sent straight back into his system
    const target = this.director.parryTarget(lane);
    this.sendBack(m, target);
  }

  private dodged(lane: Lane): void {
    const { scene, audio, player } = this.ctx;
    const hop = player.lastHop;
    const close = hop !== null && hop.from === lane && scene.time.now - hop.at <= CLOSE_CALL_MS;
    if (close) audio.playSfx(SFX.closeCall, 0.6);
    this.score(close ? DODGE_SCORE + NEAR_MISS_SCORE : DODGE_SCORE, close ? 'NA STYK!' : '', close ? '#7fe0ff' : '#ffdd00');
  }

  /** What a thing sent back flies at: the middle of the speaker, or the ball. */
  private targetPoint(target: Target): { x: number; y: number } {
    if (target === 'ball') return { x: this.dj.x + L.ballX * SPRITE_SCALE, y: this.ctx.floorBottomY + L.ballY * SPRITE_SCALE };
    const spk = this.speakers[target];
    return { x: spk.sprite.x, y: this.laneY(target) - (L.speakerH / 2) * SPRITE_SCALE };
  }

  /** Sent back into `target` (flying at `into` when given, else at the target itself). */
  private sendBack(m: Mover, target: Target, into?: { x: number; y: number }): void {
    const { scene, audio } = this.ctx;
    m.trail?.destroy();
    m.trail = new Trail(scene, 0x7fe0ff, 220, 12, DEPTH.PICKUPS);
    const x = m.sprite?.x ?? this.ctx.player.sprite.x;
    const y = m.sprite?.y ?? this.laneY(m.lane);
    m.back = { x, y, t0: this.clock, target, to: into ?? this.targetPoint(target) };
    // A front's band now trails behind its ring as it flies back; its crest is spent
    m.band?.setOrigin(1, 0.5);
    m.cap?.destroy();
    m.cap = undefined;
    glint(scene, x, y - 20, 0x7fe0ff, 26, 260);
    audio.playSfx(SFX.parry, 0.7);
  }

  private flyBack(m: Mover): void {
    const back = m.back!;
    const k = Math.min(1, (this.clock - back.t0) / RETURN_MS);
    const to = back.to;
    if (m.sprite) {
      m.sprite.setPosition(Phaser.Math.Linear(back.x, to.x, k), Phaser.Math.Linear(back.y, to.y + (m.kind === 'record' ? 0 : 20), k));
      // A front's band rides back with its ring, shrinking into it
      m.band?.setPosition(m.sprite.x, m.sprite.y - (this.laneY(m.lane) - this.beamY(m.lane)))
        .setSize(Math.max(1, Math.ceil(FRONT_PX * (1 - k) / SPRITE_SCALE)), L.stripH);
      // A ring or a front sent back is the ring turned round, flying home white-hot
      const anim: BigosAnim = m.kind === 'record' ? 'record' : 'ring-back';
      m.sprite.setFrame(bigosFrame(anim, Math.floor(this.clock * BIGOS_ANIMS[anim].fps / 1000) % BIGOS_ANIMS[anim].frames));
      m.trail?.push(m.sprite.x, m.sprite.y);
    }
    if (k < 1) return;
    const sprite = m.sprite;
    m.sprite = null;
    this.endMover(m);
    if (m.kind === 'record' && sprite) this.shatter(sprite);
    else sprite?.destroy();
    this.hit(back.target, m.damage ?? PARRY_DAMAGE, true);
  }

  /** A record sent back breaks on what it hits. */
  private shatter(sprite: Phaser.GameObjects.Sprite): void {
    let i = 0;
    const step = () => {
      if (!sprite.active) return;
      if (i >= BIGOS_ANIMS['record-shatter'].frames) { sprite.destroy(); return; }
      sprite.setFrame(bigosFrame('record-shatter', i++));
      this.atMs(this.clock + 1000 / BIGOS_ANIMS['record-shatter'].fps, step);
    };
    step();
  }

  private checkFlashes(): void {
    const { player } = this.ctx;
    for (const f of this.flashes) {
      if (this.clock < f.at || this.clock > f.at + LIGHT_MS || f.hit) continue;
      if (!this.onLane(f.lane) || player.isDashing) continue;
      f.hit = true;
      this.struck('light', [this.strips[f.lane]]);
      return;
    }
    // A flash over without a hit is a dodge
    for (const f of this.flashes.filter(f => this.clock > f.at + LIGHT_MS)) {
      if (!f.hit && f.lane === other(player.currentFloor)) this.score(DODGE_SCORE, '', '#ffdd00');
    }
    this.flashes = this.flashes.filter(f => this.clock <= f.at + LIGHT_MS);
  }

  /** The roach is hit: everything holds a moment on the impact, then the death plays at once with the culprit still
   * flashing over it, so its cause reads; a moult takes it and goes on. */
  private struck(cause: BigosCause, culprit: Phaser.GameObjects.Components.Alpha[]): void {
    const { player, scene, audio } = this.ctx;
    if (player.inMoultGrace) return;
    const moulted = this.ctx.survivesHit();
    this.breakCombo();
    audio.playSfx(SFX.hit, 0.8);
    scene.cameras.main.shake(SHAKE_MS * 2, SHAKE * 2);
    this.hitStop = { until: scene.time.now + (moulted ? MOULT_STOP_MS : HIT_STOP_MS), culprit, deadly: !moulted };
    this.hideKeycap();
    if (!moulted) {
      scene.registry.set(BIGOS_CAUSE_KEY, cause);
      this.popup({ ring: 'FALA!', drop: 'BAS!', record: 'PŁYTA!', light: 'ŚWIATŁO!' }[cause], '#ff3b6b', 16);
    }
  }

  /** Runs the hit-stop out: true while it holds the fight. */
  private holdHitStop(): boolean {
    const stop = this.hitStop;
    if (!stop) return false;
    const now = this.ctx.scene.time.now;
    const on = Math.floor(now / 80) % 2 === 0;
    for (const c of stop.culprit) c.setAlpha(on ? 1 : 0.15);
    if (now < stop.until) return true;
    for (const c of stop.culprit) c.setAlpha(1);
    this.hitStop = null;
    if (stop.deadly) {
      this.keepFlashing(stop.culprit);
      this.lose('bigos');
      return true;
    }
    this.lastNow = now;
    return false;
  }

  /**
   * What killed the roach outlives the fight's teardown by CULPRIT_BLINK_MS, flashing over the death. On real time:
   * the death slows the scene's clock.
   */
  private keepFlashing(culprit: Phaser.GameObjects.Components.Alpha[]): void {
    const objects = culprit as unknown as Phaser.GameObjects.GameObject[];
    for (const obj of objects) this.orphans.add(obj);
    // A mover that hit it leaves the fight's hands, so taking the fight down does not take it away
    this.movers = this.movers.filter(m => {
      const owned = (m.sprite && this.orphans.has(m.sprite)) || (m.band && this.orphans.has(m.band)) || (m.cap && this.orphans.has(m.cap));
      if (owned) m.trail?.destroy();
      return !owned;
    });
    const started = Date.now();
    const timer = window.setInterval(() => {
      const left = Date.now() - started;
      for (const c of culprit) {
        if (!(c as unknown as Phaser.GameObjects.GameObject).active) continue;
        c.setAlpha(left >= CULPRIT_BLINK_MS ? 1 : Math.floor(left / BLINK_STEP_MS) % 2 === 0 ? 0.15 : 1);
      }
      if (left < CULPRIT_BLINK_MS) return;
      window.clearInterval(timer);
      for (const obj of objects) obj.destroy();
    }, BLINK_STEP_MS / 2);
  }

  // ── Hitting him ───────────────────────────────────────────────────

  /** A hit on his system lands: the bar, the target cracking and flashing, the fight holding still a moment, the combo. */
  private hit(target: Target, base: number, parry: boolean): void {
    if (this.state !== 'fighting') return;
    const result = this.director.hit(target, base);
    if (result.dealt <= 0) return;
    const { scene, audio } = this.ctx;
    this.ctx.updateBar(this.director.remaining);
    this.combo++;
    const at = this.targetPoint(target);
    this.popupAt(at.x, at.y - 30, `-${result.dealt}`, parry ? '#7fe0ff' : '#ffb070', parry ? 16 : 12);
    this.score(parry ? PARRY_SCORE : HIT_SCORE, parry ? 'ODBITA!' : '', parry ? '#7fe0ff' : '#ffdd00', false);
    sparkBurst(scene, at.x, at.y, HOT_GLOW, parry ? 14 : 8, 1, parry ? 60 : 40);
    if (target === 'ball') {
      glint(scene, at.x, at.y, 0xffffff, parry ? 34 : 22, 260);
    } else {
      const spk = this.speakers[target];
      spk.flashUntil = this.clock + FLASH_MS;
      spk.wobbleAt = this.clock;
    }
    if (parry || target === 'ball') this.playDj('hurt', this.clock, 'groove');
    audio.playSfx(parry ? SFX.hurt : SFX.lunge, parry ? 0.8 : 0.5);
    scene.cameras.main.shake(parry ? SHAKE_MS : SHAKE_MS / 2, parry ? SHAKE : SHAKE / 2);
    this.freeze(parry ? FREEZE_PARRY_MS : FREEZE_HIT_MS);
    if (result.won) this.defeat();
    else if (result.wrecked) this.wreck(result.wrecked as Lane, result.cranked);
  }

  /** A speaker gone: the stage clears, it blows up in its breaking frames, he reels, and the next phase after a breather. */
  private wreck(lane: Lane, cranked: boolean): void {
    const { scene, audio } = this.ctx;
    this.gen++;
    this.clearHazards();
    this.freeze(FREEZE_WRECK_MS);
    const spk = this.speakers[lane];
    spk.wrecked = true;
    this.setSpeaker(lane, 'speaker-broken');
    // An overload in progress ends with the phase
    this.setSpeaker(other(lane), 'speaker-thump');
    const at = this.targetPoint(lane);
    glint(scene, at.x, at.y, HOT_GLOW, 40, 420);
    sparkBurst(scene, at.x, at.y, HOT_GLOW, 18, -1, 80);
    sparkBurst(scene, at.x, at.y, 0xffffff, 8, 1, 60);
    getFx(scene).burst('smoke', at.x, at.y - 20, 4, 16, { depth: DEPTH.OBSTACLES + 1, speed: [20, 60], angle: [240, 300], life: 900 });
    scene.cameras.main.shake(SHAKE_MS * 3, SHAKE * 2.5);
    audio.playSfx(SFX.wreck, 0.9);
    audio.playSfx(SFX.hurt, 0.7);
    this.playDj('hurt', this.clock, 'groove');
    this.popupAt(at.x, at.y - 50, 'ROZWALONY!', '#ff9a3c', 18);
    if (cranked) {
      // He cranks the one left back up: its lamps refill
      const left = this.targetPoint(other(lane));
      glint(scene, left.x, left.y, CHARGE_GLOW, 30, 360);
      this.popupAt(left.x, left.y - 50, 'GŁOŚNIEJ!', '#ff6ad5', 12);
    }
    this.score(WRECK_SCORE, '', '#ff9a3c');
    const next = Math.ceil(this.beatNow) + WRECK_BEATS;
    this.stepAt(next, () => this.advance(next));
  }

  /** The fight holds still this long: everything but the roach's dash timer, which waits with it. */
  private freeze(ms: number): void {
    this.freezeUntil = Math.max(this.freezeUntil, this.ctx.scene.time.now + ms);
  }

  private get multiplier(): number { return Math.min(COMBO_MAX_MULT, 1 + Math.floor(this.combo / COMBO_STEP)); }

  private breakCombo(): void {
    this.combo = 0;
  }

  // ── The dash ──────────────────────────────────────────────────────

  dash(): void {
    const { player } = this.ctx;
    if (this.lunge || this.hitStop || !player.dashReady || player.isDashing) return;
    player.startDash();
    this.prompt = null;
    this.hideKeycap();
    this.lunge = { t0: this.clock, reach: this.lungeEnd(player.currentFloor) - this.holdX, arrived: false };
  }

  /** Where a lunge down this lane stops: at what it can hit, else at the wreck or the booth it bonks into. */
  private lungeEnd(lane: Lane): number {
    const target = this.director.lungeTarget(lane);
    if (target === 'ball') return this.dj.x + (L.ballX - L.ballR) * SPRITE_SCALE - LUNGE_SHORT;
    if (this.director.phase === 2) return this.dj.x + L.boothLeft * SPRITE_SCALE - LUNGE_SHORT;
    return this.speakers[lane].sprite.x - (L.speakerW / 2) * SPRITE_SCALE - LUNGE_SHORT;
  }

  /** The roach's offset along its lunge: out and back inside the dash itself. */
  private updateLunge(): number {
    const lunge = this.lunge;
    if (!lunge) return 0;
    const t = this.clock - lunge.t0;
    if (t >= DASH_MS * LUNGE_OUT_SHARE && !lunge.arrived) {
      lunge.arrived = true;
      this.arrive();
      if (this.over) return 0;
    }
    if (t >= DASH_MS) {
      this.lunge = null;
      return 0;
    }
    return lungeOffset(t, lunge.reach);
  }

  /** The lunge reaches the end of the lane: a hit on what stands there, or a dull bonk off what is broken. */
  private arrive(): void {
    const { player, audio, scene } = this.ctx;
    const target = this.director.lungeTarget(player.currentFloor);
    if (target) {
      this.hit(target, HIT_DAMAGE, false);
      return;
    }
    audio.playSfx(SFX.bonk, 0.35);
    scene.cameras.main.shake(SHAKE_MS / 2, SHAKE / 3);
    const spk = this.speakers[player.currentFloor];
    if (this.director.phase < 2) spk.wobbleAt = this.clock;
    this.breakCombo();
  }

  // ── Defeat ────────────────────────────────────────────────────────

  private defeat(): void {
    const { scene, audio } = this.ctx;
    this.state = 'victory';
    audio.fadeOutBGM();
    this.gen++;
    this.clearHazards();
    this.freeze(FREEZE_WRECK_MS);
    const at = this.targetPoint('ball');
    glint(scene, at.x, at.y, HOT_GLOW, 44, 480);
    sparkBurst(scene, at.x, at.y, HOT_GLOW, 20, -1, 90);
    scene.cameras.main.shake(SHAKE_MS * 3, SHAKE * 2.5);
    audio.playSfx(SFX.wreck, 0.9);
    audio.playSfx(SFX.defeat, 0.7);
    this.playDj('defeat', this.clock, null);
    const ms = BIGOS_ANIMS.defeat.frames * 1000 / BIGOS_ANIMS.defeat.fps + DEFEAT_HOLD_MS;
    this.atMs(this.clock + ms, () => {
      const targets = [this.dj, this.ballDamage, this.speakers.top.sprite, this.speakers.bottom.sprite];
      this.ctx.scene.tweens.add({ targets, alpha: 0, duration: FADE_MS, onComplete: () => this.win() });
    });
  }

  private clearHazards(): void {
    // A thing on its way back still lands: it was sent before the stage cleared
    for (const m of this.movers) if (!m.back) this.endMover(m);
    this.movers = this.movers.filter(m => !m.done);
    this.dropRecord();
    this.flashes = [];
    this.threats = [];
    this.zoneMarks = [];
    this.dropBuild = null;
    this.dueBeats.clear();
    for (const lane of ['top', 'bottom'] as Lane[]) {
      this.zones[lane].hide();
      if (!this.orphans.has(this.strips[lane])) this.strips[lane].setVisible(false);
      this.speakers[lane].chargeUntil = -1;
      this.speakers[lane].shriekUntil = -1;
    }
    this.light.setVisible(false);
    this.prompt = null;
    this.hideKeycap();
  }

  // ── Every frame ───────────────────────────────────────────────────

  /** Won or lost: an event or a hit can end the fight in the middle of a frame. */
  private get over(): boolean { return this.state === 'done'; }

  update(): void {
    if (this.over) return;
    if (this.holdHitStop()) return;
    const now = this.ctx.scene.time.now;
    const step = this.lastNow === null ? 0 : Math.min(MAX_STEP_MS, Math.max(0, now - this.lastNow));
    this.lastNow = now;
    if (now < this.freezeUntil) {
      // Held on a hit: the dash's own timer waits too, so the lunge and its protection stay together
      this.ctx.player.adjustTimersForPause(step);
      return;
    }
    this.clock += this.lockedStep(step);
    const beat = Math.floor(this.beatNow);
    if (beat !== this.lastBeat) {
      this.lastBeat = beat;
      this.onBeat(beat);
    }
    while (this.events.length && this.events[0].at <= this.clock && !this.over && !this.hitStop) this.events.shift()!.fn();
    if (this.over || this.hitStop) return;
    this.place();
    if (this.stopped) {
      if (this.state === 'fighting') this.ctx.player.updateDash();
      const forward = this.updateLunge();
      if (this.over) return;
      this.holdPlayer(-forward);
      this.standRoach();
    }
    this.updateMovers();
    if (this.over || this.hitStop) return;
    this.checkFlashes();
    if (this.over || this.hitStop) return;
    this.drawFrames();
    this.drawBeat();
  }

  /** The frame's step kept on his track's beat (beatLock.ts): what a hit-stop, the pause or a hitch put between them
   * is made up a little at a time. Without his track playing, the step as it is. */
  private lockedStep(step: number): number {
    const { audio, boss } = this.ctx;
    const lock = lockStep(this.clock, step, audio.bgmPosition(boss.music), MAX_STEP_MS);
    if (lock.seekTo !== null) audio.seekBGM(boss.music, lock.seekTo);
    return lock.step;
  }

  /** Where the beam strips start: his cell's left edge. */
  private get stripLeft(): number { return this.dj.x + L.cellLeft * SPRITE_SCALE; }

  /** Everything stands on the screen, not in the world, until the camera stops with the roach. */
  private place(): void {
    const cam = this.ctx.scene.cameras.main;
    const djX = cam.scrollX + cam.width - RIGHT_MARGIN;
    this.dj.x = djX;
    this.light.x = djX;
    this.ballDamage.x = djX;
    const spkX = djX + L.boothLeft * SPRITE_SCALE - SPEAKER_GAP - (L.speakerW / 2) * SPRITE_SCALE;
    const drop = Math.min(1, this.clock / DROP_IN_MS);
    for (const spk of Object.values(this.speakers)) {
      const since = this.clock - spk.wobbleAt;
      const wobble = since < WOBBLE_MS ? Math.round(Math.sin(since / WOBBLE_MS * Math.PI * 3) * WOBBLE_PX * (1 - since / WOBBLE_MS)) : 0;
      // The drop's build shakes them harder every beat (a shrieking one judders in its own frames)
      const k = this.buildK;
      const shake = k > 0 ? Math.round((Math.sin(this.clock / 23 + (spk.lane === 'top' ? 0 : 2)) * DROP_SHAKE_PX * k * k) / 2) * 2 : 0;
      spk.sprite.x = spkX + wobble + shake;
      const fall = drop < 1 ? Phaser.Math.Easing.Bounce.Out(drop) : 1;
      const wasUp = spk.sprite.y < this.laneY(spk.lane);
      spk.sprite.y = this.laneY(spk.lane) - DROP_FROM * (1 - fall);
      if (wasUp && drop >= 1) this.ctx.audio.playSfx(SFX.land, 0.4);
    }
    for (const lane of ['top', 'bottom'] as Lane[]) {
      const strip = this.strips[lane];
      strip.x = this.stripLeft;
      strip.y = this.beamY(lane);
    }
  }

  /** The strip on a lane covering from `x` to his cell, whole tiles. */
  private sizeStrip(lane: Lane, x: number): void {
    const strip = this.strips[lane];
    const width = Math.max(1, Math.ceil((this.stripLeft - x) / SPRITE_SCALE));
    if (strip.width !== width) strip.setSize(width, L.stripH);
  }

  private drawFrames(): void {
    const { anim, start, then } = this.djAnim;
    const spec = BIGOS_ANIMS[anim];
    let index: number;
    if (spec.loop) {
      index = Math.floor(this.clock * spec.fps / 1000) % spec.frames;
    } else {
      index = Math.floor((this.clock - start) * spec.fps / 1000);
      if (index >= spec.frames && then) {
        this.djAnim = { anim: then, start: this.clock, then: null };
        this.drawFrames();
        return;
      }
      index = Math.max(0, Math.min(index, spec.frames - 1));
    }
    this.dj.setFrame(bigosFrame(anim, index));
    this.frameIndex = index;
    this.drawBallDamage(anim, index);
    this.drawHeld();
    this.drawLights(index);
    for (const spk of Object.values(this.speakers)) this.drawSpeaker(spk);
    this.drawBall();
  }

  /** The lights on the lanes: the kill zone where one is coming and on its flash, the strip on its flash, the cone
   * from the ball over him. */
  private drawLights(djIndex: number): void {
    const cam = this.ctx.scene.cameras.main;
    this.zoneMarks = this.zoneMarks.filter(z => this.clock < z.until);
    const stripFrame = Math.floor(this.clock * BIGOS_ANIMS.strip.fps / 1000) % BIGOS_ANIMS.strip.frames;
    let cone: Lane | null = null;
    for (const lane of ['top', 'bottom'] as Lane[]) {
      const strip = this.strips[lane];
      strip.setFrame(bigosFrame('strip', stripFrame));
      const marks = this.zoneMarks.filter(z => z.lane === lane && this.clock >= z.from && this.clock < z.until);
      if (marks.length) {
        const killing = marks.some(z => this.clock >= z.kill);
        this.zones[lane].show(this.laneY(lane), cam.scrollX, this.stripLeft, killing ? 'kill' : 'warn');
      } else this.zones[lane].hide();
      const flash = this.flashes.find(f => f.lane === lane && this.clock >= f.at && this.clock <= f.at + LIGHT_MS * 2);
      if (flash) {
        const fade = Math.max(0, (this.clock - flash.at - LIGHT_MS) / LIGHT_MS);
        this.sizeStrip(lane, cam.scrollX - SPRITE_SCALE * L.stripW);
        strip.setVisible(true).setAlpha(1 - 0.8 * fade);
        if (this.clock <= flash.at + LIGHT_MS) cone = lane;
      } else {
        strip.setVisible(false);
      }
    }
    const coneAnim = cone === 'top' ? 'beam-top-loop' : cone === 'bottom' ? 'beam-bottom-loop' : null;
    this.light.setVisible(coneAnim !== null && this.djAnim.anim === coneAnim);
    if (coneAnim && this.djAnim.anim === coneAnim) this.light.setFrame(bigosFrame(`light-${cone!}`, djIndex));
  }

  private drawSpeaker(spk: Speaker): void {
    const lane = spk.lane;
    const hp = this.director.hp[lane];
    let anim = spk.anim;
    let index: number | null = null;
    if (spk.wrecked) {
      anim = 'speaker-broken';
    } else if (this.clock < spk.flashUntil) {
      // A hit flashes it white: the first frame of its breaking
      anim = 'speaker-broken';
      index = 0;
    } else if (anim === 'speaker-blast' && (this.clock - spk.start) * BIGOS_ANIMS[anim].fps / 1000 >= BIGOS_ANIMS[anim].frames) {
      anim = spk.anim = this.director.open ? 'speaker-overload' : 'speaker-thump';
    } else if (anim !== 'speaker-blast' && anim !== 'speaker-overload') {
      anim = this.clock < spk.shriekUntil ? 'speaker-shriek' : this.clock < spk.chargeUntil ? 'speaker-charge' : 'speaker-thump';
    }
    // About to go: it thumps on split and cracked, sparking and smoking, cutting out on the beat's last quarter
    const low = !spk.wrecked && hp <= SEGMENT_HP / 3;
    if (low && anim === 'speaker-thump') anim = 'speaker-damaged';
    const spec = BIGOS_ANIMS[anim];
    if (index === null) {
      index = spec.loop
        ? Math.floor(this.clock * spec.fps / 1000) % spec.frames
        : Math.max(0, Math.min(Math.floor((this.clock - spk.start) * spec.fps / 1000), spec.frames - 1));
    }
    spk.sprite.setFrame(bigosFrame(anim, index));
    // The drop's build: it swells on every beat, a little more each time, its cone glowing brighter
    const k = this.buildK;
    const pulse = (1 - (this.beatNow % 1)) ** 2;
    const swell = 1 + DROP_SWELL * k * (0.4 + 0.6 * pulse);
    spk.sprite.setScale(SPRITE_SCALE * swell);
    const cone = (radius: number, alpha: number, color: number) => {
      spk.glow.color = color;
      spk.glow.show(spk.sprite.x + L.coneX * SPRITE_SCALE, this.laneY(lane) + L.coneY * SPRITE_SCALE * swell, radius, alpha);
    };
    if (spk.wrecked) spk.glow.hide();
    else if (k > 0) cone(14 + 26 * k + 8 * pulse * k, 0.3 + 0.7 * k, CHARGE_GLOW);
    else if (this.clock < spk.shriekUntil) cone(30 + 6 * Math.sin(this.clock / 30), 0.9, CHARGE_GLOW);
    else if (this.clock < spk.chargeUntil) {
      const left = (spk.chargeUntil - this.clock) / (RING_CHARGE_BEATS * BEAT_MS);
      cone(16 + 18 * (1 - left), 0.5 + 0.5 * (1 - left), CHARGE_GLOW);
    } else if (this.director.open) cone(26 + 4 * pulse, 0.6, HOT_GLOW);
    else spk.glow.hide();
  }

  /** The ball as the last target, laid over his frame: cracked at two thirds of its health, shedding tiles and its lights
   * dying at one third. His defeat cracks it in its own frames. */
  private drawBallDamage(anim: BigosAnim, index: number): void {
    const hp = this.director.hp.ball;
    const stage = this.director.phase !== 2 || anim === 'defeat' ? 0 : hp <= SEGMENT_HP / 3 ? 2 : hp <= (2 * SEGMENT_HP) / 3 ? 1 : 0;
    this.ballDamage.setVisible(stage > 0);
    if (stage > 0) this.ballDamage.setFrame(bigosBallFrame(stage as 1 | 2, anim, index));
  }

  /** The ball as the last target: it smokes when it is about to go. */
  private drawBall(): void {
    if (this.director.phase !== 2 || this.state !== 'fighting') return;
    if (this.director.hp.ball > SEGMENT_HP / 3 || this.clock < this.ballSmokeAt) return;
    this.ballSmokeAt = this.clock + 260;
    const at = this.targetPoint('ball');
    getFx(this.ctx.scene).play('smoke', at.x + Phaser.Math.Between(-14, 14), at.y - L.ballR * SPRITE_SCALE,
      { depth: DEPTH.OBSTACLES + 0.7, vy: -40, life: 700, fadeOut: 300 });
  }

  /** How far the drop's build has got, 0 (not building) to 1 (the beat before it falls). */
  private get buildK(): number {
    const build = this.dropBuild;
    return build && this.state === 'fighting' ? Phaser.Math.Clamp((this.clock - build.from) / (build.to - build.from), 0, 1) : 0;
  }

  /** The beat made visible off the lanes: the pips count the bar and mark the beats something lands on. */
  private drawBeat(): void {
    const cam = this.ctx.scene.cameras.main;
    const build = this.dropBuild;
    const k = this.buildK;
    const phase = this.beatNow % 1;
    const beat = Math.floor(this.beatNow);
    const strength = (1 - phase) * (1 - phase);
    // The drop's build: the screen darkens
    if (build && this.state === 'fighting') this.dim.setAlpha(DROP_DIM * k);
    else this.dim.setAlpha(Math.max(0, this.dim.alpha - 0.08));
    // Pips: four for the bar, under the boss's name; through a build they fill up toward the drop and go hot
    this.pips.clear();
    if (this.state === 'fighting') {
      const total = 4 * PIP_PX + 3 * PIP_GAP;
      const x0 = cam.width / 2 - total / 2;
      const y = cam.height - 52;
      const barStart = beat - (beat % 4);
      for (let i = 0; i < 4; i++) {
        const b = barStart + i;
        const lit = b === beat;
        const filled = !!build && b <= beat && b >= build.from / BEAT_MS;
        const due = this.dueBeats.has(b) || this.dueBeats.has(b + 4);
        this.pips.fillStyle(filled ? PIP_DUE : lit ? PIP_ON : PIP_OFF, filled || lit ? 0.6 + 0.4 * strength : 0.9)
          .fillRect(x0 + i * (PIP_PX + PIP_GAP), y, PIP_PX, PIP_PX);
        if (due) this.pips.lineStyle(2, PIP_DUE, 1).strokeRect(x0 + i * (PIP_PX + PIP_GAP) - 2, y - 2, PIP_PX + 4, PIP_PX + 4);
      }
      const mult = this.multiplier;
      this.comboText.setVisible(this.combo >= 2).setPosition(cam.width / 2, y - 16)
        .setText(mult > 1 ? `COMBO ${this.combo}  x${mult}` : `COMBO ${this.combo}`);
    } else this.comboText.setVisible(false);
    this.drawLamps();
    this.drawKeycap();
  }

  /** Each part's health, a lamp a point: on the ledge under each standing speaker, then over the ball. */
  private drawLamps(): void {
    const g = this.lamps.clear();
    if (this.state !== 'fighting') return;
    const row = (cx: number, y: number, hp: number) => {
      const width = SEGMENT_HP * (LAMP_PX + LAMP_GAP) - LAMP_GAP;
      const x = Math.round(cx - width / 2);
      g.fillStyle(0x000000, 0.6).fillRect(x - 2, y - 2, width + 4, LAMP_PX + 4);
      for (let i = 0; i < SEGMENT_HP; i++) {
        const on = i < hp;
        g.fillStyle(on ? (hp <= SEGMENT_HP / 3 ? LAMP_LOW : LAMP_ON) : LAMP_OFF, 1).fillRect(x + i * (LAMP_PX + LAMP_GAP), y, LAMP_PX, LAMP_PX);
      }
    };
    if (this.director.phase < 2) {
      for (const spk of Object.values(this.speakers)) {
        if (spk.wrecked) continue;
        row(spk.sprite.x, this.laneY(spk.lane) + LAMP_BELOW_PX, this.director.hp[spk.lane]);
      }
    } else {
      row(this.dj.x + L.ballX * SPRITE_SCALE, this.ctx.floorBottomY + (L.ballY - L.ballR) * SPRITE_SCALE - 16, this.director.hp.ball);
    }
  }

  private playDj(anim: BigosAnim, start: number, then: BigosAnim | null): void {
    if (this.state === 'victory' && anim !== 'defeat') return;
    this.djAnim = { anim, start, then };
  }

  private setSpeaker(lane: Lane, anim: BigosAnim, start = this.clock): void {
    const spk = this.speakers[lane];
    if (spk.wrecked && anim !== 'speaker-broken') return;
    spk.anim = anim;
    spk.start = start;
  }

  private laneY(lane: Lane): number { return lane === 'top' ? this.ctx.floorTopY : this.ctx.floorBottomY; }

  // ── Looks ─────────────────────────────────────────────────────────

  /** The roach stands on all six between hops: the run's legs would run on the spot. */
  private standRoach(): void {
    const { player } = this.ctx;
    const sprite = player.sprite;
    if (player.isHopping || player.isDead) return;
    const playing = sprite.anims.getName() ?? '';
    if (!this.roachIdle) {
      const parsed = parseRoach(playing);
      if (!parsed) return;
      this.roachIdle = playing.replace(new RegExp(`${parsed.anim}$`), 'idle');
    }
    if (playing !== this.roachIdle) sprite.play(this.roachIdle);
  }

  /**
   * The first time something asks for the dash: a ring closing in over the roach counts the beat in (asking nothing
   * yet), then the keycap (the key on a keyboard, the button's name on a phone), only while pressing then is right:
   * the dash ready, something to hit on the lane where it is a lunge, and early enough to land. The only words the fight
   * uses to teach.
   */
  private drawKeycap(): void {
    const prompt = this.prompt;
    const ring = this.countRing.clear();
    if (!prompt || this.state !== 'fighting') {
      this.hideKeycap();
      return;
    }
    const { player, scene } = this.ctx;
    if (this.clock > prompt.to) {
      this.prompt = null;
      this.hideKeycap();
      return;
    }
    const x = Math.round(player.sprite.x);
    const y = Math.round(player.sprite.y - KEYCAP_ABOVE_PX);
    // A record coming down the other lane asks nothing of a roach that has already hopped out of its way
    if (prompt.lane !== null && player.currentFloor !== prompt.lane) {
      this.hideKeycap();
      return;
    }
    if (this.clock < prompt.from) {
      if (this.clock < prompt.countFrom) return;
      const k = (this.clock - prompt.countFrom) / Math.max(1, prompt.from - prompt.countFrom);
      ring.lineStyle(2, 0xf1e3c6, 0.4 + 0.5 * k).strokeCircle(x, y, Phaser.Math.Linear(COUNT_RING_FROM, COUNT_RING_TO, k));
      return;
    }
    const honest = player.dashReady && !player.isDashing
      && (!prompt.needsTarget || this.director.lungeTarget(player.currentFloor) !== null);
    if (!honest) {
      this.hideKeycap();
      return;
    }
    if (!this.keycap) {
      const touch = !scene.sys.game.device.os.desktop;
      this.keycap = touch ? addKeycap(scene, 'DASH') : addArrowKeycap(scene, 'right');
    }
    this.keycap.setPosition(x, Math.round(y + keycapBob(scene.time.now)));
  }

  private hideKeycap(): void {
    this.keycap?.destroy();
    this.keycap = null;
  }

  /** Points times the combo's multiplier, with its line over the roach. */
  private score(points: number, label: string, color: string, flat = true): void {
    const total = flat ? points : points * this.multiplier;
    this.ctx.addScore(total);
    if (label || flat) this.popup(label ? `${label} +${total}` : `+${total}`, color);
  }

  private popup(text: string, color: string, size = 10): void {
    const { player } = this.ctx;
    this.popupAt(player.x, player.y - 40, text, color, size);
  }

  private popupAt(x: number, y: number, text: string, color: string, size = 10): void {
    const { scene } = this.ctx;
    const label = scene.add.text(x, y, text, popupStyle({ fontSize: `${size}px`, color }))
      .setOrigin(0.5).setDepth(DEPTH.POPUP);
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
    this.clearHazards();
    for (const m of this.movers) {
      m.sprite?.destroy();
      m.trail?.destroy();
    }
    this.movers = [];
    for (const obj of this.effects) obj.destroy();
    this.effects = [];
    for (const obj of [this.strips.top, this.strips.bottom, this.light, this.dim, this.pips, this.lamps, this.countRing,
      this.comboText, this.speakers.top.glow, this.speakers.bottom.glow, this.zones.top, this.zones.bottom]) {
      if (!this.orphans.has(obj as Phaser.GameObjects.GameObject)) obj.destroy();
    }
    this.events = [];
    // Lost, he and his speakers stay a moment where they were
    const left = [this.dj, this.ballDamage, this.speakers.top.sprite, this.speakers.bottom.sprite].filter(s => s.active);
    if (!left.length) return;
    this.ctx.scene.tweens.add({
      targets: left, alpha: 0, duration: FADE_MS, delay: 300, onComplete: () => left.forEach(s => s.destroy()),
    });
  }

  /** For scripted runs: what is coming, from the set's numbers, on the fight's clock, and what a lunge would hit. */
  get script(): {
    clock: number; threats: BigosThreat[]; target: Record<Lane, Target | null>; phase: number; open: boolean;
    remaining: number; stopped: boolean;
  } {
    return {
      clock: this.clock,
      threats: this.threats.filter(t => t.at + t.lasts > this.clock - 100),
      target: { top: this.director.lungeTarget('top'), bottom: this.director.lungeTarget('bottom') },
      phase: this.director.phase,
      open: this.director.open,
      remaining: this.director.remaining,
      stopped: this.stopped,
    };
  }
}
