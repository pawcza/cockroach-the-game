import Phaser from 'phaser';
import { spaced } from '../../../server/achievements';
import { getLevelForDistance } from '../../config/levels';
import { account } from '../../ui/Account';
import { addAchievementIcon } from '../../ui/achievementIcon';
import { GAP, TOUCH_MIN, type Rect } from '../../ui/kit';
import { createScrollList, type ScrollList } from '../../ui/ScrollList';
import { fetchDaily, fetchScoresChecked, type ScoreEntry } from '../../ui/Scoreboard';
import { createButton, createPanel, type UIButton } from '../../ui/shared';
import { bodyStyle, buttonStyle, capCentreShift, smallStyle, UI_TEXT } from '../../utils/TextStyles';

const MEDAL = [0xe8c15a, 0xc9c9c9, 0xc98a52];
const MEDAL_TEXT = ['#e8c15a', '#d6d6d6', '#d9996a'];
const ME_COLOR = 0x9fe08a;

const PAD = 12;
/** The column titles: a pixel-scale icon (48) and its air. */
const HEAD_H = 56;
const ROW_H = 48;
const RANK_W = 56;
/** In from the panel's right edge, clear of the scrollbar. */
const RIGHT = 20;
const SEC_W = 64;
/** The shortest room a name gets before a stat column gives way to it (twelve wide letters). */
const NAME_MIN_LETTERS = 12;
const PIN_H = TOUCH_MIN;
const RUN_BODY = '#d8cab2';
const RUN_DIM = '#a89a80';

/** The stat columns, in the order they give way as the screen narrows (the last goes first). */
interface Column {
  icon: string;
  value: (entry: ScoreEntry) => string;
}
const COLUMNS: Column[] = [
  { icon: 'ach-peak', value: (e) => {
    const level = e.max_level ?? (e.distance != null ? getLevelForDistance(e.distance).level : null);
    return level != null ? String(level) : '-';
  } },
  { icon: 'ach-shoe', value: (e) => (e.distance != null ? String(Math.floor(e.distance)) : '-') },
  { icon: 'ach-flame', value: (e) => (e.max_combo != null ? `x${e.max_combo}` : '-') },
  { icon: 'ach-clock', value: (e) => (e.time_survived != null ? `${e.time_survived}s` : '-') },
  { icon: 'ach-apple', value: (e) => (e.apples_collected != null ? String(e.apples_collected) : '-') },
  { icon: 'ach-beer', value: (e) => (e.tyskies_collected != null ? String(e.tyskies_collected) : '-') },
  { icon: 'ach-pill', value: (e) => (e.pills_collected != null ? String(e.pills_collected) : '-') },
];

/** How the page reaches its owner: a retry after a failed load (the page is built again) and the button it adds to the focus list. */
export interface ScoreHooks {
  retry: () => void;
  offerButton: (button: UIButton) => void;
}

/**
 * Fills `area` of the page with one board (the tabs above it say which); returns its list, for MenuNav's `scroll`, and to
 * destroy before the page is rebuilt or left. Rank, name and score are always there; level, distance, combo, time and
 * the three pickups follow as far as the width allows. Your own row is lit, and pinned at the bottom while it is out of sight.
 */
