/**
 * DJ Bigos, Król remizy. He stands at the right behind his booth with a speaker on each lane in front of him, and
 * everything happens on his beat: one clock at 120 BPM drives his groove, the speakers' thump, the lane ledges pulsing,
 * the beat pips over the bar and every attack, which lands on a beat the player can count to.
 *
 * Rings fired down a lane (hop out, or dash through), records flung along a lane (hop out and back, or smash one with a
 * dash), the ball's spotlight hopping lane to lane a flash a beat (each shown a beat ahead), and the bass drop: a build
 * (two bars the first time, one after) the scene itself plays, then both lanes at once, which only a dash gets
 * through. A record marks no lane: he winds up with it glowing in his glove, and it leaves a trail. Every ring dashed through, record smashed and drop
 * survived feeds the speakers; a full meter overloads one, red hot: dash into it to wreck it. Two speakers, then the
 * ball itself overheats: his sound system, three segments on the bar. A player who only hops still gets an opening at
 * the end of each set. The set is in bigosPatterns (and its tests), the frames in bigosConfig.
 *
 * The dash is a lunge that lasts exactly as long as the dash protects: out along the lane to the speakers and back to
 * the roach's spot in 375 ms. A hit is only a hit on the lane the roach both pressed for and is drawn on, and it stops
 * the fight for a moment with what hit it flashing, so every death shows its cause.
 */
import Phaser from 'phaser';
import { parseRoach } from '../../config/skins';
import { DEPTH } from '../../config/constants';
import { SPRITE_SCALE } from '../../config/sprites';
import { popupStyle } from '../../utils/TextStyles';
import { addArrowKeycap, addKeycap, keycapBob } from '../../ui/Keycap';
import { NEAR_MISS_SCORE } from '../RiskBonus';
import { BossFight, BossFightContext } from './BossFight';
import {
  BIGOS_ANIMS, BIGOS_CAUSE_KEY, BIGOS_GLOVE, BIGOS_HAND, BIGOS_HIT, BIGOS_LAYOUT as L, BIGOS_TEXTURE, BigosAnim,
  BigosCause, bigosFrame,
} from './bigosConfig';
import { glint, Halo, sparkBurst, Trail } from './bossTelegraph';
import {
  Attack, BEAT_MS, buildPhases, DASH_MS, FEED_DASH, FEED_DROP, FEED_MAX, fightRandom, Lane, LIGHT_MS,
  LIGHT_PREVIEW_BEATS, OPEN_BEATS, other, Phase, RECORD_RELEASE_BEAT, resolve, RING_FIRE_BEAT, RING_TRAVEL_MS,
  timeAttack, WRECK_BEATS,
} from './bigosPatterns';

const VICTORY_BONUS = 400;
/** Every ring, record and flash dodged. */
const DODGE_SCORE = 10;
/** A ring or a drop dashed through, a record smashed. */
const DASH_THROUGH_SCORE = 25;
/** Each part of his sound system wrecked. */
const WRECK_SCORE = 100;
/** A hop out of a ring's or record's lane this close before it arrives is a close call: "NA STYK!". */
const CLOSE_CALL_MS = 250;

/** His far hand stays this far inside the screen's right edge, screen px. */
const RIGHT_MARGIN = 64;
/** The speakers stand this far left of the booth, screen px. */
const SPEAKER_GAP = 16;
/** The speakers drop onto their lanes while the roach brakes. */
const DROP_IN_MS = 520;
const DROP_FROM = 260;
/** The roach brakes this quickly: the entrance is the speakers dropping in meanwhile, and the first call comes on the
 * first beat after it has stopped. */
const BRAKE_MS = 800;
/** A record flies this high over its lane, screen px: through the roach's body. */
const RECORD_HEIGHT = 26;
/** The lunge: out to the speakers in this share of the dash, back in the rest. */
const LUNGE_OUT_SHARE = 0.45;
/** A whole speaker turns the lunge back this far short of its front, px; it wobbles this much. */
const BONK_SHORT = 8;
const WOBBLE_MS = 220;
const WOBBLE_PX = 6;
/** What hit the roach flashes this long, the fight stopped, before the game over. A moult's is shorter. */
const HIT_STOP_MS = 650;
const MOULT_STOP_MS = 260;
/** The drop's build darkens the screen to this, swells the speakers by this much and shakes them this many px. */
const DROP_DIM = 0.65;
const DROP_SWELL = 0.16;
const DROP_SHAKE_PX = 6;
/** The record he winds up with glows in this, flares as it appears, and bursts in it as it leaves. */
const RECORD_GLOW = 0xc89bff;
const RECORD_TRAIL = { color: 0xb08cff, ms: 360, size: 12 };
/** The keycap prompt floats this far above the roach. */
const KEYCAP_ABOVE_PX = 96;
/** Sitting in the wreck of his booth before the run picks up again. */
const DEFEAT_HOLD_MS = 1300;
const FADE_MS = 400;
/** The longest a single frame moves the fight's clock: a pause doesn't count, a hitch only this much. */
const MAX_STEP_MS = 250;

const SHAKE_MS = 140;
const SHAKE = 0.01;
/** The warning on a lane something is coming down, in his colours, and the hot one on an opening. */
const WARN_COLOR = 0x9b5cff;
const WARN_CORE = 0xff6ad5;
const HOT_COLOR = 0xff5a1f;
const HOT_CORE = 0xffd36a;
const WARN_PX = 8;
const WARN_GLOW_PX = 30;
/** The ledges flash on every beat, harder on each bar's first. */
const PULSE_COLOR = 0xc89bff;
/** The beat pips over the bar. */
const PIP_PX = 10;
const PIP_GAP = 6;
const PIP_ON = 0xffd36a;
const PIP_OFF = 0x3a3450;
const PIP_DUE = 0xff3b6b;
/** The feedback meter's lamps. */
const LAMP_PX = 8;
const LAMP_ON = 0xff8a2a;
const LAMP_FULL = 0xfff0a0;
const LAMP_OFF = 0x2a2a38;

