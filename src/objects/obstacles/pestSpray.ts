import Phaser from 'phaser';
import { DEPTH } from '../../config/constants';
import { ObstacleKit } from './ObstacleKit';

export function spawnPestSpray(kit: ObstacleKit, x: number): void {
  const { scene } = kit;
  const floor = kit.randomFloor();
  const centerY = kit.centerY(floor);

  const spray = kit.createSprite(x, centerY, 'pest-spray', 'spray', floor);
  kit.playSoundOnVisible(spray, 'spray-sfx', 0.3);

  // Persistent green haze behind spray
  const haze = scene.add.circle(x, centerY, 30, 0x88dd44, 0.15);
  haze.setDepth(DEPTH.OBSTACLES - 1);
  haze.setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: haze,
    alpha: { from: 0.15, to: 0.3 },
    scale: { from: 1, to: 1.2 },
    duration: 600,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // Vibration
  const vibrationTween = scene.tweens.add({
    targets: spray,
    x: spray.x + 1.5,
    duration: 50,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // Mist from nozzle
  const nozzleY = centerY - spray.displayHeight * 0.45;
  const mistTimer = kit.emitWhileOnScreen(spray, 300, () => {
    for (let i = 0; i < 7; i++) {
      const droplet = scene.add.circle(
        spray.x + Phaser.Math.Between(-3, 3),
        nozzleY + Phaser.Math.Between(-2, 2),
        Phaser.Math.Between(3, 8),
        0x88dd44,
        Math.random() * (0.6 - 0.3) + 0.3,
      );
      droplet.setDepth(DEPTH.OBSTACLES);
      scene.tweens.add({
        targets: droplet,
        x: droplet.x + Phaser.Math.Between(-30, 30),
        y: droplet.y + Phaser.Math.Between(-35, -15),
        alpha: 0,
        scale: Math.random() * (2.5 - 1.5) + 1.5,
        duration: Phaser.Math.Between(800, 1400),
        ease: 'Sine.easeOut',
        onComplete: () => droplet.destroy(),
      });
    }
  });

  kit.track(spray, { tweens: [vibrationTween], timers: [mistTimer], objects: [haze] });
}
