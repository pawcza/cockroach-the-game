import { ObstacleKit } from './ObstacleKit';

export function spawnCatPaw(kit: ObstacleKit, x: number): void {
  const { scene } = kit;
  const floor = kit.randomFloor();

  const paw = kit.createSprite(x, kit.standY(floor), 'cat', 'cat', floor, {
    hitbox: { w: 0.5, h: 0.5 },
  });
  kit.playSoundOnVisible(paw, 'cat-sfx', 0.5);

  // Patrol 200px
  paw.x = x - 100;
  const patrolTween = scene.tweens.add({
    targets: paw,
    x: x + 100,
    duration: 1500,
    ease: 'Sine.easeInOut',
    yoyo: true,
    repeat: -1,
  });

  const flipUpdate = kit.faceTravel(paw);

  kit.track(paw, { tweens: [patrolTween], updates: [flipUpdate] });
}
