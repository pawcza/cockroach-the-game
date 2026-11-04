import Phaser from 'phaser';
import { DEPTH } from '../config/constants';
import { popupStyle, smallStyle } from '../utils/TextStyles';
import { createButton } from './shared';
import { getPlayerName, setPlayerName } from '../utils/Storage';

/**
 * Shows a Phaser-based name input overlay that blocks all game input.
 * Uses a single DOM <input> positioned over the canvas for text entry,
 * but everything else (backdrop, label, button) is Phaser-native.
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

  // Label
  const label = scene.add.text(width / 2, height * 0.30, 'Twój nick', popupStyle({
    fontSize: '14px',
    color: '#fff1c2',
  })).setOrigin(0.5).setScrollFactor(0);
  const hint = scene.add.text(width / 2, height * 0.58 + 36, 'Enter zapisuje  ·  Esc anuluje', smallStyle({
    fontSize: '7px',
    color: '#8a7d6b',
  })).setOrigin(0.5).setScrollFactor(0);
  container.add([label, hint]);

  // DOM input — positioned over the Phaser canvas
  const canvas = scene.game.canvas;

  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 20;
  input.value = defaultName ?? getPlayerName();
  input.style.cssText = [
    'position:fixed',
    'font-family:"Tiny5",monospace',
    'font-size:24px',
    'padding:12px 16px',
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

  // Position the input over the canvas center
  const positionInput = (): void => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / width;
    const scaleY = rect.height / height;
    const centerX = rect.left + (width / 2) * scaleX;
    const centerY = rect.top + (height * 0.42) * scaleY;
    input.style.left = `${centerX - input.offsetWidth / 2}px`;
    input.style.top = `${centerY - input.offsetHeight / 2}px`;
  };
  // Position after a frame so offsetWidth is computed, then focus
  requestAnimationFrame(() => {
    positionInput();
    input.focus();
  });

  // Phaser "Zapisz" button
  const btnY = height * 0.58;
  const btn = createButton(scene, width / 2, btnY, 140, 36, 'Zapisz', 0x8b0000, smallStyle({ fontSize: '10px' }), () => {
    doSubmit();
  });
  for (const obj of btn.all) (obj as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
  container.add(btn.all);

  let submitted = false;

  const cleanup = (): void => {
    if (input.parentNode) input.remove();
    if (container.active) container.destroy();
    onClose?.();
  };

  const doSubmit = (): void => {
    if (submitted) return;
    submitted = true;
    const name = input.value.trim().slice(0, 20);
    if (name.length > 0) {
      setPlayerName(name);
      cleanup();
      onSubmit(name);
    } else {
      submitted = false;
    }
  };

  // Backdrop absorbs clicks but does NOT dismiss (prevent accidental close)

  // Prevent touch on the input area from reaching the Phaser backdrop
  input.addEventListener('touchstart', (e) => e.stopPropagation());
  input.addEventListener('mousedown', (e) => e.stopPropagation());

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
