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

const GLOW_REACH = 10;

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

/**
 * Coloured outline glow around a sprite's silhouette, so pickups and obstacles read apart at a glance on busy
 * backgrounds. preFX glows always reach GLOW_REACH texture pixels (fx.glow.distance in the game config), so the
 * padding only has to clear that: anything larger just buys a bigger render target for every sprite.
 */
export function outlineGlow(
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite,
  color: number,
  pulsing: boolean,
): void {
  const fx = sprite.preFX;
  if (!fx) return; // canvas renderer
  fx.setPadding(GLOW_REACH + 2);
  const glow = fx.addGlow(color, 4);
  if (!pulsing) return;
  const tween = scene.tweens.add({
    targets: glow, outerStrength: 1.5, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
  });
  sprite.on('destroy', () => tween.destroy());
}
