/**
 * The small strip in the top-left corner that says which powers the run owns: one chip each, drawn on the pixel
 * grid. The dash chip charges back up after a dash (a phone has the button's own sweep, so it hides the chip), the
 * wylinka shows a whole shell until it is spent and an empty outline after, and a chip earned mid-run pops in.
 */
import Phaser from 'phaser';
import { DEPTH } from '../config/constants';
import { ATLAS, SPRITE_SCALE, frameOf } from '../config/sprites';
import { ABILITIES, type AbilityId } from '../systems/abilities';

export interface AbilityView {
  dash: boolean;
  /** 0 just after a dash, 1 when the next is ready. */
  dashCharge: number;
  gun: boolean;
  /** The run's pistol's magazine (solo, between the fights): its pips under the gun; `dry` flashes them. */
  ammo?: { count: number; max: number; dry: boolean };
  moult: boolean;
  /** The shell is still on. */
  moultReady: boolean;
}

/** '#' is the outline, 'o' what it is filled with, '+' a seam. One char is one PIXEL_BLOCK. */
export const ICON_BITMAPS: Record<'dash' | 'moult', string[]> = {
  dash: [
    '............',
    '##..##......',
    '.##..##.....',
    '..##..##....',
    '...##..##...',
    '..##..##....',
    '.##..##.....',
    '##..##......',
    '............',
  ],
  moult: [
    '...####...',
    '..#oooo#..',
    '.#oo++oo#.',
    '.#oo++oo#.',
    '.#oo++oo#.',
    '.#oo++oo#.',
    '..#o++o#..',
    '...####...',
  ],
};

/** One bitmap character, in logical px: a little finer than the world's grid, as the rest of the HUD is. */
const BLOCK = 3;
const CHIP_W = 44;
const CHIP_H = 34;
const CHIP_GAP = 6;
const MARGIN = 12;
const ICON_TOP = 3;
const BAR_H = 3;

const PALETTE = {
  chip: 0x1a1219,
  edge: 0x4b4352,
  dash: 0x6fd6c8,
  dashCooling: 0x54706c,
  shell: 0xf1e3c6,
  shellSeam: 0xb8a888,
  spent: 0x6b6258,
  round: 0xe8b04a,
  roundEmpty: 0x3a3340,
  dry: 0xff4a3a,
};

/** The magazine's pips under the pistol: each this big, this far apart, logical px. */
const PIP = 4;
const PIP_GAP = 2;

type Chip = {
  id: AbilityId;
  box: Phaser.GameObjects.Container;
  icon: Phaser.GameObjects.Graphics;
  /** The gun's own art, from the atlas. */
  pistol: Phaser.GameObjects.Image | null;
  bar: Phaser.GameObjects.Graphics;
  /** What was drawn last, so a chip is only redrawn when it changes. */
  key: string;
};

export class AbilityStrip {
  private scene: Phaser.Scene;
  private mobile: boolean;
  private chips = new Map<AbilityId, Chip>();
  private synced = false;

  constructor(scene: Phaser.Scene, mobile: boolean) {
    this.scene = scene;
    this.mobile = mobile;
  }

  /** Follows the run. The first call only sets the chips; one that appears after it pops in. */
  sync(view: AbilityView | undefined): void {
    const shown: Record<AbilityId, boolean> = {
      dash: !!view?.dash && !this.mobile,
      gun: !!view?.gun,
      moult: !!view?.moult,
    };
    let slot = 0;
    for (const id of ABILITIES) {
      const chip = this.chips.get(id);
      if (!shown[id]) {
        chip?.box.setVisible(false);
        continue;
      }
      const made = chip ?? this.make(id);
      made.box.setPosition(MARGIN + CHIP_W / 2 + slot * (CHIP_W + CHIP_GAP), MARGIN + CHIP_H / 2);
      slot++;
      if (!made.box.visible) {
        made.box.setVisible(true);
        if (this.synced) this.pop(made);
      }
      this.draw(made, view!);
    }
    this.synced = true;
  }

