/**
 * The roach punts something: a white-hot spark where it was struck and a poof as it leaves, a thud, and the thing flies
 * up and ahead, fading, then it is gone. What a dash (or the pill, or a shed shell) does to an obstacle in the run, and
 * to what Pani Lodzia throws. Cosmetic and local, so no seeded randomness.
 */
import Phaser from 'phaser';
import { AudioManager } from '../audio/AudioManager';
import { DEPTH } from '../config/constants';
import { getFx } from './Fx';

/** How far a punted thing flies, and for how long. Ahead of the roach, so it stays in view as it flies off. */
const FLING_X = 500;
const FLING_Y = 220;
const FLING_MS = 750;

/** Punts `target`: it is destroyed once it has flown. `at`: where it was struck (default: its middle). */
export function punt(
  scene: Phaser.Scene, audio: AudioManager, target: Phaser.GameObjects.Sprite, at?: { x: number; y: number },
): void {
  target.setDepth(DEPTH.POPUP - 1);
  audio.playSfx('flipper-sfx', 0.5);
  const fx = getFx(scene);
  const hit = at ?? { x: target.x, y: target.getCenter().y };
  fx.play('poof', hit.x, hit.y, { depth: DEPTH.POPUP - 1 });
  fx.play('spark-big', hit.x - 10, hit.y, { depth: DEPTH.POPUP });
  scene.tweens.add({
    targets: target,
    x: target.x + FLING_X + Math.random() * 200,
    duration: FLING_MS,
    ease: 'Quad.easeOut',
  });
  scene.tweens.add({
    targets: target,
    y: target.y - FLING_Y - Math.random() * 120,
    alpha: 0,
    duration: FLING_MS,
    ease: 'Cubic.easeOut',
    onComplete: () => target.destroy(),
  });
}
