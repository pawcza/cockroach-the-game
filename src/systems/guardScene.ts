/**
 * Puts a scene's whole frame under an UpdateGuard: every listener of its pre-update, update and post-update events (the
 * enemies' drives, the effects, the taunts, the clock and tweens) runs on its own, so one that throws costs only itself
 * that frame; a listener the guard switches off is taken off the event. The render is guarded the same way. The scene's
 * own update() guards its pieces itself (GameScene). Every throw goes to console.error with its stack; in development a
 * small red line at the foot of the screen says what broke. There is no endpoint for client errors, so production only
 * logs.
 */
import Phaser from 'phaser';
import { GuardReport, UpdateGuard } from './UpdateGuard';

const GUARDED = new Set<string>([Phaser.Scenes.Events.PRE_UPDATE, Phaser.Scenes.Events.UPDATE, Phaser.Scenes.Events.POST_UPDATE]);
/** The dev error line stays this long after the last error. */
const DEV_LINE_MS = 8000;

interface Listener { fn: (...args: unknown[]) => void; context: unknown; once: boolean }
type RawEmitter = Phaser.Events.EventEmitter & { _events?: Record<string, Listener | Listener[] | undefined> };

/** A name for a listener that tells it apart from every other, for the guard's counts and the log. */
const names = new WeakMap<object, string>();
let nextId = 1;
function listenerName(l: Listener, emitter: unknown): string {
  let name = names.get(l.fn);
  if (name === undefined) {
    // A listener added without a context runs with the emitter as its this: no owner worth naming
    const owner = l.context === emitter ? undefined : (l.context as { constructor?: { name?: string } } | undefined)?.constructor?.name;
    name = `${owner && owner !== 'Object' ? `${owner}.` : ''}${l.fn.name || 'listener'}#${nextId++}`;
    names.set(l.fn, name);
  }
  return name;
}

/** Makes the scene's guard, wires it, and returns it for the scene's own update to use. */
export function guardScene(scene: Phaser.Scene): UpdateGuard {
  let devLine: Phaser.GameObjects.Text | null = null;
  let devTimer: Phaser.Time.TimerEvent | null = null;
  const report = ({ name, error, count, disabled }: GuardReport): void => {
    console.error(`[${scene.scene.key}] ${name} threw (${count}×${disabled ? ', switched off for this run' : ''})`, error);
    if (!import.meta.env.DEV || !scene.sys.isActive()) return;
    const message = error instanceof Error ? error.message : String(error);
    const text = `${name}: ${message}${disabled ? ' [off]' : ''}`.slice(0, 160);
    if (!devLine || !devLine.active) {
      devLine = scene.add.text(4, scene.scale.height - 4, '', {
        fontFamily: 'monospace', fontSize: '11px', color: '#ff5a4a', backgroundColor: '#000000cc', padding: { x: 4, y: 2 },
      }).setOrigin(0, 1).setScrollFactor(0).setDepth(Number.MAX_SAFE_INTEGER);
    }
    devLine.setText(text).setVisible(true);
    devTimer?.remove();
    devTimer = scene.time.delayedCall(DEV_LINE_MS, () => devLine?.setVisible(false));
  };
  const guard = new UpdateGuard(report);

  // The scene systems' own listeners keep running whatever happens: they are only reported
  const essential = (context: unknown): boolean => {
    const sys = scene.sys as unknown as Record<string, unknown>;
    return context === scene.sys || context === scene.time || context === scene.tweens || context === scene.input
      || context === sys.updateList || context === sys.displayList || context === scene.cameras || context === scene.anims
      || (!!scene.physics && (context === scene.physics || context === scene.physics.world));
  };

  const events = scene.sys.events as RawEmitter;
  const emit = events.emit;
  events.emit = function guardedEmit(this: RawEmitter, event: string | symbol, ...args: unknown[]): boolean {
    if (typeof event !== 'string' || !GUARDED.has(event)) return emit.call(this, event, ...args);
    if (event === Phaser.Scenes.Events.PRE_UPDATE) guard.beginFrame();
    const slot = this._events?.[event];
    if (!slot) return false;
    // Iterate a copy, as the emitter does: a listener may add or remove others
    const list = Array.isArray(slot) ? slot.slice() : [slot];
    for (const l of list) {
      if (l.once) this.removeListener(event, l.fn, undefined, true);
      try {
        l.fn.apply(l.context, args);
      } catch (error) {
        if (guard.fail(listenerName(l, this), error, essential(l.context))) this.off(event, l.fn, l.context);
      }
    }
    return true;
  };

  const sys = scene.sys;
  const render = sys.render.bind(sys);
  sys.render = (renderer) => { guard.run('render', () => render(renderer), true); };

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    events.emit = emit;
    sys.render = render;
    devTimer?.remove();
    devLine?.destroy();
  });
  return guard;
}
