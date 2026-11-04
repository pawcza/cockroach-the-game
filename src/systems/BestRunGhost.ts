/**
 * Race your record: your best run, replayed as a pale roach beside you on the run's own clock. Off screen, an arrow
 * at the edge says how far ahead or behind it is; where that run ended, a flag stays on the floor to beat.
 * Solo only. In Karaluch Dnia it is your best run of the day, on the same layout, so it is a real race.
 */
import Phaser from 'phaser';
import { DEPTH } from '../config/constants';
import { ATLAS, HOP_MS, ROACH_FEET_OFFSET, SPRITE_SCALE, frameOf, hopY } from '../config/sprites';
import { smallStyle } from '../utils/TextStyles';
import type { Floor } from '../objects/Player';

/** A run's path: [time ms, x, lane (0 bottom, 1 top)] repeated, flat so it stores small. */
export interface RunTrack {
  samples: number[];
}

const SAMPLE_MS = 150;
const STRIDE = 3;
const GHOST_ALPHA = 0.35;
const GHOST_TINT = 0xcfe0ff;
const LABEL_COLOR = '#cfe0ff';
const METRES = 50;

/** Writes down where the roach is, a few times a second. */
export class RunTrackRecorder {
  private samples: number[] = [];
  private lastAt = -Infinity;

  sample(time: number, x: number, floor: Floor): void {
    if (time - this.lastAt < SAMPLE_MS) return;
    this.lastAt = time;
    this.samples.push(Math.round(time), Math.round(x), floor === 'top' ? 1 : 0);
  }

  get track(): RunTrack | null {
    return this.samples.length >= STRIDE * 2 ? { samples: [...this.samples] } : null;
  }
}

export class BestRunGhost {
  private scene: Phaser.Scene;
  private samples: number[];
  private laneY: (floor: Floor) => number;
  private sprite: Phaser.GameObjects.Sprite;
  private label: Phaser.GameObjects.Text;
  private edge: Phaser.GameObjects.Text;
  private index = 0;
  private lane = 0;
  private hop: Phaser.Tweens.Tween | null = null;
  private finished = false;

  constructor(scene: Phaser.Scene, track: RunTrack, laneY: (floor: Floor) => number) {
    this.scene = scene;
    this.samples = track.samples;
    this.laneY = laneY;
    this.lane = this.samples[2];
    this.sprite = scene.add.sprite(this.samples[1], laneY(this.floorOf(this.lane)), ATLAS, frameOf('roach-run'))
      .setScale(SPRITE_SCALE).setAlpha(GHOST_ALPHA).setTint(GHOST_TINT).setDepth(DEPTH.GHOST_SPRITE);
    this.sprite.play('roach-run');
    this.label = scene.add.text(0, 0, 'Rekord', smallStyle({ fontSize: '7px', color: LABEL_COLOR, strokeThickness: 3 }))
      .setOrigin(0.5, 1).setAlpha(0.8).setDepth(DEPTH.GHOST_LABEL);
    this.edge = scene.add.text(0, 0, '', smallStyle({ fontSize: '7px', color: LABEL_COLOR, strokeThickness: 3 }))
      .setScrollFactor(0).setDepth(DEPTH.GHOST_ARROW).setVisible(false);
  }

  /** Moves the record run to where it was at this point of its run, and says where it is if that's off screen. */
  update(runTime: number, playerX: number): void {
    if (this.finished) return;
    const { samples } = this;
    while (this.index + STRIDE < samples.length && samples[this.index + STRIDE] <= runTime) this.index += STRIDE;
    const lastIndex = samples.length - STRIDE;
    if (runTime >= samples[lastIndex]) {
      this.finish(samples[lastIndex + 1]);
      return;
    }
    const t0 = samples[this.index];
    const t1 = samples[this.index + STRIDE];
    const k = t1 > t0 ? Phaser.Math.Clamp((runTime - t0) / (t1 - t0), 0, 1) : 0;
    this.sprite.x = Phaser.Math.Linear(samples[this.index + 1], samples[this.index + STRIDE + 1], k);
    const lane = samples[this.index + 2];
    if (lane !== this.lane) this.hopTo(lane);

    this.label.setPosition(Math.round(this.sprite.x), Math.round(this.sprite.y) - 52);
    this.showEdge(playerX);
  }

  destroy(): void {
    this.hop?.destroy();
    this.sprite.destroy();
    this.label.destroy();
    this.edge.destroy();
  }

  private floorOf(lane: number): Floor {
    return lane === 1 ? 'top' : 'bottom';
  }

  private hopTo(lane: number): void {
    this.lane = lane;
    const fromY = this.sprite.y;
    const toY = this.laneY(this.floorOf(lane));
    this.hop?.destroy();
    this.sprite.play('roach-hop');
    this.hop = this.scene.tweens.addCounter({
      from: 0, to: 1, duration: HOP_MS, ease: 'Sine.easeInOut',
      onUpdate: (tween) => { this.sprite.y = hopY(fromY, toY, tween.getValue() ?? 0); },
      onComplete: () => { this.hop = null; if (!this.finished) this.sprite.play('roach-run'); },
    });
  }

  /** Off screen, an arrow at the edge with how far ahead or behind the record is. */
  private showEdge(playerX: number): void {
    const camera = this.scene.cameras.main;
    const view = camera.worldView;
    const ahead = this.sprite.x > view.right;
    const behind = this.sprite.x < view.left;
    this.edge.setVisible(ahead || behind);
    if (!ahead && !behind) return;
    const metres = Math.round((this.sprite.x - playerX) / METRES);
    this.edge.setText(ahead ? `Rekord +${metres}m >` : `< Rekord ${metres}m`);
    this.edge.setOrigin(ahead ? 1 : 0, 0.5);
    this.edge.setPosition(ahead ? camera.width - 12 : 12, Math.round(this.laneY(this.floorOf(this.lane)) - 40));
  }

  /** Where the record run ended: it falls there, and a flag stays to beat. */
  private finish(x: number): void {
    this.finished = true;
    this.edge.setVisible(false);
    this.hop?.destroy();
    this.sprite.x = x;
    this.sprite.play('roach-death');
    this.scene.tweens.add({ targets: [this.sprite, this.label], alpha: 0, duration: 900, onComplete: () => this.label.setVisible(false) });

    const floorY = this.laneY(this.floorOf(this.lane)) + ROACH_FEET_OFFSET;
    const flag = this.scene.add.graphics().setDepth(DEPTH.PICKUPS);
    flag.fillStyle(0xcfe0ff, 0.9).fillRect(x - 1, floorY - 44, 2, 44);
    flag.fillStyle(0xe8c15a, 1).fillRect(x + 1, floorY - 44, 18, 12);
    this.scene.add.text(x, floorY - 48, 'REKORD', smallStyle({ fontSize: '6px', color: '#e8c15a', strokeThickness: 3 }))
      .setOrigin(0.5, 1).setDepth(DEPTH.PICKUPS);
  }
}
