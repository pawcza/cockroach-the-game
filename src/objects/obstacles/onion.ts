import Phaser from 'phaser';
import { DEPTH } from '../../config/constants';
import { ObstacleKit } from './ObstacleKit';
import { Floor } from '../Player';

export function spawnOnion(kit: ObstacleKit, x: number, lane?: Floor): void {
  const { scene } = kit;
  const floor = lane ?? kit.randomFloor();
  const standY = kit.standY(floor);

  const onion = kit.createSprite(x, standY, 'onion', 'onion', floor);

  const tweens: Phaser.Tweens.Tween[] = [];
  const stinks: Phaser.GameObjects.Arc[] = [];

  // Stink waves
  const stinkStartY = standY - onion.displayHeight * 0.75;
  for (let i = 0; i < 3; i++) {
    const offsetX = Phaser.Math.Between(-8, 8);
    const stink = scene.add.circle(x + offsetX, stinkStartY, 4, 0x99cc33, 0.6);
    stink.setScale(0.5 + i * 0.15);
    stink.setDepth(DEPTH.OBSTACLES);
    stinks.push(stink);

    tweens.push(scene.tweens.add({
      targets: stink,
      y: stinkStartY - 50 - i * 15,
      alpha: 0,
      duration: 1500 + i * 300,
      delay: i * 400,
      repeat: -1,
      ease: 'Sine.easeOut',
      onRepeat: () => {
        stink.y = stinkStartY;
        stink.alpha = 0.6;
      },
    }));
  }

  const tearStartY = standY - onion.displayHeight * 0.6;
  const tearEndY = standY;
  const tearTimer = kit.emitWhileOnScreen(onion, 800, () => {
    const side = Phaser.Math.Between(0, 1) === 0 ? -1 : 1;
    const tear = scene.add.circle(x + side * Phaser.Math.Between(4, 10), tearStartY, Phaser.Math.Between(1, 3), 0x4488ff, 0.7);
    tear.setDepth(DEPTH.OBSTACLES);
    scene.tweens.add({
      targets: tear,
      y: tearEndY,
      alpha: 0,
      scaleY: 1.8,
      duration: Phaser.Math.Between(600, 1000),
      ease: 'Quad.easeIn',
      onComplete: () => tear.destroy(),
    });
  });

  kit.track(onion, { tweens, timers: [tearTimer], objects: stinks });
}
