import Phaser from 'phaser';
import { fetchScores } from './Scoreboard';
import { FONT_FAMILY, buttonStyle, bodyStyle, smallStyle } from '../utils/TextStyles';

/**
 * Self-contained score / leaderboard page that lives inside a Phaser container.
 * Created once per MenuScene; call show() / hide() to slide it in/out.
 */
export class ScorePage {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private width: number;
  private height: number;
  private cleanups: (() => void)[] = [];

  constructor(scene: Phaser.Scene, width: number, height: number) {
    this.scene = scene;
    this.width = width;
    this.height = height;
    this.container = scene.add.container(-width, 0).setDepth(10);
  }

  getContainer(): Phaser.GameObjects.Container {
    return this.container;
  }

  /**
   * Rebuild the score page content and slide it into view.
   * @param onBack callback invoked when the user presses the back button.
   */
  rebuild(onBack: () => void): void {
    // Clean up previous resources
    this.cleanups.forEach(fn => fn());
    this.cleanups = [];
    this.container.removeAll(true);
    this.buildContent(onBack);
  }

  // ── internal ──────────────────────────────────────────────────────

  private buildContent(onBack: () => void): void {
    const { scene, container, width, height } = this;

    const title = scene.add.text(width / 2, 30, 'BYCZE KARALUCHY', buttonStyle({
      color: '#ffff00',
      strokeThickness: 5,
    })).setOrigin(0.5);
    container.add(title);

    scene.tweens.add({
      targets: title,
      y: title.y - 4,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const loadingText = scene.add.text(width / 2, height / 2, '\u0141adowanie...', {
      fontSize: '12px',
      color: '#888888',
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);
    container.add(loadingText);

    fetchScores().then((scores) => {
      loadingText.destroy();

      if (scores.length === 0) {
        const emptyText = scene.add.text(width / 2, height / 2, 'Jeszcze pusto...\nB\u0105d\u017a pierwszy!', {
          fontSize: '14px',
          color: '#888888',
          fontFamily: FONT_FAMILY,
          align: 'center',
        }).setOrigin(0.5);
        container.add(emptyText);
        return;
      }

      // Scrollable list container
      const listTop = 55;
      const listBottom = height - 70;
      const lineHeight = 26;
      const scrollContainer = scene.add.container(0, 0);
      container.add(scrollContainer);

      // Mask so entries don't overflow
      const maskShape = scene.make.graphics({});
      maskShape.fillRect(0, listTop, width, listBottom - listTop);
      scrollContainer.setMask(new Phaser.Display.Masks.GeometryMask(scene, maskShape));

      const font = FONT_FAMILY;
      const timeEvents: Phaser.Time.TimerEvent[] = [];

      for (let i = 0; i < scores.length; i++) {
        const entry = scores[i];
        const rank = i + 1;
        const y = listTop + i * lineHeight;

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

        const style: Phaser.Types.GameObjects.Text.TextStyle = {
          fontSize,
          color,
          fontFamily: font,
          stroke: '#000000',
          strokeThickness,
        };

        const rankText = scene.add.text(20, y, `${rank}.`, style).setOrigin(0, 0);
        const nameText = scene.add.text(70, y, entry.name, style).setOrigin(0, 0);
        const scoreText = scene.add.text(width - 20, y, String(entry.score), style).setOrigin(1, 0);
        scrollContainer.add([rankText, nameText, scoreText]);

        // Top 3 trippy effects
        if (rank === 1) {
          const elements = [rankText, nameText, scoreText];
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
            scaleX: { from: 1, to: 1.08 },
            scaleY: { from: 1, to: 1.08 },
            duration: 400,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
          timeEvents.push(scene.time.addEvent({
            delay: 80,
            loop: true,
            callback: () => {
              elements.forEach(el => {
                el.x += Phaser.Math.Between(-1, 1);
                el.y = y + Phaser.Math.Between(-1, 1);
              });
            },
          }));
        } else if (rank === 2) {
          const elements = [rankText, nameText, scoreText];
          scene.tweens.add({
            targets: elements,
            alpha: { from: 0.7, to: 1 },
            duration: 600,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
          scene.tweens.add({
            targets: elements,
            angle: { from: -1, to: 1 },
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        } else if (rank === 3) {
          const elements = [rankText, nameText, scoreText];
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
      const totalHeight = scores.length * lineHeight;
      const viewHeight = listBottom - listTop;
      let scrollY = 0;
      const maxScroll = Math.max(0, totalHeight - viewHeight);

      this.cleanups.push(
        () => timeEvents.forEach(te => te.destroy()),
        () => maskShape.destroy(),
      );

      if (maxScroll > 0) {
        const wheelHandler = (_pointer: Phaser.Input.Pointer, _gos: unknown[], _dx: number, dy: number): void => {
          scrollY = Phaser.Math.Clamp(scrollY + dy * 0.5, 0, maxScroll);
          scrollContainer.y = -scrollY;
        };
        scene.input.on('wheel', wheelHandler);
        this.cleanups.push(() => scene.input.off('wheel', wheelHandler));

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

    // Back button
    const backBg = scene.add.rectangle(width / 2, height - 40, 200, 36, 0x444444, 0.9)
      .setInteractive({ useHandCursor: true });
    const backTxt = scene.add.text(width / 2, height - 40, 'Powr\u00f3t \u2192', smallStyle({
      fontSize: '10px',
    })).setOrigin(0.5);
    backBg.on('pointerover', () => { backBg.setFillStyle(0x666666, 1); backTxt.setColor('#ffff00'); });
    backBg.on('pointerout', () => { backBg.setFillStyle(0x444444, 0.9); backTxt.setColor('#ffffff'); });
    backBg.on('pointerdown', onBack);
    container.add([backBg, backTxt]);
  }
}
