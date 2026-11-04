import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { MultiplayerMenuScene } from './scenes/MultiplayerMenuScene';
import { LobbyScene } from './scenes/LobbyScene';
import { GameScene } from './scenes/GameScene';
import { DeferredLoadScene, DEFERRED_LOAD_SCENE } from './scenes/DeferredLoadScene';
import { MultiplayerGameOverScene } from './scenes/MultiplayerGameOverScene';
import { GameOverScene } from './scenes/GameOverScene';
import { GAME_HEIGHT, PIXEL_BLOCK } from './config/constants';
import { PixelGridFX } from './pixel/PixelGridFX';
import { PixelCameras } from './pixel/PixelCameras';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 512,
  backgroundColor: '#1a0a2e',
  pixelArt: true,
  antialias: false,
  input: {
    touch: true,
    activePointers: 3,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 800 },
      debug: false,
    },
  },
  pipeline: { PixelGridFX } as unknown as Phaser.Types.Core.PipelineConfig,
  plugins: {
    scene: [{ key: 'PixelCameras', plugin: PixelCameras, mapping: 'pixelCameras' }],
  },
  scene: [BootScene, MenuScene, MultiplayerMenuScene, LobbyScene, GameScene, MultiplayerGameOverScene, GameOverScene, DeferredLoadScene],
  scale: {
    mode: Phaser.Scale.NONE,
    // The page centres the canvas (body is a flexbox); Phaser's margins on top of that pushed a letterboxed one off-centre
    autoCenter: Phaser.Scale.NO_CENTER,
  },
};

/**
 * The world is GAME_HEIGHT logical px tall; each native pixel (PIXEL_BLOCK logical px) becomes a whole number
 * of device pixels, as many as fit the window's height. The width fills the window. A window too short for
 * that to fill most of it falls back to an exact fit, where native pixels differ by at most one device pixel.
 */
/** 4:3: the narrowest screen every page is laid out for. */
const MIN_WIDTH = Math.ceil((GAME_HEIGHT * 4) / 3);

const fit = (game: Phaser.Game): void => {
  const dpr = window.devicePixelRatio || 1;
  const nativeRows = GAME_HEIGHT / PIXEL_BLOCK;
  const perNative = Math.max(1, Math.floor((window.innerHeight * dpr) / nativeRows));
  let zoom = (perNative / PIXEL_BLOCK) / dpr; // CSS px per logical px
  if (GAME_HEIGHT * zoom < window.innerHeight * 0.8) zoom = window.innerHeight / GAME_HEIGHT;
  // Narrower than 4:3 (a phone held upright) the menus would be cut off: fit the width instead, bars above and below
  if (window.innerWidth / zoom < MIN_WIDTH) zoom = window.innerWidth / MIN_WIDTH;
  game.scale.resize(Math.max(MIN_WIDTH, Math.ceil(window.innerWidth / zoom)), GAME_HEIGHT);
  game.scale.setZoom(zoom);
};

// Canvas text draws with whatever is loaded at that moment: the font, Polish letters included, before the game
const FONT_READY = document.fonts.load('16px "Tiny5"', 'Aaąę').catch(() => []);

FONT_READY.then(() => document.fonts.ready).then(() => {
  const game = new Phaser.Game({ ...config, width: Math.max(MIN_WIDTH, Math.ceil(window.innerWidth / (window.innerHeight / GAME_HEIGHT))) });
  fit(game);
  if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;

  let lastWidth = window.innerWidth;
  let lastHeight = window.innerHeight;

  const handleResize = (): void => {
    setTimeout(() => {
      fit(game);
    }, 200);
  };

  const handleOrientationChange = (): void => {
    setTimeout(() => {
      fit(game);
      // Only restart scene on actual orientation change (width/height swap)
      const widthChanged = Math.abs(window.innerWidth - lastWidth) > 100;
      const heightChanged = Math.abs(window.innerHeight - lastHeight) > 100;
      lastWidth = window.innerWidth;
      lastHeight = window.innerHeight;
      if (widthChanged && heightChanged) {
        const activeScene = game.scene.getScenes(true).find((s) => s.scene.key !== DEFERRED_LOAD_SCENE);
        // A run survives rotation: GameScene lays itself out again from the resize, the others are rebuilt
        if (activeScene instanceof GameScene) activeScene.pauseIfRunning();
        else activeScene?.scene.restart();
      }
    }, 200);
  };

  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', handleOrientationChange);
  screen.orientation?.addEventListener('change', handleOrientationChange);
});
