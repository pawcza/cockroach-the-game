/** Applies score and combo changes to the run, with their HUD, audio and visual feedback. */
import Phaser from 'phaser';
import { AudioManager } from '../audio/AudioManager';
import { VisualEffects } from '../effects/VisualEffects';
import { GameHUD } from '../ui/GameHUD';
import { ComboFeedback } from './ComboFeedback';
import { RunState } from './RunState';

export class ScoreTracker {
  private scene: Phaser.Scene;
  private run: RunState;
  private hud: GameHUD;
  private comboFeedback: ComboFeedback;
  private audio: AudioManager;
  private vfx: VisualEffects;

  constructor(
    scene: Phaser.Scene,
    run: RunState,
    hud: GameHUD,
    comboFeedback: ComboFeedback,
    audio: AudioManager,
    vfx: VisualEffects,
  ) {
    this.scene = scene;
    this.run = run;
    this.hud = hud;
    this.comboFeedback = comboFeedback;
    this.audio = audio;
    this.vfx = vfx;
  }

  addScore(points: number): void {
    this.run.score += points;
    this.hud.updateScore(this.run.score);
  }

  incrementCombo(): void {
    this.run.pickupCombo++;
    if (this.run.pickupCombo > this.run.maxCombo) this.run.maxCombo = this.run.pickupCombo;
    const tier = this.comboFeedback.onPickup(this.run.pickupCombo);
    if (tier) {
      this.audio.playComboChime(tier.audioTier);
      this.vfx.comboTierFlash(tier.color);
    }
  }

  loseCombo(comboLost: number): void {
    this.vfx.comboLostEffect(comboLost);
    this.audio.playComboLost();
    this.run.pickupCombo = 0;
    this.comboFeedback.onComboLost();
  }

  /** +1 point per second survived. */
  tickSurvival(): void {
    if (this.scene.time.now - this.run.lastScoreTime >= 1000) {
      this.run.score += 1;
      this.run.lastScoreTime = this.scene.time.now;
    }
  }
}