const SFX = {
  point: 'bigos-scratch',
  blast: 'bigos-blast',
  beam: 'bigos-beam',
  bonk: 'bullet-ricochet',
  overload: 'bigos-sizzle',
  wreck: 'bigos-wreck',
  closeCall: 'na-styk',
  land: 'bigos-thump',
  defeat: 'boss-victory',
  beat: 'bigos-thump',
  charge: 'bigos-charge',
  throw: 'bigos-scratch',
  smash: 'przebicie',
  hurt: 'vs-slam-2',
  hit: 'vs-slam-1',
};
/** A stand-in: boss-bgm isn't on his 120 BPM, so the thump on every beat is what keeps it audible for now. */
const BGM = 'boss-bgm';

type Target = Lane | 'ball';

interface Speaker {
  sprite: Phaser.GameObjects.Sprite;
  lane: Lane;
  anim: BigosAnim;
  start: number;
  wrecked: boolean;
  wobbleAt: number;
}

/** A ring or a record on its way down a lane: it is decided when it reaches the roach. */
interface Mover {
  kind: 'ring' | 'record' | 'drop';
  sprite: Phaser.GameObjects.Sprite;
  lane: Lane;
  x0: number;
  t0: number;
  speed: number;
  resolved: boolean;
  /** A drop's rings all count as one: fed once, dodged once. */
  group?: { fed: boolean };
  smashed?: boolean;
  trail?: Trail;
}

/** A spotlight's flash on a lane: dangerous from `at` for LIGHT_MS. */
interface Flash {
  lane: Lane;
  at: number;
  hit: boolean;
  kind: BigosCause;
  group?: { fed: boolean };
}

export class BigosFight extends BossFight {
  readonly victoryBonus = VICTORY_BONUS;

  private readonly phases: Phase[];
  private phaseIndex = 0;
  private queue: Attack[] = [];
  /** The beat the next attack starts on. */
  private nextBeat = 0;

  /** The fight's own clock, ms, every beat counted on it: scene time while the fight runs, stopped by the pause. */
  private clock = 0;
  private lastNow: number | null = null;
  private events: { at: number; fn: () => void }[] = [];
  private lastBeat = -1;

  private readonly dj: Phaser.GameObjects.Sprite;
  private readonly light: Phaser.GameObjects.Sprite;
  private readonly strips: Record<Lane, Phaser.GameObjects.TileSprite>;
  private djAnim: { anim: BigosAnim; start: number; then: BigosAnim | null } = { anim: 'groove', start: 0, then: null };
  private readonly speakers: Record<Lane, Speaker>;
  private movers: Mover[] = [];
  private flashes: Flash[] = [];
  /** The lanes a light shows on before it flashes: until when. */
  private previews: Record<Lane, number> = { top: -1, bottom: -1 };
  /** Feedback in each speaker, and the ball's heat. */
  private feed: Record<Target, number> = { top: 0, bottom: 0, ball: 0 };
  private pendingOpen: Target | null = null;
  private overload: { target: Target; token: number } | null = null;
  private overloadToken = 0;
  private prompted = new Set<string>();
  /** passed: it went through something on the way (then a whole speaker at the end needs no telling off). */
  private lunge: { t0: number; reach: number; bonk: boolean; arrived: boolean; passed: boolean } | null = null;
  /** The hit-stop: what hit the roach flashes and the fight holds, until this (real ms), then the game over. */
  private hitStop: { until: number; culprit: Phaser.GameObjects.Components.Alpha[]; deadly: boolean } | null = null;
  private dropBuild: { from: number; to: number } | null = null;
  private dim: Phaser.GameObjects.Rectangle;
  /** The glow on each speaker's big cone, swelling through the drop's build. */
  private readonly coneGlow: Record<Lane, Halo>;
  /** The record he winds up with: glowing in his glove from a beat before it leaves. */
  private held: { sprite: Phaser.GameObjects.Sprite; halo: Halo; since: number } | null = null;
  private frameIndex = 0;
  /** The keycap over the roach the first time something new asks for the dash, until it is dashed or gone. */
  private keycap: Phaser.GameObjects.Text | Phaser.GameObjects.Image | null = null;
  private keycapUntil = 0;
  private pulse: Phaser.GameObjects.Graphics;
  private pips: Phaser.GameObjects.Graphics;
  private meters: Phaser.GameObjects.Graphics;
  /** Beats something lands on, for the pips. */
  private dueBeats = new Set<number>();
  private warnings = new Map<Lane, { g: Phaser.GameObjects.Graphics; hot: boolean }>();
  private effects: Phaser.GameObjects.GameObject[] = [];
  private roachIdle: string | null = null;
  private stopped = false;
  private wrecks = 0;

