import { VOL } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { getFx } from '../../effects/Fx';
import { EnemyPlan, laneY } from './behaviours';
import { ENEMIES, EnemyId } from './cast';
import { ObstacleKit } from './ObstacleKit';

/**
 * What the slipper and the newspaper share: posed frame by frame by their behaviour (ObstacleKit.drive sets frame,
 * depth and the landing shadow), a sound at the wind-back and at the slap, and dust out from under it when it lands.
 */
export function swatter(kit: ObstacleKit, plan: EnemyPlan, sound: string): void {
  const { scene } = kit;
  const def = ENEMIES[plan.id as EnemyId];
  const sprite = kit.enemy(plan, { shadow: false });
  sprite.anims.stop();
  sprite.setData('flies', true);
  kit.playSoundOnVisible(sprite, sound, 0.3);

  const fx = getFx(scene);
  const half = (def.footprint ?? 60) / 2;
  // The slap: dust puffed out from under both ends and a ring of air along the ledge
  const slap = (lane: 'top' | 'bottom'): void => {
    const y = laneY(lane);
    for (const side of [-1, 1]) {
      fx.play('dust-land', plan.x + side * half, y, { depth: DEPTH.GLOW, flipX: side < 0 });
      fx.burst('dust', plan.x + side * half, y - 4, 2, 6, { depth: DEPTH.GLOW, speed: [40, 90], angle: side < 0 ? [190, 230] : [-50, -10] });
    }
    fx.play('ring', plan.x, y, { depth: DEPTH.GLOW });
  };

  kit.drive(sprite, plan, (now, before) => {
    if (!before || now.pose === before.pose) return;
    // The pull-back is a hiss of air; the landing the slap itself
    if (now.pose === 'windup' && before.pose === 'idle' && kit.isAhead(sprite)) kit.audio.playSfx(sound, VOL.obstacle * 0.25);
    if (now.pose === 'strike' && now.lane && kit.isOnScreen(sprite)) {
      slap(now.lane);
      if (kit.isAhead(sprite)) kit.audio.playSfx(sound, VOL.obstacle * 0.6);
    }
  });
}
