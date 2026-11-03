import Phaser from 'phaser';
import { DEPTH } from '../config/constants';

// ── Fade + destroy ──────────────────────────────────────────────────

/** Fade a game object to alpha 0 then destroy it. */
export function fadeAndDestroy(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject,
  duration: number,
  props?: Partial<Phaser.Types.Tweens.TweenBuilderConfig>,
): Phaser.Tweens.Tween {
  const callerOnComplete = props?.onComplete;
  return scene.tweens.add({
    targets: target,
    alpha: 0,
    duration,
    ...props,
    onComplete: () => {
      (target as Phaser.GameObjects.Sprite).destroy();
      if (typeof callerOnComplete === 'function') callerOnComplete.call(undefined, {} as Phaser.Tweens.Tween, [] as Phaser.GameObjects.GameObject[]);
    },
  });
}

// ── Floating text ───────────────────────────────────────────────────

/** Show text that floats upward and fades out. */
export function floatingText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  message: string,
  style: Phaser.Types.GameObjects.Text.TextStyle,
  opts?: { floatY?: number; duration?: number; scale?: number; scrollFactor?: number },
): Phaser.GameObjects.Text {
  const text = scene.add.text(x, y, message, style);
  text.setOrigin(0.5);
  text.setDepth(DEPTH.POPUP);
  if (opts?.scrollFactor !== undefined) text.setScrollFactor(opts.scrollFactor);

  const tweenConfig: Phaser.Types.Tweens.TweenBuilderConfig = {
    targets: text,
    y: text.y - (opts?.floatY ?? 30),
    alpha: 0,
    duration: opts?.duration ?? 800,
    ease: 'Power2',
    onComplete: () => text.destroy(),
  };
  if (opts?.scale !== undefined) {
    (tweenConfig as Record<string, unknown>).scale = opts.scale;
  }
  scene.tweens.add(tweenConfig);

  return text;
}
