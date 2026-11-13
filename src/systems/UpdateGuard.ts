/**
 * Keeps one subsystem's exception from stopping the game. Phaser asks for the next frame only after the current one
 * returns, so a throw anywhere in a frame used to freeze the game for good. Each guarded piece of a frame runs through
 * `run`: a throw is reported and that piece is skipped for the frame, and the rest of the frame goes on. A piece that
 * throws on DISABLE_STREAK frames in a row, or DISABLE_TOTAL times in a run, is switched off for the rest of the run
 * (unless it is essential: those are only reported, at most once a second), so a broken one never spams.
 * No Phaser here: GameScene wires it to its update, its scene events and its render (see guardScene).
 */

/** This many frames in a row that a piece threw switches it off. */
export const DISABLE_STREAK = 3;
/** So does this many throws in one run, in a row or not. */
export const DISABLE_TOTAL = 10;
/** An essential piece's repeated reports are kept this far apart. */
const ESSENTIAL_REPORT_GAP_MS = 1000;

export interface GuardReport {
  /** Which piece threw. */
  name: string;
  error: unknown;
  /** Its throws this run, this one included. */
  count: number;
  /** True when this throw switched it off. */
  disabled: boolean;
}

export class UpdateGuard {
  private readonly onError: (report: GuardReport) => void;
  private readonly now: () => number;
  private frame = 0;
  private lastFailedFrame = new Map<string, number>();
  private streak = new Map<string, number>();
  private total = new Map<string, number>();
  private off = new Set<string>();
  private lastReport = new Map<string, number>();

  constructor(onError: (report: GuardReport) => void, now: () => number = () => Date.now()) {
    this.onError = onError;
    this.now = now;
  }

  /** Call once at the start of every frame: it is what "frames in a row" counts. */
  beginFrame(): void {
    this.frame++;
  }

  isDisabled(name: string): boolean {
    return this.off.has(name);
  }

  /** The pieces switched off so far. */
  get disabled(): string[] {
    return [...this.off];
  }

  /** Runs fn unless it was switched off; false when it threw or is off. `essential` pieces are never switched off. */
  run(name: string, fn: () => void, essential = false): boolean {
    if (this.off.has(name)) return false;
    try {
      fn();
      return true;
    } catch (error) {
      this.fail(name, error, essential);
      return false;
    }
  }

  /** Records a throw caught elsewhere; true when it switched the piece off. */
  fail(name: string, error: unknown, essential = false): boolean {
    const last = this.lastFailedFrame.get(name);
    // Twice in one frame is still one frame of the streak
    const streak = last === this.frame ? this.streak.get(name) ?? 1 : last === this.frame - 1 ? (this.streak.get(name) ?? 0) + 1 : 1;
    this.lastFailedFrame.set(name, this.frame);
    this.streak.set(name, streak);
    const count = (this.total.get(name) ?? 0) + 1;
    this.total.set(name, count);
    const disable = !essential && (streak >= DISABLE_STREAK || count >= DISABLE_TOTAL);
    if (disable) this.off.add(name);
    if (essential) {
      const now = this.now();
      if (now - (this.lastReport.get(name) ?? -Infinity) < ESSENTIAL_REPORT_GAP_MS) return false;
      this.lastReport.set(name, now);
    }
    this.onError({ name, error, count, disabled: disable });
    return disable;
  }
}
