import Phaser from 'phaser';
import { playUi } from '../../audio/AudioManager';
import { buttonStyle, headingStyle, smallStyle, UI_TEXT } from '../../utils/TextStyles';
import { getMusicVolume, getRecordGhostEnabled, getSfxVolume, getTauntsEnabled, setMusicVolume, setRecordGhostEnabled, setSfxVolume, setTauntsEnabled } from '../../utils/Storage';
import { createButton, UIButton } from '../../ui/shared';
import { account, deleteAccount } from '../../ui/Account';

/** How long the delete button waits for the second press before it backs off. */
const CONFIRM_MS = 4000;

const ROW_W = 320;
const BAR_H = 8;
const KEY_STEP = 0.1;
/** Slider ticks come at most this often while a bar is dragged. */
const TICK_GAP_MS = 60;
const FILL = 0xb9a78d;
const TRACK = 0x2a1f18;

export interface SettingsPage {
  buttons: UIButton[];
  /** Shows or hides what depends on being signed in. Call it each time the page opens. */
  refresh: () => void;
}

/**
 * Volume sliders, each a focusable row: the arrows left and right turn it, the mouse drags its bar. Below them the
 * privacy policy and, signed in, deleting the account.
 */
export function buildSettingsPage(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  width: number,
  height: number,
  onAccountDeleted: () => void,
  onPrivacy: () => void,
): SettingsPage {
  container.add(scene.add.text(Math.round(width / 2), 44, 'USTAWIENIA', headingStyle({
    fontSize: '20px',
    color: UI_TEXT.bone,
    strokeThickness: 6,
    shadow: { offsetX: 0, offsetY: 3, color: '#5a0d0d', blur: 0, fill: true, stroke: true },
  })).setOrigin(0.5));

  const barX = Math.round(width / 2 - ROW_W / 2);

  const createSlider = (
    y: number,
    label: string,
    getValue: () => number,
    setValue: (v: number) => void,
    onPreview?: (v: number) => void,
  ): UIButton => {
    let value = getValue();
    // A tick for each step, never more than one in a few frames while dragging
    let lastTick = 0;
    const tick = (): void => {
      if (scene.time.now - lastTick < TICK_GAP_MS) return;
      lastTick = scene.time.now;
      playUi(scene, 'ui-slider');
    };
    const row = createButton(scene, width / 2, y, ROW_W, 34, '', 0x444444, buttonStyle({ fontSize: '10px' }), () => {}, { sound: 'none' });
    container.add(row.all);

    const barY = y + 28;
    const bar = scene.add.graphics();
    container.add(bar);

    const draw = (): void => {
      row.setLabel(`${label}: ${Math.round(value * 100)}%`);
      bar.clear()
        .fillStyle(TRACK, 1).fillRect(barX, barY, ROW_W, BAR_H)
        .fillStyle(FILL, 1).fillRect(barX, barY, Math.round(value * ROW_W / 2) * 2, BAR_H);
    };
    // Only a real change is saved, so opening the page doesn't pin today's defaults for good
    const set = (next: number): void => {
      const before = value;
      value = Phaser.Math.Clamp(Math.round(next * 100) / 100, 0, 1);
      draw();
      setValue(value);
      if (value !== before) tick();
      onPreview?.(value);
    };
    draw();
    row.adjust = (direction) => set(value + direction * KEY_STEP);

    const hitZone = scene.add.rectangle(width / 2, barY + BAR_H / 2, ROW_W + 20, BAR_H + 20, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    container.add(hitZone);

    let dragging = false;
    const fromPointer = (pointer: Phaser.Input.Pointer): void => set((pointer.x - container.x - barX) / ROW_W);
    hitZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => { dragging = true; fromPointer(pointer); });
    const moveHandler = (pointer: Phaser.Input.Pointer): void => { if (dragging && pointer.isDown) fromPointer(pointer); };
    const upHandler = (): void => { dragging = false; };
    scene.input.on('pointermove', moveHandler);
    scene.input.on('pointerup', upHandler);
    scene.events.once('shutdown', () => {
      scene.input.off('pointermove', moveHandler);
      scene.input.off('pointerup', upHandler);
    });
    return row;
  };

  const startY = Math.round(height / 2 - 84);
  const music = createSlider(startY, 'Muzyka', getMusicVolume, setMusicVolume, (v) => {
    // Live preview: adjust currently playing BGM
    const bgm = scene.sound.getAll('menu-bgm').find(s => s.isPlaying);
    if (bgm) (bgm as Phaser.Sound.WebAudioSound).setVolume(0.3 * v);
  });
  const sfx = createSlider(startY + 84, 'Efekty', getSfxVolume, setSfxVolume);

  // Switches, pressed to flip: the bosses' taunts while you run, and the record run racing beside you
  const createSwitch = (x: number, label: string, get: () => boolean, set: (on: boolean) => void): UIButton => {
    let on = get();
    const text = (): string => `${label}: ${on ? 'TAK' : 'NIE'}`;
    const button = createButton(scene, x, startY + 146, 160, 28, text(), 0x444444, buttonStyle({ fontSize: '8px' }), () => {
      on = !on;
      set(on);
      button.setLabel(text());
    });
    container.add(button.all);
    return button;
  };
  const tauntRow = createSwitch(width / 2 - 90, 'Docinki bossów', getTauntsEnabled, setTauntsEnabled);
  const ghostRow = createSwitch(width / 2 + 90, 'Duch rekordu', getRecordGhostEnabled, setRecordGhostEnabled);

  if (scene.sys.game.device.os.desktop) container.add(scene.add.text(Math.round(width / 2), startY + 174, 'Strzałki w bok: głośność', smallStyle({
    fontSize: '7px', color: UI_TEXT.muted, strokeThickness: 0,
  })).setOrigin(0.5));

  const rowY = startY + 204;
  const smallBtn = buttonStyle({ fontSize: '8px' });
  const privacy = createButton(scene, width / 2 - 90, rowY, 160, 28, 'Prywatność', 0x444444, smallBtn, onPrivacy);
  container.add(privacy.all);

  // Two presses, so nobody deletes their account by accident
  let armed = false;
  let disarm: Phaser.Time.TimerEvent | null = null;
  const remove = createButton(scene, width / 2 + 90, rowY, 160, 28, 'Usuń konto', 0x880000, smallBtn, () => {
    if (!armed) {
      armed = true;
      remove.setLabel('Na pewno?');
      disarm = scene.time.delayedCall(CONFIRM_MS, () => { armed = false; remove.setLabel('Usuń konto'); });
      return;
    }
    disarm?.remove();
    armed = false;
    remove.setLabel('Usuń konto');
    void deleteAccount().then((ok) => { if (ok) { refresh(); onAccountDeleted(); } });
  });
  container.add(remove.all);

  const refresh = (): void => {
    const signedIn = account() !== null;
    remove.setEnabled(signedIn);
    remove.all.forEach(o => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(signedIn));
  };
  refresh();

  return { buttons: [music, sfx, privacy, remove, tauntRow, ghostRow], refresh };
}
