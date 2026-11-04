/**
 * Szafa: the shop. A big roach on the left wears whatever has focus, with your missions under it; colours and
 * accessories on the right. Owned items go on with one press; buying takes two, so nothing goes by accident.
 * Guests see it all and are asked to sign in.
 */
import Phaser from 'phaser';
import { dress, ITEMS, PLAIN, roachAnim, type Look, type Slot, type Worn } from '../../config/skins';
import { ATLAS, ROACH_FEET_OFFSET, SPRITE_SCALE, frameOf } from '../../config/sprites';
import { account } from '../../ui/Account';
import { createButton, createPanel, type UIButton } from '../../ui/shared';
import { buyItem, shop, wearLook } from '../../ui/Shop';
import { addContactShadow } from '../../effects/ContactShadow';
import { headingStyle, smallStyle, UI_TEXT } from '../../utils/TextStyles';

const TOP = 52;
/** One and a half times the game's size: big enough to see what it wears, small enough for the panel. */
const PREVIEW_SCALE = SPRITE_SCALE * 1.5;
const ITEM_W = 132;
const ITEM_H = 44;
const PER_ROW = 4;
const GOLD = '#e8c15a';

export interface WardrobePage {
  /** Redraws prices, ownership and missions from the latest shop state. */
  refresh: () => void;
  showTab: (slot: Slot) => void;
}

