import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
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
  scene: [BootScene, MenuScene, GameScene, GameOverScene],
  scale: {
    mode: /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      ? Phaser.Scale.EXPAND
      : Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

document.fonts.ready.then(() => {
  const game = new Phaser.Game(config);

  if (isMobile) {
    // Force Phaser to recalculate on orientation change
    const handleResize = (): void => {
      // Small delay to let the browser settle the new dimensions
      setTimeout(() => {
        game.scale.resize(window.innerWidth, window.innerHeight);
        game.scale.refresh();
        // Restart the active scene so it rebuilds with new dimensions
        const activeScene = game.scene.getScenes(true)[0];
        if (activeScene) {
          activeScene.scene.restart();
        }
      }, 200);
    };

    window.addEventListener('orientationchange', handleResize);
    screen.orientation?.addEventListener('change', handleResize);

    // Request fullscreen on first tap (browsers require user gesture)
    const requestFS = (): void => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
      document.removeEventListener('pointerdown', requestFS);
    };
    document.addEventListener('pointerdown', requestFS);
  }
});