  constructor(ctx: BossFightContext) {
    super(ctx);
    const { scene } = ctx;
    this.phases = buildPhases(fightRandom(ctx.seed, ctx.boss.id));
    scene.registry.remove(BIGOS_CAUSE_KEY);

    const strip = () => scene.add.tileSprite(0, 0, L.stripW * 4, L.stripH, BIGOS_TEXTURE, bigosFrame('strip'))
      .setOrigin(1, 0.5).setScale(SPRITE_SCALE).setDepth(DEPTH.PICKUPS + 1).setVisible(false);
    this.strips = { top: strip(), bottom: strip() };
    this.dim = scene.add.rectangle(0, 0, 4000, 4000, 0x000000, 1).setOrigin(0).setScrollFactor(0)
      .setDepth(DEPTH.OBSTACLES - 0.5).setAlpha(0);
    this.pulse = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.CONTACT_SHADOW);
    this.dj = scene.add.sprite(0, ctx.floorBottomY, BIGOS_TEXTURE, bigosFrame('groove'))
      .setScale(SPRITE_SCALE).setDepth(DEPTH.OBSTACLES);
    this.light = scene.add.sprite(0, ctx.floorBottomY, BIGOS_TEXTURE, bigosFrame('light-top'))
      .setScale(SPRITE_SCALE).setDepth(DEPTH.PICKUPS + 1).setVisible(false);
    const speaker = (lane: Lane): Speaker => ({
      sprite: scene.add.sprite(0, this.laneY(lane) - DROP_FROM, BIGOS_TEXTURE, bigosFrame('speaker-thump'))
        .setScale(SPRITE_SCALE).setDepth(DEPTH.OBSTACLES),
      lane, anim: 'speaker-thump', start: 0, wrecked: false, wobbleAt: -1e9,
    });
    this.speakers = { top: speaker('top'), bottom: speaker('bottom') };
    this.meters = scene.add.graphics().setDepth(DEPTH.OBSTACLES + 0.5);
    this.pips = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.HUD);
    this.coneGlow = {
      top: new Halo(scene, WARN_CORE, DEPTH.OBSTACLES + 0.6),
      bottom: new Halo(scene, WARN_CORE, DEPTH.OBSTACLES + 0.6),
    };
    this.place();

    // The speakers drop in while the roach brakes; the first call comes on the first beat after it has stopped
    this.brake(() => {
      this.stopped = true;
      this.nextBeat = Math.ceil(this.beatNow) + 1;
      this.at(this.nextBeat - 1, () => this.startFighting());
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

  /** When a one-shot must start so that its beat frame lands on this beat. */
  private hitStart(anim: BigosAnim, beat: number): number {
    return this.beatTime(beat) - (BIGOS_HIT[anim] ?? 0) * 1000 / BIGOS_ANIMS[anim].fps;
  }

  private onBeat(beat: number): void {
    // The beat you hear while his own track isn't on it: a thump, louder on the bar's first
    if (this.state === 'fighting' && !this.hitStop) this.ctx.audio.playSfx(SFX.beat, beat % 4 === 0 ? 0.35 : 0.18);
    this.dueBeats.forEach(b => { if (b < beat) this.dueBeats.delete(b); });
  }

  // ── Flow ──────────────────────────────────────────────────────────

  private startFighting(): void {
    this.state = 'fighting';
    this.ctx.audio.switchBGM(BGM);
    this.ctx.showBar(3, 3);
    this.queue = this.set.attacks.slice();
    this.advance();
  }

  private get set(): Phase { return this.phases[this.phaseIndex]; }

  /** The next thing on its beat: an opening the player has earned, the next attack, or the set's guaranteed opening. */
  private advance(): void {
    if (this.state !== 'fighting') return;
    const beat = Math.max(this.nextBeat, Math.ceil(this.beatNow) + 1);
    if (this.pendingOpen) {
      const target = this.pendingOpen;
      this.pendingOpen = null;
      this.openUp(target, beat);
      return;
    }
    const attack = this.queue.shift();
    if (!attack) {
      this.openUp(this.guaranteedTarget(), beat);
      return;
    }
    const { beats } = timeAttack(attack);
    this.play(attack, beat, this.ctx.player.currentFloor);
    this.nextBeat = beat + beats + this.set.gap;
    this.at(this.nextBeat - 1, () => this.advance());
  }

  /** The set played through without an earned opening: the fullest speaker overloads anyway (or the ball, at the end). */
  private guaranteedTarget(): Target {
    if (this.phaseIndex === 2) return 'ball';
    const alive = (['top', 'bottom'] as Lane[]).filter(l => !this.speakers[l].wrecked);
    if (alive.length === 1) return alive[0];
    const roach = this.ctx.player.currentFloor;
    return this.feed[other(roach)] > this.feed[roach] ? other(roach) : roach;
  }

  private play(attack: Attack, b: number, roachLane: Lane): void {
    const { hazards } = timeAttack(attack);
    for (const h of hazards) {
      const beat = b + h.t / BEAT_MS;
      if (Number.isInteger(beat)) this.dueBeats.add(beat);
    }
    switch (attack.kind) {
      case 'rings':
        attack.lanes.forEach((rel, i) => this.ring(resolve(rel, roachLane), b, b + RING_FIRE_BEAT + i, i === 0));
        break;
      case 'drop':
        this.drop(b, attack.travel, attack.build);
        break;
      case 'records':
        attack.lanes.forEach((rel, i) => this.record(resolve(rel, roachLane), b + RECORD_RELEASE_BEAT + i * attack.spacing,
          attack.travel));
        break;
      case 'lights': {
        const lanes = attack.lanes.map(rel => resolve(rel, roachLane));
        lanes.forEach((lane, i) => this.spot(lane, b + LIGHT_PREVIEW_BEATS + i, lanes[i + 1] ?? null, i === lanes.length - 1));
        break;
      }
    }
  }

  // ── Rings ─────────────────────────────────────────────────────────

  /** The call: the lane warned and its speaker charging from the attack's first beat, he points on the fire beat. */
  private ring(lane: Lane, callBeat: number, fireBeat: number, first: boolean): void {
    if (first) {
      this.at(callBeat, () => {
        this.warn(lane, false);
        if (!this.speakers[lane].wrecked) this.setSpeaker(lane, 'speaker-charge');
        this.ctx.audio.playSfx(SFX.charge, 0.4);
      });
    } else {
      this.at(fireBeat - 1, () => {
        this.warn(lane, false);
        if (!this.speakers[lane].wrecked) this.setSpeaker(lane, 'speaker-charge');
      });
    }
    const anim: BigosAnim = `point-${lane}`;
    const start = this.hitStart(anim, fireBeat);
    this.atMs(start, () => {
      this.playDj(anim, start, 'groove');
      this.ctx.audio.playSfx(SFX.point, 0.3);
    });
    this.fire(lane, fireBeat, RING_TRAVEL_MS, 'ring');
  }

  /** On the beat a ring leaves the lane's speaker; a lane whose speaker is wrecked gets the ball's light instead. */
  private fire(lane: Lane, beat: number, travel: number, kind: 'ring' | 'drop', group?: { fed: boolean }): void {
    const spk = this.speakers[lane];
    const blastAt = this.hitStart('speaker-blast', beat);
    this.atMs(blastAt, () => { if (!spk.wrecked) this.setSpeaker(lane, 'speaker-blast', blastAt); });
    this.at(beat, () => {
      if (this.state !== 'fighting') return;
      this.unwarn(lane);
      if (spk.wrecked) {
        this.previewLight(lane, this.beatTime(beat) + travel);
        this.flashes.push({ lane, at: this.beatTime(beat) + travel, hit: false, kind: kind === 'drop' ? 'drop' : 'light', group });
        return;
      }
      const x0 = spk.sprite.x - (L.speakerW / 2 + L.ringW - 4) * SPRITE_SCALE;
      const sprite = this.ctx.scene.add.sprite(x0, this.laneY(lane), BIGOS_TEXTURE, bigosFrame('ring'))
        .setScale(SPRITE_SCALE).setDepth(DEPTH.PICKUPS + 1);
      this.movers.push({ kind, sprite, lane, x0, t0: this.clock, speed: Math.max(1, x0 - this.holdX) / travel, resolved: false, group });
      this.ctx.scene.cameras.main.shake(SHAKE_MS, SHAKE);
      this.ctx.audio.playSfx(SFX.blast, 0.7);
    });
  }

  // ── Records ───────────────────────────────────────────────────────

  /**
   * A record marks no lane: its warning is on him. A beat ahead it appears in his glove with a flare and glows, spinning
   * and swelling, while he winds up (the pose is the lane's: up for the top, down low for the bottom); on the beat it
   * leaves his hand in a burst and a streak, and flies out of the speaker's front, trailing violet.
   */
  private record(lane: Lane, releaseBeat: number, travel: number): void {
    this.at(releaseBeat - 1, () => this.raiseRecord());
    const anim: BigosAnim = `point-${lane}`;
    const start = this.hitStart(anim, releaseBeat);
    this.atMs(start, () => this.playDj(anim, start, 'groove'));
    this.at(releaseBeat, () => {
      if (this.state !== 'fighting') return;
      const hand = this.glove();
      this.dropRecord();
      glint(this.ctx.scene, hand.x, hand.y, RECORD_GLOW, 24, 300);
      sparkBurst(this.ctx.scene, hand.x, hand.y, RECORD_GLOW, 10, -1, 52);
      if (!this.prompted.has('smash')) {
        // The first record, alone: a dash smashes it. Shown once, as a keycap
        this.prompted.add('smash');
        this.showKeycap(travel + BEAT_MS);
      }
      const x0 = this.speakers[lane].sprite.x - (L.speakerW / 2) * SPRITE_SCALE;
      const y0 = this.laneY(lane) - RECORD_HEIGHT;
      this.streak(hand, { x: x0, y: y0 });
      const sprite = this.ctx.scene.add.sprite(x0, y0, BIGOS_TEXTURE, bigosFrame('record'))
        .setScale(SPRITE_SCALE).setDepth(DEPTH.PICKUPS + 1);
      const trail = new Trail(this.ctx.scene, RECORD_TRAIL.color, RECORD_TRAIL.ms, RECORD_TRAIL.size, DEPTH.PICKUPS);
      this.movers.push({
        kind: 'record', sprite, lane, x0, t0: this.clock, speed: Math.max(1, x0 - this.holdX) / travel, resolved: false, trail,
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
    if (this.state !== 'fighting') return;
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

  /** A beat ahead the light shows on its lane and the ball turns to it; on the beat it flashes. */
  private spot(lane: Lane, previewBeat: number, next: Lane | null, last: boolean): void {
    const flashAt = this.beatTime(previewBeat + 1);
    this.at(previewBeat, () => {
      if (this.state !== 'fighting') return;
      this.previewLight(lane, flashAt);
      if (this.djAnim.anim !== `beam-${lane}-loop`) this.playDj(`beam-${lane}-windup`, this.beatTime(previewBeat), null);
      this.flashes.push({ lane, at: flashAt, hit: false, kind: 'light' });
    });
    this.atMs(flashAt, () => {
      if (this.state !== 'fighting') return;
      this.playDj(`beam-${lane}-loop`, flashAt, null);
      this.ctx.audio.playSfx(SFX.beam, 0.35);
      this.ctx.scene.cameras.main.shake(SHAKE_MS / 2, SHAKE / 2);
    });
    if (last || next === null) {
      this.atMs(flashAt + BEAT_MS, () => {
        if (this.state === 'fighting' && this.djAnim.anim === `beam-${lane}-loop`) {
          this.playDj(`beam-${lane}-release`, this.clock, 'groove');
        }
      });
    }
  }

  private previewLight(lane: Lane, until: number): void {
    this.previews[lane] = Math.max(this.previews[lane], until);
    this.warn(lane, false);
    // Its warning goes with its flash, unless another is coming on the lane by then
    this.atMs(until + LIGHT_MS, () => {
      if (this.previews[lane] <= this.clock && this.warnings.get(lane)?.hot === false) this.unwarn(lane);
    });
  }

  // ── The bass drop ─────────────────────────────────────────────────

  /**
   * The build, played by the scene and not by words: the speakers swell and shake harder every beat with their cones
   * glowing brighter, his arms go up, the screen dims, the ledges flash fatter and faster, the pips fill toward it and a
   * riser climbs in pitch, until both lanes at once on the beat after it. Two bars the first time, one after.
   */
  private drop(b: number, travel: number, build: number): void {
    const hit = b + build;
    this.at(b, () => {
      if (this.state !== 'fighting') return;
      this.dropBuild = { from: this.beatTime(b), to: this.beatTime(hit) };
      this.playDj('drop-windup', this.beatTime(b), null);
      for (const lane of ['top', 'bottom'] as Lane[]) {
        this.warn(lane, false);
        if (!this.speakers[lane].wrecked) this.setSpeaker(lane, 'speaker-charge');
      }
    });
    // A riser: the charge sound again every beat, higher each time, with the camera shaking a little harder
    for (let k = 0; k < build; k++) {
      this.at(b + k, () => {
        if (this.state !== 'fighting') return;
        const p = k / Math.max(1, build - 1);
        this.ctx.audio.playSfx(SFX.charge, 0.35 + 0.35 * p, 0.7 + 0.9 * p);
        this.ctx.scene.cameras.main.shake(140, 0.002 + 0.006 * p);
      });
    }
    // The first drop of a fight, once: a keycap over the roach for the last two beats (and the fall after them)
    this.at(hit - 2, () => {
      if (this.state !== 'fighting' || this.prompted.has('drop')) return;
      this.prompted.add('drop');
      this.showKeycap(2 * BEAT_MS + travel);
    });
    const slam = this.hitStart('drop', hit);
    this.atMs(slam, () => this.playDj('drop', slam, 'groove'));
    const group = { fed: false };
    for (const lane of ['top', 'bottom'] as Lane[]) this.fire(lane, hit, travel, 'drop', group);
    this.at(hit, () => {
      this.dropBuild = null;
      this.ctx.scene.cameras.main.shake(SHAKE_MS * 2, SHAKE * 2);
    });
  }

  // ── Every hazard reaching the roach ───────────────────────────────

  /** Whether the roach is on this lane: pressed for it and drawn on it, so a hit is never on a lane it visibly left. */
  private onLane(lane: Lane): boolean {
    const { player, floorTopY, floorBottomY } = this.ctx;
    const drawn: Lane = player.sprite.y < (floorTopY + floorBottomY) / 2 ? 'top' : 'bottom';
    return player.currentFloor === lane && drawn === lane;
  }

  private updateMovers(): void {
    const cam = this.ctx.scene.cameras.main;
    const roachX = this.ctx.player.sprite.x;
    for (const m of this.movers) {
      if (m.smashed) continue;
      const age = this.clock - m.t0;
      m.sprite.x = m.x0 - age * m.speed;
      m.trail?.push(m.sprite.x, m.sprite.y);
      const anim: BigosAnim = m.kind === 'record' ? 'record' : 'ring';
      const spec = BIGOS_ANIMS[anim];
      m.sprite.setFrame(bigosFrame(anim, Math.floor(age * spec.fps / 1000) % spec.frames));
      if (!m.resolved && m.sprite.x <= roachX) {
        m.resolved = true;
        this.reach(m);
        if (this.over || this.hitStop) return;
      }
    }
    for (const m of this.movers.filter(m => m.sprite.x < cam.scrollX - 80 && m.sprite.active)) {
      m.sprite.destroy();
      m.trail?.destroy();
    }
    this.movers = this.movers.filter(m => m.sprite.active);
  }

  private reach(m: Mover): void {
    const { player } = this.ctx;
    if (!this.onLane(m.lane)) {
      if (m.group) {
        if (!player.isDashing || m.group.fed) return;
      } else {
        this.dodged(m.lane);
        return;
      }
    }
    if (player.isDashing) {
      if (this.lunge) this.lunge.passed = true;
      if (m.kind === 'record') this.smash(m);
      if (m.group) {
        if (m.group.fed) return;
        m.group.fed = true;
        this.feedAll(FEED_DROP);
        this.score(DASH_THROUGH_SCORE * 2, 'PRZEZ BAS!', '#7fe0ff');
        return;
      }
      this.feedLane(m.lane, FEED_DASH);
      this.score(DASH_THROUGH_SCORE, m.kind === 'record' ? 'ROZBITA!' : 'PRZEZ FALĘ!', '#7fe0ff');
      return;
    }
    this.struck(m.kind === 'record' ? 'record' : m.kind === 'drop' ? 'drop' : 'ring', [m.sprite]);
  }

  private dodged(lane: Lane): void {
    const { scene, audio, player } = this.ctx;
    const hop = player.lastHop;
    const close = hop !== null && hop.from === lane && scene.time.now - hop.at <= CLOSE_CALL_MS;
    if (close) audio.playSfx(SFX.closeCall, 0.6);
    this.score(close ? DODGE_SCORE + NEAR_MISS_SCORE : DODGE_SCORE, close ? 'NA STYK!' : '', close ? '#7fe0ff' : '#ffdd00');
  }

  private smash(m: Mover): void {
    m.smashed = true;
    m.trail?.destroy();
    m.trail = undefined;
    this.ctx.audio.playSfx(SFX.smash, 0.7);
    const sprite = m.sprite;
    sprite.x = this.ctx.player.sprite.x;
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
      if (!this.onLane(f.lane)) continue;
      if (player.isDashing) {
        if (f.group && !f.group.fed) {
          f.group.fed = true;
          this.feedAll(FEED_DROP);
          this.score(DASH_THROUGH_SCORE * 2, 'PRZEZ BAS!', '#7fe0ff');
        }
        continue;
      }
      f.hit = true;
      this.struck(f.kind, [this.strips[f.lane]]);
      return;
    }
    // A flash over without a hit is a dodge
    for (const f of this.flashes.filter(f => this.clock > f.at + LIGHT_MS)) {
      if (!f.hit && !f.group && f.lane === other(player.currentFloor)) this.score(DODGE_SCORE, '', '#ffdd00');
    }
    this.flashes = this.flashes.filter(f => this.clock <= f.at + LIGHT_MS);
  }

  /** The roach is hit: everything stops with the culprit flashing, so the death is seen; a moult takes it and goes on. */
  private struck(cause: BigosCause, culprit: Phaser.GameObjects.Components.Alpha[]): void {
    const { player, scene, audio } = this.ctx;
    if (player.inMoultGrace) return;
    const moulted = this.ctx.survivesHit();
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
      this.lose('bigos');
      return true;
    }
    this.lastNow = now;
    return false;
  }

  // ── Feedback and openings ─────────────────────────────────────────

  /** Phase 1 feeds the speaker of the lane it came down; then whatever is left of his system. */
  private feedLane(lane: Lane, amount: number): void {
    const target: Target = this.phaseIndex === 2 ? 'ball' : (this.speakers[lane].wrecked ? other(lane) : lane);
    this.addFeed(target, amount);
  }

  private feedAll(amount: number): void {
    if (this.phaseIndex === 2) this.addFeed('ball', amount);
    else for (const lane of ['top', 'bottom'] as Lane[]) if (!this.speakers[lane].wrecked) this.addFeed(lane, amount);
  }

  private addFeed(target: Target, amount: number): void {
    if (this.overload || this.pendingOpen) return;
    this.feed[target] = Math.min(FEED_MAX, this.feed[target] + amount);
    if (this.feed[target] >= FEED_MAX) {
      this.pendingOpen = target;
      if (target !== 'ball') this.setSpeaker(target, 'speaker-overload');
    }
  }

  private openUp(target: Target, b: number): void {
    const token = ++this.overloadToken;
    const lane: Lane = target === 'ball' ? 'top' : target;
    this.at(b, () => {
      if (this.state !== 'fighting') return;
      this.overload = { target, token };
      this.feed[target] = FEED_MAX;
      if (target === 'ball') this.playDj('overheat', this.beatTime(b), null);
      else this.setSpeaker(target, 'speaker-overload');
      this.warn(lane, true);
      this.ctx.audio.playSfx(SFX.overload, 0.7);
      const key = target === 'ball' ? 'ball' : 'open';
      if (!this.prompted.has(key)) {
        this.prompted.add(key);
        this.showKeycap(OPEN_BEATS * BEAT_MS);
      }
    });
    this.at(b + OPEN_BEATS, () => {
      if (this.overload?.token !== token) return;
      // Missed: it cools down, one notch short of overloading again, and the set goes on
      this.overload = null;
      this.hideKeycap();
      this.unwarn(lane);
      this.feed[target] = FEED_MAX - 1;
      if (target === 'ball') this.playDj('groove', this.clock, null);
      else this.setSpeaker(target, 'speaker-thump');
      if (!this.queue.length) this.queue = this.set.attacks.slice(1);
      this.nextBeat = Math.ceil(this.beatNow) + 1;
      this.advance();
    });
  }

  private wreck(target: Target): void {
    this.overload = null;
    this.hideKeycap();
    const { scene, audio } = this.ctx;
    scene.cameras.main.shake(SHAKE_MS * 2, SHAKE * 2);
    audio.playSfx(SFX.wreck, 0.8);
    this.wrecks++;
    this.ctx.updateBar(3 - this.wrecks);
    this.score(WRECK_SCORE, 'ROZWALONY!', '#ff9a3c');
    if (target === 'ball') {
      this.defeat();
      return;
    }
    this.unwarn(target);
    this.speakers[target].wrecked = true;
    this.setSpeaker(target, 'speaker-broken');
    this.playDj('hurt', this.clock, 'groove');
    audio.playSfx(SFX.hurt, 0.7);
    this.phaseIndex++;
    this.queue = this.set.attacks.slice();
    this.feed = { top: 0, bottom: 0, ball: 0 };
    this.nextBeat = Math.ceil(this.beatNow) + WRECK_BEATS;
    this.advance();
  }

  // ── The dash ──────────────────────────────────────────────────────

  dash(): void {
    const { player } = this.ctx;
    if (this.lunge || this.hitStop || !player.dashReady || player.isDashing) return;
    player.startDash();
    const lane = player.currentFloor;
    const spk = this.speakers[lane];
    const front = spk.sprite.x - (L.speakerW / 2) * SPRITE_SCALE;
    let reach = spk.sprite.x - this.holdX;
    let bonk = false;
    if (this.overload?.target === 'ball' && lane === 'top') reach = this.ballLeft - this.holdX;
    else if (this.overload?.target !== lane && !spk.wrecked) {
      reach = front - BONK_SHORT - this.holdX;
      bonk = true;
    }
    this.lunge = { t0: this.clock, reach, bonk, arrived: false, passed: false };
  }

  private get ballLeft(): number { return this.dj.x + (L.ballX - L.ballR) * SPRITE_SCALE; }

  /** The roach's offset along its lunge: out and back inside the dash itself. */
  private updateLunge(): number {
    const lunge = this.lunge;
    if (!lunge) return 0;
    const out = DASH_MS * LUNGE_OUT_SHARE;
    const t = this.clock - lunge.t0;
    if (t < out) {
      const k = t / out;
      return lunge.reach * (1 - (1 - k) * (1 - k));
    }
    if (!lunge.arrived) {
      lunge.arrived = true;
      this.arrive(lunge.bonk);
      if (this.over) return 0;
    }
    const back = (t - out) / (DASH_MS - out);
    if (back >= 1) {
      this.lunge = null;
      return 0;
    }
    return lunge.reach * (0.5 + 0.5 * Math.cos(Math.PI * back));
  }

  private arrive(bonk: boolean): void {
    const { player, audio, scene } = this.ctx;
    const lane = player.currentFloor;
    const open = this.overload;
    // The lunge is the dash: what it reaches counts even if a slow frame let the dash run out on the way
    if (open && (open.target === lane || (open.target === 'ball' && lane === 'top'))) {
      this.wreck(open.target);
      return;
    }
    if (bonk && !this.speakers[lane].wrecked) {
      audio.playSfx(SFX.bonk, 0.5);
      scene.cameras.main.shake(SHAKE_MS / 2, SHAKE / 2);
      this.speakers[lane].wobbleAt = this.clock;
      if (!this.lunge?.passed) this.popup(this.feed[lane] < FEED_MAX ? 'ZA WCZEŚNIE!' : 'JESZCZE NIE!', '#c8b8ff');
    }
  }

  // ── Defeat ────────────────────────────────────────────────────────

  private defeat(): void {
    this.state = 'victory';
    this.clearHazards();
    this.ctx.audio.playSfx(SFX.defeat, 0.7);
    this.playDj('defeat', this.clock, null);
    const ms = BIGOS_ANIMS.defeat.frames * 1000 / BIGOS_ANIMS.defeat.fps + DEFEAT_HOLD_MS;
    this.atMs(this.clock + ms, () => {
      const targets = [this.dj, this.speakers.top.sprite, this.speakers.bottom.sprite];
      this.ctx.scene.tweens.add({ targets, alpha: 0, duration: FADE_MS, onComplete: () => this.win() });
    });
  }

  private clearHazards(): void {
    for (const m of this.movers) {
      m.sprite.destroy();
      m.trail?.destroy();
    }
    this.movers = [];
    this.dropRecord();
    this.flashes = [];
    this.previews = { top: -1, bottom: -1 };
    this.dropBuild = null;
    this.dueBeats.clear();
    for (const lane of ['top', 'bottom'] as Lane[]) {
      this.unwarn(lane);
      this.coneGlow[lane].hide();
    }
    this.hideKeycap();
  }

  // ── Every frame ───────────────────────────────────────────────────

  /** Won or lost: an event or a hit can end the fight in the middle of a frame. */
  private get over(): boolean { return this.state === 'done'; }

  update(): void {
    if (this.over) return;
    if (this.holdHitStop()) return;
    const now = this.ctx.scene.time.now;
    this.clock += this.lastNow === null ? 0 : Math.min(MAX_STEP_MS, Math.max(0, now - this.lastNow));
    this.lastNow = now;
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
    // A hit may have just stopped it: the hit-stop shows the frame as it was
    if (this.over || this.hitStop) return;
    this.drawFrames();
    this.drawBeat();
  }

  /** Everything stands on the screen, not in the world, until the camera stops with the roach. */
  private place(): void {
    const cam = this.ctx.scene.cameras.main;
    const djX = cam.scrollX + cam.width - RIGHT_MARGIN;
    this.dj.x = djX;
    this.light.x = djX;
    const spkX = djX + L.boothLeft * SPRITE_SCALE - SPEAKER_GAP - (L.speakerW / 2) * SPRITE_SCALE;
    const drop = Math.min(1, this.clock / DROP_IN_MS);
    for (const spk of Object.values(this.speakers)) {
      const since = this.clock - spk.wobbleAt;
      const wobble = since < WOBBLE_MS ? Math.round(Math.sin(since / WOBBLE_MS * Math.PI * 3) * WOBBLE_PX * (1 - since / WOBBLE_MS)) : 0;
      // The drop's build: they shake harder every beat
      const k = this.buildK;
      const shake = k > 0 ? Math.round((Math.sin(this.clock / 23 + (spk.lane === 'top' ? 0 : 2)) * DROP_SHAKE_PX * k * k) / 2) * 2 : 0;
      spk.sprite.x = spkX + wobble + shake;
      const fall = drop < 1 ? Phaser.Math.Easing.Bounce.Out(drop) : 1;
      const wasUp = spk.sprite.y < this.laneY(spk.lane);
      spk.sprite.y = this.laneY(spk.lane) - DROP_FROM * (1 - fall);
      if (wasUp && drop >= 1) this.ctx.audio.playSfx(SFX.land, 0.4);
    }
    // The strips run from his cell's edge to past the screen's left, whole tiles so they join his light
    const left = djX + L.cellLeft * SPRITE_SCALE;
    const tiles = Math.ceil((left - cam.scrollX) / SPRITE_SCALE / L.stripW) + 1;
    for (const lane of ['top', 'bottom'] as Lane[]) {
      const strip = this.strips[lane];
      strip.x = left;
      strip.y = this.ctx.floorBottomY + (lane === 'top' ? L.beamTop : L.beamBottom) * SPRITE_SCALE;
      if (strip.width !== tiles * L.stripW) strip.setSize(tiles * L.stripW, L.stripH);
    }
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
    this.drawHeld();
    // The lights: dim where one is coming, full on its flash, its cone from the ball over him
    const stripFrame = Math.floor(this.clock * BIGOS_ANIMS.strip.fps / 1000) % BIGOS_ANIMS.strip.frames;
    let cone: Lane | null = null;
    for (const lane of ['top', 'bottom'] as Lane[]) {
      const flash = this.flashes.find(f => f.lane === lane && this.clock >= f.at && this.clock <= f.at + LIGHT_MS * 2);
      const strip = this.strips[lane];
      strip.setFrame(bigosFrame('strip', stripFrame));
      if (flash) {
        const fade = Math.max(0, (this.clock - flash.at - LIGHT_MS) / LIGHT_MS);
        strip.setVisible(true).setAlpha(1 - 0.8 * fade);
        if (this.clock <= flash.at + LIGHT_MS) cone = lane;
      } else if (this.previews[lane] > this.clock) {
        strip.setVisible(true).setAlpha(0.16 + 0.12 * (1 - (this.beatNow % 1)));
      } else {
        strip.setVisible(false);
      }
    }
    const coneAnim = cone === 'top' ? 'beam-top-loop' : cone === 'bottom' ? 'beam-bottom-loop' : null;
    this.light.setVisible(coneAnim !== null && anim === coneAnim);
    if (coneAnim && anim === coneAnim) this.light.setFrame(bigosFrame(`light-${cone!}`, index));
    for (const spk of Object.values(this.speakers)) this.drawSpeaker(spk);
  }

  private drawSpeaker(spk: Speaker): void {
    let anim = spk.anim;
    if (anim === 'speaker-blast' && (this.clock - spk.start) * BIGOS_ANIMS[anim].fps / 1000 >= BIGOS_ANIMS[anim].frames) {
      anim = spk.anim = this.overload?.target === spk.lane || this.pendingOpen === spk.lane ? 'speaker-overload' : 'speaker-thump';
    }
    const spec = BIGOS_ANIMS[anim];
    const index = spec.loop
      ? Math.floor(this.clock * spec.fps / 1000) % spec.frames
      : Math.max(0, Math.min(Math.floor((this.clock - spk.start) * spec.fps / 1000), spec.frames - 1));
    spk.sprite.setFrame(bigosFrame(anim, index));
    // The drop's build: it swells on every beat, a little more each time, its cone glowing brighter
    const k = this.buildK;
    const pulse = (1 - (this.beatNow % 1)) ** 2;
    const swell = 1 + DROP_SWELL * k * (0.4 + 0.6 * pulse);
    spk.sprite.setScale(SPRITE_SCALE * swell);
    const glow = this.coneGlow[spk.lane];
    if (k > 0 && !spk.wrecked) {
      glow.show(spk.sprite.x + L.coneX * SPRITE_SCALE, this.laneY(spk.lane) + L.coneY * SPRITE_SCALE * swell,
        14 + 26 * k + 8 * pulse * k, 0.3 + 0.7 * k);
    } else glow.hide();
  }

  /** How far the drop's build has got, 0 (not building) to 1 (the beat before it falls). */
  private get buildK(): number {
    const build = this.dropBuild;
    return build && this.state === 'fighting' ? Phaser.Math.Clamp((this.clock - build.from) / (build.to - build.from), 0, 1) : 0;
  }

  /** The beat made visible: the ledges flash, the pips count the bar and mark the beats something lands on. */
  private drawBeat(): void {
    const { floorTopY, floorBottomY, scene } = this.ctx;
    const cam = scene.cameras.main;
    const build = this.dropBuild;
    const k = this.buildK;
    // In the build's last two beats everything pulses twice as fast
    const fast = !!build && build.to - this.clock <= 2 * BEAT_MS;
    const phase = (fast ? this.beatNow * 2 : this.beatNow) % 1;
    const beat = Math.floor(this.beatNow);
    const downbeat = beat % 4 === 0;
    const strength = (1 - phase) * (1 - phase);
    this.pulse.clear();
    if (this.state === 'fighting') {
      // The ledges flash on every beat; through a build they flash fatter and brighter
      const thick = 4 + Math.round(5 * k) * 2;
      this.pulse.fillStyle(k > 0 ? WARN_CORE : PULSE_COLOR, Math.min(1, (downbeat || k > 0 ? 0.55 : 0.32) * strength * (1 + 1.2 * k)));
      for (const y of [floorTopY, floorBottomY]) this.pulse.fillRect(0, y - thick, cam.width, thick);
    }
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
    }
    this.drawMeters();
    const pulse = 1 - phase;
    for (const { g, hot } of this.warnings.values()) g.setAlpha((hot ? 0.55 : 0.4) + 0.45 * pulse);
    this.drawKeycap();
  }

  /** Each speaker's feedback, three lamps over the cabinet; the ball's heat over him in the last phase. */
  private drawMeters(): void {
    const g = this.meters.clear();
    if (this.state !== 'fighting') return;
    const lamps = (x: number, y: number, value: number) => {
      for (let i = 0; i < FEED_MAX; i++) {
        const on = i < value;
        g.fillStyle(LAMP_OFF, 1).fillRect(x + i * (LAMP_PX + 4) - 1, y - 1, LAMP_PX + 2, LAMP_PX + 2);
        g.fillStyle(on ? (value >= FEED_MAX ? LAMP_FULL : LAMP_ON) : LAMP_OFF, 1).fillRect(x + i * (LAMP_PX + 4), y, LAMP_PX, LAMP_PX);
      }
    };
    const width = FEED_MAX * (LAMP_PX + 4) - 4;
    if (this.phaseIndex < 2) {
      for (const spk of Object.values(this.speakers)) {
        if (spk.wrecked) continue;
        lamps(spk.sprite.x - width / 2, this.laneY(spk.lane) - L.speakerH * SPRITE_SCALE - 12, this.feed[spk.lane]);
      }
    } else {
      lamps(this.dj.x + L.ballX * SPRITE_SCALE - width / 2, this.ctx.floorBottomY + (L.ballY - L.ballR) * SPRITE_SCALE - 16,
        this.feed.ball);
    }
  }

  private playDj(anim: BigosAnim, start: number, then: BigosAnim | null): void {
    if (this.state === 'victory' && anim !== 'defeat') return;
    this.djAnim = { anim, start, then };
  }

  private setSpeaker(lane: Lane, anim: BigosAnim, start = this.clock): void {
    const spk = this.speakers[lane];
    if (spk.wrecked && anim !== 'speaker-broken') return;
    // An overloaded speaker stays red hot until it is wrecked or cools
    if (spk.anim === 'speaker-overload' && anim !== 'speaker-thump' && anim !== 'speaker-broken' && anim !== 'speaker-overload') return;
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

  /** A strip glowing along the lane's edge: violet for what is coming down it, red hot for an opening. */
  private warn(lane: Lane, hot: boolean): void {
    const current = this.warnings.get(lane);
    if (current && current.hot === hot) return;
    this.unwarn(lane);
    const { scene } = this.ctx;
    const cam = scene.cameras.main;
    const y = this.laneY(lane);
    const g = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.CONTACT_SHADOW);
    g.fillStyle(hot ? HOT_COLOR : WARN_COLOR, 0.28).fillRect(0, y - WARN_GLOW_PX, cam.width, WARN_GLOW_PX);
    g.fillStyle(hot ? HOT_COLOR : WARN_COLOR, 1).fillRect(0, y - 2, cam.width, WARN_PX);
    g.fillStyle(hot ? HOT_CORE : WARN_CORE, 1).fillRect(0, y, cam.width, 2);
    this.warnings.set(lane, { g, hot });
  }

  private unwarn(lane: Lane): void {
    this.warnings.get(lane)?.g.destroy();
    this.warnings.delete(lane);
  }

  /** The first time something asks for the dash: a keycap over the roach (the key on a keyboard, the button's name on a
   * phone), until it dashes or the time is up. The only words the fight uses to teach. */
  private showKeycap(ms: number): void {
    this.hideKeycap();
    const { scene } = this.ctx;
    const touch = !scene.sys.game.device.os.desktop;
    this.keycap = touch ? addKeycap(scene, 'DASH') : addArrowKeycap(scene, 'right');
    this.keycapUntil = this.clock + ms;
    this.drawKeycap();
  }

  private drawKeycap(): void {
    const keycap = this.keycap;
    if (!keycap) return;
    const { player, scene } = this.ctx;
    if (player.isDashing || this.clock > this.keycapUntil) {
      this.hideKeycap();
      return;
    }
    keycap.setPosition(Math.round(player.sprite.x), Math.round(player.sprite.y - KEYCAP_ABOVE_PX + keycapBob(scene.time.now)));
  }

  private hideKeycap(): void {
    this.keycap?.destroy();
    this.keycap = null;
  }

  private score(points: number, label: string, color: string): void {
    this.ctx.addScore(points);
    this.popup(label ? `${label} +${points}` : `+${points}`, color);
  }

  private popup(text: string, color: string, size = 10): void {
    const { scene, player } = this.ctx;
    const label = scene.add.text(player.x, player.y - 40, text, popupStyle({ fontSize: `${size}px`, color }))
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
    for (const obj of this.effects) obj.destroy();
    this.effects = [];
    for (const obj of [this.strips.top, this.strips.bottom, this.light, this.dim, this.pulse, this.pips, this.meters,
      this.coneGlow.top, this.coneGlow.bottom]) {
      obj.destroy();
    }
    this.events = [];
    // Lost, he and his speakers stay a moment where they were
    const left = [this.dj, this.speakers.top.sprite, this.speakers.bottom.sprite].filter(s => s.active);
    if (!left.length) return;
    this.ctx.scene.tweens.add({
      targets: left, alpha: 0, duration: FADE_MS, delay: 300, onComplete: () => left.forEach(s => s.destroy()),
    });
  }

  /** For scripted runs: what is coming at which lane and how soon, and what is open. */
  get threat(): {
    hazards: { kind: string; lane: Lane | 'both'; dt: number; lasts: number }[];
    open: Target | null; phase: number; feed: Record<Target, number>; stopped: boolean;
  } {
    const roachX = this.ctx.player.sprite.x;
    const hazards: { kind: string; lane: Lane | 'both'; dt: number; lasts: number }[] = [];
    const groups = new Set<object>();
    for (const m of this.movers) {
      if (m.resolved) continue;
      const dt = (m.sprite.x - roachX) / m.speed;
      if (m.group) {
        if (groups.has(m.group)) continue;
        groups.add(m.group);
        hazards.push({ kind: 'drop', lane: 'both', dt, lasts: 0 });
      } else hazards.push({ kind: m.kind, lane: m.lane, dt, lasts: 0 });
    }
    for (const f of this.flashes) {
      if (f.group) {
        if (groups.has(f.group)) continue;
        groups.add(f.group);
        hazards.push({ kind: 'drop', lane: 'both', dt: f.at - this.clock, lasts: LIGHT_MS });
      } else hazards.push({ kind: f.kind, lane: f.lane, dt: f.at - this.clock, lasts: LIGHT_MS });
    }
    return { hazards, open: this.overload?.target ?? null, phase: this.phaseIndex, feed: { ...this.feed }, stopped: this.stopped };
  }
}
