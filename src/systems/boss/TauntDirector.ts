/**
 * Decides when the next boss on the ladder mocks the roach, and what it says. Purely cosmetic: it reads the run and
 * never changes it, picks lines with Math.random (never the seeded RNG a match shares), and never blocks play.
 * How often is tauntPacing's: an occasional treat, not a commentary.
 *
 * - approach: at about 60% and 90% of the way from the last boss beaten (or the start) to the next one's trigger (only
 *   the 90% one for a boss already fought this session). These also play in a match, whose one boss is Zlewiatan on
 *   the same ladder and distance as in a solo run.
 * - reactive, solo only: a dropped combo, a close call ("NA STYK!"), a long clean streak; each only a chance of a taunt,
 *   45 s apart at least, three in a run at most, and never within 10 s of a fight, a level announcement, a milestone
 *   or a reward.
 * - never in a boss fight, on the versus splash, in the reward beat, on the countdown, paused, dead, in the tutorial,
 *   in the first 5 s of a run, or with the setting off. One cut off by any of those goes at once.
 */
import Phaser from 'phaser';
import { bossVoiceFor } from '../../audio/gibberish';
import { BossTaunt } from '../../ui/BossTaunt';
import { LEVEL_ANNOUNCED_EVENT } from '../../ui/GameHUD';
import { getTauntsEnabled } from '../../utils/Storage';
import type { RunState } from '../RunState';
import { BOSS_DEFEATED_EVENT } from '../BossEncounter';
import { BossDef } from './bosses';
import { TAUNT_LINES, TauntCategory } from './tauntLines';
import { APPROACH_MARKS, approachMarks, markMet, metBefore, ReactivePacer, TAUNT_TIMING } from './tauntPacing';

export { TAUNT_TIMING };

/** How many metres past its mark an approach taunt is no longer worth saying. */
const APPROACH_LATE_M = 25;
/** A reactive taunt keeps clear of an approach one this close to its mark (as a fraction of the way). */
const APPROACH_CLEAR = 0.03;
/** Too near the boss for a reactive taunt: the splash is about to cut it. */
const NEAR_TRIGGER = 0.96;

const COMBO_LOST_MIN = 3;
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
  /** The opening tutorial is on: no boss talks over the lesson. */
  inTutorial?: () => boolean;
}

export class TauntDirector {
  private deps: TauntDeps;
  private widget: BossTaunt;
  private picker = new LinePicker();
  private pacer = new ReactivePacer();
  /** Approach marks already said (or let go by), per boss. */
  private done = new Set<string>();
  private pending: { category: TauntCategory; at: number } | null = null;
  private lastEnd = -Infinity;
  private streakAt = STREAK_FIRST;
  /** The run's speed in metres per second, measured, for how soon the next fight is. */
  private speed = 0;
  private lastSample: { at: number; distance: number } | null = null;
  private onStage = (_bottom?: number, durationMs = 0): void => {
    this.pacer.hush(this.deps.scene.time.now, durationMs);
  };

