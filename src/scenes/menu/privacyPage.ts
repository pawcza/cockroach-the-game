/** The privacy policy in the game, scrollable, read from public/privacy.html so the policy has one source. */
import Phaser from 'phaser';
import { createPanel } from '../../ui/shared';
import { smallStyle, UI_TEXT } from '../../utils/TextStyles';

interface Block {
  kind: 'h1' | 'h2' | 'h3' | 'p' | 'li' | 'note';
  text: string;
}

/** Sizes as everywhere in the game (TextStyles snaps them to the font's grid): headings a step above the text. */
const STYLE: Record<Block['kind'], { size: number; color: string; before: number }> = {
  h1: { size: 22, color: UI_TEXT.bone, before: 0 },
  h2: { size: 16, color: UI_TEXT.amber, before: 22 },
  h3: { size: 10, color: UI_TEXT.bone, before: 14 },
  p: { size: 10, color: '#d8cab2', before: 10 },
  li: { size: 10, color: '#d8cab2', before: 8 },
  note: { size: 9, color: UI_TEXT.muted, before: 8 },
};
const LINE_SPACING = 4;
const TOP = 40;
const BOTTOM_ROOM = 96;
const WHEEL = 0.6;
const KEY_STEP = 60;

/** The Polish half of the page: everything before its <hr>, flattened to headings, paragraphs and bullets. */
async function loadPolicy(): Promise<Block[]> {
  const response = await fetch('privacy.html');
  if (!response.ok) throw new Error(`privacy.html: ${response.status}`);
  const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
  const flat = (el: Element): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  const blocks: Block[] = [];
  for (const el of Array.from(doc.querySelector('main')?.children ?? [])) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'hr') break;
    if (tag === 'ul') {
      for (const li of Array.from(el.querySelectorAll('li'))) blocks.push({ kind: 'li', text: `- ${flat(li)}` });
    } else if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      blocks.push({ kind: tag, text: flat(el) });
    } else if (tag === 'p') {
      // The page's own "English below" points nowhere in here; the footer says where it is
      const text = flat(el).replace(/\s*·\s*English below\s*$/, '');
      blocks.push({ kind: el.classList.contains('muted') ? 'note' : 'p', text });
    }
  }
  return blocks;
}

/** Fills the page; returns what to undo when the menu goes. Scrolls with the wheel, the arrows and a drag. */
export function buildPrivacyPage(scene: Phaser.Scene, container: Phaser.GameObjects.Container, width: number, height: number): () => void {
  const columnW = Math.min(width - 80, 680);
  const left = Math.round((width - columnW) / 2);
  const viewTop = TOP;
  const viewBottom = height - BOTTOM_ROOM;

  container.add(createPanel(scene, left - 16, viewTop - 12, columnW + 32, viewBottom - viewTop + 24, 0.9));
  const scroll = scene.add.container(0, 0);
  container.add(scroll);
  const maskShape = scene.make.graphics({});
  maskShape.fillRect(left - 16, viewTop - 8, columnW + 32, viewBottom - viewTop + 16);
  scroll.setMask(new Phaser.Display.Masks.GeometryMask(scene, maskShape));
  // The mask lives outside the page, so it rides along with it as the page slides in and out
  const followPage = (): void => { maskShape.y = container.y; };
  scene.events.on('update', followPage);

  container.add(scene.add.text(Math.round(width / 2), viewBottom + 22, 'Strona www i wersja angielska: cockroach.wszystko.app/privacy', smallStyle({
    fontSize: '8px', color: UI_TEXT.muted, strokeThickness: 0,
  })).setOrigin(0.5));

  let scrollY = 0;
  let maxScroll = 0;
  const scrollTo = (y: number): void => {
    scrollY = Phaser.Math.Clamp(y, 0, maxScroll);
    scroll.y = -scrollY;
  };
  const shown = (): boolean => container.y === 0 && container.visible;

  const status = scene.add.text(left, viewTop, 'Wczytuję…', smallStyle({ fontSize: '10px', color: UI_TEXT.muted, strokeThickness: 0 }));
  scroll.add(status);
  loadPolicy().then((blocks) => {
    if (!scroll.active) return;
    status.destroy();
    let y = viewTop;
    for (const block of blocks) {
      const look = STYLE[block.kind];
      y += look.before;
      const text = scene.add.text(left + (block.kind === 'li' ? 12 : 0), y, block.text, smallStyle({
        fontSize: `${look.size}px`,
        color: look.color,
        strokeThickness: 0,
        lineSpacing: LINE_SPACING,
        wordWrap: { width: columnW - (block.kind === 'li' ? 12 : 0), useAdvancedWrap: true },
      }));
      scroll.add(text);
      y += text.height;
    }
    maxScroll = Math.max(0, y + 16 - viewBottom);
  }).catch(() => {
    if (status.active) status.setText('Nie udało się wczytać. Polityka jest pod cockroach.wszystko.app/privacy');
  });

  const onWheel = (_p: Phaser.Input.Pointer, _o: unknown[], _dx: number, dy: number): void => {
    if (shown()) scrollTo(scrollY + dy * WHEEL);
  };
  const onKey = (event: KeyboardEvent): void => {
    if (!shown()) return;
    const step = event.code === 'ArrowDown' || event.code === 'PageDown' ? 1 : event.code === 'ArrowUp' || event.code === 'PageUp' ? -1 : 0;
    if (step !== 0) scrollTo(scrollY + step * (event.code.startsWith('Page') ? viewBottom - viewTop - 40 : KEY_STEP));
  };
  scene.input.on('wheel', onWheel);
  scene.input.keyboard?.on('keydown', onKey);

  // Dragging the text, on a phone
  const drag = scene.add.rectangle(width / 2, (viewTop + viewBottom) / 2, columnW + 32, viewBottom - viewTop, 0x000000, 0).setInteractive();
  container.add(drag);
  let dragFrom = 0;
  let scrollFrom = 0;
  drag.on('pointerdown', (pointer: Phaser.Input.Pointer) => { dragFrom = pointer.y; scrollFrom = scrollY; });
  drag.on('pointermove', (pointer: Phaser.Input.Pointer) => { if (pointer.isDown) scrollTo(scrollFrom + dragFrom - pointer.y); });

  return () => {
    scene.events.off('update', followPage);
    scene.input.off('wheel', onWheel);
    scene.input.keyboard?.off('keydown', onKey);
    maskShape.destroy();
  };
}
