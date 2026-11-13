import Phaser from 'phaser';
import { COMBO_FLAMES, DEPTH } from '../config/constants';
import { ROACH_FEET_OFFSET, SPRITE_SCALE } from '../config/sprites';
import type { Player } from '../objects/Player';
import { popupStyle } from '../utils/TextStyles';
import { getFx, type Fx, type FxHandle } from './Fx';
import { popup } from './Popup';

// Speed tops out near 3.4x. The scene keeps its colours at every speed: only the edges of the screen close in.
const VIGNETTE_FROM = 2.7; // ~Lv8
const VIGNETTE_MAX = 0.35;
const MAX_SPEED = 3.4;

/**
 * The combo's flames are the roach's exhaust (tools/art/vfx.py, "combo exhaust"): rooted under its rear and streaming
 * back, longer and hotter each tier, with speed lines round the body from the second and a shock cone at the head on
 * the third, and embers breaking off the trail that stay behind in the world. All of it behind the roach and nothing
 * ahead of its head but the faint cone, so it never covers the roach or what is coming.
 */
interface ComboFlame { from: number; flame: string; lines?: string; cone: boolean; ember: string; emberMs: number }
const COMBO_FLAME_TIERS: ComboFlame[] = [
  { from: COMBO_FLAMES[2], flame: 'aura-3', lines: 'combo-lines-3', cone: true, ember: 'combo-ember-3', emberMs: 35 },
  { from: COMBO_FLAMES[1], flame: 'aura-2', lines: 'combo-lines-2', cone: false, ember: 'combo-ember-2', emberMs: 55 },
  { from: COMBO_FLAMES[0], flame: 'aura-1', cone: false, ember: 'combo-ember-1', emberMs: 85 },
];
/** Where each piece sits on the roach, in texels from its middle: the trail's root under its rear, the cone at its head. */
const FLAME_AT = { x: -24, y: 5 };
const LINES_AT = { x: 17, y: 0 };
const CONE_AT = { x: 42, y: -3 };
/** Embers come off the trail this far back along it (texels), and drift this fast (px/s) in the world. */
const EMBER_FROM = [30, 70];

/** Which burst each pickup throws, by its frame's art. */
const COLLECT_BURST: [string, string][] = [['apple', 'collect-apple'], ['beer', 'collect-beer'], ['pill', 'collect-pill']];

export class VisualEffects {
  private scene: Phaser.Scene;
  private fx!: Fx;
  private player: Player | null = null;

  private vignetteGraphics!: Phaser.GameObjects.Graphics;
  private flashOverlay!: Phaser.GameObjects.Rectangle;
  private aura: FxHandle | null = null;
  private auraName = '';
  private comboFlame: ComboFlame | null = null;
  private lines: FxHandle | null = null;
  private cone: FxHandle | null = null;
  private emberIn = 0;
  /** The killing hit already had its impact (the hit-stop), so the death doesn't spark again. */
  private hitShown = false;

  private initialized = false;
  private deathSlowMoTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  init(): void {
    if (this.initialized) return;

    const camera = this.scene.cameras.main;
    const w = camera.width;
    const h = camera.height;
    this.fx = getFx(this.scene);

    this.vignetteGraphics = this.scene.add.graphics();
    this.vignetteGraphics.setScrollFactor(0);
    this.vignetteGraphics.setDepth(DEPTH.VFX_VIGNETTE);
    this.vignetteGraphics.setAlpha(0);
    this.drawVignette();

    this.flashOverlay = this.scene.add.rectangle(w / 2, h / 2, w, h, 0xffffff, 0);
    this.flashOverlay.setScrollFactor(0);
    this.flashOverlay.setDepth(DEPTH.VFX_FLASH);

    this.initialized = true;
  }

  /** The roach the run's effects gather around: its combo flames, its death. */
  attachPlayer(player: Player): void {
    this.player = player;
  }

  resize(width: number, height: number): void {
    this.flashOverlay.setPosition(width / 2, height / 2).setSize(width, height);
    this.drawVignette();
  }

