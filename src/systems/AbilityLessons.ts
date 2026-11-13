/**
 * What the run teaches when a power is earned, so the first use is safe. The dash: right after the reward, a single wall
 * (both lanes shut, only the dash gets through) stands a few seconds ahead with apples past it, and a prompt over the
 * roach until it dashes through or has passed. A roach that reaches the wall without a dash on (none pressed, or one
 * spent too early) is dashed through it anyway at the last moment, cooldown or not, with the key flashed so it is plain
 * what happened, and the cooldown is waived after it: the lesson never kills, once per run. The gun (solo; a match keeps
 * it inside the fight): an onion stands in the roach's lane with apples behind it, the shot's keycap over the roach
 * until the onion is shot or passed; running into it only punts it.
 *
 * The moult, and the gun in a match, get a one-line hint that fades (no course changes). The opening lesson on lane hops is
 * `Tutorial`; both draw their prompts with the same keycap.
 */
import Phaser from 'phaser';
import { addArrowKeycap, addKeycap, keycapBob, type ArrowKeycap } from '../ui/Keycap';
import { Player } from '../objects/Player';
import { popup } from '../effects/Popup';
import { popupStyle } from '../utils/TextStyles';
import { SpawnManager } from './SpawnManager';
import type { AbilityId } from './abilities';

/** The prompt shows once the wall is this close ahead of the roach, and goes this far past it. */
const SHOW_WITHIN_PX = 560;
const GONE_PAST_PX = 60;
const PROMPT_ABOVE_PX = 96;
/** A one-line hint stands this far from the top, for this long, then fades. */
const HINT_Y = 150;
const HINT_MS = 4500;
const HINT_FADE_MS = 500;
/** The rescue dash goes this long before the roach would touch the wall (a couple of frames), or this near, at the least. */
const RESCUE_LEAD_S = 0.05;
const RESCUE_MIN_PX = 8;
/** The flashed key stays this long after a rescue. */
const RESCUE_FLASH_MS = 700;

export class AbilityLessons {
  private scene: Phaser.Scene;
  private player: Player;
  private spawnManager: SpawnManager;
  private touch: boolean;
  private wallX = 0;
  /** What the lesson waits for: the dash's wall, or the gun's onion (gone once it is shot). */
  private lesson: 'dash' | 'gun' = 'dash';
  private target: Phaser.Physics.Arcade.Sprite | null = null;
  /** The dash lesson's wall, while it stands. */
  private wall: Phaser.Physics.Arcade.Sprite | null = null;
  /** The rescue dash was done (once per run), and when its flash ends. */
  private rescued = false;
  private flashUntil = 0;
  private prompt: Phaser.GameObjects.Text | ArrowKeycap | null = null;
  private hint: Phaser.GameObjects.Text | null = null;

  constructor(scene: Phaser.Scene, player: Player, spawnManager: SpawnManager) {
    this.scene = scene;
    this.player = player;
    this.spawnManager = spawnManager;
    this.touch = !scene.sys.game.device.os.desktop;
    scene.events.once('shutdown', () => this.dismiss());
  }

  /** A power was earned and the run is about to go on. `inRun`: the gun shoots between the fights too (solo). */
  teach(ability: AbilityId, inRun = true): void {
    if (ability === 'dash') this.teachDash();
    else if (ability === 'gun' && inRun) this.teachGun();
    // In a match the gun's button only shows inside a fight
    else if (ability === 'gun') this.showHint(this.touch ? 'Strzał: prawy dolny róg (w walkach z bossami)' : 'SPACJA — strzał (w walkach z bossami)');
    else if (ability === 'moult') this.showHint('Wylinka: jedno trafienie ci nie zaszkodzi');
  }

