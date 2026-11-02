import { ObstacleKit } from './ObstacleKit';

export function spawnNewspaper(kit: ObstacleKit, x: number): void {
  const { sprite, floatTween } = kit.createFloater(x, 'newspaper', 'newspaper', 2000, { key: 'newspaper-sfx', volume: 0.4 });
  sprite.setAngle(-8);

  kit.track(sprite, { tweens: [floatTween] });
}
