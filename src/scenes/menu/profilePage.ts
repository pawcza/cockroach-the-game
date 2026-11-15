/** "Moje": your stats on the left, the achievements on the right as cards, earned ones lit. The list scrolls. */
import Phaser from 'phaser';
import { bossUnmet, cardProgress } from '../../systems/achievementView';
import { achievementTitle, ACHIEVEMENTS, CARDS, earnedCount, ONE_OFFS, profile } from '../../systems/Profile';
import { BOSSES } from '../../systems/boss/bosses';
import { account } from '../../ui/Account';
import { createPanel } from '../../ui/shared';
import { smallStyle, UI_TEXT } from '../../utils/TextStyles';

const GOLD = '#e8c15a';
const DIM = '#5f554b';
const TOP = 52;
const ROW = 22;
/** A card is three lines and a bar, a one-off two lines; this much between rows. */
const CARD_H = 56;
const ONE_OFF_H = 44;
const HEADING_H = 26;
const BAR_H = 4;
const SCROLL_STEP = 60;

export function buildProfilePage(scene: Phaser.Scene, container: Phaser.GameObjects.Container, width: number, height: number): (() => void)[] {
  const { stats, achievements } = profile();
  const cleanups: (() => void)[] = [];
  const bottom = height - 66;
  const gap = 12;
  const statsW = Math.round((width - 16 - gap) * 0.38);
  const listX = 8 + statsW + gap;
  const listW = width - 8 - listX;
  container.add(createPanel(scene, 8, TOP - 4, statsW, bottom - TOP + 4));
  container.add(createPanel(scene, listX, TOP - 4, listW, bottom - TOP + 4));

  // Stats
  const label = smallStyle({ fontSize: '7px', color: UI_TEXT.muted, strokeThickness: 0 });
  const value = smallStyle({ fontSize: '7px', color: UI_TEXT.bone, strokeThickness: 0 });
  const minutes = Math.floor(stats.seconds / 60);
  const bossesBeaten = [stats.lodziaWins, stats.bigosWins, stats.zlewiatanWins, stats.eksterminatorWins].filter(wins => wins > 0).length;
  const rows: [string, string][] = [
    ['Biegi', `${stats.runs}`],
    ['Łącznie', `${(stats.distance / 1000).toFixed(1)} km`],
    ['Czas w biegu', minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`],
    ['Najlepszy wynik', `${stats.bestScore}`],
    ['Najdalej', `${stats.bestDistance} m`],
    ['Najwyższy poziom', `${stats.bestLevel}`],
    ['Maks kombo', `x${stats.bestCombo}`],
    ['Jabłka / piwa / pigułki', `${stats.apples} / ${stats.beers} / ${stats.pills}`],
    ['Na styk / zestrzelone', `${stats.nearMisses} / ${stats.kills}`],
    ['Przebicia / ściany', `${stats.dashThroughs} / ${stats.wallsBroken}`],
    ['Bossowie pokonani', `${bossesBeaten} / ${BOSSES.length}`],
    ['Karaluchy Dnia', `${stats.dailyRuns}`],
    ['Zjazdy / wygrane', `${stats.matches} / ${stats.matchWins}`],
  ];
  container.add(scene.add.text(24, TOP + 10, 'Statystyki', smallStyle({ fontSize: '9px', color: UI_TEXT.amber, strokeThickness: 0 })).setOrigin(0, 0.5));
  rows.forEach(([name, amount], i) => {
    const y = TOP + 40 + i * ROW;
    container.add(scene.add.text(24, y, name, label).setOrigin(0, 0.5));
    container.add(scene.add.text(8 + statsW - 16, y, amount, value).setOrigin(1, 0.5));
  });
  const where = account() ? 'Zapisane na Twoim koncie' : 'Zapisane w tej przeglądarce. Zaloguj się, żeby nie zginęły';
  container.add(scene.add.text(24, bottom - 14, where, smallStyle({
    fontSize: '7px', color: UI_TEXT.muted, strokeThickness: 0, wordWrap: { width: statsW - 32 },
  })).setOrigin(0, 1));

  // Achievements: the cards, then the one-offs, in a list that scrolls under the heading
  container.add(scene.add.text(listX + 16, TOP + 10, `Osiągnięcia ${earnedCount()}/${ACHIEVEMENTS.length}`, smallStyle({
    fontSize: '9px', color: UI_TEXT.amber, strokeThickness: 0,
  })).setOrigin(0, 0.5));

  const listTop = TOP + 30;
  const listBottom = bottom - 4;
  const left = listX + 16;
  const right = listX + listW - 16;
  const rowW = right - left;
  const scrollContainer = scene.add.container(0, 0);
  container.add(scrollContainer);
  // Vertical only: the full width, so the page sliding in is not clipped by a mask that stays where the page ends up
  const maskShape = scene.make.graphics({});
  maskShape.fillRect(0, listTop, width, listBottom - listTop);
  scrollContainer.setMask(new Phaser.Display.Masks.GeometryMask(scene, maskShape));
  cleanups.push(() => maskShape.destroy());

  const text = (x: number, y: number, content: string, color: string, originX = 0): Phaser.GameObjects.Text =>
    scene.add.text(x, y, content, smallStyle({ fontSize: '7px', color, strokeThickness: 0 })).setOrigin(originX, 0);

  let y = listTop + 6;
  const heading = (title: string): void => {
    scrollContainer.add(text(left, y, title, UI_TEXT.muted));
    y += HEADING_H;
  };

  heading('Poziomy');
  for (const card of CARDS) {
    const progress = cardProgress(card, stats, achievements);
    const { done, of, next } = progress;
    const title = done > 0 ? achievementTitle(card.levels[done - 1]) : card.name;
    const lit = done > 0;
    scrollContainer.add(scene.add.rectangle(left + 5, y + 8, 8, 8, lit ? 0xe8c15a : 0x3d2e25).setOrigin(0.5));
    scrollContainer.add(text(left + 18, y, title, lit ? GOLD : UI_TEXT.muted));
    if (next) {
      scrollContainer.add(text(right, y, `+${next.reward} okr.`, lit ? GOLD : DIM, 1));
      scrollContainer.add(text(left + 18, y + 20, next.description, lit ? UI_TEXT.bone : DIM));
      scrollContainer.add(text(right, y + 20, `${card.format(Math.min(progress.value, next.at ?? progress.value))} / ${card.format(next.at ?? 0)}`, UI_TEXT.muted, 1));
    } else {
      scrollContainer.add(text(right, y, 'Ukończone', UI_TEXT.named, 1));
      scrollContainer.add(text(left + 18, y + 20, card.levels[of - 1].description, UI_TEXT.bone));
      scrollContainer.add(text(right, y + 20, card.format(progress.value), UI_TEXT.muted, 1));
    }
    const share = next ? Math.min(1, progress.value / (next.at ?? 1)) : 1;
    const barW = rowW - 18;
    scrollContainer.add(scene.add.graphics()
      .fillStyle(0x000000, 0.5).fillRect(left + 18, y + 44, barW, BAR_H)
      .fillStyle(next ? 0xe8c15a : 0x6fbf5a, 1).fillRect(left + 18, y + 44, Math.round(barW * share), BAR_H));
    y += CARD_H;
  }

  heading('Jednorazowe');
  for (const achievement of ONE_OFFS) {
    const earned = Boolean(achievements[achievement.id]);
    const unmet = bossUnmet(achievement, stats, achievements);
    scrollContainer.add(scene.add.rectangle(left + 5, y + 8, 8, 8, earned ? 0xe8c15a : 0x3d2e25).setOrigin(0.5));
    scrollContainer.add(text(left + 18, y, unmet ? '???' : achievement.name, earned ? GOLD : UI_TEXT.muted));
    scrollContainer.add(text(right, y, `+${achievement.reward} okr.`, earned ? GOLD : DIM, 1));
    scrollContainer.add(text(left + 18, y + 20, unmet ? 'Pokonaj ???' : achievement.description, earned ? UI_TEXT.bone : DIM));
    y += ONE_OFF_H;
  }

  // Scroll with the wheel, the arrow keys or a drag, like the boards
  const viewH = listBottom - listTop;
  const maxScroll = Math.max(0, y - listTop - viewH);
  if (maxScroll === 0) return cleanups;
  let scrollY = 0;
  const scrollTo = (to: number): void => {
    scrollY = Phaser.Math.Clamp(to, 0, maxScroll);
    scrollContainer.y = -scrollY;
  };
  const wheel = (_pointer: Phaser.Input.Pointer, _over: unknown[], _dx: number, dy: number): void => scrollTo(scrollY + dy * 0.5);
  scene.input.on('wheel', wheel);
  cleanups.push(() => scene.input.off('wheel', wheel));

  const keys = (event: KeyboardEvent): void => {
    if (container.x !== 0) return;
    const step = event.code === 'ArrowDown' ? 1 : event.code === 'ArrowUp' ? -1 : 0;
    if (step !== 0) scrollTo(scrollY + step * SCROLL_STEP);
  };
  scene.input.keyboard?.on('keydown', keys);
  cleanups.push(() => scene.input.keyboard?.off('keydown', keys));

  let dragFrom = 0;
  let scrollFrom = 0;
  const zone = scene.add.rectangle(listX + listW / 2, listTop + viewH / 2, listW, viewH, 0x000000, 0).setInteractive();
  container.add(zone);
  zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => { dragFrom = pointer.y; scrollFrom = scrollY; });
  zone.on('pointermove', (pointer: Phaser.Input.Pointer) => { if (pointer.isDown) scrollTo(scrollFrom + dragFrom - pointer.y); });
  return cleanups;
}
