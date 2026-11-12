import Phaser from 'phaser';
import { ReplayData } from './DeathReplay';
import { ATLAS, SPRITE_SCALE } from '../config/sprites';
import { addObstacleArt } from '../ui/shared';
import { sfxVolume } from '../audio/AudioManager';
import { popupStyle } from '../utils/TextStyles';
import { DEPTH, FLOOR_TOP_Y, FLOOR_BOTTOM_Y } from '../config/constants';

const COCKROACH_SCREEN_X = 200;

export class DeathReplayPlayer {
  private scene: Phaser.Scene;
  private data: ReplayData;
  private cleanup: Phaser.GameObjects.GameObject[] = [];
  private updateHandler: (() => void) | null = null;
  private heartbeat: Phaser.Sound.BaseSound | null = null;

  constructor(scene: Phaser.Scene, data: ReplayData) {
    this.scene = scene;
    this.data = data;
  }

  play(): void {
    const { scene, data } = this;
    const { width, height } = scene.cameras.main;
    const cleanup = this.cleanup;
    scene.events.once('shutdown', this.destroy, this);

    // Dark overlay
    const overlay = scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.85)
      .setScrollFactor(0).setDepth(DEPTH.DEATH_REPLAY_BG);
    cleanup.push(overlay);

    // Desaturated sepia tint for "memory" feel
    const sepia = scene.add.rectangle(width / 2, height / 2, width, height, 0x332211, 0.12)
      .setScrollFactor(0).setDepth(DEPTH.DEATH_REPLAY_BG).setBlendMode(Phaser.BlendModes.ADD);
    cleanup.push(sepia);

