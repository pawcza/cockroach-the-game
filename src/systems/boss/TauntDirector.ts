/**
 * Decides when the next boss on the ladder mocks the roach, and what it says. Purely cosmetic: it reads the run and
 * never changes it, picks lines with Math.random (never the seeded RNG a match shares), and never blocks play.
 *
 * - approach: at about 60% and 90% of the way from the last boss beaten (or the start) to the next one's trigger.
 *   These also play in a match, whose one boss is Zlewiatan on the same ladder and distance as in a solo run.
 * - reactive, solo only and at most one every 12 s: a dropped combo, a close call ("NA STYK!"), a long clean streak.
 * - never in a boss fight, on the versus splash, in the reward beat, on the countdown, paused, dead, in the first 5 s
 *   of a run, or with the setting off. One cut off by any of those goes at once.
 */
import Phaser from 'phaser';
import { bossVoiceFor } from '../../audio/gibberish';
import { BossTaunt } from '../../ui/BossTaunt';
import { getTauntsEnabled } from '../../utils/Storage';
import type { RunState } from '../RunState';
import { BossDef } from './bosses';
import { TAUNT_LINES, TauntCategory } from './tauntLines';

export const TAUNT_TIMING = {
  /** No taunts this long into a run. */
  quietStartMs: 5000,
  /** Reactive taunts: at least this long between the starts of two. */
  reactiveGapMs: 12000,
  /** An approach taunt waits this long after the last one ended. */
  approachGapMs: 4000,
  /** A reaction that could not be said at once is dropped after this. */
  reactionTtlMs: 3500,
} as const;

/** How far to the next boss each approach taunt is said, and how many metres past that it is no longer worth saying. */
const APPROACH_MARKS = [0.6, 0.9];
const APPROACH_LATE_M = 25;
/** A reactive taunt keeps clear of an approach one this close to its mark (as a fraction of the way). */
const APPROACH_CLEAR = 0.03;
/** Too near the boss for a reactive taunt: the splash is about to cut it. */
const NEAR_TRIGGER = 0.96;

const COMBO_LOST_MIN = 3;
const NEAR_MISS_CHANCE = 0.6;
const STREAK_FIRST = 15;
const STREAK_STEP = 25;

/** When two reactions are waiting, the one earlier in this list is said. */
const PRIORITY: TauntCategory[] = ['streak', 'comboLost', 'closeCall'];

/** Picks lines, not repeating one of a boss's pool until the whole pool has been used. */
export class LinePicker {
  private used = new Map<string, Set<number>>();

  next(bossId: BossDef['id'], category: TauntCategory, rng: () => number = Math.random): string {
    const pool = TAUNT_LINES[bossId][category];
    const key = `${bossId}/${category}`;
    let used = this.used.get(key);
    if (!used || used.size >= pool.length) {
      used = new Set();
      this.used.set(key, used);
    }
    const free = pool.map((_, i) => i).filter(i => !used!.has(i));
    const pick = free[Math.floor(rng() * free.length)];
    used.add(pick);
    return pool[pick];
  }
}

export interface TauntDeps {
  scene: Phaser.Scene;
  run: RunState;
  boss: {
    readonly isActive: boolean;
    readonly isFrozen: boolean;
    readonly isSplashing: boolean;
    readonly upcoming: { boss: BossDef; from: number } | null;
  };
  isPaused: () => boolean;
  getDistance: () => number;
  isMultiplayer: boolean;
}

export class TauntDirector {
  private deps: TauntDeps;
  private widget: BossTaunt;
  private picker = new LinePicker();
  /** Approach marks already said (or let go by), per boss. */
  private done = new Set<string>();
  private pending: { category: TauntCategory; at: number } | null = null;
  private lastStart = -Infinity;
  private lastEnd = -Infinity;
  private streakAt = STREAK_FIRST;

  constructor(deps: TauntDeps) {
    this.deps = deps;
    const { scene } = deps;
    this.widget = new BossTaunt(scene, bossVoiceFor(scene));
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  get isShowing(): boolean { return this.widget.isShowing; }

  /** The player lost a combo of this many. */
  comboLost(lost: number): void {
    this.streakAt = STREAK_FIRST;
    if (lost >= COMBO_LOST_MIN) this.react('comboLost');
  }

  /** A hop that just missed an obstacle was scored. */
  nearMiss(): void {
    if (Math.random() < NEAR_MISS_CHANCE) this.react('closeCall');
  }

  /** Says a line of this kind now, whoever is next. Still cut at once if the run is in a state that allows no taunts. */
  say(category: TauntCategory, boss?: BossDef): void {
    const target = boss ?? this.deps.boss.upcoming?.boss;
    if (target) this.fire(target, category);
  }

  destroy(): void {
    this.deps.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
    this.widget.destroy();
  }

  private react(category: TauntCategory): void {
    if (this.deps.isMultiplayer) return;
    const waiting = this.pending && PRIORITY.indexOf(this.pending.category) <= PRIORITY.indexOf(category);
    if (!waiting) this.pending = { category, at: this.deps.scene.time.now };
  }

  private blocked(): boolean {
    const { run, boss, isPaused } = this.deps;
    return run.isDead || run.isCountingDown || boss.isActive || boss.isFrozen || boss.isSplashing
      || isPaused() || run.activePlayTime < TAUNT_TIMING.quietStartMs || !getTauntsEnabled() || document.hidden;
  }

  private update(): void {
    if (this.blocked()) {
      if (this.widget.isShowing) this.widget.hide(true);
      this.pending = null;
      return;
    }
    const upcoming = this.deps.boss.upcoming;
    if (!upcoming) return;
    const { boss, from } = upcoming;
    const now = this.deps.scene.time.now;
    const span = Math.max(1, boss.triggerDistance - from);
    const frac = (this.deps.getDistance() - from) / span;

    for (const mark of APPROACH_MARKS) {
      const key = `${boss.id}@${mark}`;
      if (this.done.has(key) || frac < mark) continue;
      if (frac > mark + APPROACH_LATE_M / span) this.done.add(key);
      else if (!this.widget.isShowing && now - this.lastEnd >= TAUNT_TIMING.approachGapMs) {
        this.done.add(key);
        this.fire(boss, 'approach');
      }
      break;
    }

    if (this.deps.isMultiplayer) return;

    if (this.deps.run.pickupCombo >= this.streakAt) {
      this.streakAt = this.deps.run.pickupCombo + STREAK_STEP;
      this.react('streak');
    }
    if (!this.pending) return;
    if (now - this.pending.at > TAUNT_TIMING.reactionTtlMs || frac > NEAR_TRIGGER) {
      this.pending = null;
    } else if (!this.widget.isShowing && now - this.lastStart >= TAUNT_TIMING.reactiveGapMs && !this.approachDue(boss, frac, span)) {
      const { category } = this.pending;
      this.pending = null;
      this.fire(boss, category);
    }
  }

  private approachDue(boss: BossDef, frac: number, span: number): boolean {
    return APPROACH_MARKS.some(mark => !this.done.has(`${boss.id}@${mark}`) && frac >= mark - APPROACH_CLEAR && frac <= mark + APPROACH_LATE_M / span);
  }

  private fire(boss: BossDef, category: TauntCategory): void {
    this.lastStart = this.deps.scene.time.now;
    this.widget.show(boss, this.picker.next(boss.id, category), {
      onDone: () => { this.lastEnd = this.deps.scene.time.now; },
    });
  }
}
