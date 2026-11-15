/**
 * Osiągnięcia: how many are earned and what they paid, then two tabs: the levelled cards (an icon framed by the level
 * reached, the next level to go for) and the one-offs (earned lit, the rest a silhouette), in a list that scrolls.
 */
import Phaser from 'phaser';
import { spaced } from '../../../server/achievements';
import { ATLAS, frameOf, SPRITE_SCALE } from '../../config/sprites';
import { achievementIcon, bossUnmet, cardProgress, ICON_HIDDEN, levelUnmet, tierOf, type Tier } from '../../systems/achievementView';
import { achievementTitle, ACHIEVEMENTS, CARDS, earnedCount, ONE_OFFS, profile, type Achievement } from '../../systems/Profile';
import { addAchievementIcon } from '../../ui/achievementIcon';
import { addTabs, GAP, TAB_H, type Rect } from '../../ui/kit';
import { createScrollList, type ScrollList } from '../../ui/ScrollList';
import { createPanel, type UIButton } from '../../ui/shared';
import { smallStyle, UI_TEXT } from '../../utils/TextStyles';

const GOLD = '#e8c15a';
const GREEN = '#9fe08a';
const PAD = 12;
const SUMMARY_H = 56;
const BAR_H = 8;
/** The frame an icon sits in: the icon (24 texels, drawn at SPRITE_SCALE) and a margin. */
const ICON_BOX = 64;
const TILE_ICON_BOX = 56;
const CARD_H = 116;
const TILE_H = 84;
/** The narrowest a card or tile may be before the grid drops a column. */
const CELL_MIN_W = 340;
const SCROLLBAR = 12;

const TIER_RIM: Record<Tier, number> = { none: 0x3d2e25, bronze: 0xc98a52, silver: 0xc9c9c9, gold: 0xe8c15a, max: 0xffe08a };
const SLOT = 0x1a1410;

/** What the page tells MenuScene each time its list is built: the tabs (for MenuNav, after Powrót), the list, the tab to focus. */
export type AchievementsNav = (tabs: UIButton[], list: ScrollList, focus: UIButton) => void;

type Parent = Phaser.GameObjects.Container;

