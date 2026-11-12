/** "Moje": your stats on the left, the achievements on the right, earned ones lit. */
import Phaser from 'phaser';
import { ACHIEVEMENTS, earnedCount, profile } from '../../systems/Profile';
import { account } from '../../ui/Account';
import { createPanel } from '../../ui/shared';
import { smallStyle, UI_TEXT } from '../../utils/TextStyles';

const GOLD = '#e8c15a';
const TOP = 52;
const ROW = 22;

export function buildProfilePage(scene: Phaser.Scene, container: Phaser.GameObjects.Container, width: number, height: number): void {
  const { stats, achievements } = profile();
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

  // Achievements, two columns
  container.add(scene.add.text(listX + 16, TOP + 10, `Osiągnięcia ${earnedCount()}/${ACHIEVEMENTS.length}`, smallStyle({
    fontSize: '9px', color: UI_TEXT.amber, strokeThickness: 0,
  })).setOrigin(0, 0.5));
  const columns = 2;
  const perColumn = Math.ceil(ACHIEVEMENTS.length / columns);
  const columnW = (listW - 32) / columns;
  const rowH = Math.min(36, Math.floor((bottom - TOP - 44) / perColumn));
  ACHIEVEMENTS.forEach((achievement, i) => {
    const earned = Boolean(achievements[achievement.id]);
    const x = listX + 16 + Math.floor(i / perColumn) * columnW;
    const y = TOP + 34 + (i % perColumn) * rowH;
    const mark = scene.add.rectangle(x + 5, y + 6, 8, 8, earned ? 0xe8c15a : 0x3d2e25).setOrigin(0.5);
    const name = scene.add.text(x + 16, y, achievement.name, smallStyle({
      fontSize: '7px', color: earned ? GOLD : UI_TEXT.muted, strokeThickness: 0,
    })).setOrigin(0, 0);
    const detail = scene.add.text(x + 16, y + 17, achievement.description, smallStyle({
      fontSize: '7px', color: earned ? UI_TEXT.bone : '#5f554b', strokeThickness: 0,
    })).setOrigin(0, 0);
    const reward = scene.add.text(x + columnW - 12, y, `+${achievement.reward} okr.`, smallStyle({
      fontSize: '7px', color: earned ? GOLD : '#5f554b', strokeThickness: 0,
    })).setOrigin(1, 0);
    container.add([mark, name, detail, reward]);
  });
}