  private make(id: AbilityId): Chip {
    const box = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(DEPTH.HUD).setVisible(false);
    const back = this.scene.add.graphics().setScrollFactor(0);
    back.fillStyle(PALETTE.chip, 0.78).fillRoundedRect(-CHIP_W / 2, -CHIP_H / 2, CHIP_W, CHIP_H, 5);
    back.lineStyle(1, PALETTE.edge, 0.9).strokeRoundedRect(-CHIP_W / 2, -CHIP_H / 2, CHIP_W, CHIP_H, 5);
    const icon = this.scene.add.graphics().setScrollFactor(0);
    const bar = this.scene.add.graphics().setScrollFactor(0);
    box.add([back, icon, bar]);
    // The gun is the atlas's pistol: dim while it is only for the fights (a match), lit once it shoots in the run too
    const pistol = id === 'gun' ? this.scene.add.image(0, 0, ATLAS, frameOf('pistol')).setScale(SPRITE_SCALE).setAlpha(0.6).setScrollFactor(0) : null;
    if (pistol) box.add(pistol);
    const chip: Chip = { id, box, icon, pistol, bar, key: '' };
    this.chips.set(id, chip);
    return chip;
  }

  private pop(chip: Chip): void {
    this.scene.tweens.killTweensOf(chip.box);
    chip.box.setScale(0);
    this.scene.tweens.add({ targets: chip.box, scale: 1, duration: 360, ease: 'Back.easeOut' });
  }

  private draw(chip: Chip, view: AbilityView): void {
    const ready = view.dashCharge >= 1;
    const ammo = view.ammo;
    const dryBlink = ammo?.dry && Math.floor(this.scene.time.now / 90) % 2 === 0;
    const key = chip.id === 'dash'
      ? `${ready ? 1 : 0}:${Math.round(view.dashCharge * 12)}`
      : chip.id === 'moult' ? String(view.moultReady)
        : ammo ? `${ammo.count}/${ammo.max}:${dryBlink ? 1 : 0}` : 'on';
    if (key === chip.key) return;
    chip.key = key;

    const { icon, bar } = chip;
    icon.clear();
    bar.clear();
    switch (chip.id) {
      case 'dash':
        drawBitmap(icon, ICON_BITMAPS.dash, BLOCK, { '#': ready ? PALETTE.dash : PALETTE.dashCooling }, -CHIP_W / 2, ICON_TOP - CHIP_H / 2, CHIP_W);
        if (!ready) {
          const w = CHIP_W - 8;
          bar.fillStyle(PALETTE.dashCooling, 1).fillRect(-w / 2, CHIP_H / 2 - 5, w, BAR_H);
          bar.fillStyle(PALETTE.dash, 1).fillRect(-w / 2, CHIP_H / 2 - 5, Math.round(w * view.dashCharge), BAR_H);
        }
        break;
      case 'gun': {
        // With a magazine the pistol moves up over its pips, lit
        chip.pistol?.setPosition(0, ammo ? -5 : 0).setAlpha(ammo ? 1 : 0.6);
        if (!ammo) break;
        const total = ammo.max * PIP + (ammo.max - 1) * PIP_GAP;
        for (let i = 0; i < ammo.max; i++) {
          const colour = dryBlink ? PALETTE.dry : i < ammo.count ? PALETTE.round : PALETTE.roundEmpty;
          icon.fillStyle(colour, 1).fillRect(-total / 2 + i * (PIP + PIP_GAP), CHIP_H / 2 - 9, PIP, PIP);
        }
        break;
      }
      case 'moult':
        drawBitmap(
          icon, ICON_BITMAPS.moult, BLOCK,
          view.moultReady
            ? { '#': PALETTE.shell, o: PALETTE.shell, '+': PALETTE.shellSeam }
            : { '#': PALETTE.spent },
          -CHIP_W / 2, ICON_TOP - CHIP_H / 2, CHIP_W,
        );
        break;
    }
  }

  destroy(): void {
    for (const chip of this.chips.values()) chip.box.destroy();
    this.chips.clear();
  }
}

/** Draws a bitmap centred in a box `width` wide whose left edge is at x, one `block` per character. */
export function drawBitmap(
  g: Phaser.GameObjects.Graphics,
  rows: string[],
  block: number,
  colors: Record<string, number>,
  x: number,
  y: number,
  width: number,
  alpha = 1,
): void {
  const cols = Math.max(...rows.map(r => r.length));
  const left = x + Math.round((width - cols * block) / 2 / block) * block;
  rows.forEach((row, ry) => {
    for (let cx = 0; cx < row.length; cx++) {
      const color = colors[row[cx]];
      if (color === undefined) continue;
      g.fillStyle(color, alpha).fillRect(left + cx * block, y + ry * block, block, block);
    }
  });
}
