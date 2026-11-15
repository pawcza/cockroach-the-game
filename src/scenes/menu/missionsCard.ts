/**
 * Today's missions as a card: "Misje" and your okruszki on top, then each mission as a row (what to do, how far you
 * are or that it's done, a bar). On the wide home screen it sits in the button column; on a narrow one in a modal.
 * For a guest, where signing in is offered, the wide card is the sign-in card: what the missions give and the Google
 * button under it.
 */
import Phaser from 'phaser';
import { ATLAS, SPRITE_SCALE, frameOf } from '../../config/sprites';
import { account, signInAvailable } from '../../ui/Account';
import { createButton, createPanel, type UIButton } from '../../ui/shared';
import { shop } from '../../ui/Shop';
import { buttonStyle, smallStyle, UI_TEXT } from '../../utils/TextStyles';
import { TOUCH_MIN } from '../../ui/kit';

const GOLD = '#e8c15a';
const PAD = 12;
const HEADER_H = 36;
const BAR_H = 4;
const ROW_GAP = 12;
/** Room kept beside a mission's text for its progress. */
const NOTE_W = 150;
/** What a guest is told the missions give, over the sign-in button. */
const PITCH = 'Codzienne misje płacą okruszki na skórki i dodatki, a Twoje wyniki trafiają do rankingu.';

/** Whether missions exist here at all: signed in, or signing in is offered. */
export function missionsAvailable(): boolean {
  return Boolean(shop()) || Boolean(account()) || signInAvailable();
}

/** One line for the button that opens the card: "Misje 1/3 · 120 okr.", or that it's loading; null without it (a guest is offered Google instead). */
export function missionsSummary(): string | null {
  const state = shop();
  if (state) return `Misje ${state.missions.filter(m => m.done).length}/${state.missions.length} · ${state.crumbs} okr.`;
  return account() ? 'Misje · wczytuję…' : null;
}

export interface MissionsCard {
  /** Redraws from the latest shop state and says how tall the card is now (0: no missions here, it is hidden). */
  redraw: (pending?: boolean) => number;
  /** The Google button inside a guest's card (only when `onSignIn` was given); shown and enabled only while it is offered. */
  signIn: UIButton | null;
}

/**
 * The card from x, y (its top left), this wide, as tall as what's in it. `redraw` says how tall it is now. `pending`:
 * it isn't known yet who this is or whether there is signing in, so it shows that it's loading rather than hiding (and
 * as tall as the sign-in card, which is what most players see next, so the column doesn't jump).
 * With `onSignIn`, a guest gets the Google button in it.
 */
export function buildMissionsCard(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  x: number, y: number, w: number,
  onSignIn?: () => void,
): MissionsCard {
  const card = scene.add.container(0, 0);
  container.add(card);
  const style = (color: string, wrap?: number): Phaser.Types.GameObjects.Text.TextStyle => smallStyle({
    fontSize: '7px', color, strokeThickness: 0, lineSpacing: 2, ...(wrap ? { wordWrap: { width: wrap, useAdvancedWrap: true } } : {}),
  });

  // The sign-in offer is made once and shown or hidden: the pitch under the header, the button under that
  const pitch = onSignIn ? scene.add.text(x + PAD, y + HEADER_H, PITCH, style(UI_TEXT.muted, w - PAD * 2)) : null;
  const buttonY = pitch ? Math.round(y + HEADER_H + pitch.height + PAD + TOUCH_MIN / 2) : 0;
  const offerH = pitch ? Math.ceil(buttonY + TOUCH_MIN / 2 + PAD - y) : 0;
  const signIn = pitch
    ? createButton(scene, x + w / 2, buttonY, w - PAD * 2, TOUCH_MIN, 'Zaloguj przez Google', 0, buttonStyle({ fontSize: '10px', strokeThickness: 3 }), onSignIn!, { google: true })
    : null;
  if (pitch && signIn) container.add([pitch, ...signIn.all]);
  const offer = (shown: boolean): void => {
    if (!pitch || !signIn) return;
    pitch.setVisible(shown);
    signIn.setEnabled(shown);
    signIn.all.forEach(o => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(shown));
  };

  const redraw = (pending = false): number => {
    card.removeAll(true);
    const offered = Boolean(pitch) && !pending && !shop() && !account() && signInAvailable();
    offer(offered);
    if (!missionsAvailable() && !pending) {
      card.setVisible(false);
      return 0;
    }
    card.setVisible(true);
    const state = shop();
    const inner = w - PAD * 2;
    const parts: Phaser.GameObjects.GameObject[] = [
      scene.add.text(x + PAD, y + HEADER_H / 2, 'Misje', smallStyle({ fontSize: '9px', color: UI_TEXT.amber, strokeThickness: 0 })).setOrigin(0, 0.5),
    ];
    if (state) {
      const crumbs = scene.add.text(x + w - PAD, y + HEADER_H / 2, `${state.crumbs}`, style(GOLD)).setOrigin(1, 0.5);
      const icon = scene.add.image(0, y + HEADER_H / 2, ATLAS, frameOf('btn-crumb', 0)).setScale(SPRITE_SCALE);
      icon.setX(Math.round(crumbs.x - crumbs.width - 6 - icon.displayWidth / 2));
      parts.push(crumbs, icon);
    }
    let top = y + HEADER_H;
    if (!state) {
      if (offered) {
        top += pitch!.height;
      } else {
        const why = scene.add.text(x + PAD, top, 'Wczytuję…', style(UI_TEXT.muted, inner));
        parts.push(why);
        top += why.height;
      }
    }
    state?.missions.forEach((mission, i) => {
      if (i > 0) top += ROW_GAP;
      const color = mission.done ? UI_TEXT.named : UI_TEXT.bone;
      const text = scene.add.text(x + PAD, top, mission.text, style(color, inner - NOTE_W));
      const note = scene.add.text(x + w - PAD, top, mission.done ? 'Wykonana' : `${mission.progress}/${mission.goal} · +${mission.reward} okr.`,
        style(mission.done ? UI_TEXT.named : UI_TEXT.muted)).setOrigin(1, 0);
      const barY = Math.round(top + text.height + 4);
      const share = mission.done ? 1 : Math.min(1, mission.progress / mission.goal);
      const bar = scene.add.graphics()
        .fillStyle(0x000000, 0.5).fillRect(x + PAD, barY, inner, BAR_H)
        .fillStyle(mission.done ? 0x6fbf5a : 0xe8c15a, 1).fillRect(x + PAD, barY, Math.round(inner * share), BAR_H);
      parts.push(text, note, bar);
      top = barY + BAR_H;
    });
    // The offer's button sits under the pitch and takes the rest of the card
    const h = offered ? offerH : Math.max(Math.ceil(top + PAD - y), !state && (account() || pending) ? offerH : 0);
    card.add([createPanel(scene, x, y, w, h), ...parts]);
    return h;
  };
  return { redraw, signIn };
}
