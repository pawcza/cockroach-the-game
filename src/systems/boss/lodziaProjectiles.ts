/**
 * What Pani Lodzia throws. A projectile follows a path worked out when it leaves her hand, timed so it passes the roach
 * exactly when lodziaPatterns says; around each pass it checks the roach's lane (which counts from the press), the way
 * the Zlewiatan fight checks a projectile near the roach. It marks no lane: a thing that only hurts where it is is
 * announced by her wind-up, and it leaves a trail in flight.
 */
import Phaser from 'phaser';
import { DEPTH } from '../../config/constants';
import { SPRITE_SCALE } from '../../config/sprites';
import { LODZIA_TEXTURE, LodziaProjectile, lodziaAnimKey, lodziaFrame } from './lodziaConfig';
import { Lane } from './lodziaPatterns';
import { Trail } from './bossTelegraph';

/** Either side of a pass, this long, the projectile is on the roach: about 25 px of flight. */
export const HIT_WINDOW_MS = 40;

/** A bounce flattens it this much (1 = fully): wider by, lower by. */
const SQUASH_WIDE = 0.3;
const SQUASH_FLAT = 0.3;

export interface Point { x: number; y: number }

export interface Pass {
  /** ms after release. */
  at: number;
  lane: Lane;
}

export interface Flight {
  sprite: LodziaProjectile;
  /** Where it is, ms after release, and the lane it counts in then; squash: 0..1, how flattened it is (a bounce). */
  at: (t: number) => Point & { lane: Lane; squash?: number };
  /** The trail it leaves: colour, how long it lasts (ms) and how thick it starts (px). */
  trail: { color: number; ms: number; size: number };
  passes: Pass[];
  /** It is gone this long after release (off the screen, or home). */
  duration: number;
}

export class Projectile {
  private scene: Phaser.Scene;
  private flight: Flight;
  private sprite: Phaser.GameObjects.Sprite;
  private trail: Trail;
  private startedAt: number;
  private settled: boolean[];
  private _done = false;
  /** In the window of a pass and the roach in its lane: the caller decides what that does. */
  onHit: (pass: Pass) => void = () => {};
  /** A pass gone by without a hit. */
  onMissed: (pass: Pass) => void = () => {};
  onEnd: () => void = () => {};

  /** releasedAt: the scene time it left her hand by the attack's plan, so a late timer doesn't make it late. */
  constructor(scene: Phaser.Scene, flight: Flight, releasedAt = scene.time.now) {
    this.scene = scene;
    this.flight = flight;
    this.startedAt = releasedAt;
    this.settled = flight.passes.map(() => false);
    const at = flight.at(Math.max(0, this.elapsed));
    this.sprite = scene.add.sprite(at.x, at.y, LODZIA_TEXTURE, lodziaFrame(flight.sprite))
      .setScale(SPRITE_SCALE).setDepth(DEPTH.PICKUPS + 1);
    this.sprite.play(lodziaAnimKey(flight.sprite));
    this.trail = new Trail(scene, flight.trail.color, flight.trail.ms, flight.trail.size, DEPTH.PICKUPS);
  }

  get done(): boolean { return this._done; }
  get elapsed(): number { return this.scene.time.now - this.startedAt; }

  /** laneAt: the lane the roach was on at a scene time (it counts from the press), so a long frame still judges a
   * pass by where the roach was when it happened, not when the frame got round to it. */
  update(laneAt: (time: number) => Lane): void {
    if (this._done) return;
    const t = this.elapsed;
    const at = this.flight.at(Math.min(t, this.flight.duration));
    this.sprite.setPosition(Math.round(at.x), Math.round(at.y));
    const squash = at.squash ?? 0;
    this.sprite.setScale(SPRITE_SCALE * (1 + SQUASH_WIDE * squash), SPRITE_SCALE * (1 - SQUASH_FLAT * squash));
    this.trail.push(this.sprite.x, this.sprite.y);
    this.flight.passes.forEach((pass, i) => {
      if (this.settled[i] || t < pass.at - HIT_WINDOW_MS) return;
      // In the roach's lane anywhere in the window round the pass (as far as it has come): a hit
      const passAt = this.startedAt + pass.at;
      const moments = [passAt - HIT_WINDOW_MS, passAt, passAt + HIT_WINDOW_MS].filter(m => m <= this.scene.time.now);
      if (moments.some(m => laneAt(m) === pass.lane)) {
        this.settled[i] = true;
        this.onHit(pass);
      } else if (t > pass.at + HIT_WINDOW_MS) {
        this.settled[i] = true;
        this.onMissed(pass);
      }
    });
    if (t >= this.flight.duration) this.finish();
  }

  /** Where it is now, for a puff. */
  get position(): Point { return { x: this.sprite.x, y: this.sprite.y }; }

  finish(): void {
    if (this._done) return;
    this._done = true;
    this.sprite.destroy();
    this.trail.destroy();
    this.onEnd();
  }

  destroy(): void {
    this._done = true;
    this.sprite.destroy();
    this.trail.destroy();
  }
}
