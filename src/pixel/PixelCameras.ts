import Phaser from 'phaser';
import { DEPTH } from '../config/constants';
import { PixelGridFX } from './PixelGridFX';

type Node = Phaser.GameObjects.GameObject & { depth?: number; cameraFilter: number };

const isText = (go: Phaser.GameObjects.GameObject): boolean =>
  go instanceof Phaser.GameObjects.Text || go instanceof Phaser.GameObjects.BitmapText;

const crisp = new WeakSet<Phaser.GameObjects.GameObject>();

/** Draws this object on the ui camera like text, for artwork that must not be pixelated, such as a brand logo. */
export function keepCrisp<T extends Phaser.GameObjects.GameObject>(go: T): T {
  crisp.add(go);
  return go;
}

/**
 * Every scene gets two cameras: the main one draws the world through PixelGridFX, and a `ui` camera on top,
 * kept in step with it, draws text and the top layers (popups, HUD, pause, overlays) at the finer logical grid
 * so small type stays readable. Which camera draws what is decided each frame, because depth is usually set
 * after an object is added.
 */
export class PixelCameras extends Phaser.Plugins.ScenePlugin {
  private ui?: Phaser.Cameras.Scene2D.Camera;

  boot(): void {
    const events = this.systems!.events;
    events.on(Phaser.Scenes.Events.CREATE, this.setup, this);
    events.on(Phaser.Scenes.Events.PRE_RENDER, this.route, this);
    events.on(Phaser.Scenes.Events.SHUTDOWN, () => { this.ui = undefined; });
    this.game!.scale.on(Phaser.Scale.Events.RESIZE, this.resize, this);
    events.once(Phaser.Scenes.Events.DESTROY, () => this.game?.scale.off(Phaser.Scale.Events.RESIZE, this.resize, this));
  }

  private setup(): void {
    if (this.game!.renderer.type !== Phaser.WEBGL) return;
    const cameras = this.scene!.cameras;
    // Opaque, or the pipeline's render target keeps partial alpha and the sky's 0.8 is applied twice
    if (cameras.main.transparent) cameras.main.setBackgroundColor(this.game!.config.backgroundColor.color);
    cameras.main.setPostPipeline(PixelGridFX);
    this.ui = cameras.add(0, 0, cameras.main.width, cameras.main.height, false, 'ui');
  }

  private resize(size: Phaser.Structs.Size): void {
    this.ui?.setSize(size.width, size.height);
  }

  private route(): void {
    const ui = this.ui;
    if (!ui) return;
    const main = this.scene!.cameras.main;
    ui.setScroll(main.scrollX, main.scrollY);
    ui.setZoom(main.zoom);
    ui.setOrigin(main.originX, main.originY);
    ui.setAlpha(main.alpha);

    const walk = (list: Phaser.GameObjects.GameObject[], inherited: number): void => {
      for (const go of list as Node[]) {
        const depth = Math.max(inherited, go.depth ?? 0);
        if (go instanceof Phaser.GameObjects.Container) {
          go.cameraFilter = 0;
          walk(go.list, depth);
          continue;
        }
        const onUi = isText(go) || crisp.has(go) || depth >= DEPTH.POPUP;
        go.cameraFilter = onUi ? main.id : ui.id;
      }
    };
    walk(this.scene!.children.list, -Infinity);
  }
}
