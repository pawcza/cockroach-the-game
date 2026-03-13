import Phaser from 'phaser';
import {
  FLOOR_BOTTOM_Y,
  FLOOR_TOP_Y,
  COCKROACH_START_X,
} from '../config/constants';

import { ObstacleSpawner } from '../objects/ObstacleSpawner';
import { SeededRNG } from '../multiplayer/SeededRNG';
import { mpClient, MPPlayer } from '../multiplayer/MultiplayerClient';
import { GhostManager } from '../multiplayer/GhostManager';
import { VisualEffects } from '../effects/VisualEffects';
import { AudioManager } from '../audio/AudioManager';
import { getLevelForDistance, LevelConfig } from '../config/levels';
import { GameHUD } from '../ui/GameHUD';
import { TouchControls } from '../ui/TouchControls';
import { Player } from '../objects/Player';

import { InputManager } from '../systems/InputManager';
import { CollisionManager } from '../systems/CollisionManager';
import { PauseManager } from '../systems/PauseManager';
import { GameOverHandler } from '../systems/GameOverHandler';
import { FloorRenderer } from '../systems/FloorRenderer';
import { PickupSpawner } from '../systems/PickupSpawner';

export class GameScene extends Phaser.Scene {
  public floorBottomY = FLOOR_BOTTOM_Y;
  public floorTopY = FLOOR_TOP_Y;

  private player!: Player;
  private _isDead = false;

  public get cockroach(): Phaser.Physics.Arcade.Sprite { return this.player.sprite; }
  public get isDead(): boolean { return this._isDead; }
  private set isDead(val: boolean) { this._isDead = val; }

  // Multiplayer
  private rng: SeededRNG | null = null;
  private isMultiplayer = false;
  private ghostManager: GhostManager | null = null;
  private _wasDashing = false;
  private _wasPillActive = false;

  // Level
  private currentLevel = 0;

  // Backgrounds
  private skyBg!: Phaser.GameObjects.TileSprite;
  private midBg!: Phaser.GameObjects.TileSprite;
  private fgBg!: Phaser.GameObjects.TileSprite;
  private nextSkyBg!: Phaser.GameObjects.TileSprite;
  private nextMidBg!: Phaser.GameObjects.TileSprite;
  private nextFgBg!: Phaser.GameObjects.TileSprite;
  private bgTransitioning = false;

  // Groups
  private obstacles!: Phaser.Physics.Arcade.Group;
  private apples!: Phaser.Physics.Arcade.Group;
  private tyskies!: Phaser.Physics.Arcade.Group;
  private pills!: Phaser.Physics.Arcade.Group;

  // Subsystems
  private obstacleSpawner!: ObstacleSpawner;
  private vfx!: VisualEffects;
  private audio!: AudioManager;
  private hud!: GameHUD;
  private touchControls!: TouchControls;
  private inputManager!: InputManager;
  private collisionManager!: CollisionManager;
  private pauseManager!: PauseManager;
  private gameOverHandler!: GameOverHandler;
  private floorRenderer!: FloorRenderer;
  private pickupSpawner!: PickupSpawner;

  // Scoring
  private score = 0;
  private activePlayTime = 0;
  private lastFrameTime = 0;
  private lastScoreTime = 0;
  private lastMilestone = 1;
  private pickupCombo = 0;

  // Countdown
  private isCountingDown = true;
  private countdownStartReal = 0;
  private countdownLastShown = -1;

  // Ambient
  private dustTimer = 0;
  private birdOverlookTimer = 0;
  private nextBirdOverlookTime = 0;
  private cockroachNoiseTimer = 0;
  private nextNoiseTime = 0;
  private cockroachNoiseSound: Phaser.Sound.BaseSound | null = null;

  private isMobile = false;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    const data = this.scene.settings.data as {
      multiplayer?: boolean; seed?: number; players?: MPPlayer[]; myId?: string;
    } | undefined;

    this.isMultiplayer = data?.multiplayer ?? false;
    this.rng = (this.isMultiplayer && data?.seed != null) ? new SeededRNG(data.seed) : null;
    this.isMobile = !this.sys.game.device.os.desktop;
    this.floorBottomY = FLOOR_BOTTOM_Y;
    this.floorTopY = FLOOR_TOP_Y;

    this.resetState();
    this.createBackgrounds();

    // Floor renderer
    this.floorRenderer = new FloorRenderer(this);
    this.floorRenderer.create(this.floorTopY, this.floorBottomY);
    this.floorRenderer.resetRanges(COCKROACH_START_X);

