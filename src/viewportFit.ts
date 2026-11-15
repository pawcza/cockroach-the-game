import Phaser from 'phaser';
import { GAME_HEIGHT, PIXEL_BLOCK } from './config/constants';

/**
 * Keeps the canvas fitted to what can actually be seen, and every page laid out for the width it is shown at.
 *
 * A phone's viewport doesn't change in one step. After a rotation the browser may report the old size for a while
 * (iOS fires orientationchange first, the new size lands a few hundred ms later), and the URL and tool bars slide in
 * or out afterwards, changing the height and with it the zoom and the logical width. So every event that can move the
 * viewport starts the same loop: refit on each animation frame until the size has held still for a few frames, then
 * re-lay out the page if its width changed. A self-check shortly after catches a change no event announced.
 */

/** 4:3: the narrowest screen every page is laid out for. */
export const MIN_WIDTH = Math.ceil((GAME_HEIGHT * 4) / 3);

/** The size has to hold this many frames in a row, and this long, to count as settled. */
const STABLE_FRAMES = 3;
const STABLE_MS = 120;
/** A loop that never settles (a window edge dragged for ages) still settles after this many frames, then waits for the next event. */
const MAX_FRAMES = 240;
/** The self-check after a settle: once soon, once after the bars have surely finished. */
const CHECKS_MS = [250, 1000];
/** In pixels: a canvas this close to where it should be is where it should be. */
const SLACK = 2;
/** A page re-laid out more often than this is in a loop: it is left alone until things calm down. */
const RELAYOUTS_MAX = 5;
const RELAYOUTS_WINDOW_MS = 2000;
const RETRY_MS = 150;

/** A scene that wants to come back as it was (the menu on the page it was on) gives the data to restart it with. */
export interface Relayoutable {
  relayoutData(): object | undefined;
}

/**
 * The world is GAME_HEIGHT logical px tall; each native pixel (PIXEL_BLOCK logical px) becomes a whole number
 * of device pixels, as many as fit the height. The width fills the space. A space too short for that to fill most
 * of it falls back to an exact fit, where native pixels differ by at most one device pixel.
 */
const fitTo = (game: Phaser.Game, w: number, h: number, dpr: number): void => {
  const nativeRows = GAME_HEIGHT / PIXEL_BLOCK;
  const perNative = Math.max(1, Math.floor((h * dpr) / nativeRows));
  let zoom = (perNative / PIXEL_BLOCK) / dpr; // CSS px per logical px
  if (GAME_HEIGHT * zoom < h * 0.8) zoom = h / GAME_HEIGHT;
  // Narrower than 4:3 (a phone held upright) the menus would be cut off: fit the width instead, bars above and below
  if (w / zoom < MIN_WIDTH) zoom = w / MIN_WIDTH;
  const width = Math.max(MIN_WIDTH, Math.ceil(w / zoom));
  if (width !== game.scale.width || game.scale.height !== GAME_HEIGHT) game.scale.resize(width, GAME_HEIGHT);
  if (Math.abs(zoom - game.scale.zoom) > 1e-6) game.scale.setZoom(zoom);
};

/** The width the first frame is made at, before the loop has run. */
export const initialWidth = (): number => Math.max(MIN_WIDTH, Math.ceil(window.innerWidth / (window.innerHeight / GAME_HEIGHT)));

interface Reading { x: number; y: number; w: number; h: number; dpr: number }

/** What can be seen: the visual viewport where there is one (and it isn't pinch-zoomed), else the window. */
const read = (): Reading => {
  const vv = window.visualViewport;
  const dpr = window.devicePixelRatio || 1;
  if (vv && Math.abs(vv.scale - 1) < 0.01) return { x: vv.offsetLeft, y: vv.offsetTop, w: vv.width, h: vv.height, dpr };
  return { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight, dpr };
};
const keyOf = (r: Reading): string => [r.x, r.y, r.w, r.h, r.dpr].map(n => Math.round(n * 100)).join(',');

/** A text field is up (the name input): the on-screen keyboard shrinks the viewport, and a re-layout would lose what was typed. */
const typing = (): boolean => {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
};
const fieldOpen = (): boolean => document.querySelector('input:not([type=hidden]), textarea') !== null;
/** The crossfade between scenes (utils/SceneTransition) is a fixed black div over everything. */
const inTransition = (): boolean =>
  Array.from(document.body.children).some(el => el instanceof HTMLDivElement && el.style.zIndex === '9999' && el.style.position === 'fixed');

