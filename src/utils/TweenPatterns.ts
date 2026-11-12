import Phaser from 'phaser';
import { DEPTH, PIXEL_BLOCK } from '../config/constants';

// ── Floating text ───────────────────────────────────────────────────

/** Show text that floats upward and fades out, moving in whole world blocks and growing in whole sizes. */
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
    // Whole blocks, and whole sizes when it grows
    onUpdate: () => text.setY(Math.round(text.y / PIXEL_BLOCK) * PIXEL_BLOCK).setScale(Math.max(1, Math.round(text.scale))),
    onComplete: () => text.destroy(),
  };
  if (opts?.scale !== undefined) {
    (tweenConfig as Record<string, unknown>).scale = opts.scale;
  }
  scene.tweens.add(tweenConfig);

  return text;
}

// ── Text beat ───────────────────────────────────────────────────────

const snapBlock = (v: number): number => Math.round(v / PIXEL_BLOCK) * PIXEL_BLOCK;

/**
 * Text that comes in, holds and goes in whole steps: it rises `rise` px into place as its alpha steps up in thirds,
 * holds, then rises `outRise` more as it steps out, and is destroyed. Scale only ever takes whole values: from `from`
 * down to its own (a slam) and, going, up to `to`. Positions land on whole world blocks.
 */
export function textBeat(
  scene: Phaser.Scene,
  targets: Phaser.GameObjects.Text[],
  opts: { rise?: number; inMs?: number; hold: number; outMs?: number; outRise?: number; alpha?: number; from?: number; to?: number; delay?: number },
): void {
  const { rise = 8, inMs = 200, hold, outMs = 300, outRise = 8, alpha = 1, from = 1, to = 1, delay = 0 } = opts;
  const baseY = targets.map(t => snapBlock(t.y));
  const set = (dy: number, a: number, scale: number): void => targets.forEach((t, i) => {
    t.setY(snapBlock(baseY[i] + dy)).setAlpha(alpha * Math.ceil(a * 3) / 3).setScale(Math.max(1, Math.round(scale)));
  });
  set(rise, 0, from);
  scene.tweens.addCounter({
    from: 0, to: 1, duration: inMs, delay, ease: 'Cubic.easeOut',
    onUpdate: (tw) => { const p = tw.getValue() ?? 0; set(rise * (1 - p), p, from + (1 - from) * p); },
    onComplete: () => {
      scene.tweens.addCounter({
        from: 0, to: 1, delay: hold, duration: outMs,
        onUpdate: (tw) => { const p = tw.getValue() ?? 0; set(-outRise * p, 1 - p, 1 + (to - 1) * p); },
        onComplete: () => targets.forEach(t => t.destroy()),
      });
    },
  });
}
