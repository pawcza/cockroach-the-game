import Phaser from 'phaser';
import { GhostPlayer, MP_PLAYER_COLORS } from './GhostPlayer';

// Import MPPlayer interface inline to avoid circular deps
interface MPPlayer {
  id: string;
  name: string;
  color: number;
  isHost: boolean;
}

export class GhostManager {
  private scene: Phaser.Scene;
  private ghosts = new Map<string, GhostPlayer>();
  private floorTopY: number;
  private floorBottomY: number;
  private myId: string;

  // Spectator
  private spectating = false;
  private spectateTarget: GhostPlayer | null = null;
  private spectateOverlay: Phaser.GameObjects.Text | null = null;
  private spectateIndex = 0;

  get isSpectating(): boolean { return this.spectating; }
  get spectateTargetPlayer(): GhostPlayer | null { return this.spectateTarget; }

  constructor(scene: Phaser.Scene, players: MPPlayer[], myId: string, floorTopY: number, floorBottomY: number, startX: number) {
    this.scene = scene;
    this.myId = myId;
    this.floorTopY = floorTopY;
    this.floorBottomY = floorBottomY;

    // Create ghosts for all OTHER players (skip myId)
    for (const player of players) {
      if (player.id === myId) continue;
      const ghost = new GhostPlayer(scene, player.id, player.name, player.color, startX, floorBottomY);
      this.ghosts.set(player.id, ghost);
    }
  }

  handleSwap(id: string, lane: string): void {
    const ghost = this.ghosts.get(id);
    if (ghost) {
      ghost.setLane(lane, this.floorTopY, this.floorBottomY);
    }
  }

  handleDashStart(id: string): void {
    const ghost = this.ghosts.get(id);
    if (ghost) ghost.setDashing(true);
  }

  handleDashEnd(id: string): void {
    const ghost = this.ghosts.get(id);
    if (ghost) ghost.setDashing(false);
  }

  handlePillStart(id: string): void {
    const ghost = this.ghosts.get(id);
    if (ghost) ghost.setPill(true);
  }

  handlePillEnd(id: string): void {
    const ghost = this.ghosts.get(id);
    if (ghost) ghost.setPill(false);
  }

  handlePosition(id: string, x: number, lane: string): void {
    const ghost = this.ghosts.get(id);
    if (ghost) {
      ghost.setPosition(x, lane, this.floorTopY, this.floorBottomY);
    }
  }

  handleDeath(id: string, score: number, stats: Record<string, unknown>): void {
    const ghost = this.ghosts.get(id);
    if (ghost) ghost.die(score, stats);
  }

  update(delta: number, cameraScrollX: number, cameraWidth: number): void {
    for (const ghost of this.ghosts.values()) {
      ghost.update(delta);
    }
    this.updateArrows(cameraScrollX, cameraWidth);
  }

  private arrowPool: Phaser.GameObjects.Text[] = [];
  private activeArrowCount = 0;

