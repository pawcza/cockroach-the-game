import Phaser from 'phaser';
import { DEPTH } from '../../config/constants';
import { ObstacleKit } from './ObstacleKit';

const CHARGE_RANGE = 300;
const CHARGE_MS = 1400;

export function spawnBison(kit: ObstacleKit, x: number): void {
  const { scene } = kit;
  const floor = kit.randomFloor();
  const standY = kit.standY(floor);

  const bison = kit.createSprite(x, standY, 'bison', 'bison', floor, {
    hitbox: { w: 0.6, h: 0.55 },
  });
  kit.playSoundOnVisible(bison, 'bison-sfx', 0.5);

  // Charge patrol. Fast enough to be a threat, slow and short enough to read and dodge on a lane change
  bison.x = x - CHARGE_RANGE / 2;
  const chargeTween = scene.tweens.add({
    targets: bison,
    x: x + CHARGE_RANGE / 2,
    duration: CHARGE_MS,
    ease: 'Sine.easeInOut',
    yoyo: true,
    repeat: -1,
  });

  const flipUpdate = kit.faceTravel(bison);

  // Dust clouds
  const dustTimer = kit.emitWhileOnScreen(bison, 100, () => {
    const dust = scene.add.circle(bison.x + (bison.flipX ? -15 : 15), standY - 8, Phaser.Math.Between(2, 4), 0x997744, 0.4);
    dust.setDepth(DEPTH.GLOW);
    scene.tweens.add({
      targets: dust,
      alpha: 0,
      scale: 2,
      y: dust.y - 10,
      duration: 400,
      ease: 'Sine.easeOut',
      onComplete: () => dust.destroy(),
    });
  });

  kit.track(bison, { tweens: [chargeTween], timers: [dustTimer], updates: [flipUpdate] });
}
