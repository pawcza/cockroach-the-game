import Phaser from 'phaser';
import { Player } from '../objects/Player';
import { VisualEffects } from '../effects/VisualEffects';
import { AudioManager } from '../audio/AudioManager';
import { GhostManager } from '../multiplayer/GhostManager';
import { mpClient } from '../multiplayer/MultiplayerClient';

export class GameOverHandler {
  private scene: Phaser.Scene;
  private player: Player;
  private vfx: VisualEffects;
  private audio: AudioManager;
  private isMultiplayer: boolean;

  private _mpGameOverTriggered = false;
  private deathNotificationY = 80;
  private mpMyName = '';

  // Callbacks to get game state
  private getScore: () => number;
  private getActivePlayTime: () => number;
  private getDistance: () => number;
  private getCurrentLevel: () => number;
  private getGhostManager: () => GhostManager | null;
  private setGhostManager: (gm: GhostManager | null) => void;

  get mpGameOverTriggered(): boolean { return this._mpGameOverTriggered; }

  constructor(
    scene: Phaser.Scene,
    player: Player,
    vfx: VisualEffects,
    audio: AudioManager,
    isMultiplayer: boolean,
    callbacks: {
      getScore: () => number;
      getActivePlayTime: () => number;
      getDistance: () => number;
      getCurrentLevel: () => number;
      getGhostManager: () => GhostManager | null;
      setGhostManager: (gm: GhostManager | null) => void;
    },
  ) {
    this.scene = scene;
    this.player = player;
    this.vfx = vfx;
    this.audio = audio;
    this.isMultiplayer = isMultiplayer;
    this.getScore = callbacks.getScore;
    this.getActivePlayTime = callbacks.getActivePlayTime;
    this.getDistance = callbacks.getDistance;
    this.getCurrentLevel = callbacks.getCurrentLevel;
    this.getGhostManager = callbacks.getGhostManager;
    this.setGhostManager = callbacks.setGhostManager;
    this.mpMyName = localStorage.getItem('cockroach-mp-name') || 'Karaluch';
  }

  reset(): void {
    this._mpGameOverTriggered = false;
    this.deathNotificationY = 80;
  }

  /** Handle death — returns true if the player just died, false if already dead. */
  die(setIsDead: () => void, obstacleType?: string | null): boolean {
    this.player.die();
    setIsDead();

    const score = this.getScore();
    document.title = `ZGNIOT\u0141E\u015a SI\u0118! | ${score} pkt`;
    this.scene.cameras.main.shake(300, 0.02);

    this.scene.sound.play('cockroach-hiss', { volume: 0.7 });

    this.vfx.deathEffect();
    this.audio.playDeath();

    // In multiplayer, start spectating instead of transitioning to GameOverScene
    if (this.isMultiplayer) {
      const stats = {
        timeSurvived: Math.floor(this.getActivePlayTime() / 1000),
        distance: Math.floor(this.getDistance()),
        maxSpeed: this.player.speedMultiplier,
        obstacleType: obstacleType || 'fall',
      };
      mpClient.sendDeath(score, stats);

      const ghostManager = this.getGhostManager();
      // Start spectating after death animation plays out
      if (ghostManager && !ghostManager.allDead()) {
        this.scene.cameras.main.stopFollow();
        this.scene.time.delayedCall(1000, () => {
          const gm = this.getGhostManager();
          if (gm && !gm.allDead()) {
            gm.startSpectating();
            // Snap camera to spectate target immediately
            const target = gm.spectateTargetPlayer;
            if (target && target.alive) {
              this.scene.cameras.main.scrollX = target.sprite.x - 200;
            }
          } else {
            this.triggerMultiplayerGameOver();
          }
        });
      } else {
        this.triggerMultiplayerGameOver();
      }
      return true; // Don't transition to solo GameOverScene
    }

    // Increment games played
    const gamesPlayed = parseInt(localStorage.getItem('cockroach-games-played') || '0', 10);
    localStorage.setItem('cockroach-games-played', (gamesPlayed + 1).toString());

    // Persist high score
    const highScore = parseInt(localStorage.getItem('cockroach-highscore') || '0', 10);
    if (score > highScore) {
      localStorage.setItem('cockroach-highscore', score.toString());
    }

    this.scene.time.delayedCall(250, () => {
      this.vfx.destroy();
      this.audio.destroy();
      this.scene.scene.start('GameOverScene', {
        score,
        timeSurvived: Math.floor(this.getActivePlayTime() / 1000),
        topSpeed: this.player.speedMultiplier,
        distance: this.getDistance(),
        obstacleType: obstacleType || null,
        level: this.getCurrentLevel(),
      });
    });

    return true;
  }

