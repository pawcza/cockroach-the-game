import Phaser from 'phaser';
import { bodyStyle, headingStyle, smallStyle } from '../../utils/TextStyles';
import { floatUpDown } from '../../utils/TweenPatterns';
import { getMusicVolume, getSfxVolume, setMusicVolume, setSfxVolume } from '../../utils/Storage';

export function buildSettingsPage(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  width: number,
  height: number,
): void {
  const title = scene.add.text(width / 2, 40, 'USTAWIENIA', headingStyle({ fontSize: '20px' })).setOrigin(0.5);
  container.add(title);
  floatUpDown(scene, title, 4, 1200);

  const sliderW = 260;
  const sliderH = 8;
  const sliderX = width / 2 - sliderW / 2;
  const labelStyle = bodyStyle({ fontSize: '10px', color: '#cccccc', strokeThickness: 3 });
  const valStyle = smallStyle({ fontSize: '8px', color: '#ffff00', strokeThickness: 2 });

  const createSlider = (
    y: number,
    label: string,
    getValue: () => number,
    setValue: (v: number) => void,
    onPreview?: (v: number) => void,
  ): void => {
    const labelText = scene.add.text(width / 2, y, label, labelStyle).setOrigin(0.5);
    container.add(labelText);

    const barY = y + 25;
    const bar = scene.add.graphics();
    bar.fillStyle(0x333333, 1);
    bar.fillRoundedRect(sliderX, barY, sliderW, sliderH, 4);
    container.add(bar);

    const fillBar = scene.add.graphics();
    container.add(fillBar);

    const pct = Math.round(getValue() * 100);
    const valText = scene.add.text(width / 2 + sliderW / 2 + 25, barY + sliderH / 2, `${pct}%`, valStyle).setOrigin(0, 0.5);
    container.add(valText);

    const knobR = 10;
    const knobX = sliderX + getValue() * sliderW;
    const knob = scene.add.circle(knobX, barY + sliderH / 2, knobR, 0xffffff, 1);
    container.add(knob);

    const drawFill = (val: number): void => {
      fillBar.clear();
      fillBar.fillStyle(0x888800, 1);
      fillBar.fillRoundedRect(sliderX, barY, val * sliderW, sliderH, 4);
    };
    drawFill(getValue());

    // Hit zone — covers bar + knob area for click and drag
    const hitZone = scene.add.rectangle(sliderX + sliderW / 2, barY + sliderH / 2, sliderW + knobR * 4, sliderH + knobR * 4, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    container.add(hitZone);

    let dragging = false;

    const updateFromX = (px: number): void => {
      const val = Phaser.Math.Clamp((px - sliderX) / sliderW, 0, 1);
      knob.x = sliderX + val * sliderW;
      drawFill(val);
      valText.setText(`${Math.round(val * 100)}%`);
      setValue(val);
      onPreview?.(val);
    };

    hitZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      dragging = true;
      updateFromX(pointer.x);
    });

    const moveHandler = (pointer: Phaser.Input.Pointer): void => {
      if (dragging && pointer.isDown) updateFromX(pointer.x);
    };
    const upHandler = (): void => { dragging = false; };

    scene.input.on('pointermove', moveHandler);
    scene.input.on('pointerup', upHandler);
  };

  const startY = height / 2 - 60;

  createSlider(startY, 'Muzyka', getMusicVolume, setMusicVolume, (v) => {
    // Live preview: adjust currently playing BGM
    const bgm = scene.sound.getAll('menu-bgm').find(s => s.isPlaying);
    if (bgm) (bgm as Phaser.Sound.WebAudioSound).setVolume(0.3 * v);
  });

  createSlider(startY + 80, 'Efekty', getSfxVolume, setSfxVolume);
}