/** Fills `area` of the page (kit contentArea) and tells `onList` about the list each tab builds; the last one is to destroy when the page goes. */
export function buildAchievementsPage(scene: Phaser.Scene, container: Parent, area: Rect, onList: AchievementsNav): void {
  const { stats, achievements } = profile();
  const text = (parent: Parent, x: number, y: number, content: string, color: string, originX = 0, wrap = 0): Phaser.GameObjects.Text => {
    const t = scene.add.text(x, y, content, smallStyle({
      fontSize: '7px', color, strokeThickness: 0, ...(wrap ? { wordWrap: { width: wrap } } : {}),
    })).setOrigin(originX, 0);
    parent.add(t);
    return t;
  };

  // The summary: how many, a bar, and what they paid
  container.add(createPanel(scene, area.x, area.y, area.w, SUMMARY_H));
  const earned = earnedCount();
  const paid = ACHIEVEMENTS.filter(a => achievements[a.id]).reduce((sum, a) => sum + a.reward, 0);
  const midY = area.y + SUMMARY_H / 2;
  const count = scene.add.text(area.x + PAD, midY, `${earned}/${ACHIEVEMENTS.length}`, smallStyle({
    fontSize: '20px', color: GOLD, strokeThickness: 0,
  })).setOrigin(0, 0.5);
  const crumbX = area.x + area.w - PAD - 12;
  const paidText = scene.add.text(crumbX - 16, midY, spaced(paid), smallStyle({
    fontSize: '9px', color: UI_TEXT.bone, strokeThickness: 0,
  })).setOrigin(1, 0.5);
  const barX = Math.round(count.x + count.width + 16);
  const barW = Math.max(40, Math.round(paidText.x - paidText.width - 16 - barX));
  container.add([count, paidText, scene.add.image(crumbX, midY, ATLAS, frameOf('btn-crumb', 0)).setScale(SPRITE_SCALE),
    scene.add.graphics()
      .fillStyle(0x000000, 0.5).fillRect(barX, midY - BAR_H / 2, barW, BAR_H)
      .fillStyle(0xe8c15a, 1).fillRect(barX, midY - BAR_H / 2, Math.round(barW * earned / ACHIEVEMENTS.length), BAR_H)]);

  const list: { current: ScrollList | null } = { current: null };
  const listArea = { x: area.x, y: area.y + SUMMARY_H + GAP + TAB_H + GAP, w: area.w, h: area.h - SUMMARY_H - GAP - TAB_H - GAP };
  const body: Parent = scene.add.container(0, 0);

  const rewardLabel = (parent: Parent, right: number, y: number, amount: number, lit: boolean): void => {
    parent.add(scene.add.image(right - 12, y + 8, ATLAS, frameOf('btn-crumb', 0)).setScale(SPRITE_SCALE).setAlpha(lit ? 1 : 0.55));
    text(parent, right - 30, y, `+${amount}`, lit ? GOLD : UI_TEXT.muted, 1);
  };

  /** The icon in a slot framed by its tier; a card not started shows dimmed, a one-off not earned as a silhouette. */
  const iconFrame = (parent: Parent, x: number, y: number, box: number, tier: Tier, anim: string, shade: 'lit' | 'dim' | 'silhouette'): void => {
    const g = scene.add.graphics();
    g.fillStyle(TIER_RIM[tier], 1).fillRect(x, y, box, box);
    g.fillStyle(tier === 'max' ? 0x3a2c12 : SLOT, 1).fillRect(x + 2, y + 2, box - 4, box - 4);
    g.fillStyle(0xffffff, tier === 'none' ? 0.03 : 0.07).fillRect(x + 2, y + 2, box - 4, 2);
    if (tier === 'max') {
      g.lineStyle(2, 0xf1e3c6, 0.9).strokeRect(x + 5, y + 5, box - 10, box - 10);
      g.fillStyle(0xffe08a, 1);
      for (const [cx, cy] of [[x, y], [x + box - 6, y], [x, y + box - 6], [x + box - 6, y + box - 6]]) g.fillRect(cx, cy, 6, 6);
    }
    parent.add(g);
    const image = addAchievementIcon(scene, x + box / 2, y + box / 2, anim);
    if (shade === 'silhouette') image.setTintFill(0x4a3d33);
    else if (shade === 'dim') image.setTint(0x6a6058);
    parent.add(image);
  };

  /** Equal cells across the list, as many columns as fit. */
  const grid = (): { cols: number; w: number; left: number } => {
    const inner = listArea.w - PAD * 2 - SCROLLBAR;
    const cols = Math.max(1, Math.floor((inner + GAP) / (CELL_MIN_W + GAP)));
    return { cols, w: Math.floor((inner - GAP * (cols - 1)) / cols), left: listArea.x + PAD };
  };

  const cell = (parent: Parent, x: number, y: number, w: number, h: number, lit: boolean): void => {
    parent.add(scene.add.graphics()
      .fillStyle(lit ? 0x2b2117 : 0x1d1713, 1).fillRect(x, y, w, h)
      .fillStyle(0xffffff, 0.04).fillRect(x, y, w, 2)
      .fillStyle(lit ? 0x5a4426 : 0x2c231c, 1).fillRect(x, y + h - 2, w, 2));
  };

  /** Returns how tall the rows are from the list's top. */
  const buildCards = (rows: Parent): number => {
    const { cols, w, left } = grid();
    // Closest to the next level first, the finished ones last
    const shown = CARDS.map((card) => {
      const progress = cardProgress(card, stats, achievements);
      return { card, progress, share: progress.next ? Math.min(1, progress.value / (progress.next.at ?? 1)) : -1 };
    }).sort((a, b) => b.share - a.share);
    shown.forEach(({ card, progress, share }, i) => {
      const x = left + (i % cols) * (w + GAP);
      const top = listArea.y + PAD + Math.floor(i / cols) * (CARD_H + GAP);
      const { done, of, next } = progress;
      cell(rows, x, top, w, CARD_H, done > 0);
      iconFrame(rows, x + PAD, top + PAD, ICON_BOX, tierOf(done, of), achievementIcon(card.levels[0]), done > 0 ? 'lit' : 'dim');
      const tx = x + PAD + ICON_BOX + PAD;
      const tw = x + w - PAD - tx;
      text(rows, tx, top + 10, done > 0 ? achievementTitle(card.levels[done - 1]) : card.name, done > 0 ? GOLD : UI_TEXT.muted);
      // Level pips, lit as far as the card has been taken
      for (let p = 0; p < of; p++) {
        rows.add(scene.add.rectangle(x + w - PAD - (of - p) * 14 + 4, top + 18, 10, 10, p < done ? TIER_RIM[tierOf(p + 1, of)] : 0x3d2e25).setOrigin(0, 0.5));
      }
      text(rows, tx, top + 36, (next ?? card.levels[of - 1]).description, UI_TEXT.bone, 0, tw);
      const barY = top + CARD_H - 36;
      rows.add(scene.add.graphics()
        .fillStyle(0x000000, 0.55).fillRect(tx, barY, tw, BAR_H)
        .fillStyle(next ? 0xe8c15a : 0x6fbf5a, 1).fillRect(tx, barY, Math.round(tw * (next ? share : 1)), BAR_H));
      if (next) {
        text(rows, tx, barY + 14, `${card.format(Math.min(progress.value, next.at ?? progress.value))} / ${card.format(next.at ?? 0)}`, UI_TEXT.muted);
        rewardLabel(rows, x + w - PAD, barY + 14, next.reward, done > 0);
      } else {
        text(rows, tx, barY + 14, 'Ukończone', GREEN);
        text(rows, x + w - PAD, barY + 14, card.format(progress.value), UI_TEXT.muted, 1);
      }
    });
    return PAD * 2 - GAP + Math.ceil(shown.length / cols) * (CARD_H + GAP);
  };

  const buildOneOffs = (rows: Parent): number => {
    const { cols, w, left } = grid();
    // Earned first, the latest on top, then the ones still to get in the order the game lists them
    const shown: Achievement[] = [
      ...ONE_OFFS.filter(a => achievements[a.id]).sort((a, b) => achievements[b.id] - achievements[a.id]),
      ...ONE_OFFS.filter(a => !achievements[a.id]),
    ];
    shown.forEach((a, i) => {
      const x = left + (i % cols) * (w + GAP);
      const top = listArea.y + PAD + Math.floor(i / cols) * (TILE_H + GAP);
      const got = Boolean(achievements[a.id]);
      // Not met yet: a boss, or a level above the best reached, shows no name and the "?" icon
      const unmet = bossUnmet(a, stats, achievements) || levelUnmet(a, stats, achievements);
      cell(rows, x, top, w, TILE_H, got);
      iconFrame(rows, x + PAD, top + (TILE_H - TILE_ICON_BOX) / 2, TILE_ICON_BOX, got ? 'gold' : 'none',
        unmet ? ICON_HIDDEN : achievementIcon(a), got || unmet ? 'lit' : 'silhouette');
      const tx = x + PAD + TILE_ICON_BOX + PAD;
      const tw = x + w - PAD - tx;
      text(rows, tx, top + 8, unmet ? '???' : a.name, got ? GOLD : UI_TEXT.bone, 0, tw);
      text(rows, tx, top + 30, bossUnmet(a, stats, achievements) ? 'Pokonaj ???' : a.description, got ? UI_TEXT.bone : UI_TEXT.muted, 0, tw);
      rewardLabel(rows, x + w - PAD, top + TILE_H - 26, a.reward, got);
    });
    return PAD * 2 - GAP + Math.ceil(shown.length / cols) * (TILE_H + GAP);
  };

  const tabs = addTabs(scene, container, {
    cx: Math.round(area.x + area.w / 2), y: area.y + SUMMARY_H + GAP + TAB_H / 2, maxW: area.w, labels: ['Poziomy', 'Jednorazowe'],
    onPick: i => showTab(i, tabs.buttons[i]),
  });
  const showTab = (i: number, focus: UIButton): void => {
    list.current?.destroy();
    body.removeAll(true);
    body.add(createPanel(scene, listArea.x, listArea.y, listArea.w, listArea.h));
    const next = createScrollList(scene, body, { x: listArea.x, y: listArea.y + 2, w: listArea.w, h: listArea.h - 4 });
    next.setContentHeight(i === 0 ? buildCards(next.content) : buildOneOffs(next.content));
    list.current = next;
    onList(tabs.buttons, next, focus);
  };
  container.add(body);
  showTab(0, tabs.buttons[0]);
}
