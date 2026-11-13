/** Applies score and combo changes to the run, with their HUD, audio and visual feedback. */
import Phaser from 'phaser';
import { AudioManager, VOL } from '../audio/AudioManager';
import { VisualEffects } from '../effects/VisualEffects';
import { GameHUD } from '../ui/GameHUD';
import { ComboFeedback } from './ComboFeedback';
import { comboMultiplier, RunState } from './RunState';

/** Losing a combo this long shatters it: the bigger sound. */
const BIG_COMBO = 10;

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
    if (tier) this.vfx.comboTierUp();
    this.vfx.setCombo(this.run.pickupCombo);
    this.audio.playComboTick(this.run.pickupCombo);
    // On each whole step of the multiplier (x2, x3...), where the flames and the notices are: a tick every tenth was
    // every fourth pickup, constant noise
    if (Math.floor(comboMultiplier(this.run.pickupCombo)) !== Math.floor(comboMultiplier(this.run.pickupCombo - 1))) {
      this.audio.playSfx('mult-up', VOL.stinger);
    }
  }

  loseCombo(comboLost: number): void {
    this.vfx.comboLostEffect(comboLost);
    this.audio.playComboLost(comboLost >= BIG_COMBO);
    this.run.pickupCombo = 0;
    this.comboFeedback.onComboLost();
    this.vfx.setCombo(0);
  }

  /** The combo starts over without a word: the tutorial's apples are gone when the real run starts. */
  clearCombo(): void {
    this.run.pickupCombo = 0;
    this.comboFeedback.onComboLost();
    this.vfx.setCombo(0);
    this.hud.updateScore(this.run.score);
  }

  /** +1 point per second survived. */
  tickSurvival(): void {
    if (this.scene.time.now - this.run.lastScoreTime >= 1000) {
      this.run.score += 1;
      this.run.lastScoreTime = this.scene.time.now;
    }
  }
}
