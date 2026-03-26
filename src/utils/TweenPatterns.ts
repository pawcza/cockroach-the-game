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

// ── Glow helpers ────────────────────────────────────────────────────

/** Create a standalone glow circle (additive blend). Returns the circle. */
/**
 * Attach a pulsing point light to a pickup sprite. Uses Phaser's Light2D
 * system for natural-looking illumination instead of additive-blend circles.
 * The light follows the sprite and auto-removes on destroy.
 */
export function attachGlow(
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite,
  radius: number,
  color: number,
  intensity: number,
  pulseConfig?: { toAlpha?: number; toScale?: number; duration?: number },
): Phaser.GameObjects.Light | null {
  // Only works if the scene has lighting enabled
  if (!scene.lights.active) return null;

  const light = scene.lights.addLight(sprite.x, sprite.y, radius * 3, color, intensity * 1.5);

  const pDuration = pulseConfig?.duration ?? 500;
  const minIntensity = (pulseConfig?.toAlpha ?? intensity * 0.33) * 1.5;

  // Pulse intensity
  const pulseData = { val: light.intensity };
  const pulseTween = scene.tweens.add({
    targets: pulseData,
    val: minIntensity,
    duration: pDuration,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
    onUpdate: () => { light.intensity = pulseData.val; },
  });

  // Follow sprite position each frame
  const updateHandler = (): void => {
    if (!sprite.active) return;
    light.x = sprite.x;
    light.y = sprite.y;
  };
  scene.events.on('update', updateHandler);

  // Store light ref on sprite for vacuum pull
  sprite.setData('_light', light);

  sprite.on('destroy', () => {
    pulseTween.destroy();
    scene.events.off('update', updateHandler);
    scene.lights.removeLight(light);
  });

  return light;
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
