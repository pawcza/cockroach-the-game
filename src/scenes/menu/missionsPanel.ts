/** Today's missions on the main menu, beside the buttons: what to go for, how far you are, what it pays. */
import Phaser from 'phaser';
import { account, signInAvailable } from '../../ui/Account';
import { createPanel } from '../../ui/shared';
import { shop } from '../../ui/Shop';
import { smallStyle, UI_TEXT } from '../../utils/TextStyles';

const GOLD = '#e8c15a';
const BAR_H = 4;
const PAD = 12;

/** Builds the panel from x, y, this wide, as tall as what's in it; returns what redraws it from the latest shop state. */
export function buildMissionsPanel(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  x: number, y: number, w: number,
): () => void {
  const panel = scene.add.container(0, 0);
  container.add(panel);

  return () => {
    panel.removeAll(true);
    const state = shop();
    // Nothing to show where there's no signing in, and so no missions
    panel.setVisible(Boolean(state) || Boolean(account()) || signInAvailable());
    const lines: Phaser.GameObjects.GameObject[] = [
      scene.add.text(x + PAD, y + 14, 'Misje', smallStyle({ fontSize: '9px', color: UI_TEXT.amber, strokeThickness: 0 })).setOrigin(0, 0.5),
      scene.add.text(x + w - PAD, y + 14, state ? `${state.crumbs} okr.` : '', smallStyle({ fontSize: '7px', color: GOLD, strokeThickness: 0 })).setOrigin(1, 0.5),
    ];
    let top = y + 32;
    if (!state) {
      const why = scene.add.text(x + PAD, top, account() ? 'Wczytuję…' : 'Zaloguj się: misje płacą okruszki na skórki i dodatki', smallStyle({
        fontSize: '7px', color: UI_TEXT.muted, strokeThickness: 0, wordWrap: { width: w - PAD * 2 },
      }));
      lines.push(why);
      top = why.y + why.height;
    }
    // One under another, as tall as their text wraps to on this screen
    state?.missions.forEach((mission, i) => {
      if (i > 0) top += 10;
      const text = scene.add.text(x + PAD, top, mission.text, smallStyle({
        fontSize: '7px', color: mission.done ? UI_TEXT.named : UI_TEXT.bone, strokeThickness: 0, lineSpacing: 0,
        wordWrap: { width: w - PAD * 2 },
      }));
      const barY = Math.round(top + text.height + 3);
      const barW = w - PAD * 2;
      const share = mission.done ? 1 : Math.min(1, mission.progress / mission.goal);
      const bar = scene.add.graphics()
        .fillStyle(0x000000, 0.5).fillRect(x + PAD, barY, barW, BAR_H)
        .fillStyle(mission.done ? 0x6fbf5a : 0xe8c15a, 1).fillRect(x + PAD, barY, Math.round(barW * share), BAR_H);
      const note = mission.done ? 'Wykonana · nowa jutro' : `${mission.progress}/${mission.goal} · +${mission.reward} okr.`;
      const detail = scene.add.text(x + PAD, barY + BAR_H + 3, note, smallStyle({
        fontSize: '7px', color: mission.done ? UI_TEXT.named : UI_TEXT.muted, strokeThickness: 0,
      }));
      lines.push(text, bar, detail);
      top = detail.y + detail.height;
    });
    // The slab fits what's in it: missions wrap to two lines on narrower screens
    panel.add([createPanel(scene, x, y, w, Math.ceil(top + PAD - y)), ...lines]);
  };
}
