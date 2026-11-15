import Phaser from 'phaser';
import { playUi } from '../../audio/AudioManager';
import { buttonStyle, capCentreShift, smallStyle, UI_TEXT } from '../../utils/TextStyles';
import { getMusicVolume, getPlayerNameOrDefault, getRecordGhostEnabled, getSfxVolume, getTauntsEnabled, setMusicVolume, setRecordGhostEnabled, setSfxVolume, setTauntsEnabled } from '../../utils/Storage';
import { createButton, createPanel, UIButton } from '../../ui/shared';
import { account, deleteAccount, signIn, signInAvailable } from '../../ui/Account';
import { GAP, TOUCH_MIN, type Rect } from '../../ui/kit';
import { createScrollList, type ScrollList } from '../../ui/ScrollList';
import type { ScrollTarget } from '../../ui/MenuNav';

/** The line at the foot of the menu: also on the home screen. */
export const VERSION_LINE = 'v0.69';

/** How long the delete button waits for the second press before it backs off. */
const CONFIRM_MS = 4000;
/** A press sooner than this after the first isn't the second: a double tap or a held key is one press. */
const CONFIRM_AFTER_MS = 400;

const PAD = 16;
const ROW_H = 56;
const EXPLAINED_H = 64;
const ROW_GAP = 8;
const HEAD_H = 28;
const SECTION_GAP = 16;
/** Between Wyloguj and Usuń konto: far enough that a habitual press can't land on the wrong one. */
const DANGER_GAP = 24;
const COL_GAP = 16;
/** From this wide (the canvas's `area`) Dźwięk and Gra stand left of Konto and Inne; narrower, one column that scrolls. */
const TWO_COLUMNS_FROM = 860;
const ONE_COLUMN_MAX = 640;
const TWO_COLUMNS_MAX = 560;

const KEY_STEP = 0.1;
/** Slider ticks come at most this often while a bar is dragged. */
const TICK_GAP_MS = 60;
const LABEL_W = 88;
const PCT_W = 44;
const TRACK_H = 16;
const THUMB_W = 12;
const THUMB_H = 32;

const BONE = UI_TEXT.bone;
const LIT = '#fff1c2';
const GOLD = 0xe8c15a;
const RIM = 0x3d2e25;
const TRACK_BG = 0x0d0906;
const FILL = 0xb9a78d;
const THUMB = 0xf1e3c6;

export interface SettingsPage {
  /** Every control that takes the focus, as the page stands now (a sign-in or sign-out rebuilds it). */
  readonly buttons: UIButton[];
  readonly privacy: UIButton;
  /** For MenuNav: the page's list, which stays the same object when the page is rebuilt. */
  scroll: ScrollTarget;
  /** Brings the page up to date with who is signed in. Call it each time the page opens. */
  refresh: () => void;
}

/** What the account rows do: renaming (guests rename their local name) and, signed in, signing out. */
export interface AccountActions {
  rename: () => void;
  signOut: () => void;
}

interface Column { x: number; w: number }

/**
 * The settings as a list of sections (Dźwięk, Gra, Konto, Inne), each row a label on the left and its control on the
 * right. Sliders and switches are whole-row buttons: the arrows left and right turn a slider, Enter flips a switch.
 * Wide screens set the sections in two columns that fit the screen; narrower ones scroll a single one.
 */
