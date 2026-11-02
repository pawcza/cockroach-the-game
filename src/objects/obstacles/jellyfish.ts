import Phaser from 'phaser';
import { DEPTH } from '../../config/constants';
import { ObstacleKit } from './ObstacleKit';

export function spawnJellyfish(kit: ObstacleKit, x: number): void {
  const { scene } = kit;
  const { sprite: jelly, floatTween } = kit.createFloater(x, 'jellyfish', 'jellyfish', 2500, { key: 'jellyfish-sfx', volume: 0.4 }, {
    hitbox: { w: 0.7, h: 0.85 },
  });

  // Pulsing transparency
  const pulseTween = scene.tweens.add({
    targets: jelly,
    alpha: { from: 0.6, to: 1.0 },
    duration: 800,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // Trailing tentacle particles
  const particlesTimer = kit.emitWhileOnScreen(jelly, 200, () => {
    const particle = scene.add.circle(
      jelly.x + Phaser.Math.Between(-10, 10),
      jelly.y + jelly.displayHeight * 0.3,
      Phaser.Math.Between(1, 3),
      0x8844ff,
      0.5,
    );
    particle.setDepth(DEPTH.GLOW);
    scene.tweens.add({
      targets: particle,
      y: particle.y + 20,
      alpha: 0,
      duration: 600,
      ease: 'Sine.easeOut',
      onComplete: () => particle.destroy(),
    });
  });

  kit.track(jelly, { tweens: [floatTween, pulseTween], timers: [particlesTimer] });
}