export function buildWardrobePage(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  width: number,
  height: number,
  onLookChanged: (look: Look) => void,
  /** The page's buttons changed (a tab was opened): these are now the ones the arrows move between. */
  onNav: (buttons: UIButton[], initial: UIButton) => void,
): WardrobePage {
  const bottom = height - 66;
  const leftW = Math.round(width * 0.36);
  const rightX = 8 + leftW + 12;
  const rightW = width - 8 - rightX;

  container.add(scene.add.text(Math.round(width / 2), 26, 'SZAFA', headingStyle({
    color: UI_TEXT.bone, strokeThickness: 6,
    shadow: { offsetX: 0, offsetY: 3, color: '#5a0d0d', blur: 0, fill: true, stroke: true },
  })).setOrigin(0.5));
  const wallet = scene.add.text(width - 16, 26, '', smallStyle({ fontSize: '8px', color: GOLD, strokeThickness: 3 })).setOrigin(1, 0.5);
  container.add(wallet);
  container.add(createPanel(scene, 8, TOP - 4, leftW, bottom - TOP + 4));
  container.add(createPanel(scene, rightX, TOP - 4, rightW, bottom - TOP + 4));

  // The preview roach, wearing what has focus
  // A little right of and below the middle: the roach wears things above its back and off its tail
  const previewX = 8 + leftW / 2 + 24;
  const previewFeet = TOP + 156;
  container.add(addContactShadow(scene, previewX, previewFeet, 140));
  const preview = scene.add.sprite(previewX, previewFeet - ROACH_FEET_OFFSET * (PREVIEW_SCALE / SPRITE_SCALE), ATLAS, frameOf('roach-run')).setScale(PREVIEW_SCALE);
  container.add(preview);
  let previewWorn: Worn[] = [];
  const show = (look: Look): void => {
    preview.play(roachAnim('run', look), true);
    previewWorn.forEach(item => item.destroy());
    previewWorn = dress(scene, preview, look);
  };

  // Missions, under the roach
  const missionsTop = previewFeet + 22;
  container.add(scene.add.text(24, missionsTop, 'Misje', smallStyle({ fontSize: '9px', color: UI_TEXT.amber, strokeThickness: 0 })));
  const missionTexts: Phaser.GameObjects.Text[] = [];
  for (let i = 0; i < 3; i++) {
    const text = scene.add.text(24, missionsTop + 30 + i * 46, '', smallStyle({
      fontSize: '7px', color: UI_TEXT.bone, strokeThickness: 0, lineSpacing: 2, wordWrap: { width: leftW - 40 },
    }));
    missionTexts.push(text);
    container.add(text);
  }

  // Three tabs (skins, head, back), each a grid of its items; the grid is rebuilt when the tab changes
  const worn = (): Look => shop()?.look ?? PLAIN;
  let armed: string | null = null;
  let tab: Slot = 'skin';
  let items: { id: string | null; slot: Slot; button: UIButton }[] = [];
  const grid = scene.add.container(0, 0);
  container.add(grid);
  const tabs: [Slot, string][] = [['skin', 'Skórki'], ['head', 'Na głowę'], ['back', 'Na plecy']];
  const tabW = (rightW - 32 - 2 * 8) / 3;
  const tabButtons = tabs.map(([slot, label], i) => {
    const button = createButton(scene, rightX + 16 + tabW / 2 + i * (tabW + 8), TOP + 18, tabW, 30, label, 0x444444,
      smallStyle({ fontSize: '7px' }), () => { if (tab !== slot) showTab(slot); });
    container.add(button.all);
    return button;
  });

  const showTab = (slot: Slot): void => {
    tab = slot;
    armed = null;
    tabButtons.forEach((button, i) => button.setColor(tabs[i][0] === slot ? 0xe8c15a : 0x444444));
    grid.removeAll(true);
    items = [];
    const entries = [{ id: null as string | null, name: slot === 'skin' ? 'Zwykły' : 'Nic' }, ...ITEMS[slot]];
    const gap = (rightW - 32 - PER_ROW * ITEM_W) / (PER_ROW - 1);
    entries.forEach((entry, i) => {
      const x = rightX + 16 + ITEM_W / 2 + (i % PER_ROW) * (ITEM_W + gap);
      const y = TOP + 72 + Math.floor(i / PER_ROW) * (ITEM_H + 10);
      const button = createButton(scene, x, y, ITEM_W, ITEM_H, entry.name, 0x444444, smallStyle({ fontSize: '7px' }),
        () => { void press(entry.id, slot); }, { sub: '', onFocus: () => show({ ...worn(), [slot]: entry.id }) });
      // A mouse leaving puts back what's worn; a finger lifting doesn't, or a tapped item would vanish at once
      if (scene.sys.game.device.os.desktop) button.hitZone.on('pointerout', () => show(worn()));
      grid.add(button.all);
      items.push({ id: entry.id, slot, button });
    });
    refresh();
    onNav([...tabButtons, ...items.map(item => item.button)], tabButtons[tabs.findIndex(t => t[0] === slot)]);
  };

  const status = scene.add.text(rightX + rightW / 2, bottom - 14, '', smallStyle({ fontSize: '7px', color: UI_TEXT.muted, strokeThickness: 0 })).setOrigin(0.5);
  container.add(status);
  const say = (text: string, color: string = UI_TEXT.muted): void => { status.setText(text).setColor(color); };

  const press = async (id: string | null, slot: Slot): Promise<void> => {
    const state = shop();
    if (!account() || !state) { say('Zaloguj się, żeby zbierać okruszki i ubierać karalucha', '#e07a6a'); return; }
    const look = { ...state.look, [slot]: id };
    if (id === null || state.owned.includes(id)) {
      armed = null;
      if (await wearLook(look)) { onLookChanged(look); say('Założone', UI_TEXT.named); }
      refresh();
      return;
    }
    const price = state.prices[id] ?? 0;
    if (state.crumbs < price) { armed = null; say(`Brakuje ${price - state.crumbs} okruszków`, '#e07a6a'); refresh(); return; }
    if (armed !== id) { armed = id; say(`Kupić za ${price}? Wciśnij jeszcze raz`, GOLD); refresh(); return; }
    armed = null;
    const error = await buyItem(id);
    if (error) { say('Nie udało się kupić', '#e07a6a'); refresh(); return; }
    if (await wearLook(look)) onLookChanged(look);
    say('Kupione i założone!', UI_TEXT.named);
    refresh();
  };

  const refresh = (): void => {
    const state = shop();
    const look = worn();
    wallet.setText(state ? `Okruszki: ${state.crumbs}` : account() ? '' : 'Zaloguj się, żeby zbierać okruszki');
    for (const { id, slot, button } of items) {
      const wearing = look[slot] === id;
      const owned = id === null || Boolean(state?.owned.includes(id));
      const price = id ? state?.prices[id] : undefined;
      button.setSub?.(wearing ? 'Założone' : owned ? 'Masz' : armed === id ? 'Kupić?' : price !== undefined ? `${price} okr.` : '');
      button.setColor(wearing ? 0x2f8a3a : armed === id ? 0xe8c15a : 0x444444);
    }
    const missions = state?.missions ?? [];
    missionTexts.forEach((text, i) => {
      const mission = missions[i];
      if (!mission) { text.setText(i === 0 && !state ? 'Zaloguj się, żeby dostawać misje' : ''); return; }
      const progress = mission.done ? 'Wykonana · nowa jutro' : `${mission.progress}/${mission.goal} · +${mission.reward} okr.`;
      text.setText(`${mission.text}\n${progress}`).setColor(mission.done ? UI_TEXT.named : UI_TEXT.bone);
    });
    // While a purchase waits for its second press, the roach keeps showing what's being bought
    show(armed ? { ...look, [tab]: armed } : look);
  };
  showTab('skin');

  return { refresh, showTab };
}
