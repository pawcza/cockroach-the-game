import Phaser from 'phaser';
import { sfxVolume } from '../audio/AudioManager';
import { DEPTH, PIXEL_BLOCK } from '../config/constants';
import { ATLAS, SPRITE_SCALE, frameOf } from '../config/sprites';
import { getLevelForDistance, LevelConfig, LEVELS } from '../config/levels';
import { headingStyle, hudStyle, smallStyle, buttonStyle, popupStyle, UI_TEXT } from '../utils/TextStyles';
import { createButton, UIButton } from './shared';
import { textBeat } from '../utils/TweenPatterns';
import { MenuNav } from './MenuNav';
import { getFx } from '../effects/Fx';
import { AbilityStrip, type AbilityView } from './AbilityStrip';

/** The pause plate's radius in world px: 12 texels. */
const PAUSE_RADIUS = 12 * SPRITE_SCALE;
const PAUSE_ALPHA = 0.88;

/** Emitted on the scene when a level is announced. */
export const LEVEL_ANNOUNCED_EVENT = 'level-announced';

export interface HUDUpdateData {
  score: number;
  distance: number;
  speedMultiplier: number;
  currentFloor: 'top' | 'bottom';
  pickupCombo: number;
  comboMultiplier: number;
  timeNow: number;
  /** What the run owns; left out while watching someone else's. */
  abilities?: AbilityView;
  /** The level the run is in, when it is not simply the one for the distance (it waits on a boss). */
  level?: number;
  /** The opening tutorial is on: the bar says so instead of a level. */
  tutorial?: boolean;
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

  // Top left: which powers the run owns
  private abilityStrip!: AbilityStrip;

  // Pause
  private pauseOverlay!: Phaser.GameObjects.Rectangle;
  private pauseText!: Phaser.GameObjects.Text;
  private pauseSubtext!: Phaser.GameObjects.Text;
  private touchPauseBtn!: Phaser.GameObjects.Image;
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

