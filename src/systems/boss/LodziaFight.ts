/**
 * Pani Lodzia: no guns, the roach only hops. She stands at the right of the screen and throws everything she has at
 * the lane the roach is on: her slipper slammed on a lane (a shockwave runs it), slippers whipped along the lanes from
 * her housecoat pocket, a boomerang slipper that comes back along the other lane and hits her in the face, a slam and
 * a slipper at once, and in the end curlers bouncing from lane to lane. Three phases with a breather between them; her
 * stamina goes with every dodge, more with a close one, a lot with every boomerang in the face.
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
import { popupStyle } from '../../utils/TextStyles';
import { NEAR_MISS_SCORE } from '../RiskBonus';
import { BossFight, BossFightContext } from './BossFight';
import {
  createLodziaAnimations, LODZIA_FACE, LODZIA_HELD, LODZIA_LANDING, LODZIA_REACH_BACK, LODZIA_RELEASE, LODZIA_TEXTURE,
  LodziaAnim, lodziaAnimKey, lodziaFrame,
} from './lodziaConfig';
import {
  Attack, BOOMERANG_RELEASE_MS, buildPhases, CLOSE_CALL_DAMAGE, CURLER_ARRIVAL_MS, CURLER_BEAT_MS, CURLER_BEATS,
  DODGE_DAMAGE, fightRandom, HazardKind, Lane, other, Phase, resolve, SLAM_IMPACT_MS, SMACK_DAMAGE, STAMINA,
  attackLength, TANTRUM_RELEASE_MS, THROW_MS, THROW_RELEASE_MS, timeAttack, WAVE_MS, WINDUP_MS, FACE_MS,
} from './lodziaPatterns';
import { Flight, Pass, Projectile } from './lodziaProjectiles';
import { glint, Halo, sparkBurst } from './bossTelegraph';
import { Shockwave } from './lodziaShockwave';

const VICTORY_BONUS = 300;
/** Every hazard dodged. */
const DODGE_SCORE = 10;
/** A hop out of a lane this close before what comes down it reaches the roach: "NA STYK!", as in the run. */
const CLOSE_CALL_MS = 250;

/** Her drawn-back slipper stays this far inside the screen's right edge. */
const EDGE_MARGIN = 6;
/** She waddles in from past the right edge while the roach brakes. */
const WALK_MS = 2000;
/** On her spot, a beat before the first attack. */
const SETTLE_MS = 700;
/** Between phases she pants this long. */
const TIRED_MS = 1500;
/** Sitting on the floor, dazed, before the run picks up again. */
const DEFEAT_HOLD_MS = 1300;
const FADE_MS = 400;

/** What flies, flies this high over its lane: about the roach's middle. */
const FLY_HEIGHT = 24;
/** A curler hops this high as it bounces along a lane. */
const CURLER_BOUNCE = 14;
/** Of each beat, a curler spends this much on its lane before jumping to the other one. */
const CURLER_STAY = 0.65;
/** A curler's squash: the share of a beat it takes to flatten on landing, and to crouch before it jumps. */
const SQUASH_LAND = 0.14;
const SQUASH_JUMP = 0.1;
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
export interface Threat { lane: Lane; at: number; kind: HazardKind }

type HeldAnim = keyof typeof LODZIA_HELD;

export class LodziaFight extends BossFight {
  readonly victoryBonus = VICTORY_BONUS;

