import Phaser from 'phaser';
import { COLORS, DEPTH } from '../../config/constants';
import { Floor } from '../Player';
import { ObstacleKit } from './ObstacleKit';

/** Seconds of warning the disco ball leaves after its last floor swap before it reaches the cockroach. */
const DISCO_LOCK_S = 0.7;

// Rhythmic floor-swap: warmup → jump → wait → repeat
const WARMUP_MS = 400;
const JUMP_MS = 100;
const WAIT_MS = 500;

export function spawnDiscoBall(kit: ObstacleKit, x: number): void {
  const { scene, topY, bottomY } = kit;
  const startTop = kit.random() > 0.5;
  let currentFloor: Floor = startTop ? 'top' : 'bottom';

  const disco = kit.createSprite(x, startTop ? topY : bottomY, 'disco', 'disco', currentFloor, {
    hitbox: { w: 0.6, h: 0.6 },
  });
  kit.playSoundOnVisible(disco, 'disco-sfx', 0.4);

  const tweens: Phaser.Tweens.Tween[] = [];
  const timers: Phaser.Time.TimerEvent[] = [];

  const scheduleSwap = (): void => {
    timers.push(scene.time.delayedCall(WAIT_MS, doSwapCycle));
  };

  const doSwapCycle = (): void => {
    if (!disco.active) return;
    // Once the cockroach is close, the ball holds its floor: its last swap has to land at least
    // DISCO_LOCK_S before contact, or a swap into your lane leaves no time to answer it
    const cockroach = scene.cockroach;
    if (cockroach) {
      const vx = Math.max((cockroach.body as Phaser.Physics.Arcade.Body).velocity.x, 1);
      const ahead = disco.x - cockroach.x;
      if (ahead > -60 && ahead < vx * ((WARMUP_MS + JUMP_MS) / 1000 + DISCO_LOCK_S)) {
        scheduleSwap();
        return;
      }
    }
    const targetFloor: Floor = currentFloor === 'top' ? 'bottom' : 'top';
    const targetY = targetFloor === 'top' ? topY : bottomY;

    // Phase 1: Warmup — pink tint + silhouette at destination
    disco.setTint(0xff00ff);
    const silhouette = scene.add.circle(disco.x, targetY - disco.displayHeight * 0.45, 20, 0xff00ff, 0);
    silhouette.setDepth(DEPTH.GLOW);
    silhouette.setBlendMode(Phaser.BlendModes.ADD);

    scene.tweens.add({
      targets: silhouette,
      alpha: 0.6,
      scaleX: 1.5,
      scaleY: 1.5,
      duration: WARMUP_MS,
      ease: 'Quad.easeIn',
      onComplete: () => {
        if (!disco.active) { silhouette.destroy(); return; }

        // Phase 2: Jump
        currentFloor = targetFloor;
        disco.setData('floor', currentFloor);
        scene.tweens.add({
          targets: disco,
          y: targetY,
          duration: JUMP_MS,
          ease: 'Power2',
          onComplete: () => {
            if (!disco.active) return;
            disco.clearTint();
            // Phase 3: Wait, then repeat
            scheduleSwap();
          },
        });

        // Silhouette pops and fades out
        scene.tweens.add({
          targets: silhouette,
          alpha: 0,
          scaleX: 2.5,
          scaleY: 2.5,
          duration: 200,
          ease: 'Quad.easeOut',
          onComplete: () => silhouette.destroy(),
        });
      },
    });
  };

  // Start first cycle after initial wait
  scheduleSwap();

  // Rainbow light rays
  const rayColors = COLORS.DISCO;
  timers.push(kit.emitWhileOnScreen(disco, 150, () => {
    const angle = Math.random() * Math.PI * 2;
    const color = rayColors[Phaser.Math.Between(0, rayColors.length - 1)];
    const ray = scene.add.rectangle(disco.x, disco.y - disco.displayHeight * 0.45, Phaser.Math.Between(2, 4), Phaser.Math.Between(8, 20), color, 0.6);
    ray.setDepth(DEPTH.GLOW);
    ray.setRotation(angle);
    const dist = 40 + Math.random() * 30;
    scene.tweens.add({
      targets: ray,
      x: disco.x + Math.cos(angle) * dist,
      y: ray.y + Math.sin(angle) * dist,
      alpha: 0,
      duration: 400,
      ease: 'Sine.easeOut',
      onComplete: () => ray.destroy(),
    });
  }));

  // Strobe flash when cockroach is within ~250px
  const { width, height } = scene.cameras.main;
  const strobeOverlay = scene.add
    .rectangle(width / 2, height / 2, width, height, 0xffffff, 0)
    .setScrollFactor(0)
    .setDepth(DEPTH.DISCO_STROBE);

  let strobePhase = 0;
  const strobeUpdate = (): void => {
    const camera = scene.cameras.main;
    if (disco.x < camera.scrollX - 200 || disco.x > camera.scrollX + camera.width + 200) { strobeOverlay.setAlpha(0); return; }
    const cockroach = scene.cockroach;
    if (!cockroach) return;
    const dist = Phaser.Math.Distance.Between(cockroach.x, cockroach.y, disco.x, disco.y);
    if (dist < 250) {
      strobePhase += 0.25;
      const intensity = Math.max(0, (1 - dist / 250)) * 0.6;
      strobeOverlay.setAlpha(Math.abs(Math.sin(strobePhase)) * intensity);
    } else {
      strobeOverlay.setAlpha(0);
    }
  };

  kit.track(disco, { tweens, timers, updates: [strobeUpdate], objects: [strobeOverlay] });
}
