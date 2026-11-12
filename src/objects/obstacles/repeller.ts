import Phaser from 'phaser';
import { VOL } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { frameOf } from '../../config/sprites';
import { getFx } from '../../effects/Fx';
import { EnemyPlan, laneY } from './behaviours';
import { ObstacleKit } from './ObstacleKit';

const RING = 0x8ff0ff;
const RING_DARK = 0x2f8aa0;
/** A ring as drawn: an upright oval round the lane, as tall as the roach. Its hurting stretch is TIMINGS' `ring`. */
const RING_W = 14;
const RING_H = 44;

/**
 * The ultrasonic repeller (rings in behaviours.ts): plugged in at its spot in its lane, it lights up and lets a ring of
 * sound go down the lane at the runner, one a beat. Shot, it pops and the rings stop. Sounds (placeholders): the
 * shell casing's tick for each ring, Bigos's scratch as it comes into view.
 */
export function spawnRepeller(kit: ObstacleKit, plan: EnemyPlan): void {
  const { scene } = kit;
  const fx = getFx(scene);
  const box = kit.enemy(plan);
  box.anims.stop();
  kit.playSoundOnVisible(box, 'bigos-scratch', VOL.obstacle * 0.3);
  const rings: Phaser.GameObjects.Graphics[] = [];
  kit.drive(box, plan, (now, before) => {
    box.setFrame(frameOf('repeller', now.frame ?? 0));
    const parts = Object.values(now.parts ?? {});
    while (rings.length < parts.length) rings.push(scene.add.graphics().setDepth(DEPTH.OBSTACLES + 0.5));
    rings.forEach((g, i) => {
      g.clear();
      const p = parts[i];
      if (!p) return;
      const cy = laneY(plan.lane) - RING_H / 2 - 2;
      // A ring just let go is wide and bright; rolling, it settles
      const w = p.frame === 0 ? RING_W + 6 : RING_W;
      g.lineStyle(4, RING_DARK, 0.9).strokeEllipse(Math.round(p.x), cy, w, RING_H);
      g.lineStyle(2, RING, 1).strokeEllipse(Math.round(p.x), cy, w, RING_H);
    });
    if (before && now.cycle !== before.cycle && kit.isAhead(box)) kit.audio.playSfx('shell-casing', VOL.obstacle * 0.25);
    if (before && now.pose === 'windup' && before.pose !== 'windup' && kit.isOnScreen(box)) {
      fx.play('flare-cyan', box.x, box.y - box.displayHeight * 0.4, { depth: DEPTH.PICKUPS + 1 });
    }
  });
  kit.track(box, { objects: rings });
}
