import Phaser from 'phaser';
import { DEPTH } from '../config/constants';

/** Default neon color palette used across menu and multiplayer scenes. */
export const NEON_COLORS = [0xff00ff, 0x00ffff, 0xff6600, 0x00ff66, 0xffff00, 0xff0088, 0x8800ff];

/** Warm/cool palette for floating point lights. */
const LIGHT_COLORS = [0xfff0dd, 0xff6644, 0x44aaff, 0xaa66ff, 0xff44aa];

/**
 * Spawn a single floating neon particle that drifts upward and fades out,
 * then respawns automatically to keep a constant particle count.
 */
export function spawnFloatingParticle(
  scene: Phaser.Scene,
  sceneWidth: number,
  sceneHeight: number,
  colors: readonly number[] = NEON_COLORS,
): void {
  const color = Phaser.Utils.Array.GetRandom(colors as number[]);
  const size = Phaser.Math.Between(2, 8);
  const x = Phaser.Math.Between(0, sceneWidth);
  const y = Phaser.Math.Between(0, sceneHeight);

  const particle = scene.add.circle(x, y, size, color, 0.6);
  particle.setBlendMode(Phaser.BlendModes.ADD);

  const duration = Phaser.Math.Between(3000, 7000);
  const targetX = x + Phaser.Math.Between(-100, 100);
  const targetY = y + Phaser.Math.Between(-150, -50);

  scene.tweens.add({
    targets: particle,
    x: targetX,
    y: targetY,
    alpha: 0,
    duration,
    ease: 'Sine.easeIn',
    onComplete: () => {
      particle.destroy();
      spawnFloatingParticle(scene, sceneWidth, sceneHeight, colors);
    },
  });
}

/**
 * Spawn an initial batch of floating neon particles.
 *
 * @param count Number of particles to spawn immediately (they self-replenish).
 */
export function startFloatingParticles(
  scene: Phaser.Scene,
  width: number,
  height: number,
  count: number,
  colors: readonly number[] = NEON_COLORS,
): void {
  for (let i = 0; i < count; i++) {
    spawnFloatingParticle(scene, width, height, colors);
  }
}

/**
 * Full-scene background with lighting, dark overlay, color-cycling overlay,
 * and pulsing vignette. Used by menu, game-over, and multiplayer scenes.
 */
export interface SceneBackgroundOptions {
  /** Texture key for the background image. */
  textureKey: string;
  /** Darkness of the overlay rectangle (0–1). Default 0.55. */
  overlayAlpha?: number;
  /** Scroll speed in px/frame. Default 0.05. */
  scrollSpeed?: number;
  /** Base color for the color-cycling overlay. Default 0x8800aa. */
  cycleColorFrom?: number;
  /** Target color for the color-cycling overlay. Default 0xff0044. */
  cycleColorTo?: number;
  /** Lighting options forwarded to setupMenuLighting. */
  lighting?: MenuLightingOptions;
}

export interface SceneBackgroundResult {
  bg: Phaser.GameObjects.TileSprite;
  /** Override the scroll speed at runtime (e.g. for page-transition effects). */
  setScrollSpeed: (speed: number) => void;
}