  private drawVignette(): void {
    const w = this.scene.cameras.main.width;
    const h = this.scene.cameras.main.height;
    const g = this.vignetteGraphics;
    g.clear();

    for (let i = 0; i < 20; i++) {
      const alpha = (1 - i / 20) * 0.6;
      const thickness = 8;
      const offset = i * thickness;

      g.fillStyle(0x000000, alpha);
      g.fillRect(0, offset, w, thickness);
      g.fillRect(0, h - offset - thickness, w, thickness);
      g.fillRect(offset, 0, thickness, h);
      g.fillRect(w - offset - thickness, 0, thickness, h);
    }
  }

  /** Every frame of the run; `running` is false in a boss fight, where the roach stands and its exhaust is out. */
  update(speedMultiplier: number, running = true): void {
    if (!this.initialized) return;
    const closing = Math.min(Math.max(speedMultiplier - VIGNETTE_FROM, 0) / (MAX_SPEED - VIGNETTE_FROM), 1);
    this.vignetteGraphics.setAlpha(closing * VIGNETTE_MAX);
    // The pill brings its own flames; dead, or standing in a fight, there are none
    const show = running && !!this.player && !this.player.isPillActive && !this.player.isDead;
    for (const handle of [this.aura, this.lines, this.cone]) {
      if (handle?.alive) handle.image.setVisible(show);
    }
    if (show) this.throwEmbers();
  }

  /** Bits breaking off the trail's far end, left where they came off: the world runs on and they fall behind. */
  private throwEmbers(): void {
    const tier = this.comboFlame;
    if (!tier || !this.player) return;
    this.emberIn -= this.scene.game.loop.delta;
    if (this.emberIn > 0) return;
    this.emberIn = tier.emberMs * (0.6 + Math.random() * 0.8);
    const { x, y } = this.player;
    const back = EMBER_FROM[0] + Math.random() * (EMBER_FROM[1] - EMBER_FROM[0]);
    this.fx.play(tier.ember, x + (FLAME_AT.x - back) * SPRITE_SCALE, y + (FLAME_AT.y + (Math.random() - 0.5) * 8) * SPRITE_SCALE, {
      depth: this.player.sprite.depth - 0.3, vx: -20 + Math.random() * 40, vy: -40 + Math.random() * 50, drag: 1.5,
      fps: 6 + Math.random() * 4,
    });
  }

  /**
   * A pickup bursts in its own colours: an apple into red and green bits, a beer into foam and bubbles, a pill into
   * its two halves, told apart by the pickup's frame.
   */
  pickupCollectEffect(x: number, y: number, frameName: string): void {
    if (!this.initialized) return;
    const burst = COLLECT_BURST.find(([art]) => frameName.startsWith(art))?.[1];
    if (!burst) return;
    this.fx.play(burst, x, y, { depth: DEPTH.VFX_TEXT });
  }

  /** The combo's flames grow with it, and go out with it. Called with the combo after every change. */
  setCombo(combo: number): void {
    if (!this.initialized || !this.player) return;
    const tier = COMBO_FLAME_TIERS.find(t => combo >= t.from) ?? null;
    const name = tier?.flame ?? '';
    if (name === this.auraName) return;
    for (const handle of [this.aura, this.lines, this.cone]) handle?.stop();
    this.aura = this.lines = this.cone = null;
    this.auraName = name;
    this.comboFlame = tier;
    if (!tier) return;
    const sprite = this.player.sprite;
    const at = (p: { x: number; y: number }) => [p.x * SPRITE_SCALE, p.y * SPRITE_SCALE] as const;
    // Behind the roach and its dash ghosts (depth - 0.1), the lines behind the trail
    this.aura = this.fx.play(tier.flame, ...at(FLAME_AT), { follow: sprite, depth: sprite.depth - 0.2 });
    if (tier.lines) this.lines = this.fx.play(tier.lines, ...at(LINES_AT), { follow: sprite, depth: sprite.depth - 0.25 });
    if (tier.cone) this.cone = this.fx.play('combo-cone', ...at(CONE_AT), { follow: sprite, depth: sprite.depth + 0.1 });
  }

