/**
 * Pani Lodzia: no guns, the roach only hops. She stands at the right of the screen and throws everything she has at
 * the lane the roach is on, one idea at a time: her slipper slammed on a lane (a shockwave runs it), slippers whipped
 * along the lane from her housecoat pocket (singly, or three in a row along both lanes), a boomerang slipper that
 * comes back along the other lane and hits her in the face, and curlers that bounce from lane to lane and settle on
 * the roach's. Three phases with a breather between
 * them; her stamina goes with every dodge, more with a close one, a lot with every boomerang in the face. Dodges only
 * wear her to a sliver: she is on her last legs, the bar blinks, and the boomerang in her face is what puts her down
 * (the next attack is one, if none is out already).
 *
 * What comes when is in lodziaPatterns (and tested there); this plays it, and moves what she throws so it reaches the
 * roach exactly when the patterns say.
 */
import Phaser from 'phaser';
import { VOL } from '../../audio/AudioManager';
import { parseRoach } from '../../config/skins';
import { DEPTH } from '../../config/constants';
import { SPRITE_SCALE } from '../../config/sprites';
import { getFx } from '../../effects/Fx';
import { popup } from '../../effects/Popup';
import { LandingShadow, ShadowLook, Spot } from '../../effects/LandingShadow';
import { popupStyle } from '../../utils/TextStyles';
import { NEAR_MISS_SCORE } from '../RiskBonus';
import { BossFight, BossFightContext } from './BossFight';
import {
  createLodziaAnimations, LODZIA_FACE, LODZIA_HELD, LODZIA_LANDING, LODZIA_REACH_BACK, LODZIA_RELEASE, LODZIA_TEXTURE,
  LodziaAnim, lodziaAnimKey, lodziaFrame,
} from './lodziaConfig';
import {
  Attack, atSliver, attackLength, BOOMERANG_RELEASE_MS, buildPhases, CLOSE_CALL_DAMAGE, CLOSE_CALL_MS, curlerArrival,
  curlerLanding, CURLER_LANDINGS, DODGE_DAMAGE, dodgeWear, FACE_MS, fightRandom, HazardKind, Lane, nextStep, other,
  Phase, resolve, SLAM_IMPACT_MS, SMACK_DAMAGE, smackWear, STAMINA, TANTRUM_RELEASE_MS, THROW_MS, THROW_RELEASE_MS,
  timeAttack, WAVE_MS, WINDUP_MS,
} from './lodziaPatterns';
import { Flight, Pass, Projectile } from './lodziaProjectiles';
import { glint, Halo, sparkBurst } from './bossTelegraph';
import { Shockwave } from './lodziaShockwave';

const VICTORY_BONUS = 300;
/** Every hazard dodged. */
const DODGE_SCORE = 10;

/** Her drawn-back slipper stays this far inside the screen's right edge. */
const EDGE_MARGIN = 6;
/** She waddles in from past the right edge while the roach brakes. */
const WALK_MS = 2000;
/** On her spot, a beat before the first attack. */
const SETTLE_MS = 700;
/** Between phases she pants this long. */
const TIRED_MS = 1500;
/** The bar is empty: everything stops this long (a hit-stop), then she goes down. */
const HIT_STOP_MS = 120;
/** Sitting on the floor, dazed, before the run picks up again: short, the reward beat comes next. */
const DEFEAT_HOLD_MS = 450;
const FADE_MS = 300;

/** What flies, flies this high over its lane: about the roach's middle. */
const FLY_HEIGHT = 24;
/** Each of a curler's three leaps peaks this high over the higher lane: every one clearly lower than the last. */
const CURLER_ARCS = [44, 26, 10];
/** It flattens as it lands, by this much, for this long; the last landing, the settle, flat for longer. */
const CURLER_SQUASH = 0.5;
const CURLER_SQUASH_MS = 110;
const CURLER_SETTLE_HOLD_MS = 140;
const CURLER_SETTLE_SQUASH_MS = 220;
/** The shadow where it will land next: a plain one, and a wider pink one for the settle. */
const CURLER_MARK_WIDTH = 56;
const CURLER_MARK_SETTLE_WIDTH = 90;
/** A curler is bigger than a slipper: it flies this much lower, its middle about the roach's. */
const CURLER_FLY_HEIGHT = 22;
/** The boomerang turns back this far inside the screen's left edge. */
const RICOCHET_INSET = 20;

