import Phaser from 'phaser';
import { DEPTH } from '../../config/constants';
import { ObstacleKit } from './ObstacleKit';

export function spawnBison(kit: ObstacleKit, x: number): void {
  const { scene } = kit;
  const floor = kit.randomFloor();
  const centerY = kit.centerY(floor);

  const bison = kit.createSprite(x, centerY, 'bison', 'bison', floor, {
    hitbox: { w: 0.7, h: 0.6 },
  });
  kit.playSoundOnVisible(bison, 'bison-sfx', 0.5);

  // Fast charge patrol — 400px range
  bison.x = x - 200;
  const chargeTween = scene.tweens.add({
    targets: bison,
    x: x + 200,
    duration: 1000,
    ease: 'Sine.easeInOut',
    yoyo: true,
    repeat: -1,
  });

  const flipUpdate = (): void => { bison.setFlipX(bison.x > x); };

  // Dust clouds
  const dustTimer = kit.emitWhileOnScreen(bison, 100, () => {
    const dust = scene.add.circle(bison.x + (bison.flipX ? 15 : -15), centerY + 10, Phaser.Math.Between(2, 4), 0x997744, 0.4);
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
