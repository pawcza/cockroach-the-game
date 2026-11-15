/** Applies score and combo changes to the run, with their HUD, audio and visual feedback. */
import Phaser from 'phaser';
import { AudioManager, VOL } from '../audio/AudioManager';
import { VisualEffects } from '../effects/VisualEffects';
import { GameHUD } from '../ui/GameHUD';
import { ComboFeedback } from './ComboFeedback';
import { comboAfterMiss, ComboDrops, comboMultiplier, RunState } from './RunState';

/** A miss that takes this much off the combo shatters it: the bigger sound. */
const BIG_COMBO = 10;

export class ScoreTracker {
  private scene: Phaser.Scene;
  private run: RunState;
  private hud: GameHUD;
  private comboFeedback: ComboFeedback;
  private audio: AudioManager;
  private vfx: VisualEffects;
  private drops = new ComboDrops();

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

  /**
   * A pickup went by: the combo halves, rounded down (comboAfterMiss). The loss is marked as one beat (ComboDrops): a
   * slab with its shake and sting for a real drop (a big sting from BIG_COMBO lost), the same slab's number growing for
   * drops that follow while it is up, nothing for a small one. The flames and the notices fall back to the tier of what
   * is left. Returns how much was lost.
   */
  dropCombo(): number {
    const before = this.run.pickupCombo;
    const after = comboAfterMiss(before);
    const lost = before - after;
    this.run.pickupCombo = after;
    const beat = this.drops.drop(lost, this.scene.time.now);
    if (beat.kind === 'slab') {
      this.vfx.comboLostEffect(beat.lost);
      this.audio.playComboLost(beat.lost >= BIG_COMBO);
    } else if (beat.kind === 'update') {
      this.vfx.updateComboLost(beat.lost);
    }
    this.comboFeedback.onComboDropped(after);
    this.vfx.setCombo(after);
    return lost;
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

  /** The distance's points for the metres run up to `distance` (RunState DistancePoints), the level of each metre given. */
  tickDistance(distance: number, levelAt: (metre: number) => number): void {
    this.run.score += this.run.distancePoints.advance(distance, levelAt);
  }
}
