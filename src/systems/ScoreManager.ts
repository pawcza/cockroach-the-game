import Phaser from 'phaser';
import {
  APPLE_SCORE,
  TYSKIE_SCORE,
  PILL_SCORE,
} from '../config/constants';
import { GameHUD } from '../ui/GameHUD';

export interface ScoreMilestone {
  threshold: number;
  text: string;
  tier: number;
}

const SCORE_MILESTONES: ScoreMilestone[] = [
  { threshold: 100, text: 'SETUNIA MMMMMMM', tier: 1 },
  { threshold: 250, text: 'MA\u0141PECZKA Z \u017bABKI', tier: 1 },
  { threshold: 420, text: 'BLAZE IT!', tier: 2 },
  { threshold: 500, text: 'PI\u0118\u0106 DYCH NA BROWARA!', tier: 2 },
  { threshold: 1000, text: 'GRAJ ZE MNOM W TYSI\u0104CA', tier: 3 },
  { threshold: 1500, text: 'MI\u00d3D PITNY P\u00d3\u0141TORAK', tier: 3 },
  { threshold: 2000, text: 'DWA KAFLE WYP\u0141ATY', tier: 4 },
  { threshold: 2137, text: 'KREM\u00d3WKI DLA WSZYSTKICH!', tier: 5 },
  { threshold: 3000, text: 'TRZY WIELKIE KLOCE', tier: 4 },
  { threshold: 4000, text: 'BANIA U CYGANA', tier: 4 },
  { threshold: 4200, text: 'SNOOP DOGGY DOGG', tier: 5 },
  { threshold: 5000, text: 'GDZIE KARALUCHY ZIMUJOM', tier: 5 },
  { threshold: 10000, text: 'KARALUCH JEST BOGIEM!', tier: 5 },
];

/**
 * Manages score tracking, pickup combos, scoring events, and milestones.
 */
export class ScoreManager {
  private scene: Phaser.Scene;

  private _score = 0;
  private lastScoreTime = 0;
  private lastMilestone = 0;
  private _pickupCombo = 0;

  get score(): number { return this._score; }
  get pickupCombo(): number { return this._pickupCombo; }

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  reset(timeNow: number): void {
    this._score = 0;
    this.lastScoreTime = timeNow;
    this.lastMilestone = 0;
    this._pickupCombo = 0;
  }

  /** +1 per second survival score. */
  updateSurvival(timeNow: number): void {
    if (timeNow - this.lastScoreTime >= 1000) {
      this._score += 1;
      this.lastScoreTime = timeNow;
    }
  }

  /** Check and fire milestone announcements. */
  checkMilestones(hud: GameHUD): void {
    for (const m of SCORE_MILESTONES) {
      if (this._score >= m.threshold && this.lastMilestone < m.threshold) {
        this.lastMilestone = m.threshold;
        hud.showScoreMilestone(m.text, m.tier, m.threshold);
        this.scene.sound.play(`milestone-${m.threshold}`, { volume: 0.7 });
        break;
      }
    }
  }

  /** Combo multiplier: 10 combo = 1.25x, 40 combo = 2.0x, etc. */
  getComboMultiplier(): number {
    return 1 + this._pickupCombo * 0.025;
  }

  resetCombo(): void {
    this._pickupCombo = 0;
  }

  addAppleScore(): number {
    this._pickupCombo++;
    const multiplier = this.getComboMultiplier();
    const points = Math.round(APPLE_SCORE * multiplier);
    this._score += points;
    return points;
  }

  addTyskieScore(): number {
    this._pickupCombo++;
    const multiplier = this.getComboMultiplier();
    const points = Math.round(TYSKIE_SCORE * multiplier);
    this._score += points;
    return points;
  }

  addPillScore(): number {
    this._pickupCombo++;
    const multiplier = this.getComboMultiplier();
    const points = Math.round(PILL_SCORE * multiplier);
    this._score += points;
    return points;
  }

  showPickupPopup(x: number, y: number, text: string, color: string): void {
    const popup = this.scene.add.text(x, y - 20, text, {
      fontSize: '12px',
      fontFamily: '"Press Start 2P", monospace',
      color,
      stroke: '#000000',
      strokeThickness: 3,
    });
    popup.setOrigin(0.5);
    popup.setDepth(999);
    popup.setAlpha(0);

    // Phase 1: Slide up + fade in (150ms)
    this.scene.tweens.add({
      targets: popup,
      y: popup.y - 15,
      alpha: 1,
      duration: 150,
      ease: 'Power2',
      onComplete: () => {
        // Phase 2: Wobble in place (300ms)
        this.scene.tweens.add({
          targets: popup,
          angle: { from: -3, to: 3 },
          duration: 75,
          yoyo: true,
          repeat: 1,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            // Phase 3: Slide up + fade out (150ms)
            this.scene.tweens.add({
              targets: popup,
              y: popup.y - 20,
              alpha: 0,
              duration: 150,
              ease: 'Power2',
              onComplete: () => popup.destroy(),
            });
          },
        });
      },
    });
  }
}
