import Phaser from 'phaser';
import { DEPTH } from '../config/constants';
import { bodyStyle, buttonStyle, capCentreShift, smallStyle, UI_TEXT } from '../utils/TextStyles';
import { createButton } from './shared';
import { GAP, TOUCH_MIN } from './kit';
import { getPlayerName, setPlayerName } from '../utils/Storage';

const NAME_MAX = 20;
const BUTTON_W = 160;
/** Between the parts of the stack: the label, the field, its message, the buttons. */
const STACK_GAP = 12;
const LABEL_H = 24;
const MESSAGE_H = 16;
const ERROR = '#e07a6a';

/**
 * Shows a Phaser-based name input overlay that blocks all game input.
 * Uses a single DOM <input> positioned over the canvas for text entry,
 * but everything else (backdrop, label, buttons) is Phaser-native.
 *
 * A phone's on-screen keyboard covers the bottom of the canvas (or shrinks what can be seen): the label, the field and
 * the two buttons are one stack that is centred in the part of the canvas that can be seen, and moves with it.
 */
export function showNameInput(
  scene: Phaser.Scene,
  onSubmit: (name: string) => void,
  defaultName?: string,
  onClose?: () => void,
): void {
  const { width, height } = scene.cameras.main;
  const container = scene.add.container(0, 0).setDepth(DEPTH.PAUSE + 100).setScrollFactor(0);

  // Fullscreen backdrop — absorbs all Phaser pointer events
  const backdrop = scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.9)
    .setScrollFactor(0)
    .setInteractive();
  container.add(backdrop);

  // The stack: parts at fixed offsets from its top, which `place` moves. The field (a DOM element) sits in the gap between
  // the label and the message, the height of `field`.
  const stack = scene.add.container(0, 0).setScrollFactor(0);
  container.add(stack);
  const label = scene.add.text(width / 2, LABEL_H / 2, 'Twój nick', bodyStyle({ fontSize: '16px', color: '#fff1c2' })).setOrigin(0.5).setScrollFactor(0);
  label.setY(Math.round(LABEL_H / 2 + capCentreShift(label)));
  const message = scene.add.text(width / 2, 0, '', smallStyle({ fontSize: '7px', color: ERROR, strokeThickness: 0 })).setOrigin(0.5).setScrollFactor(0);
  const hint = scene.add.text(width / 2, 0, 'Enter zapisuje  ·  Esc anuluje', smallStyle({ fontSize: '7px', color: UI_TEXT.muted, strokeThickness: 0 })).setOrigin(0.5).setScrollFactor(0);
  stack.add([label, message, hint]);

  // DOM input — positioned over the Phaser canvas
  const canvas = scene.game.canvas;

  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = NAME_MAX;
  input.value = defaultName ?? getPlayerName();
  input.setAttribute('enterkeyhint', 'done');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('autocapitalize', 'words');
  input.style.cssText = [
    'position:fixed',
    'box-sizing:border-box',
    'font-family:"Tiny5",monospace',
    'font-size:24px',
    'padding:8px 16px',
    'background:#15100d',
    'color:#fff1c2',
    'border:4px solid #b9a78d',
    'box-shadow:4px 6px 0 rgba(0,0,0,0.55)',
    'outline:none',
    'text-align:center',
    'width:300px',
    'max-width:80vw',
    `z-index:100000`,
    '-webkit-tap-highlight-color:transparent',
  ].join(';');
  document.body.appendChild(input);

  let submitted = false;

  const cleanup = (): void => {
    window.removeEventListener('resize', place);
    window.visualViewport?.removeEventListener('resize', place);
    window.visualViewport?.removeEventListener('scroll', place);
    if (input.parentNode) input.remove();
    if (container.active) container.destroy();
    onClose?.();
  };

  const doSubmit = (): void => {
    if (submitted) return;
    submitted = true;
    const name = input.value.trim().slice(0, NAME_MAX);
    if (name.length > 0) {
      setPlayerName(name);
      cleanup();
      onSubmit(name);
    } else {
      submitted = false;
      showMessage('Wpisz nick, od 1 do 20 znaków');
      input.focus();
    }
  };

  // The two buttons: cancel on the left, save as the one to press
  const row = scene.add.container(0, 0).setScrollFactor(0);
  stack.add(row);
  const cancel = createButton(scene, width / 2 - BUTTON_W / 2 - GAP / 2, 0, BUTTON_W, TOUCH_MIN, 'Anuluj', 0x444444, buttonStyle({ fontSize: '10px' }), cleanup, { sound: 'back' });
  const save = createButton(scene, width / 2 + BUTTON_W / 2 + GAP / 2, 0, BUTTON_W, TOUCH_MIN, 'Zapisz', 0xe8c15a, buttonStyle({ fontSize: '10px' }), doSubmit);
  for (const obj of [...cancel.all, ...save.all]) (obj as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
  row.add([...cancel.all, ...save.all]);

  const showMessage = (text: string): void => {
    message.setText(text);
    message.setVisible(text !== '');
    hint.setVisible(text === '');
  };
  showMessage('');

  /**
   * Centres the stack in what can be seen of the canvas: on a phone with its keyboard up that is the strip above the
   * keyboard, in the visual viewport (which the keyboard shrinks or pans), not the whole canvas.
   */
  function place(): void {
    if (!input.isConnected) return;
    const rect = canvas.getBoundingClientRect();
    const k = rect.width / width;
    const vv = window.visualViewport;
    const seenTop = Math.max(rect.top, vv?.offsetTop ?? 0);
    const seenBottom = Math.min(rect.bottom, vv ? vv.offsetTop + vv.height : window.innerHeight);
    const top = (seenTop - rect.top) / k;
    const seenH = (seenBottom - seenTop) / k;
    const fieldH = input.offsetHeight / k;
    const messageY = LABEL_H + STACK_GAP + fieldH + STACK_GAP;
    const buttonsY = messageY + MESSAGE_H + STACK_GAP;
    const total = buttonsY + TOUCH_MIN;
    // A little above the middle: the eye is there, and a bottom edge hides first
    const y0 = Math.round(top + Math.max(8, (seenH - total) * 0.45));
    stack.setY(y0);
    for (const t of [message, hint]) t.setY(Math.round(messageY + MESSAGE_H / 2 + capCentreShift(t)));
    row.setY(Math.round(buttonsY + TOUCH_MIN / 2));
    input.style.left = `${rect.left + (width / 2) * k - input.offsetWidth / 2}px`;
    input.style.top = `${rect.top + (y0 + LABEL_H + STACK_GAP) * k}px`;
  }

  // Position after a frame so offsetWidth is computed, then focus
  requestAnimationFrame(() => {
    place();
    input.focus();
  });
  window.addEventListener('resize', place);
  window.visualViewport?.addEventListener('resize', place);
  window.visualViewport?.addEventListener('scroll', place);

  // Backdrop absorbs clicks but does NOT dismiss (prevent accidental close)

  // Prevent touch on the input area from reaching the Phaser backdrop
  input.addEventListener('touchstart', (e) => e.stopPropagation());
  input.addEventListener('mousedown', (e) => e.stopPropagation());
  input.addEventListener('input', () => { if (input.value.trim() !== '') showMessage(''); });

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') doSubmit();
    if (e.key === 'Escape') cleanup();
  });

  input.addEventListener('keyup', (e) => e.stopPropagation());
  input.addEventListener('keypress', (e) => e.stopPropagation());

  // Cleanup on scene shutdown (e.g. game starts while overlay is open)
  scene.events.once('shutdown', cleanup);
}
