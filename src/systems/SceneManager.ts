import { crossfadeTransition } from '../utils/SceneTransition';
import { getMusicVolume } from '../utils/Storage';

/** BGM config per scene — scenes sharing the same BGM key keep it playing across transitions. */
const SCENE_BGM: Record<string, string | null> = {
  MenuScene: 'menu-bgm',
  MultiplayerMenuScene: 'menu-bgm',
  LobbyScene: 'menu-bgm',
  GameScene: null,           // manages its own level BGMs via AudioManager
  GameOverScene: 'gameover-bgm',
  MultiplayerGameOverScene: null, // no dedicated BGM
};

const BGM_VOLUME: Record<string, number> = {
  'menu-bgm': 0.3,
  'gameover-bgm': 0.3,
};

const FADE_DURATION = 500;

class SceneManagerSingleton {
  private currentBgmKey: string | null = null;
  private currentBgm: Phaser.Sound.BaseSound | null = null;

  /** Transition to a new scene with crossfade, auto-managing BGM. */
  goto(
    fromScene: Phaser.Scene,
    targetKey: string,
    data?: Record<string, unknown>,
    beforeTransition?: () => void,
  ): void {
    crossfadeTransition(FADE_DURATION, () => {
      beforeTransition?.();
      this.handleBGM(fromScene, targetKey);
      fromScene.scene.start(targetKey, data);
    });
  }

  /** Starts a scene with no fade, for a hand-off that something else already covers (the boot's loading screen). */
  enter(fromScene: Phaser.Scene, targetKey: string, data?: Record<string, unknown>): void {
    this.handleBGM(fromScene, targetKey);
    fromScene.scene.start(targetKey, data);
  }

  private handleBGM(scene: Phaser.Scene, targetKey: string): void {
    const targetBgm = SCENE_BGM[targetKey] ?? null;

    // Same BGM — keep playing
    if (targetBgm === this.currentBgmKey && this.currentBgm?.isPlaying) {
      return;
    }

    // Stop current BGM
    if (this.currentBgm) {
      this.currentBgm.stop();
      this.currentBgm.destroy();
      this.currentBgm = null;
      this.currentBgmKey = null;
    }

    // Start new BGM if target scene has one
    if (targetBgm) {
      const volume = (BGM_VOLUME[targetBgm] ?? 0.3) * getMusicVolume();
      this.currentBgm = scene.sound.add(targetBgm, { volume, loop: true });
      this.currentBgm.play();
      this.currentBgmKey = targetBgm;
    }
  }
}

export const sceneManager = new SceneManagerSingleton();
