import Phaser from 'phaser';
import { fetchScores } from '../ui/Scoreboard';
import { COLORS } from '../config/constants';
import { adaptiveTitleStyle, bodyStyle, smallStyle, buttonStyle, popupStyle, getScale } from '../utils/TextStyles';
import { createButton } from '../ui/shared';
import { createSceneBackground } from '../ui/SceneBackground';
import { sceneManager } from '../systems/SceneManager';
import { getHighScore, getPlayerNameOrDefault, isPlayerNameCustom } from '../utils/Storage';
import { showNameInput } from '../ui/NameInputOverlay';
import { ReplayData } from '../systems/DeathReplay';

interface GameOverData {
  score: number;
  timeSurvived?: number;
  topSpeed?: number;
  distance?: number;
  obstacleType?: string | null;
  level?: number;
  maxCombo?: number;
  pickupCounts?: { apples: number; beers: number; pills: number };
  replayData?: ReplayData | null;
}

export class GameOverScene extends Phaser.Scene {
  private restartBound = false;
  private replayData: ReplayData | null = null;

  private static readonly DEATH_TEXT: Record<string, string[]> = {
    bird: ['Srak cię optakał', 'Gołąb zemsty!', 'Bombardowanie z góry!'],
    cat: ['Rozkotowany', 'Łapa losu!', 'Kici kici... pac!'],
    flipper: ['Kubota ci w ryj!', 'Klapek sprawiedliwości!', 'Ciapnięty na amen!'],
    newspaper: ['Złe wybory kolego', 'Gazeta prawdy!', 'Przywalony faktem!'],
    onion: ['Smrót cię zmiótł', 'Cebulowy nokaut!', 'Zapłakałeś na wieki!'],
    spray: ['Muga!', 'Psik i po tobie!', 'Toksyczny koniec!'],
    pill: ['Przedawkowanie!', 'Za dużo dobrego!', 'Narkotyczny zgon!'],
    disco: ['Dyskoteka zamknięta!', 'Ostatni taniec!', 'Kto nie tańczy ten ginie!'],
    jellyfish: ['Użądlony na Bałtyku!', 'Meduza ci w twarz!', 'Morska zemsta!'],
    pope: ['Okadzony przez papieża!', 'Kremówka ostatnia!', 'Santo subito... ale nie ty!'],
    bison: ['Żubr cię stratował!', 'Żubrówka na kopyta!', 'Byka złapałeś!'],
    blackhole: ['Wciągnięty w nicość!', 'Ssanie kosmiczne!', 'Karaluch w próżni!'],
    boss: ['Bestia cię dopadła!', 'Wadowice zwyciężyły!', 'Kremówkowy armagedon!'],
  };

  private static readonly OBSTACLE_TEXTURE: Record<string, string> = {
    bird: 'bird',
    cat: 'cat-paw',
    flipper: 'flipper',
    newspaper: 'newspaper',
    onion: 'onion',
    spray: 'pest-spray',
    disco: 'disco-ball',
    jellyfish: 'jellyfish',
    pope: 'pope',
    bison: 'bison',
    blackhole: 'black-hole',
    boss: 'boss-face2',
  };

  private static readonly DEFAULT_DEATH = 'Zgniotłeś się!';

  constructor() {
    super({ key: 'GameOverScene' });
  }

  create(data: GameOverData): void {
    const { width, height } = this.cameras.main;
    this.restartBound = false;
    this.replayData = data?.replayData ?? null;

    this.cameras.main.setBackgroundColor('#0a0a0a');
    this.setupBackground(width, height);

    const texts = data?.obstacleType ? GameOverScene.DEATH_TEXT[data.obstacleType] : null;
    const deathMessage = texts
      ? texts[Math.floor(Math.random() * texts.length)]
      : GameOverScene.DEFAULT_DEATH;

    const titleY = this.setupDeathTitle(width, height, deathMessage);
    this.setupObstacleImage(width, titleY, data);

    const { isNewRecord, highScore } = this.getHighScoreInfo(data?.score ?? 0);
    this.setupScoreDisplay(width, height, data?.score ?? 0, highScore, isNewRecord);
    this.setupStats(width, height, data);

    if (isNewRecord) {
      this.spawnConfetti(width, height);
    }

    // Check if score qualifies for top 100 leaderboard
    const finalScore = data?.score ?? 0;
    fetchScores().then((scores) => {
      const inTop100 = scores.length < 100 || (finalScore > 0 && finalScore > scores[scores.length - 1].score);
      const canSave = isNewRecord && inTop100;
      this.showDeathButtons(width, height, isNewRecord, canSave, data);
    }).catch(() => {
      this.showDeathButtons(width, height, isNewRecord, false, data);
    });
  }

