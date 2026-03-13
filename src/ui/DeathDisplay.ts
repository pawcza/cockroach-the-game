import Phaser from 'phaser';
import { FONT_FAMILY, getScale, OBSTACLE_TEXTURE } from './shared';

/** Polish death messages mapped by obstacle type. */
const DEATH_TEXT: Record<string, string> = {
  bird: 'SRAK CIĘ OPTAKAŁ',
  cat: 'Rozkotowany',
  flipper: 'Kubota Ci w ryj!',
  newspaper: 'Złe wybory kolego',
  onion: 'Smrót Cię zmiótł',
  spray: 'MUGA!',
  pill: 'PRZEDAWKOWANIE!',
  disco: 'DYSKOTEKA ZAMKNIĘTA!',
  jellyfish: 'UŻĄDLONY NA BAŁTYKU!',
  pope: 'OKADZONY PRZEZ PAPIEŻA!',
  bison: 'ŻUBR CIĘ STRATOWAŁ!',
  blackhole: 'WCIĄGNIĘTY W NICOŚĆ!',
};

const DEFAULT_DEATH = 'ZGNIOTŁEŚ SIĘ!';

/** Returns the death message for a given obstacle type. */
export function getDeathMessage(obstacleType?: string | null): string {
  if (obstacleType && DEATH_TEXT[obstacleType]) {
    return DEATH_TEXT[obstacleType];
  }
  return DEFAULT_DEATH;
}

/**
 * Displays the death title text with a shaking animation.
 * Returns the Y position of the title for positioning elements below it.
 */
export function showDeathTitle(
  scene: Phaser.Scene,
  width: number,
  height: number,
  message: string,
): number {
  const s = getScale();
  const titleText = scene.add
    .text(width / 2, height * 0.12, message, {
      fontSize: `${Math.round((message.length > 15 ? 18 : 28) * s)}px`,
      color: '#8b0000',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6 * s,
    })
    .setOrigin(0.5);

  const baseX = titleText.x;
  const baseY = titleText.y;
  scene.time.addEvent({
    delay: 100,
    loop: true,
    callback: () => {
      titleText.x = baseX + Phaser.Math.Between(-2, 2);
      titleText.y = baseY + Phaser.Math.Between(-2, 2);
    },
  });

  return titleText.y;
}

/**
 * Displays the obstacle image that killed the player, with a floating animation.
 */
export function showObstacleImage(
  scene: Phaser.Scene,
  width: number,
  titleY: number,
  obstacleType?: string | null,
): void {
  if (!obstacleType || !OBSTACLE_TEXTURE[obstacleType]) return;

  const textureKey = OBSTACLE_TEXTURE[obstacleType];
  const img = scene.add.image(width / 2, titleY + 30, textureKey);
  img.setScale(0.25).setOrigin(0.5, 0);

  scene.tweens.add({
    targets: img,
    y: img.y - 5,
    duration: 1000,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
}
