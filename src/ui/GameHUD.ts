import Phaser from 'phaser';
import { DASH_DURATION, DASH_COOLDOWN } from '../config/constants';
import { getLevelForDistance, getLevelProgress, LevelConfig } from '../config/levels';
import { PauseOverlay } from './PauseOverlay';
import { MilestoneDisplay } from './MilestoneDisplay';

export interface HUDUpdateData {
  score: number;
  distance: number;
  speedMultiplier: number;
  currentFloor: 'top' | 'bottom';
  pickupCombo: number;
  comboMultiplier: number;
  dashReady: boolean;
  isDashing: boolean;
  dashStartTime: number;
  timeNow: number;
}

export class GameHUD {
  private scene: Phaser.Scene;

  // Score
  private scoreText!: Phaser.GameObjects.Text;

  // Level bar
  private levelBarBg!: Phaser.GameObjects.Rectangle;
  private levelBarFill!: Phaser.GameObjects.Rectangle;
  private levelNameText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;

  // Floor indicator
  private floorIndicator!: Phaser.GameObjects.Text;

  // Dash cooldown bar
  private dashBarBg!: Phaser.GameObjects.Rectangle;
  private dashBarFill!: Phaser.GameObjects.Rectangle;

  // Distance + combo
  private distanceText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;

  // Subsystems
  private pauseOverlayComponent: PauseOverlay;
  private milestoneDisplay: MilestoneDisplay;

  private isMobile: boolean;
  private lastTitleScore = -1;
  private lastTitleSpeed = -1;

  constructor(scene: Phaser.Scene, isMobile: boolean, onTogglePause: () => void) {
    this.scene = scene;
    this.isMobile = isMobile;
    this.pauseOverlayComponent = new PauseOverlay(scene, isMobile, onTogglePause);
    this.milestoneDisplay = new MilestoneDisplay(scene);
  }

  get pauseButton(): Phaser.GameObjects.Arc {
    return this.pauseOverlayComponent.pauseButton;
  }