export function buildScorePage(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  area: Rect,
  board: 'all' | 'daily' | 'endless',
  hooks: ScoreHooks,
): ScrollList {
  const daily = board === 'daily';
  container.add(createPanel(scene, area.x, area.y, area.w, area.h));
  const midX = Math.round(area.x + area.w / 2);
  const midY = Math.round(area.y + area.h / 2);
  const listTop = area.y + HEAD_H;
  const listH = area.y + area.h - 2 - listTop;

  // The pin is made once the board is known; the list reports its scrolling to it
  let onScroll: (y: number) => void = () => undefined;
  const list = createScrollList(scene, container, { x: area.x, y: listTop, w: area.w, h: listH }, { step: ROW_H * 2, onScroll: (y) => onScroll(y) });

  const message = (heading: string, line: string, icon: string, button?: boolean): void => {
    const picture = addAchievementIcon(scene, midX, midY - 52, icon).setAlpha(0.75);
    const title = scene.add.text(midX, midY, heading, bodyStyle({ fontSize: '16px', color: UI_TEXT.bone, align: 'center' })).setOrigin(0.5);
    const detail = scene.add.text(midX, midY + 36, line, smallStyle({ fontSize: '10px', color: UI_TEXT.muted, strokeThickness: 0, align: 'center', wordWrap: { width: area.w - 64 } })).setOrigin(0.5, 0);
    title.setY(midY + capCentreShift(title));
    container.add([picture, title, detail]);
    if (button) {
      const retry = createButton(scene, midX, Math.min(area.y + area.h - 12 - TOUCH_MIN / 2, midY + 36 + detail.height + GAP * 2 + TOUCH_MIN / 2),
        200, TOUCH_MIN, 'Spróbuj jeszcze raz', 0x444444, buttonStyle({ fontSize: '10px' }), hooks.retry);
      container.add(retry.all);
      hooks.offerButton(retry);
    }
  };

  const loadingText = scene.add.text(midX, midY, 'Ładowanie...', bodyStyle({ fontSize: '16px', color: UI_TEXT.muted })).setOrigin(0.5);
  loadingText.setY(midY + capCentreShift(loadingText));
  container.add(loadingText);

  // Today's board is the server's today, whatever this device's clock says
  const load = daily ? fetchDaily().then((day) => (day ? fetchScoresChecked(day.date) : null)) : fetchScoresChecked(undefined, board === 'endless' ? 'endless' : undefined);
  void load.then((scores) => {
    if (!loadingText.active) return;
    loadingText.destroy();

    if (scores === null) {
      message('Tabela nie odpowiada', 'Sprawdź połączenie i spróbuj jeszcze raz.', 'ach-warning', true);
      return;
    }
    if (scores.length === 0) {
      message(daily ? 'Dziś jeszcze nikt...' : 'Jeszcze pusto...',
        daily ? 'Bądź pierwszy!' : board === 'endless' ? 'Pokonaj Eksterminatora i biegnij dalej!' : 'Bądź pierwszy!', 'ach-trophy');
      return;
    }

    // --- Widths: what the numbers need, then how many stat columns are left room for ---
    const measure = (content: string, size: string): number => {
      const probe = scene.add.text(0, 0, content, bodyStyle({ fontSize: size, strokeThickness: 0 }));
      const w = probe.width;
      probe.destroy();
      return w;
    };
    const scoreRight = area.x + area.w - RIGHT;
    const scoreLeft = scoreRight - Math.max(measure('888 888', '24px'), measure(spaced(Math.max(...scores.map(s => s.score))), '24px'));
    const nameLeft = area.x + PAD + RANK_W;
    const secW = Math.max(SEC_W, Math.ceil(measure('88888', '16px')) + 12);
    const room = scoreLeft - 16 - nameLeft - measure('W'.repeat(NAME_MIN_LETTERS), '16px');
    // Endless is ranked by how far the level went: that one stays however narrow
    const shown = Phaser.Math.Clamp(Math.floor(room / secW), board === 'endless' ? 1 : 0, COLUMNS.length);
    const cols = COLUMNS.slice(0, shown);
    const colsLeft = scoreLeft - 16 - shown * secW;
    const nameRoom = colsLeft - nameLeft - 8;
    const colX = (i: number): number => Math.round(colsLeft + (i + 0.5) * secW);

    // --- The column titles, fixed over the list ---
    const headY = area.y + HEAD_H / 2;
    const put = (parent: { add: (o: Phaser.GameObjects.GameObject) => unknown }, x: number, cy: number, content: string, size: string, color: string, originX: number): Phaser.GameObjects.Text => {
      const t = scene.add.text(x, cy, content, bodyStyle({ fontSize: size, color, strokeThickness: 0 })).setOrigin(originX, 0.5);
      t.setY(Math.round(cy + capCentreShift(t)));
      parent.add(t);
      return t;
    };
    const titleStyle = '16px';
    put(container, area.x + PAD + RANK_W / 2, headY, '#', titleStyle, UI_TEXT.muted, 0.5);
    put(container, nameLeft, headY, 'Gracz', titleStyle, UI_TEXT.muted, 0);
    put(container, scoreRight, headY, 'Wynik', titleStyle, UI_TEXT.muted, 1);
    cols.forEach((col, i) => container.add(addAchievementIcon(scene, colX(i), headY, col.icon).setAlpha(0.9)));
    container.add(scene.add.graphics().fillStyle(0x3d2e25, 1).fillRect(area.x, listTop - 2, area.w, 2));

    // --- The rows ---
    const me = account()?.id ?? null;
    const mine = me === null ? -1 : scores.findIndex((entry) => entry.user_id === me);
    const bands = scene.add.graphics();
    list.content.add(bands);

    scores.forEach((entry, i) => {
      const top = listTop + i * ROW_H;
      const cy = top + ROW_H / 2;
      const podium = i < 3;
      const own = i === mine;
      const medal = podium ? MEDAL[i] : 0;
      const color = podium ? MEDAL_TEXT[i] : own ? UI_TEXT.named : UI_TEXT.bone;

      if (i % 2 === 1) bands.fillStyle(0xffffff, 0.03).fillRect(area.x, top, area.w, ROW_H);
      if (podium) bands.fillStyle(medal, 0.1).fillRect(area.x, top, area.w, ROW_H).fillStyle(medal, 1).fillRect(area.x, top, 4, ROW_H);
      if (own) {
        bands.fillStyle(ME_COLOR, 0.14).fillRect(area.x, top, area.w, ROW_H);
        bands.fillStyle(ME_COLOR, 1).fillRect(area.x, top, area.w, 2).fillRect(area.x, top + ROW_H - 2, area.w, 2)
          .fillRect(area.x, top, 4, ROW_H);
      }
      bands.fillStyle(0x000000, 0.25).fillRect(area.x, top + ROW_H - 2, area.w, 2);

      put(list.content, area.x + PAD + RANK_W / 2, cy, podium ? String(i + 1) : `${i + 1}.`, podium ? '24px' : '16px', podium || own ? color : RUN_DIM, 0.5);
      const name = put(list.content, nameLeft, cy, entry.name, '16px', color, 0);
      let shownName = entry.name;
      while (name.width > nameRoom && shownName.length > 1) {
        shownName = shownName.slice(0, -1);
        name.setText(`${shownName.trimEnd()}…`);
      }
      cols.forEach((col, c) => put(list.content, colX(c), cy, col.value(entry), '16px', podium || own ? color : RUN_BODY, 0.5));
      put(list.content, scoreRight, cy, spaced(entry.score), '24px', color, 1);
    });

    // --- Your place, pinned at the bottom while your row is scrolled out of sight ---
    const content = scores.length * ROW_H;
    if (mine < 0) {
      list.setContentHeight(HEAD_H + content);
      return;
    }
    const pinY = area.y + area.h - 2 - PIN_H;
    const pin = scene.add.container(0, 0).setVisible(false);
    const strip = scene.add.graphics()
      .fillStyle(0x2b2117, 1).fillRect(area.x, pinY, area.w, PIN_H)
      .fillStyle(ME_COLOR, 1).fillRect(area.x, pinY, area.w, 2).fillRect(area.x, pinY, 4, PIN_H);
    pin.add(strip);
    put(pin, area.x + PAD + 4, pinY + PIN_H / 2 + 1, `Ty: ${mine + 1}. miejsce · ${spaced(scores[mine].score)}`, '24px', UI_TEXT.named, 0);
    container.add(pin);
    list.setContentHeight(HEAD_H + content);
    const rowTop = mine * ROW_H;
    // The strip takes the bottom of the window while your row is outside the whole window, and gives it back when it is in
    onScroll = (y) => {
      const out = rowTop < y || rowTop + ROW_H > y + listH;
      if (out === pin.visible) return;
      pin.setVisible(out);
      list.setViewHeight(out ? listH - PIN_H : listH);
    };
    onScroll(0);
  });

  return list;
}
