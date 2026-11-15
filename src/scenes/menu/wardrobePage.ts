/**
 * Szafa: the shop. On the left your roach on a small stage, wearing whatever is selected, with its name, its state and
 * one big button for the one thing you can do with it. On the right the items as picture tiles in three tabs.
 * Selecting a tile (a tap, a click, the focus) shows it and keeps showing it until another is selected: the preview
 * always is the selected item, whatever the pointer does. Owned items go on with the button, buying asks once more
 * in place, so a stray tap spends nothing. Guests can try everything on and are asked to sign in.
 */
import Phaser from 'phaser';
import { playUi } from '../../audio/AudioManager';
import {
  ANCHORS_KEY, dress, ITEMS, PLAIN, roachAnim, type Anchors, type Look, type Slot, type Worn,
} from '../../config/skins';
import { ATLAS, ROACH_FEET_OFFSET, SPRITE_SCALE, frameOf, hasFrame, textureOf } from '../../config/sprites';
import { account, signIn, signInAvailable } from '../../ui/Account';
import { profile, takeNotices } from '../../systems/Profile';
import { createButton, createPanel, showAchievement, type UIButton } from '../../ui/shared';
import { buyItem, loadPrices, loadShop, priceList, shop, wearLook } from '../../ui/Shop';
import { addContactShadow } from '../../effects/ContactShadow';
import { bodyStyle, buttonStyle, capCentreShift, smallStyle, UI_TEXT } from '../../utils/TextStyles';
import { addTabs, GAP, TAB_H, TAB_OFF, TAB_ON, type Rect } from '../../ui/kit';
import { createScrollList, type ScrollList } from '../../ui/ScrollList';
import { packs } from '../DeferredLoadScene';
import { createRunWindow } from './runWindow';
import { PACK_LOADED_EVENT, withShopSkin } from '../../systems/PackLoader';
import type { PackId } from '../../config/packs';

const GOLD = '#e8c15a';
const GOLD_HEX = 0xe8c15a;
const RED = '#e07a6a';
const GREEN_HEX = 0x2f8a3a;
const TICK = 0x9fe08a;

/** The tile pictures' size: a skin is the whole roach at the game's scale (its opaque 162 x 82 px), the rest below it. */
const TILE_W = 176;
/** A tile's rows: the picture (a whole roach is 162 x 82), the name, then what it costs or that it is yours. */
const TILE_H = 140;
const ART_TOP = 4;
const ART_H = 82;
const NAME_CY = 98;
const STATE_CY = 122;
const ACTION_H = 56;
/** Under the name: the room for a line or two about the button, or what went wrong. */
const NOTE_H = 48;
/** How long a purchase waits for its second press. */
const CONFIRM_MS = 4000;
/** And how soon after arming a press doesn't count as the second one: a double tap or a held key is one press. */
const CONFIRM_AFTER_MS = 400;
/** The roach's opaque box in its frame (columns 7 to 88, rows 8 to 49), and the frame's centre. */
const ROACH_BOX = { cx: 47.5, cy: 28.5 };
const FRAME_CENTRE = { x: 44, y: 27.5 };
const HOP_PX = 24;

const SLOTS: Slot[] = ['skin', 'head', 'back'];
const SLOT_LABELS = ['Skórki', 'Na głowę', 'Na plecy'];

export interface WardrobePage {
  /** Redraws prices, ownership and the wallet from the latest shop state. */
  refresh: () => void;
  /** Opens a tab (the current one by default) with what is worn in it selected, and hands its buttons to onNav. */
  showTab: (slot?: Slot) => void;
}

interface Tile {
  id: string | null;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  button: UIButton;
  gfx: Phaser.GameObjects.Graphics;
  nameText: Phaser.GameObjects.Text;
  chipText: Phaser.GameObjects.Text;
  chipIcon: Phaser.GameObjects.Image;
  /** The picture or pictures, dimmed while the item is locked. */
  art: Phaser.GameObjects.Image[];
  /** A skin's picture, and the loading mark that shows until its pack is in. */
  skin?: { image: Phaser.GameObjects.Image; loading: Phaser.GameObjects.Container };
}

