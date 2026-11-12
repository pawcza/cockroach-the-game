/** A pistol shot's own sprites: the muzzle flash (the effects atlas), and the spent casing thrown out of the slide. Cosmetic only. */
import Phaser from 'phaser';
import { PIXEL_BLOCK } from '../config/constants';
import { ATLAS, SPRITE_SCALE, frameOf } from '../config/sprites';
import { getFx } from './Fx';

/** From the muzzle back to the ejection port on top of the slide, in world px. */
const PORT = { x: -12, y: -3 };
const CASING_MS = 520;
/** On whole world blocks, like the art. */
const snap = (v: number): number => Math.round(v / PIXEL_BLOCK) * PIXEL_BLOCK;

/** The flash at the muzzle and the casing flying out back, drawn just in front of the shooter. */
export function gunfire(scene: Phaser.Scene, muzzle: { x: number; y: number }, depth: number, alpha = 1): void {
  getFx(scene).play('muzzle', muzzle.x, muzzle.y, { depth: depth + 0.2, alpha });

  const casing = scene.add.sprite(muzzle.x + PORT.x, muzzle.y + PORT.y, ATLAS, frameOf('casing'))
    .setScale(SPRITE_SCALE).setDepth(depth + 0.2).setAlpha(alpha);
  casing.play({ key: 'casing', startFrame: Math.floor(Math.random() * 2) });
  const { x, y } = casing;
  const back = 22 + Math.random() * 18;
  const rise = 16 + Math.random() * 10;
  const fall = 44 + Math.random() * 8;
  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: CASING_MS,
    onUpdate: (tween) => {
      const t = tween.getValue() ?? 0;
      // Up and back, then down past where it started, as if thrown and falling
      casing.setPosition(snap(x - back * t), snap(y - rise * 4 * t * (1 - t) + fall * t * t));
      casing.setAlpha(alpha * Math.min(1, (1 - t) * 4));
    },
    onComplete: () => casing.destroy(),
  });
}
