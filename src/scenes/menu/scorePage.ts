import Phaser from 'phaser';
import { getLevelForDistance } from '../../config/levels';
import { fetchScores } from '../../ui/Scoreboard';
import { bodyStyle, headingStyle, smallStyle } from '../../utils/TextStyles';
import { floatUpDown } from '../../utils/TweenPatterns';

/** Fills the page and returns what must be undone before it is rebuilt or left. */
export function buildScorePage(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  width: number,
  height: number,
): (() => void)[] {
  const cleanups: (() => void)[] = [];
  const title = scene.add.text(width / 2, 30, 'BYCZE KARALUCHY', headingStyle()).setOrigin(0.5);
  container.add(title);

  floatUpDown(scene, title, 4, 1200);

  const loadingText = scene.add.text(width / 2, height / 2, '\u0141adowanie...', bodyStyle({ color: '#888888' })).setOrigin(0.5);
  container.add(loadingText);

  fetchScores().then((scores) => {
    loadingText.destroy();

    if (scores.length === 0) {
      const emptyText = scene.add.text(width / 2, height / 2, 'Jeszcze pusto...\nB\u0105d\u017a pierwszy!', bodyStyle({
        fontSize: '14px',
        color: '#888888',
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
    const iconScale = 0.10;

    // Fixed header row (outside scroll area)
    const headerY = 60;
    const headerStyle = smallStyle({ fontSize: '7px', color: '#666666', strokeThickness: 1 });
    container.add(scene.add.text(colLv, headerY, 'Lv', headerStyle).setOrigin(0.5, 0.5));
    container.add(scene.add.text(colTime, headerY, 'Czas', headerStyle).setOrigin(0.5, 0.5));
    container.add(scene.add.text(colDist, headerY, 'Dyst', headerStyle).setOrigin(0.5, 0.5));
    container.add(scene.add.text(colCombo, headerY, 'Kmb', headerStyle).setOrigin(0.5, 0.5));
    if (scene.textures.exists('apple')) {
      container.add(scene.add.image(colApple, headerY, 'apple').setScale(iconScale).setOrigin(0.5, 0.5));
    }
    if (scene.textures.exists('beer-1')) {
      container.add(scene.add.image(colBeer, headerY, 'beer-1').setScale(iconScale).setOrigin(0.5, 0.5));
    }
    if (scene.textures.exists('pill')) {
      container.add(scene.add.image(colPill, headerY, 'pill').setScale(iconScale).setOrigin(0.5, 0.5));
    }
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

    const timeEvents: Phaser.Time.TimerEvent[] = [];
    const dataStartY = listTop + 4;

    for (let i = 0; i < scores.length; i++) {
      const entry = scores[i];
      const rank = i + 1;
      const y = dataStartY + i * lineHeight;

      let color: string;
      let fontSize: string;
      let strokeThickness: number;

      if (rank === 1) {
        color = '#ff0000';
        fontSize = '16px';
        strokeThickness = 5;
      } else if (rank === 2) {
        color = '#ff6600';
        fontSize = '14px';
        strokeThickness = 4;
      } else if (rank === 3) {
        color = '#ffdd00';
        fontSize = '13px';
        strokeThickness = 3;
      } else {
        color = '#cccccc';
        fontSize = '11px';
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

      // Top 3 effects — constrained wobble for rank 1
      if (rank === 1) {
        const elements = [rankText, nameText, lvText, timeText, distText, comboText, appleText, beerText, pillText, scoreText];
        const colors = ['#ff0000', '#ff00ff', '#ffff00', '#00ffff', '#ff6600'];
        let ci = 0;
        timeEvents.push(scene.time.addEvent({
          delay: 150,
          loop: true,
          callback: () => {
            ci = (ci + 1) % colors.length;
            elements.forEach(el => el.setColor(colors[ci]));
          },
        }));
        scene.tweens.add({
          targets: elements,
          scaleX: { from: 1, to: 1.05 },
          scaleY: { from: 1, to: 1.05 },
          duration: 600,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      } else if (rank === 2) {
        const elements = [rankText, nameText, lvText, timeText, distText, comboText, appleText, beerText, pillText, scoreText];
        scene.tweens.add({
          targets: elements,
          alpha: { from: 0.7, to: 1 },
          duration: 600,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      } else if (rank === 3) {
        const elements = [rankText, nameText, lvText, timeText, distText, comboText, appleText, beerText, pillText, scoreText];
        scene.tweens.add({
          targets: elements,
          alpha: { from: 0.8, to: 1 },
          duration: 1000,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }

    // Scroll with mouse wheel / touch drag
    const totalHeight = 16 + scores.length * lineHeight;
    const viewHeight = listBottom - listTop;
    let scrollY = 0;
    const maxScroll = Math.max(0, totalHeight - viewHeight);

    // Register cleanups for time events and mask
    cleanups.push(
      () => timeEvents.forEach(te => te.destroy()),
      () => maskShape.destroy(),
    );

    if (maxScroll > 0) {
      const wheelHandler = (_pointer: Phaser.Input.Pointer, _gos: unknown[], _dx: number, dy: number): void => {
        scrollY = Phaser.Math.Clamp(scrollY + dy * 0.5, 0, maxScroll);
        scrollContainer.y = -scrollY;
      };
      scene.input.on('wheel', wheelHandler);
      cleanups.push(() => scene.input.off('wheel', wheelHandler));

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
