/**
 * Statystyki: the records as big tiles, then what was run, collected, pulled off, the bosses and the modes, each group a
 * row of tiles, in a list that scrolls. Zeros are shown calmly, dimmed; a boss not met yet stays a "???".
 */
import Phaser from 'phaser';
import { BOSS_WINS, spaced } from '../../../server/achievements';
import { ICON_HIDDEN } from '../../systems/achievementView';
import { BOSSES } from '../../systems/boss/bosses';
import { profile } from '../../systems/Profile';
import { account } from '../../ui/Account';
import { addAchievementIcon } from '../../ui/achievementIcon';
import { GAP, type Rect } from '../../ui/kit';
import { createScrollList, type ScrollList } from '../../ui/ScrollList';
import { createPanel } from '../../ui/shared';
import { smallStyle, UI_TEXT } from '../../utils/TextStyles';

const PAD = 12;
const SCROLLBAR = 12;
const HEADING_H = 32;
const GROUP_GAP = 12;
const HERO_PAD = 14;
const HERO_GAP = 10;
const ROW_GAP = 6;
const TILE_H = 96;
const ICON = 48;
/** The narrowest a compact tile may be before the row drops to two columns. */
const TILE_MIN_W = 200;
const HERO_MIN_W = 170;
const AMBER = '#e0a040';

interface Tile {
  icon: string;
  value: string;
  label: string;
  /** Nothing yet: the value and icon are dimmed. */
  zero?: boolean;
  /** A boss not met: a silhouette, and the value stays "???". */
  hidden?: boolean;
}

const minutesText = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
};