    // Floor reference lines
    const floorGfx = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.DEATH_REPLAY_FLOOR);
    floorGfx.lineStyle(1, 0x444444, 0.5);
    floorGfx.lineBetween(0, FLOOR_TOP_Y, width, FLOOR_TOP_Y);
    floorGfx.lineBetween(0, FLOOR_BOTTOM_Y, width, FLOOR_BOTTOM_Y);
    cleanup.push(floorGfx);

    // World sprites — obstacles (blue) and pickups (green)
    const lastFrame = data.frames[data.frames.length - 1];
    const killerWorldX = lastFrame.x + 50;
    const worldSprites: { img: Phaser.GameObjects.Image; worldX: number; baseY: number }[] = [];

    // Find the obstacle closest to death position — that's the killer, skip it from blue list
    let killerObsIndex = -1;
    if (data.obstacleType) {
      let minDist = Infinity;
      for (let i = 0; i < data.obstacles.length; i++) {
        const dist = Math.abs(data.obstacles[i].worldX - killerWorldX);
        if (dist < minDist) { minDist = dist; killerObsIndex = i; }
      }
    }

    for (let i = 0; i < data.obstacles.length; i++) {
      if (i === killerObsIndex) continue;
      const obs = data.obstacles[i];
      const img = scene.add.image(0, obs.y, ATLAS, obs.frameName)
        .setScale(SPRITE_SCALE).setScrollFactor(0).setDepth(DEPTH.DEATH_REPLAY_SPRITE).setAlpha(0.7).setTint(0x4488ff);
      cleanup.push(img);
      worldSprites.push({ img, worldX: obs.worldX, baseY: obs.y });
    }

    for (const pk of data.pickups) {
      const img = scene.add.image(0, pk.y, ATLAS, pk.frameName)
        .setScale(SPRITE_SCALE).setScrollFactor(0).setDepth(DEPTH.DEATH_REPLAY_SPRITE).setAlpha(0.7).setTint(0x44ff44);
      cleanup.push(img);
      worldSprites.push({ img, worldX: pk.worldX, baseY: pk.y });
    }

    // Killer obstacle — red pulsing
    const killerSprite = data.obstacleType ? addObstacleArt(scene, 0, lastFrame.y, data.obstacleType) : null;
    if (killerSprite) {
      killerSprite.setScrollFactor(0).setDepth(DEPTH.DEATH_REPLAY_SPRITE).setAlpha(0.9);
      cleanup.push(killerSprite);
    }

    // Ghost cockroach
    const ghost = scene.add.sprite(COCKROACH_SCREEN_X, data.frames[0].y, ATLAS, data.frames[0].frameName)
      .setScale(SPRITE_SCALE).setAlpha(0.7).setTint(0x8888ff).setScrollFactor(0).setDepth(DEPTH.DEATH_REPLAY_TEXT);
    cleanup.push(ghost);

    // Countdown label
    const label = scene.add.text(width / 2, 30, '', popupStyle({ fontSize: '10px', color: '#ff4444' }))
      .setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.DEATH_REPLAY_LABEL);
    cleanup.push(label);

    // Audio — heartbeat pulse
    if (scene.cache.audio.exists('heartbeat')) {
      this.heartbeat = scene.sound.add('heartbeat', { volume: sfxVolume(0.4), loop: true });
      this.heartbeat.play();
    }

    let frameIndex = 0;
    let deathAnimPlayed = false;
    let fading = false;
    const playbackStart = scene.time.now;
    const replayDuration = data.frames[data.frames.length - 1].time - data.frames[0].time;
    const baseTime = data.frames[0].time;
    const slowmoStart = replayDuration - 500;

    const replayUpdate = (): void => {
      const rawElapsed = scene.time.now - playbackStart;

      // Slow-motion in the last 500ms of replay time
      let elapsed: number;
      if (rawElapsed < slowmoStart) {
        elapsed = rawElapsed;
      } else {
        // After slowmo point, time moves at 0.3x speed
        elapsed = slowmoStart + (rawElapsed - slowmoStart) * 0.3;
      }

      const replayTime = baseTime + elapsed;

      while (frameIndex < data.frames.length - 1 && data.frames[frameIndex + 1].time <= replayTime) {
        frameIndex++;
      }

      const frame = data.frames[frameIndex];
      ghost.setPosition(COCKROACH_SCREEN_X, frame.y);
      ghost.setFrame(frame.frameName);
      if (frame.isDashing) ghost.setTint(0xffffff);
      else if (frame.isPillActive) ghost.setTint(0xff00ff);
      else ghost.setTint(0x8888ff);

      // World-relative scrolling
      const cameraWorldX = frame.x - COCKROACH_SCREEN_X;
      for (const ws of worldSprites) {
        const screenX = ws.worldX - cameraWorldX;
        ws.img.setX(screenX);
        ws.img.setY(ws.baseY + Math.sin(elapsed * 0.004 + ws.worldX * 0.01) * 6);
        ws.img.setVisible(screenX > -50 && screenX < width + 50);
      }

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

      // Death animation
      if (frameIndex >= data.frames.length - 1 && !deathAnimPlayed) {
        deathAnimPlayed = true;
        ghost.setTint(0x444444);
        scene.tweens.add({
          targets: ghost,
          y: ghost.y - 80,
          x: ghost.x - 20,
          angle: 720,
          alpha: 0,
          duration: 1000,
          ease: 'Linear',
        });
        scene.cameras.main.shake(200, 0.005);
        // Stop heartbeat, play death crack
        if (this.heartbeat) {
          this.heartbeat.stop();
          this.heartbeat.destroy();
          this.heartbeat = null;
        }
      }

      // Fadeout after death anim
      const totalDuration = replayDuration + (500 / 0.3) + 1500;
      if (rawElapsed >= totalDuration && !fading) {
        fading = true;
        scene.events.off('update', replayUpdate);
        this.updateHandler = null;
        scene.tweens.add({
          targets: cleanup.filter(o => o.active),
          alpha: 0,
          duration: 500,
          ease: 'Power2',
          onComplete: () => this.destroy(),
        });
      }
    };

    this.updateHandler = replayUpdate;
    scene.events.on('update', replayUpdate);
  }

  destroy(): void {
    this.scene.events.off('shutdown', this.destroy, this);
    if (this.updateHandler) {
      this.scene.events.off('update', this.updateHandler);
      this.updateHandler = null;
    }
    if (this.heartbeat) {
      this.heartbeat.stop();
      this.heartbeat.destroy();
      this.heartbeat = null;
    }
    for (const obj of this.cleanup) {
      if (obj.active) obj.destroy();
    }
    this.cleanup = [];
  }
}
