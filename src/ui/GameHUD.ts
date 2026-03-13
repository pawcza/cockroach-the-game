import Phaser from 'phaser';
import { DASH_DURATION, DASH_COOLDOWN, DEPTH } from '../config/constants';
import { getLevelForDistance, getLevelProgress, LevelConfig, LEVELS } from '../config/levels';
import { hudStyle, hudSmallStyle, smallStyle, popupStyle, FONT_FAMILY } from '../utils/TextStyles';

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

  // Pause
  private pauseOverlay!: Phaser.GameObjects.Rectangle;
  private pauseText!: Phaser.GameObjects.Text;
  private pauseSubtext!: Phaser.GameObjects.Text;
  private touchPauseBtn!: Phaser.GameObjects.Arc;
  private touchPauseBtnLabel!: Phaser.GameObjects.Text;
  private cricketSound: Phaser.Sound.BaseSound | null = null;

  private isMobile: boolean;
  private onTogglePause: () => void;
  private lastTitleScore = -1;
  private lastTitleSpeed = -1;

  constructor(scene: Phaser.Scene, isMobile: boolean, onTogglePause: () => void) {
    this.scene = scene;
    this.isMobile = isMobile;
    this.onTogglePause = onTogglePause;
  }

  get pauseButton(): Phaser.GameObjects.Arc {
    return this.touchPauseBtn;
  }

  create(): void {
    const w = this.scene.cameras.main.width;
    const h = this.scene.cameras.main.height;
    const m = this.isMobile;

    // Score UI
    this.scoreText = this.scene.add
      .text(16, 16, 'Punkciory: 0', hudStyle(m))
      .setScrollFactor(0)
      .setDepth(DEPTH.HUD);

    // Level progress bar
    const barY = m ? 48 : 44;
    this.levelBarBg = this.scene.add.rectangle(16, barY, 150, 12, 0x333333, 0.8).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.HUD);
    this.levelBarFill = this.scene.add.rectangle(16, barY, 0, 12, 0xff6600, 1).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.HUD_FILL);
    this.levelNameText = this.scene.add
      .text(16, barY + 14, 'Lv1 Zwyk\u0142a Kuchnia', smallStyle({ fontSize: m ? '9px' : '7px', color: '#cccccc' }))
      .setScrollFactor(0)
      .setDepth(DEPTH.HUD);
    this.speedText = this.scene.add
      .text(170, barY, '1.0x', hudSmallStyle(m, { color: '#ff6600' }))
      .setScrollFactor(0)
      .setDepth(DEPTH.HUD);

    this.floorIndicator = this.scene.add
      .text(w - 16, h / 2, '\u25bc', hudStyle(m, { fontSize: m ? '18px' : '12px' }))
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.HUD);

    // Dash cooldown bar
    const dashBarY = barY + 34;
    this.dashBarBg = this.scene.add.rectangle(16, dashBarY, 100, 8, 0x333333, 0.8).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.HUD);
    this.dashBarFill = this.scene.add.rectangle(16, dashBarY, 100, 8, 0x00ffff, 1).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.HUD_FILL);

    this.distanceText = this.scene.add
      .text(16, dashBarY + 16, 'Dystansik: 0m', hudSmallStyle(m))
      .setScrollFactor(0)
      .setDepth(DEPTH.HUD);

    this.comboText = this.scene.add
      .text(w - 16, m ? 48 : 44, '', hudSmallStyle(m, { fontSize: m ? '12px' : '10px', color: '#ffff00' }))
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.HUD);

    // Pause UI
    this.pauseOverlay = this.scene.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.6)
      .setScrollFactor(0).setDepth(DEPTH.PAUSE).setVisible(false)
      .setInteractive();
    this.pauseOverlay.on('pointerdown', () => {
      this.onTogglePause();
    });
    this.pauseText = this.scene.add.text(w / 2, h / 2 - 15, 'PAUZKA!', popupStyle({ fontSize: m ? '28px' : '24px' }))
      .setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.PAUSE_TEXT).setVisible(false);
    this.pauseSubtext = this.scene.add.text(w / 2, h / 2 + 20, 'Wci\u015bnij cokolwiek, po to by gra\u0107 dalej', smallStyle({ fontSize: m ? '9px' : '7px' }))
      .setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.PAUSE_TEXT).setVisible(false);

    // Pause button -- circular, top-right
    const pauseR = m ? 30 : 18;
    const pauseX = w - pauseR - 12;
    const pauseY = pauseR + 12;
    this.touchPauseBtn = this.scene.add.circle(pauseX, pauseY, pauseR, 0x888888, m ? 0.35 : 0.2)
      .setScrollFactor(0)
      .setDepth(DEPTH.PAUSE_BTN)
      .setInteractive();

    this.touchPauseBtnLabel = this.scene.add.text(pauseX, pauseY, '\u23f8', hudStyle(m, { fontSize: m ? '18px' : '12px' }))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.PAUSE_BTN_LABEL)
      .setAlpha(m ? 0.7 : 0.4);

    this.touchPauseBtn.on('pointerdown', () => {
      this.onTogglePause();
    });
  }

  updateScore(score: number): void {
    this.scoreText.setText(`Punkciory: ${score}`);
  }

  update(data: HUDUpdateData): void {
    // Floor indicator
    if (data.currentFloor === 'top') {
      this.floorIndicator.setText('\u25b2 G\u00d3RA');
      this.floorIndicator.setColor('#88ccff');
    } else {
      this.floorIndicator.setText('\u25bc D\u00d3\u0141');
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

  private pauseTweens: Phaser.Tweens.Tween[] = [];

  showPauseOverlay(): void {
    const h = this.scene.cameras.main.height;

    this.pauseOverlay.setVisible(true);
    this.pauseText.setVisible(true);
    this.pauseSubtext.setVisible(true);

    // Animate title: scale in from 0 + floating bob
    this.pauseText.setScale(0);
    this.pauseText.setAlpha(0);
    this.pauseTweens.push(
      this.scene.tweens.add({
        targets: this.pauseText,
        scale: 1,
        alpha: 1,
        duration: 300,
        ease: 'Back.easeOut',
        onComplete: () => {
          // Floating bob like menu title
          this.pauseTweens.push(
            this.scene.tweens.add({
              targets: this.pauseText,
              y: h / 2 - 25,
              duration: 1500,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeInOut',
            }),
          );
        },
      }),
    );

    // Animate subtext: fade in with slight delay + pulsing alpha
    this.pauseSubtext.setAlpha(0);
    this.pauseTweens.push(
      this.scene.tweens.add({
        targets: this.pauseSubtext,
        alpha: 1,
        duration: 400,
        delay: 200,
        ease: 'Power2',
        onComplete: () => {
          this.pauseTweens.push(
            this.scene.tweens.add({
              targets: this.pauseSubtext,
              alpha: 0.4,
              duration: 800,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeInOut',
            }),
          );
          // Gentle rotation oscillation like menu subtitle
          this.pauseSubtext.setAngle(-2);
          this.pauseTweens.push(
            this.scene.tweens.add({
              targets: this.pauseSubtext,
              angle: 2,
              duration: 2000,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeInOut',
            }),
          );
        },
      }),
    );

    // Cricket ambient sound
    if (!this.cricketSound) {
      this.cricketSound = this.scene.sound.add('cricket', { volume: 0.4, loop: true });
    }
    this.cricketSound.play();
  }

  hidePauseOverlay(): void {
    const h = this.scene.cameras.main.height;

    // Kill all pause tweens and reset positions
    for (const tween of this.pauseTweens) {
      tween.destroy();
    }
    this.pauseTweens = [];

    this.pauseOverlay.setVisible(false);
    this.pauseText.setVisible(false).setY(h / 2 - 15).setScale(1).setAlpha(1);
    this.pauseSubtext.setVisible(false).setAngle(0).setAlpha(1);

    if (this.cricketSound) {
      this.cricketSound.stop();
    }
  }

  showLevelAnnouncement(config: LevelConfig): void {
    const w = this.scene.cameras.main.width;

    const levelLabel = `POZIOM ${config.level}`;
    const nameLabel = config.name.toUpperCase();

    const levelText = this.scene.add.text(w / 2, 60, levelLabel, smallStyle({
      fontSize: '12px',
      color: '#ffff00',
      strokeThickness: 4,
    }));
    levelText.setOrigin(0.5);
    levelText.setScrollFactor(0);
    levelText.setDepth(DEPTH.ANNOUNCEMENT);
    levelText.setScale(0.5);
    levelText.setAlpha(0);

    const nameText = this.scene.add.text(w / 2, 95, nameLabel, {
      fontSize: '18px',
      fontFamily: FONT_FAMILY,
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 6,
      shadow: {
        offsetX: 2,
        offsetY: 2,
        color: '#ff6600',
        blur: 8,
        fill: true,
        stroke: true,
      },
    });
    nameText.setOrigin(0.5);
    nameText.setScrollFactor(0);
    nameText.setDepth(DEPTH.ANNOUNCEMENT);
    nameText.setScale(0.5);
    nameText.setAlpha(0);

    this.scene.tweens.add({
      targets: [levelText, nameText],
      scale: 1,
      alpha: 1,
      duration: 300,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: [levelText, nameText],
          alpha: 0,
          scale: 1.3,
          duration: 500,
          delay: 1500,
          ease: 'Power2',
          onComplete: () => {
            levelText.destroy();
            nameText.destroy();
          },
        });
      },
    });

    this.scene.cameras.main.shake(200, 0.01);
  }

  showScoreMilestone(text: string, tier: number, threshold: number): void {
    const w = this.scene.cameras.main.width;
    const h = this.scene.cameras.main.height;

    // Tier determines epicness: size, color, shake, duration
    const tierConfig = [
      { numSize: '24px', textSize: '10px', color: '#ffff00', stroke: 3, numStroke: 4, shake: 0.005, duration: 2000, scale: 1.3 },
      { numSize: '32px', textSize: '12px', color: '#ff8800', stroke: 4, numStroke: 5, shake: 0.008, duration: 2500, scale: 1.5 },
      { numSize: '40px', textSize: '14px', color: '#ff4400', stroke: 4, numStroke: 6, shake: 0.012, duration: 3000, scale: 1.6 },
      { numSize: '48px', textSize: '16px', color: '#ff00ff', stroke: 5, numStroke: 7, shake: 0.018, duration: 3500, scale: 1.8 },
      { numSize: '56px', textSize: '20px', color: '#ffffff', stroke: 6, numStroke: 8, shake: 0.025, duration: 4000, scale: 2.0 },
    ];
    const cfg = tierConfig[Math.min(tier - 1, tierConfig.length - 1)];

    // Big score number in the center
    const numText = this.scene.add.text(w / 2, h / 2 - 20, String(threshold), {
      fontSize: cfg.numSize,
      fontFamily: FONT_FAMILY,
      color: cfg.color,
      stroke: '#000000',
      strokeThickness: cfg.numStroke,
    });
    numText.setOrigin(0.5);
    numText.setScrollFactor(0);
    numText.setDepth(998);
    numText.setAlpha(0);
    numText.setScale(3);

    // Subtitle text below the number
    const milestone = this.scene.add.text(w / 2, h / 2 + 25, text, {
      fontSize: cfg.textSize,
      fontFamily: FONT_FAMILY,
      color: cfg.color,
      stroke: '#000000',
      strokeThickness: cfg.stroke,
    });
    milestone.setOrigin(0.5);
    milestone.setScrollFactor(0);
    milestone.setDepth(DEPTH.POPUP);
    milestone.setAlpha(0);
    milestone.setScale(0.3);

    // Number slam in (big -> normal with overshoot)
    this.scene.tweens.add({
      targets: numText,
      alpha: { from: 0, to: 0.4 + tier * 0.12 },
      scale: 1,
      duration: 400,
      ease: 'Back.easeOut',
      onComplete: () => {
        // Pulse
        this.scene.tweens.add({
          targets: numText,
          scale: { from: 1, to: 1.05 + tier * 0.02 },
          duration: 300,
          yoyo: true,
          repeat: Math.floor(cfg.duration / 600) - 1,
          ease: 'Sine.easeInOut',
        });
        // Fade out
        this.scene.tweens.add({
          targets: numText,
          alpha: 0,
          scale: cfg.scale * 1.5,
          duration: 1000,
          delay: cfg.duration - 1000,
          ease: 'Power2',
          onComplete: () => numText.destroy(),
        });
      },
    });

    // Text slam in
    this.scene.tweens.add({
      targets: milestone,
      alpha: 1,
      scale: 1,
      duration: 300,
      delay: 150,
      ease: 'Back.easeOut',
      onComplete: () => {
        // Wobble hold
        this.scene.tweens.add({
          targets: milestone,
          angle: { from: -2 * tier, to: 2 * tier },
          duration: 100,
          yoyo: true,
          repeat: Math.floor(cfg.duration / 200) - 1,
          ease: 'Sine.easeInOut',
        });
        // Fade out
        this.scene.tweens.add({
          targets: milestone,
          alpha: 0,
          scale: cfg.scale,
          y: milestone.y - 30,
          duration: 800,
          delay: cfg.duration - 800,
          ease: 'Power2',
          onComplete: () => milestone.destroy(),
        });
      },
    });

    this.scene.cameras.main.shake(300, cfg.shake);
  }
}
