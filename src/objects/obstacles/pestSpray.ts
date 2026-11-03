import Phaser from 'phaser';
import { DEPTH } from '../../config/constants';
import { frameOf } from '../../config/sprites';
import { ObstacleKit } from './ObstacleKit';

/** The first jolt of the baked shake (tools/art/objects.py), when the can kicks. */
const SQUIRT_FRAME = 1;
const HAZE_ALPHA = 0.15;

export function spawnPestSpray(kit: ObstacleKit, x: number): void {
  const { scene } = kit;
  const floor = kit.randomFloor();
  const standY = kit.standY(floor);

  const spray = kit.createSprite(x, standY, 'spray', 'spray', floor);
  kit.playSoundOnVisible(spray, 'spray-sfx', 0.3);

  // Green haze behind the can, brightening with each squirt
  const haze = scene.add.circle(x, standY - spray.displayHeight * 0.4, 30, 0x88dd44, HAZE_ALPHA);
  haze.setDepth(DEPTH.OBSTACLES - 1);
  haze.setBlendMode(Phaser.BlendModes.ADD);

  // Mist leaves the nozzle on the can's jolt, once per loop of its shake, so the two keep time
  const nozzleY = standY - spray.displayHeight * 0.8;
  const squirt = (_anim: Phaser.Animations.Animation, frame: Phaser.Animations.AnimationFrame): void => {
    if (frame.textureFrame !== frameOf('spray', SQUIRT_FRAME) || !kit.isOnScreen(spray)) return;
    scene.tweens.add({ targets: haze, alpha: HAZE_ALPHA * 2, scale: 1.2, duration: 120, yoyo: true, ease: 'Sine.easeOut' });
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
  };
  spray.on(Phaser.Animations.Events.ANIMATION_UPDATE, squirt);

  kit.track(spray, { objects: [haze] });
}
