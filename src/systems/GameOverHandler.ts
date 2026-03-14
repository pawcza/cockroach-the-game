import Phaser from 'phaser';
import { COCKROACH_START_X, DEPTH } from '../config/constants';
import { smallStyle } from '../utils/TextStyles';
import { Player } from '../objects/Player';
import { VisualEffects } from '../effects/VisualEffects';
import { AudioManager } from '../audio/AudioManager';
import { GhostManager } from '../multiplayer/GhostManager';
import { mpClient } from '../multiplayer/MultiplayerClient';
import { crossfadeTransition } from '../utils/SceneTransition';
import { GameHUD } from '../ui/GameHUD';
import { getPlayerNameOrDefault, updateHighScoreIfBetter, incrementGamesPlayed } from '../utils/Storage';

const SCORE_MILESTONES = [
  { threshold: 100, text: 'SETUNIA MMMMMMM', tier: 1 },
  { threshold: 250, text: 'MAŁPECZKA Z ŻABKI', tier: 1 },
  { threshold: 420, text: 'BLAZE IT!', tier: 2 },
  { threshold: 500, text: 'PIĘĆ DYCH NA BROWARA!', tier: 2 },
  { threshold: 1000, text: 'GRAJ ZE MNOM W TYSIĄCA', tier: 3 },
  { threshold: 1500, text: 'MIÓD PITNY PÓŁTORAK', tier: 3 },
  { threshold: 2000, text: 'DWIE BAŃKI, BOSSMAN!', tier: 4 },
  { threshold: 2137, text: 'KREMÓWKI DLA WSZYSTKICH', tier: 4 },
  { threshold: 3000, text: 'TRZY KOŁA NA LICZNIKU', tier: 4 },
  { threshold: 4000, text: 'CZTERY OSIEMNASTKI TYLKO W MOIM SAMOCHODZIE', tier: 5 },
  { threshold: 4200, text: 'SNOOP DOGGY DOGG', tier: 5 },
  { threshold: 5000, text: 'GDZIE KARALUCHY ZIMUJOM', tier: 5 },
  { threshold: 10000, text: 'KARALUCH JEST BOGIEM!', tier: 5 },
] as const;

export class GameOverHandler {
  private scene: Phaser.Scene;
  private player: Player;
  private vfx: VisualEffects;
  private audio: AudioManager;
  private hud: GameHUD;
  private isMultiplayer: boolean;

  private _mpGameOverTriggered = false;
  private deathNotificationY = 80;
  private mpMyName: string;
  private lastMilestone = 0;
  private lastSpectatedMilestone = 0;

  private getScore: () => number;
  private getActivePlayTime: () => number;
  private getDistance: () => number;
  private getCurrentLevel: () => number;
  private getPickupCounts: () => { apples: number; tyskies: number; pills: number };
  private getMaxCombo: () => number;
  private getGhostManager: () => GhostManager | null;
  private setGhostManager: (gm: GhostManager | null) => void;
  private setIsDead: () => void;
  private followSpectateTarget: (sprite: Phaser.GameObjects.Sprite) => void;

  get mpGameOverTriggered(): boolean { return this._mpGameOverTriggered; }

  constructor(
    scene: Phaser.Scene,
    player: Player,
    vfx: VisualEffects,
    audio: AudioManager,
    hud: GameHUD,
    isMultiplayer: boolean,
    callbacks: {
      getScore: () => number;
      getActivePlayTime: () => number;
      getDistance: () => number;
      getCurrentLevel: () => number;
      getPickupCounts: () => { apples: number; tyskies: number; pills: number };
      getMaxCombo: () => number;
      getGhostManager: () => GhostManager | null;
      setGhostManager: (gm: GhostManager | null) => void;
      setIsDead: () => void;
      followSpectateTarget: (sprite: Phaser.GameObjects.Sprite) => void;
    },
  ) {
    this.scene = scene;
    this.player = player;
    this.vfx = vfx;
    this.audio = audio;
    this.hud = hud;
    this.isMultiplayer = isMultiplayer;
    this.getScore = callbacks.getScore;
    this.getActivePlayTime = callbacks.getActivePlayTime;
    this.getDistance = callbacks.getDistance;
    this.getCurrentLevel = callbacks.getCurrentLevel;
    this.getPickupCounts = callbacks.getPickupCounts;
    this.getMaxCombo = callbacks.getMaxCombo;
    this.getGhostManager = callbacks.getGhostManager;
    this.setGhostManager = callbacks.setGhostManager;
    this.setIsDead = callbacks.setIsDead;
    this.followSpectateTarget = callbacks.followSpectateTarget;
    this.mpMyName = getPlayerNameOrDefault();
  }

  reset(): void {
    this._mpGameOverTriggered = false;
    this.deathNotificationY = 80;
    this.lastMilestone = 0;
    this.lastSpectatedMilestone = 0;
  }