/** How a purchase or a wearing ended, for the page on screen when it did. */
interface End {
  /** What went wrong, to say on the page. */
  failed?: string;
  /** The look to put on the menu's roach. */
  look?: Look;
  /** An item was bought: the wallet before, to count down from. */
  bought?: number;
}

// The buying, wearing or reloading in flight, and the page that shows how it ended. A width re-layout builds the page
// again while the server is still answering: the answer lands on the new page, which also shows the button busy until then
let working = false;
let landing: ((end: End) => void) | null = null;

type Kind = 'guest' | 'closed' | 'offline' | 'worn' | 'wear' | 'buy' | 'poor';

export function buildWardrobePage(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  width: number,
  /** Under the page's header (kit contentArea). */
  area: Rect,
  onLookChanged: (look: Look) => void,
  /** The page's buttons changed (a tab was opened): these are now the ones the arrows move between. */
  onNav: (buttons: UIButton[], initial: UIButton, scroll: ScrollList) => void,
): WardrobePage {
  const bottom = area.y + area.h;
  // The tiles are 176 wide so a whole roach fits one: as many columns as leave the left column room to be a stage
  const colsFor = (c: number): number => area.w - GAP - (c * (TILE_W + GAP) + 16);
  const cols = [4, 3].find(c => colsFor(c) >= 290) ?? 2;
  const rightW = cols * (TILE_W + GAP) + 16;
  const leftW = area.w - GAP - rightW;
  const rightX = area.x + leftW + GAP;
  const leftCx = area.x + leftW / 2;

  const btnCy = bottom - 12 - ACTION_H / 2;
  const noteCy = btnCy - ACTION_H / 2 - GAP - NOTE_H / 2;
  const stateCy = noteCy - NOTE_H / 2 - 20;
  const nameCy = stateCy - 32;
  const stageX = area.x + 12;
  const stageY = area.y + 12;
  const stageW = leftW - 24;
  const stageH = 2 * Math.floor((nameCy - 22 - stageY) / 2);

  // --- Panels ---
  const tilesPanelY = area.y + TAB_H + GAP;
  container.add(createPanel(scene, area.x, area.y, leftW, area.h));
  container.add(createPanel(scene, rightX, tilesPanelY, rightW, bottom - tilesPanelY));

  // --- Your okruszki, big, above the button (a guest has none: the note is there instead) ---
  const walletText = scene.add.text(0, 0, '0', bodyStyle({ fontSize: '16px', color: GOLD, strokeThickness: 4 })).setOrigin(0, 0.5);
  const walletIcon = scene.add.image(0, noteCy, ATLAS, frameOf('btn-crumb', 0)).setScale(SPRITE_SCALE * 2);
  const wallet = scene.add.container(0, 0, [createPanel(scene, area.x + 12, noteCy - 22, leftW - 24, 44, 0.9), walletIcon, walletText]);
  container.add(wallet);
  let walletShown = 0;
  const walletCount = { v: 0 };
  const showCount = (n: number): void => {
    walletText.setText(String(n));
    const pair = 48 + 12 + walletText.width;
    const x0 = Math.round(leftCx - pair / 2);
    walletIcon.setPosition(x0 + 24, noteCy);
    walletText.setPosition(x0 + 60, noteCy + capCentreShift(walletText));
  };
  const setWallet = (to: number, animate: boolean): void => {
    scene.tweens.killTweensOf(walletCount);
    const from = walletShown;
    walletShown = to;
    if (!animate || from === to) { showCount(to); return; }
    walletCount.v = from;
    scene.tweens.add({
      targets: walletCount, v: to, duration: 700, ease: 'Cubic.easeOut',
      onUpdate: () => showCount(Math.round(walletCount.v)),
      onComplete: () => showCount(to),
    });
  };

  // --- The stage and the preview roach ---
  const loader = packs(scene.game);
  // A window into the game: a level's plates and ledge running past, the roach at the game's own scale in front
  const runWindow = createRunWindow(scene, container, { x: stageX, y: stageY, w: stageW, h: stageH }, level => (loader ? loader.ensure([`level-${level}`]) : Promise.resolve([])));
  const feetY = runWindow.feetY;
  container.add(scene.add.graphics().fillStyle(0x3d2e25, 1)
    .fillRect(stageX - 2, stageY - 2, stageW + 4, 2).fillRect(stageX - 2, stageY + stageH, stageW + 4, 2)
    .fillRect(stageX - 2, stageY, 2, stageH).fillRect(stageX + stageW, stageY, 2, stageH));
  // A little right of the middle: the roach wears things off its tail as well as above its back
  const previewX = Math.round(leftCx + 16);
  container.add(addContactShadow(scene, previewX, feetY, 56 * SPRITE_SCALE));
  const previewY = Math.round(feetY - ROACH_FEET_OFFSET);
  const preview = scene.add.sprite(previewX, previewY, ATLAS, frameOf('roach-run')).setScale(SPRITE_SCALE).setName('wardrobe-preview');
  container.add(preview);
  let previewWorn: Worn[] = [];
  let previewKey = '';
  let hopping = false;

  // --- What is selected, in this tab ---
  const worn = (): Look => shop()?.look ?? PLAIN;
  let tab: Slot = 'skin';
  let selected: string | null = null;
  let armed: string | null = null;
  let armTimer: Phaser.Time.TimerEvent | null = null;
  let armedAt = 0;
  let note: { text: string; color: string } | null = null;
  const lookNow = (): Look => ({ ...worn(), [tab]: selected });

  // --- Name, state, the one button ---
  const nameText = scene.add.text(leftCx, nameCy, 'A', bodyStyle({ fontSize: '16px', color: UI_TEXT.bone, strokeThickness: 4 })).setOrigin(0.5);
  const nameSize = parseFloat(String(nameText.style.fontSize));
  const stateText = scene.add.text(leftCx, stateCy, 'A', smallStyle({ fontSize: '7px', color: UI_TEXT.muted, strokeThickness: 2 })).setOrigin(0.5);
  const stateIcon = scene.add.image(leftCx, stateCy, ATLAS, frameOf('btn-crumb', 0)).setScale(SPRITE_SCALE).setVisible(false);
  container.add([nameText, stateText, stateIcon]);
  const action = createButton(scene, leftCx, btnCy, leftW - 24, ACTION_H, 'Załóż', TAB_ON, bodyStyle({ fontSize: '16px' }), () => { void primary(); });
  container.add(action.all);
  // A guest's way in: Google's own button, with a line above it that says why
  const signInBtn = createButton(scene, leftCx, btnCy, leftW - 24, ACTION_H, 'Zaloguj przez Google', 0, buttonStyle({ fontSize: '10px', strokeThickness: 3 }), () => signIn(), { google: true });
  container.add(signInBtn.all);
  const noteText = scene.add.text(leftCx, 0, '', smallStyle({
    fontSize: '7px', color: UI_TEXT.muted, strokeThickness: 2, align: 'center', wordWrap: { width: leftW - 32 }, lineSpacing: 0,
  })).setOrigin(0.5).setY(noteCy);
  container.add(noteText);

  // --- Tabs and tiles ---
  const tabs = addTabs(scene, container, {
    cx: rightX + rightW / 2, y: area.y + TAB_H / 2, maxW: rightW, labels: SLOT_LABELS, tabW: 200,
    onPick: i => build(SLOTS[i], 'tab'),
  });
  let tiles: Tile[] = [];
  let list: ScrollList | null = null;
  let body: Phaser.GameObjects.Container | null = null;
  const tileRect: Rect = { x: rightX + 4, y: tilesPanelY + 4, w: rightW - 8, h: bottom - tilesPanelY - 8 };
  // One press: where the finger or mouse was, so tapping a tile that isn't selected only selects it
  let gesture: boolean | null = null;

  const text = (x: number, y: number, content: string, color: string, originX = 0.5): Phaser.GameObjects.Text => {
    const t = scene.add.text(x, y, content, smallStyle({ fontSize: '7px', color, strokeThickness: 2 })).setOrigin(originX, 0.5);
    return t.setY(y + capCentreShift(t));
  };

  const priceOf = (id: string | null): number | undefined => (id ? priceList()[id] : undefined);
  const ownedOf = (id: string | null): boolean => id === null || Boolean(shop()?.owned.includes(id));

  const kindOf = (): Kind => {
    const state = shop();
    const wearing = worn()[tab] === selected;
    if (!account()) return wearing ? 'worn' : signInAvailable() ? 'guest' : 'closed';
    if (!state) return 'offline';
    if (wearing) return 'worn';
    if (ownedOf(selected)) return 'wear';
    return state.crumbs < (priceOf(selected) ?? 0) ? 'poor' : 'buy';
  };

  const disarm = (): void => {
    armed = null;
    armTimer?.remove();
    armTimer = null;
  };

  // --- Drawing ---
  const rim = (g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number, t = 2): void => {
    g.fillStyle(color, 1).fillRect(x, y, w, t).fillRect(x, y + h - t, w, t).fillRect(x, y + t, t, h - 2 * t).fillRect(x + w - t, y + t, t, h - 2 * t);
  };
  // Pictures on the pixel grid, in 3 px cells: the tick of an item you own, the padlock of one you don't
  const TICK_CELLS = ['......X', '.....XX', 'X...XX.', 'XX.XX..', '.XXX...', '..X....'];
  const LOCK_CELLS = ['.XXXX.', '.X..X.', '.X..X.', 'XXXXXX', 'XXXXXX', 'XXooXX', 'XXooXX', 'XXXXXX'];
  const CELL = 3;
  const drawCells = (g: Phaser.GameObjects.Graphics, cells: string[], x: number, y: number, color: number): void => {
    cells.forEach((row, r) => [...row].forEach((c, i) => {
      if (c === '.') return;
      g.fillStyle(c === 'o' ? 0x15100d : color, 1).fillRect(x + i * CELL, y + r * CELL, CELL, CELL);
    }));
  };
  const LOCK_COLOR = 0xcdbfa9;
  const TICK_W = 7 * CELL;
  const LOCK_W = 6 * CELL;

  // The tile's bottom row, centred: a lock and the price, a tick and "Masz", or "Założone" on green
  const drawTile = (t: Tile): void => {
    const x0 = t.x - t.w / 2;
    const y0 = t.y - t.h / 2;
    const rowY = y0 + STATE_CY;
    const wearing = worn()[tab] === t.id;
    const locked = t.id !== null && !ownedOf(t.id);
    const price = priceOf(t.id);
    t.gfx.clear();
    if (selected === t.id) rim(t.gfx, x0 + 3, y0 + 3, t.w - 6, t.h - 6, GOLD_HEX);
    t.nameText.setColor(selected === t.id ? '#fff1c2' : UI_TEXT.bone);
    t.button.setColor(wearing ? GREEN_HEX : TAB_OFF);
    t.chipText.setVisible(true);
    t.chipIcon.setVisible(false);
    // What you can't wear yet is a little dimmer
    t.art.forEach(image => image.setAlpha(locked ? 0.7 : 1));
    paintSkin(t);
    // A text of this size, left edge at x, centred on the row
    const put = (content: string, size: string, color: string, x: number): void => {
      t.chipText.setFontSize(size).setText(content).setColor(color).setOrigin(0, 0.5);
      t.chipText.setPosition(x, rowY + capCentreShift(t.chipText));
    };
    const measure = (content: string, size: string): number => t.chipText.setFontSize(size).setText(content).width;
    if (wearing) {
      const w = measure('Założone', '16px') + 24;
      t.gfx.fillStyle(GREEN_HEX, 1).fillRect(t.x - w / 2, rowY - 14, w, 28);
      put('Założone', '16px', '#e6f7dc', t.x - w / 2 + 12);
    } else if (!locked) {
      const textW = measure('Masz', '16px');
      const left = Math.round(t.x - (TICK_W + 8 + textW) / 2);
      drawCells(t.gfx, TICK_CELLS, left, rowY - 9, TICK);
      put('Masz', '16px', UI_TEXT.named, left + TICK_W + 8);
    } else if (price === undefined) {
      drawCells(t.gfx, LOCK_CELLS, Math.round(t.x - LOCK_W / 2), rowY - 12, LOCK_COLOR);
      t.chipText.setVisible(false);
    } else {
      const textW = measure(String(price), '24px');
      const left = Math.round(t.x - (LOCK_W + 8 + 24 + 6 + textW) / 2);
      drawCells(t.gfx, LOCK_CELLS, left, rowY - 12, LOCK_COLOR);
      t.chipIcon.setPosition(left + LOCK_W + 8 + 12, rowY).setVisible(true);
      put(String(price), '24px', GOLD, left + LOCK_W + 8 + 24 + 6);
    }
  };

  const paintSkin = (t: Tile): void => {
    if (!t.skin || !t.id) return;
    const frame = frameOf(`roach-${t.id}-idle`);
    const ready = hasFrame(frame);
    if (ready) t.skin.image.setTexture(textureOf(frame), frame);
    else t.skin.image.setAlpha(0.35);
    t.skin.loading.setVisible(!ready);
  };

  const hop = (): void => {
    const key = roachAnim('hop', lookNow());
    if (hopping || !scene.anims.exists(key)) return;
    hopping = true;
    preview.play({ key, repeat: 1 });
    preview.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      hopping = false;
      if (preview.active) preview.play(roachAnim('run', lookNow()), true).setY(previewY);
    });
    const lift = { h: 0 };
    scene.tweens.add({
      targets: lift, h: 1, duration: 45, yoyo: true, repeat: 1, ease: 'Sine.easeOut',
      onUpdate: () => { if (preview.active) preview.setY(previewY - Math.round((lift.h * HOP_PX) / SPRITE_SCALE) * SPRITE_SCALE); },
    });
  };

  const renderPreview = (): void => {
    const look = lookNow();
    const key = JSON.stringify(look);
    if (key !== previewKey) {
      previewKey = key;
      previewWorn.forEach(item => item.destroy());
      previewWorn = dress(scene, preview, look);
    }
    if (!hopping) preview.play(roachAnim('run', look), true);
    // A shop skin's atlas is its own pack: the plain roach until it is in
    withShopSkin(loader, look.skin, () => { if (preview.active && previewKey === key && !hopping) preview.play(roachAnim('run', lookNow()), true); });
  };

  const fitName = (): void => {
    nameText.setFontSize(nameSize);
    nameText.setText(selected === null ? (tab === 'skin' ? 'Zwykły' : 'Nic') : (ITEMS[tab].find(i => i.id === selected)?.name ?? ''));
    nameText.setY(nameCy + capCentreShift(nameText));
    let size = nameSize;
    while (nameText.width > leftW - 32 && size > 16) { size -= 8; nameText.setFontSize(size); }
  };

  const render = (): void => {
    const state = shop();
    if (state && !scene.tweens.isTweening(walletCount)) setWallet(state.crumbs, false);
    renderPreview();
    fitName();

    const kind = kindOf();
    const price = priceOf(selected) ?? 0;
    const missing = price - (state?.crumbs ?? 0);
    const confirm = kind === 'buy' && armed === selected;
    const faces: Record<Kind, [string, number, boolean]> = {
      guest: ['', TAB_ON, true],
      closed: ['Niedostępne', TAB_OFF, false],
      offline: ['Spróbuj ponownie', TAB_ON, true],
      worn: ['Założone', GREEN_HEX, true],
      wear: ['Załóż', TAB_ON, true],
      buy: [confirm ? `Na pewno? Kup za ${price}` : `Kup · ${price}`, confirm ? 0xe07a3a : TAB_ON, true],
      poor: [`Brakuje ${missing}`, TAB_OFF, false],
    };
    const [label, color, enabled] = faces[kind];
    // A guest's button is Google's; everyone else's is the one that wears or buys
    const guest = kind === 'guest';
    action.all.forEach(o => (o as Phaser.GameObjects.Components.Visible & Phaser.GameObjects.GameObject).setVisible(!guest));
    signInBtn.all.forEach(o => (o as Phaser.GameObjects.Components.Visible & Phaser.GameObjects.GameObject).setVisible(guest));
    signInBtn.setEnabled(guest);
    action.setLabel(working ? 'Chwileczkę…' : label);
    action.setColor(color);
    action.setEnabled(!guest && enabled && !working);

    // Under the name: what it costs, or that it is yours
    const ownedNow = kind === 'worn' || kind === 'wear';
    const priced = !ownedNow && price > 0 && kind !== 'closed' && kind !== 'offline';
    stateIcon.setVisible(priced);
    stateText.setOrigin(0.5, 0.5).setX(leftCx);
    if (priced) {
      stateText.setText(String(price)).setColor(GOLD);
      const pair = 24 + 8 + stateText.width;
      stateIcon.setX(Math.round(leftCx - pair / 2 + 12));
      stateText.setOrigin(0, 0.5).setX(Math.round(leftCx - pair / 2 + 24 + 8));
    } else stateText.setText(ownedNow ? 'Masz' : '').setColor(UI_TEXT.named);
    stateText.setY(stateCy + capCentreShift(stateText));

    // Above the button: what went wrong, or why it is what it is
    const why = note ?? (guest ? { text: 'Zaloguj się, żeby zbierać okruszki i odblokować skórki', color: UI_TEXT.bone }
      : kind === 'offline' ? { text: 'Nie wczytano szafy', color: RED }
        : kind === 'closed' ? { text: 'Logowanie nie działa', color: UI_TEXT.muted } : null);
    noteText.setText(why?.text ?? '').setColor(why?.color ?? UI_TEXT.muted);
    wallet.setVisible(Boolean(state) && !why);
    noteText.setVisible(!wallet.visible);

    tiles.forEach(drawTile);
  };

  const select = (id: string | null): void => {
    if (selected === id) return;
    selected = id;
    disarm();
    note = null;
    render();
  };

  // --- The one thing the button does ---
  const primary = async (): Promise<void> => {
    if (working) return;
    const kind = kindOf();
    const item = selected;
    const slot = tab;
    note = null;
    if (kind === 'buy' && item !== null) {
      if (armed !== item) {
        disarm();
        armed = item;
        armedAt = performance.now();
        armTimer = scene.time.delayedCall(CONFIRM_MS, () => { armTimer = null; armed = null; if (preview.active) render(); });
        render();
        return;
      }
      if (performance.now() - armedAt < CONFIRM_AFTER_MS) return;
    } else if (kind !== 'offline' && kind !== 'wear') {
      return;
    }
    disarm();
    working = true;
    render();
    let end: End;
    try {
      if (kind === 'offline') {
        await loadShop();
        end = {};
      } else if (kind === 'wear') {
        const look = { ...worn(), [slot]: item };
        end = (await wearLook(look)) ? { look } : { failed: 'Nie udało się założyć' };
      } else {
        const before = shop()?.crumbs ?? 0;
        const error = await buyItem(item!);
        if (error) {
          end = { failed: error === 'Brak połączenia' ? error : 'Nie udało się kupić' };
        } else {
          const look = { ...worn(), [slot]: item };
          end = (await wearLook(look)) ? { bought: before, look } : { bought: before, failed: 'Kupione, ale nie założone' };
        }
      }
    } catch {
      end = { failed: 'Brak połączenia' };
    } finally {
      working = false;
    }
    landing?.(end);
  };

  // How it ended, on this page (the one a re-layout may have built since it began)
  const land = (end: End): void => {
    note = end.failed ? { text: end.failed, color: RED } : null;
    if (end.look) onLookChanged(end.look);
    if (end.failed && end.bought === undefined) playUi(scene, 'ui-error');
    if (end.bought === undefined) { render(); return; }
    playUi(scene, 'ui-purchase');
    setWallet(shop()?.crumbs ?? end.bought, true);
    render();
    hop();
    for (const achievement of takeNotices()) showAchievement(scene, achievement);
  };
  landing = land;

  // --- Tiles ---
  const accessoryArt = (id: string, cx: number, cy: number, w: number): Phaser.GameObjects.Image[] => {
    const anchors = scene.cache.json.get(ANCHORS_KEY) as Anchors | undefined;
    const info = anchors?.items[id];
    if (!anchors || !info) return [];
    const parts = [id, ...(info.with ?? [])]
      .map(part => ({ name: frameOf(`acc-${part}`), behind: anchors.items[part]?.behind ?? false }))
      .sort((a, b) => Number(b.behind) - Number(a.behind));
    if (!parts.every(part => hasFrame(part.name))) return [];
    const boxes = parts.map((part) => {
      const f = scene.textures.getFrame(textureOf(part.name), part.name);
      return { ...part, tex: textureOf(part.name), l: -f.pivotX * f.width, t: -f.pivotY * f.height, r: (1 - f.pivotX) * f.width, b: (1 - f.pivotY) * f.height };
    });
    const l = Math.min(...boxes.map(b => b.l));
    const r = Math.max(...boxes.map(b => b.r));
    const t = Math.min(...boxes.map(b => b.t));
    const b = Math.max(...boxes.map(b2 => b2.b));
    // On the grid: 4x where it fits the picture's area, else 2x
    const s = (b - t) * 4 <= ART_H - 4 && (r - l) * 4 <= w - 24 ? 4 : 2;
    return boxes.map(box => scene.add.image(
      Math.round((cx - ((l + r) / 2) * s) / 2) * 2, Math.round((cy - ((t + b) / 2) * s) / 2) * 2, box.tex, box.name,
    ).setScale(s));
  };

  const build = (slot: Slot, focus: 'tab' | 'tile'): void => {
    tab = slot;
    // Opening the page runs the roach through a level you have reached, at random
    if (focus === 'tile') runWindow.pick(profile().stats.bestLevel);
    tabs.setActive(SLOTS.indexOf(slot));
    disarm();
    note = null;
    selected = worn()[slot];
    list?.destroy();
    tiles.forEach(t => { if (t.skin) scene.tweens.killTweensOf(t.skin.loading); });
    body?.destroy(true);
    body = scene.add.container(0, 0);
    container.add(body);
    list = createScrollList(scene, body, tileRect, { step: TILE_H + GAP });
    const rows = list.content;

    const tileW = TILE_W;
    const left = tileRect.x + 6;
    const entries = [{ id: null as string | null, name: slot === 'skin' ? 'Zwykły' : 'Nic' }, ...ITEMS[slot]];
    tiles = entries.map((entry, i) => {
      const x = left + tileW / 2 + (i % cols) * (tileW + GAP);
      const y = tileRect.y + 4 + TILE_H / 2 + Math.floor(i / cols) * (TILE_H + GAP);
      const button = createButton(scene, x, y, tileW, TILE_H, '', TAB_OFF, smallStyle({ fontSize: '7px' }), () => {
        const wasSelected = gesture ?? true;
        gesture = null;
        // Only the safe thing: putting on what you own. Buying and signing in are the big button's, never a tile's
        if (wasSelected && kindOf() === 'wear') void primary();
      }, { onFocus: () => select(entry.id) });
      // A finger's tap on a tile that isn't selected selects it; only the next one acts. A mouse that is over a tile
      // has selected it already: its click acts. (This listener runs before the focus one: it was added first.)
      let selectedBeforeOver = false;
      button.hitZone.on('pointerover', () => { selectedBeforeOver = selected === entry.id; });
      button.hitZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => { gesture = pointer.wasTouch ? selectedBeforeOver : selected === entry.id; });
      button.hitZone.on('pointerout', () => { gesture = null; });
      rows.add(button.all);

      const art: Phaser.GameObjects.GameObject[] = [];
      const pictures: Phaser.GameObjects.Image[] = [];
      let skin: Tile['skin'];
      if (slot === 'skin') {
        const image = scene.add.image(x - Math.round((ROACH_BOX.cx - FRAME_CENTRE.x) * SPRITE_SCALE), y - TILE_H / 2 + ART_TOP + ART_H / 2 - Math.round((ROACH_BOX.cy - FRAME_CENTRE.y) * SPRITE_SCALE), ATLAS, frameOf('roach-idle')).setScale(SPRITE_SCALE);
        const loading = scene.add.container(x, y - TILE_H / 2 + ART_TOP + ART_H / 2);
        loading.add([-14, 0, 14].map(dx => scene.add.rectangle(dx, 0, 6, 6, 0xe8c15a)));
        loading.setVisible(false);
        scene.tweens.add({ targets: loading, alpha: 0.3, duration: 500, yoyo: true, repeat: -1 });
        art.push(image, loading);
        pictures.push(image);
        if (entry.id) skin = { image, loading };
      } else if (entry.id) {
        const images = accessoryArt(entry.id, x, y - TILE_H / 2 + ART_TOP + ART_H / 2, tileW);
        art.push(...images);
        pictures.push(...images);
      } else {
        // Nothing worn: an empty frame
        const g = scene.add.graphics();
        rim(g, x - 16, y - TILE_H / 2 + ART_TOP + ART_H / 2 - 16, 32, 32, 0x5f554b, 4);
        art.push(g);
      }
      const gfx = scene.add.graphics();
      const nameLabel = text(x, y - TILE_H / 2 + NAME_CY, 'A', UI_TEXT.bone);
      nameLabel.setText(fitText(nameLabel, entry.name, tileW - 12));
      const chipText = text(x, y - TILE_H / 2 + STATE_CY, 'A', GOLD, 0);
      const chipIcon = scene.add.image(x, y, ATLAS, frameOf('btn-crumb', 0)).setScale(SPRITE_SCALE).setVisible(false);
      rows.add([...art, gfx, nameLabel, chipIcon, chipText]);
      return { id: entry.id, name: entry.name, x, y, w: tileW, h: TILE_H, button, gfx, nameText: nameLabel, chipText, chipIcon, art: pictures, skin };
    });
    const rowsN = Math.ceil(entries.length / cols);
    list.setContentHeight(4 + rowsN * (TILE_H + GAP) - GAP + 4);
    render();
    const initial = tiles.find(t => t.id === selected)?.button ?? tiles[0].button;
    onNav([...tabs.buttons, ...tiles.map(t => t.button), action, signInBtn], focus === 'tab' ? tabs.buttons[SLOTS.indexOf(slot)] : initial, list);
  };

  const fitText = (label: Phaser.GameObjects.Text, content: string, room: number): string => {
    label.setText(content);
    let shown = content;
    while (label.width > room && shown.length > 1) { shown = shown.slice(0, -1); label.setText(`${shown.trimEnd()}…`); }
    return label.text;
  };

  // A skin's pack arriving swaps the plain roach in its tile for the skin
  const onPack = (): void => { if (tab === 'skin') tiles.forEach(drawTile); };
  scene.game.events.on(PACK_LOADED_EVENT, onPack);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.game.events.off(PACK_LOADED_EVENT, onPack);
    armTimer?.remove();
    if (landing === land) landing = null;
  });
  // Every skin's atlas is its own pack: they come in while the page is open
  loader?.prefetch(ITEMS.skin.map((skin): PackId => `roach-${skin.id}`));

  void loadPrices().then(() => { if (preview.active) render(); });
  setWallet(shop()?.crumbs ?? 0, false);
  build('skin', 'tile');

  return {
    refresh: render,
    showTab: (slot = tab) => build(slot, 'tile'),
  };
}
