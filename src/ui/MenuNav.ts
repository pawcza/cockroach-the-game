import Phaser from 'phaser';
import { UIButton } from './shared';

const DIRECTIONS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};

/** Among buttons in line, how much being off-centre counts against one, against the gap to it. */
const DRIFT_WEIGHT = 0.1;
/** Buttons whose faces don't line up come after every one that does. */
const OFF_LINE_PENALTY = 10_000;

/**
 * Keyboard focus for a screen's buttons: arrows (or WASD) move to the nearest button that way, Enter or Space
 * presses it, Esc goes back. The mouse moves the same focus, so there is only ever one lit button.
 */
export class MenuNav {
  private buttons: UIButton[] = [];
  private focused: UIButton | null = null;
  private hooked = new WeakSet<UIButton>();
  private onBack: (() => void) | null = null;
  /** Off while something else owns the keyboard, such as the name input. */
  enabled = true;

  constructor(scene: Phaser.Scene) {
    const onKey = (event: KeyboardEvent): void => this.handleKey(event);
    scene.input.keyboard?.on('keydown', onKey);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.input.keyboard?.off('keydown', onKey));
  }

  /** Makes these buttons the ones the arrows move between, focusing `initial`. */
  set(buttons: UIButton[], opts: { initial?: UIButton; onBack?: () => void } = {}): void {
    this.focused?.setFocused(false);
    this.buttons = buttons;
    this.onBack = opts.onBack ?? null;
    for (const button of buttons) {
      if (this.hooked.has(button)) continue;
      this.hooked.add(button);
      button.hitZone.on('pointerover', () => { if (this.buttons.includes(button)) this.focus(button); });
    }
    this.focused = null;
    const first = opts.initial ?? buttons.find(b => b.enabled) ?? null;
    if (first) this.focus(first);
  }

  focus(button: UIButton): void {
    if (this.focused === button) return;
    this.focused?.setFocused(false);
    this.focused = button;
    button.setFocused(true);
  }

  private handleKey(event: KeyboardEvent): void {
    if (!this.enabled) return;
    const direction = DIRECTIONS[event.code];
    if (direction) {
      if (direction[0] !== 0 && this.focused?.adjust) this.focused.adjust(direction[0]);
      else this.move(direction[0], direction[1]);
    } else if (event.code === 'Enter' || event.code === 'NumpadEnter' || event.code === 'Space') {
      this.focused?.activate();
    } else if (event.code === 'Escape') {
      this.onBack?.();
    } else {
      return;
    }
    event.preventDefault();
  }

  /**
   * To the button that way whose face lines up with this one's (the nearest by the gap between their edges, then the
   * best aligned), or failing that the nearest within 45° of the arrow. Edges rather than centres, so a wide button
   * over a row of small ones goes to that row, not to whatever is centred under it further down.
   */
  private move(dx: number, dy: number): void {
    const from = this.focused;
    if (!from) {
      const first = this.buttons.find(b => b.enabled);
      if (first) this.focus(first);
      return;
    }
    let best: UIButton | null = null;
    let bestScore = Infinity;
    for (const candidate of this.buttons) {
      if (candidate === from || !candidate.enabled) continue;
      const centreAlong = (candidate.x - from.x) * dx + (candidate.y - from.y) * dy;
      if (centreAlong <= 0) continue;
      // Edge to edge along the arrow, and how far apart the faces are across it (0 when they overlap)
      const halfAlong = (b: UIButton): number => (dx !== 0 ? b.w : b.h) / 2;
      const halfAcross = (b: UIButton): number => (dx !== 0 ? b.h : b.w) / 2;
      const gap = Math.max(0, centreAlong - halfAlong(from) - halfAlong(candidate));
      const centreAcross = Math.abs((candidate.x - from.x) * dy + (candidate.y - from.y) * dx);
      const apart = Math.max(0, centreAcross - halfAcross(from) - halfAcross(candidate));
      if (apart > 0 && centreAcross > centreAlong) continue;
      const score = (apart > 0 ? OFF_LINE_PENALTY : 0) + gap + centreAcross * DRIFT_WEIGHT;
      if (score < bestScore) { bestScore = score; best = candidate; }
    }
    if (best) this.focus(best);
  }
}
