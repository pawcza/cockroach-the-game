/** An achievement's icon as an image: its atlas picture (tools/art/icons.py ach-*) at the game's pixel scale. */
import Phaser from 'phaser';
import { ICON_FALLBACK } from '../systems/achievementView';
import { ATLAS, frameOf, SPRITE_SCALE } from '../config/sprites';

/** `anim` is an ach-* name (systems/achievementView achievementIcon); one that isn't in the atlas shows the fallback star. */
export function addAchievementIcon(scene: Phaser.Scene, x: number, y: number, anim: string): Phaser.GameObjects.Image {
  const frame = frameOf(anim, 0);
  return scene.add.image(x, y, ATLAS, scene.textures.get(ATLAS).has(frame) ? frame : frameOf(ICON_FALLBACK, 0)).setScale(SPRITE_SCALE);
}