  constructor(deps: TauntDeps) {
    this.deps = deps;
    const { scene } = deps;
    this.widget = new BossTaunt(scene, bossVoiceFor(scene));
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    // A milestone, a level announcement and a beaten boss have the stage: no reaction over them
    scene.events.on('score-milestone', this.onStage);
    scene.events.on(LEVEL_ANNOUNCED_EVENT, this.onStage);
    scene.events.on(BOSS_DEFEATED_EVENT, this.onStage);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  get isShowing(): boolean { return this.widget.isShowing; }

  /** Reactive taunts said this run. */
  get reactions(): number { return this.pacer.count; }

  /** The player lost a combo of this many. */
  comboLost(lost: number): void {
    this.streakAt = STREAK_FIRST;
    if (lost >= COMBO_LOST_MIN) this.react('comboLost');
  }

  /** A hop that just missed an obstacle was scored. */
  nearMiss(): void {
    this.react('closeCall');
  }

  /** Says a line of this kind now, whoever is next. Still cut at once if the run is in a state that allows no taunts. */
  say(category: TauntCategory, boss?: BossDef): void {
    const target = boss ?? this.deps.boss.upcoming?.boss;
    if (target) this.fire(target, category);
  }

  destroy(): void {
    const { scene } = this.deps;
    scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
    scene.events.off('score-milestone', this.onStage);
    scene.events.off(LEVEL_ANNOUNCED_EVENT, this.onStage);
    scene.events.off(BOSS_DEFEATED_EVENT, this.onStage);
    this.widget.destroy();
  }

  private react(category: TauntCategory): void {
    if (this.deps.isMultiplayer || this.blocked()) return;
    const waiting = this.pending && PRIORITY.indexOf(this.pending.category) <= PRIORITY.indexOf(category);
    // Most events pass without a word: only a chance of each is taken up
    if (!waiting && this.pacer.roll()) this.pending = { category, at: this.deps.scene.time.now };
  }

  private blocked(): boolean {
    const { run, boss, isPaused } = this.deps;
    return run.isDead || run.isCountingDown || boss.isActive || boss.isFrozen || boss.isSplashing
      || isPaused() || run.activePlayTime < TAUNT_TIMING.quietStartMs || !getTauntsEnabled() || document.hidden
      || this.deps.inTutorial?.() === true;
  }

  private update(): void {
    const now = this.deps.scene.time.now;
    const { boss: encounter } = this.deps;
    if (encounter.isActive || encounter.isFrozen) {
      // A fight (and the reward after it) keeps the bosses quiet until well after it is over
      this.pacer.hush(now);
      const fought = encounter.upcoming?.boss.id;
      if (encounter.isActive && fought) markMet(fought);
    }
    if (this.blocked()) {
      if (this.widget.isShowing) this.widget.hide(true);
      this.pending = null;
      this.lastSample = null;
      return;
    }
    const upcoming = encounter.upcoming;
    if (!upcoming) return;
    const { boss, from } = upcoming;
    const distance = this.deps.getDistance();
    this.measureSpeed(now, distance);
    const span = Math.max(1, boss.triggerDistance - from);
    const frac = (distance - from) / span;
    const marks = approachMarks(metBefore(boss.id));

    for (const mark of APPROACH_MARKS) {
      const key = `${boss.id}@${mark}`;
      if (this.done.has(key) || frac < mark) continue;
      if (!marks.includes(mark) || frac > mark + APPROACH_LATE_M / span) this.done.add(key);
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
    const msToBoss = this.speed > 0 ? ((boss.triggerDistance - distance) / this.speed) * 1000 : Infinity;
    if (now - this.pending.at > TAUNT_TIMING.reactionTtlMs || frac > NEAR_TRIGGER) {
      this.pending = null;
    } else if (!this.widget.isShowing && this.pacer.mayFire(now, msToBoss) && !this.approachDue(boss, frac, span, marks)) {
      const { category } = this.pending;
      this.pending = null;
      this.pacer.fired(now);
      this.fire(boss, category);
    }
  }

  /** Metres per second over the last stretch, smoothed. */
  private measureSpeed(now: number, distance: number): void {
    const last = this.lastSample;
    if (!last) { this.lastSample = { at: now, distance }; return; }
    const dt = now - last.at;
    if (dt < 500) return;
    const speed = ((distance - last.distance) / dt) * 1000;
    this.speed = this.speed === 0 ? speed : this.speed * 0.6 + speed * 0.4;
    this.lastSample = { at: now, distance };
  }

  private approachDue(boss: BossDef, frac: number, span: number, marks: readonly number[]): boolean {
    return marks.some(mark => !this.done.has(`${boss.id}@${mark}`) && frac >= mark - APPROACH_CLEAR && frac <= mark + APPROACH_LATE_M / span);
  }

  private fire(boss: BossDef, category: TauntCategory): void {
    this.widget.show(boss, this.picker.next(boss.id, category), {
      onDone: () => { this.lastEnd = this.deps.scene.time.now; },
    });
  }
}
