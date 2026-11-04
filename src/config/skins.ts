/**
 * What a roach wears: a skin, something on its head, something on its back. The art is baked by tools/art (skins.py):
 * skins as whole roach frames (roach-<skin>-<anim>_<n>), worn items as their own little looping animations
 * (acc-<item>_<n>). The bake also writes assets/anchors.json: where the head, back and tail are in every roach frame,
 * and how each item is worn, so the game pins items on as the roach runs, hops and rolls over. Ids match skins.py
 * and server/economy.ts, which owns the prices.
 */
import Phaser from 'phaser';
import { ATLAS } from './sprites';

export interface Look {
  skin: string | null;
  head: string | null;
  back: string | null;
}

export type Slot = keyof Look;

export const PLAIN: Look = { skin: null, head: null, back: null };

export const ITEMS: Record<Slot, { id: string; name: string }[]> = {
  skin: [
    { id: 'zombie', name: 'Zombie' },
    { id: 'lodowy', name: 'Lodowy' },
    { id: 'robot', name: 'Robot' },
    { id: 'lawa', name: 'Lawa' },
    { id: 'metal', name: 'Szczere złoto' },
    { id: 'kosmiczny', name: 'Kosmiczny' },
  ],
  head: [
    { id: 'czapka', name: 'Czapka' },
    { id: 'imprezowa', name: 'Imprezowa' },
    { id: 'kowbojski', name: 'Kowbojski' },
    { id: 'sluchawki', name: 'Słuchawki' },
    { id: 'cylinder', name: 'Cylinder' },
    { id: 'wiking', name: 'Wiking' },
    { id: 'smiglo', name: 'Śmigiełko' },
    { id: 'korona', name: 'Korona' },
    { id: 'aureola', name: 'Aureola' },
  ],
  back: [
    { id: 'balonik', name: 'Balonik' },
    { id: 'piwo', name: 'Puszka piwa' },
    { id: 'peleryna', name: 'Peleryna' },
    { id: 'plecak', name: 'Plecak odrzutowy' },
    { id: 'skrzydla', name: 'Skrzydła wróżki' },
    { id: 'rakieta', name: 'Silnik rakietowy' },
  ],
};

export const ROACH_ANIMS = ['run', 'idle', 'hop', 'dash', 'death'] as const;
export type RoachAnim = typeof ROACH_ANIMS[number];

/** The animation key for this roach animation in this look's skin. */
export function roachAnim(anim: RoachAnim, look: Look | null | undefined): string {
  return look?.skin ? `roach-${look.skin}-${anim}` : `roach-${anim}`;
}

export const ANCHORS_KEY = 'anchors';

type Point = [number, number];
type AnchorName = 'head' | 'back' | 'tail' | 'side' | 'shoulder';
type FrameAnchors = Record<AnchorName, Point> & { angle: number };
export interface Anchors {
  cell: Point;
  roach: Record<RoachAnim, FrameAnchors[]>;
  /** `with`: other items worn along with this one, like the far wing of a pair, drawn behind the body. */
  items: Record<string, { anchor: AnchorName; behind: boolean; frames: number; fps: number; with?: string[] }>;
}

/** The worn items' looping animations, from anchors.json. */
export function createItemAnimations(scene: Phaser.Scene): void {
  const anchors = scene.cache.json.get(ANCHORS_KEY) as Anchors | undefined;
  for (const [id, item] of Object.entries(anchors?.items ?? {})) {
    if (item.frames < 2 || scene.anims.exists(`acc-${id}`)) continue;
    scene.anims.create({
      key: `acc-${id}`,
      frames: scene.anims.generateFrameNames(ATLAS, { prefix: `acc-${id}_`, start: 0, end: item.frames - 1 }),
      frameRate: item.fps,
      repeat: -1,
    });
  }
}

/**
 * A worn item: its own sprite and animation, pinned right before every render to the anchor in the roach's current
 * frame (and turned with it), with the roach's alpha and visibility. Behind the body or in front, as it's worn.
 */
export class Worn {
  private sprite: Phaser.GameObjects.Sprite;
  private wearer: Phaser.GameObjects.Sprite;
  private scene: Phaser.Scene;
  private anchors: Anchors;
  private item: Anchors['items'][string];

  constructor(scene: Phaser.Scene, wearer: Phaser.GameObjects.Sprite, id: string, anchors: Anchors) {
    this.scene = scene;
    this.wearer = wearer;
    this.anchors = anchors;
    this.item = anchors.items[id];
    this.sprite = scene.add.sprite(wearer.x, wearer.y, ATLAS, `acc-${id}_0`);
    if (this.item.frames > 1) this.sprite.play({ key: `acc-${id}`, startFrame: Math.floor(Math.random() * this.item.frames) });
    // In a container (a menu page that slides) it lives in the same one, just behind or just in front of the roach
    const container = wearer.parentContainer;
    if (container) {
      const at = container.getIndex(wearer);
      container.addAt(this.sprite, this.item.behind ? at : at + 1);
    }
    scene.events.on(Phaser.Scenes.Events.PRE_RENDER, this.follow, this);
    wearer.once(Phaser.GameObjects.Events.DESTROY, () => this.destroy());
    this.follow();
  }

  private follow(): void {
    const { wearer, sprite, anchors } = this;
    const match = /^roach-(?:[a-z]+-)?(run|idle|hop|dash|death)_(\d+)$/.exec(wearer.frame.name);
    const frame = match ? anchors.roach[match[1] as RoachAnim]?.[Number(match[2])] : undefined;
    if (!frame) return;
    const [ax, ay] = frame[this.item.anchor];
    // From the roach's centre to the anchor, in the roach's own scale, flip and turn
    const dx = (ax - anchors.cell[0] / 2) * wearer.scaleX * (wearer.flipX ? -1 : 1);
    const dy = (ay - anchors.cell[1] / 2) * wearer.scaleY;
    const turn = wearer.rotation;
    sprite.setPosition(wearer.x + dx * Math.cos(turn) - dy * Math.sin(turn), wearer.y + dx * Math.sin(turn) + dy * Math.cos(turn))
      .setScale(wearer.scaleX, wearer.scaleY)
      .setFlipX(wearer.flipX)
      .setAngle(wearer.angle + frame.angle)
      .setAlpha(wearer.alpha)
      .setVisible(wearer.visible)
      .setDepth(wearer.depth + (this.item.behind ? -0.1 : 0.1));
  }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.PRE_RENDER, this.follow, this);
    if (this.sprite.active) this.sprite.destroy();
  }
}

/** Puts a look's worn items on a roach sprite (its skin is in the animations it plays). Returns them, to take off. */
export function dress(scene: Phaser.Scene, roach: Phaser.GameObjects.Sprite, look: Look | null | undefined): Worn[] {
  const anchors = scene.cache.json.get(ANCHORS_KEY) as Anchors | undefined;
  if (!anchors || !look) return [];
  return [look.head, look.back]
    .filter((id): id is string => id !== null && Boolean(anchors.items[id]))
    .flatMap(id => [id, ...(anchors.items[id].with ?? [])])
    .map(id => new Worn(scene, roach, id, anchors));
}