const SHAKE_MS = 140;
const SHAKE = 0.012;
const WARN_COLOR = 0xff3b2f;
/** The slam's warning: a thick strip along its lane and a glow above it, pulsing. */
const WARN_PX = 8;
const WARN_GLOW_PX = 26;
const WARN_PULSE_MS = 160;
/**
 * What she throws marks no lane: its warning is on her. The thing in her hand glows and flares in these colours as she
 * draws it, and bursts in them as it leaves; in flight it leaves a trail of them.
 */
const SLIPPER_GLOW = 0xffe08a;
const BOOMERANG_GLOW = 0xffa64d;
const CURLER_GLOW = 0xff6ab4;
const SLIPPER_TRAIL = { color: 0xffe9b8, ms: 280, size: 12 };
const BOOMERANG_TRAIL = { color: 0xffa64d, ms: 420, size: 14 };
const CURLER_TRAIL = { color: 0xff6ab4, ms: 300, size: 10 };
/** The boomerang's swing onto the lane it returns on is done this far into its way back. */
const SWING_SHARE = 1 / 3;
/** What she holds in her hand, glowing: the glow's size grows from the first frame to the last held one. */
const HELD_RADIUS = [22, 38];

const SFX = {
  whoosh: 'lodzia-whoosh',
  slap: 'lodzia-slap',
  shockwave: 'lodzia-shockwave',
  throw: 'lodzia-spin',
  pocket: 'lodzia-pocket',
  closeCall: 'na-styk',
  smack: 'lodzia-smack',
  ricochet: 'lodzia-boomerang',
  stamp: 'lodzia-stomp',
  curler: 'lodzia-curler',
  defeat: 'boss-victory',
};
const BGM = 'boss-bgm';

/** For a scripted player (the dev driver): something coming at the roach, on a lane, at a scene time. */
export interface Threat {
  lane: Lane;
  at: number;
  kind: HazardKind;
  /** When a player can first read it (scene time). */
  cue: number;
}

type HeldAnim = keyof typeof LODZIA_HELD;

export class LodziaFight extends BossFight {
  readonly victoryBonus = VICTORY_BONUS;

  private readonly lodzia: Phaser.GameObjects.Sprite;
  private readonly phases: Phase[];
  private stamina = STAMINA;
  /** The attack in play is the last one her list had to give: its smack takes whatever she has left. */
  private lethalSmack = false;
  private phaseIndex = 0;
  private attackIndex = 0;
  /** The shadow on the lane where a curler will land next: where, and in which look (the settle's is pink). */
  private landingMark: { spot: Spot; look: ShadowLook } | null = null;
  private readonly landingShadow: LandingShadow;
  private slamWarning: { lane: Lane; g: Phaser.GameObjects.Graphics; pulse: Phaser.Tweens.Tween } | null = null;
  /** What she is winding up to throw: it glows in her hand, flaring on `flares` (frames of the animation). */
  private held: { anim: HeldAnim; flares: number[]; last: number; shown: boolean; flared: Set<number> } | null = null;
  private readonly heldHalo: Halo;
  private projectiles: Projectile[] = [];
  private shockwaves: Shockwave[] = [];
  private effects: Phaser.GameObjects.GameObject[] = [];
  /** Coming at the roach, for a scripted player, and as a record of what the fight sent. */
  private _threats: Threat[] = [];
  /** Every attack kind she has started, and how many boomerangs hit her: what a test run looks for. */
  readonly seen: Record<string, number> = {};
  private roachIdle: string | null = null;
  private stopped = false;
  private walkX: number | null;
  private readonly onPostUpdate = () => this.postUpdate();

  constructor(ctx: BossFightContext) {
    super(ctx);
    const { scene } = ctx;
    createLodziaAnimations(scene);
    this.phases = buildPhases(fightRandom(ctx.seed, ctx.boss.id));

    // She walks in from just past the right edge to her spot near it while the roach brakes; the camera follows the
    // roach until it stops, so she is placed on the screen, not in the world, until then
    const cam = scene.cameras.main;
    this.walkX = cam.width + 40 * SPRITE_SCALE;
    this.lodzia = scene.add.sprite(cam.scrollX + this.walkX, ctx.floorBottomY, LODZIA_TEXTURE, lodziaFrame('walk'));
    this.lodzia.setScale(SPRITE_SCALE).setDepth(DEPTH.OBSTACLES);
    this.play('walk');
    this.heldHalo = new Halo(scene, SLIPPER_GLOW, DEPTH.OBSTACLES - 0.2);
    this.landingShadow = new LandingShadow(scene);
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.onPostUpdate);

