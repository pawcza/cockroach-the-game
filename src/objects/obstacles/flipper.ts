import { ObstacleKit } from './ObstacleKit';

/** The slipper's slap is all in its baked animation: no runtime swing or whoosh on top. */
export function spawnFlipper(kit: ObstacleKit, x: number): void {
  const floor = kit.randomFloor();
  const flipper = kit.createSprite(x, kit.standY(floor), 'flipper', 'flipper', floor);
  kit.playSoundOnVisible(flipper, 'flipper-sfx', 0.3);
}
