import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { MultiplayerMenuScene } from './scenes/MultiplayerMenuScene';
import { LobbyScene } from './scenes/LobbyScene';
import { GameScene } from './scenes/GameScene';
import { DeferredLoadScene, DEFERRED_LOAD_SCENE } from './scenes/DeferredLoadScene';
import { MultiplayerGameOverScene } from './scenes/MultiplayerGameOverScene';
import { GameOverScene } from './scenes/GameOverScene';
import { initialWidth, startViewportFit } from './viewportFit';
import { PixelGridFX } from './pixel/PixelGridFX';
import { PixelCameras } from './pixel/PixelCameras';
import { installTapSparkle } from './ui/TapSparkle';

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

// Canvas text draws with whatever is loaded at that moment: the font, Polish letters included, before the game
const FONT_READY = document.fonts.load('16px "Tiny5"', 'Aaąę').catch(() => []);

FONT_READY.then(() => document.fonts.ready).then(() => {
  const game = new Phaser.Game({ ...config, width: initialWidth() });
  installTapSparkle(game, ['BootScene', 'GameScene', DEFERRED_LOAD_SCENE]);
  // Fitted to what can be seen, and every page but a run built again whenever the width it is shown at changes
  startViewportFit(game, {
    runScene: 'GameScene',
    skip: ['BootScene', DEFERRED_LOAD_SCENE],
    onOrientationFlip: (scene) => { if (scene instanceof GameScene) scene.pauseIfRunning(); },
  });
  if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
});