export function createSceneBackground(
  scene: Phaser.Scene,
  opts: SceneBackgroundOptions,
): SceneBackgroundResult {
  const { width, height } = scene.cameras.main;
  const {
    textureKey,
    scrollSpeed = 0.05,
    overlayAlpha = 0.55,
    cycleColorFrom = 0x8800aa,
    cycleColorTo = 0xff0044,
    lighting,
  } = opts;

  // Scrolling background
  const bg = scene.add.tileSprite(0, 0, width, height, textureKey).setOrigin(0, 0).setTileScale(height / 1024);

  let currentSpeed = scrollSpeed;
  const setScrollSpeed = (speed: number): void => { currentSpeed = speed; };
  const scrollBg = (): void => { bg.tilePositionX += currentSpeed; };
  scene.events.on('update', scrollBg);
  scene.events.once('shutdown', () => scene.events.off('update', scrollBg));

  setupMenuLighting(scene, bg, lighting ?? { radiusMin: 400, radiusMax: 700, durationMin: 8000, durationMax: 14000 });

  // Dark overlay
  scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, overlayAlpha);

  // Color-cycling overlay
  const fromR = (cycleColorFrom >> 16) & 0xff;
  const fromG = (cycleColorFrom >> 8) & 0xff;
  const fromB = cycleColorFrom & 0xff;
  const toR = (cycleColorTo >> 16) & 0xff;
  const toB = cycleColorTo & 0xff;

  const colorOverlay = scene.add.rectangle(width / 2, height / 2, width, height, cycleColorFrom, 0.15);
  colorOverlay.setBlendMode(Phaser.BlendModes.ADD);

  scene.tweens.add({
    targets: colorOverlay,
    fillColor: { from: cycleColorFrom, to: cycleColorTo },
    duration: 3000,
    yoyo: true,
    repeat: -1,
    onUpdate: () => {
      const progress = Math.sin(scene.time.now * 0.001) * 0.5 + 0.5;
      const r = Math.floor(fromR + progress * (toR - fromR));
      const g = Math.floor(fromG + progress * 0);
      const b = Math.floor(fromB + progress * (toB - fromB));
      colorOverlay.setFillStyle((r << 16) | (g << 8) | b, 0.15);
    },
  });

  // Pulsing vignette
  const vignette = scene.add.graphics();
  vignette.setDepth(DEPTH.VIGNETTE_MENU);
  const drawVignette = (alpha: number): void => {
    vignette.clear();
    for (let i = 5; i >= 0; i--) {
      const ratio = i / 5;
      const a = alpha * ratio * ratio;
      vignette.fillStyle(0x000000, a);
      const inset = (1 - ratio) * 80;
      vignette.fillRect(0, 0, inset, height);
      vignette.fillRect(width - inset, 0, inset, height);
      vignette.fillRect(0, 0, width, inset);
      vignette.fillRect(0, height - inset, width, inset);
    }
  };
  drawVignette(0.6);

  const vignetteData = { alpha: 0.6 };
  scene.tweens.add({
    targets: vignetteData,
    alpha: 0.9,
    duration: 2000,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
    onUpdate: () => drawVignette(vignetteData.alpha),
  });

  return { bg, setScrollSpeed };
}

/**
 * Enable the Phaser lighting system, apply Light2D to a background sprite,
 * and spawn slowly drifting point lights that interact with the normal map.
 */
interface MenuLightingOptions {
  count?: number;
  colors?: readonly number[];
  radiusMin?: number;
  radiusMax?: number;
  durationMin?: number;
  durationMax?: number;
}

export function setupMenuLighting(
  scene: Phaser.Scene,
  bg: Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite,
  opts: MenuLightingOptions = {},
): void {
  const {
    count = 4,
    colors = LIGHT_COLORS,
    radiusMin = 200, radiusMax = 400,
    durationMin = 4000, durationMax = 8000,
  } = opts;
  const { width, height } = scene.cameras.main;

  scene.lights.enable().setAmbientColor(0x666666);
  (bg as unknown as Phaser.GameObjects.Components.Pipeline).setPipeline('Light2D');

  for (let i = 0; i < count; i++) {
    const color = Phaser.Utils.Array.GetRandom(colors as number[]);
    const x = Phaser.Math.Between(0, width);
    const y = Phaser.Math.Between(0, height);
    const radius = Phaser.Math.Between(radiusMin, radiusMax);
    const intensity = 1.0 + Math.random() * 0.8;

    const light = scene.lights.addLight(x, y, radius, color, intensity);

    const driftLight = (): void => {
      const tx = Phaser.Math.Between(0, width);
      const ty = Phaser.Math.Between(0, height);
      const dur = Phaser.Math.Between(durationMin, durationMax);

      scene.tweens.add({
        targets: light,
        x: tx,
        y: ty,
        intensity: 0.8 + Math.random() * 1.0,
        duration: dur,
        ease: 'Sine.easeInOut',
        onComplete: driftLight,
      });
    };
    driftLight();
  }
}