  private readonly lodzia: Phaser.GameObjects.Sprite;
  private readonly phases: Phase[];
  private stamina = STAMINA;
  private phaseIndex = 0;
  private attackIndex = 0;
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
    const phase = this.phases[this.phaseIndex];
    if (this.stamina <= 0) {
      this.defeat();
      return;
    }
    if (this.attackIndex >= phase.attacks.length) {
      this.endPhase();
      return;
    }
    const attack = phase.attacks[this.attackIndex++];
    this.run(attack);
    this.delay(attackLength(attack, phase.gap), () => this.nextAttack());
  }

  private endPhase(): void {
    this.play('hurt', () => {
      if (this.phaseIndex >= this.phases.length - 1) {
        this.defeat();
        return;
      }
      this.play('tired');
      this.delay(TIRED_MS, () => {
        this.phaseIndex++;
        this.attackIndex = 0;
        this.play('idle');
        this.delay(SETTLE_MS, () => this.nextAttack());
      });
    });
  }

  private defeat(): void {
    this.state = 'victory';
    this.unwarnSlam();
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
    for (const h of timeAttack(attack).hazards) this._threats.push({ lane: resolve(h.rel, roachLane), at: now + h.t, kind: h.kind });
    // Everything that reaches the roach is timed from the attack's start, as planned, not from when a timer got round
    // to it: a long frame never makes something late, so it always arrives when its telegraph said
    switch (attack.kind) {
      case 'slam':
        this.slam(roachLane, attack.hold, now);
        break;
      case 'throws':
        attack.lanes.forEach((rel, i) => {
          const scale = Math.min(1, attack.spacing / THROW_MS);
          const lane = resolve(rel, roachLane);
          const go = () => this.throwSlipper(lane, attack.travel, scale, now + i * attack.spacing);
          if (i === 0) go();
          else this.delay(i * attack.spacing, go);
        });
        break;
      case 'boomerang':
        this.boomerang(roachLane, attack.travel, attack.back, now);
        break;
      case 'combo':
        // Both at once: her slipper (announced on her) and the slam's red lane
        this.throwSlipper(roachLane, attack.travel, 1, now);
        this.warnSlam(other(roachLane));
        this.delay(THROW_MS, () => this.slam(other(roachLane), 0, now + THROW_MS));
        break;
      case 'curlers':
        this.tantrum(roachLane, attack.count, now);
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
      this.play(`slam-${lane}`, () => this.play('idle'));
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
  private throwSlipper(lane: Lane, travel: number, scale: number, startedAt: number): void {
    this.ctx.audio.playSfx(SFX.pocket, VOL.obstacle);
    this.play(`throw-${lane}`, () => this.play('idle'), 1 / scale);
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
    this.play('boomerang', () => this.play('idle'));
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
    this.play('hurt', () => this.play('idle'));
    this.wear(SMACK_DAMAGE);
    this.popupAt(face.x, face.y - 30, `AUĆ! -${SMACK_DAMAGE}`, '#ffb070');
  }

  /** Stamping, she hurls curlers that bounce from lane to lane on a beat, arriving at the roach on the lane it is on now
   * (the second one on the other lane, a beat later). */
  private tantrum(roachLane: Lane, count: 1 | 2, startedAt: number): void {
    this.play('tantrum', () => this.play('idle'));
    this.hold('tantrum', CURLER_GLOW, count === 2 ? [1, 5] : [1], count === 2 ? 6 : 2);
    this.delay(0, () => this.ctx.audio.playSfx(SFX.stamp, VOL.big));
    TANTRUM_RELEASE_MS.slice(0, count).forEach((release, i) => {
      const arrive = i === 0 ? roachLane : other(roachLane);
      this.delay(Math.max(0, startedAt + release - this.ctx.scene.time.now), () => {
        const from = this.release('tantrum');
        this.letGo(from, CURLER_GLOW);
        this.launch(this.zigzag(from, arrive), startedAt + release);
      });
    });
  }

  /** The lane a curler is on during beat k, if it is to be on `arrive` when it reaches the roach. */
  private curlerLane(arrive: Lane, beat: number): Lane {
    return (CURLER_BEATS - beat) % 2 === 0 ? arrive : other(arrive);
  }

  private zigzag(from: { x: number; y: number }, arrive: Lane): Flight {
    const speed = (from.x - this.holdX) / CURLER_ARRIVAL_MS;
    const left = this.ctx.scene.cameras.main.scrollX - 40;
    const flyY = (lane: Lane) => this.laneY(lane) - FLY_HEIGHT + 8;
    let lastBeat = 0;
    return {
      sprite: 'curler',
      trail: CURLER_TRAIL,
      at: (t) => {
        const beat = Math.floor(t / CURLER_BEAT_MS);
        // Every bounce off a lane
        if (beat > lastBeat) {
          lastBeat = beat;
          this.ctx.audio.playSfx(SFX.curler, VOL.pickup);
          sparkBurst(this.ctx.scene, from.x - speed * t, this.laneY(this.curlerLane(arrive, beat)) - 2, CURLER_GLOW, 4, -1, 18);
        }
        const k = (t % CURLER_BEAT_MS) / CURLER_BEAT_MS;
        const lane = this.curlerLane(arrive, beat);
        const next = this.curlerLane(arrive, beat + 1);
        let y: number;
        if (k < CURLER_STAY) y = flyY(lane) - Math.sin((k / CURLER_STAY) * Math.PI) * CURLER_BOUNCE;
        else {
          const j = (k - CURLER_STAY) / (1 - CURLER_STAY);
          y = Phaser.Math.Linear(flyY(lane), flyY(next), j) - Math.sin(j * Math.PI) * CURLER_BOUNCE * 2;
        }
        // Out of her fist it falls to its first lane
        if (beat === 0) y = Phaser.Math.Linear(from.y, y, Math.min(1, k * 2));
        // It flattens as it lands and again as it crouches to jump
        let squash = 0;
        if (beat > 0 && k < SQUASH_LAND) squash = 1 - k / SQUASH_LAND;
        else if (k > CURLER_STAY - SQUASH_JUMP && k <= CURLER_STAY) squash = (k - (CURLER_STAY - SQUASH_JUMP)) / SQUASH_JUMP;
        return { x: from.x - speed * t, y, lane, squash };
      },
      passes: [{ at: CURLER_ARRIVAL_MS, lane: arrive }],
      duration: (from.x - left) / speed,
    };
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
      this.wear(DODGE_DAMAGE);
      return;
    }
    const hop = player.lastHop;
    const close = hop !== null && hop.from === lane && at - hop.at <= CLOSE_CALL_MS && at >= hop.at;
    if (close) audio.playSfx(SFX.closeCall, VOL.stinger);
    const points = close ? DODGE_SCORE + NEAR_MISS_SCORE : DODGE_SCORE;
    this.ctx.addScore(points);
    this.wear(close ? DODGE_DAMAGE + CLOSE_CALL_DAMAGE : DODGE_DAMAGE);
    this.popupAt(player.x, player.y - 40, close ? `NA STYK! +${points}` : `+${points}`, close ? '#7fe0ff' : '#ffdd00');
  }

  private wear(amount: number): void {
    this.stamina = Math.max(0, this.stamina - amount);
    this.ctx.updateBar(this.stamina);
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
    for (const obj of this.effects) obj.destroy();
    this.effects = [];
    // Lost, she stays a moment where she stood
    const lodzia = this.lodzia;
    if (!lodzia.active) return;
    lodzia.anims.stop();
    this.ctx.scene.tweens.add({ targets: lodzia, alpha: 0, duration: FADE_MS, delay: 300, onComplete: () => lodzia.destroy() });
  }
}