  triggerMultiplayerGameOver(): void {
    // Server detects all-dead and emits game:over with rankings.
    // As a safety net, if game:over doesn't arrive within 3s,
    // build local rankings and transition anyway.
    if (this._mpGameOverTriggered) return;
    this.scene.time.delayedCall(3000, () => {
      if (this._mpGameOverTriggered) return;
      this._mpGameOverTriggered = true;
      const ghostManager = this.getGhostManager();
      const rankings = ghostManager?.getRankings(
        this.getScore(),
        this.mpMyName,
        {
          timeSurvived: Math.floor(this.getActivePlayTime() / 1000),
          distance: Math.floor(this.getDistance()),
          maxSpeed: this.player.speedMultiplier,
        },
      ) ?? [];
      this.audio.destroy();
      this.scene.sound.stopAll();
      ghostManager?.destroy();
      this.setGhostManager(null);
      this.scene.scene.start('MultiplayerGameOverScene', {
        rankings,
        myId: mpClient.myId,
        isHost: false,
      });
    });
  }

  showDeathNotification(name: string, color: number, disconnected = false): void {
    const cam = this.scene.cameras.main;
    const colorStr = '#' + color.toString(16).padStart(6, '0');
    const label = disconnected ? `${name} uciek\u0142` : `${name} zgin\u0105\u0142!`;

    const text = this.scene.add.text(cam.width / 2, this.deathNotificationY, label, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '10px',
      color: colorStr,
      stroke: '#000000',
      strokeThickness: 3,
    });
    text.setOrigin(0.5, 0);
    text.setScrollFactor(0);
    text.setDepth(4000);
    text.setAlpha(0);

    this.deathNotificationY += 20;

    this.scene.tweens.add({
      targets: text,
      alpha: 1,
      duration: 200,
      ease: 'Power2',
      onComplete: () => {
        this.scene.tweens.add({
          targets: text,
          alpha: 0,
          y: text.y - 15,
          delay: 2000,
          duration: 500,
          ease: 'Power2',
          onComplete: () => {
            text.destroy();
            this.deathNotificationY = Math.max(80, this.deathNotificationY - 20);
          },
        });
      },
    });
  }

  /** Set up multiplayer event listeners for game:over and game:death. */
  setupMultiplayerListeners(
    onSetIsDead: () => boolean,
  ): void {
    this._mpGameOverTriggered = false;

    mpClient.on('game:death', (data: any) => {
      const ghostManager = this.getGhostManager();
      const name = ghostManager?.getGhostName(data.id);
      const color = ghostManager?.getGhostColor(data.id);
      ghostManager?.handleDeath(data.id, data.score, data.stats);
      if (name) {
        this.showDeathNotification(name, color ?? 0xffffff);
      }
      // If I'm spectating and all ghosts are now dead, trigger game over
      if (onSetIsDead() && ghostManager?.allDead()) {
        this.triggerMultiplayerGameOver();
      }
    });

    // Handle player disconnect mid-game — kill their ghost
    mpClient.on('game:player-left', (data: any) => {
      const ghostManager = this.getGhostManager();
      const name = ghostManager?.getGhostName(data.id);
      const color = ghostManager?.getGhostColor(data.id);
      ghostManager?.handleDeath(data.id, 0, {});
      if (name) {
        this.showDeathNotification(name, color ?? 0xffffff, true);
      }
      if (onSetIsDead() && ghostManager?.allDead()) {
        this.triggerMultiplayerGameOver();
      }
    });

    mpClient.on('game:over', (data: any) => {
      if (this._mpGameOverTriggered) return;
      this._mpGameOverTriggered = true;
      // Wait for the last death animation to finish before transitioning
      this.scene.time.delayedCall(1200, () => {
        this.audio.destroy();
        this.scene.sound.stopAll();
        const ghostManager = this.getGhostManager();
        ghostManager?.destroy();
        this.setGhostManager(null);
        this.scene.scene.start('MultiplayerGameOverScene', {
          rankings: data.rankings,
          myId: mpClient.myId,
          isHost: data.hostId === mpClient.myId,
        });
      });
    });
  }
}
