/** Per-run values that GameScene and its systems read and write together. */
export class RunState {
  isDead = false;
  isCountingDown = true;
  currentLevel = 1;
  activePlayTime = 0;

  score = 0;
  lastScoreTime = 0;

  pickupCombo = 0;
  maxCombo = 0;
  applesCollected = 0;
  beersCollected = 0;
  pillsCollected = 0;
  nearMisses = 0;
  dashThroughs = 0;
  wallsBroken = 0;

  reset(now: number): void {
    this.isDead = false;
    this.isCountingDown = true;
    this.currentLevel = 1;
    this.activePlayTime = 0;
    this.score = 0;
    this.lastScoreTime = now;
    this.pickupCombo = 0;
    this.maxCombo = 0;
    this.applesCollected = 0;
    this.beersCollected = 0;
    this.pillsCollected = 0;
    this.nearMisses = 0;
    this.dashThroughs = 0;
    this.wallsBroken = 0;
  }
}

export function comboMultiplier(combo: number): number {
  return 1 + combo * 0.025;
}
