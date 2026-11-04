import { ObstacleKit } from './ObstacleKit';
import { Floor } from '../Player';

export function spawnCatPaw(kit: ObstacleKit, x: number, lane?: Floor): void {
  const floor = lane ?? kit.randomFloor();

  const paw = kit.createSprite(x, kit.standY(floor), 'cat', 'cat', floor, {
    hitbox: { w: 0.5, h: 0.5 },
  });
  kit.playSoundOnVisible(paw, 'cat-sfx', 0.5);

  // Patrol 200px, on the run's clock so every client sees the cat in the same place
  const patrol = kit.swing(paw, 'x', x - 100, x + 100, 1500);
  patrol();
  const flipUpdate = kit.faceTravel(paw);

  kit.track(paw, { updates: [patrol, flipUpdate] });
}
