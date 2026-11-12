/**
 * What every boss fight is to the rest of the game. BossEncounter does what all fights share (stopping the clock and
 * spawns, clearing the arena, the bar, resuming the run); a subclass holds one boss's rules and looks.
 */
import Phaser from 'phaser';
import { AudioManager } from '../../audio/AudioManager';
import { GameEventBridge } from '../../multiplayer/GameEventBridge';
import { Player } from '../../objects/Player';
import type { Abilities } from '../abilities';
import { BossDef, BossId } from './bosses';

export type BossFightPhase = 'intro' | 'fighting' | 'victory' | 'done';

export type BossFightRole = 'host' | 'client' | 'solo';

export interface BossFightContext {
  scene: Phaser.Scene;
  player: Player;
  audio: AudioManager;
  boss: BossDef;
  floorTopY: number;
  floorBottomY: number;
  role: BossFightRole;
  /** Multiplayer only. */
  eventBridge: GameEventBridge | null;
  /** The run's seed, in a daily run: a fight that varies draws from its own generator made from it, never the run's. */
  seed?: number | null;
  /** What the run owns: a fight that hands out a power (the pistol's gift) grants it here, and one that needs it asks. */
  abilities: Abilities;
  /** A hit that would kill: true when the wylinka took it, and the fight goes on. */
  survivesHit: () => boolean;
  addScore: (points: number) => void;
  /** The bar in place of the level bar, under the boss's name: its HP, or whatever else this fight counts down. */
  showBar: (value: number, max: number) => void;
  updateBar: (value: number) => void;
  /** The victory has played out: the run takes over again. */
  onWon: () => void;
  /** The roach died in the fight, of this death type. */
  onLost: (deathType: string) => void;
}

export type BossFightFactory = (ctx: BossFightContext) => BossFight;

/** How long the roach takes to brake to a stop when a fight starts. */
const BRAKE_MS = 1000;

export abstract class BossFight {
  protected readonly ctx: BossFightContext;
  protected state: BossFightPhase = 'intro';
  /** Where the roach stands through the fight, once it has braked. */
  protected holdX: number;
  private timers: Phaser.Time.TimerEvent[] = [];

  constructor(ctx: BossFightContext) {
    this.ctx = ctx;
    this.holdX = ctx.player.x;
  }

  get id(): BossId { return this.ctx.boss.id; }
  get phase(): BossFightPhase { return this.state; }
  /** Lanes and actions only answer while fighting, not in the intro or the victory. */
  get inputLive(): boolean { return this.state === 'fighting'; }

  /** Points for winning, added when the run resumes. */
  abstract readonly victoryBonus: number;
  abstract update(delta: number): void;
  /** Space and the gun button. A fight without a gun leaves this out, and the button stays hidden. */
  shoot?(): void;
  /** The right arrow and the dash button, the same way. */
  dash?(): void;
  /** Takes down everything the fight put on screen. */
  protected abstract teardown(): void;

  destroy(): void {
    for (const timer of this.timers) timer.destroy();
    this.timers = [];
    this.teardown();
  }

  /** The roach brakes to a stop and the camera stays where it is (in `ms`, a second unless a fight wants it quicker). */
  protected brake(onStopped: () => void, ms = BRAKE_MS): void {
    const { scene, player } = this.ctx;
    const sprite = player.sprite;
    scene.tweens.add({
      targets: sprite.body!.velocity,
      x: 0,
      duration: ms,
      ease: 'Power2',
      onComplete: () => {
        sprite.setVelocity(0, 0);
        this.holdX = sprite.x;
        scene.cameras.main.stopFollow();
        onStopped();
      },
    });
  }

  /** Keeps the roach on its spot, this far back of it. */
  protected holdPlayer(backPx = 0): void {
    const sprite = this.ctx.player.sprite;
    sprite.x = this.holdX - backPx;
    sprite.setVelocityX(0);
  }

  /** A timer that dies with the fight and does nothing once it is over. */
  protected delay(ms: number, fn: () => void): void {
    const timer = this.ctx.scene.time.delayedCall(ms, () => {
      if (this.state !== 'done') fn();
    });
    this.timers.push(timer);
  }

  protected win(): void {
    this.state = 'done';
    this.ctx.onWon();
  }

  protected lose(deathType: string): void {
    this.state = 'done';
    this.ctx.onLost(deathType);
  }
}
