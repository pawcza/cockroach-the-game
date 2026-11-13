import { VOL } from '../../audio/AudioManager';
import { DEPTH } from '../../config/constants';
import { getFx } from '../../effects/Fx';
import { EnemyPlan } from './behaviours';
import { TIMINGS, feetY, placeOf } from './cast';
import { ObstacleKit } from './ObstacleKit';

/** Its gallop played faster pawing and charging, slower walking back. */
const PAW = 2.5;
const CHARGE = 2;
const WALK = 0.7;

/**
 * The bison, charging: it stands in its lane, paws and leans back, rushes along the lane at the runner, halts, and
 * walks back (charger in behaviours.ts). Solid all the while.
 */
export function spawnBison(kit: ObstacleKit, plan: EnemyPlan): void {
  const fx = getFx(kit.scene);
  const standY = feetY(plan.id, plan.lane);
  // Its dust is thrown from fixed distances off its hooves: they grow with it
  const k = placeOf(plan.id).size;
  const depth = DEPTH.OBSTACLES + 0.5;
  const bison = kit.enemy(plan);
  kit.playSoundOnVisible(bison, 'bison-sfx', 0.5);

  let pose = 'idle';
  kit.drive(bison, plan, (now, before) => {
    if (now.pose !== before?.pose) pose = now.pose;
    // It halts at the end of its charge: dust thrown ahead of it and a ring
    if (now.pose === 'strike' && before?.pose === 'strike') {
      if (now.x <= plan.x - TIMINGS.bison.distance + 0.5 && pose !== 'halted') {
        pose = 'halted';
        fx.play('dust-land', bison.x - bison.displayWidth * 0.3, standY, { depth });
        fx.play('ring', bison.x - bison.displayWidth * 0.3, standY, { depth });
      }
      return;
    }
    if (now.pose === before?.pose) return;
    // The art faces left, at the runner; walking back it turns round
    bison.setFlipX(now.pose === 'recover');
    bison.anims.timeScale = { windup: PAW, strike: CHARGE, recover: WALK }[now.pose as string] ?? 1;
    if (!before || !kit.isOnScreen(bison)) return;
    if (now.pose === 'windup') {
      // The pawing's first frame: an orange flare on its horns, a ring of light round it, dust off its hooves
      fx.play('flare-big-orange', bison.x - bison.displayWidth * 0.3, bison.y - bison.displayHeight * 0.62, { depth: DEPTH.PICKUPS + 1 });
      fx.play('shield', bison.x, bison.getCenter().y, { depth: DEPTH.PICKUPS + 1 });
      fx.play('dust', bison.x - 12 * k, standY, { depth });
      if (kit.isAhead(bison)) kit.audio.playSfx('bison-sfx', VOL.obstacle * 0.5);
    }
  });

  // Dust off its hooves while it paws, and kicked up behind it as it charges
  const dustTimer = kit.emitWhileOnScreen(bison, 110, () => {
    if (pose === 'windup') fx.play('dust', bison.x + (Math.random() < .5 ? -14 : 10) * k, standY, { depth });
    if (pose === 'strike') fx.play('skid', bison.x + bison.displayWidth * 0.3, standY, { depth });
  });

  kit.track(bison, { timers: [dustTimer] });
}