export function buildSettingsPage(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  width: number,
  area: Rect,
  onAccountDeleted: () => void,
  onPrivacy: () => void,
  actions: AccountActions,
  /** Called with the new controls whenever the page is built again. */
  onRebuilt: (buttons: UIButton[]) => void,
): SettingsPage {
  const isMobile = !scene.sys.game.device.os.desktop;
  const body = scene.add.container(0, 0);
  container.add(body);

  let list: ScrollList | null = null;
  let buttons: UIButton[] = [];
  let privacy!: UIButton;
  let builtFor = '';
  let nameLine: Phaser.GameObjects.Text | null = null;
  let disposers: (() => void)[] = [];
  // A re-layout builds the page again: answers still on their way to this build's objects are dropped
  let closed = false;

  const stateKey = (): string => `${account() !== null}|${signInAvailable()}`;
  const fullscreenHere = (): boolean => isMobile && document.fullscreenEnabled === true;

  const build = (): void => {
    disposers.forEach(dispose => dispose());
    disposers = [];
    list?.destroy();
    body.removeAll(true);
    builtFor = stateKey();
    const signedIn = account() !== null;

    const two = area.w >= TWO_COLUMNS_FROM;
    const colW = two ? Math.min(TWO_COLUMNS_MAX, Math.floor((area.w - COL_GAP) / 2)) : Math.min(ONE_COLUMN_MAX, area.w);
    const left = Math.round(width / 2 - (two ? colW + COL_GAP / 2 : colW / 2));
    const columns: Column[] = two ? [{ x: left, w: colW }, { x: left + colW + COL_GAP, w: colW }] : [{ x: left, w: colW }];
    // The rows scroll inside the panels' height; the page's own area is the list's rectangle
    list = createScrollList(scene, body, { x: left, y: area.y + 4, w: two ? colW * 2 + COL_GAP : colW, h: area.h - 8 }, { step: ROW_H + ROW_GAP });
    const content = list.content;
    buttons = [];

    const add = (...objects: Phaser.GameObjects.GameObject[]): void => { content.add(objects); };
    const addButton = (button: UIButton): UIButton => { content.add(button.all); buttons.push(button); return button; };
    /** A text whose capitals, not its line box, sit on `cy`. */
    const line = (x: number, cy: number, text: string, color: string, originX = 0): Phaser.GameObjects.Text => {
      const t = scene.add.text(x, cy, text, smallStyle({ fontSize: '7px', color, strokeThickness: 0 })).setOrigin(originX, 0.5);
      t.setY(cy + capCentreShift(t));
      add(t);
      return t;
    };

    // --- Pieces ---
    /** A section's title with a hairline after it; `hint` stands at the right end, in `hintColor`. Returns the text of the hint. */
    const heading = (column: Column, y: number, title: string, hint?: string, hintColor: string = UI_TEXT.muted): { y: number; hint: Phaser.GameObjects.Text | null } => {
      const text = line(column.x + PAD, y + HEAD_H / 2, title, UI_TEXT.amber);
      const hintText = hint ? line(column.x + column.w - PAD, y + HEAD_H / 2, hint, hintColor, 1) : null;
      const from = text.x + text.width + 12;
      const to = hintText ? hintText.x - hintText.width - 12 : column.x + column.w - PAD;
      add(scene.add.rectangle(from, y + HEAD_H / 2, to - from, 2, RIM).setOrigin(0, 0.5));
      return { y: y + HEAD_H, hint: hintText };
    };

    /** The face of a row that is a control: the focus lights its rim and its label. */
    const rowFace = (column: Column, y: number, h: number, label: Phaser.GameObjects.Text, action: () => void, sound: 'press' | 'none'): UIButton => {
      const face = createButton(scene, column.x + column.w / 2, y + h / 2, column.w - PAD * 2, h, '', 0x444444, buttonStyle({ fontSize: '10px' }), action, { sound });
      face.txt.setVisible(false);
      const setFocused = face.setFocused;
      face.setFocused = (value) => { setFocused(value); label.setColor(value ? LIT : BONE); };
      content.add(face.all);
      content.bringToTop(label);
      buttons.push(face);
      return face;
    };

    const slider = (column: Column, y: number, label: string, get: () => number, set: (v: number) => void, preview?: (v: number) => void): number => {
      const rowLeft = column.x + PAD;
      const rowRight = column.x + column.w - PAD;
      const cy = y + ROW_H / 2;
      const minusX = rowLeft + LABEL_W + TOUCH_MIN / 2;
      const trackLeft = minusX + TOUCH_MIN / 2 + GAP;
      const pctLeft = rowRight - 12 - PCT_W;
      const plusX = pctLeft - GAP - TOUCH_MIN / 2;
      const trackRight = plusX - TOUCH_MIN / 2 - GAP;
      const trackW = trackRight - trackLeft;

      const text = line(rowLeft + 16, cy, label, BONE);
      let value = get();
      const face = rowFace(column, y, ROW_H, text, () => {}, 'none');
      const pct = line(rowRight - 12, cy, '', BONE, 1);
      const bar = scene.add.graphics();
      add(bar);

      let lastTick = 0;
      const tick = (): void => {
        if (scene.time.now - lastTick < TICK_GAP_MS) return;
        lastTick = scene.time.now;
        playUi(scene, 'ui-slider');
      };
      const draw = (): void => {
        pct.setText(`${Math.round(value * 100)}%`);
        const thumbX = Math.round(trackLeft + THUMB_W / 2 + value * (trackW - THUMB_W) - THUMB_W / 2);
        bar.clear()
          .fillStyle(RIM, 1).fillRect(trackLeft - 2, cy - TRACK_H / 2 - 2, trackW + 4, TRACK_H + 4)
          .fillStyle(TRACK_BG, 1).fillRect(trackLeft, cy - TRACK_H / 2, trackW, TRACK_H)
          .fillStyle(FILL, 1).fillRect(trackLeft, cy - TRACK_H / 2, Math.max(0, thumbX + THUMB_W / 2 - trackLeft), TRACK_H)
          .fillStyle(0x000000, 0.5).fillRect(thumbX + 2, cy - THUMB_H / 2 + 4, THUMB_W, THUMB_H)
          .fillStyle(THUMB, 1).fillRect(thumbX, cy - THUMB_H / 2, THUMB_W, THUMB_H)
          .fillStyle(0x000000, 0.25).fillRect(thumbX, cy + THUMB_H / 2 - 4, THUMB_W, 4);
      };
      // Only a real change is saved, so opening the page doesn't pin today's defaults for good
      const change = (next: number): void => {
        const before = value;
        value = Phaser.Math.Clamp(Math.round(next * 100) / 100, 0, 1);
        draw();
        set(value);
        if (value !== before) tick();
        preview?.(value);
      };
      draw();
      face.adjust = (direction) => change(value + direction * KEY_STEP);

      // Mouse and finger: the track's strip (taller than the track) sets the value where it is touched, and follows the drag
      const strip = scene.add.rectangle((trackLeft + trackRight) / 2, cy, trackW + 24, TOUCH_MIN, 0x000000, 0)
        .setInteractive({ useHandCursor: true }).setData('keepsDrag', true);
      add(strip);
      const fromPointer = (pointer: Phaser.Input.Pointer): void => {
        change((pointer.x - body.getWorldTransformMatrix().tx - trackLeft) / trackW);
      };
      let dragging = false;
      strip.on('pointerdown', (pointer: Phaser.Input.Pointer) => { dragging = true; face.hitZone.emit('pointerover'); fromPointer(pointer); });
      const onMove = (pointer: Phaser.Input.Pointer): void => { if (dragging && pointer.isDown) fromPointer(pointer); };
      const onUp = (): void => { dragging = false; };
      scene.input.on('pointermove', onMove);
      scene.input.on('pointerup', onUp);
      disposers.push(() => { scene.input.off('pointermove', onMove); scene.input.off('pointerup', onUp); });

      // The step buttons stand beside the track for a finger's precision; they light the row they belong to
      const step = (x: number, direction: number): void => {
        const button = createButton(scene, x, cy, TOUCH_MIN, TOUCH_MIN, '', 0x444444, buttonStyle({ fontSize: '10px' }), () => change(value + direction * KEY_STEP), { sound: 'none' });
        const glyph = scene.add.graphics().fillStyle(THUMB, 1).fillRect(x - 8, cy - 2, 16, 4);
        if (direction > 0) glyph.fillRect(x - 2, cy - 8, 4, 16);
        add(...button.all, glyph);
        button.hitZone.on('pointerover', () => face.hitZone.emit('pointerover'));
      };
      step(minusX, -1);
      step(plusX, 1);
      return y + ROW_H;
    };

    /**
     * A pixel toggle with its state in words, TAK / NIE, so it reads without colour. `sync` reads the state again, for
     * one the browser can change on its own. Returns the row's bottom.
     */
    const toggle = (
      column: Column, y: number, label: string, explanation: string | null, get: () => boolean, set: (on: boolean) => void,
      opts: { followsGet?: boolean } = {},
    ): { y: number; sync: () => void } => {
      const rowLeft = column.x + PAD;
      const rowRight = column.x + column.w - PAD;
      const switchW = 64;
      const switchLeft = rowRight - 16 - switchW;
      const wordRight = switchLeft - 12;
      const textW = wordRight - 40 - (rowLeft + 16);
      let on = get();
      const title = line(rowLeft + 16, y + 22, label, BONE);
      let h = ROW_H;
      if (explanation) {
        const note = scene.add.text(rowLeft + 16, y + 22 + 10, explanation, smallStyle({
          fontSize: '7px', color: UI_TEXT.muted, strokeThickness: 0, lineSpacing: 4, wordWrap: { width: textW, useAdvancedWrap: true },
        })).setOrigin(0, 0);
        add(note);
        h = Math.max(EXPLAINED_H, Math.round(22 + 10 + note.height + 10));
      } else {
        title.setY(y + h / 2 + capCentreShift(title));
      }
      const cy = y + h / 2;
      const word = line(wordRight, cy, '', BONE, 1);
      const plate = scene.add.graphics();
      const draw = (): void => {
        word.setText(on ? 'TAK' : 'NIE').setColor(on ? '#e8c15a' : UI_TEXT.muted);
        const top = cy - 16;
        const knob = on ? switchLeft + switchW - 28 : switchLeft + 4;
        plate.clear()
          .fillStyle(RIM, 1).fillRect(switchLeft - 2, top - 2, switchW + 4, 36)
          .fillStyle(on ? 0x6b5a2e : TRACK_BG, 1).fillRect(switchLeft, top, switchW, 32)
          .fillStyle(on ? GOLD : 0x8a7d6b, 1).fillRect(knob, top + 4, 24, 24)
          .fillStyle(0x000000, 0.25).fillRect(knob, top + 24, 24, 4);
      };
      rowFace(column, y, h, title, () => {
        // A state the browser owns follows what it did (sync), not what was asked
        if (opts.followsGet) { set(!get()); return; }
        on = !on;
        set(on);
        draw();
      }, 'press');
      add(plate);
      draw();
      return { y: y + h, sync: () => { on = get(); draw(); } };
    };

    /** A button as wide as the column's rows and as tall as one. */
    const action = (column: Column, y: number, label: string, color: number, press: () => void, opts: { google?: boolean } = {}): { button: UIButton; y: number } => {
      const button = addButton(createButton(scene, column.x + column.w / 2, y + ROW_H / 2, column.w - PAD * 2, ROW_H, label, color, buttonStyle({ fontSize: '10px' }), press, opts));
      return { button, y: y + ROW_H };
    };

    /** A paragraph of muted text across the column's width. */
    const note = (column: Column, y: number, text: string): number => {
      const t = scene.add.text(column.x + PAD, y, text, smallStyle({
        fontSize: '7px', color: UI_TEXT.muted, strokeThickness: 0, lineSpacing: 4, wordWrap: { width: column.w - PAD * 2, useAdvancedWrap: true },
      })).setOrigin(0, 0);
      add(t);
      return y + Math.round(t.height);
    };

    // --- Sections ---
    const sound = (column: Column, y0: number): number => {
      let y = heading(column, y0, 'Dźwięk', isMobile ? undefined : 'Strzałki w bok: zmiana').y;
      y = slider(column, y, 'Muzyka', getMusicVolume, setMusicVolume, (v) => {
        // Live preview: adjust the menu's track as it plays
        const bgm = scene.sound.getAll('menu-bgm').find(s => s.isPlaying);
        if (bgm) (bgm as Phaser.Sound.WebAudioSound).setVolume(0.3 * v);
      }) + ROW_GAP;
      return slider(column, y, 'Efekty', getSfxVolume, setSfxVolume);
    };

    const game = (column: Column, y0: number): number => {
      let y = heading(column, y0, 'Gra').y;
      y = toggle(column, y, 'Docinki bossów', 'Bossowie nabijają się z ciebie', getTauntsEnabled, setTauntsEnabled).y + ROW_GAP;
      y = toggle(column, y, 'Duch rekordu', 'Twój rekord biegnie obok ciebie', getRecordGhostEnabled, setRecordGhostEnabled).y;
      if (fullscreenHere()) {
        y += ROW_GAP;
        const row = toggle(column, y, 'Pełny ekran', null, () => document.fullscreenElement !== null, (on) => {
          if (on) void document.documentElement.requestFullscreen().catch(() => undefined);
          else if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
        }, { followsGet: true });
        y = row.y;
        document.addEventListener('fullscreenchange', row.sync);
        disposers.push(() => document.removeEventListener('fullscreenchange', row.sync));
      }
      return y;
    };

    const accountSection = (column: Column, y0: number): number => {
      const head = heading(column, y0, 'Konto', signedIn ? nameOfUser() : undefined, UI_TEXT.named);
      let y = head.y;
      if (signedIn) {
        nameLine = head.hint;
        y = action(column, y, 'Zmień nazwę', 0x444444, actions.rename).y + ROW_GAP;
        y = action(column, y, 'Wyloguj', 0x444444, actions.signOut).y + DANGER_GAP;
        // Two presses, so nobody deletes their account by accident
        let armed = false;
        let armedAt = 0;
        let disarm: Phaser.Time.TimerEvent | null = null;
        const remove = action(column, y, 'Usuń konto', 0x880000, () => {
          if (!armed) {
            armed = true;
            armedAt = performance.now();
            remove.button.setLabel('Na pewno? Jeszcze raz');
            disarm = scene.time.delayedCall(CONFIRM_MS, () => { armed = false; remove.button.setLabel('Usuń konto'); });
            return;
          }
          if (performance.now() - armedAt < CONFIRM_AFTER_MS) return;
          disarm?.remove();
          armed = false;
          remove.button.setLabel('Usuń konto');
          void deleteAccount().then((ok) => { if (ok && !closed) { refresh(); onAccountDeleted(); } });
        });
        disposers.push(() => disarm?.remove());
        return remove.y;
      }
      nameLine = null;
      if (signInAvailable()) {
        y = action(column, y, 'Zaloguj przez Google', 0, () => signIn(), { google: true }).y + 12;
        y = note(column, y, 'Po zalogowaniu: wyniki w rankingu, okruszki i misje.') + ROW_GAP + 8;
      }
      return action(column, y, 'Zmień nazwę', 0x444444, actions.rename).y;
    };

    const other = (column: Column, y0: number): number => {
      let y = heading(column, y0, 'Inne', VERSION_LINE).y;
      const row = action(column, y, 'Prywatność', 0x444444, onPrivacy);
      privacy = row.button;
      return row.y;
    };

    const top = area.y + 12;
    let bottom: number;
    if (two) {
      bottom = Math.max(game(columns[0], sound(columns[0], top) + SECTION_GAP), other(columns[1], accountSection(columns[1], top) + SECTION_GAP));
    } else {
      bottom = other(columns[0], accountSection(columns[0], game(columns[0], sound(columns[0], top) + SECTION_GAP) + SECTION_GAP) + SECTION_GAP);
    }
    list.setContentHeight(bottom + PAD - (area.y + 4));
    // The panels are as tall as the rows need, or the whole area when the list scrolls
    const panelH = Math.min(area.h, bottom + 12 - area.y);
    for (const column of columns) body.sendToBack(createPanel(scene, column.x, area.y, column.w, panelH));
    onRebuilt(buttons);
  };

  const nameOfUser = (): string => `Zalogowano jako ${account()?.name ?? getPlayerNameOrDefault()}`;
  const refreshName = (): void => { nameLine?.setText(nameOfUser()); };

  const refresh = (): void => {
    if (stateKey() !== builtFor) build();
    else refreshName();
  };

  build();

  const sideList: ScrollTarget = {
    scrollBy: (steps) => list!.scrollBy(steps),
    atTop: () => list!.atTop(),
    holds: (button) => list!.holds(button),
    reveal: (button) => list!.reveal(button),
  };
  scene.events.once('shutdown', () => { closed = true; disposers.forEach(dispose => dispose()); });

  return {
    get buttons() { return buttons; },
    get privacy() { return privacy; },
    scroll: sideList,
    refresh,
  };
}
