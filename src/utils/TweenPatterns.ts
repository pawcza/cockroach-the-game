import Phaser from 'phaser';

/** Gentle vertical floating bob (like menu titles). */
export function floatUpDown(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject,
  amplitude = 10,
  duration = 1500,
): Phaser.Tweens.Tween {
  const t = target as Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject;
  return scene.tweens.add({
    targets: target,
    y: t.y - amplitude,
    duration,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
}

/** Scale pulse effect. */
export function pulse(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[],
  minScale = 0.95,
  maxScale = 1.05,
  duration = 600,
): Phaser.Tweens.Tween {
  return scene.tweens.add({
    targets: target,
    scaleX: { from: minScale, to: maxScale },
    scaleY: { from: minScale, to: maxScale },
    duration,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
}

/** Fade out alpha then destroy the target(s). */
export function fadeAndDestroy(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[],
  duration = 500,
  delay = 0,
  overrides?: Partial<Phaser.Types.Tweens.TweenBuilderConfig>,
): Phaser.Tweens.Tween {
  return scene.tweens.add({
    targets: target,
    alpha: 0,
    duration,
    delay,
    ease: 'Power2',
    onComplete: () => {
      const arr = Array.isArray(target) ? target : [target];
      arr.forEach(t => t.destroy());
    },
    ...overrides,
  });
}

/** Floating text that rises and fades out, then destroys itself. */
export function floatingText(
  scene: Phaser.Scene,
  x: number, y: number,
  text: string,
  style: Phaser.Types.GameObjects.Text.TextStyle,
  riseDistance = 40,
  duration = 800,
): Phaser.GameObjects.Text {
  const txt = scene.add.text(x, y, text, style).setOrigin(0.5);
  scene.tweens.add({
    targets: txt,
    y: y - riseDistance,
    alpha: 0,
    duration,
    ease: 'Power2',
    onComplete: () => txt.destroy(),
  });
  return txt;
}

/** Create a pulsing overlay rectangle (for atmosphere). */
export function createPulsingOverlay(
  scene: Phaser.Scene,
  width: number, height: number,
  color = 0x440000,
  startAlpha = 0.3,
  endAlpha = 0.05,
  duration = 1500,
): Phaser.GameObjects.Rectangle {
  const overlay = scene.add.rectangle(width / 2, height / 2, width, height, color, startAlpha);
  overlay.setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: overlay,
    alpha: endAlpha,
    duration,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
  return overlay;
}

/** Spawn a floating neon particle that drifts upward and respawns. */
export function spawnFloatingParticle(
  scene: Phaser.Scene,
  sceneWidth: number,
  sceneHeight: number,
  colors: readonly number[],
): void {
  const color = colors[Phaser.Math.Between(0, colors.length - 1)];
  const size = Phaser.Math.Between(2, 8);
  const x = Phaser.Math.Between(0, sceneWidth);
  const y = Phaser.Math.Between(0, sceneHeight);

  const particle = scene.add.circle(x, y, size, color, 0.6);
  particle.setBlendMode(Phaser.BlendModes.ADD);

  scene.tweens.add({
    targets: particle,
    x: x + Phaser.Math.Between(-100, 100),
    y: y + Phaser.Math.Between(-150, -50),
    alpha: 0,
    duration: Phaser.Math.Between(3000, 7000),
    ease: 'Sine.easeIn',
    onComplete: () => {
      particle.destroy();
      spawnFloatingParticle(scene, sceneWidth, sceneHeight, colors);
    },
  });
}