  // -- Background & atmosphere -----------------------------------------------

  private setupBackground(width: number, height: number): void {
    createSceneBackground(this, {
      textureKey: 'menu-bg',
      cycleColorFrom: 0x440000,
      cycleColorTo: 0x880022,
      lighting: { colors: [0xff2222, 0xcc0000, 0xff4444, 0x880000, 0xff6644] },
    });

    this.tweens.add({
      targets: this.cameras.main,
      zoom: 1.02,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    for (let i = 0; i < 12; i++) {
      this.spawnDeathParticle(width, height);
    }
  }

  private setupDeathTitle(width: number, height: number, message: string): number {
    const titleText = this.add
      .text(width / 2, height * 0.12, message, adaptiveTitleStyle(width))
      .setOrigin(0.5);

    const baseX = titleText.x;
    const baseY = titleText.y;
    this.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => {
        titleText.x = baseX + Phaser.Math.Between(-2, 2);
        titleText.y = baseY + Phaser.Math.Between(-2, 2);
      },
    });

    return titleText.y;
  }

  private setupObstacleImage(width: number, titleY: number, data: GameOverData): void {
    if (!data?.obstacleType || !GameOverScene.OBSTACLE_TEXTURE[data.obstacleType]) return;

    if (data.obstacleType === 'boss') {
      const faces = ['boss-face1', 'boss-face2', 'boss-face3'];
      const spacing = 60;
      const startX = width / 2 - (faces.length - 1) * spacing / 2;
      const imgs: Phaser.GameObjects.Image[] = [];
      faces.forEach((key, i) => {
        const img = this.add.image(startX + i * spacing, titleY + 30, key);
        img.setScale(0.2).setOrigin(0.5, 0);
        imgs.push(img);
      });
      this.tweens.add({
        targets: imgs,
        y: '-=5',
        duration: 1000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      return;
    }

    const textureKey = GameOverScene.OBSTACLE_TEXTURE[data.obstacleType];
    const img = this.add.image(width / 2, titleY + 30, textureKey);
    img.setScale(0.25).setOrigin(0.5, 0);

    this.tweens.add({
      targets: img,
      y: img.y - 5,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // -- Score display ---------------------------------------------------------

  private getHighScoreInfo(finalScore: number): { isNewRecord: boolean; highScore: number } {
    const highScore = getHighScore();
    return {
      isNewRecord: finalScore > 0 && finalScore >= highScore,
      highScore,
    };
  }

  private setupScoreDisplay(
    width: number, height: number,
    finalScore: number, highScore: number, isNewRecord: boolean,
  ): void {
    const s = getScale();
    const scoreY = height * 0.42;

    // Animated count-up
    const counter = { value: 0 };
    const scoreText = this.add
      .text(width / 2, scoreY, 'Punkciory: 0', bodyStyle({
        fontSize: `${Math.round(16 * s)}px`,
        strokeThickness: 4 * s,
      }))
      .setOrigin(0.5);

    this.tweens.add({
      targets: counter,
      value: finalScore,
      duration: Math.min(2000, finalScore * 50 + 500),
      ease: 'Power2',
      onUpdate: () => {
        scoreText.setText(`Punkciory: ${Math.floor(counter.value)}`);
      },
    });

    // High score line
    const hsY = scoreY + Math.round(28 * s);
    const hsText = this.add
      .text(width / 2, hsY, `Najlepsiejszy wynik: ${highScore}`, smallStyle({
        fontSize: `${Math.round(11 * s)}px`,
        color: isNewRecord ? '#ffff00' : '#ff8800',
        strokeThickness: 3 * s,
      }))
      .setOrigin(0.5);

    if (isNewRecord) {
      hsText.setFontSize(Math.round(16 * s));
      hsText.setColor('#ffff00');
      this.tweens.add({
        targets: hsText,
        scaleX: { from: 1, to: 1.1 },
        scaleY: { from: 1, to: 1.1 },
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  private setupStats(width: number, height: number, data: GameOverData): void {
    const s = getScale();
    const fontSize = `${Math.round(10 * s)}px`;
    const lineHeight = Math.round(20 * s);
    const startY = height * 0.58;

    const stats: { label: string; value: string; color: string }[] = [];
    if (data?.timeSurvived !== undefined) stats.push({ label: 'Czas Przeżywalności', value: `${data.timeSurvived}s`, color: '#00ccff' });
    if (data?.distance !== undefined) stats.push({ label: 'Dystansik', value: `${Math.floor(data.distance)}m`, color: '#ff6600' });
    if (data?.level !== undefined) stats.push({ label: 'Poziom', value: `${data.level}`, color: '#ffff00' });
    if (data?.topSpeed !== undefined) stats.push({ label: 'Maks Szybkóść', value: `${data.topSpeed.toFixed(1)}x`, color: '#cc66ff' });
    if (data?.maxCombo !== undefined && data.maxCombo > 0) stats.push({ label: 'Maks Kombo', value: `x${data.maxCombo}`, color: '#ff00ff' });
    if (data?.pickupCounts) {
      const p = data.pickupCounts;
      stats.push({ label: 'Jabłka / Piwa / Pigułki', value: `${p.apples} / ${p.beers} / ${p.pills}`, color: '#44ff44' });
    }

    stats.forEach((stat, i) => {
      const y = startY + i * lineHeight;
      this.add.text(width / 2 - 8, y, stat.label, smallStyle({ fontSize, color: '#aaaaaa' })).setOrigin(1, 0.5);
      this.add.text(width / 2 + 8, y, stat.value, smallStyle({ fontSize, color: stat.color, strokeThickness: 2 })).setOrigin(0, 0.5);
    });
  }

  // -- Confetti ---------------------------------------------------------------

  private spawnConfetti(width: number, height: number): void {
    for (let i = 0; i < 40; i++) {
      const color = COLORS.CONFETTI[i % COLORS.CONFETTI.length];
      const size = Phaser.Math.Between(3, 8);
      const confetti = this.add.rectangle(
        Phaser.Math.Between(0, width), -20,
        size, size * 2, color, 0.9,
      );
      confetti.setAngle(Phaser.Math.Between(0, 360));

      this.tweens.add({
        targets: confetti,
        y: height + 20,
        x: confetti.x + Phaser.Math.Between(-100, 100),
        angle: confetti.angle + Phaser.Math.Between(-360, 360),
        duration: Phaser.Math.Between(1500, 3000),
        delay: Phaser.Math.Between(0, 1000),
        ease: 'Cubic.easeIn',
        onComplete: () => confetti.destroy(),
      });
    }
  }

  // -- Restart / navigation ---------------------------------------------------

  private showDeathButtons(width: number, height: number, isNewRecord: boolean, canSave: boolean, data: GameOverData): void {
    if (this.restartBound) return;
    this.restartBound = true;

    const s = getScale();
    const btnS = buttonStyle({
      fontSize: `${Math.round(12 * s)}px`,
      strokeThickness: Math.round(3 * s),
    });

    const btnY = height - Math.round(60 * s);
    const btnH = Math.round(44 * s);
    const gap = Math.round(10 * s);
    const hasReplay = this.replayData && this.replayData.frames.length > 0;
    const btnW = Math.round(130 * s);

    if (hasReplay) {
      const totalW = btnW * 3 + gap * 2;
      const startX = width / 2 - totalW / 2 + btnW / 2;
      createButton(this, startX, btnY, btnW, btnH, 'Menu', 0x666666, btnS, () => this.goToMenu());
      createButton(this, startX + btnW + gap, btnY, btnW, btnH, 'Powtórka', 0x333366, btnS, () => this.playReplay());
      createButton(this, startX + (btnW + gap) * 2, btnY, btnW, btnH, 'Jeszcze raz!', 0x880000, btnS, () => this.restartGame());
    } else {
      createButton(this, width / 2 - btnW / 2 - gap / 2, btnY, btnW, btnH, 'Menu', 0x666666, btnS, () => this.goToMenu());
      createButton(this, width / 2 + btnW / 2 + gap / 2, btnY, btnW, btnH, 'Jeszcze raz!', 0x880000, btnS, () => this.restartGame());
    }

    // "Zapisz" button below the highscore text when score qualifies for top 100
    if (canSave) {
      const saveY = height * 0.42 + Math.round(56 * s);
      const saveBtnW = Math.round(120 * s);
      const saveBtnH = Math.round(32 * s);

      const saveBtn = createButton(this, width / 2, saveY, saveBtnW, saveBtnH, 'Zapisz', 0x008800, buttonStyle({
        fontSize: `${Math.round(12 * s)}px`,
        strokeThickness: 2,
      }), () => {
        for (const obj of saveBtn.all) obj.destroy();
        if (!isPlayerNameCustom()) {
          showNameInput(this, (name) => {
            this.submitScore(name, data);
          });
        } else {
          this.submitScore(getPlayerNameOrDefault(), data);
        }
      });

      this.tweens.add({
        targets: saveBtn.all,
        alpha: { from: 0.7, to: 1 },
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // Keyboard shortcuts
    this.input.keyboard!.once('keydown-SPACE', () => this.restartGame());
    this.input.keyboard!.once('keydown-R', () => this.restartGame());
    this.input.keyboard!.once('keydown-ESC', () => this.goToMenu());
  }

  private restartGame(): void {
    sceneManager.goto(this, 'GameScene', { multiplayer: false });
  }

  private goToMenu(): void {
    sceneManager.goto(this, 'MenuScene');
  }

  private playReplay(): void {
    if (!this.replayData || this.replayData.frames.length < 2) return;
    const data = this.replayData;
    const { width, height } = this.cameras.main;
    const cleanup: Phaser.GameObjects.GameObject[] = [];
    const COCKROACH_SCREEN_X = 200;

    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.85)
      .setScrollFactor(0).setDepth(1000);
    cleanup.push(overlay);

    // Floor reference lines
    const floorGfx = this.add.graphics().setScrollFactor(0).setDepth(1000);
    floorGfx.lineStyle(1, 0x444444, 0.5);
    floorGfx.lineBetween(0, 296, width, 296);
    floorGfx.lineBetween(0, 396, width, 396);
    cleanup.push(floorGfx);

    // Create world sprites — positioned relative to cockroach each frame
    // Obstacles: blue tint (avoided), killer: red pulsing
    const lastFrame = data.frames[data.frames.length - 1];
    const killerTexture = data.obstacleType ? GameOverScene.OBSTACLE_TEXTURE[data.obstacleType] : null;

    const worldSprites: { img: Phaser.GameObjects.Image; worldX: number; baseY: number }[] = [];

    for (const obs of data.obstacles) {
      if (!this.textures.exists(obs.textureKey)) continue;
      const img = this.add.image(0, obs.y, obs.textureKey)
        .setScale(0.22).setScrollFactor(0).setDepth(1001).setAlpha(0.7).setTint(0x4488ff);
      cleanup.push(img);
      worldSprites.push({ img, worldX: obs.worldX, baseY: obs.y });
    }

    for (const pk of data.pickups) {
      if (!this.textures.exists(pk.textureKey)) continue;
      const img = this.add.image(0, pk.y, pk.textureKey)
        .setScale(0.15).setScrollFactor(0).setDepth(1001).setAlpha(0.7).setTint(0x44ff44);
      cleanup.push(img);
      worldSprites.push({ img, worldX: pk.worldX, baseY: pk.y });
    }

    // Killer obstacle — separate so it gets red pulsing tint and higher depth
    let killerSprite: Phaser.GameObjects.Image | null = null;
    if (killerTexture && this.textures.exists(killerTexture)) {
      // Place killer just ahead of death position
      killerSprite = this.add.image(0, lastFrame.y, killerTexture)
        .setScale(0.25).setScrollFactor(0).setDepth(1002).setAlpha(0.9);
      cleanup.push(killerSprite);
    }
    // Killer world X: slightly ahead of where the cockroach died
    const killerWorldX = lastFrame.x + 50;

    const ghost = this.add.sprite(COCKROACH_SCREEN_X, data.frames[0].y, 'cockroach-idle')
      .setScale(0.30).setAlpha(0.7).setTint(0x8888ff).setScrollFactor(0).setDepth(1003);
    cleanup.push(ghost);

    const label = this.add.text(width / 2, 30, '', popupStyle({ fontSize: '10px', color: '#ff4444' }))
      .setOrigin(0.5).setScrollFactor(0).setDepth(1004);
    cleanup.push(label);

    let frameIndex = 0;
    let deathAnimPlayed = false;
    const playbackStart = this.time.now;
    const replayDuration = data.frames[data.frames.length - 1].time - data.frames[0].time;
    const baseTime = data.frames[0].time;

    const replayUpdate = (): void => {
      const elapsed = this.time.now - playbackStart;
      const replayTime = baseTime + elapsed;

      while (frameIndex < data.frames.length - 1 && data.frames[frameIndex + 1].time <= replayTime) {
        frameIndex++;
      }

      const frame = data.frames[frameIndex];
      ghost.setPosition(COCKROACH_SCREEN_X, frame.y);
      ghost.setTexture(frame.texture);
      if (frame.isDashing) ghost.setTint(0xffffff);
      else if (frame.isPillActive) ghost.setTint(0xff00ff);
      else ghost.setTint(0x8888ff);

      // Position all world sprites relative to cockroach — they scroll left as cockroach "moves"
      const cameraWorldX = frame.x - COCKROACH_SCREEN_X;
      for (const ws of worldSprites) {
        const screenX = ws.worldX - cameraWorldX;
        ws.img.setX(screenX);
        // Float up/down like real game pickups/obstacles
        ws.img.setY(ws.baseY + Math.sin(elapsed * 0.004 + ws.worldX * 0.01) * 6);
        ws.img.setVisible(screenX > -50 && screenX < width + 50);
      }

      // Killer follows same world-relative positioning + red pulse
      if (killerSprite) {
        const killerScreenX = killerWorldX - cameraWorldX;
        killerSprite.setX(killerScreenX);
        killerSprite.setVisible(killerScreenX > -50 && killerScreenX < width + 50);
        const pulse = Math.sin(elapsed * 0.01) * 0.5 + 0.5;
        killerSprite.setTint(Phaser.Display.Color.GetColor(255, Math.floor(pulse * 100), Math.floor(pulse * 100)));
      }

      const remaining = Math.ceil((replayDuration - elapsed) / 1000);
      if (remaining > 0) label.setText(`${remaining}...`);
      else label.setText('');

      // Death animation at the end of replay
      if (frameIndex >= data.frames.length - 1 && !deathAnimPlayed) {
        deathAnimPlayed = true;
        ghost.setTint(0x444444);
        this.tweens.add({
          targets: ghost,
          y: ghost.y - 80,
          x: ghost.x - 20,
          angle: 720,
          alpha: 0,
          duration: 1000,
          ease: 'Linear',
        });
        this.cameras.main.shake(200, 0.005);
      }

      // Cleanup after death anim finishes
      if (elapsed >= replayDuration + 1500 && !cleanup.find(o => (o as any)._fading)) {
        this.events.off('update', replayUpdate);
        (overlay as any)._fading = true;
        this.tweens.add({
          targets: cleanup.filter(o => o.active),
          alpha: 0,
          duration: 500,
          ease: 'Power2',
          onComplete: () => {
            for (const obj of cleanup) if (obj.active) obj.destroy();
          },
        });
      }
    };

    this.events.on('update', replayUpdate);
  }

  // -- Network ----------------------------------------------------------------

  private async submitScore(name: string, data: GameOverData): Promise<void> {
    try {
      await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          score: data.score,
          deathCause: data.obstacleType || null,
          distance: data.distance || null,
          timeSurvived: data.timeSurvived || null,
          applesCollected: data.pickupCounts?.apples ?? null,
          tyskiesCollected: data.pickupCounts?.beers ?? null,
          pillsCollected: data.pickupCounts?.pills ?? null,
          maxLevel: data.level ?? null,
          maxCombo: data.maxCombo ?? null,
        }),
      });
    } catch {
      // Silently fail — game works offline too
    }
  }

  // -- Particles --------------------------------------------------------------

  private spawnDeathParticle(sceneWidth: number, sceneHeight: number): void {
    const size = Phaser.Math.Between(2, 6);
    const x = Phaser.Math.Between(0, sceneWidth);
    const y = Phaser.Math.Between(sceneHeight * 0.5, sceneHeight);

    const particle = this.add.circle(x, y, size, COLORS.DEATH_PARTICLE, 0.5);
    particle.setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({
      targets: particle,
      y: y - Phaser.Math.Between(100, 300),
      alpha: 0,
      duration: Phaser.Math.Between(2000, 5000),
      ease: 'Sine.easeIn',
      onComplete: () => {
        particle.destroy();
        this.spawnDeathParticle(sceneWidth, sceneHeight);
      },
    });
  }
}
