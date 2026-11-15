import Phaser from 'phaser';
import { DEPTH } from '../config/constants';
import { getFx } from '../effects/Fx';

const sparkling = new WeakSet<Phaser.Scene>();

/** Whether every press in this scene already sparkles where it lands, so a button needn't add its own. */
export const hasTapSparkle = (scene: Phaser.Scene): boolean => sparkling.has(scene);

/**
 * A sparkle wherever the player clicks or taps, on a button or not, in every scene but those named: a run's taps are
 * its controls, and the boot screen has no effects loaded yet.
 */
export function installTapSparkle(game: Phaser.Game, except: string[]): void {
  game.events.once(Phaser.Core.Events.READY, () => {
    for (const scene of game.scene.scenes) {
      if (except.includes(scene.scene.key)) continue;
      sparkling.add(scene);
      // The scene's input drops its listeners when it shuts down, so each start hooks it again
      scene.events.on(Phaser.Scenes.Events.CREATE, () => {
        scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
          getFx(scene).play('press', pointer.x, pointer.y, { ui: true, scrollFactor: 0, depth: DEPTH.TAP_FX });
        });
      });
    }
  });
}
