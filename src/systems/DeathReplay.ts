export interface ReplayFrame {
  time: number;
  x: number;
  y: number;
  floor: 'top' | 'bottom';
  isDashing: boolean;
  isPillActive: boolean;
  texture: string;
}

export interface ReplaySprite {
  /** World X at time of snapshot */
  worldX: number;
  y: number;
  textureKey: string;
}

export interface ReplayData {
  frames: ReplayFrame[];
  obstacleType: string | null;
  obstacles: ReplaySprite[];
  pickups: ReplaySprite[];
}

const BUFFER_DURATION = 3000;
const SAMPLE_INTERVAL = 50;

export class DeathReplayRecorder {
  private frames: ReplayFrame[] = [];

  sample(time: number, x: number, y: number, floor: 'top' | 'bottom',
         isDashing: boolean, isPillActive: boolean, texture: string): void {
    const last = this.frames[this.frames.length - 1];
    if (last && time - last.time < SAMPLE_INTERVAL) return;
    this.frames.push({ time, x, y, floor, isDashing, isPillActive, texture });
    const cutoff = time - BUFFER_DURATION;
    while (this.frames.length > 0 && this.frames[0].time < cutoff) {
      this.frames.shift();
    }
  }

  getReplayData(obstacleType: string | null, obstacles: ReplaySprite[], pickups: ReplaySprite[]): ReplayData | null {
    if (this.frames.length < 2) return null;
    return {
      frames: [...this.frames],
      obstacleType,
      obstacles,
      pickups,
    };
  }
}