  create(): void {
    const w = this.scene.cameras.main.width;
    const h = this.scene.cameras.main.height;
    const m = this.isMobile;

    // Score UI
    this.scoreText = this.scene.add
      .text(16, 16, 'Punkciory: 0', {
        fontSize: m ? '14px' : '11px',
        color: '#ffffff',
        fontFamily: '"Press Start 2P", monospace',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setScrollFactor(0)
      .setDepth(100);

    // Level progress bar
    const barY = m ? 48 : 44;
    this.levelBarBg = this.scene.add.rectangle(16, barY, 150, 12, 0x333333, 0.8).setOrigin(0, 0).setScrollFactor(0).setDepth(100);
    this.levelBarFill = this.scene.add.rectangle(16, barY, 0, 12, 0xff6600, 1).setOrigin(0, 0).setScrollFactor(0).setDepth(101);
    this.levelNameText = this.scene.add
      .text(16, barY + 14, 'Lv1 Zwykła Kuchnia', {
        fontSize: m ? '9px' : '7px',
        color: '#cccccc',
        fontFamily: '"Press Start 2P", monospace',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setScrollFactor(0)
      .setDepth(100);
    this.speedText = this.scene.add
      .text(170, barY, '1.0x', {
        fontSize: m ? '10px' : '8px',
        color: '#ff6600',
        fontFamily: '"Press Start 2P", monospace',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.floorIndicator = this.scene.add
      .text(w - 16, h / 2, '▼', {
        fontSize: m ? '18px' : '12px',
        color: '#ffffff',
        fontFamily: '"Press Start 2P", monospace',
        stroke: '#000000',
        strokeThickness: m ? 3 : 2,
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(100);

    // Dash cooldown bar
    const dashBarY = barY + 34;
    this.dashBarBg = this.scene.add.rectangle(16, dashBarY, 100, 8, 0x333333, 0.8).setOrigin(0, 0).setScrollFactor(0).setDepth(100);
    this.dashBarFill = this.scene.add.rectangle(16, dashBarY, 100, 8, 0x00ffff, 1).setOrigin(0, 0).setScrollFactor(0).setDepth(101);

    this.distanceText = this.scene.add
      .text(16, dashBarY + 16, 'Dystansik: 0m', {
        fontSize: m ? '10px' : '8px',
        color: '#aaaaaa',
        fontFamily: '"Press Start 2P", monospace',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.comboText = this.scene.add
      .text(w - 16, m ? 48 : 44, '', {
        fontSize: m ? '12px' : '10px',
        color: '#ffff00',
        fontFamily: '"Press Start 2P", monospace',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);

    // Pause overlay + button
    this.pauseOverlayComponent.create();
  }

  updateScore(score: number): void {
    this.scoreText.setText(`Punkciory: ${score}`);
  }

  update(data: HUDUpdateData): void {
    // Floor indicator
    if (data.currentFloor === 'top') {
      this.floorIndicator.setText('▲ GÓRA');
      this.floorIndicator.setColor('#88ccff');
    } else {
      this.floorIndicator.setText('▼ DÓŁ');
      this.floorIndicator.setColor('#ffcc88');
    }

    // Level bar + speed UI (distance-based progression)
    const levelConfig = getLevelForDistance(data.distance);
    const levelProgress = getLevelProgress(data.distance);
    this.levelBarFill.width = 150 * levelProgress;
    this.levelNameText.setText(`Lv${levelConfig.level} ${levelConfig.name}`);

    // Bar color: orange -> red -> magenta based on speed
    if (data.speedMultiplier >= 5) {
      this.levelBarFill.setFillStyle(0xff00ff);
      this.speedText.setColor('#ff00ff');
    } else if (data.speedMultiplier >= 3) {
      this.levelBarFill.setFillStyle(0xff3300);
      this.speedText.setColor('#ff3300');
    } else {
      this.levelBarFill.setFillStyle(0xff6600);
      this.speedText.setColor('#ff6600');
    }
    this.speedText.setText(`${data.speedMultiplier.toFixed(1)}x`);

    // Dynamic page title (only update when values change)
    const roundedSpeed = Math.floor(data.speedMultiplier * 10);
    if (data.score !== this.lastTitleScore || roundedSpeed !== this.lastTitleSpeed) {
      document.title = `KARALUCH | ${data.score} pkt | ${data.speedMultiplier.toFixed(1)}x`;
      this.lastTitleScore = data.score;
      this.lastTitleSpeed = roundedSpeed;
    }

    this.distanceText.setText(`Dystansik: ${Math.floor(data.distance)}m`);

    // Combo display
    if (data.pickupCombo > 1) {
      this.comboText.setText(`KOMBO (${data.pickupCombo}) x${data.comboMultiplier.toFixed(1)}`);
      this.comboText.setVisible(true);
    } else {
      this.comboText.setVisible(false);
    }

    // Score text
    this.scoreText.setText(`Punkciory: ${data.score}`);

    // Dash cooldown bar
    if (data.dashReady) {
      this.dashBarFill.width = 100;
      this.dashBarFill.setFillStyle(0x00ffff);
    } else {
      const totalCooldown = DASH_DURATION + DASH_COOLDOWN;
      const elapsed = data.timeNow - data.dashStartTime;
      const progress = Math.min(elapsed / totalCooldown, 1);
      this.dashBarFill.width = 100 * progress;
      if (data.isDashing) {
        this.dashBarFill.setFillStyle(0xffffff);
      } else {
        this.dashBarFill.setFillStyle(0xff6600);
      }
    }
  }

  showPauseOverlay(): void {
    this.pauseOverlayComponent.show();
  }

  hidePauseOverlay(): void {
    this.pauseOverlayComponent.hide();
  }

  showLevelAnnouncement(config: LevelConfig): void {
    this.milestoneDisplay.showLevelAnnouncement(config);
  }

  showScoreMilestone(text: string, tier: number, threshold: number): void {
    this.milestoneDisplay.showScoreMilestone(text, tier, threshold);
  }
}
