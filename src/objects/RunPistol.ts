/**
 * The pistol the roach carries through the run once it has earned it (cockroach#100): the atlas's pistol held out in
 * front of its face, in its jaws, muzzle forward, pinned before every render to the 'head' anchor of the frame the roach
 * shows, so it rides the run, hop and dash cycles without a frame of the roach changing. A shot kicks it back a texel
 * or two for a moment; the muzzle flash and the casing are Gunfire's.
 */
import Phaser from 'phaser';
import { PIXEL_BLOCK } from '../config/constants';
import { ATLAS, SPRITE_SCALE, frameOf } from '../config/sprites';
import { ANCHORS_KEY, Anchors, parseRoach } from '../config/skins';

/** Its grip on the anchor, from the pistol frame's left edge and bottom, native px; the muzzle from there. */
const GRIP = { x: 4, y: 1 };
const MUZZLE = { x: 13, y: -6 };
/** The anchor point on the roach this sits on, nudged forward and down to its jaws, native px. */
const SEAT = { x: 2, y: 8 };
const KICK_PX = 2 * PIXEL_BLOCK;
const KICK_MS = 90;
/** The frames it rides on: on all six legs. Rearing up for a boss it is in the roach's hands instead. */
const CARRIED_IN = new Set(['run', 'idle', 'hop', 'dash']);

export class RunPistol {
  private sprite: Phaser.GameObjects.Image;
  private kickUntil = 0;
  private shown = false;

  constructor(private scene: Phaser.Scene, private roach: Phaser.GameObjects.Sprite) {
    this.sprite = scene.add.image(roach.x, roach.y, ATLAS, frameOf('pistol')).setOrigin(0, 1).setVisible(false);
    scene.events.on(Phaser.Scenes.Events.PRE_RENDER, this.follow, this);
    roach.once(Phaser.GameObjects.Events.DESTROY, () => this.destroy());
  }

  /** Carried or not (the run owns the gun, and this is not a match). */
  setShown(shown: boolean): void {
    this.shown = shown;
    this.follow();
  }

  /** A shot: it kicks back. Returns where the bullet leaves, in the world: the muzzle where it was before the kick. */
  fire(): { x: number; y: number } {
    this.kickUntil = this.scene.time.now + KICK_MS;
    this.follow();
    const { sprite } = this;
    return { x: sprite.x + MUZZLE.x * SPRITE_SCALE + KICK_PX, y: sprite.y + MUZZLE.y * SPRITE_SCALE };
  }

  private follow(): void {
    const { roach, sprite } = this;
    const anchors = this.scene.cache.json.get(ANCHORS_KEY) as Anchors | undefined;
    const parsed = parseRoach(roach.frame.name);
    const frame = parsed && CARRIED_IN.has(parsed.anim) ? anchors?.roach[parsed.anim]?.[parsed.frame] : undefined;
    if (!this.shown || !frame || frame.hide || !roach.visible) {
      sprite.setVisible(false);
      return;
    }
    const [ax, ay] = frame.head;
    const kick = this.scene.time.now < this.kickUntil ? KICK_PX : 0;
    const x = roach.x + (ax + SEAT.x - GRIP.x - roach.displayOriginX) * roach.scaleX - kick;
    const y = roach.y + (ay + SEAT.y + GRIP.y - roach.displayOriginY) * roach.scaleY;
    sprite.setPosition(Math.round(x / PIXEL_BLOCK) * PIXEL_BLOCK, Math.round(y / PIXEL_BLOCK) * PIXEL_BLOCK)
      .setScale(SPRITE_SCALE)
      .setAlpha(roach.alpha)
      .setVisible(true)
      .setDepth(roach.depth + 0.05);
  }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.PRE_RENDER, this.follow, this);
    if (this.sprite.active) this.sprite.destroy();
  }
}
