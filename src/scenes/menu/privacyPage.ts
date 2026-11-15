/** The privacy policy in the game, scrollable, read from public/privacy.html so the policy has one source. */
import Phaser from 'phaser';
import { createPanel } from '../../ui/shared';
import type { Rect } from '../../ui/kit';
import { createScrollList, type ScrollList } from '../../ui/ScrollList';
import { smallStyle, UI_TEXT } from '../../utils/TextStyles';

interface Block {
  kind: 'h1' | 'h2' | 'h3' | 'p' | 'li' | 'note';
  text: string;
}

/** Sizes as everywhere in the game (TextStyles snaps them to the font's grid): headings a step above the text. */
const STYLE: Record<Block['kind'], { size: number; color: string; before: number }> = {
  h1: { size: 22, color: UI_TEXT.bone, before: 0 },
  h2: { size: 16, color: UI_TEXT.amber, before: 32 },
  h3: { size: 10, color: UI_TEXT.bone, before: 20 },
  p: { size: 10, color: '#d8cab2', before: 14 },
  li: { size: 10, color: '#d8cab2', before: 10 },
  note: { size: 9, color: UI_TEXT.muted, before: 10 },
};
/** Air between the lines of a paragraph: a phone's small letters need more of it than a monitor's. */
const LINE_SPACING = 8;
/** A line of 60 to 70 letters reads best: the column stops growing there, however wide the screen. */
const COLUMN_MAX = 520;
/** Under the panel: where the page is on the web. */
const FOOTER_H = 32;
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

/** Fills `area` of the page (kit contentArea); returns its list, for MenuNav's `scroll`, and to destroy when the menu goes. */
export function buildPrivacyPage(scene: Phaser.Scene, container: Phaser.GameObjects.Container, area: Rect): ScrollList {
  const columnW = Math.min(area.w - 64, COLUMN_MAX);
  const left = Math.round(area.x + (area.w - columnW) / 2);
  const viewTop = area.y + 16;
  const viewBottom = area.y + area.h - FOOTER_H - 12;

  container.add(createPanel(scene, left - 16, area.y, columnW + 32, area.h - FOOTER_H, 0.9));
  const list = createScrollList(scene, container, { x: left - 16, y: viewTop - 8, w: columnW + 32, h: viewBottom - viewTop + 16 }, { step: KEY_STEP });
  const scroll = list.content;

  container.add(scene.add.text(Math.round(area.x + area.w / 2), area.y + area.h - FOOTER_H / 2, 'Strona www i wersja angielska: cockroach.wszystko.app/privacy', smallStyle({
    fontSize: '8px', color: UI_TEXT.muted, strokeThickness: 0,
  })).setOrigin(0.5));

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
    list.setContentHeight(y + 16 - (viewTop - 8));
  }).catch(() => {
    if (status.active) status.setText('Nie udało się wczytać. Polityka jest pod cockroach.wszystko.app/privacy');
  });
  return list;
}
