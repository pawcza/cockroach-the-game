import Phaser from 'phaser';
import { sfxVolume } from '../audio/AudioManager';
import { DEPTH } from '../config/constants';
import { getLevelForDistance, getLevelProgress, getLevelDistances, LevelConfig } from '../config/levels';
import { headingStyle, hudStyle, smallStyle, buttonStyle, popupStyle, UI_TEXT } from '../utils/TextStyles';
import { createButton, UIButton } from './shared';
import { MenuNav } from './MenuNav';

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
  private touchPauseBtnLabel!: Phaser.GameObjects.Graphics;
  private cricketSound: Phaser.Sound.BaseSound | null = null;

  private onTogglePause: () => void;
  private onRestart: (() => void) | null;
  private onMenu: (() => void) | null;
  private pauseBtns: Phaser.GameObjects.GameObject[] = [];
  private pauseButtons: UIButton[] = [];
  private pauseNav!: MenuNav;
  private lastTitleScore = -1;
  private lastTitleSpeed = -1;
  private lastSpeedColor = -1;

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

  constructor(scene: Phaser.Scene, onTogglePause: () => void, onRestart?: () => void, onMenu?: () => void) {
    this.scene = scene;
    this.onTogglePause = onTogglePause;
    this.onRestart = onRestart ?? null;
    this.onMenu = onMenu ?? null;
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
      .text(this.barX, this.barY + this.barH / 2, 'Lv1 Zwykła Kuchnia (0/100)m', smallStyle({ fontSize: '7px' }))
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
    this.pauseOverlay = this.scene.add.rectangle(w / 2, h / 2, w, h, 0x07050a, 0.72)
      .setScrollFactor(0).setDepth(DEPTH.PAUSE).setVisible(false)
      .setInteractive();
    this.pauseOverlay.on('pointerdown', () => { this.onTogglePause(); });

    this.pauseText = this.scene.add.text(w / 2, h / 2 - 70, 'PAUZA', popupStyle({
      fontSize: '24px',
      color: UI_TEXT.bone,
      strokeThickness: 6,
      shadow: { offsetX: 0, offsetY: 4, color: '#5a0d0d', blur: 0, fill: true, stroke: true },
    })).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.PAUSE_TEXT).setVisible(false);
    this.pauseSubtext = this.scene.add.text(w / 2, h / 2 - 36, 'Esc albo stuknięcie w tło wraca do biegu', smallStyle({ fontSize: '7px', color: UI_TEXT.muted }))
      .setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.PAUSE_TEXT).setVisible(false);

    // Pause menu buttons, stacked: carry on first
    const btnW = 220;
    const btnH = 34;
    const btnGap = 44;
    let btnY = h / 2;
    const btnS = buttonStyle({ fontSize: '10px', strokeThickness: 3 });

    const setupPauseBtn = (btn: ReturnType<typeof createButton>): void => {
      for (const obj of btn.all) {
        const go = obj as unknown as Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth & Phaser.GameObjects.Components.Visible;
        go.setScrollFactor(0);
        go.setDepth(DEPTH.PAUSE_TEXT);
        go.setVisible(false);
      }
      this.pauseBtns.push(...btn.all);
      this.pauseButtons.push(btn);
      btnY += btnGap;
    };

    setupPauseBtn(createButton(this.scene, w / 2, btnY, btnW, btnH, 'Graj dalej', 0x006688, btnS, () => { this.onTogglePause(); }));
    if (this.onRestart) {
      setupPauseBtn(createButton(this.scene, w / 2, btnY, btnW, btnH, 'Od nowa', 0x880000, btnS, () => { this.onRestart!(); }));
    }
    if (this.onMenu) {
      setupPauseBtn(createButton(this.scene, w / 2, btnY, btnW, btnH, 'Menu', 0x444444, btnS, () => { this.onMenu!(); }));
    }
    this.pauseNav = new MenuNav(this.scene);
    this.pauseNav.enabled = false;

    // Pause button — circular, top-right
    const pauseR = 22;
    const pauseX = w - pauseR - 12;
    const pauseY = pauseR + 12;
    this.touchPauseBtn = this.scene.add.circle(pauseX, pauseY, pauseR, 0x000000, 0.35)
      .setStrokeStyle(2, 0xf1e3c6, 0.5).setScrollFactor(0).setDepth(DEPTH.PAUSE_BTN).setInteractive();
    // Two bars, drawn: the pixel font has no pause sign
    this.touchPauseBtnLabel = this.scene.add.graphics({ x: pauseX, y: pauseY })
      .fillStyle(0xf1e3c6, 0.8).fillRect(-7, -8, 5, 16).fillRect(2, -8, 5, 16)
      .setScrollFactor(0).setDepth(DEPTH.PAUSE_BTN_LABEL);
    this.touchPauseBtn.on('pointerdown', () => { this.onTogglePause(); });

    // Draw initial bar state so it's visible during countdown
    this.drawLevelBar(0);
  }

  /** Moves everything centered or right-aligned after the screen changes shape. */
  layout(w: number, h: number): void {
    const dx = w / 2 - this.barX;
    this.scoreText.setX(w / 2);
    this.scoreLabels.setX(w / 2);
    this.barX = w / 2;
    this.levelBarText.setX(this.barX);
    this.speedText.setX(this.barX + this.barW / 2 + 12);

    this.pauseOverlay.setPosition(w / 2, h / 2).setSize(w, h);
    (this.pauseOverlay.input!.hitArea as Phaser.Geom.Rectangle).setSize(w, h);
    this.pauseText.setX(w / 2);
    this.pauseSubtext.setX(w / 2);
    for (const obj of this.pauseBtns) {
      (obj as unknown as Phaser.GameObjects.Components.Transform).x += dx;
    }

    const pauseX = w - this.touchPauseBtn.radius - 12;
    this.touchPauseBtn.setX(pauseX);
    this.touchPauseBtnLabel.setX(pauseX);
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
    this.speedText.setText(`${data.speedMultiplier.toFixed(1)}x`);
    const speedColor = getLevelForDistance(data.distance).color;
    if (speedColor !== this.lastSpeedColor) {
      this.lastSpeedColor = speedColor;
      this.speedText.setColor('#' + speedColor.toString(16).padStart(6, '0'));
    }

    // Wobbly speed text — intensity scales with speed
    const intensity = Math.max(0, (data.speedMultiplier - 1) / 2.4); // 0 at 1x, 1 at the 3.4x cap
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
      this.drawBar(this.bossHP / this.bossMaxHP, 0xcc0000, 0xff0000, 0x330000, false);
      this.levelBarText.setText(`${this.bossName} (${this.bossHP}/${this.bossMaxHP})`);
      this.speedText.setVisible(false);
      return;
    }

    this.speedText.setVisible(true);

    const levelConfig = getLevelForDistance(distance);
    const { levelSpan } = getLevelDistances(distance);
    const barColor = levelConfig.color;

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

    this.drawBar(getLevelProgress(distance), barColor, highlightColor, borderColor, true);

    // Bar text — show total distance / next level threshold
    const nextThreshold = levelConfig.distanceThreshold + levelSpan;
    const distLabel = levelSpan > 0 ? `(${Math.floor(distance)}/${nextThreshold})m` : `${Math.floor(distance)}m`;
    this.levelBarText.setText(`Lv${levelConfig.level} ${levelConfig.name} ${distLabel}`);
  }

  /** The rounded bar at the bottom: shadow, border and dark base, then the fill with its scrolling stripes. */
  private drawBar(progress: number, fillColor: number, stripeColor: number, borderColor: number, shine: boolean): void {
    const bx = this.barX - this.barW / 2;
    const by = this.barY;
    const bw = this.barW;
    const bh = this.barH;
    const r = this.barRadius;

    this.levelBarGfx.clear();
    this.levelBarGfx.fillStyle(0x000000, 0.5);
    this.levelBarGfx.fillRoundedRect(bx + 2, by + 2, bw, bh, r);
    this.levelBarGfx.fillStyle(borderColor, 1);
    this.levelBarGfx.fillRoundedRect(bx - 1, by - 1, bw + 2, bh + 2, r + 1);
    this.levelBarGfx.fillStyle(0x111111, 0.9);
    this.levelBarGfx.fillRoundedRect(bx, by, bw, bh, r);

    const fillW = Math.max(0, bw * progress);
    this.levelBarFillGfx.clear();
    if (fillW <= 2) return;

    const fullWidth = fillW >= bw - r;
    this.levelBarFillGfx.fillStyle(fillColor, 0.85);
    this.levelBarFillGfx.fillRoundedRect(bx, by, fillW, bh, { tl: r, bl: r, tr: fullWidth ? r : 0, br: fullWidth ? r : 0 });

    this.fillScrollX += 0.5;
    const stripeW = 12;
    const stripeStep = stripeW + 8;
    this.levelBarFillGfx.fillStyle(stripeColor, 0.15);
    for (let sx = -stripeStep + (this.fillScrollX % stripeStep); sx < fillW + stripeStep; sx += stripeStep) {
      const clampL = Math.max(bx, Math.min(bx + sx, bx + fillW));
      const clampR = Math.max(bx, Math.min(bx + sx + stripeW, bx + fillW));
      if (clampR > clampL) {
        this.levelBarFillGfx.fillRect(clampL, by + 1, clampR - clampL, bh - 2);
      }
    }

    if (shine) {
      this.levelBarFillGfx.fillStyle(0xffffff, 0.12);
      this.levelBarFillGfx.fillRoundedRect(bx + 2, by + 1, Math.max(0, fillW - 4), bh * 0.35, { tl: r - 1, tr: fullWidth ? r - 1 : 0, bl: 0, br: 0 });
    }
  }

  showPauseOverlay(): void {
    this.pauseOverlay.setVisible(true);
    this.pauseText.setVisible(true).setScale(1).setAlpha(1);
    this.pauseSubtext.setVisible(true).setAlpha(0.7).setAngle(0);
    for (const obj of this.pauseBtns) (obj as unknown as Phaser.GameObjects.Components.Visible).setVisible(true);
    this.pauseNav.set(this.pauseButtons, { initial: this.pauseButtons[0] });
    this.pauseNav.enabled = true;

    if (!this.cricketSound) {
      this.cricketSound = this.scene.sound.add('cricket', { volume: sfxVolume(0.4), loop: true });
    }
    this.cricketSound.play();
  }

  hidePauseOverlay(): void {
    this.pauseOverlay.setVisible(false);
    this.pauseText.setVisible(false);
    this.pauseSubtext.setVisible(false);
    for (const obj of this.pauseBtns) (obj as unknown as Phaser.GameObjects.Components.Visible).setVisible(false);
    this.pauseNav.enabled = false;

    if (this.cricketSound) this.cricketSound.stop();
  }

  showLevelAnnouncement(config: LevelConfig): void {
    const w = this.scene.cameras.main.width;

    const levelLabel = `POZIOM ${config.level}`;
    const nameLabel = config.name.toUpperCase();

    const levelText = this.scene.add.text(w / 2, 60, levelLabel, smallStyle({
      fontSize: '12px', color: '#ffff00', strokeThickness: 4,
    })).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.ANNOUNCEMENT).setScale(0.5).setAlpha(0);

    const nameText = this.scene.add.text(w / 2, 95, nameLabel, headingStyle({
      strokeThickness: 6,
      shadow: { offsetX: 2, offsetY: 2, color: '#ff6600', blur: 8, fill: true, stroke: true },
    })).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.ANNOUNCEMENT).setScale(0.5).setAlpha(0);

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

  /** Opens a Karaluch Dnia run: whose day it is, so a retry knows it is the same run as everyone's. */
  showDailyBanner(date: string): void {
    const w = this.scene.cameras.main.width;
    const [year, month, day] = date.split('-').map(Number);
    const title = this.scene.add.text(w / 2, 60, 'KARALUCH DNIA', headingStyle({
      color: '#e8c15a', strokeThickness: 6,
    })).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.ANNOUNCEMENT).setAlpha(0);
    const when = this.scene.add.text(w / 2, 92, `${day}.${month}.${year} · ten sam bieg dla wszystkich`, smallStyle({
      fontSize: '8px', color: UI_TEXT.bone, strokeThickness: 3,
    })).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.ANNOUNCEMENT).setAlpha(0);
    this.scene.tweens.add({
      targets: [title, when], alpha: 1, duration: 300,
      onComplete: () => {
        this.scene.tweens.add({
          targets: [title, when], alpha: 0, duration: 500, delay: 2200,
          onComplete: () => { title.destroy(); when.destroy(); },
        });
      },
    });
  }

  showScoreMilestone(text: string, tier: number, threshold: number): void {
    const w = this.scene.cameras.main.width;

    const tierConfig = [
      { numSize: '20px', textSize: '10px', color: '#ffff00', stroke: 3, numStroke: 4, shake: 0.005, duration: 1200, scale: 1.3, wobbleAngle: 1.5, wobbleInterval: 150 },
      { numSize: '26px', textSize: '12px', color: '#ff8800', stroke: 4, numStroke: 5, shake: 0.008, duration: 1500, scale: 1.5, wobbleAngle: 2, wobbleInterval: 150 },
      { numSize: '32px', textSize: '14px', color: '#ff4400', stroke: 4, numStroke: 6, shake: 0.012, duration: 1800, scale: 1.6, wobbleAngle: 2.5, wobbleInterval: 180 },
      { numSize: '36px', textSize: '16px', color: '#ff00ff', stroke: 5, numStroke: 7, shake: 0.018, duration: 2000, scale: 1.8, wobbleAngle: 3, wobbleInterval: 200 },
      { numSize: '42px', textSize: '20px', color: '#ffffff', stroke: 6, numStroke: 8, shake: 0.025, duration: 2200, scale: 2.0, wobbleAngle: 3, wobbleInterval: 220 },
    ];
    const cfg = tierConfig[Math.min(tier - 1, tierConfig.length - 1)];

    const numText = this.scene.add.text(w / 2, 60, String(threshold), popupStyle({
      fontSize: cfg.numSize, color: cfg.color, strokeThickness: cfg.numStroke,
    })).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.SCORE_MILESTONE).setAlpha(0).setScale(3);

    const milestone = this.scene.add.text(w / 2, 90, text, popupStyle({
      fontSize: cfg.textSize, color: cfg.color, strokeThickness: cfg.stroke,
    })).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.POPUP).setAlpha(0).setScale(0.3);

    this.scene.tweens.add({
      targets: numText,
      alpha: { from: 0, to: 0.25 + tier * 0.08 }, scale: 1, duration: 400, ease: 'Back.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: numText,
          scale: { from: 1, to: 1.02 + tier * 0.01 }, duration: 300,
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
          angle: { from: -cfg.wobbleAngle, to: cfg.wobbleAngle }, duration: cfg.wobbleInterval,
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
    if (hp > this.bossMaxHP) this.bossMaxHP = hp;
    this.bossHP = hp;
  }

  hideBossHP(): void {
    this.bossMode = false;
  }
}