/** Fills `area` of the page (kit contentArea); returns the list, for MenuNav's `scroll`, and to destroy when the page goes. */
export function buildStatsPage(scene: Phaser.Scene, container: Phaser.GameObjects.Container, area: Rect): ScrollList {
  const { stats } = profile();
  container.add(createPanel(scene, area.x, area.y, area.w, area.h));
  const list = createScrollList(scene, container, { x: area.x, y: area.y + 2, w: area.w, h: area.h - 4 });
  const rows = list.content;
  const left = area.x + PAD;
  const inner = area.w - PAD * 2 - SCROLLBAR;
  let y = area.y + PAD;

  const text = (x: number, top: number, content: string, color: string, size: string, originX = 0, wrap = 0): Phaser.GameObjects.Text => {
    const t = scene.add.text(x, top, content, smallStyle({
      fontSize: size, color, strokeThickness: 0, ...(wrap ? { wordWrap: { width: wrap } } : {}),
    })).setOrigin(originX, 0);
    rows.add(t);
    return t;
  };

  const slab = (x: number, top: number, w: number, h: number, lit: boolean): void => {
    rows.add(scene.add.graphics()
      .fillStyle(lit ? 0x2b2117 : 0x1d1713, 1).fillRect(x, top, w, h)
      .fillStyle(0xffffff, 0.04).fillRect(x, top, w, 2)
      .fillStyle(lit ? 0x5a4426 : 0x2c231c, 1).fillRect(x, top + h - 2, w, 2));
  };

  const picture = (cx: number, cy: number, tile: Tile): void => {
    const image = addAchievementIcon(scene, cx, cy, tile.hidden ? ICON_HIDDEN : tile.icon);
    if (tile.hidden) image.setAlpha(0.7);
    else if (tile.zero) image.setTint(0x6a6058);
    rows.add(image);
  };

  /** A value as big as the room allows: 32 px, then 24, then 16 when it would run past `room`. */
  const bigText = (x: number, top: number, content: string, color: string, room: number, originX = 0): Phaser.GameObjects.Text => {
    const t = text(x, top, content, color, '20px', originX);
    for (const size of ['24px', '16px']) if (t.width > room) t.setFontSize(size);
    return t;
  };

  // The rows a tile stacks (icon, value, label) are measured, so no font or width can make them touch
  const probe = scene.add.text(0, 0, 'Ag', smallStyle({ fontSize: '20px', strokeThickness: 0 }));
  const valueH = probe.height;
  probe.setFontSize('16px');
  const labelH = probe.height;
  probe.destroy();
  const heroH = HERO_PAD + ICON + HERO_GAP + valueH + ROW_GAP + labelH + HERO_PAD;

  const hero = (x: number, top: number, w: number, tile: Tile): void => {
    slab(x, top, w, heroH, !tile.zero);
    picture(x + w / 2, top + HERO_PAD + ICON / 2, tile);
    bigText(x + w / 2, top + HERO_PAD + ICON + HERO_GAP, tile.value, tile.zero ? UI_TEXT.muted : UI_TEXT.bone, w - PAD * 2, 0.5);
    text(x + w / 2, top + HERO_PAD + ICON + HERO_GAP + valueH + ROW_GAP, tile.label, UI_TEXT.muted, '7px', 0.5, w - PAD);
  };

  const compact = (x: number, top: number, w: number, tile: Tile): void => {
    slab(x, top, w, TILE_H, !tile.zero && !tile.hidden);
    picture(x + PAD + ICON / 2, top + TILE_H / 2, tile);
    const tx = x + PAD + ICON + PAD;
    const room = x + w - PAD - tx;
    const value = bigText(tx, top, tile.value, tile.zero || tile.hidden ? UI_TEXT.muted : UI_TEXT.bone, room);
    const label = text(tx, top, tile.label, UI_TEXT.muted, '7px', 0, room);
    // The value over its label, the two together centred beside the icon
    const stack = value.height + ROW_GAP + label.height;
    value.setY(Math.round(top + (TILE_H - stack) / 2));
    label.setY(value.y + value.height + ROW_GAP);
  };

  /** A heading and the tiles in as many columns as fit, an even split of them. */
  const group = (title: string, tiles: Tile[], kind: 'hero' | 'compact'): void => {
    text(left, y + 4, title, AMBER, '7px');
    y += HEADING_H;
    const min = kind === 'hero' ? HERO_MIN_W : TILE_MIN_W;
    const cols = [tiles.length, 2, 1].find(c => tiles.length % c === 0 && c * min + (c - 1) * GAP <= inner) ?? 1;
    const w = Math.floor((inner - GAP * (cols - 1)) / cols);
    const h = kind === 'hero' ? heroH : TILE_H;
    tiles.forEach((tile, i) => {
      const x = left + (i % cols) * (w + GAP);
      const top = y + Math.floor(i / cols) * (h + GAP);
      if (kind === 'hero') hero(x, top, w, tile); else compact(x, top, w, tile);
    });
    y += Math.ceil(tiles.length / cols) * (h + GAP) - GAP + GROUP_GAP;
  };

  if (stats.runs === 0) {
    const intro = text(left, y, 'Tu zbiorą się Twoje rekordy. Wybiegnij na pierwszy bieg, a wszystko zacznie się liczyć.', AMBER, '7px', 0, inner);
    y += intro.height + GROUP_GAP + 4;
  }

  group('Rekordy', [
    { icon: 'ach-coin-10k', value: spaced(stats.bestScore), label: 'Najlepszy wynik', zero: stats.bestScore === 0 },
    { icon: 'ach-shoe', value: `${spaced(stats.bestDistance)} m`, label: 'Najdalej', zero: stats.bestDistance === 0 },
    { icon: 'ach-peak', value: `${stats.bestLevel}`, label: 'Najwyższy poziom', zero: stats.bestLevel === 0 },
    { icon: 'ach-flame', value: `x${stats.bestCombo}`, label: 'Maks kombo', zero: stats.bestCombo === 0 },
  ], 'hero');
  group('Łącznie', [
    { icon: 'ach-roach', value: `${spaced(stats.runs)}`, label: 'Biegi', zero: stats.runs === 0 },
    { icon: 'ach-pin', value: `${(stats.distance / 1000).toFixed(1)} km`, label: 'Przebiegnięte', zero: stats.distance === 0 },
    { icon: 'ach-clock', value: minutesText(stats.seconds), label: 'Czas w biegu', zero: stats.seconds === 0 },
  ], 'compact');
  group('Zebrane', [
    { icon: 'ach-apple', value: spaced(stats.apples), label: 'Jabłka', zero: stats.apples === 0 },
    { icon: 'ach-beer', value: spaced(stats.beers), label: 'Piwa', zero: stats.beers === 0 },
    { icon: 'ach-pill', value: spaced(stats.pills), label: 'Pigułki', zero: stats.pills === 0 },
  ], 'compact');
  group('Umiejętności', [
    { icon: 'ach-warning', value: spaced(stats.nearMisses), label: 'Na styk', zero: stats.nearMisses === 0 },
    { icon: 'ach-gun', value: spaced(stats.kills), label: 'Zestrzelone', zero: stats.kills === 0 },
    { icon: 'ach-bolt', value: spaced(stats.dashThroughs), label: 'Przebicia', zero: stats.dashThroughs === 0 },
    { icon: 'ach-wall', value: spaced(stats.wallsBroken), label: 'Ściany', zero: stats.wallsBroken === 0 },
  ], 'compact');
  group('Bossowie', BOSSES.map((boss): Tile => {
    const beaten = stats[BOSS_WINS[boss.id]];
    // Reaching his distance, or beating him, is meeting him (the same rule as the achievements')
    const met = beaten > 0 || stats.bestDistance >= boss.triggerDistance;
    return met
      ? { icon: `ach-boss-${boss.id}`, value: beaten > 0 ? `x${beaten}` : '0', label: boss.name, zero: beaten === 0 }
      : { icon: ICON_HIDDEN, value: '???', label: 'Nie spotkany', hidden: true, zero: true };
  }), 'compact');
  // Endless is what comes after the Eksterminator: until then not even its name is shown
  const endlessOpen = stats.eksterminatorWins > 0 || stats.endlessRuns > 0;
  const unknown: Tile = { icon: ICON_HIDDEN, value: '???', label: 'Jeszcze nie odkryte', hidden: true, zero: true };
  group(endlessOpen ? 'Bez końca' : '???', endlessOpen ? [
    { icon: 'ach-infinity', value: spaced(stats.endlessRuns), label: 'Biegi bez końca', zero: stats.endlessRuns === 0 },
    { icon: 'ach-peak', value: `${stats.endlessBestLevel}`, label: 'Najwyższy poziom', zero: stats.endlessBestLevel === 0 },
    { icon: 'ach-shoe', value: `${spaced(stats.endlessBestDistance)} m`, label: 'Najdalej', zero: stats.endlessBestDistance === 0 },
  ] : [unknown, unknown, unknown], 'compact');
  group('Tryby', [
    { icon: 'ach-calendar', value: spaced(stats.dailyRuns), label: 'Karaluchy Dnia', zero: stats.dailyRuns === 0 },
    { icon: 'ach-chat', value: spaced(stats.matches), label: 'Zjazdy', zero: stats.matches === 0 },
    { icon: 'ach-crown', value: spaced(stats.matchWins), label: 'Wygrane zjazdy', zero: stats.matchWins === 0 },
  ], 'compact');

  text(left, y, account() ? 'Zapisane na Twoim koncie' : 'Zapisane w tej przeglądarce. Zaloguj się, żeby nie zginęły', UI_TEXT.muted, '7px', 0, inner);
  y += 16 + PAD * 2;

  list.setContentHeight(y - (area.y + 2));
  return list;
}
