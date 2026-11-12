import Phaser from 'phaser';

export interface ReplayFrame {
  time: number;
  x: number;
  y: number;
  floor: 'top' | 'bottom';
  isDashing: boolean;
  isPillActive: boolean;
  frameName: string;
}

export interface ReplaySprite {
  /** World X at time of snapshot */
  worldX: number;
  y: number;
  frameName: string;
}

export interface ReplayData {
  frames: ReplayFrame[];
  obstacleType: string | null;
  obstacles: ReplaySprite[];
  pickups: ReplaySprite[];
}

const BUFFER_DURATION = 3000;
const SAMPLE_INTERVAL = 50;

export interface CollectedPickup extends ReplaySprite {
  collected: true;
}

export class DeathReplayRecorder {
  private frames: ReplayFrame[] = [];
  private collectedPickups: { time: number; sprite: ReplaySprite }[] = [];

  sample(time: number, x: number, y: number, floor: 'top' | 'bottom',
         isDashing: boolean, isPillActive: boolean, frameName: string): void {
    const last = this.frames[this.frames.length - 1];
    if (last && time - last.time < SAMPLE_INTERVAL) return;
    this.frames.push({ time, x, y, floor, isDashing, isPillActive, frameName });
    const cutoff = time - BUFFER_DURATION;
    while (this.frames.length > 0 && this.frames[0].time < cutoff) {
      this.frames.shift();
    }
    // Trim collected pickups to same window
    while (this.collectedPickups.length > 0 && this.collectedPickups[0].time < cutoff) {
      this.collectedPickups.shift();
    }
  }

  recordPickupCollected(time: number, worldX: number, y: number, frameName: string): void {
    this.collectedPickups.push({ time, sprite: { worldX, y, frameName } });
  }

  getReplayData(
    obstacleType: string | null,
    obstacleGroup: Phaser.Physics.Arcade.Group,
    pickupGroups: Phaser.Physics.Arcade.Group[],
  ): ReplayData | null {
    const obstacles = snapshotGroup(obstacleGroup);
    const alivePickups = pickupGroups.flatMap(snapshotGroup);
    if (this.frames.length < 2) return null;
    // Merge collected pickups (from buffer) with still-alive pickups
    const collected = this.collectedPickups.map(cp => cp.sprite);
    return {
      frames: [...this.frames],
      obstacleType,
      obstacles,
      pickups: [...collected, ...alivePickups],
    };
  }
}

function snapshotGroup(group: Phaser.Physics.Arcade.Group): ReplaySprite[] {
  // Not what can't be seen: a chaser still waiting off behind the run
  return group.getChildren().filter(obj => (obj as Phaser.Physics.Arcade.Sprite).visible).map(obj => {
    const s = obj as Phaser.Physics.Arcade.Sprite;
    return { worldX: s.x, y: s.y, frameName: s.frame.name };
  });
}