  private getArrow(index: number): Phaser.GameObjects.Text {
    if (index < this.arrowPool.length) {
      return this.arrowPool[index];
    }
    // Create a new arrow and add to pool
    const arrow = this.scene.add.text(0, 0, '', {
      fontFamily: '"Press Start 2P"',
      fontSize: '8px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    });
    arrow.setScrollFactor(0);
    arrow.setDepth(3500);
    this.arrowPool.push(arrow);
    return arrow;
  }

  private updateArrows(cameraScrollX: number, cameraWidth: number): void {
    const leftEdge = cameraScrollX;
    const rightEdge = cameraScrollX + cameraWidth;
    let arrowIdx = 0;
    let leftCount = 0;
    let rightCount = 0;

    for (const ghost of this.ghosts.values()) {
      if (!ghost.alive) continue;

      const gx = ghost.sprite.x;

      if (gx < leftEdge) {
        const y = 60 + leftCount * 20;
        const colorStr = '#' + ghost.color.toString(16).padStart(6, '0');
        const arrow = this.getArrow(arrowIdx++);
        arrow.setText(`\u25C0 ${ghost.name}`);
        arrow.setColor(colorStr);
        arrow.setPosition(8, y);
        arrow.setOrigin(0, 0);
        arrow.setVisible(true);
        leftCount++;
      } else if (gx > rightEdge) {
        const y = 60 + rightCount * 20;
        const colorStr = '#' + ghost.color.toString(16).padStart(6, '0');
        const arrow = this.getArrow(arrowIdx++);
        arrow.setText(`${ghost.name} \u25B6`);
        arrow.setColor(colorStr);
        arrow.setPosition(cameraWidth - 8, y);
        arrow.setOrigin(1, 0);
        arrow.setVisible(true);
        rightCount++;
      }
    }

    // Hide unused arrows from pool
    for (let i = arrowIdx; i < this.activeArrowCount; i++) {
      if (i < this.arrowPool.length) {
        this.arrowPool[i].setVisible(false);
      }
    }
    this.activeArrowCount = arrowIdx;
  }

  startSpectating(): void {
    this.spectating = true;
    this.cycleSpectate(0);
  }

  cycleSpectate(direction: number): GhostPlayer | null {
    const aliveGhosts = Array.from(this.ghosts.values()).filter(g => g.alive);
    if (aliveGhosts.length === 0) {
      this.spectateTarget = null;
      return null;
    }

    this.spectateIndex += direction;

    // Wrap around
    if (this.spectateIndex < 0) {
      this.spectateIndex = aliveGhosts.length - 1;
    } else if (this.spectateIndex >= aliveGhosts.length) {
      this.spectateIndex = 0;
    }

    // Restore previous target's ghost alpha
    if (this.spectateTarget) {
      this.spectateTarget.setSpectated(false);
    }

    this.spectateTarget = aliveGhosts[this.spectateIndex];

    // Make new target fully opaque
    if (this.spectateTarget) {
      this.spectateTarget.setSpectated(true);
    }

    // Create/recreate overlay text
    if (this.spectateOverlay) {
      this.spectateOverlay.destroy();
      this.spectateOverlay = null;
    }

    if (this.spectateTarget) {
      const cam = this.scene.cameras.main;
      this.spectateOverlay = this.scene.add.text(
        cam.width / 2,
        30,
        `Ogl\u0105danie: ${this.spectateTarget.name}`,
        {
          fontFamily: '"Press Start 2P"',
          fontSize: '10px',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 3,
        }
      );
      this.spectateOverlay.setOrigin(0.5, 0);
      this.spectateOverlay.setScrollFactor(0);
      this.spectateOverlay.setDepth(3500);

      // Wobble tween
      this.scene.tweens.add({
        targets: this.spectateOverlay,
        y: 34,
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    return this.spectateTarget;
  }

  allDead(): boolean {
    for (const ghost of this.ghosts.values()) {
      if (ghost.alive) return false;
    }
    return true;
  }

  getRankings(myScore: number, myName: string, myStats: Record<string, unknown>): Array<Record<string, unknown>> {
    const entries: Array<Record<string, unknown>> = [];

    // Add self
    entries.push({
      id: this.myId,
      name: myName,
      score: myScore,
      stats: myStats,
    });

    // Add all ghosts
    for (const ghost of this.ghosts.values()) {
      entries.push({
        id: ghost.id,
        name: ghost.name,
        score: ghost.score,
        stats: ghost.stats,
      });
    }

    // Sort by score descending
    entries.sort((a, b) => (b.score as number) - (a.score as number));

    return entries;
  }

  destroy(): void {
    // Clean up all ghosts
    for (const ghost of this.ghosts.values()) {
      ghost.destroy();
    }
    this.ghosts.clear();

    // Clean up arrow pool
    for (const arrow of this.arrowPool) {
      arrow.destroy();
    }
    this.arrowPool = [];
    this.activeArrowCount = 0;

    // Clean up spectate overlay
    if (this.spectateOverlay) {
      this.spectateOverlay.destroy();
      this.spectateOverlay = null;
    }

    this.spectating = false;
    this.spectateTarget = null;
  }
}
