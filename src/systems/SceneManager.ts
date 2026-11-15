import Phaser from 'phaser';
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
/** A waiting goto looks for the scene that has come up this often, this many times, before giving up. */
const QUEUED_RETRY_MS = 100;
const QUEUED_TRIES = 20;

class SceneManagerSingleton {
  private currentBgmKey: string | null = null;
  private currentBgm: Phaser.Sound.BaseSound | null = null;
  /** A goto is fading out: the screen is already on its way, so a second press (a double tap, a held Enter) is ignored. */
  private going = false;
  /** Where that goto leads. */
  private target: string | null = null;
  /**
   * A goto somewhere else that arrived meanwhile (a dropped connection sending everyone to the menu while a run was
   * fading in): it is not a repeated press, so it is kept and taken once the first has landed. The latest wins.
   */
  private queued: { game: Phaser.Game; targetKey: string; data?: Record<string, unknown>; before?: () => void } | null = null;

  /** Transition to a new scene with crossfade, auto-managing BGM. */
  goto(
    fromScene: Phaser.Scene,
    targetKey: string,
    data?: Record<string, unknown>,
    beforeTransition?: () => void,
  ): void {
    if (this.going) {
      if (targetKey !== this.target) this.queued = { game: fromScene.game, targetKey, data, before: beforeTransition };
      return;
    }
    this.going = true;
    this.target = targetKey;
    crossfadeTransition(FADE_DURATION, () => {
      try {
        beforeTransition?.();
        this.handleBGM(fromScene, targetKey);
        fromScene.scene.start(targetKey, data);
      } finally {
        // The scene manager takes the start on its next step: from then the new scene is the one that is pressed
        let freed = false;
        const free = (): void => {
          if (freed) return;
          freed = true;
          this.going = false;
          this.target = null;
          this.takeQueued(0);
        };
        fromScene.game.events.once(Phaser.Core.Events.POST_STEP, free);
        window.setTimeout(free, FADE_DURATION);
      }
    });
  }

  /** Goes where a goto that had to wait asked, from whichever scene is up by now; that scene may need a moment to be. */
  private takeQueued(tries: number): void {
    const queued = this.queued;
    if (!queued || this.going) return;
    const from = queued.game.scene.getScenes(true).find(scene => scene.sys.settings.visible !== false);
    if (!from) {
      if (tries < QUEUED_TRIES) window.setTimeout(() => this.takeQueued(tries + 1), QUEUED_RETRY_MS);
      else this.queued = null;
      return;
    }
    this.queued = null;
    if (from.scene.key !== queued.targetKey) this.goto(from, queued.targetKey, queued.data, queued.before);
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
