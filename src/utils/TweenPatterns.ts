import Phaser from 'phaser';

// ---------------------------------------------------------------------------
//  Float / bob — endless up-down oscillation
// ---------------------------------------------------------------------------

/** Make a target gently bob up and down forever. */
export function floatUpDown(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject & { y: number },
  distance = 10,
  duration = 1500,
): Phaser.Tweens.Tween {
  return scene.tweens.add({
    targets: target,
    y: target.y - distance,
    duration,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
}

// ---------------------------------------------------------------------------
//  Pulse / throb — endless scale oscillation
// ---------------------------------------------------------------------------

/** Make a target pulse between its current scale and a target scale forever. */
export function pulse(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject,
  toScale: number,
  duration = 500,
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

// ---------------------------------------------------------------------------
//  Fade out + destroy — one-shot disposable animation
// ---------------------------------------------------------------------------

export interface FadeOutConfig {
  y?: number;
  x?: number;
  scale?: number;
  angle?: number;
  duration?: number;
  ease?: string;
  delay?: number;
}

/** Fade a game object to alpha 0, then destroy it. */
export function fadeAndDestroy(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject,
  config: FadeOutConfig = {},
): Phaser.Tweens.Tween {
  const tweenConfig: Phaser.Types.Tweens.TweenBuilderConfig = {
    targets: target,
    alpha: 0,
    duration: config.duration ?? 600,
    ease: config.ease ?? 'Power2',
    delay: config.delay ?? 0,
    onComplete: () => (target as Phaser.GameObjects.GameObject).destroy(),
  };
  if (config.y !== undefined) tweenConfig.y = config.y;
  if (config.x !== undefined) tweenConfig.x = config.x;
  if (config.scale !== undefined) tweenConfig.scale = config.scale;
  if (config.angle !== undefined) tweenConfig.angle = config.angle;
  return scene.tweens.add(tweenConfig);
}

// ---------------------------------------------------------------------------
//  Floating text popup — rises and fades ("+10", "PIGULKA!", etc.)
// ---------------------------------------------------------------------------

/** Show a text popup that floats upward and fades out. */
export function floatingText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  message: string,
  style: Phaser.Types.GameObjects.Text.TextStyle,
  config: { rise?: number; duration?: number; scale?: number; depth?: number } = {},
): void {
  const text = scene.add.text(x, y, message, style).setOrigin(0.5).setDepth(config.depth ?? 999);
  fadeAndDestroy(scene, text, {
    y: y - (config.rise ?? 40),
    scale: config.scale,
    duration: config.duration ?? 800,
  });
}

// ---------------------------------------------------------------------------
//  Glow effect — additive-blend circle that pulses around a sprite
// ---------------------------------------------------------------------------

/** Create a pulsing additive-blend glow circle. Returns the glow object. */
export function createGlow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  radius: number,
  color: number,
  alpha = 0.3,
  pulseDuration = 400,
): Phaser.GameObjects.Arc {
  const glow = scene.add
    .circle(x, y, radius, color, alpha)
    .setDepth(9)
    .setBlendMode(Phaser.BlendModes.ADD);

  scene.tweens.add({
    targets: glow,
    alpha: alpha * 0.3,
    scale: 1.3,
    duration: pulseDuration,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  return glow;
}

/**
 * Attach a glow to a sprite — glow auto-destroys with the sprite.
 * Returns the glow for further customisation.
 */
export function attachGlow(
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite,
  radius: number,
  color: number,
  alpha = 0.3,
  pulseDuration = 400,
): Phaser.GameObjects.Arc {
  const glow = createGlow(scene, sprite.x, sprite.y, radius, color, alpha, pulseDuration);
  sprite.on('destroy', () => {
    scene.tweens.killTweensOf(sprite);
    scene.tweens.killTweensOf(glow);
    glow.destroy();
  });
  return glow;
}

// ---------------------------------------------------------------------------
//  Pulsing overlay — fullscreen additive-blend rectangle that breathes
// ---------------------------------------------------------------------------

/** Create a fullscreen pulsing overlay (used for scene backgrounds). */
export function createPulsingOverlay(
  scene: Phaser.Scene,
  width: number,
  height: number,
  color: number,
  alpha = 0.3,
  duration = 1500,
): Phaser.GameObjects.Rectangle {
  const overlay = scene.add
    .rectangle(width / 2, height / 2, width, height, color, alpha)
    .setBlendMode(Phaser.BlendModes.ADD);

  scene.tweens.add({
    targets: overlay,
    alpha: 0.05,
    duration,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  return overlay;
}

// ---------------------------------------------------------------------------
//  Burst particles — radial explosion of small circles
// ---------------------------------------------------------------------------

/** Spawn a radial burst of colored particles that fade out. */
export function burstParticles(
  scene: Phaser.Scene,
  x: number,
  y: number,
  colors: number[],
  count = 12,
  config: { radius?: number; speed?: number; duration?: number; depth?: number } = {},
): void {
  const radius = config.radius ?? 3;
  const speed = config.speed ?? 80;
  const duration = config.duration ?? 400;
  const depth = config.depth ?? 996;

  for (let i = 0; i < count; i++) {
    const color = colors[i % colors.length];
    const particle = scene.add.circle(x, y, radius, color, 1).setDepth(depth);

    const angle = (i / count) * Math.PI * 2;
    const dist = speed + Math.random() * (speed * 0.75);

    fadeAndDestroy(scene, particle, {
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist,
      scale: 0.1,
      duration: duration + Math.random() * (duration * 0.5),
      ease: 'Power2',
    });
  }
}
