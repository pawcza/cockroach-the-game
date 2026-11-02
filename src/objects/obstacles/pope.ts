import Phaser from 'phaser';
import { DEPTH } from '../../config/constants';
import { ObstacleKit } from './ObstacleKit';

export function spawnPope(kit: ObstacleKit, x: number): void {
  const { scene } = kit;
  const { sprite: pope, floatTween } = kit.createFloater(x, 'pope', 'pope', 1800, { key: 'pope-sfx', volume: 0.4 });

  // Slight rotation while swinging
  const angleTween = scene.tweens.add({
    targets: pope,
    angle: { from: -15, to: 15 },
    duration: 900,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // Smoke trail
  const smokeTimer = kit.emitWhileOnScreen(pope, 150, () => {
    const smoke = scene.add.circle(
      pope.x + Phaser.Math.Between(-5, 5),
      pope.y + Phaser.Math.Between(-5, 5),
      Phaser.Math.Between(4, 8),
      0x888888,
      0.4,
    );
    smoke.setDepth(DEPTH.GLOW);
    scene.tweens.add({
      targets: smoke,
      alpha: 0,
      scale: 2,
      duration: 2000,
      ease: 'Sine.easeOut',
      onComplete: () => smoke.destroy(),
    });
  });

  kit.track(pope, { tweens: [floatTween, angleTween], timers: [smokeTimer] });
}