    this.abilityStrip = new AbilityStrip(this.scene, !this.scene.sys.game.device.os.desktop);

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
      setupPauseBtn(createButton(this.scene, w / 2, btnY, btnW, btnH, 'Menu', 0x444444, btnS, () => { this.onMenu!(); }, { sound: 'back' }));
    }
    this.pauseNav = new MenuNav(this.scene);
    this.pauseNav.enabled = false;

    // Pause button, top-right: the same plate as the touch buttons, 24 texels across
    const pauseX = w - PAUSE_RADIUS - 12;
    const pauseY = PAUSE_RADIUS + 12;
    this.touchPauseBtn = this.scene.add.image(pauseX, pauseY, ATLAS, frameOf('btn-pause', 0))
      .setScale(SPRITE_SCALE).setAlpha(PAUSE_ALPHA).setScrollFactor(0).setDepth(DEPTH.PAUSE_BTN);
    // Hit area in frame texels: the plate's middle is texel (14, 13)
    this.touchPauseBtn.setInteractive(new Phaser.Geom.Circle(14, 13, 12 + 3), Phaser.Geom.Circle.Contains);
    const sink = (down: boolean): void => {
      this.touchPauseBtn.setFrame(frameOf('btn-pause', down ? 1 : 0)).setAlpha(down ? 1 : PAUSE_ALPHA);
    };
    this.touchPauseBtn.on('pointerdown', () => { sink(true); this.onTogglePause(); });
    this.touchPauseBtn.on('pointerup', () => sink(false));
    this.touchPauseBtn.on('pointerupoutside', () => sink(false));

    // Draw initial bar state so it's visible during countdown
    this.drawLevelBar(0, LEVELS[0], false);
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

    this.touchPauseBtn.setX(w - PAUSE_RADIUS - 12);
  }

  updateScore(score: number): void {
    this.scoreText.setText(String(score));
  }

  update(data: HUDUpdateData): void {
    const time = data.timeNow;

    // === TOP CENTER: Score line with labels ===
    this.scoreText.setText(`${data.score} / x${data.pickupCombo} / x${data.comboMultiplier.toFixed(1)}`);

    this.abilityStrip.sync(data.abilities);

    // === BOTTOM: Level progress bar ===
    const level = data.level !== undefined ? LEVELS[data.level - 1] : getLevelForDistance(data.distance);
    this.drawLevelBar(data.distance, level, data.tutorial === true);

    // Speed text + color from level
    this.speedText.setText(`${data.speedMultiplier.toFixed(1)}x`);
    const speedColor = level.color;
    if (speedColor !== this.lastSpeedColor) {
      this.lastSpeedColor = speedColor;
      this.speedText.setColor('#' + speedColor.toString(16).padStart(6, '0'));
    }

    // The speed shakes harder the faster it gets: whole blocks, never turned or scaled
    const intensity = Math.max(0, (data.speedMultiplier - 1) / 2.4); // 0 at 1x, 1 at the 3.4x cap
    const baseSpeedX = this.barX + this.barW / 2 + 12;
    const baseSpeedY = this.barY + this.barH / 2;
    const block = (v: number): number => Math.round(v / 2) * 2;
    if (intensity > 0.1) {
      const shakeX = Math.sin(time * 0.006 * (1 + intensity * 2)) * intensity * 6;
      const shakeY = Math.cos(time * 0.009 * (1 + intensity * 2)) * intensity * 4;
      this.speedText.setX(block(baseSpeedX + shakeX)).setY(block(baseSpeedY + shakeY));
    } else {
      this.speedText.setX(baseSpeedX).setY(baseSpeedY);
    }

    // Dynamic page title
    const roundedSpeed = Math.floor(data.speedMultiplier * 10);
    if (data.score !== this.lastTitleScore || roundedSpeed !== this.lastTitleSpeed) {
      document.title = `KARALUCH | ${data.score} pkt | ${data.speedMultiplier.toFixed(1)}x`;
      this.lastTitleScore = data.score;
      this.lastTitleSpeed = roundedSpeed;
    }

  }

  private drawLevelBar(distance: number, levelConfig: LevelConfig, tutorial: boolean): void {
    // Boss HP mode — repurpose the level bar
    if (this.bossMode) {
      this.drawBar(this.bossHP / this.bossMaxHP, 0xcc0000, 0xff0000, 0x330000, false);
      this.levelBarText.setText(`${this.bossName} (${this.bossHP}/${this.bossMaxHP})`);
      this.speedText.setVisible(false);
      return;
    }

    this.speedText.setVisible(true);

    const index = LEVELS.indexOf(levelConfig);
    const levelSpan = index + 1 < LEVELS.length ? LEVELS[index + 1].distanceThreshold - levelConfig.distanceThreshold : 0;
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

    if (tutorial) {
      this.drawBar(0, barColor, highlightColor, borderColor, true);
      this.levelBarText.setText('Samouczek');
      return;
    }
    const progress = levelSpan > 0 ? Phaser.Math.Clamp((distance - levelConfig.distanceThreshold) / levelSpan, 0, 1) : 1;
    this.drawBar(progress, barColor, highlightColor, borderColor, true);

    // Bar text — show total distance / next level threshold
    const nextThreshold = levelConfig.distanceThreshold + levelSpan;
    // Past the level's end while its boss waits (the fight is fought in the old level) there is no "next" to count to
    const distLabel = levelSpan > 0 && distance < nextThreshold ? `(${Math.floor(distance)}/${nextThreshold})m` : `${Math.floor(distance)}m`;
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
    // The bosses keep quiet over it (TauntDirector)
    this.scene.events.emit(LEVEL_ANNOUNCED_EVENT);

    const levelLabel = `POZIOM ${config.level}`;
    const nameLabel = config.name.toUpperCase();

    const levelText = this.scene.add.text(w / 2, 60, levelLabel, smallStyle({
      fontSize: '12px', color: '#ffff00', strokeThickness: 4,
    })).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.ANNOUNCEMENT);

    const nameText = this.scene.add.text(w / 2, 95, nameLabel, headingStyle({
      strokeThickness: 6,
      shadow: { offsetX: 2, offsetY: 2, color: '#ff6600', blur: 0, fill: true, stroke: true },
    })).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.ANNOUNCEMENT);

    textBeat(this.scene, [levelText, nameText], { rise: 12, inMs: 220, hold: 1500, outMs: 400, outRise: 10 });
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

    // Tiers 1-5 are the first ten milestones; 6-10 are the last five, each clearly bigger than the one before
    // numY and textY keep the pair clear of each other and of the score above; nothing may reach the achievement toasts
    // that start at y 120 on the right
    const tierConfig = [
      { numSize: '20px', textSize: '10px', color: '#ffff00', stroke: 3, numStroke: 4, shake: 0.005, duration: 1200, numY: 60, textY: 90 },
      { numSize: '26px', textSize: '12px', color: '#ff8800', stroke: 4, numStroke: 5, shake: 0.008, duration: 1500, numY: 60, textY: 90 },
      { numSize: '32px', textSize: '14px', color: '#ff4400', stroke: 4, numStroke: 6, shake: 0.012, duration: 1800, numY: 60, textY: 90 },
      { numSize: '36px', textSize: '16px', color: '#ff00ff', stroke: 5, numStroke: 7, shake: 0.018, duration: 2000, numY: 60, textY: 90 },
      { numSize: '42px', textSize: '20px', color: '#ffffff', stroke: 6, numStroke: 8, shake: 0.025, duration: 2200, numY: 60, textY: 90 },
      { numSize: '46px', textSize: '20px', color: '#00ffff', stroke: 6, numStroke: 8, shake: 0.028, duration: 2400, numY: 64, textY: 100 },
      { numSize: '52px', textSize: '22px', color: '#ffee00', stroke: 6, numStroke: 9, shake: 0.031, duration: 2600, numY: 68, textY: 106 },
      { numSize: '52px', textSize: '22px', color: '#ff66cc', stroke: 6, numStroke: 9, shake: 0.034, duration: 2800, numY: 68, textY: 106 },
      { numSize: '56px', textSize: '22px', color: '#aaff00', stroke: 7, numStroke: 10, shake: 0.037, duration: 3000, numY: 70, textY: 110 },
      { numSize: '56px', textSize: '26px', color: '#ffffff', stroke: 7, numStroke: 10, shake: 0.04, duration: 3200, numY: 70, textY: 112 },
    ];
    const cfg = tierConfig[Math.min(tier - 1, tierConfig.length - 1)];

    const numText = this.scene.add.text(w / 2, cfg.numY, String(threshold), popupStyle({
      fontSize: cfg.numSize, color: cfg.color, strokeThickness: cfg.numStroke,
    })).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.SCORE_MILESTONE);

    const milestone = this.scene.add.text(w / 2, cfg.textY, text, popupStyle({
      fontSize: cfg.textSize, color: cfg.color, strokeThickness: cfg.stroke,
    })).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.POPUP);

    // The number slams down in whole sizes (3, 2, 1; from 2 at the top tiers, where it is already wide) and goes up
    // to twice its size; the line under it rises in after
    textBeat(this.scene, [numText], { rise: 0, inMs: 300, from: tier >= 8 ? 2 : 3, hold: cfg.duration - 1000, outMs: 700, outRise: 0, to: 2, alpha: tier >= 6 ? 1 : 0.25 + tier * 0.08 });
    textBeat(this.scene, [milestone], { rise: 12, inMs: 250, delay: 150, hold: cfg.duration - 1200, outMs: 600, outRise: 30 });

    // Past tier 5 the pair stands on a dark plate drawn over the bursts and under the text, so the number and the line
    // read whatever is flaring behind them (the library has no burst bigger than milestone-3, so the top tiers are
    // made of more of it, drawn bigger: the plate is what keeps them legible)
    const burstDepth = DEPTH.SCORE_MILESTONE - 2;
    let bottom = cfg.textY + 24;
    if (tier >= 6) {
      const plateW = Math.ceil((Math.max(numText.displayWidth, milestone.displayWidth) + 40) / PIXEL_BLOCK) * PIXEL_BLOCK;
      const top = Math.round(cfg.numY - numText.height * 0.4);
      bottom = Math.round(cfg.textY + milestone.height * 0.4);
      const plate = this.scene.add.rectangle(w / 2, (top + bottom) / 2, plateW, bottom - top, 0x000000, 1)
        .setScrollFactor(0).setDepth(DEPTH.SCORE_MILESTONE - 1).setAlpha(0);
      this.scene.tweens.add({ targets: plate, alpha: 0.82, duration: 150 });
      this.scene.tweens.add({ targets: plate, alpha: 0, delay: cfg.duration - 600, duration: 600, onComplete: () => plate.destroy() });
    }
    // A burst behind the number, bigger and hotter with the tier, and sparkles thrown off the biggest; the top tiers
    // draw it at twice and three times the size and add more of it, in waves to either side, after the slam has landed
    const fx = getFx(this.scene);
    const lead = tier >= 6 ? 120 : 0;
    const bursts: { dx: number; delay: number; scale: number }[] = [{ dx: 0, delay: lead, scale: tier >= 9 ? 3 : tier >= 6 ? 2 : 1 }];
    if (tier >= 7) bursts.push({ dx: 0, delay: lead + 180, scale: tier >= 9 ? 2 : 1 });
    if (tier >= 8) bursts.push({ dx: -110, delay: lead + 120, scale: 2 }, { dx: 110, delay: lead + 120, scale: 2 });
    if (tier >= 10) bursts.push({ dx: -210, delay: lead + 260, scale: 2 }, { dx: 210, delay: lead + 260, scale: 2 });
    for (const b of bursts) {
      fx.play(`milestone-${tier >= 4 ? 3 : tier >= 3 ? 2 : 1}`, w / 2 + b.dx, cfg.numY + 4, { scrollFactor: 0, depth: burstDepth, scale: b.scale, delay: b.delay, alpha: tier >= 6 ? 0.8 : 1 });
    }
    if (tier >= 3) {
      fx.burst('twinkle', w / 2, cfg.numY + 10, tier * 2, tier >= 6 ? 90 + (tier - 5) * 30 : 90, { scrollFactor: 0, depth: burstDepth, delay: 120 + lead });
    }
    // Combo-tier notices keep clear of it (NotificationManager)
    this.scene.events.emit('score-milestone', bottom, cfg.duration);

    this.scene.cameras.main.shake(300 + Math.max(0, tier - 5) * 80, cfg.shake);
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
