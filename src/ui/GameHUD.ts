import Phaser from 'phaser';
import { DEPTH } from '../config/constants';
import { getLevelForDistance, getLevelProgress, getLevelDistances, LevelConfig } from '../config/levels';
import { hudStyle, hudSmallStyle, smallStyle, popupStyle, FONT_FAMILY } from '../utils/TextStyles';

export interface HUDUpdateData {
  score: number;
  distance: number;
  speedMultiplier: number;
  currentFloor: 'top' | 'bottom';
  pickupCombo: number;
  comboMultiplier: number;
  timeNow: number;
}

export class GameHUD {
  private scene: Phaser.Scene;

  // Top center — score values + labels
  private scoreText!: Phaser.GameObjects.Text;
  private scoreLabels!: Phaser.GameObjects.Text;

  // Bottom center — styled level bar
  private levelBarGfx!: Phaser.GameObjects.Graphics;
  private levelBarFillGfx!: Phaser.GameObjects.Graphics;
  private levelBarText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;

  // Pause
  private pauseOverlay!: Phaser.GameObjects.Rectangle;
  private pauseText!: Phaser.GameObjects.Text;
  private pauseSubtext!: Phaser.GameObjects.Text;
  private touchPauseBtn!: Phaser.GameObjects.Arc;
  private touchPauseBtnLabel!: Phaser.GameObjects.Text;
  private cricketSound: Phaser.Sound.BaseSound | null = null;

  private onTogglePause: () => void;
  private lastTitleScore = -1;
  private lastTitleSpeed = -1;

  // Boss HP bar
  private bossMode = false;
  private bossHP = 0;
  private bossMaxHP = 0;
  private bossName = '';

  // Level bar dimensions
  private barX = 0;
  private barY = 0;
  private barW = 0;
  private barH = 0;
  private barRadius = 6;

  // Scroll offset for fill texture animation
  private fillScrollX = 0;

  constructor(scene: Phaser.Scene, onTogglePause: () => void) {
    this.scene = scene;
    this.onTogglePause = onTogglePause;
  }

  get pauseButton(): Phaser.GameObjects.Arc {
    return this.touchPauseBtn;
  }

  create(): void {
    const w = this.scene.cameras.main.width;
    const h = this.scene.cameras.main.height;

    // === TOP CENTER: Score / combo / multiplier with labels ===
    this.scoreText = this.scene.add
      .text(w / 2, 10, '0 / x0 / x1.0', hudStyle({ fontSize: '14px' }))
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.HUD);

