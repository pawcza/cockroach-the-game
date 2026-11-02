/** After death in multiplayer: follows a living ghost and keeps the world moving with it. */
import Phaser from 'phaser';
import { GhostManager } from '../multiplayer/GhostManager';
import { GameHUD } from '../ui/GameHUD';
import { GameInput } from './GameInput';
import { GameOverHandler } from './GameOverHandler';
import { distanceAt, LevelProgression } from './LevelProgression';
import { comboMultiplier } from './RunState';

export class SpectateController {
  private scene: Phaser.Scene;
  private gameInput: GameInput;
  private levels: LevelProgression;
  private gameOverHandler: GameOverHandler;
  private hud: GameHUD;
  private updateWorld: () => void;

  constructor(
    scene: Phaser.Scene,
    gameInput: GameInput,
    levels: LevelProgression,
    gameOverHandler: GameOverHandler,
    hud: GameHUD,
    updateWorld: () => void,
  ) {
    this.scene = scene;
    this.gameInput = gameInput;
    this.levels = levels;
    this.gameOverHandler = gameOverHandler;
    this.hud = hud;
    this.updateWorld = updateWorld;
  }

  update(ghostManager: GhostManager): void {
    const target = ghostManager.spectateTargetPlayer;

    if (this.gameInput.spectatePreviousPressed()) {
      const newTarget = ghostManager.cycleSpectate(-1);
      if (newTarget) this.follow(newTarget.sprite);
    }
    if (this.gameInput.spectateNextPressed()) {
      const newTarget = ghostManager.cycleSpectate(1);
      if (newTarget) this.follow(newTarget.sprite);
    }

    // Level and milestones track the spectated player
    if (target && target.alive) {
      const ghostDistance = distanceAt(target.sprite.x);
      this.levels.update(ghostDistance);
      this.gameOverHandler.checkSpectatedMilestones(target.liveScore);
      this.hud.update({
        score: target.liveScore,
        distance: ghostDistance,
        speedMultiplier: target.speedMultiplier,
        currentFloor: target.lane as 'top' | 'bottom',
        pickupCombo: target.combo,
        comboMultiplier: comboMultiplier(target.combo),
        timeNow: this.scene.time.now,
      });
    }

    this.updateWorld();

    if (target && !target.alive) {
      const next = ghostManager.cycleSpectate(1);
      if (next) {
        this.follow(next.sprite);
      } else if (ghostManager.allDead()) {
        this.gameOverHandler.triggerMultiplayerGameOver();
      }
    }
  }

  follow(sprite: Phaser.GameObjects.Sprite): void {
    const camera = this.scene.cameras.main;
    camera.stopFollow();
    camera.scrollX = sprite.x - 200;
    camera.startFollow(sprite, true, 1, 0);
    camera.setFollowOffset(-200, 0);
  }
}
