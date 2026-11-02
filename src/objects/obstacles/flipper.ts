import Phaser from 'phaser';
import { DEPTH } from '../../config/constants';
import { ObstacleKit } from './ObstacleKit';

export function spawnFlipper(kit: ObstacleKit, x: number): void {
  const { scene } = kit;
  const floor = kit.randomFloor();
  const centerY = kit.centerY(floor);

  const flipper = kit.createSprite(x, centerY, 'flipper', 'flipper', floor);
  kit.playSoundOnVisible(flipper, 'flipper-sfx', 0.3);

  const rotationTween = scene.tweens.add({
    targets: flipper,
    angle: { from: -40, to: 40 },
    duration: 1000,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // Whoosh arc
  const whooshGfx = scene.add.graphics();
  whooshGfx.setDepth(DEPTH.GLOW);
  const arcRadius = flipper.displayHeight * 0.8;
  const whooshUpdate = (): void => {
    whooshGfx.clear();
    const camera = scene.cameras.main;
    if (flipper.x < camera.scrollX - 200 || flipper.x > camera.scrollX + camera.width + 200) return;
    const arcSpan = 25;
    const startRad = Phaser.Math.DegToRad(flipper.angle - 90 - arcSpan);
    const endRad = Phaser.Math.DegToRad(flipper.angle - 90);
    whooshGfx.lineStyle(3, 0xffffff, 0.25);
    whooshGfx.beginPath();
    whooshGfx.arc(x, centerY, arcRadius, startRad, endRad, false);
    whooshGfx.strokePath();
    whooshGfx.lineStyle(1.5, 0xffffff, 0.12);
    whooshGfx.beginPath();
    whooshGfx.arc(x, centerY, arcRadius * 0.7, startRad, endRad, false);
    whooshGfx.strokePath();
  };

  kit.track(flipper, { tweens: [rotationTween], updates: [whooshUpdate], objects: [whooshGfx] });
}