  die(obstacleType?: string | null): void {
    if (this.player.isDead) return;
    this.setIsDead();
    this.player.die();

    const score = this.getScore();
    document.title = `ZGNIOTŁEŚ SIĘ! | ${score} pkt`;
    this.scene.cameras.main.shake(300, 0.02);

    this.scene.sound.play('cockroach-hiss', { volume: 0.7 });

    this.vfx.deathEffect();
    this.audio.playDeath();

    if (this.isMultiplayer) {
      const pickups = this.getPickupCounts();
      const stats = {
        timeSurvived: Math.floor(this.getActivePlayTime() / 1000),
        distance: Math.floor(this.getDistance()),
        maxSpeed: this.player.speedMultiplier,
        obstacleType: obstacleType || 'fall',
        applesCollected: pickups.apples,
        tyskiesCollected: pickups.tyskies,
        pillsCollected: pickups.pills,
        maxCombo: this.getMaxCombo(),
        maxLevel: this.getCurrentLevel(),
      };
      mpClient.sendDeath(score, stats);

      const ghostManager = this.getGhostManager();
      if (ghostManager && !ghostManager.allDead()) {
        this.scene.cameras.main.stopFollow();
        this.scene.time.delayedCall(1000, () => {
          const gm = this.getGhostManager();
          if (gm && !gm.allDead()) {
            gm.startSpectating();
            const target = gm.spectateTargetPlayer;
            if (target && target.alive) {
              this.followSpectateTarget(target.sprite);
            }
          } else {
            this.triggerMultiplayerGameOver();
          }
        });
      } else {
        this.triggerMultiplayerGameOver();
      }
      return;
    }

    // Solo mode
    incrementGamesPlayed();
    updateHighScoreIfBetter(score);

    // Use real-time timeout — Phaser's delayedCall is slowed by deathEffect's timeScale (0.3)
    window.setTimeout(() => {
      crossfadeTransition(500, () => {
        this.vfx.destroy();
        this.audio.destroy();
        this.scene.scene.start('GameOverScene', {
          score,
          timeSurvived: Math.floor(this.getActivePlayTime() / 1000),
          topSpeed: this.player.speedMultiplier,
          distance: this.getDistance(),
          obstacleType: obstacleType || null,
          level: this.getCurrentLevel(),
          maxCombo: this.getMaxCombo(),
          pickupCounts: this.getPickupCounts(),
        });
      });
    }, 1000);
  }

  triggerMultiplayerGameOver(): void {
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
    const label = disconnected ? `${name} uciekł` : `${name} zginął!`;

    const text = this.scene.add.text(cam.width / 2, this.deathNotificationY, label,
      smallStyle({ color: colorStr }),
    );
    text.setOrigin(0.5, 0);
    text.setScrollFactor(0);
    text.setDepth(DEPTH.DEATH_NOTIFICATION);
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

  checkMilestones(score: number): void {
    for (const m of SCORE_MILESTONES) {
      if (score >= m.threshold && this.lastMilestone < m.threshold) {
        this.lastMilestone = m.threshold;
        this.hud.showScoreMilestone(m.text, m.tier, m.threshold);
        const key = `milestone-${m.threshold}`;
        if (this.scene.sound.get(key) || this.scene.cache.audio.exists(key)) {
          this.scene.sound.play(key, { volume: 0.7 });
        }
        break;
      }
    }
  }

  checkSpectatedMilestones(ghostScore: number): void {
    for (const m of SCORE_MILESTONES) {
      if (ghostScore >= m.threshold && this.lastSpectatedMilestone < m.threshold) {
        this.lastSpectatedMilestone = m.threshold;
        this.hud.showScoreMilestone(m.text, m.tier, m.threshold);
        const key = `milestone-${m.threshold}`;
        if (this.scene.sound.get(key) || this.scene.cache.audio.exists(key)) {
          this.scene.sound.play(key, { volume: 0.7 });
        }
        break;
      }
    }
  }

  setupMultiplayerListeners(isDead: () => boolean): void {
    this._mpGameOverTriggered = false;

    mpClient.on('game:death', (data: any) => {
      const ghostManager = this.getGhostManager();
      const name = ghostManager?.getGhostName(data.id);
      const color = ghostManager?.getGhostColor(data.id);
      ghostManager?.handleDeath(data.id, data.score, data.stats);
      if (name) {
        this.showDeathNotification(name, color ?? 0xffffff);
      }
      if (isDead() && ghostManager?.allDead()) {
        this.triggerMultiplayerGameOver();
      }
    });

    mpClient.on('game:player-left', (data: any) => {
      const ghostManager = this.getGhostManager();
      const name = ghostManager?.getGhostName(data.id);
      const color = ghostManager?.getGhostColor(data.id);
      ghostManager?.handleDeath(data.id, 0, {});
      if (name) {
        this.showDeathNotification(name, color ?? 0xffffff, true);
      }
      if (isDead() && ghostManager?.allDead()) {
        this.triggerMultiplayerGameOver();
      }
    });

    mpClient.on('game:over', (data: any) => {
      if (this._mpGameOverTriggered) return;
      this._mpGameOverTriggered = true;
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