    // Audio + Player
    const COLLIDER_DROP = 8;
    this.audio = new AudioManager(this);
    this.player = new Player(this, this.audio, this.floorTopY + COLLIDER_DROP, this.floorBottomY + COLLIDER_DROP);
    this.player.create();
    this.player.resetState();

    // Groups
    this.obstacles = this.physics.add.group();
    this.data.set('obstacles', this.obstacles);
    this.apples = this.physics.add.group();
    this.tyskies = this.physics.add.group();
    this.pills = this.physics.add.group();

    // Obstacle + pickup spawner
    this.obstacleSpawner = new ObstacleSpawner(this, this.obstacles);
    if (this.rng) this.obstacleSpawner.setRNG(this.rng);
    this.pickupSpawner = new PickupSpawner(this, this.obstacles, this.apples, this.tyskies, this.pills, this.obstacleSpawner, this.rng, this.floorTopY, this.floorBottomY);

    // VFX + HUD + Touch
    this.vfx = new VisualEffects(this);
    this.vfx.init();
    this.pauseManager = new PauseManager(this, this.hud!, this.isMultiplayer);
    this.hud = new GameHUD(this, this.isMobile, () => {
      if (this.isDead || this.isCountingDown) return;
      this.pauseManager.togglePause(() => { this.lastFrameTime = this.time.now; });
    });
    this.hud.create();
    // Re-create pause manager now that hud exists
    this.pauseManager = new PauseManager(this, this.hud, this.isMultiplayer);

    this.touchControls = new TouchControls(this, this.isMobile, {
      onSwap: () => { this.player.swapLane(); if (this.isMultiplayer) mpClient.sendSwap(this.player.currentFloor); },
      onDash: () => { this.player.startDash(); if (this.isMultiplayer) mpClient.sendDashStart(); },
      isDisabled: () => this.isDead || this.pauseManager.isPaused || this.isCountingDown || this.pauseManager.isUnpauseCountdown,
      isDashAllowed: () => this.player.dashReady && !this.player.isDashing,
    });
    this.touchControls.create();

    // Input, collision, game-over managers
    this.inputManager = new InputManager(this, this.player, this.touchControls, this.hud, this.isMultiplayer, this.isMobile,
      () => this.isDead || this.pauseManager.isPaused || this.isCountingDown || this.pauseManager.isUnpauseCountdown);
    this.gameOverHandler = new GameOverHandler(this, this.player, this.vfx, this.audio, this.isMultiplayer, {
      getScore: () => this.score, getActivePlayTime: () => this.activePlayTime,
      getDistance: () => this.getDistance(), getCurrentLevel: () => this.currentLevel,
      getGhostManager: () => this.ghostManager, setGhostManager: (gm) => { this.ghostManager = gm; },
    });
    this.collisionManager = new CollisionManager(this, this.player, this.vfx, this.audio, this.hud, this.isMultiplayer, {
      onDie: (obstacleType) => this.die(obstacleType),
      getPickupCombo: () => this.pickupCombo, setPickupCombo: (v) => { this.pickupCombo = v; },
      getScore: () => this.score, setScore: (v) => { this.score = v; },
    });
    this.collisionManager.setupCollisions(this.floorRenderer.floorTopBody, this.floorRenderer.floorBottomBody, this.obstacles, this.apples, this.tyskies, this.pills);

    // Multiplayer
    if (this.isMultiplayer && data?.players && data?.myId) {
      this.ghostManager = new GhostManager(this, data.players, data.myId, this.floorTopY + COLLIDER_DROP, this.floorBottomY + COLLIDER_DROP, COCKROACH_START_X);
      this.setupMultiplayerListeners();
    }

    // Camera
    this.cameras.main.startFollow(this.player.sprite, true, 1, 0);
    this.cameras.main.setFollowOffset(-200, 0);
    this.cameras.main.scrollY = 0;

