/**
 * What a run did that the plain counters don't say, for the achievements: bosses beaten (and whether he ever touched
 * the roach), hits the moult took, and the stretch from level 7 to level 9 without a shot. Pure and Phaser-free, so the
 * rules can be tested. A boss only counts when the run is a solo or daily one that earned its way there: not a match,
 * not the dev shortcuts (the caller says, `counts`).
 */
import type { BossId } from './boss/bosses';

/** The level the pistol's course opens in, and the one a pacifist run has to reach with it unfired in the run. */
const PACIFIST_FROM = 7;
const PACIFIST_TO = 9;

/** The bosses a run from 0 m beats one after another: all of them wins it the "all four" achievement. */
export const ALL_BOSSES: readonly BossId[] = ['lodzia', 'bigos', 'zlewiatan', 'eksterminator'];

export interface FeatsSnapshot {
  /** The bosses this run beat, in the order beaten. */
  bosses: BossId[];
  /** How many of those fights went without a hit. */
  noHitWins: number;
  /** True once all four are beaten in a run that started from 0 m. */
  allBosses: boolean;
  /** Hits the moult took instead of the roach. */
  moultSaves: number;
  /** Ran from level 7 to level 9 with the pistol, firing nothing in between. */
  pacifist: boolean;
}

export const NO_FEATS: FeatsSnapshot = { bosses: [], noHitWins: 0, allBosses: false, moultSaves: 0, pacifist: false };

export class RunFeats {
  private beaten: BossId[] = [];
  private noHitWins = 0;
  private moultSaves = 0;
  private pacifist = false;
  /** Whether the run began at 0 m (not from a checkpoint). */
  private fromStart = true;
  /** The fight in progress took a hit (the moult absorbing one is a hit). */
  private hitInFight = false;
  private shots = 0;
  /** The shots fired when the run ran into level 7 with the pistol; null until it does. */
  private shotsAtSeven: number | null = null;
  /** A run that started in level 7 or later (a checkpoint) did not run into it. */
  private startLevel = 1;
  private lastLevel = 1;

  /** A new run: where it starts, and everything forgotten. */
  begin(start: { index: number; level: number }): void {
    this.fromStart = start.index === 0;
    this.startLevel = start.level;
    this.restart();
  }

  /** Back to nothing, keeping where the run started: the tutorial is over and the real run begins. */
  restart(): void {
    this.beaten = [];
    this.noHitWins = 0;
    this.moultSaves = 0;
    this.pacifist = false;
    this.hitInFight = false;
    this.shots = 0;
    this.shotsAtSeven = null;
    this.lastLevel = this.startLevel;
  }

  /** A boss fight begins: nothing has hit the roach in it yet. */
  fightStarted(): void {
    this.hitInFight = false;
  }

  /** Something would have killed the roach, in a boss fight or out of one; the moult took it or the run is over. */
  hit(inFight: boolean): void {
    if (inFight) this.hitInFight = true;
  }

  /** The moult took a hit. */
  moulted(): void {
    this.moultSaves++;
  }

  /** The boss is beaten; `counts` is false for a match and the dev shortcuts, which feed nothing. */
  bossBeaten(id: BossId, counts: boolean): void {
    if (!counts || this.beaten.includes(id)) return;
    this.beaten.push(id);
    if (!this.hitInFight) this.noHitWins++;
  }

  /**
   * A round that left the run's pistol (RunGun: not a dry click, not a press on cooldown). Shots in a boss fight are not
   * counted: the stretch from level 7 to 9 always holds the Zlewiatan fight, and the achievement is about the run.
   */
  shot(): void {
    this.shots++;
  }

  /**
   * Every frame of the run (or whenever the level may have moved): the level it is in, and whether it holds the pistol.
   * Level 7 only counts when the run runs into it, with the gun already in hand; level 9 then makes the run a pacifist
   * one if not a shot has been fired since.
   */
  observe(level: number, hasPistol: boolean): void {
    if (level === this.lastLevel) return;
    const previous = this.lastLevel;
    this.lastLevel = level;
    if (level < previous) return;
    if (this.shotsAtSeven === null && previous < PACIFIST_FROM && level >= PACIFIST_FROM && hasPistol) {
      this.shotsAtSeven = this.shots;
    }
    if (this.shotsAtSeven !== null && level >= PACIFIST_TO && this.shots === this.shotsAtSeven) this.pacifist = true;
  }

  snapshot(): FeatsSnapshot {
    return {
      bosses: [...this.beaten],
      noHitWins: this.noHitWins,
      allBosses: this.fromStart && ALL_BOSSES.every(id => this.beaten.includes(id)),
      moultSaves: this.moultSaves,
      pacifist: this.pacifist,
    };
  }
}
