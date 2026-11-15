/**
 * What the roach can do right now, in this run. A run starts with lane hops only; each boss beaten hands over the next
 * power (the reward table is `reward` on the boss registry). Once Pani Lodzia has ever been beaten, the dash is kept:
 * every run starts with it (`dashFromStart`). Pure and Phaser-free, so the rules can be tested, and the
 * one place that answers "can the player X now?": the input, the touch buttons and the HUD all ask here.
 */
import type { BossDef } from './boss/bosses';
import { MAGAZINE } from './gunRules';

export type AbilityId = 'dash' | 'gun' | 'moult';

/** In the order the HUD strip lists them. */
export const ABILITIES: readonly AbilityId[] = ['dash', 'gun', 'moult'];

/** A match is laid out and judged by the server: everyone starts with what the run has always given. */
const MULTIPLAYER_KIT: readonly AbilityId[] = ['dash'];
/**
 * Never earned in a match: the server decides who is alive, and an extra life on one client would desync it.
 * (The gun still comes as Zlewiatan's gift, inside the fight.)
 */
const SOLO_ONLY: readonly AbilityId[] = ['moult'];

/** Moult charges a grant gives. One hit sheds the shell. */
export const MOULT_CHARGES = 1;

export interface AbilityText {
  /** Under "NOWA MOC:", in capitals. */
  name: string;
  /** What the roach can do now: how, on a keyboard and on a phone. */
  how: { keyboard: string; touch: string };
}

export const ABILITY_TEXT: Record<AbilityId, AbilityText> = {
  dash: {
    name: 'DASH',
    how: {
      keyboard: 'Strzałka w prawo: przebijasz przeszkody',
      touch: 'Prawy dolny róg: przebijasz przeszkody',
    },
  },
  gun: {
    name: 'PISTOLET',
    // Its second line says what the magazine's pips will mean: the run's ammo is short, the boxes refill it
    how: {
      keyboard: `Spacja: strzał, też w biegu\nTylko ${MAGAZINE} naboi! Zbieraj skrzynki z amunicją`,
      touch: `Przycisk strzału w prawym dolnym rogu\nTylko ${MAGAZINE} naboi! Zbieraj skrzynki z amunicją`,
    },
  },
  moult: {
    name: 'WYLINKA',
    how: {
      keyboard: 'Jedno trafienie zrzuca pancerz, zamiast cię zabić',
      touch: 'Jedno trafienie zrzuca pancerz, zamiast cię zabić',
    },
  },
};

/**
 * Whether a player starts every solo and daily run with the dash: they have beaten Pani Lodzia in one before. That is the
 * `checkpoints` profile stat (>= 1: beaten in a solo or daily run, never through a dev shortcut or in a match), which
 * the account carries between devices and which veterans have once they beat her again; `lodziaWins` counts a match's
 * Lodzia too and would start at 0 for veterans.
 */
export const dashFromStart = (checkpointsUnlocked: number): boolean => checkpointsUnlocked >= 1;

export class Abilities {
  private owned = new Set<AbilityId>();
  private charges = 0;
  private multiplayer = false;

  constructor(multiplayer = false) {
    this.reset(multiplayer);
  }

  /**
   * A new run: only the starting kit. `keepsDash`: the dash a player who has beaten Lodzia keeps (solo and daily; a match
   * gives everyone the same kit whatever they have earned).
   */
  reset(multiplayer: boolean, keepsDash = false): void {
    this.multiplayer = multiplayer;
    this.owned.clear();
    this.charges = 0;
    if (multiplayer) for (const id of MULTIPLAYER_KIT) this.grant(id);
    else if (keepsDash) this.grant('dash');
  }

  has(id: AbilityId): boolean { return this.owned.has(id); }
  get canDash(): boolean { return this.has('dash'); }
  /** The pistol is drawn in the boss fights that have one. */
  get canShoot(): boolean { return this.has('gun'); }
  /**
   * And carried through the run between them (cockroach#100), solo only: a match's course and deaths are the server's,
   * and nothing a client shoots there would be checked. A match keeps the gun as Zlewiatan's gift, inside the fight.
   */
  get canShootInRun(): boolean { return this.has('gun') && !this.multiplayer; }
  get moultCharges(): number { return this.charges; }

  /** Whether this ability can be earned in this run, and is not already owned. */
  canEarn(id: AbilityId): boolean {
    return !this.has(id) && !(this.multiplayer && SOLO_ONLY.includes(id));
  }

  /** Gives an ability; false when it is not for this run or already owned. */
  grant(id: AbilityId): boolean {
    if (!this.canEarn(id)) return false;
    this.owned.add(id);
    if (id === 'moult') this.charges = MOULT_CHARGES;
    return true;
  }

  /** The boss is beaten: its reward, if there is one and it is new. */
  grantReward(boss: Pick<BossDef, 'reward'>): AbilityId | null {
    const id = boss.reward;
    return id && this.grant(id) ? id : null;
  }

  /**
   * A hit that would kill: the moult takes it instead, once. Returns whether it did.
   * HOOK: a recharge rule (a pickup, a level, a timer) would put the charge back here.
   */
  consumeMoult(): boolean {
    if (this.charges <= 0) return false;
    this.charges--;
    return true;
  }
}
