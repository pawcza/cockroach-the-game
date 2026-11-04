import Phaser from 'phaser';
import { ATLAS, frameOf } from '../../config/sprites';
import { getLevelForDistance } from '../../config/levels';
import { fetchDaily, fetchScores } from '../../ui/Scoreboard';
import { bodyStyle, smallStyle, UI_TEXT } from '../../utils/TextStyles';
import { createPanel } from '../../ui/shared';

const PODIUM = ['#e8c15a', '#c9c9c9', '#c98a52'];

/** Fills the page and returns what must be undone before it is rebuilt or left. */
export function buildScorePage(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  width: number,
  height: number,
  daily = false,
): (() => void)[] {
  const cleanups: (() => void)[] = [];
  // The tabs above say which board this is
  container.add(createPanel(scene, 8, 48, width - 16, height - 48 - 66));

  const loadingText = scene.add.text(width / 2, height / 2, 'Ładowanie...', bodyStyle({ color: UI_TEXT.muted })).setOrigin(0.5);
  container.add(loadingText);

  // Today's board is the server's today, whatever this device's clock says
  const load = daily ? fetchDaily().then((day) => (day ? fetchScores(day.date) : [])) : fetchScores();
  load.then((scores) => {
    loadingText.destroy();

    if (scores.length === 0) {
      const emptyText = scene.add.text(width / 2, height / 2, daily ? 'Dziś jeszcze nikt...\nBądź pierwszy!' : 'Jeszcze pusto...\nBądź pierwszy!', bodyStyle({
        fontSize: '14px',
        color: UI_TEXT.muted,
        align: 'center',
      })).setOrigin(0.5);
      container.add(emptyText);
      return;
    }

    // Column layout: rank | name | lv | time | dist | combo | apple | beer | pill | score
    const colRank = 15;
    const colName = 50;
    const colLv = width * 0.32;
    const colTime = width * 0.39;
    const colDist = width * 0.46;
    const colCombo = width * 0.53;
    const colApple = width * 0.60;
    const colBeer = width * 0.67;
    const colPill = width * 0.74;
    const colScore = width - 15;
    const iconScale = 0.5;

    // Fixed header row (outside scroll area)
    const headerY = 60;
    const headerStyle = smallStyle({ fontSize: '7px', color: UI_TEXT.muted, strokeThickness: 0 });
    container.add(scene.add.text(colLv, headerY, 'Lv', headerStyle).setOrigin(0.5, 0.5));
    container.add(scene.add.text(colTime, headerY, 'Czas', headerStyle).setOrigin(0.5, 0.5));
    container.add(scene.add.text(colDist, headerY, 'Dyst', headerStyle).setOrigin(0.5, 0.5));
    container.add(scene.add.text(colCombo, headerY, 'Kmb', headerStyle).setOrigin(0.5, 0.5));
    const headerIcon = (x: number, art: string) =>
      container.add(scene.add.image(x, headerY, ATLAS, frameOf(art)).setScale(iconScale).setOrigin(0.5, 0.5));
    headerIcon(colApple, 'apple');
    headerIcon(colBeer, 'beer-1');
    headerIcon(colPill, 'pill');
    container.add(scene.add.text(colScore, headerY, 'PKT', headerStyle).setOrigin(1, 0.5));

    // Scrollable list container (below header)
    const listTop = 78;
    const listBottom = height - 70;
    const lineHeight = 26;
    const scrollContainer = scene.add.container(0, 0);
    container.add(scrollContainer);

    // Mask so entries don't overflow
    const maskShape = scene.make.graphics({});
    maskShape.fillRect(0, listTop, width, listBottom - listTop);
    scrollContainer.setMask(new Phaser.Display.Masks.GeometryMask(scene, maskShape));

    const dataStartY = listTop + 4;

    for (let i = 0; i < scores.length; i++) {
      const entry = scores[i];
      const rank = i + 1;
      const y = dataStartY + i * lineHeight;

      let color: string;
      let fontSize: string;
      let strokeThickness: number;

      if (rank <= 3) {
        color = PODIUM[rank - 1];
        fontSize = '12px';
        strokeThickness = 3;
      } else {
        color = UI_TEXT.bone;
        fontSize = '10px';
        strokeThickness = 2;
      }

      const style = bodyStyle({ fontSize, color, strokeThickness });

      const smallStatStyle = bodyStyle({
        fontSize: rank <= 3 ? '10px' : '9px',
        color,
        strokeThickness: Math.max(1, strokeThickness - 1),
      });

      const rankText = scene.add.text(colRank, y, `${rank}.`, style).setOrigin(0, 0);
      const nameText = scene.add.text(colName, y, entry.name, style).setOrigin(0, 0);
      const displayLevel = entry.max_level ?? (entry.distance != null ? getLevelForDistance(entry.distance).level : null);
      const lvText = scene.add.text(colLv, y, displayLevel != null ? String(displayLevel) : '-', smallStatStyle).setOrigin(0.5, 0);
      const timeText = scene.add.text(colTime, y, entry.time_survived != null ? `${entry.time_survived}s` : '-', smallStatStyle).setOrigin(0.5, 0);
      const distText = scene.add.text(colDist, y, entry.distance != null ? `${Math.floor(entry.distance)}` : '-', smallStatStyle).setOrigin(0.5, 0);
      const comboText = scene.add.text(colCombo, y, entry.max_combo != null ? `x${entry.max_combo}` : '-', smallStatStyle).setOrigin(0.5, 0);
      const appleText = scene.add.text(colApple, y, entry.apples_collected != null ? String(entry.apples_collected) : '-', smallStatStyle).setOrigin(0.5, 0);
      const beerText = scene.add.text(colBeer, y, entry.tyskies_collected != null ? String(entry.tyskies_collected) : '-', smallStatStyle).setOrigin(0.5, 0);
      const pillText = scene.add.text(colPill, y, entry.pills_collected != null ? String(entry.pills_collected) : '-', smallStatStyle).setOrigin(0.5, 0);
      const scoreText = scene.add.text(colScore, y, String(entry.score), style).setOrigin(1, 0);
      scrollContainer.add([rankText, nameText, lvText, timeText, distText, comboText, appleText, beerText, pillText, scoreText]);
    }

    // Scroll with mouse wheel / touch drag
    const totalHeight = 16 + scores.length * lineHeight;
    const viewHeight = listBottom - listTop;
    let scrollY = 0;
    const maxScroll = Math.max(0, totalHeight - viewHeight);

    // Register cleanups for time events and mask
    cleanups.push(
      () => maskShape.destroy(),
    );

    if (maxScroll > 0) {
      const wheelHandler = (_pointer: Phaser.Input.Pointer, _gos: unknown[], _dx: number, dy: number): void => {
        scrollY = Phaser.Math.Clamp(scrollY + dy * 0.5, 0, maxScroll);
        scrollContainer.y = -scrollY;
      };
      scene.input.on('wheel', wheelHandler);
      cleanups.push(() => scene.input.off('wheel', wheelHandler));

      // Up and down scroll from the keyboard too
      const keyHandler = (event: KeyboardEvent): void => {
        if (container.x !== 0) return;
        const step = event.code === 'ArrowDown' ? 1 : event.code === 'ArrowUp' ? -1 : 0;
        if (step === 0) return;
        scrollY = Phaser.Math.Clamp(scrollY + step * lineHeight * 3, 0, maxScroll);
        scrollContainer.y = -scrollY;
      };
      scene.input.keyboard?.on('keydown', keyHandler);
      cleanups.push(() => scene.input.keyboard?.off('keydown', keyHandler));

      // Touch drag scrolling
      let dragStartY = 0;
      let dragScrollStart = 0;
      const hitZone = scene.add.rectangle(width / 2, listTop + viewHeight / 2, width, viewHeight, 0x000000, 0)
        .setInteractive();
      container.add(hitZone);

      hitZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        dragStartY = pointer.y;
        dragScrollStart = scrollY;
      });

      hitZone.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        if (!pointer.isDown) return;
        const delta = dragStartY - pointer.y;
        scrollY = Phaser.Math.Clamp(dragScrollStart + delta, 0, maxScroll);
        scrollContainer.y = -scrollY;
      });
    }
  });

  return cleanups;
}