    let ready = 0;
    const both = () => { if (++ready === 2) this.delay(SETTLE_MS, () => this.startFighting()); };
    scene.tweens.add({
      targets: this,
      walkX: cam.width - LODZIA_REACH_BACK * SPRITE_SCALE - EDGE_MARGIN,
      duration: WALK_MS,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.lodzia.x = cam.scrollX + this.walkX!;
        this.walkX = null;
        this.play('idle');
        both();
      },
    });
    this.brake(() => {
      this.stopped = true;
      both();
    });
  }

  /** What is coming at the roach and when (scene time), soonest first. */
  get threats(): Threat[] {
    const now = this.ctx.scene.time.now;
    return this._threats.filter(t => t.at > now - 80).sort((a, b) => a.at - b.at);
  }

  get staminaLeft(): number { return this.stamina; }

  /** Won or lost: a hit can end the fight in the middle of a frame, and what is left of the frame must not draw. */
  private get over(): boolean { return this.state === 'done'; }

  private startFighting(): void {
    this.state = 'fighting';
    this.ctx.audio.switchBGM(BGM);
    this.ctx.showBar(this.stamina, STAMINA);
    this.nextAttack();
  }

  update(): void {
    if (this.state === 'done') return;
    if (this.walkX !== null) this.lodzia.x = this.ctx.scene.cameras.main.scrollX + this.walkX;
    if (!this.stopped) return;
    this.holdPlayer();
    this.standRoach();
  }

  /** After the floor has laid its tiles out for the frame: shockwaves bump them; what she threw moves and hits. */
  private postUpdate(): void {
    // Won or lost this frame (a hit tears the fight down from inside this loop): nothing more to move or draw
    if (this.over) return;
    this.drawHeld();
    if (this.landingMark) this.landingShadow.showSpots([this.landingMark.spot], this.landingMark.look);
    for (const wave of this.shockwaves) wave.update();
    this.shockwaves = this.shockwaves.filter(w => !w.done);
    const laneAt = (time: number) => this.laneAt(time);
    for (const p of this.projectiles) {
      if (this.over) return;
      p.update(laneAt);
    }
    this.projectiles = this.projectiles.filter(p => !p.done);
  }

  // ── The fight's course ────────────────────────────────────────────

  private nextAttack(): void {
    if (this.state !== 'fighting') return;
    const step = nextStep(this.phases, this.phaseIndex, this.attackIndex, this.stamina);
    if (step.kind === 'breather') {
      this.endPhase();
      return;
    }
    if (step.listed) this.attackIndex++;
    this.lethalSmack = step.lethal;
    this.run(step.attack);
    // The next wind-up only once this attack's threat has gone past the roach (and her part is done)
    this.delay(attackLength(step.attack), () => this.nextAttack());
  }

  private endPhase(): void {
    this.play('hurt', () => {
      this.play('tired');
      this.delay(TIRED_MS, () => {
        this.phaseIndex++;
        this.attackIndex = 0;
        this.play('idle');
        this.delay(SETTLE_MS, () => this.nextAttack());
      });
    });
  }

  /** The boomerang finished her: on this frame. What is in the air goes up in puffs, a beat's hit-stop, and down she goes. */
  private finishHer(): void {
    if (this.state !== 'fighting') return;
    this.state = 'victory';
    this.unwarnSlam();
    this.clearLandingMark();
    this.held = null;
    this.heldHalo.hide();
    for (const p of this.projectiles) {
      this.puff(p.position.x, p.position.y);
      p.destroy();
    }
    for (const w of this.shockwaves) w.destroy();
    this.projectiles = [];
    this.shockwaves = [];
    this.ctx.scene.cameras.main.shake(HIT_STOP_MS + 80, SHAKE);
    this.lodzia.anims.pause();
    this.delay(HIT_STOP_MS, () => this.defeat());
  }

  private defeat(): void {
    this.state = 'victory';
    this.ctx.audio.playSfx(SFX.defeat, VOL.stinger);
    this.play('defeat', () => this.delay(DEFEAT_HOLD_MS, () => {
      this.ctx.scene.tweens.add({ targets: this.lodzia, alpha: 0, duration: FADE_MS, onComplete: () => this.win() });
    }));
  }

  /** One attack, aimed at the lane the roach is on now. */
  private run(attack: Attack): void {
    const roachLane = this.ctx.player.currentFloor;
    const now = this.ctx.scene.time.now;
    this.seen[attack.kind] = (this.seen[attack.kind] ?? 0) + 1;
    for (const h of timeAttack(attack).hazards) {
      this._threats.push({ lane: resolve(h.rel, roachLane), at: now + h.t, kind: h.kind, cue: now + h.cue });
    }
    // Everything that reaches the roach is timed from the attack's start, as planned, not from when a timer got round
    // to it: a long frame never makes something late, so it always arrives when its wind-up said
    switch (attack.kind) {
      case 'slam':
        this.slam(roachLane, attack.hold, now);
        break;
      case 'throw':
        this.throwSlipper(roachLane, attack.travel, now);
        break;
      case 'volley': {
        // One after another, each with its own wind-up; closer than her throw takes, she whips them faster
        const scale = Math.min(1, attack.spacing / THROW_MS);
        attack.lanes.forEach((rel, i) => {
          const lane = resolve(rel, roachLane);
          const go = () => this.throwSlipper(lane, attack.travel, now + i * attack.spacing, scale);
          if (i === 0) go();
          else this.delay(i * attack.spacing, go);
        });
        break;
      }
      case 'boomerang':
        this.boomerang(roachLane, attack.travel, attack.back, now);
        break;
      case 'curler':
        this.tantrum(roachLane, attack.beat, attack.settle, now);
        break;
    }
  }

  // ── Slam ──────────────────────────────────────────────────────────

  private slam(lane: Lane, hold: number, startedAt: number): void {
    this.warnSlam(lane);
    this.play(`windup-${lane}`);
    const landsAt = startedAt + WINDUP_MS + hold + SLAM_IMPACT_MS;
    this.delay(WINDUP_MS + hold, () => {
      this.ctx.audio.playSfx(SFX.whoosh, VOL.boss);
      this.play(`slam-${lane}`, () => this.rest());
      this.delay(Math.max(0, landsAt - this.ctx.scene.time.now), () => this.impact(lane, landsAt));
    });
  }

  /** The slipper lands in front of her and a shockwave races along the lane to the roach. */
  private impact(lane: Lane, landedAt: number): void {
    if (this.state !== 'fighting') return;
    const { scene, audio } = this.ctx;
    this.unwarnSlam();
    scene.cameras.main.shake(SHAKE_MS, SHAKE);
    audio.playSfx(SFX.slap, VOL.boss);
    audio.playSfx(SFX.shockwave, VOL.boss);
    const fromX = this.lodzia.x + LODZIA_LANDING[lane].x * SPRITE_SCALE;
    this.burst(fromX, this.laneY(lane));
    const startedAt = landedAt;
    this.shockwaves.push(new Shockwave(scene, {
      startedAt,
      laneY: this.laneY(lane),
      fromX,
      roachX: this.holdX,
      toRoachMs: WAVE_MS,
      onReachRoach: () => {
        scene.cameras.main.shake(SHAKE_MS / 2, SHAKE / 2);
        this.resolveHazard(lane, startedAt + WAVE_MS, this.laneAt(startedAt + WAVE_MS) === lane);
      },
    }));
  }

  // ── Thrown ────────────────────────────────────────────────────────

  /** She pulls a fresh slipper from her pocket and whips it along the lane. */
  private throwSlipper(lane: Lane, travel: number, startedAt: number, scale = 1): void {
    this.ctx.audio.playSfx(SFX.pocket, VOL.obstacle);
    this.play(`throw-${lane}`, () => this.rest(), 1 / scale);
    this.hold(`throw-${lane}`, SLIPPER_GLOW, [3], 3);
    const releasedAt = startedAt + THROW_RELEASE_MS * scale;
    this.delay(Math.max(0, releasedAt - this.ctx.scene.time.now), () => {
      this.ctx.audio.playSfx(SFX.throw, VOL.boss);
      const from = this.release(`throw-${lane}`);
      this.letGo(from, SLIPPER_GLOW);
      this.launch(this.straight(from, lane, travel), releasedAt);
    });
  }

  /** A slipper's flight along a lane: it drops from her hand to flying height early on, then straight on, leftwards. */
  private straight(from: { x: number; y: number }, lane: Lane, travel: number): Flight {
    const flyY = this.laneY(lane) - FLY_HEIGHT;
    const speed = (from.x - this.holdX) / travel;
    const left = this.ctx.scene.cameras.main.scrollX - 60;
    const duration = (from.x - left) / speed;
    return {
      sprite: 'kapec',
      trail: SLIPPER_TRAIL,
      at: (t) => {
        const drop = Phaser.Math.Easing.Quadratic.Out(Math.min(1, t / (travel * 0.35)));
        return { x: from.x - speed * t, y: Phaser.Math.Linear(from.y, flyY, drop), lane };
      },
      passes: [{ at: travel, lane }],
      duration,
    };
  }

  /** Twirled overhead, thrown far: out along the lane, off the left edge, back along the other lane, into her face. */
  private boomerang(lane: Lane, travel: number, back: number, startedAt: number): void {
    this.play('boomerang', () => this.rest());
    this.hold('boomerang', BOOMERANG_GLOW, [5], 5);
    const releasedAt = startedAt + BOOMERANG_RELEASE_MS;
    this.delay(Math.max(0, releasedAt - this.ctx.scene.time.now), () => {
      this.ctx.audio.playSfx(SFX.throw, VOL.boss);
      const from = this.release('boomerang');
      this.letGo(from, BOOMERANG_GLOW);
      const face = { x: this.lodzia.x + LODZIA_FACE.x * SPRITE_SCALE, y: this.ctx.floorBottomY + LODZIA_FACE.y * SPRITE_SCALE };
      const outY = this.laneY(lane) - FLY_HEIGHT;
      const backLane = other(lane);
      const backY = this.laneY(backLane) - FLY_HEIGHT;
      const edge = this.ctx.scene.cameras.main.scrollX + RICOCHET_INSET;
      const speed = (from.x - this.holdX) / travel;
      const atEdge = travel + (this.holdX - edge) / speed;
      const returnAt = travel + back;
      const homeAt = returnAt + FACE_MS;
      let bounced = false;
      const flight: Flight = {
        sprite: 'boomerang-slipper',
        trail: BOOMERANG_TRAIL,
        at: (t) => {
          if (t < atEdge) {
            const drop = Phaser.Math.Easing.Quadratic.Out(Math.min(1, t / (travel * 0.35)));
            return { x: from.x - speed * t, y: Phaser.Math.Linear(from.y, outY, drop), lane };
          }
          if (!bounced) {
            bounced = true;
            this.ctx.audio.playSfx(SFX.ricochet, VOL.boss);
            this.puff(edge, outY);
            this.flare(edge, outY, BOOMERANG_GLOW);
          }
          if (t < returnAt) {
            // Off the wall it swings onto the return lane at once, so the player sees where it is coming: the height
            // is the return lane's within the first third of the way back
            const k = (t - atEdge) / (returnAt - atEdge);
            const swing = Phaser.Math.Easing.Sine.Out(Math.min(1, k / SWING_SHARE));
            return { x: Phaser.Math.Linear(edge, this.holdX, k), y: Phaser.Math.Linear(outY, backY, swing), lane: backLane };
          }
          const k = Math.min(1, (t - returnAt) / FACE_MS);
          return { x: Phaser.Math.Linear(this.holdX, face.x, k), y: Phaser.Math.Linear(backY, face.y, k * k), lane: backLane };
        },
        passes: [{ at: travel, lane }, { at: returnAt, lane: backLane }],
        duration: homeAt,
      };
      const p = this.launch(flight, releasedAt);
      p.onEnd = () => this.smack(face);
    });
  }

  /** The boomerang comes home: in her face. */
  private smack(face: { x: number; y: number }): void {
    if (this.state !== 'fighting') return;
    this.seen.smack = (this.seen.smack ?? 0) + 1;
    this.ctx.audio.playSfx(SFX.smack, VOL.big);
    this.ctx.scene.cameras.main.shake(SHAKE_MS, SHAKE);
    this.puff(face.x, face.y);
    this.play('hurt', () => this.rest());
    this.setStamina(smackWear(this.stamina, this.lethalSmack));
    this.popupAt(face.x, face.y - 30, `AUĆ! -${SMACK_DAMAGE}`, '#ffb070');
  }

  /** Stamping, she hurls a curler: it bounces three times on a steady beat, each leap lower, and the third landing,
   * where it settles on the roach's lane, is the cue: it rolls flat at the roach, the same time every attack. */
  private tantrum(roachLane: Lane, beat: number, settle: number, startedAt: number): void {
    this.play('tantrum', () => this.rest());
    this.hold('tantrum', CURLER_GLOW, [1], 2);
    this.delay(0, () => this.ctx.audio.playSfx(SFX.stamp, VOL.big));
    const releasedAt = startedAt + TANTRUM_RELEASE_MS;
    this.delay(Math.max(0, releasedAt - this.ctx.scene.time.now), () => {
      const from = this.release('tantrum');
      this.letGo(from, CURLER_GLOW);
      this.launch(this.curlerFlight(from, roachLane, beat, settle), releasedAt);
    });
  }

  /** The lane a curler lands on at its k-th landing: the roach's, the other, the roach's again (where it stays). */
  private curlerLane(arrive: Lane, k: number): Lane {
    return (CURLER_LANDINGS - 1 - k) % 2 === 0 ? arrive : other(arrive);
  }

  private curlerFlight(from: { x: number; y: number }, arrive: Lane, beat: number, settle: number): Flight {
    const arrival = curlerArrival(beat, settle);
    const speed = (from.x - this.holdX) / arrival;
    const left = this.ctx.scene.cameras.main.scrollX - 40;
    const flyY = (lane: Lane) => this.laneY(lane) - CURLER_FLY_HEIGHT;
    const landings = Array.from({ length: CURLER_LANDINGS }, (_, k) => curlerLanding(beat, k));
    const last = landings.length - 1;
    const xAt = (t: number) => from.x - speed * t;
    let landed = 0;
    // The first landing's shadow is there from the moment it leaves her fist
    this.markLanding(xAt(landings[0]), this.curlerLane(arrive, 0), false);
    return {
      sprite: 'curler',
      trail: CURLER_TRAIL,
      at: (t) => {
        const x = xAt(t);
        // Every landing sparks and clicks and shows the next one's shadow; the last, the settle, lands like the slam
        while (landed < landings.length && t >= landings[landed]) {
          const lane = this.curlerLane(arrive, landed);
          const settled = landed === last;
          this.ctx.audio.playSfx(SFX.curler, settled ? VOL.boss : VOL.pickup);
          sparkBurst(this.ctx.scene, x, this.laneY(lane) - 2, CURLER_GLOW, settled ? 10 : 6, -1, settled ? 40 : 26);
          if (settled) {
            this.clearLandingMark();
            this.ctx.audio.playSfx(SFX.slap, VOL.boss);
            this.ctx.scene.cameras.main.shake(SHAKE_MS / 2, SHAKE / 2);
            this.burst(x, this.laneY(lane));
            glint(this.ctx.scene, x, flyY(lane), CURLER_GLOW, 34, 380);
          } else {
            this.markLanding(xAt(landings[landed + 1]), this.curlerLane(arrive, landed + 1), landed + 1 === last);
          }
          landed++;
        }
        if (t >= landings[last]) {
          // Settled: it stops bouncing and rolls flat along the roach's lane, after a squash that holds
          const since = t - landings[last];
          const squash = since < CURLER_SETTLE_HOLD_MS ? 1 : Math.max(0, 1 - (since - CURLER_SETTLE_HOLD_MS) / CURLER_SETTLE_SQUASH_MS);
          return { x, y: flyY(arrive), lane: arrive, squash };
        }
        // Each leap a beat long, from where it was (her fist, then the lane it landed on) to the next landing, lower each time
        const k = Math.floor(t / beat);
        const u = (t - k * beat) / beat;
        const a = k === 0 ? from.y : flyY(this.curlerLane(arrive, k - 1));
        const b = flyY(this.curlerLane(arrive, k));
        const y = Phaser.Math.Linear(a, b, u) - Math.sin(u * Math.PI) * CURLER_ARCS[k];
        const squash = k === 0 ? 0 : CURLER_SQUASH * Math.max(0, 1 - (t - k * beat) / CURLER_SQUASH_MS);
        return { x, y, lane: this.curlerLane(arrive, k), squash };
      },
      passes: [{ at: arrival, lane: arrive }],
      duration: (from.x - left) / speed,
    };
  }

  /** The shadow on the lane where the curler comes down next, hot; the settle's is wider and pink. */
  private markLanding(x: number, lane: Lane, settle: boolean): void {
    const half = (settle ? CURLER_MARK_SETTLE_WIDTH : CURLER_MARK_WIDTH) / 2;
    this.landingMark = { spot: { x0: x - half, x1: x + half, y: this.laneY(lane) + 1, progress: 1 }, look: settle ? 'pink' : 'warm' };
  }

  private clearLandingMark(): void {
    this.landingMark = null;
    this.landingShadow.hide();
  }

  private launch(flight: Flight, releasedAt: number): Projectile {
    const p = new Projectile(this.ctx.scene, flight, releasedAt);
    p.onHit = (pass) => this.projectileHit(p, pass);
    p.onMissed = (pass) => this.resolveHazard(pass.lane, this.ctx.scene.time.now - (p.elapsed - pass.at), false);
    this.projectiles.push(p);
    return p;
  }

  private projectileHit(p: Projectile, pass: Pass): void {
    const { scene } = this.ctx;
    const at = scene.time.now - (p.elapsed - pass.at);
    // A moult took it and it flies on; or the roach is down, and the fight is being taken down with it
    this.resolveHazard(pass.lane, at, true);
  }

  // ── Hits, dodges, stamina ─────────────────────────────────────────

  /** Something reached the roach's x on a lane: it got the roach if it was in that lane (counted from the press). */
  private resolveHazard(lane: Lane, at: number, inLane: boolean): void {
    if (this.state !== 'fighting') return;
    const { audio, player } = this.ctx;
    // A moult takes the blow (or the roach is still out of its shell from one): survived, without the points
    if (inLane && !player.inMoultGrace && !this.ctx.survivesHit()) {
      this.lose('lodzia');
      return;
    }
    if (inLane) {
      this.seen.absorbed = (this.seen.absorbed ?? 0) + 1;
      this.wearDodge(DODGE_DAMAGE);
      return;
    }
    const hop = player.lastHop;
    const close = hop !== null && hop.from === lane && at - hop.at <= CLOSE_CALL_MS && at >= hop.at;
    if (close) audio.playSfx(SFX.closeCall, VOL.stinger);
    const points = close ? DODGE_SCORE + NEAR_MISS_SCORE : DODGE_SCORE;
    this.ctx.addScore(points);
    this.wearDodge(close ? DODGE_DAMAGE + CLOSE_CALL_DAMAGE : DODGE_DAMAGE);
    this.popupAt(player.x, player.y - 40, close ? `NA STYK! +${points}` : `+${points}`, close ? '#7fe0ff' : '#ffdd00');
  }

  /** A dodge wears her down, but never into the sliver's last points: those are the boomerang's. */
  private wearDodge(amount: number): void {
    this.setStamina(dodgeWear(this.stamina, amount));
  }

  private setStamina(value: number): void {
    const wasLast = atSliver(this.stamina);
    this.stamina = Math.max(0, value);
    this.ctx.updateBar(this.stamina, atSliver(this.stamina));
    if (this.stamina <= 0) this.finishHer();
    else if (atSliver(this.stamina) && !wasLast && this.lodzia.anims.getName() === lodziaAnimKey('idle')) this.play('tired');
  }

  // ── Looks ─────────────────────────────────────────────────────────

  private laneY(lane: Lane): number { return lane === 'top' ? this.ctx.floorTopY : this.ctx.floorBottomY; }

  /** The roach's lane at a scene time just gone (the lane counts from the press): a timer or a frame that comes late
   * still judges by where the roach was when the thing reached it. Hops are never closer than the frame, so the last
   * one is enough to know. */
  private laneAt(time: number): Lane {
    const hop = this.ctx.player.lastHop;
    return hop && hop.at > time ? hop.from : this.ctx.player.currentFloor;
  }

  /** Where a throw leaves her, in the world. */
  private release(anim: keyof typeof LODZIA_RELEASE): { x: number; y: number } {
    const at = LODZIA_RELEASE[anim];
    return { x: this.lodzia.x + at.x * SPRITE_SCALE, y: this.ctx.floorBottomY + at.y * SPRITE_SCALE };
  }

  /** What she does between attacks: stands, or on her last legs, sags. */
  private rest(): void {
    this.play(atSliver(this.stamina) ? 'tired' : 'idle');
  }

  private play(anim: LodziaAnim, then?: () => void, timeScale = 1): void {
    const key = lodziaAnimKey(anim);
    this.lodzia.play({ key, timeScale });
    if (then) this.lodzia.once(`${Phaser.Animations.Events.ANIMATION_COMPLETE_KEY}${key}`, () => {
      if (this.state !== 'done') then();
    });
  }

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
   * Her telegraph for something thrown: what is in her hand glows and flares (on `flares`, frames of the wind-up) as
   * she draws it, until it leaves. `last`: the last frame of the wind-up it is in her hand.
   */
  private hold(anim: HeldAnim, color: number, flares: number[], last: number): void {
    this.held = { anim, flares, last, shown: false, flared: new Set() };
    this.heldHalo.color = color;
  }

  private drawHeld(): void {
    const held = this.held;
    if (!held) return;
    const sprite = this.lodzia;
    if (sprite.anims.getName() !== lodziaAnimKey(held.anim)) {
      this.held = null;
      this.heldHalo.hide();
      return;
    }
    const index = Number(sprite.frame.name.split('_').pop());
    const at = index <= held.last ? LODZIA_HELD[held.anim][index] : undefined;
    if (!at) {
      this.heldHalo.hide();
      return;
    }
    const x = sprite.x + at.x * SPRITE_SCALE;
    const y = this.ctx.floorBottomY + at.y * SPRITE_SCALE;
    const color = this.heldHalo.color;
    // It appears with a flare, and the last held frame flares bigger: now
    if (!held.shown) {
      held.shown = true;
      glint(this.ctx.scene, x, y, color, 18);
    }
    if (held.flares.includes(index) && !held.flared.has(index)) {
      held.flared.add(index);
      glint(this.ctx.scene, x, y, color, 36, 380);
    }
    const progress = Math.min(1, index / held.last);
    const radius = Phaser.Math.Linear(HELD_RADIUS[0], HELD_RADIUS[1], progress) + 2 * Math.sin(this.ctx.scene.time.now / 45);
    this.heldHalo.show(x, y, radius, 0.55 + 0.45 * progress);
  }

  /** It leaves her hand: a burst in its colour. */
  private letGo(from: { x: number; y: number }, color: number): void {
    this.held = null;
    this.heldHalo.hide();
    glint(this.ctx.scene, from.x, from.y, color, 22, 300);
    sparkBurst(this.ctx.scene, from.x, from.y, color, 10, -1, 48);
  }

  /** A flash where the boomerang hits the wall: the sparks fly back. */
  private flare(x: number, y: number, color: number): void {
    glint(this.ctx.scene, x, y, color, 34, 380);
    sparkBurst(this.ctx.scene, x, y, color, 12, 1, 56);
  }

  /** The slam's lane glows red along its edge, with a mark where the slipper will land. */
  private warnSlam(lane: Lane): void {
    if (this.slamWarning?.lane === lane) return;
    this.unwarnSlam();
    const { scene } = this.ctx;
    const cam = scene.cameras.main;
    const y = this.laneY(lane);
    const g = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.CONTACT_SHADOW);
    g.fillStyle(WARN_COLOR, 0.3).fillRect(0, y - WARN_GLOW_PX, cam.width, WARN_GLOW_PX);
    g.fillStyle(WARN_COLOR, 1).fillRect(0, y - 2, cam.width, WARN_PX);
    g.fillStyle(0x000000, 0.5).fillEllipse(this.lodzia.x + LODZIA_LANDING[lane].x * SPRITE_SCALE - cam.scrollX, y + 1, 70, 8);
    g.setAlpha(0.4);
    const pulse = scene.tweens.add({ targets: g, alpha: 0.85, duration: WARN_PULSE_MS, yoyo: true, repeat: -1 });
    this.slamWarning = { lane, g, pulse };
  }

  private unwarnSlam(): void {
    this.slamWarning?.pulse.remove();
    this.slamWarning?.g.destroy();
    this.slamWarning = null;
  }

  /** Dust thrown up both ways where the slipper lands, and a ring on the ledge. */
  private burst(x: number, y: number): void {
    const fx = getFx(this.ctx.scene);
    const depth = DEPTH.PICKUPS + 1;
    fx.play('dust-land', x, y, { depth });
    fx.play('ring', x, y, { depth });
    fx.burst('dust', x - 10, y, 3, 6, { depth, speed: [120, 220], angle: [190, 215], drag: 2.5 });
    fx.burst('dust', x + 10, y, 2, 6, { depth, speed: [120, 220], angle: [325, 350], drag: 2.5 });
  }

  /** The little cloud where something hits. */
  private puff(x: number, y: number): void {
    const sprite = this.ctx.scene.add.sprite(x, y, LODZIA_TEXTURE, lodziaFrame('puff'))
      .setScale(SPRITE_SCALE).setDepth(DEPTH.PICKUPS + 2);
    this.track(sprite);
    sprite.play(lodziaAnimKey('puff'));
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.untrack(sprite));
  }

  private popupAt(x: number, y: number, text: string, color: string): void {
    popup(this.ctx.scene, x, y, text, popupStyle({ fontSize: '10px', color }), { hold: 250 });
  }

  private track(obj: Phaser.GameObjects.GameObject): void {
    this.effects.push(obj);
  }

  private untrack(obj: Phaser.GameObjects.GameObject): void {
    this.effects = this.effects.filter(o => o !== obj);
    obj.destroy();
  }

  protected teardown(): void {
    this.ctx.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.onPostUpdate);
    for (const wave of this.shockwaves) wave.destroy();
    for (const p of this.projectiles) p.destroy();
    this.heldHalo.destroy();
    this.shockwaves = [];
    this.projectiles = [];
    this.unwarnSlam();
    this.clearLandingMark();
    this.landingShadow.destroy();
    for (const obj of this.effects) obj.destroy();
    this.effects = [];
    // Lost, she stays a moment where she stood
    const lodzia = this.lodzia;
    if (!lodzia.active) return;
    lodzia.anims.stop();
    this.ctx.scene.tweens.add({ targets: lodzia, alpha: 0, duration: FADE_MS, delay: 300, onComplete: () => lodzia.destroy() });
  }
}