  comboLostEffect(comboLost: number): void {
    if (!this.initialized || comboLost <= 0) return;

    const camera = this.scene.cameras.main;
    camera.shake(150, 0.008);
    // The count it was, on a red slab at the top of the screen
    popup(this.scene, camera.width / 2, 80, `${comboLost} kombo w dupę`, popupStyle({
      fontSize: '12px', color: '#ff6a5a', strokeThickness: 4,
    }), { plate: 'plate-red', scrollFactor: 0, hold: 1400 });
    // Over the slab, under the words, once the slab is up: the slab cracks and the pieces drop out
    this.fx.play('crack', camera.width / 2, 80, { scrollFactor: 0, depth: DEPTH.POPUP - 0.01, delay: 150 });
  }

  /** A new combo tier: the multiplier's chevrons rise off the roach. */
  comboTierUp(): void {
    if (!this.initialized || !this.player) return;
    const { x, y } = this.player;
    this.fx.play('multup', x + 8, y - 30, { depth: DEPTH.VFX_TEXT });
  }

  /**
   * The killing hit, as it lands: a white-hot spark between the roach and what hit it, and a ring on the ledge. `ui`
   * plays it on real time, over the frozen world of the solo hit-stop.
   */
  hitImpact(culprit: Phaser.GameObjects.Sprite, ui: boolean): void {
    if (!this.initialized || !this.player) return;
    const { x, y } = this.player;
    const at = culprit.getCenter();
    this.fx.play('spark-big', (x + at.x) / 2, (y + at.y) / 2, { depth: DEPTH.VFX_TEXT + 1, ui });
    this.fx.play('ring', at.x, y + ROACH_FEET_OFFSET, { depth: DEPTH.VFX_TEXT - 1, ui });
    this.hitShown = true;
  }

  deathEffect(): void {
    if (!this.initialized) return;

    // The roach's fall: the dust it raises, and the hit's spark and ring if nothing has shown them yet (a fall, a wall)
    if (this.player) {
      const { x, y } = this.player;
      const floorY = y + ROACH_FEET_OFFSET;
      this.fx.play('dust-land', x, floorY, { depth: DEPTH.VFX_TEXT - 1 });
      if (!this.hitShown) {
        this.fx.play('spark-big', x + 20, y - 6, { depth: DEPTH.VFX_TEXT + 1 });
        this.fx.play('ring', x, floorY, { depth: DEPTH.VFX_TEXT - 1 });
      }
    }
    this.setCombo(0);

    // A short red hit, then the world sinks while the roach stays lit above it
    this.flashOverlay.setBlendMode(Phaser.BlendModes.NORMAL).setFillStyle(0xff0000, 0.3);
    this.scene.tweens.add({
      targets: this.flashOverlay,
      fillAlpha: 0,
      duration: 40,
      onComplete: () => {
        this.flashOverlay.setFillStyle(0x000000, 0);
        this.scene.tweens.add({ targets: this.flashOverlay, fillAlpha: 0.6, duration: 120 });
      },
    });

    this.scene.time.timeScale = 0.3;
    this.deathSlowMoTimeout = setTimeout(() => {
      this.scene.time.timeScale = 1.0;
      this.deathSlowMoTimeout = null;
    }, 800);
  }

  destroy(): void {
    if (!this.initialized) return;
    if (this.deathSlowMoTimeout !== null) {
      clearTimeout(this.deathSlowMoTimeout);
      this.deathSlowMoTimeout = null;
    }
    for (const handle of [this.aura, this.lines, this.cone]) handle?.stop();
    this.aura = this.lines = this.cone = null;
    this.auraName = '';
    this.comboFlame = null;
    this.vignetteGraphics.destroy();
    this.flashOverlay.destroy();
    this.initialized = false;
  }
}
