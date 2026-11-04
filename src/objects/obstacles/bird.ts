import { DEPTH } from '../../config/constants';
import { ObstacleKit } from './ObstacleKit';

export function spawnBird(kit: ObstacleKit, x: number): void {
  const { scene, topY, bottomY } = kit;

  const bird = kit.createFloater(x, 'bird', 'bird', 1200, { key: 'bird-sfx', volume: 0.4 }, {
    hitbox: { w: 0.75, h: 0.42 }, // the body only: the raised wings don't kill
  });

  // Ground shadow
  const shadow = scene.add.ellipse(x, scene.floorBottomY - 2, 30, 8, 0x000000, 0.25);
  shadow.setDepth(DEPTH.CONTACT_SHADOW);
  const shadowUpdate = (): void => {
    const progress = (bird.y - topY) / (bottomY - topY);
    const shadowScale = 0.5 + progress * 1.0;
    shadow.setScale(shadowScale, shadowScale * 0.5);
    shadow.setAlpha(0.1 + progress * 0.3);
  };

  kit.track(bird, { updates: [shadowUpdate], objects: [shadow] });
}
