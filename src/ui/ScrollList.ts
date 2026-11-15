/**
 * A list that scrolls inside a rectangle of a page: masked to it, with a thin scrollbar at its right edge. The wheel,
 * PageUp/PageDown/Home/End and a drag scroll it; the arrows do through MenuNav (pass the list as `scroll` to
 * MenuNav.set). A drag only starts past a small dead zone, so a tap on a row stays a tap, and once it starts, buttons in
 * the list under the finger are let go (a control with `keepsDrag` in its data, like a slider's track, keeps its own drags).
 * A press reaches the list's rows only where the pointer is inside its rectangle (clipHits): the mask hides what is
 * scrolled out of it, but Phaser's hit test ignores masks, so a row half under the edge would still take taps meant for
 * what is over it, such as the page header.
 *
 * The mask follows the page, so a page sliding in shows the list where it will end up, unclipped by the old spot.
 */
import Phaser from 'phaser';
import type { ScrollTarget } from './MenuNav';
import type { Rect } from './kit';
import type { UIButton } from './shared';

/** How far a finger moves before it is a drag, not a tap. */
const DRAG_DEAD_ZONE = 8;
const WHEEL_FACTOR = 0.5;
const BAR_W = 4;
const BAR_INSET = 4;
const MIN_THUMB = 16;

export interface ScrollList extends ScrollTarget {
  /** Add the rows here, placed in the page's coordinates (the first row at rect.y or below). */
  content: Phaser.GameObjects.Container;
  /** How tall the rows are, from rect.y: sets how far the list scrolls. Call it again when rows change. */
  setContentHeight: (h: number) => void;
  scrollTo: (y: number) => void;
  /** Makes the list's window this tall from rect.y (a strip over the bottom of it takes the rest), keeping the rows' height. */
  setViewHeight: (h: number) => void;
  /** Unhooks the list from the scene and drops its mask. The page's removeAll destroys the rows. */
  destroy: () => void;
}

/** What a list filters out of a pointer's hits: rows of `content` under a pointer that is outside the list's window. */
type HitFilter = (pointer: Phaser.Input.Pointer, hit: Phaser.GameObjects.GameObject) => boolean;
const hitFilters = new WeakMap<Phaser.Input.InputPlugin, Set<HitFilter>>();

/**
 * Phaser's hit test knows nothing of masks, so the one place that decides what is under a pointer (hover, down and up
 * all go through it) is wrapped once per scene: every list there gets to drop the hits it owns that are out of view.
 */
function addHitFilter(input: Phaser.Input.InputPlugin, filter: HitFilter): () => void {
  let filters = hitFilters.get(input);
  if (!filters) {
    const all = new Set<HitFilter>();
    filters = all;
    hitFilters.set(input, all);
    const original = input.hitTestPointer.bind(input);
    input.hitTestPointer = (pointer: Phaser.Input.Pointer): Phaser.GameObjects.GameObject[] => {
      const over = original(pointer);
      if (all.size === 0) return over;
      // In place: the array is the input manager's own scratch one
      let kept = 0;
      for (const hit of over) {
        let ok = true;
        for (const f of all) if (!f(pointer, hit)) { ok = false; break; }
        if (ok) over[kept++] = hit;
      }
      over.length = kept;
      return over;
    };
  }
  filters.add(filter);
  return () => { filters.delete(filter); };
}

