import Phaser from 'phaser';
import { VOL } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { frameOf } from '../../config/sprites';
import { getFx } from '../../effects/Fx';
import { EnemyPlan, laneY } from './behaviours';
import { ENEMIES } from './cast';
import { ObstacleKit } from './ObstacleKit';

/**
 * The dancing boots (stomp in behaviours.ts): a pair at one x, one over each lane, stomping in turn on the beat every
 * pair shares. The boot that is up hangs over its lane (its shadow where it will land); down, it hurts under itself.
 * A row of pairs is a dance line to hop through on the rhythm, or dash. Sounds (placeholders): the hop's landing thud,
 * one pair only, so a line doesn't drown the music.
 */
export function spawnBoots(kit: ObstacleKit, plan: EnemyPlan): void {
  const fx = getFx(kit.scene);
  const top = kit.enemy(plan, { shadow: false });
  top.anims.stop();
  const bottom = kit.createSprite(plan.x, laneY('bottom'), 'boot', 'boots', null, { hitbox: ENEMIES.boots.hitbox });
  bottom.anims.stop();
  bottom.setData('floor', 'bottom').setData('telegraphs', true);
  const stomped = (lane: 'top' | 'bottom', x: number): void => {
    fx.play('dust-land', x, laneY(lane), { depth: DEPTH.OBSTACLES + 1 });
    if (kit.isAhead(top) && top.x - kit.scene.cockroach.x < 360) kit.audio.playSfx('hop-land', VOL.obstacle * 0.6);
  };
  kit.drive(top, plan, (now, before) => {
    const topDown = now.zones.some(z => z.lane === 'top');
    top.setData('floor', 'top').setData('harmless', !topDown);
    const b = now.parts!.bottom;
    bottom.setPosition(b.x, b.y).setFrame(frameOf('boot', b.frame)).setData('harmless', !b.danger);
    if (!before || !kit.isOnScreen(top)) return;
    const wasTop = before.zones.some(z => z.lane === 'top');
    const wasBottom = before.parts!.bottom.danger;
    if (topDown && !wasTop) stomped('top', top.x);
    if (b.danger && !wasBottom) stomped('bottom', b.x);
  });
  kit.track(top, { objects: [bottom] });
  void Phaser;
}
