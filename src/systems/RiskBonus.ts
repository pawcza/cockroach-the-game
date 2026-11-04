/**
 * Points for playing close: hopping out of a lane just before an obstacle arrives ("NA STYK!"), and dashing straight
 * through one ("PRZEBICIE!"). Both feed the combo like a pickup does. Local scoring only, nothing seeded.
 */
import Phaser from 'phaser';
import { Player, Floor } from '../objects/Player';

/** A hop counts as close when the obstacle would have reached the roach within this long. */
const NEAR_WINDOW_S = 0.22;
export const NEAR_MISS_SCORE = 15;
export const DASH_THROUGH_SCORE = 25;

/** What was done, for the run's counts: a close hop, or a dash through an obstacle of this type. */
export type RiskKind = 'near' | { dashed: string };
type Award = (points: number, label: string, x: number, y: number, color: string, kind: RiskKind) => void;

export class RiskBonus {
  private player: Player;
  private obstacles: Phaser.Physics.Arcade.Group;
  private award: Award;
  private seenHopAt = 0;
  /** Obstacles dodged close, scored once they are safely behind the roach. */
  private pending: Phaser.Physics.Arcade.Sprite[] = [];

  constructor(player: Player, obstacles: Phaser.Physics.Arcade.Group, award: Award) {
    this.player = player;
    this.obstacles = obstacles;
    this.award = award;
  }

  update(): void {
    const hop = this.player.lastHop;
    if (hop && hop.at !== this.seenHopAt) {
      this.seenHopAt = hop.at;
      this.onHop(hop.from);
    }

    const roach = this.player.sprite.body as Phaser.Physics.Arcade.Body;
    this.pending = this.pending.filter((sprite) => {
      if (!sprite.active || !sprite.body?.enable) return false;
      if ((sprite.body as Phaser.Physics.Arcade.Body).right >= roach.left) return true;
      this.award(NEAR_MISS_SCORE, 'NA STYK!', this.player.x, this.player.y - 40, '#7fe0ff', 'near');
      return false;
    });
  }

  /** Called from the overlap check: the dash carried the roach through this obstacle. Once per obstacle. */
  dashedThrough(sprite: Phaser.Physics.Arcade.Sprite): void {
    if (sprite.getData('dashedThrough')) return;
    sprite.setData('dashedThrough', true);
    this.award(DASH_THROUGH_SCORE, 'PRZEBICIE!', sprite.x, sprite.y - 50, '#ffe066', { dashed: String(sprite.getData('type')) });
  }

  /** The nearest obstacle ahead in the lane just left, if it was about to arrive. */
  private onHop(from: Floor): void {
    const roach = this.player.sprite.body as Phaser.Physics.Arcade.Body;
    const reach = this.player.currentSpeed * NEAR_WINDOW_S;
    let closest: Phaser.Physics.Arcade.Sprite | null = null;
    let closestGap = Infinity;
    for (const obj of this.obstacles.getChildren()) {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      const body = sprite.body as Phaser.Physics.Arcade.Body | null;
      if (!body?.enable || sprite.getData('floor') !== from || sprite.getData('nearMiss')) continue;
      const gap = body.left - roach.right;
      if (gap >= 0 && gap <= reach && gap < closestGap) {
        closest = sprite;
        closestGap = gap;
      }
    }
    if (!closest) return;
    closest.setData('nearMiss', true);
    this.pending.push(closest);
  }
}
