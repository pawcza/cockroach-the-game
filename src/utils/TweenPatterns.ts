import Phaser from 'phaser';
import { DEPTH } from '../config/constants';

// ── Simple movement tweens ──────────────────────────────────────────

/** Gentle float up and down (pickups, collectibles). */
export function floatUpDown(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject,
  distance: number,
  duration: number,
): Phaser.Tweens.Tween {
  return scene.tweens.add({
    targets: target,
    y: (target as unknown as { y: number }).y - distance,
    duration,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
}

/** Pulsing scale tween. */
export function pulse(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject,
  toScale: number,
  duration: number,
): Phaser.Tweens.Tween {
  return scene.tweens.add({
    targets: target,
    scaleX: toScale,
    scaleY: toScale,
    duration,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
}

// ── Fade + destroy ──────────────────────────────────────────────────

/** Fade a game object to alpha 0 then destroy it. */
export function fadeAndDestroy(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject,
  duration: number,
  props?: Partial<Phaser.Types.Tweens.TweenBuilderConfig>,
): Phaser.Tweens.Tween {
  return scene.tweens.add({
    targets: target,
    alpha: 0,
    duration,
    ...props,
    onComplete: () => {
      (target as Phaser.GameObjects.Sprite).destroy();
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

// ── Glow helpers ────────────────────────────────────────────────────

/** Create a standalone glow circle (additive blend). Returns the circle. */
export function createGlow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  radius: number,
  color: number,
  alpha: number,
): Phaser.GameObjects.Arc {
  return scene.add.circle(x, y, radius, color, alpha)
    .setDepth(DEPTH.GLOW)
    .setBlendMode(Phaser.BlendModes.ADD);
}

/**
 * Attach a pulsing glow to a sprite. The glow auto-destroys when the sprite
 * is destroyed. Returns the glow circle.
 */
export function attachGlow(
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite,
  radius: number,
  color: number,
  alpha: number,
  pulseConfig?: { toAlpha?: number; toScale?: number; duration?: number },
): Phaser.GameObjects.Arc {
  const glow = createGlow(scene, sprite.x, sprite.y, radius, color, alpha);

  const pAlpha = pulseConfig?.toAlpha ?? alpha * 0.33;
  const pScale = pulseConfig?.toScale;
  const pDuration = pulseConfig?.duration ?? 500;

  const tweenCfg: Phaser.Types.Tweens.TweenBuilderConfig = {
    targets: glow,
    alpha: pAlpha,
    duration: pDuration,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  };
  if (pScale !== undefined) {
    (tweenCfg as Record<string, unknown>).scale = pScale;
  }
  scene.tweens.add(tweenCfg);

  sprite.on('destroy', () => {
    scene.tweens.killTweensOf(glow);
    glow.destroy();
  });

  return glow;
}

// ── Overlay / particles ─────────────────────────────────────────────

/** Create a pulsing overlay (additive blend) that fades between alpha and pulseAlpha. */
export function createPulsingOverlay(
  scene: Phaser.Scene,
  w: number,
  h: number,
  color: number,
  alpha: number,
  pulseAlpha: number,
): Phaser.GameObjects.Rectangle {
  const overlay = scene.add.rectangle(w / 2, h / 2, w, h, color, alpha)
    .setScrollFactor(0)
    .setDepth(DEPTH.VFX_VIGNETTE)
    .setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: overlay,
    alpha: pulseAlpha,
    duration: 2000,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
  return overlay;
}

/** Emit a burst of circle particles that fly outward and fade. */
export function burstParticles(
  scene: Phaser.Scene,
  x: number,
  y: number,
  colors: readonly number[],
  count: number,
  opts?: { radius?: number; speed?: number; duration?: number; depth?: number },
): void {
  const radius = opts?.radius ?? 3;
  const speed = opts?.speed ?? 110;
  const duration = opts?.duration ?? 500;
  const depth = opts?.depth ?? DEPTH.VFX_TEXT;

  for (let i = 0; i < count; i++) {
    const color = colors[i % colors.length];
    const particle = scene.add.circle(x, y, radius, color, 1);
    particle.setDepth(depth);

    const angle = (i / count) * Math.PI * 2;
    const dist = (speed * 0.57) + Math.random() * (speed * 0.43);
    const targetX = x + Math.cos(angle) * dist;
    const targetY = y + Math.sin(angle) * dist;

    scene.tweens.add({
      targets: particle,
      x: targetX,
      y: targetY,
      alpha: 0,
      scale: 0.1,
      duration: duration * 0.67 + Math.random() * duration * 0.33,
      ease: 'Power2',
      onComplete: () => particle.destroy(),
    });
  }
}
