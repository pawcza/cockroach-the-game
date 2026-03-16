import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { MultiplayerMenuScene } from './scenes/MultiplayerMenuScene';
import { LobbyScene } from './scenes/LobbyScene';
import { GameScene } from './scenes/GameScene';
import { MultiplayerGameOverScene } from './scenes/MultiplayerGameOverScene';
import { GameOverScene } from './scenes/GameOverScene';

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
  scene: [BootScene, MenuScene, MultiplayerMenuScene, LobbyScene, GameScene, MultiplayerGameOverScene, GameOverScene],
  scale: {
    mode: Phaser.Scale.EXPAND,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

document.fonts.ready.then(() => {
  const game = new Phaser.Game(config);

  let lastWidth = window.innerWidth;
  let lastHeight = window.innerHeight;

  const handleResize = (): void => {
    setTimeout(() => {
      game.scale.resize(window.innerWidth, window.innerHeight);
      game.scale.refresh();
    }, 200);
  };

  const handleOrientationChange = (): void => {
    setTimeout(() => {
      game.scale.resize(window.innerWidth, window.innerHeight);
      game.scale.refresh();
      // Only restart scene on actual orientation change (width/height swap)
      const widthChanged = Math.abs(window.innerWidth - lastWidth) > 100;
      const heightChanged = Math.abs(window.innerHeight - lastHeight) > 100;
      lastWidth = window.innerWidth;
      lastHeight = window.innerHeight;
      if (widthChanged && heightChanged) {
        const activeScene = game.scene.getScenes(true)[0];
        if (activeScene) activeScene.scene.restart();
      }
    }, 200);
  };

  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', handleOrientationChange);
  screen.orientation?.addEventListener('change', handleOrientationChange);
});