export function startViewportFit(
  game: Phaser.Game,
  opts: { runScene: string; skip: string[]; onOrientationFlip: (scene: Phaser.Scene) => void },
): void {
  const body = document.body;
  /** The width each scene was last laid out for: set when it is created. */
  const laidWidth = new WeakMap<Phaser.Scene, number>();
  let applied = '';
  let raf = 0;
  let frames = 0;
  let stable = 0;
  let last = '';
  let changedAt = 0;
  let landscape = window.innerWidth > window.innerHeight;
  let checkTimers: number[] = [];
  let checkRefits = 0;
  let retryTimer = 0;
  const relayouts = new Map<string, number[]>();

  /** Pins the page to the visible area (the canvas is centred in it, inside the safe-area insets) and fits the canvas to it. */
  const apply = (): string => {
    const r = read();
    body.style.left = `${r.x}px`;
    body.style.top = `${r.y}px`;
    body.style.width = `${r.w}px`;
    body.style.height = `${r.h}px`;
    const cs = getComputedStyle(body);
    const w = r.w - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const h = r.h - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (w > 0 && h > 0) fitTo(game, w, h, r.dpr);
    applied = keyOf(r);
    return applied;
  };

  const activeScene = (): Phaser.Scene | undefined =>
    game.scene.getScenes(true).find(s => !opts.skip.includes(s.scene.key));

  const tick = (): void => {
    raf = 0;
    if (typing()) return; // refit once the field closes (focusout)
    frames++;
    const key = apply();
    const now = performance.now();
    if (key === last) stable++;
    else { stable = 0; changedAt = now; }
    last = key;
    if ((stable >= STABLE_FRAMES && now - changedAt >= STABLE_MS) || frames >= MAX_FRAMES) settled();
    else raf = requestAnimationFrame(tick);
  };

  /** Every event that may have moved the viewport lands here. */
  const schedule = (fromEvent = true): void => {
    if (fromEvent) checkRefits = 0;
    frames = 0;
    stable = 0;
    last = '';
    checkTimers.forEach(t => window.clearTimeout(t));
    checkTimers = [];
    if (!raf) raf = requestAnimationFrame(tick);
  };

  const settled = (): void => {
    const nowLandscape = window.innerWidth > window.innerHeight;
    const flipped = nowLandscape !== landscape;
    landscape = nowLandscape;
    const scene = activeScene();
    // A run survives rotation: GameScene lays itself out again from the resize; turned on its side it pauses
    if (flipped && scene?.scene.key === opts.runScene) opts.onOrientationFlip(scene);
    relayout();
    checkTimers = CHECKS_MS.map(ms => window.setTimeout(check, ms));
  };

  /** Every page but a run is built for one width: when the width it is shown at isn't that, it is built again. */
  const relayout = (): void => {
    window.clearTimeout(retryTimer);
    const scene = activeScene();
    if (!scene || scene.scene.key === opts.runScene) return;
    const laid = laidWidth.get(scene);
    if (laid === undefined || laid === game.scale.width) return;
    // Not halfway into another scene, not over a half-typed name, not before the scene is up: soon, then
    if (raf || inTransition() || fieldOpen() || scene.sys.settings.status !== Phaser.Scenes.RUNNING) {
      retryTimer = window.setTimeout(relayout, RETRY_MS);
      return;
    }
    const now = performance.now();
    const recent = (relayouts.get(scene.scene.key) ?? []).filter(t => now - t < RELAYOUTS_WINDOW_MS);
    if (recent.length >= RELAYOUTS_MAX) {
      retryTimer = window.setTimeout(relayout, RELAYOUTS_WINDOW_MS);
      return;
    }
    relayouts.set(scene.scene.key, [...recent, now]);
    const data = (scene as unknown as Partial<Relayoutable>).relayoutData?.();
    // No data: Phaser starts it again with the data it was started with
    scene.scene.restart(data);
  };

  /** Does what is on screen agree with what can be seen? If not, fit again (a few times at most without a new event). */
  const check = (): void => {
    if (raf || typing() || document.hidden) return;
    let wrong = keyOf(read()) !== applied;
    if (!wrong) {
      const box = body.getBoundingClientRect();
      const cs = getComputedStyle(body);
      const left = box.left + parseFloat(cs.paddingLeft);
      const top = box.top + parseFloat(cs.paddingTop);
      const w = box.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = box.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const zoom = game.scale.zoom;
      const cw = game.scale.width * zoom;
      const ch = game.scale.height * zoom;
      const c = game.canvas.getBoundingClientRect();
      wrong = Math.abs(c.width - cw) > SLACK || Math.abs(c.height - ch) > SLACK
        || Math.abs(c.left + c.width / 2 - (left + w / 2)) > SLACK || Math.abs(c.top + c.height / 2 - (top + h / 2)) > SLACK
        || cw < w - SLACK - zoom || ch > h + SLACK;
      // The page itself scrolled (it shouldn't be able to): back to the top
      if (window.scrollX !== 0 || window.scrollY !== 0) { window.scrollTo(0, 0); wrong = true; }
    }
    if (wrong && checkRefits < 3) {
      checkRefits++;
      schedule(false);
    } else relayout();
  };

  game.events.once(Phaser.Core.Events.READY, () => {
    for (const scene of game.scene.scenes) {
      scene.sys.events.on(Phaser.Scenes.Events.CREATE, () => {
        laidWidth.set(scene, game.scale.width);
        // A page coming up checks it was built for what is on screen now
        window.setTimeout(check, 0);
      });
    }
  });
  if (import.meta.env.DEV) (window as unknown as { __laid: (s: Phaser.Scene) => number | undefined }).__laid = (s) => laidWidth.get(s);

  const onEvent = (): void => schedule();
  window.addEventListener('resize', onEvent);
  window.addEventListener('orientationchange', onEvent);
  screen.orientation?.addEventListener('change', onEvent);
  window.visualViewport?.addEventListener('resize', onEvent);
  window.visualViewport?.addEventListener('scroll', onEvent);
  window.addEventListener('pageshow', onEvent);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  document.addEventListener('focusout', () => window.setTimeout(onEvent, 0));
  document.addEventListener('fullscreenchange', () => {
    schedule();
    // In fullscreen a phone can stay on its side: where the browser allows it (Android Chrome; never iPhone Safari)
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    if (document.fullscreenElement && window.innerWidth > window.innerHeight && !game.device.os.desktop && orientation?.lock) {
      orientation.lock('landscape').catch(() => undefined);
    }
  });

  apply();
  schedule();
}