    // Start
    this.audio.startBGM('bgm-lv1');
    const blinkTween = this.player.startInvulnerabilityBlink();
    this.time.delayedCall(1500, () => this.player.endInvulnerability(blinkTween));
    this.player.freezeForCountdown();
    this.countdownStartReal = performance.now();
    this.countdownLastShown = -1;
  }

  update(): void {
    if (this.isDead) {
      if (this.isMultiplayer && this.ghostManager?.isSpectating) this.updateSpectating();
      return;
    }
    if (this.isCountingDown) {
      this.player.freezeForCountdown();
      this.updateCountdown();
      this.updateFloors();
      this.pickupSpawner.handleSpawning();
      this.updateParallax();
      return;
    }

    const input = this.inputManager.poll();
    if (input.escPressed) this.pauseManager.togglePause(() => { this.lastFrameTime = this.time.now; });
    if (this.pauseManager.isPaused) {
      if (this.inputManager.anyKeyJustDown()) { this.pauseManager.togglePause(() => { this.lastFrameTime = this.time.now; }); this.lastFrameTime = this.time.now; return; }
      this.lastFrameTime = this.time.now;
      return;
    }

    this.activePlayTime += this.time.now - this.lastFrameTime;
    this.lastFrameTime = this.time.now;
    this.player.updateSpeed(this.activePlayTime, this.currentLevel);
    this.updateDustTrail();
    this.updateParallax();
    this.updateFloors();

    if (this.player.y > this.cameras.main.height + 50 || this.player.y < -100) { this.die(); return; }

    this.inputManager.handleGameInput(input);
    this.player.updateDash();
    this.player.updatePill();
    this.syncMultiplayerState();
    this.player.updateVisuals();

    if (this.time.now - this.lastScoreTime >= 1000) { this.score += 1; this.lastScoreTime = this.time.now; }
    this.checkScoreMilestones();

    const distance = this.getDistance();
    const newLevelConfig = getLevelForDistance(distance);
    if (newLevelConfig.level !== this.currentLevel) { this.currentLevel = newLevelConfig.level; this.switchLevel(newLevelConfig); }

    this.hud.update({
      score: this.score, distance, speedMultiplier: this.player.speedMultiplier,
      currentFloor: this.player.currentFloor, pickupCombo: this.pickupCombo,
      comboMultiplier: this.collisionManager.getComboMultiplier(),
      dashReady: this.player.dashReady, isDashing: this.player.isDashing,
      dashStartTime: this.player.dashStartTime, timeNow: this.time.now,
    });
    this.touchControls.updateDashState(this.player.dashReady, this.player.isDashing);

    this.pickupSpawner.handleSpawning();
    this.showObstacleWarnings();
    this.pickupSpawner.cleanupOffscreen(() => { this.pickupCombo = 0; });
    this.vfx.update(this.player.speedMultiplier);
    this.audio.updatePitch(this.player.speedMultiplier * this.player.pillSpeedBoost);
    this.updateAmbientEffects();

    if (this.ghostManager) this.ghostManager.update(this.game.loop.delta, this.cameras.main.scrollX, this.cameras.main.width, this.cameras.main.height);
  }

  // ── Initialization ──

  private resetState(): void {
    this.ghostManager = null;
    this._wasDashing = false;
    this._wasPillActive = false;
    this.score = 0;
    this.isDead = false;
    this.activePlayTime = 0;
    this.lastFrameTime = this.time.now;
    this.lastScoreTime = this.time.now;
    this.lastMilestone = 0;
    this.isCountingDown = true;
    this.dustTimer = 0;
    this.birdOverlookTimer = 0;
    this.nextBirdOverlookTime = 15000 + Math.random() * 10000;
    this.cockroachNoiseTimer = 0;
    this.nextNoiseTime = 20000 + Math.random() * 15000;
    this.pickupCombo = 0;
    this.currentLevel = 1;
  }

  private createBackgrounds(): void {
    const w = this.cameras.main.width, h = this.cameras.main.height;
    this.skyBg = this.add.tileSprite(0, 0, w, h, 'lv1-sky').setOrigin(0, 0).setScrollFactor(0).setAlpha(0.8);
    this.midBg = this.add.tileSprite(0, 0, w, h, 'lv1-bg').setOrigin(0, 0).setScrollFactor(0).setDepth(1).setAlpha(0.15).setBlendMode(Phaser.BlendModes.SOFT_LIGHT);
    this.fgBg = this.add.tileSprite(0, 0, w, h, 'lv1-fg').setOrigin(0, 0).setScrollFactor(0).setDepth(2);
    this.nextSkyBg = this.add.tileSprite(0, 0, w, h, 'lv1-sky').setOrigin(0, 0).setScrollFactor(0).setAlpha(0);
    this.nextMidBg = this.add.tileSprite(0, 0, w, h, 'lv1-bg').setOrigin(0, 0).setScrollFactor(0).setDepth(1).setAlpha(0).setBlendMode(Phaser.BlendModes.SOFT_LIGHT);
    this.nextFgBg = this.add.tileSprite(0, 0, w, h, 'lv1-fg').setOrigin(0, 0).setScrollFactor(0).setDepth(2).setAlpha(0);
    this.bgTransitioning = false;
  }

  // ── Update helpers ──

  private updateCountdown(): void {
    const elapsed = performance.now() - this.countdownStartReal;
    const texts = ['3', '2', '1', 'JAZDA!'];
    const step = Math.floor(elapsed / 600);
    if (step < texts.length && step > this.countdownLastShown) {
      this.countdownLastShown = step;
      const t = texts[step];
      const ct = this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2 - 30, t, {
        fontSize: t === 'JAZDA!' ? '24px' : '32px', fontFamily: '"Press Start 2P", monospace',
        color: t === 'JAZDA!' ? '#00ff00' : '#ffffff', stroke: '#000000', strokeThickness: 6,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(1000);
      this.tweens.add({ targets: ct, scale: { from: 2, to: 0.5 }, alpha: { from: 1, to: 0 }, duration: 500, ease: 'Power2', onComplete: () => ct.destroy() });
    }
    if (elapsed >= texts.length * 600) {
      this.isCountingDown = false;
      this.player.startRunning();
      this.lastFrameTime = this.time.now;
      this.activePlayTime = 0;
      this.lastScoreTime = this.time.now;
    }
  }

  private updateSpectating(): void {
    const target = this.ghostManager!.spectateTargetPlayer;
    if (target && target.alive) {
      const camFactor = 1 - Math.pow(1 - 0.25, this.game.loop.delta / 16.667);
      this.cameras.main.scrollX += (target.sprite.x - 200 - this.cameras.main.scrollX) * camFactor;
    }
    const cursors = this.inputManager.cursorKeys;
    if (Phaser.Input.Keyboard.JustDown(cursors.left) || Phaser.Input.Keyboard.JustDown(cursors.up)) this.ghostManager!.cycleSpectate(-1);
    if (Phaser.Input.Keyboard.JustDown(cursors.right) || Phaser.Input.Keyboard.JustDown(cursors.down)) this.ghostManager!.cycleSpectate(1);
    if (target && target.alive) {
      const ghostDist = Math.floor((target.sprite.x - COCKROACH_START_X) / 50);
      const cfg = getLevelForDistance(ghostDist);
      if (cfg.level !== this.currentLevel) { this.currentLevel = cfg.level; this.switchLevel(cfg); }
    }
    this.updateParallax(); this.updateFloors(); this.pickupSpawner.handleSpawning(); this.pickupSpawner.cleanupOffscreen(() => {});
    this.ghostManager!.update(this.game.loop.delta, this.cameras.main.scrollX, this.cameras.main.width, this.cameras.main.height);
    if (target && !target.alive) {
      const next = this.ghostManager!.cycleSpectate(1);
      if (!next && this.ghostManager!.allDead()) this.gameOverHandler.triggerMultiplayerGameOver();
    }
  }

  private syncMultiplayerState(): void {
    if (!this.isMultiplayer) return;
    if (this._wasDashing && !this.player.isDashing) mpClient.sendDashEnd();
    this._wasDashing = this.player.isDashing;
    if (this._wasPillActive && !this.player.isPillActive) mpClient.sendPillEnd();
    this._wasPillActive = this.player.isPillActive;
  }

  private die(obstacleType?: string | null): void {
    if (this.isDead) return;
    this.isDead = true;
    this.gameOverHandler.die(() => {}, obstacleType);
  }

  private getDistance(): number { return Math.floor((this.player.x - COCKROACH_START_X) / 50); }

  // ── Multiplayer ──

  private setupMultiplayerListeners(): void {
    this.gameOverHandler.setupMultiplayerListeners(() => this.isDead);
    mpClient.on('game:swap', (d: any) => { this.ghostManager?.handleSwap(d.id, d.lane); });
    mpClient.on('game:dash-start', (d: any) => { this.ghostManager?.handleDashStart(d.id); });
    mpClient.on('game:dash-end', (d: any) => { this.ghostManager?.handleDashEnd(d.id); });
    mpClient.on('game:pill-start', (d: any) => { this.ghostManager?.handlePillStart(d.id); });
    mpClient.on('game:pill-end', (d: any) => { this.ghostManager?.handlePillEnd(d.id); });
    mpClient.on('game:pickup', (d: any) => { if (this.isDead) this.pickupSpawner.queuePickupDestruction(d.x); });
    this.events.on('shutdown', () => {
      if (this.isMultiplayer) {
        for (const e of ['game:swap','game:dash-start','game:dash-end','game:pill-start','game:pill-end','game:pickup','game:death','game:player-left','game:over']) mpClient.off(e);
      }
      this.ghostManager?.destroy(); this.ghostManager = null;
    });
  }

  // ── Score ──

  private checkScoreMilestones(): void {
    const milestones = [
      { threshold: 100, text: 'SETUNIA MMMMMMM', tier: 1 }, { threshold: 250, text: 'MA\u0141PECZKA Z \u017bABKI', tier: 1 },
      { threshold: 420, text: 'BLAZE IT!', tier: 2 }, { threshold: 500, text: 'PI\u0118\u0106 DYCH NA BROWARA!', tier: 2 },
      { threshold: 1000, text: 'GRAJ ZE MNOM W TYSI\u0104CA', tier: 3 }, { threshold: 1500, text: 'MI\u00d3D PITNY P\u00d3\u0141TORAK', tier: 3 },
      { threshold: 2000, text: 'DWA KAFLE WYP\u0141ATY', tier: 4 }, { threshold: 2137, text: 'KREM\u00d3WKI DLA WSZYSTKICH!', tier: 5 },
      { threshold: 3000, text: 'TRZY WIELKIE KLOCE', tier: 4 }, { threshold: 4000, text: 'BANIA U CYGANA', tier: 4 },
      { threshold: 4200, text: 'SNOOP DOGGY DOGG', tier: 5 }, { threshold: 5000, text: 'GDZIE KARALUCHY ZIMUJOM', tier: 5 },
      { threshold: 10000, text: 'KARALUCH JEST BOGIEM!', tier: 5 },
    ];
    for (const m of milestones) {
      if (this.score >= m.threshold && this.lastMilestone < m.threshold) {
        this.lastMilestone = m.threshold;
        this.hud.showScoreMilestone(m.text, m.tier, m.threshold);
        this.sound.play(`milestone-${m.threshold}`, { volume: 0.7 });
        break;
      }
    }
  }

  // ── Ambient ──

  private updateDustTrail(): void {
    this.dustTimer += this.game.loop.delta;
    const interval = Math.max(100, 300 / this.player.speedMultiplier);
    const onGround = this.player.sprite.body!.touching.down || this.player.sprite.body!.blocked.down;
    if (this.dustTimer >= interval && onGround) {
      this.dustTimer = 0;
      const dust = this.add.circle(this.player.x - 20, this.player.y + 10, 2 + Math.random() * 2, 0x8b7355, 0.6);
      this.tweens.add({ targets: dust, y: dust.y - 15, alpha: 0, scaleX: 0.3, scaleY: 0.3, duration: 400, onComplete: () => dust.destroy() });
    } else if (this.dustTimer >= interval) { this.dustTimer = 0; }
  }

  private updateAmbientEffects(): void {
    this.birdOverlookTimer += this.game.loop.delta;
    if (this.birdOverlookTimer >= this.nextBirdOverlookTime) {
      this.birdOverlookTimer = 0; this.nextBirdOverlookTime = 15000 + Math.random() * 10000;
      const corners = [{ x: 60, y: this.cameras.main.height - 60, fx: false, fy: false }, { x: this.cameras.main.width - 60, y: this.cameras.main.height - 60, fx: true, fy: false }, { x: 60, y: 60, fx: false, fy: true }, { x: this.cameras.main.width - 60, y: 60, fx: true, fy: true }];
      const c = corners[Math.floor(Math.random() * corners.length)];
      const bird = this.add.image(c.x, c.y, 'bird-overlook').setScrollFactor(0).setDepth(2000).setScale(0.4).setAlpha(0).setFlipX(c.fx).setFlipY(c.fy);
      this.sound.play('huh', { volume: 0.5 });
      this.tweens.add({ targets: bird, alpha: 1, duration: 300, hold: 1500, yoyo: true, onComplete: () => bird.destroy() });
    }
    this.cockroachNoiseTimer += this.game.loop.delta;
    if (this.cockroachNoiseTimer >= this.nextNoiseTime) {
      this.cockroachNoiseTimer = 0; this.nextNoiseTime = 20000 + Math.random() * 15000;
      if (!this.cockroachNoiseSound || !this.cockroachNoiseSound.isPlaying) {
        this.cockroachNoiseSound = this.sound.add('cockroach-noise', { volume: 0.3 }); this.cockroachNoiseSound.play();
      }
    }
  }

  private showObstacleWarnings(): void {
    const cameraRight = this.cameras.main.scrollX + this.cameras.main.width;
    this.obstacles.getChildren().forEach((obj) => {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      if (sprite.x > cameraRight - 50 && sprite.x < cameraRight + 300 && !sprite.getData('warned')) {
        sprite.setData('warned', true);
        if (sprite.getData('floor') && sprite.getData('floor') !== this.player.currentFloor) return;
        const wy = sprite.y < this.cameras.main.height / 2 ? 30 : this.cameras.main.height - 30;
        const w = this.add.text(this.cameras.main.width - 30, wy, '!', { fontSize: '12px', fontFamily: '"Press Start 2P", monospace', color: '#ff0000', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setScrollFactor(0).setDepth(500);
        this.tweens.add({ targets: w, alpha: 0, scale: 2, duration: 400, ease: 'Power2', onComplete: () => w.destroy() });
      }
    });
  }

  // ── Parallax + Floors ──

  private updateParallax(): void {
    const bf = this.data.get('breatheFactor') ?? 1.0;
    const sx = this.cameras.main.scrollX;
    this.skyBg.tilePositionX = sx * 0.1 * bf; this.midBg.tilePositionX = sx * 0.4 * bf; this.fgBg.tilePositionX = sx * 0.7 * bf;
    if (this.bgTransitioning) { this.nextSkyBg.tilePositionX = sx * 0.1 * bf; this.nextMidBg.tilePositionX = sx * 0.4 * bf; this.nextFgBg.tilePositionX = sx * 0.7 * bf; }
    this.cameras.main.zoom = Phaser.Math.Linear(this.cameras.main.zoom, Math.max(0.88, 1 - Math.max(this.player.speedMultiplier - 5, 0) * 0.02), 0.02);
    const dk = Math.min(Math.max(this.player.speedMultiplier - 3.5, 0) * 0.08, 0.5);
    if (dk > 0) this.skyBg.setTint(Phaser.Display.Color.GetColor(Math.floor(255 * (1 - dk)), Math.floor(255 * (1 - dk * 0.8)), Math.floor(255 * (1 - dk * 0.3))));
    this.cameras.main.scrollY = 0;
  }

  private updateFloors(): void {
    let trackX: number, trackFloor: 'top' | 'bottom', shouldTrack: boolean;
    if (this.isDead && this.isMultiplayer && this.ghostManager?.isSpectating) {
      const t = this.ghostManager.spectateTargetPlayer;
      if (t && t.alive) { trackX = t.sprite.x; trackFloor = t.lane as 'top' | 'bottom'; shouldTrack = true; }
      else { shouldTrack = false; trackX = 0; trackFloor = 'bottom'; }
    } else { trackX = this.player.x; trackFloor = this.player.currentFloor; shouldTrack = !this.isCountingDown && !this.isDead; }
    this.floorRenderer.update(this.floorTopY, this.floorBottomY, trackX, trackFloor, shouldTrack, this.player.currentFloor);
  }

  private switchLevel(config: LevelConfig): void {
    this.nextSkyBg.setTexture(config.skyKey); this.nextMidBg.setTexture(config.bgKey); this.nextFgBg.setTexture(config.fgKey); this.nextFgBg.setDepth(2);
    this.bgTransitioning = true;
    const d = 3000;
    this.tweens.add({ targets: this.nextSkyBg, alpha: 0.8, duration: d, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: this.nextMidBg, alpha: 0.15, duration: d, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: this.nextFgBg, alpha: 1, duration: d, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: this.skyBg, alpha: 0, duration: d, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: this.midBg, alpha: 0, duration: d, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: this.fgBg, alpha: 0, duration: d, ease: 'Sine.easeInOut', onComplete: () => {
      this.skyBg.setTexture(config.skyKey).setAlpha(0.8); this.midBg.setTexture(config.bgKey).setAlpha(0.15);
      this.fgBg.setTexture(config.fgKey).setAlpha(1); this.fgBg.setDepth(2);
      this.nextSkyBg.setAlpha(0); this.nextMidBg.setAlpha(0); this.nextFgBg.setAlpha(0); this.bgTransitioning = false;
    }});
    if (!this.isDead) this.audio.switchBGM(config.bgmKey);
    this.hud.showLevelAnnouncement(config);
  }
}
