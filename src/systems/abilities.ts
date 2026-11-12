/**
 * What the roach can do right now, in this run. A run starts with lane hops only; each boss beaten hands over the next
 * power (the reward table is `reward` on the boss registry). Pure and Phaser-free, so the rules can be tested, and the
 * one place that answers "can the player X now?": the input, the touch buttons and the HUD all ask here.
 */
import type { BossDef } from './boss/bosses';

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
    how: { keyboard: 'Spacja: strzał', touch: 'Przycisk strzału w prawym dolnym rogu' },
  },
  moult: {
    name: 'WYLINKA',
    how: {
      keyboard: 'Jedno trafienie zrzuca pancerz, zamiast cię zabić',
      touch: 'Jedno trafienie zrzuca pancerz, zamiast cię zabić',
    },
  },
};

export class Abilities {
  private owned = new Set<AbilityId>();
  private charges = 0;
  private multiplayer = false;

  constructor(multiplayer = false) {
    this.reset(multiplayer);
  }

  /** A new run: only the starting kit. */
  reset(multiplayer: boolean): void {
    this.multiplayer = multiplayer;
    this.owned.clear();
    this.charges = 0;
    if (multiplayer) for (const id of MULTIPLAYER_KIT) this.grant(id);
  }

  has(id: AbilityId): boolean { return this.owned.has(id); }
  get canDash(): boolean { return this.has('dash'); }
  /** The pistol is drawn: in fights only, until the run learns to shoot (cockroach#100). */
  get canShoot(): boolean { return this.has('gun'); }
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