  private showHint(text: string): void {
    this.hint?.destroy();
    const { width } = this.scene.cameras.main;
    const hint = addKeycap(this.scene, text, '16px').setScrollFactor(0).setPosition(Math.round(width / 2), HINT_Y);
    this.hint = hint;
    this.scene.tweens.add({
      targets: hint, alpha: 0, delay: HINT_MS, duration: HINT_FADE_MS,
      onComplete: () => { hint.destroy(); if (this.hint === hint) this.hint = null; },
    });
  }

  private teachGun(): void {
    this.dismiss();
    const { x, target } = this.spawnManager.layGunLesson(this.player.x, this.player.currentFloor);
    this.lesson = 'gun';
    this.wallX = x;
    this.target = target;
    this.prompt = addKeycap(this.scene, this.touch ? 'STRZAŁ' : 'SPACJA').setVisible(false);
  }

  private teachDash(): void {
    this.dismiss();
    this.lesson = 'dash';
    this.wallX = this.spawnManager.layDashLesson(this.player.x);
    this.wall = (this.scene.data.get('obstacles') as Phaser.Physics.Arcade.Group).getChildren()
      .find(o => (o as Phaser.Physics.Arcade.Sprite).getData('type') === 'wall'
        && Math.abs((o as Phaser.Physics.Arcade.Sprite).x - this.wallX) < 1) as Phaser.Physics.Arcade.Sprite | undefined ?? null;
    // A keycap, like the info page's: the key itself on a keyboard, the button's name on a phone
    this.prompt = (this.touch ? addKeycap(this.scene, 'DASH') : addArrowKeycap(this.scene, 'right')).setVisible(false);
  }

  /** The gun lesson's onion does no harm: running into it only punts it. */
  spares(obstacle: Phaser.Physics.Arcade.Sprite | undefined): boolean {
    return !!obstacle && this.lesson === 'gun' && obstacle === this.target;
  }

  /** Every frame of the run. */
  update(): void {
    const { prompt, player } = this;
    if (!prompt) return;
    const now = this.scene.time.now;
    const flashing = now < this.flashUntil;
    const done = this.lesson === 'dash'
      ? !this.wall?.active || !this.wall.body?.enable
      : !this.target?.active || !this.target.body?.enable;
    if (!flashing && (done || player.x > this.wallX + GONE_PAST_PX)) {
      this.dismiss();
      return;
    }
    if (this.lesson === 'dash' && !done) this.rescueAtWall();
    // While a dash is on the prompt has been answered; after a rescue the key flashes
    const near = this.wallX - player.x < SHOW_WITHIN_PX && (flashing || !player.isDashing);
    prompt.setVisible(near && (!flashing || Math.floor(now / 90) % 2 === 0));
    if (near) prompt.setPosition(Math.round(player.x + keycapBob(now)), Math.round(player.y - PROMPT_ABOVE_PX));
  }

  /** At the last safe moment before the wall with no dash on: the dash is done for the player, cooldown or not. */
  private rescueAtWall(): void {
    const { player, wall } = this;
    if (this.rescued || !wall || player.isDashing) return;
    const roach = player.sprite.body as Phaser.Physics.Arcade.Body;
    const body = wall.body as Phaser.Physics.Arcade.Body;
    const gap = body.x - (roach.x + roach.width);
    if (gap > Math.max(RESCUE_MIN_PX, roach.velocity.x * RESCUE_LEAD_S)) return;
    this.rescued = true;
    player.forceDash();
    this.flashUntil = this.scene.time.now + RESCUE_FLASH_MS;
    popup(this.scene, player.x + 30, player.y - 60, 'DASH!', popupStyle({ fontSize: '18px', color: '#8ff0e0', strokeThickness: 5 }), { hold: 300 });
  }

  dismiss(): void {
    this.prompt?.destroy();
    this.prompt = null;
    this.target = null;
    this.wall = null;
    this.flashUntil = 0;
    if (this.hint) this.scene.tweens.killTweensOf(this.hint);
    this.hint?.destroy();
    this.hint = null;
  }
}
