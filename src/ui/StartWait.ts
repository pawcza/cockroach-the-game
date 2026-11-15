/**
 * The screen a run start shows while what it needs is still loading (src/config/packs.ts startPlan): "Ładowanie...",
 * with the way back to the menu (Esc, the back button, or the button on screen). If a pack fails after its retries, it
 * says so and offers to try again or go back; it never waits for good.
 */
import Phaser from 'phaser';
import type { PackLoader } from '../systems/PackLoader';
import { SKIN_GRACE_MS, type StartPlan } from '../config/packs';
import { bodyStyle, buttonStyle, UI_TEXT } from '../utils/TextStyles';
import { MenuNav } from './MenuNav';
import { createButton, type UIButton } from './shared';

export interface StartWaitHandlers {
  /** Everything needed is in: build the run. */
  ready(): void;
  /** Back to the menu. */
  leave(): void;
}

/** Shows the wait, loads what the plan requires, then calls `ready` (after the worn skin's grace) or offers a retry. */
export function waitForStart(scene: Phaser.Scene, loader: PackLoader, plan: StartPlan, handlers: StartWaitHandlers): void {
  const { width, height } = scene.cameras.main;
  const nav = new MenuNav(scene);
  let shown: Phaser.GameObjects.GameObject[] = [];
  let left = false;
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { left = true; });

  const clear = (): void => {
    shown.forEach(o => o.destroy());
    shown = [];
  };
  const button = (x: number, label: string, action: () => void): UIButton => {
    const b = createButton(scene, x, height / 2 + 44, 200, 36, label, 0x444444, buttonStyle({ fontSize: '10px' }), action);
    b.all.forEach(o => (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor?.(0));
    shown.push(...b.all);
    return b;
  };
  const leave = (): void => { if (!left) handlers.leave(); };

  const attempt = (): void => {
    clear();
    shown.push(scene.add.text(width / 2, height / 2, 'Ładowanie...', bodyStyle({ color: UI_TEXT.muted })).setOrigin(0.5).setScrollFactor(0));
    const menu = button(width / 2, 'Menu', leave);
    nav.set([menu], { onBack: leave });
    void loader.ensure(plan.required).then(async (failed) => {
      if (left) return;
      if (failed.length > 0) {
        offerRetry();
        return;
      }
      // The worn shop skin, if it is quick: otherwise the plain roach runs until it lands
      await Promise.race([loader.ensure(plan.grace), new Promise(resolve => setTimeout(resolve, SKIN_GRACE_MS))]);
      if (!left) handlers.ready();
    });
  };

  const offerRetry = (): void => {
    clear();
    shown.push(scene.add.text(width / 2, height / 2 - 10, 'Nie udało się wczytać gry. Sprawdź połączenie.',
      bodyStyle({ color: '#e07a6a' })).setOrigin(0.5).setScrollFactor(0));
    const retry = button(width / 2 - 110, 'Spróbuj ponownie', attempt);
    const menu = button(width / 2 + 110, 'Menu', leave);
    nav.set([retry, menu], { initial: retry, onBack: leave });
  };

  loader.prefetch(plan.soon);
  attempt();
}