    this.scoreLabels = this.scene.add
      .text(w / 2, 28, 'Punkciory / Kombo / Mnożnik Punkciorów', smallStyle({ fontSize: '6px', color: '#888888', strokeThickness: 2 }))
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.HUD);

    // === BOTTOM CENTER: Styled level progress bar ===
    const centerX = w / 2;
    this.barW = 280;
    this.barH = 22;
    this.barX = centerX;
    this.barY = 470;

    // Background graphics (shadow + border + dark fill)
    this.levelBarGfx = this.scene.add.graphics()
      .setScrollFactor(0).setDepth(DEPTH.HUD);

    // Fill graphics (drawn every frame with progress)
    this.levelBarFillGfx = this.scene.add.graphics()
      .setScrollFactor(0).setDepth(DEPTH.HUD_FILL);

    // Text inside the bar
    this.levelBarText = this.scene.add
      .text(this.barX, this.barY + this.barH / 2, 'Lv1 Zwykła Kuchnia (0/100)m', {
        fontSize: '7px',
        fontFamily: FONT_FAMILY,
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.HUD_FILL + 1);

    // Speed multiplier — right of bar
    this.speedText = this.scene.add
      .text(this.barX + this.barW / 2 + 12, this.barY + this.barH / 2, '1.0x', hudStyle({ fontSize: '12px', color: '#ff6600' }))
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.HUD);

    // === PAUSE UI ===
    this.pauseOverlay = this.scene.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.6)
      .setScrollFactor(0).setDepth(DEPTH.PAUSE).setVisible(false)
      .setInteractive();
    this.pauseOverlay.on('pointerdown', () => { this.onTogglePause(); });

    this.pauseText = this.scene.add.text(w / 2, h / 2 - 15, 'PAUZA!', popupStyle({ fontSize: '24px' }))
      .setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.PAUSE_TEXT).setVisible(false);
    this.pauseSubtext = this.scene.add.text(w / 2, h / 2 + 20, 'Wciśnij cokolwiek, po to by grać dalej', smallStyle({ fontSize: '7px' }))
      .setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.PAUSE_TEXT).setVisible(false);

    // Pause button — circular, top-right
    const pauseR = 18;
    const pauseX = w - pauseR - 12;
    const pauseY = pauseR + 12;
    this.touchPauseBtn = this.scene.add.circle(pauseX, pauseY, pauseR, 0x888888, 0.2)
      .setScrollFactor(0).setDepth(DEPTH.PAUSE_BTN).setInteractive();
    this.touchPauseBtnLabel = this.scene.add.text(pauseX, pauseY, '\u23f8', hudStyle({ fontSize: '12px' }))
      .setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.PAUSE_BTN_LABEL).setAlpha(0.4);
    this.touchPauseBtn.on('pointerdown', () => { this.onTogglePause(); });

    // Draw initial bar state so it's visible during countdown
    this.drawLevelBar(0);
  }

  updateScore(score: number): void {
    this.scoreText.setText(String(score));
  }

  update(data: HUDUpdateData): void {
    const time = data.timeNow;

    // === TOP CENTER: Score line with labels ===
    this.scoreText.setText(`${data.score} / x${data.pickupCombo} / x${data.comboMultiplier.toFixed(1)}`);

    // === BOTTOM: Level progress bar ===
    this.drawLevelBar(data.distance);

    // Speed text + color from level
    const speedColorStr = '#' + getLevelForDistance(data.distance).color.toString(16).padStart(6, '0');
    this.speedText.setText(`${data.speedMultiplier.toFixed(1)}x`);
    this.speedText.setColor(speedColorStr);

    // Wobbly speed text — intensity scales with speed
    const intensity = Math.max(0, (data.speedMultiplier - 1) / 4); // 0 at 1x, 1 at 5x
    const baseSpeedX = this.barX + this.barW / 2 + 12;
    const baseSpeedY = this.barY + this.barH / 2;
    if (intensity > 0.1) {
      const wobbleAngle = Math.sin(time * 0.008 * (1 + intensity * 3)) * (3 + intensity * 15);
      const wobbleScale = 1 + Math.sin(time * 0.012 * (1 + intensity * 2)) * intensity * 0.15;
      const wobbleX = Math.sin(time * 0.006 * (1 + intensity * 2)) * intensity * 4;
      const wobbleY = Math.cos(time * 0.009 * (1 + intensity * 2)) * intensity * 3;
      this.speedText.setAngle(wobbleAngle);
      this.speedText.setScale(wobbleScale);
      this.speedText.setX(baseSpeedX + wobbleX);
      this.speedText.setY(baseSpeedY + wobbleY);
    } else {
      this.speedText.setAngle(0);
      this.speedText.setScale(1);
      this.speedText.setX(baseSpeedX);
      this.speedText.setY(baseSpeedY);
    }

    // Dynamic page title
    const roundedSpeed = Math.floor(data.speedMultiplier * 10);
    if (data.score !== this.lastTitleScore || roundedSpeed !== this.lastTitleSpeed) {
      document.title = `KARALUCH | ${data.score} pkt | ${data.speedMultiplier.toFixed(1)}x`;
      this.lastTitleScore = data.score;
      this.lastTitleSpeed = roundedSpeed;
    }

  }

  private drawLevelBar(distance: number): void {
    // Boss HP mode — repurpose the level bar
    if (this.bossMode) {
      const bx = this.barX - this.barW / 2;
      const by = this.barY;
      const bw = this.barW;
      const bh = this.barH;
      const r = this.barRadius;
      const progress = this.bossHP / this.bossMaxHP;
      const fillW = Math.max(0, bw * progress);

      this.levelBarGfx.clear();
      this.levelBarGfx.fillStyle(0x000000, 0.5);
      this.levelBarGfx.fillRoundedRect(bx + 2, by + 2, bw, bh, r);
      this.levelBarGfx.fillStyle(0x330000, 1);
      this.levelBarGfx.fillRoundedRect(bx - 1, by - 1, bw + 2, bh + 2, r + 1);
      this.levelBarGfx.fillStyle(0x111111, 0.9);
      this.levelBarGfx.fillRoundedRect(bx, by, bw, bh, r);

      this.levelBarFillGfx.clear();
      if (fillW > 2) {
        const fillR = {
          tl: r, bl: r,
          tr: fillW >= bw - r ? r : 0,
          br: fillW >= bw - r ? r : 0,
        };
        this.levelBarFillGfx.fillStyle(0xcc0000, 0.85);
        this.levelBarFillGfx.fillRoundedRect(bx, by, fillW, bh, fillR);

        this.fillScrollX += 0.5;
        const stripeW = 12;
        const stripeGap = 8;
        const stripeStep = stripeW + stripeGap;
        this.levelBarFillGfx.fillStyle(0xff0000, 0.15);
        for (let sx = -stripeStep + (this.fillScrollX % stripeStep); sx < fillW + stripeStep; sx += stripeStep) {
          const clampL = Math.max(bx, Math.min(bx + sx, bx + fillW));
          const clampR = Math.max(bx, Math.min(bx + sx + stripeW, bx + fillW));
          if (clampR > clampL) {
            this.levelBarFillGfx.fillRect(clampL, by + 1, clampR - clampL, bh - 2);
          }
        }
      }

      this.levelBarText.setText(`${this.bossName} (${this.bossHP}/${this.bossMaxHP})`);
      this.speedText.setVisible(false);
      return;
    }

    this.speedText.setVisible(true);

    const levelConfig = getLevelForDistance(distance);
    const levelProgress = getLevelProgress(distance);
    const { inLevel, levelSpan } = getLevelDistances(distance);
    const barColor = levelConfig.color;

    const bx = this.barX - this.barW / 2;
    const by = this.barY;
    const bw = this.barW;
    const bh = this.barH;
    const r = this.barRadius;

    // Border color (darker version of level color)
    const cr = (barColor >> 16) & 0xff;
    const cg = (barColor >> 8) & 0xff;
    const cb = barColor & 0xff;
    const borderColor = Phaser.Display.Color.GetColor(
      Math.floor(cr * 0.3), Math.floor(cg * 0.3), Math.floor(cb * 0.3),
    );
    const highlightColor = Phaser.Display.Color.GetColor(
      Math.min(255, Math.floor(cr * 1.4)),
      Math.min(255, Math.floor(cg * 1.4)),
      Math.min(255, Math.floor(cb * 1.4)),
    );

    // Draw bar background
    this.levelBarGfx.clear();
    this.levelBarGfx.fillStyle(0x000000, 0.5);
    this.levelBarGfx.fillRoundedRect(bx + 2, by + 2, bw, bh, r);
    this.levelBarGfx.fillStyle(borderColor, 1);
    this.levelBarGfx.fillRoundedRect(bx - 1, by - 1, bw + 2, bh + 2, r + 1);
    this.levelBarGfx.fillStyle(0x111111, 0.9);
    this.levelBarGfx.fillRoundedRect(bx, by, bw, bh, r);

    // Draw fill with progress
    const fillW = Math.max(0, bw * levelProgress);
    this.levelBarFillGfx.clear();
    if (fillW > 2) {
      const fillR = {
        tl: r, bl: r,
        tr: fillW >= bw - r ? r : 0,
        br: fillW >= bw - r ? r : 0,
      };
      this.levelBarFillGfx.fillStyle(barColor, 0.85);
      this.levelBarFillGfx.fillRoundedRect(bx, by, fillW, bh, fillR);

      // Animated stripe overlay
      this.fillScrollX += 0.5;
      const stripeW = 12;
      const stripeGap = 8;
      const stripeStep = stripeW + stripeGap;
      this.levelBarFillGfx.fillStyle(highlightColor, 0.15);
      for (let sx = -stripeStep + (this.fillScrollX % stripeStep); sx < fillW + stripeStep; sx += stripeStep) {
        const x0 = bx + sx;
        const x1 = x0 + stripeW;
        const skew = bh * 0.6;
        if (x1 + skew > bx && x0 < bx + fillW) {
          this.levelBarFillGfx.save();
          const clampL = Math.max(bx, Math.min(x0, bx + fillW));
          const clampR = Math.max(bx, Math.min(x1, bx + fillW));
          if (clampR > clampL) {
            this.levelBarFillGfx.fillRect(clampL, by + 1, clampR - clampL, bh - 2);
          }
          this.levelBarFillGfx.restore();
        }
      }

      // Inner highlight at top of fill
      this.levelBarFillGfx.fillStyle(0xffffff, 0.12);
      this.levelBarFillGfx.fillRoundedRect(bx + 2, by + 1, Math.max(0, fillW - 4), bh * 0.35, { tl: r - 1, tr: fillW >= bw - r ? r - 1 : 0, bl: 0, br: 0 });
    }

    // Bar text — show total distance / next level threshold
    const nextThreshold = levelConfig.distanceThreshold + levelSpan;
    const distLabel = levelSpan > 0 ? `(${Math.floor(distance)}/${nextThreshold})m` : `${Math.floor(distance)}m`;
    this.levelBarText.setText(`Lv${levelConfig.level} ${levelConfig.name} ${distLabel}`);
  }

  private pauseTweens: Phaser.Tweens.Tween[] = [];

  showPauseOverlay(): void {
    const h = this.scene.cameras.main.height;

    this.pauseOverlay.setVisible(true);
    this.pauseText.setVisible(true);
    this.pauseSubtext.setVisible(true);

    this.pauseText.setScale(0).setAlpha(0);
    this.pauseTweens.push(
      this.scene.tweens.add({
        targets: this.pauseText,
        scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut',
        onComplete: () => {
          this.pauseTweens.push(
            this.scene.tweens.add({
              targets: this.pauseText,
              y: h / 2 - 25, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
            }),
          );
        },
      }),
    );

    this.pauseSubtext.setAlpha(0);
    this.pauseTweens.push(
      this.scene.tweens.add({
        targets: this.pauseSubtext,
        alpha: 1, duration: 400, delay: 200, ease: 'Power2',
        onComplete: () => {
          this.pauseTweens.push(
            this.scene.tweens.add({
              targets: this.pauseSubtext,
              alpha: 0.4, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
            }),
          );
          this.pauseSubtext.setAngle(-2);
          this.pauseTweens.push(
            this.scene.tweens.add({
              targets: this.pauseSubtext,
              angle: 2, duration: 2000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
            }),
          );
        },
      }),
    );

    if (!this.cricketSound) {
      this.cricketSound = this.scene.sound.add('cricket', { volume: 0.4, loop: true });
    }
    this.cricketSound.play();
  }

  hidePauseOverlay(): void {
    const h = this.scene.cameras.main.height;

    for (const tween of this.pauseTweens) tween.destroy();
    this.pauseTweens = [];

    this.pauseOverlay.setVisible(false);
    this.pauseText.setVisible(false).setY(h / 2 - 15).setScale(1).setAlpha(1);
    this.pauseSubtext.setVisible(false).setAngle(0).setAlpha(1);

    if (this.cricketSound) this.cricketSound.stop();
  }

  showLevelAnnouncement(config: LevelConfig): void {
    const w = this.scene.cameras.main.width;

    const levelLabel = `POZIOM ${config.level}`;
    const nameLabel = config.name.toUpperCase();

    const levelText = this.scene.add.text(w / 2, 60, levelLabel, smallStyle({
      fontSize: '12px', color: '#ffff00', strokeThickness: 4,
    })).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.ANNOUNCEMENT).setScale(0.5).setAlpha(0);

    const nameText = this.scene.add.text(w / 2, 95, nameLabel, {
      fontSize: '18px', fontFamily: FONT_FAMILY, color: '#ffffff',
      stroke: '#000000', strokeThickness: 6,
      shadow: { offsetX: 2, offsetY: 2, color: '#ff6600', blur: 8, fill: true, stroke: true },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.ANNOUNCEMENT).setScale(0.5).setAlpha(0);

    this.scene.tweens.add({
      targets: [levelText, nameText], scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: [levelText, nameText], alpha: 0, scale: 1.3, duration: 500, delay: 1500, ease: 'Power2',
          onComplete: () => { levelText.destroy(); nameText.destroy(); },
        });
      },
    });
    this.scene.cameras.main.shake(200, 0.01);
  }

  showScoreMilestone(text: string, tier: number, threshold: number): void {
    const w = this.scene.cameras.main.width;
    const h = this.scene.cameras.main.height;

    const tierConfig = [
      { numSize: '24px', textSize: '10px', color: '#ffff00', stroke: 3, numStroke: 4, shake: 0.005, duration: 2000, scale: 1.3 },
      { numSize: '32px', textSize: '12px', color: '#ff8800', stroke: 4, numStroke: 5, shake: 0.008, duration: 2500, scale: 1.5 },
      { numSize: '40px', textSize: '14px', color: '#ff4400', stroke: 4, numStroke: 6, shake: 0.012, duration: 3000, scale: 1.6 },
      { numSize: '48px', textSize: '16px', color: '#ff00ff', stroke: 5, numStroke: 7, shake: 0.018, duration: 3500, scale: 1.8 },
      { numSize: '56px', textSize: '20px', color: '#ffffff', stroke: 6, numStroke: 8, shake: 0.025, duration: 4000, scale: 2.0 },
    ];
    const cfg = tierConfig[Math.min(tier - 1, tierConfig.length - 1)];

    const numText = this.scene.add.text(w / 2, h / 2 - 20, String(threshold), {
      fontSize: cfg.numSize, fontFamily: FONT_FAMILY, color: cfg.color,
      stroke: '#000000', strokeThickness: cfg.numStroke,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(998).setAlpha(0).setScale(3);

    const milestone = this.scene.add.text(w / 2, h / 2 + 25, text, {
      fontSize: cfg.textSize, fontFamily: FONT_FAMILY, color: cfg.color,
      stroke: '#000000', strokeThickness: cfg.stroke,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.POPUP).setAlpha(0).setScale(0.3);

    this.scene.tweens.add({
      targets: numText,
      alpha: { from: 0, to: 0.4 + tier * 0.12 }, scale: 1, duration: 400, ease: 'Back.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: numText,
          scale: { from: 1, to: 1.05 + tier * 0.02 }, duration: 300,
          yoyo: true, repeat: Math.floor(cfg.duration / 600) - 1, ease: 'Sine.easeInOut',
        });
        this.scene.tweens.add({
          targets: numText, alpha: 0, scale: cfg.scale * 1.5,
          duration: 1000, delay: cfg.duration - 1000, ease: 'Power2',
          onComplete: () => numText.destroy(),
        });
      },
    });

    this.scene.tweens.add({
      targets: milestone, alpha: 1, scale: 1, duration: 300, delay: 150, ease: 'Back.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: milestone,
          angle: { from: -2 * tier, to: 2 * tier }, duration: 100,
          yoyo: true, repeat: Math.floor(cfg.duration / 200) - 1, ease: 'Sine.easeInOut',
        });
        this.scene.tweens.add({
          targets: milestone, alpha: 0, scale: cfg.scale, y: milestone.y - 30,
          duration: 800, delay: cfg.duration - 800, ease: 'Power2',
          onComplete: () => milestone.destroy(),
        });
      },
    });

    this.scene.cameras.main.shake(300, cfg.shake);
  }

  showBossHP(name: string, hp: number, maxHP: number): void {
    this.bossMode = true;
    this.bossName = name;
    this.bossHP = hp;
    this.bossMaxHP = maxHP;
  }

  updateBossHP(hp: number): void {
    this.bossHP = hp;
  }

  hideBossHP(): void {
    this.bossMode = false;
  }
}