export function createScrollList(
  scene: Phaser.Scene,
  page: Phaser.GameObjects.Container,
  rect: Rect,
  opts: { step?: number; onScroll?: (y: number) => void } = {},
): ScrollList {
  rect = { ...rect };
  const step = opts.step ?? 60;
  const content = scene.add.container(0, 0);
  page.add(content);
  const maskShape = scene.make.graphics({});
  const drawMask = (): void => { maskShape.clear().fillStyle(0xffffff).fillRect(rect.x, rect.y, rect.w, rect.h); };
  drawMask();
  content.setMask(new Phaser.Display.Masks.GeometryMask(scene, maskShape));
  const bar = scene.add.graphics();
  page.add(bar);

  let scrollY = 0;
  let maxScroll = 0;
  let contentH = 0;

  const origin = (): { x: number; y: number } => {
    const m = page.getWorldTransformMatrix();
    return { x: m.tx, y: m.ty };
  };
  // The page is the one on screen: in place, not sliding, and shown
  const shown = (): boolean => {
    const at = origin();
    return page.visible && Math.abs(at.x) < 1 && Math.abs(at.y) < 1;
  };
  const followPage = (): void => {
    const at = origin();
    maskShape.setPosition(at.x, at.y);
  };

  const interactive = (list: Phaser.GameObjects.GameObject[], fn: (o: Phaser.GameObjects.GameObject) => void): void => {
    for (const o of list) {
      if (o.input) fn(o);
      if (o instanceof Phaser.GameObjects.Container) interactive(o.list, fn);
    }
  };
  const inside = (pointer: Phaser.Input.Pointer): boolean => {
    const at = origin();
    const x = pointer.worldX - at.x;
    const y = pointer.worldY - at.y;
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  };
  const isRow = (o: Phaser.GameObjects.GameObject): boolean => {
    for (let c = (o as { parentContainer?: Phaser.GameObjects.Container | null }).parentContainer; c; c = c.parentContainer) {
      if (c === content) return true;
    }
    return false;
  };
  const removeFilter = addHitFilter(scene.input, (pointer, hit) => !isRow(hit) || inside(pointer));

  const drawBar = (): void => {
    bar.clear();
    if (maxScroll <= 0) return;
    const x = rect.x + rect.w - BAR_INSET - BAR_W;
    const thumbH = Math.max(MIN_THUMB, Math.round((rect.h * rect.h) / (rect.h + maxScroll)));
    const thumbY = rect.y + Math.round(((rect.h - thumbH) * scrollY) / maxScroll);
    bar.fillStyle(0x000000, 0.4).fillRect(x, rect.y, BAR_W, rect.h);
    bar.fillStyle(0xb9a78d, 0.85).fillRect(x, thumbY, BAR_W, thumbH);
  };

  const scrollTo = (y: number): void => {
    scrollY = Math.round(Phaser.Math.Clamp(y, 0, maxScroll));
    content.y = -scrollY;
    drawBar();
    opts.onScroll?.(scrollY);
  };

  const onWheel = (_p: Phaser.Input.Pointer, _over: unknown[], _dx: number, dy: number): void => {
    if (shown()) scrollTo(scrollY + dy * WHEEL_FACTOR);
  };
  const onKey = (event: KeyboardEvent): void => {
    if (!shown() || maxScroll <= 0) return;
    const screenful = rect.h - step;
    const to = { PageDown: scrollY + screenful, PageUp: scrollY - screenful, Home: 0, End: maxScroll }[event.code];
    if (to !== undefined) scrollTo(to);
  };

  // Dragging: from a press inside the rectangle, once it has moved past the dead zone
  let pointerId: number | null = null;
  let dragging = false;
  let startY = 0;
  let startScroll = 0;
  const onDown = (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[] = []): void => {
    if (!shown() || maxScroll <= 0) return;
    // A control that is dragged itself (a slider's track) keeps the gesture
    if (over.some(o => o.getData('keepsDrag'))) return;
    const at = origin();
    const x = pointer.x - at.x;
    const y = pointer.y - at.y;
    if (x < rect.x || x > rect.x + rect.w || y < rect.y || y > rect.y + rect.h) return;
    pointerId = pointer.id;
    dragging = false;
    startY = pointer.y;
    startScroll = scrollY;
  };
  const onMove = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id !== pointerId || !pointer.isDown) return;
    if (!dragging) {
      if (Math.abs(pointer.y - startY) < DRAG_DEAD_ZONE) return;
      dragging = true;
      startY = pointer.y;
      // A drag is not a press: the button it started on lets go
      interactive(content.list, o => o.emit('pointerout', pointer));
    }
    scrollTo(startScroll + startY - pointer.y);
  };
  const onUp = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id === pointerId) pointerId = null;
  };

  scene.events.on(Phaser.Scenes.Events.PRE_RENDER, followPage);
  scene.input.on('wheel', onWheel);
  scene.input.on('pointerdown', onDown);
  scene.input.on('pointermove', onMove);
  scene.input.on('pointerup', onUp);
  scene.input.keyboard?.on('keydown', onKey);
  followPage();

  const destroy = (): void => {
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, destroy);
    scene.events.off(Phaser.Scenes.Events.PRE_RENDER, followPage);
    scene.input.off('wheel', onWheel);
    scene.input.off('pointerdown', onDown);
    scene.input.off('pointermove', onMove);
    scene.input.off('pointerup', onUp);
    scene.input.keyboard?.off('keydown', onKey);
    removeFilter();
    maskShape.destroy();
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, destroy);

  const holds = (button: UIButton): boolean => content.exists(button.bg);
  return {
    content,
    setContentHeight: (h) => {
      contentH = h;
      maxScroll = Math.max(0, Math.ceil(h - rect.h));
      scrollTo(scrollY);
    },
    setViewHeight: (h) => {
      rect.h = h;
      drawMask();
      maxScroll = Math.max(0, Math.ceil(contentH - rect.h));
      scrollTo(scrollY);
    },
    scrollTo,
    scrollBy: (steps) => {
      const before = scrollY;
      scrollTo(scrollY + steps * step);
      return scrollY !== before;
    },
    atTop: () => scrollY <= 0,
    holds,
    reveal: (button) => {
      if (!holds(button)) return;
      const top = button.y - button.h / 2 - scrollY;
      const bottom = button.y + button.h / 2 - scrollY;
      if (top < rect.y) scrollTo(scrollY - (rect.y - top) - 8);
      else if (bottom > rect.y + rect.h) scrollTo(scrollY + bottom - (rect.y + rect.h) + 8);
    },
    destroy,
  };
}
